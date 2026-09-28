// related files:
// - bg/pc1/rhino-server/compute/scripts/fill_screwholes.py (원본, 동작 SSOT)
// - web/backend/utils/screwHoleFill.js (HF: 채널 벽 림 기반, 수동 버튼)
//
// fill_screwholes.py(auto 모드) 이식. 탐사 원을 -Z로 투사한 루프에 원판 패치를 덧붙인다(용접 없음).
// Curve.ProjectToMesh는 원 위 표본점의 수직 광선 첫 교점으로 대신한다.

/** 현재 fill_screwholes.py 값. */
export const SCREWHOLE_PARAMS = { probeDiameter: 2.9, maxDiameter: 3.2 };
/** 2026-09-28 커밋(8a90d1593) 이전 Rhino 값. 그 전 골든 비교용. */
export const SCREWHOLE_PARAMS_LEGACY = { probeDiameter: 2.5, maxDiameter: 2.75 };

const MIN_DIAMETER = 1.0;
const MAX_RADIAL_STD = 0.2;
const PROBE_SAMPLES = 180;

/** 수직 광선용 XY 격자. */
function buildXYGrid(mesh, cell = 0.25) {
  const map = new Map();
  const v = mesh.verts;
  const f = mesh.faces;
  for (let i = 0; i < mesh.faceCount; i += 1) {
    const a = f[i * 3] * 3;
    const b = f[i * 3 + 1] * 3;
    const c = f[i * 3 + 2] * 3;
    const x0 = Math.floor(Math.min(v[a], v[b], v[c]) / cell);
    const x1 = Math.floor(Math.max(v[a], v[b], v[c]) / cell);
    const y0 = Math.floor(Math.min(v[a + 1], v[b + 1], v[c + 1]) / cell);
    const y1 = Math.floor(Math.max(v[a + 1], v[b + 1], v[c + 1]) / cell);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const key = `${x},${y}`;
        const list = map.get(key);
        if (list) list.push(i);
        else map.set(key, [i]);
      }
    }
  }
  return { map, cell };
}

/** (x,y)에서 아래로 쏜 광선이 맞는 가장 높은 z. 없으면 null. */
function highestHitZ(mesh, grid, x, y) {
  const list = grid.map.get(`${Math.floor(x / grid.cell)},${Math.floor(y / grid.cell)}`);
  if (!list) return null;
  const v = mesh.verts;
  const f = mesh.faces;
  let best = null;
  for (const i of list) {
    const a = f[i * 3] * 3;
    const b = f[i * 3 + 1] * 3;
    const c = f[i * 3 + 2] * 3;
    const d = (v[b + 1] - v[c + 1]) * (v[a] - v[c]) + (v[c] - v[b]) * (v[a + 1] - v[c + 1]);
    if (Math.abs(d) < 1e-18) continue;
    const l1 = ((v[b + 1] - v[c + 1]) * (x - v[c]) + (v[c] - v[b]) * (y - v[c + 1])) / d;
    const l2 = ((v[c + 1] - v[a + 1]) * (x - v[c]) + (v[a] - v[c]) * (y - v[c + 1])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-12 || l2 < -1e-12 || l3 < -1e-12) continue;
    const z = l1 * v[a + 2] + l2 * v[b + 2] + l3 * v[c + 2];
    if (best === null || z > best) best = z;
  }
  return best;
}

function loopMetrics(points) {
  const n = points.length;
  let length = 0;
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % n];
    length += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  }
  const rs = points.map((p) => Math.hypot(p[0], p[1]));
  const rMean = rs.reduce((s, r) => s + r, 0) / n;
  const rStd = Math.sqrt(rs.reduce((s, r) => s + (r - rMean) ** 2, 0) / n);
  const zs = points.map((p) => p[2]);
  return {
    length,
    z_centroid: zs.reduce((s, z) => s + z, 0) / n,
    r_mean: rMean,
    r_std: rStd,
    diameter_est: 2 * rMean,
  };
}

function isCandidate(m, minLoopLength, maxDiameter) {
  if (m.length < minLoopLength) return [false, "short"];
  if (m.diameter_est < MIN_DIAMETER) return [false, "too-small-dia"];
  if (m.diameter_est > maxDiameter) return [false, "too-large-dia"];
  if (m.r_std > MAX_RADIAL_STD) return [false, "off-axis"];
  return [true, "ok"];
}

/**
 * fill_mesh_object(mode="auto") 이식.
 * @returns {{ patch: number[][][]|null, result: object }} patch는 삼각형 [a,b,c] 목록
 */
export function buildScrewholePatch(mesh, { params = SCREWHOLE_PARAMS, minLoopLength = 3.0, log = () => {} } = {}) {
  const result = { filled_count: 0, selected_loop_index: null, candidate_count: 0, loop_count: 0, ok: false, reason: "" };
  const radius = params.probeDiameter / 2;
  const grid = buildXYGrid(mesh);
  const loop = [];
  for (let i = 0; i < PROBE_SAMPLES; i += 1) {
    const ang = (2 * Math.PI * i) / PROBE_SAMPLES;
    const x = radius * Math.cos(ang);
    const y = radius * Math.sin(ang);
    const z = highestHitZ(mesh, grid, x, y);
    if (z === null) continue;
    loop.push([x, y, z]);
  }
  if (loop.length < PROBE_SAMPLES * 0.5) {
    result.ok = true;
    result.reason = "no loops (project)";
    log("[screwhole-fill] project-loop 실패");
    return { patch: null, result };
  }
  result.loop_count = 1;
  const metrics = loopMetrics(loop);
  const [ok, why] = isCandidate(metrics, minLoopLength, params.maxDiameter);
  result.candidate_count = 1;
  if (!ok) log(`[screwhole-fill] project-loop 1개를 상부 홀로 강제 채택 (${why})`);
  result.selected_loop_index = 0;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of loop) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  cx /= loop.length;
  cy /= loop.length;
  cz /= loop.length;
  const center = [cx, cy, cz];
  const tris = [];
  for (let i = 0; i < loop.length; i += 1) tris.push([center, loop[i], loop[(i + 1) % loop.length]]);

  // _orient_patch_normals: 평균 법선이 (패치 중심 - 본체 중심)과 반대면 뒤집는다.
  let hx = 0;
  let hy = 0;
  let hz = 0;
  const v = mesh.verts;
  for (let i = 0; i < v.length; i += 3) {
    hx += v[i];
    hy += v[i + 1];
    hz += v[i + 2];
  }
  const nv = mesh.vertexCount;
  const ref = [cx - hx / nv, cy - hy / nv, cz - hz / nv];
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const tx = uy * wz - uz * wy;
    const ty = uz * wx - ux * wz;
    const tz = ux * wy - uy * wx;
    const len = Math.hypot(tx, ty, tz) || 1;
    nx += tx / len;
    ny += ty / len;
    nz += tz / len;
  }
  if (nx * ref[0] + ny * ref[1] + nz * ref[2] < 0) {
    for (const t of tris) [t[1], t[2]] = [t[2], t[1]];
  }
  result.filled_count = 1;
  result.ok = true;
  result.reason = "filled";
  result.loop = { ...metrics, candidate: ok, why };
  log(
    `[screwhole-fill] auto-fill dia=${metrics.diameter_est.toFixed(3)} rStd=${metrics.r_std.toFixed(3)} zC=${metrics.z_centroid.toFixed(3)} probe=${params.probeDiameter}`,
  );
  return { patch: tris, result };
}
