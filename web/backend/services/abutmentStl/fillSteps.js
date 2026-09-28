// related files:
// - bg/pc1/rhino-server/compute/scripts/fill_steps.py (원본, 동작 SSOT)
// - web/backend/services/abutmentStl/pipeline.js
//
// fill_steps.py 이식. Z=0 부근이 수직 구간이면 경계 4개 z의 외곽 단면으로 솔리드를 만들어 덧붙인다.
// Rhino NURBS loft(Tight, rebuild 100)는 메시 로프트로 대신한다:
//   단면 → 호길이 96점 → 주기 Catmull-Rom 평활 → seam/방향 정렬 → z 방향 자연 3차 보간 → 끝단 캡.
import { meshZSection } from "./meshCore.js";

const TAPER_11_K = Math.tan((11 * Math.PI) / 180);
const NON_VERTICAL_K_THRESHOLD = 0.12;
const VERTICAL_K_THRESHOLD = 0.07;
const OUTER_RADIUS_PERCENTILE = 0.75;
const MIN_FACE_SAMPLES = 10;
const Z_STEP_MM = 0.05;
const ALLOWED_GAP_STEPS = 1;
const MIN_VERTICAL_SPAN_MM = 0.25;
const BOUNDARY_OFFSET_MM = 0.05;
const EXTRA_OUTWARD_OFFSET_MM = 0.1;
const LOFT_SAMPLE_COUNT = 96;
const RING_POINTS = 128;
const ROW_STEP_MM = 0.1;

function percentileRound(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(s.length - 1, Math.round((s.length - 1) * q)));
  return s[idx];
}

function medianOf(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

function buildFaceCache(mesh) {
  const { normals } = mesh.faceNormals();
  const v = mesh.verts;
  const f = mesh.faces;
  const rows = [];
  for (let i = 0; i < mesh.faceCount; i += 1) {
    const a = f[i * 3] * 3;
    const b = f[i * 3 + 1] * 3;
    const c = f[i * 3 + 2] * 3;
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const h = Math.hypot(nx, ny);
    if (h < 1e-12) continue;
    rows.push([
      Math.min(v[a + 2], v[b + 2], v[c + 2]),
      Math.max(v[a + 2], v[b + 2], v[c + 2]),
      Math.hypot((v[a] + v[b] + v[c]) / 3, (v[a + 1] + v[b + 1] + v[c + 1]) / 3),
      Math.abs(normals[i * 3 + 2]) / h,
    ]);
  }
  return rows;
}

function localKAtZ(cache, z) {
  const cands = [];
  for (const [zMin, zMax, r, k] of cache) if (zMin <= z && z <= zMax) cands.push([r, k]);
  if (cands.length < MIN_FACE_SAMPLES) return null;
  const cut = percentileRound(cands.map((c) => c[0]), OUTER_RADIUS_PERCENTILE);
  const ks = cands.filter((c) => c[0] >= cut).map((c) => c[1]);
  if (ks.length < MIN_FACE_SAMPLES) return null;
  return [medianOf(ks), ks.length];
}

function classifyAtZero(cache, zMin, zMax) {
  const ks = [];
  for (const z of [0, -0.05, 0.05, -0.1, 0.1]) {
    if (z < zMin || z > zMax) continue;
    const res = localKAtZ(cache, z);
    if (res) ks.push(res[0]);
  }
  if (!ks.length) throw new Error("Z=0 부근에서 유효한 샘플을 확보하지 못했습니다.");
  const k0 = medianOf(ks);
  return [k0 >= NON_VERTICAL_K_THRESHOLD ? "taper_or_non_vertical" : "vertical", k0];
}

function marchBound(cache, zStart, zLimit, dir) {
  const step = dir < 0 ? -Z_STEP_MM : Z_STEP_MM;
  let z = zStart;
  let last = zStart;
  let gap = 0;
  const maxIter = Math.floor(Math.abs((zLimit - zStart) / Z_STEP_MM)) + 4;
  for (let i = 0; i < maxIter; i += 1) {
    const zn = z + step;
    if (dir > 0 && zn > zLimit) break;
    if (dir < 0 && zn < zLimit) break;
    const res = localKAtZ(cache, zn);
    if (res && res[0] <= VERTICAL_K_THRESHOLD) {
      last = zn;
      gap = 0;
    } else {
      gap += 1;
      if (gap > ALLOWED_GAP_STEPS) break;
    }
    z = zn;
  }
  return last;
}

function findVerticalBounds(cache, zMin, zMax) {
  const z0 = Math.min(Math.max(0, zMin), zMax);
  const at0 = localKAtZ(cache, z0);
  if (!at0 || at0[0] > VERTICAL_K_THRESHOLD) return null;
  const lo = marchBound(cache, z0, zMin, -1);
  const hi = marchBound(cache, z0, zMax, 1);
  return hi - lo < MIN_VERTICAL_SPAN_MM ? null : [lo, hi];
}

function outerLoopAtZ(mesh, z) {
  let best = null;
  let bestR = -1;
  for (const pl of meshZSection(mesh, z)) {
    if (pl.length < 3) continue;
    const r = Math.max(...pl.map((p) => Math.hypot(p[0], p[1])));
    if (r > bestR) {
      bestR = r;
      best = pl;
    }
  }
  if (!best) return null;
  const a = best[0];
  const b = best[best.length - 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 5e-3) return null;
  return best.slice(0, -1);
}

function resampleByArcLength(pts, count, closed = true) {
  const ring = closed ? pts.concat([pts[0]]) : pts;
  const lens = [0];
  for (let i = 1; i < ring.length; i += 1) {
    lens.push(lens[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1], ring[i][2] - ring[i - 1][2]));
  }
  const total = lens[lens.length - 1];
  const out = [];
  let j = 1;
  for (let k = 0; k < count; k += 1) {
    const s = (total * k) / count;
    while (j < lens.length - 1 && lens[j] < s) j += 1;
    const t = (s - lens[j - 1]) / Math.max(1e-12, lens[j] - lens[j - 1]);
    const p = ring[j - 1];
    const q = ring[j];
    out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])]);
  }
  return out;
}

/** 주기 Catmull-Rom으로 점마다 subdiv개씩 평활 곡선을 만든다. */
function smoothClosed(pts, subdiv = 4) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < subdiv; s += 1) {
      const t = s / subdiv;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1, 2].map((k) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
      ));
    }
  }
  return out;
}

function signedAreaXY(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function rotateToAnchor(pts, anchor) {
  let best = 0;
  let bestD = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - anchor[0], p[1] - anchor[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return pts.slice(best).concat(pts.slice(0, best));
}

/** 자연 3차 스플라인 (x 오름차순) → f(xq). */
function naturalCubic(xs, ys) {
  const n = xs.length;
  if (n < 3) {
    return (x) => {
      const t = (x - xs[0]) / (xs[n - 1] - xs[0]);
      return ys[0] + t * (ys[n - 1] - ys[0]);
    };
  }
  const h = [];
  for (let i = 0; i < n - 1; i += 1) h.push(xs[i + 1] - xs[i]);
  const alpha = [0];
  for (let i = 1; i < n - 1; i += 1) {
    alpha.push((3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]));
  }
  const l = [1];
  const mu = [0];
  const zz = [0];
  for (let i = 1; i < n - 1; i += 1) {
    l.push(2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1]);
    mu.push(h[i] / l[i]);
    zz.push((alpha[i] - h[i - 1] * zz[i - 1]) / l[i]);
  }
  const c = new Array(n).fill(0);
  const b = new Array(n - 1).fill(0);
  const d = new Array(n - 1).fill(0);
  for (let j = n - 2; j >= 0; j -= 1) {
    c[j] = zz[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  return (x) => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i += 1;
    const dx = x - xs[i];
    return ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
  };
}

function loftSolid(rings) {
  const zs = rings.map((r) => r.z);
  const m = RING_POINTS;
  const rowZs = [];
  for (let i = 0; i < zs.length - 1; i += 1) {
    const steps = Math.max(1, Math.ceil((zs[i + 1] - zs[i]) / ROW_STEP_MM));
    for (let s = 0; s < steps; s += 1) rowZs.push(zs[i] + ((zs[i + 1] - zs[i]) * s) / steps);
  }
  rowZs.push(zs[zs.length - 1]);
  const colFns = [];
  for (let j = 0; j < m; j += 1) {
    colFns.push([0, 1].map((k) => naturalCubic(zs, rings.map((r) => r.pts[j][k]))));
  }
  const grid = rowZs.map((z) => colFns.map(([fx, fy]) => [fx(z), fy(z), z]));
  const tris = [];
  // 링은 반시계(+Z에서 볼 때) → 옆면 법선이 바깥을 향하도록 (a, b', b) 순서
  for (let r = 0; r < grid.length - 1; r += 1) {
    for (let j = 0; j < m; j += 1) {
      const a = grid[r][j];
      const b = grid[r][(j + 1) % m];
      const c = grid[r + 1][(j + 1) % m];
      const d = grid[r + 1][j];
      tris.push([a, b, c], [a, c, d]);
    }
  }
  const cap = (ring, up) => {
    let cx = 0;
    let cy = 0;
    for (const p of ring) {
      cx += p[0];
      cy += p[1];
    }
    const center = [cx / ring.length, cy / ring.length, ring[0][2]];
    for (let j = 0; j < m; j += 1) {
      const a = ring[j];
      const b = ring[(j + 1) % m];
      tris.push(up ? [center, a, b] : [center, b, a]);
    }
  };
  cap(grid[0], false);
  cap(grid[grid.length - 1], true);
  return tris;
}

/**
 * detect_and_draw_vertical_band_planes 이식.
 * @returns {{ result: object, solid: number[][][]|null }}
 */
export function buildVerticalBandSolid(mesh, { log = () => {} } = {}) {
  const { min, max } = mesh.bbox();
  const cache = buildFaceCache(mesh);
  if (cache.length < MIN_FACE_SAMPLES) throw new Error("face 캐시 샘플이 부족합니다.");
  const [cls, k0] = classifyAtZero(cache, min[2], max[2]);
  if (cls !== "vertical") {
    log(`[fill-steps] 비수직(테이퍼)로 판단: k=${k0.toFixed(4)}, 11도기준=${TAPER_11_K.toFixed(4)}`);
    return { result: { type: "taper_or_non_vertical", action: "none", k: k0, z_bounds: null }, solid: null };
  }
  const bounds = findVerticalBounds(cache, min[2], max[2]);
  if (!bounds) {
    return { result: { type: "vertical", action: "none", k: k0, z_bounds: null }, solid: null };
  }
  const [loRaw, hiRaw] = bounds;
  const lo = loRaw - BOUNDARY_OFFSET_MM;
  const hi = hiRaw + BOUNDARY_OFFSET_MM;
  const planeZs = [lo - EXTRA_OUTWARD_OFFSET_MM, lo, hi, hi + EXTRA_OUTWARD_OFFSET_MM];

  let anchor = null;
  const rings = [];
  for (const z of planeZs) {
    const loop = outerLoopAtZ(mesh, z);
    if (!loop) continue;
    let pts = smoothClosed(resampleByArcLength(loop, LOFT_SAMPLE_COUNT));
    if (signedAreaXY(pts) < 0) pts.reverse();
    if (!anchor) {
      anchor = pts.reduce((best, p) => (p[0] - 0.05 * Math.abs(p[1]) > best[0] - 0.05 * Math.abs(best[1]) ? p : best), pts[0]);
    }
    pts = resampleByArcLength(rotateToAnchor(pts, anchor), RING_POINTS);
    rings.push({ z, pts: pts.map((p) => [p[0], p[1], z]) });
  }
  if (rings.length !== 4) log(`[fill-steps] 경고: 외곽 루프가 4개가 아니라 ${rings.length}개입니다.`);
  const solid = rings.length >= 2 ? loftSolid(rings) : null;
  log(
    `[fill-steps] 수직 구간 raw=(${loRaw.toFixed(4)}, ${hiRaw.toFixed(4)}) loops=${rings.length} mesh_created=${Boolean(solid)}`,
  );
  return {
    result: {
      type: "vertical",
      action: "draw_planes_loops_and_solid_mesh",
      k: k0,
      z_bounds: [lo, hi],
      z_bounds_raw: [loRaw, hiRaw],
      plane_zs: planeZs,
      outer_loop_count: rings.length,
      solid_mesh_created: Boolean(solid),
    },
    solid,
  };
}
