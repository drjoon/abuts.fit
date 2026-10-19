// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (피니시라인 아래 커프를 촘촘한 곡면으로 바꿈)
// - web/backend/utils/screwHoleFill.js (parseStl / writeBinaryStl, HF 패치 attribute)
// - web/backend/scripts/abutment-stl-js/fair-post.js
// - web/backend/tests/unit/postFair.test.js
//
// 피니시라인 위 포스트 축면을 커프와 같은 밀도로 다시 만든다.
// 줄무늬는 성긴 삼각형 자체다. 평활한 반경을 원본 반경 구간 안으로만 눌러 끼우면
// 꼭짓점이 원래 면 위에 남아 큰 삼각형의 평면이 그대로 보인다.
// 그래서 아래·위 경계 사이 높이를 0~1로 나눈 좌표에서 반경을 강하게 평활하고,
// 평활 곡면이 원본보다 밖으로 나간 양의 매끈한 상한만큼 전체를 안쪽으로 내린다(내접).
// 봉우리는 깎이고 골은 원본보다 커지지 않으며, 홈·턱 같은 큰 형상은 원본을 지킨다.
// 스크류홀·교합면·커프는 그대로 두고, 그 사이 바깥 축면만 바꾼다.
import { parseStl, writeBinaryStl, HOLE_FILL_PATCH_ATTRIBUTE } from "../../utils/screwHoleFill.js";
import { CUFF_BLEND_PATCH_ATTRIBUTE } from "./cuffBlend.js";

export const POST_FAIR_VERSION = "post-fair-3";
/** 크라운 쪽. 반경이 이보다 커지면 조기 접촉한다. */
export const POST_FAIR_MAX_OUT_MM = 0.002;
/** 안쪽 안전 상한. 내접량이 이보다 크면 그 자리만 원본을 따라 매끈함이 남지 않는다. */
export const POST_FAIR_MAX_IN_MM = 0.2;
/** 다시 깐 축면 삼각형. */
export const POST_FAIR_PATCH_ATTRIBUTE = 0x5053;

const TWO_PI = Math.PI * 2;
const WELD_EPS = 1e-5;
/** 커프와 같은 둘레 칸 수. 더 잘게 나누면 float32 좌표 오차가 법선을 거칠게 한다. */
const COLUMNS = 720;
const ROW_PITCH_MM = 0.025;
const MAX_ROWS = 240;
const SCREW_R_MM = 1.7;
const FIELD_BINS = 720;
/** 경계 사이 높이를 나눈 칸 수. z가 아니라 비율이라 경계가 기울어도 섞이지 않는다. */
const FIELD_T_ROWS = 240;
/** 둘레 12°. 성긴 면과 단면의 잔물결을 지우고, 타원 같은 큰 형상은 남긴다. */
const SMOOTH_SIGMA_COL_DEG = 12;
/** 0.5mm. 높게 긴 삼각형의 가로 접힘을 지우고, 곧은 테이퍼는 그대로다. */
const SMOOTH_SIGMA_ROW_MM = 0.5;
/** 평활 곡면이 원본보다 밖으로 나간 양을 재는 창. 성긴 면 한 장을 덮는 크기다. */
const ENVELOPE_HALF_COL_DEG = 10;
const ENVELOPE_HALF_ROW_MM = 0.3;
/** 밖으로 나간 양의 상한을 매끈하게 펴는 정도. 면 접힘보다 넓어 내린 곡면이 다시 접히지 않는다. */
const ENVELOPE_SIGMA_COL_DEG = 4;
const ENVELOPE_SIGMA_ROW_MM = 0.22;
/** 강평활이 이만큼 어긋나는 자리는 홈·턱 같은 진짜 형상으로 보고 원본을 지킨다. */
const FEATURE_MM = 0.08;
const FEATURE_FEATHER_COL_DEG = 5;
const FEATURE_FEATHER_ROW_MM = 0.25;
const RIM_BLEND_MM = 0.25;

const wrap = (a) => {
  let t = a % TWO_PI;
  if (t < 0) t += TWO_PI;
  return t;
};

const angleOf = (x, y) => wrap(Math.atan2(y, x));

const smoothstep = (t) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

const emptyDesired = () => ({ n: 0, p50: 0, p90: 0, p95: 0, max: 0 });

function finishLineAngleMap(points) {
  const bins = 360;
  const z = new Float64Array(bins).fill(NaN);
  for (const p of points) {
    const b = Math.min(bins - 1, Math.floor((wrap(Math.atan2(p[1], p[0])) / TWO_PI) * bins));
    z[b] = Number.isFinite(z[b]) ? Math.max(z[b], p[2]) : p[2];
  }
  let known = 0;
  for (let i = 0; i < bins; i += 1) if (Number.isFinite(z[i])) known += 1;
  if (known < 8) return null;
  for (let i = 0; i < bins; i += 1) {
    if (Number.isFinite(z[i])) continue;
    let l = 1;
    while (!Number.isFinite(z[(i - l + bins) % bins])) l += 1;
    let r = 1;
    while (!Number.isFinite(z[(i + r) % bins])) r += 1;
    const a = z[(i - l + bins) % bins];
    const b = z[(i + r) % bins];
    z[i] = a + ((b - a) * l) / (l + r);
  }
  return (theta) => {
    const p = (wrap(theta) / TWO_PI) * bins;
    const i0 = Math.floor(p) % bins;
    const w = p - Math.floor(p);
    return z[i0] * (1 - w) + z[(i0 + 1) % bins] * w;
  };
}

function weldSoup(positions, attributes) {
  const triCount = Math.floor(positions.length / 9);
  const keyTo = new Map();
  const verts = [];
  const faces = [];
  const faceAttr = [];
  const inv = 1 / WELD_EPS;
  for (let t = 0; t < triCount; t += 1) {
    const idx = [0, 0, 0];
    for (let k = 0; k < 3; k += 1) {
      const o = t * 9 + k * 3;
      const key = `${Math.round(positions[o] * inv)},${Math.round(positions[o + 1] * inv)},${Math.round(positions[o + 2] * inv)}`;
      let v = keyTo.get(key);
      if (v === undefined) {
        v = verts.length / 3;
        verts.push(positions[o], positions[o + 1], positions[o + 2]);
        keyTo.set(key, v);
      }
      idx[k] = v;
    }
    if (idx[0] === idx[1] || idx[1] === idx[2] || idx[0] === idx[2]) continue;
    faces.push(idx[0], idx[1], idx[2]);
    faceAttr.push(attributes?.[t] || 0);
  }
  return { verts, faces, faceAttr };
}

function largestComponent(verts, faces) {
  const nv = verts.length / 3;
  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i += 1) parent[i] = i;
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const fc = faces.length / 3;
  for (let f = 0; f < fc; f += 1) {
    const a = find(faces[f * 3]);
    parent[find(faces[f * 3 + 1])] = a;
    parent[find(faces[f * 3 + 2])] = a;
  }
  const counts = new Map();
  for (let f = 0; f < fc; f += 1) {
    const r = find(faces[f * 3]);
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  let main = -1;
  let best = -1;
  for (const [r, n] of counts) {
    if (n > best) {
      best = n;
      main = r;
    }
  }
  const inMain = new Uint8Array(fc);
  for (let f = 0; f < fc; f += 1) inMain[f] = find(faces[f * 3]) === main ? 1 : 0;
  return inMain;
}

function faceGeom(verts, faces, f) {
  const ia = faces[f * 3];
  const ib = faces[f * 3 + 1];
  const ic = faces[f * 3 + 2];
  const a = ia * 3;
  const b = ib * 3;
  const c = ic * 3;
  const ux = verts[b] - verts[a];
  const uy = verts[b + 1] - verts[a + 1];
  const uz = verts[b + 2] - verts[a + 2];
  const vx = verts[c] - verts[a];
  const vy = verts[c + 1] - verts[a + 1];
  const vz = verts[c + 2] - verts[a + 2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  const cx = (verts[a] + verts[b] + verts[c]) / 3;
  const cy = (verts[a + 1] + verts[b + 1] + verts[c + 1]) / 3;
  const cz = (verts[a + 2] + verts[b + 2] + verts[c + 2]) / 3;
  const r = Math.hypot(cx, cy);
  const radial = r > 1e-8 ? (nx * cx + ny * cy) / r : 0;
  const minR = Math.min(Math.hypot(verts[a], verts[a + 1]), Math.hypot(verts[b], verts[b + 1]), Math.hypot(verts[c], verts[c + 1]));
  return { nx, ny, nz, cx, cy, cz, r, radial, minR };
}

/** 축면 법선이 축을 향하면 면 순서를 뒤집어 바깥을 향하게 한다. */
function orientOutward(mesh) {
  const { verts, faces, faceMain } = mesh;
  const fc = faces.length / 3;
  let pos = 0;
  let neg = 0;
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f]) continue;
    const g = faceGeom(verts, faces, f);
    if (g.r < SCREW_R_MM || Math.abs(g.nz) > 0.65) continue;
    if (g.radial >= 0) pos += 1;
    else neg += 1;
  }
  if (neg <= pos) return;
  for (let f = 0; f < fc; f += 1) {
    const b = faces[f * 3 + 1];
    faces[f * 3 + 1] = faces[f * 3 + 2];
    faces[f * 3 + 2] = b;
  }
}

/** 가파른 축면이 끝나는 높이. 교합면(누운 면)은 넣지 않는다. */
function wallTopMap(verts, faces, faceAttr, faceMain, flZ) {
  const bins = 360;
  const zMax = new Float64Array(bins).fill(NaN);
  const fc = faces.length / 3;
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f]) continue;
    if (faceAttr[f] === CUFF_BLEND_PATCH_ATTRIBUTE || faceAttr[f] === HOLE_FILL_PATCH_ATTRIBUTE) continue;
    const g = faceGeom(verts, faces, f);
    if (g.r < SCREW_R_MM || g.radial < 0.75 || g.nz > 0.45) continue;
    const th = Math.atan2(g.cy, g.cx);
    if (g.cz < flZ(th) + 0.2) continue;
    const b = Math.min(bins - 1, Math.floor((wrap(th) / TWO_PI) * bins));
    if (!(zMax[b] >= g.cz)) zMax[b] = g.cz;
  }
  let known = 0;
  let gap = 0;
  let maxGap = 0;
  for (let i = 0; i < bins * 2; i += 1) {
    if (Number.isFinite(zMax[i % bins])) {
      known += i < bins ? 1 : 0;
      maxGap = Math.max(maxGap, gap);
      gap = 0;
    } else gap += 1;
  }
  if (known < 16 || maxGap > 45) return null;
  for (let i = 0; i < bins; i += 1) {
    if (Number.isFinite(zMax[i])) continue;
    let l = 1;
    while (!Number.isFinite(zMax[(i - l + bins) % bins])) l += 1;
    let r = 1;
    while (!Number.isFinite(zMax[(i + r) % bins])) r += 1;
    zMax[i] = zMax[(i - l + bins) % bins] + ((zMax[(i + r) % bins] - zMax[(i - l + bins) % bins]) * l) / (l + r);
  }
  const sigma = 4;
  const rad = sigma * 3;
  const sm = new Float64Array(bins);
  for (let i = 0; i < bins; i += 1) {
    let s = 0;
    let w = 0;
    for (let k = -rad; k <= rad; k += 1) {
      const g = Math.exp(-0.5 * (k / sigma) ** 2);
      s += zMax[(i + k + bins) % bins] * g;
      w += g;
    }
    sm[i] = s / w;
  }
  return (theta) => {
    const p = (wrap(theta) / TWO_PI) * bins;
    const i0 = Math.floor(p) % bins;
    const w = p - Math.floor(p);
    return sm[i0] * (1 - w) + sm[(i0 + 1) % bins] * w;
  };
}

function splitByLevel(mesh, levelOf, canSplit) {
  const { verts, faceAttr, faceMain } = mesh;
  let { faces } = mesh;
  const nv0 = verts.length / 3;
  const fv = new Float64Array(nv0);
  for (let v = 0; v < nv0; v += 1) {
    let f = levelOf(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
    if (Math.abs(f) < 1e-7) f = 0;
    fv[v] = f;
  }
  const values = Array.from(fv);
  const cache = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const t = values[a] / (values[a] - values[b]);
    const idx = verts.length / 3;
    verts.push(
      verts[a * 3] + t * (verts[b * 3] - verts[a * 3]),
      verts[a * 3 + 1] + t * (verts[b * 3 + 1] - verts[a * 3 + 1]),
      verts[a * 3 + 2] + t * (verts[b * 3 + 2] - verts[a * 3 + 2]),
    );
    values.push(0);
    cache.set(key, idx);
    return idx;
  };
  const sign = (v) => (values[v] > 0 ? 1 : values[v] < 0 ? -1 : 0);
  const outFaces = [];
  const outAttr = [];
  const outMain = [];
  const fc = faces.length / 3;
  for (let f = 0; f < fc; f += 1) {
    const tri = [faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]];
    const attr = faceAttr[f];
    const main = faceMain[f];
    const push = (a, b, c) => {
      outFaces.push(a, b, c);
      outAttr.push(attr);
      outMain.push(main);
    };
    const s = tri.map(sign);
    const crosses = s[0] * s[1] < 0 || s[1] * s[2] < 0 || s[2] * s[0] < 0;
    if (!main || !crosses || !canSplit(f)) {
      push(tri[0], tri[1], tri[2]);
      continue;
    }
    const zeroAt = s.indexOf(0);
    if (zeroAt >= 0) {
      const v0 = tri[zeroAt];
      const v1 = tri[(zeroAt + 1) % 3];
      const v2 = tri[(zeroAt + 2) % 3];
      const m = mid(v1, v2);
      push(v0, v1, m);
      push(v0, m, v2);
      continue;
    }
    let iso = 0;
    if (s[0] === s[1]) iso = 2;
    else if (s[0] === s[2]) iso = 1;
    const v0 = tri[iso];
    const v1 = tri[(iso + 1) % 3];
    const v2 = tri[(iso + 2) % 3];
    const m1 = mid(v0, v1);
    const m2 = mid(v0, v2);
    push(v0, m1, m2);
    push(m1, v1, v2);
    push(m1, v2, m2);
  }
  return { verts, faces: outFaces, faceAttr: outAttr, faceMain: outMain };
}

function chainBoundaryLoops(directedEdges) {
  const next = new Map();
  for (const [a, b] of directedEdges) {
    if (next.has(a)) return null;
    next.set(a, b);
  }
  const loops = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let v = start;
    while (!seen.has(v)) {
      seen.add(v);
      loop.push(v);
      v = next.get(v);
      if (v === undefined) return null;
    }
    if (v !== start) return null;
    loops.push(loop);
  }
  return loops;
}

function angularRow(loop, verts) {
  const ang = loop.map((v) => angleOf(verts[v * 3], verts[v * 3 + 1]));
  const steps = ang.map((a, i) => {
    let d = ang[(i + 1) % ang.length] - a;
    if (d > Math.PI) d -= TWO_PI;
    if (d < -Math.PI) d += TWO_PI;
    return d;
  });
  const turn = steps.reduce((s, d) => s + d, 0);
  const dir = Math.sign(turn);
  if (Math.abs(Math.abs(turn) - TWO_PI) > 0.15 || steps.some((d) => d * dir < -0.12)) return null;
  let order = loop.map((_, i) => i);
  if (dir < 0) order = order.reverse();
  let start = 0;
  for (let i = 1; i < order.length; i += 1) {
    if (wrap(ang[order[i]]) < wrap(ang[order[start]])) start = i;
  }
  order = [...order.slice(start), ...order.slice(0, start)];
  const out = [];
  let acc = wrap(ang[order[0]]);
  for (let i = 0; i < order.length; i += 1) {
    if (i > 0) {
      let d = ang[order[i]] - ang[order[i - 1]];
      if (d > Math.PI) d -= TWO_PI;
      if (d < -Math.PI) d += TWO_PI;
      acc += d;
    }
    out.push({ v: loop[order[i]], a: acc });
  }
  return out;
}

function zipperRows(lower, upper, emit) {
  const A = lower.length;
  const B = upper.length;
  let i = 0;
  let j = 0;
  const angA = (k) => lower[k % A].a + Math.floor(k / A) * TWO_PI;
  const angB = (k) => upper[k % B].a + Math.floor(k / B) * TWO_PI;
  while (i < A || j < B) {
    const nextA = i < A ? angA(i + 1) : Infinity;
    const nextB = j < B ? angB(j + 1) : Infinity;
    if (nextA <= nextB) {
      emit(lower[i % A].v, lower[(i + 1) % A].v, upper[j % B].v);
      i += 1;
    } else {
      emit(lower[i % A].v, upper[(j + 1) % B].v, upper[j % B].v);
      j += 1;
    }
  }
}

class RadialProbe {
  constructor(verts, faces) {
    this.verts = verts;
    this.faces = faces;
    const fc = faces.length / 3;
    this.zmin = new Float64Array(fc);
    this.zmax = new Float64Array(fc);
    let lo = Infinity;
    let hi = -Infinity;
    for (let f = 0; f < fc; f += 1) {
      const za = verts[faces[f * 3] * 3 + 2];
      const zb = verts[faces[f * 3 + 1] * 3 + 2];
      const zc = verts[faces[f * 3 + 2] * 3 + 2];
      this.zmin[f] = Math.min(za, zb, zc);
      this.zmax[f] = Math.max(za, zb, zc);
      lo = Math.min(lo, this.zmin[f]);
      hi = Math.max(hi, this.zmax[f]);
    }
    this.lo = lo;
    this.hi = hi;
    this.slab = 0.08;
    this.angN = 72;
    const n = Math.max(1, Math.ceil((hi - lo) / this.slab) + 1);
    this.cells = Array.from({ length: n }, () => Array.from({ length: this.angN }, () => []));
    this.wide = Array.from({ length: n }, () => []);
    for (let f = 0; f < fc; f += 1) {
      const s0 = Math.max(0, Math.floor((this.zmin[f] - lo) / this.slab));
      const s1 = Math.min(n - 1, Math.floor((this.zmax[f] - lo) / this.slab));
      const angs = [0, 1, 2].map((k) => angleOf(verts[faces[f * 3 + k] * 3], verts[faces[f * 3 + k] * 3 + 1]));
      let span = 0;
      for (let i = 0; i < 3; i += 1) {
        let d = angs[(i + 1) % 3] - angs[i];
        if (d > Math.PI) d -= TWO_PI;
        if (d < -Math.PI) d += TWO_PI;
        span = Math.max(span, Math.abs(d));
      }
      const wide = span > 0.35;
      for (let s = s0; s <= s1; s += 1) {
        if (wide) {
          this.wide[s].push(f);
          continue;
        }
        const seen = new Set();
        for (const a of angs) {
          const b = Math.min(this.angN - 1, Math.floor((a / TWO_PI) * this.angN));
          if (seen.has(b)) continue;
          seen.add(b);
          this.cells[s][b].push(f);
        }
      }
    }
  }

  rayRadius(theta, z) {
    const s = Math.floor((z - this.lo) / this.slab);
    if (s < 0 || s >= this.cells.length) return NaN;
    const { verts, faces } = this;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    let best = NaN;
    const b = Math.min(this.angN - 1, Math.floor((wrap(theta) / TWO_PI) * this.angN));
    const lists = [
      this.cells[s][b],
      this.cells[s][(b + 1) % this.angN],
      this.cells[s][(b + this.angN - 1) % this.angN],
      this.wide[s],
    ];
    for (const list of lists) for (const f of list) {
      if (this.zmin[f] > z || this.zmax[f] < z || this.zmin[f] === this.zmax[f]) continue;
      const hit = [];
      for (let k = 0; k < 3; k += 1) {
        const a = faces[f * 3 + k] * 3;
        const b = faces[f * 3 + ((k + 1) % 3)] * 3;
        const za = verts[a + 2];
        const zb = verts[b + 2];
        if (za === zb) continue;
        const zLo = Math.min(za, zb);
        const zHi = Math.max(za, zb);
        if (z < zLo || z >= zHi) continue;
        const t = (z - za) / (zb - za);
        hit.push(verts[a] + t * (verts[b] - verts[a]), verts[a + 1] + t * (verts[b + 1] - verts[a + 1]));
      }
      if (hit.length < 4) continue;
      const ex = hit[2] - hit[0];
      const ey = hit[3] - hit[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const r = (hit[0] * ey - hit[1] * ex) / den;
      const u = (hit[0] * dy - hit[1] * dx) / den;
      if (r > 0.5 && u >= -1e-8 && u <= 1 + 1e-8 && !(best >= r)) best = r;
    }
    return best;
  }
}

function fillCircular(row) {
  const n = row.length;
  for (let i = 0; i < n; i += 1) {
    if (Number.isFinite(row[i])) continue;
    let l = 1;
    while (l < n && !Number.isFinite(row[(i - l + n) % n])) l += 1;
    let r = 1;
    while (r < n && !Number.isFinite(row[(i + r) % n])) r += 1;
    if (l >= n || r >= n) return;
    const a = row[(i - l + n) % n];
    const b = row[(i + r) % n];
    row[i] = a + ((b - a) * l) / (l + r);
  }
}

/** 상자 평균 한 번(둘레는 원형). 세 번 겹치면 가우시안과 비슷해진다. */
function boxColumns(grid, half) {
  const width = half * 2 + 1;
  return grid.map((row) => {
    const out = new Float64Array(FIELD_BINS);
    let sum = 0;
    for (let k = -half; k <= half; k += 1) sum += row[(k + FIELD_BINS) % FIELD_BINS];
    for (let j = 0; j < FIELD_BINS; j += 1) {
      out[j] = sum / width;
      sum += row[(j + half + 1) % FIELD_BINS] - row[(j - half + FIELD_BINS) % FIELD_BINS];
    }
    return out;
  });
}

/** 상자 평균 한 번(높이). 표본 밖은 빼고 다시 나누어 끝이 끌려가지 않게 한다. */
function boxRows(grid, half) {
  const rows = grid.length;
  const out = grid.map((row) => Float64Array.from(row));
  const sum = new Float64Array(FIELD_BINS);
  const hi0 = Math.min(rows - 1, half);
  for (let zi = 0; zi <= hi0; zi += 1) {
    for (let j = 0; j < FIELD_BINS; j += 1) sum[j] += grid[zi][j];
  }
  for (let zi = 0; zi < rows; zi += 1) {
    const lo = Math.max(0, zi - half);
    const hi = Math.min(rows - 1, zi + half);
    for (let j = 0; j < FIELD_BINS; j += 1) out[zi][j] = sum[j] / (hi - lo + 1);
    const drop = zi - half;
    if (drop >= 0) for (let j = 0; j < FIELD_BINS; j += 1) sum[j] -= grid[drop][j];
    const add = zi + half + 1;
    if (add < rows) for (let j = 0; j < FIELD_BINS; j += 1) sum[j] += grid[add][j];
  }
  return out;
}

/** σ만큼 평활. 상자 평균 세 번으로 가우시안을 대신한다(칸 수에 비례하지 않는 속도). */
function smoothGrid(grid, sigmaColBins, sigmaRowCells) {
  let out = grid;
  const halfCol = Math.max(1, Math.round(sigmaColBins));
  const halfRow = Math.max(1, Math.round(sigmaRowCells));
  for (let pass = 0; pass < 3; pass += 1) out = boxRows(boxColumns(out, halfCol), halfRow);
  return out;
}

/** 창 안 최댓값(둘레→높이 순). 평활 곡면이 원본보다 밖으로 나간 양의 상한을 잰다. */
function maxFilterGrid(grid, halfColBins, halfRowCells) {
  const across = grid.map((row) => {
    const out = new Float64Array(FIELD_BINS);
    for (let j = 0; j < FIELD_BINS; j += 1) {
      let best = -Infinity;
      for (let k = -halfColBins; k <= halfColBins; k += 1) {
        best = Math.max(best, row[(j + k + FIELD_BINS) % FIELD_BINS]);
      }
      out[j] = best;
    }
    return out;
  });
  const out = across.map((row) => Float64Array.from(row));
  for (let ti = 0; ti < grid.length; ti += 1) {
    for (let j = 0; j < FIELD_BINS; j += 1) {
      let best = -Infinity;
      for (let k = -halfRowCells; k <= halfRowCells; k += 1) {
        const tt = Math.max(0, Math.min(grid.length - 1, ti + k));
        best = Math.max(best, across[tt][j]);
      }
      out[ti][j] = best;
    }
  }
  return out;
}

/** 원형 1차원 평활(상자 평균 세 번). */
function smoothCircular1D(values, sigmaBins) {
  let row = Float64Array.from(values);
  const half = Math.max(1, Math.round(sigmaBins));
  for (let pass = 0; pass < 3; pass += 1) {
    row = boxColumns([row], half)[0];
  }
  return row;
}

function buildSmoothField(probe, zBottom, zTop) {
  const degToBins = FIELD_BINS / 360;
  // 경계 고리는 성긴 메시의 꼭짓점을 이은 꺾인 선이다. 그대로 나눗셈 좌표로 쓰면
  // 꺾임이 반경 표본에 세로줄로 새므로, 표본용 경계만 펴 둔다(출력 끝은 원본 고리 그대로).
  const zbArr = new Float64Array(FIELD_BINS);
  const ztArr = new Float64Array(FIELD_BINS);
  for (let j = 0; j < FIELD_BINS; j += 1) {
    const theta = (j / FIELD_BINS) * TWO_PI;
    zbArr[j] = zBottom(theta);
    ztArr[j] = zTop(theta);
  }
  const zbS = smoothCircular1D(zbArr, 6 * degToBins);
  const ztS = smoothCircular1D(ztArr, 6 * degToBins);
  let meanH = 0;
  for (let j = 0; j < FIELD_BINS; j += 1) meanH += ztS[j] - zbS[j];
  meanH /= FIELD_BINS;
  if (!(meanH > 0.1)) return null;
  const mmToCells = (mm) => (mm / meanH) * (FIELD_T_ROWS - 1);
  const raw = [];
  for (let ti = 0; ti < FIELD_T_ROWS; ti += 1) {
    const t = ti / (FIELD_T_ROWS - 1);
    const row = new Float64Array(FIELD_BINS);
    for (let j = 0; j < FIELD_BINS; j += 1) {
      const theta = (j / FIELD_BINS) * TWO_PI;
      row[j] = probe.rayRadius(theta, zbS[j] + t * (ztS[j] - zbS[j]));
    }
    fillCircular(row);
    raw.push(row);
  }
  // 광선이 닿지 않은 칸은 위·아래 칸에서 채운다.
  for (let j = 0; j < FIELD_BINS; j += 1) {
    let prev = -1;
    for (let ti = 0; ti <= FIELD_T_ROWS; ti += 1) {
      const finite = ti < FIELD_T_ROWS && Number.isFinite(raw[ti][j]);
      if (!finite && ti < FIELD_T_ROWS) continue;
      if (prev >= 0 && ti - prev > 1) {
        const a = raw[prev][j];
        const b = finite ? raw[ti][j] : a;
        for (let k = prev + 1; k < Math.min(ti, FIELD_T_ROWS); k += 1) {
          raw[k][j] = a + ((b - a) * (k - prev)) / (ti - prev);
        }
      }
      if (finite) prev = ti;
    }
  }
  let rest = 0;
  let restN = 0;
  for (const row of raw) {
    for (let j = 0; j < FIELD_BINS; j += 1) {
      if (Number.isFinite(row[j])) {
        rest += row[j];
        restN += 1;
      }
    }
  }
  if (!restN) return null;
  const restMean = rest / restN;
  for (const row of raw) {
    for (let j = 0; j < FIELD_BINS; j += 1) if (!Number.isFinite(row[j])) row[j] = restMean;
  }

  const strong = smoothGrid(raw, SMOOTH_SIGMA_COL_DEG * degToBins, mmToCells(SMOOTH_SIGMA_ROW_MM));
  // 강평활이 크게 어긋나는 자리(홈·턱)는 평활 대상이 아니라 지킬 형상이다.
  // 경계를 번지게 해 평활 곡면이 형상 옆에서 파이지 않게 한다.
  let mask = raw.map((row, ti) => {
    const out = new Float64Array(FIELD_BINS);
    for (let j = 0; j < FIELD_BINS; j += 1) out[j] = Math.abs(strong[ti][j] - row[j]) > FEATURE_MM ? 1 : 0;
    return out;
  });
  // 내접량이 형상 밖으로 새는 창만큼 보호 범위를 넓힌 뒤 경계를 번지게 한다.
  mask = maxFilterGrid(
    mask,
    Math.round(ENVELOPE_HALF_COL_DEG * degToBins),
    Math.round(mmToCells(ENVELOPE_HALF_ROW_MM)),
  );
  mask = smoothGrid(mask, FEATURE_FEATHER_COL_DEG * degToBins, mmToCells(FEATURE_FEATHER_ROW_MM));
  // 내접: 평활 곡면이 원본보다 밖으로 나간 양(strong − raw)의 매끈한 상한만큼
  // 곡면 전체를 안쪽으로 내린다. 원본에 붙이는 방식과 달리 내린 곡면은
  // 큰 삼각형의 평면을 따라가지 않아 접힘이 남지 않는다.
  const excess = raw.map((row, ti) => {
    const out = new Float64Array(FIELD_BINS);
    for (let j = 0; j < FIELD_BINS; j += 1) out[j] = strong[ti][j] - row[j];
    return out;
  });
  let envelope = maxFilterGrid(
    excess,
    Math.round(ENVELOPE_HALF_COL_DEG * degToBins),
    Math.round(mmToCells(ENVELOPE_HALF_ROW_MM)),
  );
  envelope = smoothGrid(envelope, ENVELOPE_SIGMA_COL_DEG * degToBins, mmToCells(ENVELOPE_SIGMA_ROW_MM));
  let field = raw.map((row, ti) => {
    const out = new Float64Array(FIELD_BINS);
    for (let j = 0; j < FIELD_BINS; j += 1) out[j] = strong[ti][j] - envelope[ti][j];
    return out;
  });
  // 상한을 자른 자리가 다시 접히지 않게 살짝 펴고 다시 자른다.
  for (let pass = 0; pass < 2; pass += 1) {
    field = smoothGrid(field, 1.5 * degToBins, mmToCells(0.06));
    for (let ti = 0; ti < FIELD_T_ROWS; ti += 1) {
      for (let j = 0; j < FIELD_BINS; j += 1) {
        field[ti][j] = Math.min(
          Math.max(field[ti][j], raw[ti][j] - POST_FAIR_MAX_IN_MM),
          raw[ti][j] + POST_FAIR_MAX_OUT_MM,
        );
      }
    }
  }
  // 지킬 형상(홈·턱)은 원본 그대로 둔다.
  for (let ti = 0; ti < FIELD_T_ROWS; ti += 1) {
    for (let j = 0; j < FIELD_BINS; j += 1) {
      const m = Math.max(0, Math.min(1, mask[ti][j]));
      if (m > 0) field[ti][j] = field[ti][j] * (1 - m) + raw[ti][j] * m;
    }
  }
  const sampler = (grid) => (theta, t) => {
    const tt = Math.max(0, Math.min(1, t)) * (FIELD_T_ROWS - 1);
    const t0 = Math.floor(tt);
    const t1 = Math.min(FIELD_T_ROWS - 1, t0 + 1);
    const wt = tt - t0;
    const p = (wrap(theta) / TWO_PI) * FIELD_BINS;
    const j0 = Math.floor(p) % FIELD_BINS;
    const wj = p - Math.floor(p);
    const j1 = (j0 + 1) % FIELD_BINS;
    const a = grid[t0][j0] * (1 - wj) + grid[t0][j1] * wj;
    const b = grid[t1][j0] * (1 - wj) + grid[t1][j1] * wj;
    return a * (1 - wt) + b * wt;
  };
  const atBin = (arr) => (theta) => {
    const p = (wrap(theta) / TWO_PI) * FIELD_BINS;
    const j0 = Math.floor(p) % FIELD_BINS;
    const wj = p - Math.floor(p);
    return arr[j0] * (1 - wj) + arr[(j0 + 1) % FIELD_BINS] * wj;
  };
  return { sampleT: sampler(field), rawT: sampler(raw), zBottomAt: atBin(zbS), zTopAt: atBin(ztS) };
}

function rowSampler(row, verts, pick) {
  const pts = row.map(({ v, a }) => ({ a, value: pick(verts, v) }));
  const first = pts[0];
  pts.push({ a: first.a + TWO_PI, value: first.value });
  return (theta) => {
    let a = wrap(theta);
    if (a < pts[0].a - 1e-8) a += TWO_PI;
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (pts[m].a <= a) lo = m;
      else hi = m;
    }
    const span = pts[hi].a - pts[lo].a;
    const w = span > 1e-12 ? (a - pts[lo].a) / span : 0;
    return pts[lo].value * (1 - w) + pts[hi].value * w;
  };
}

function unchanged(buffer, triCount, reason) {
  return {
    buffer,
    movedCount: 0,
    maxInwardMm: 0,
    maxOutwardMm: 0,
    faceCount: triCount,
    revertedVertices: 0,
    desiredInwardUm: emptyDesired(),
    patchTriangles: 0,
    rows: 0,
    reason,
  };
}

/**
 * 피니시라인 위 포스트 축면을 커프와 같은 간격의 곡면으로 바꾼다.
 * @param {Buffer} buffer
 * @param {{ finishLinePoints?: number[][] }} [options]
 */
export function fairPostAboveFinishLine(buffer, options = {}) {
  const parsed = parseStl(buffer);
  const triCount = Math.floor(parsed.positions.length / 9);
  const points = (options.finishLinePoints || [])
    .map((p) => [Number(p?.[0]), Number(p?.[1]), Number(p?.[2])])
    .filter((p) => p.every(Number.isFinite));
  const flZ = finishLineAngleMap(points);
  if (!flZ || triCount < 100) return unchanged(buffer, triCount, "피니시라인이 없습니다.");

  const welded = weldSoup(parsed.positions, parsed.attributes);
  const faceMain = Array.from(largestComponent(welded.verts, welded.faces));
  let mesh = { ...welded, faceMain };
  orientOutward(mesh);
  const probe = new RadialProbe(mesh.verts, mesh.faces.slice());
  const zTopOf = wallTopMap(mesh.verts, mesh.faces, mesh.faceAttr, mesh.faceMain, flZ);
  if (!zTopOf) return unchanged(buffer, triCount, "포스트 축면 위끝을 찾지 못했습니다.");

  // 커프 면도 잘라야 맞닿은 모서리에 중간 꼭짓점이 맞는다. 지우지는 않는다.
  const crossesOuter = (f) => faceGeom(mesh.verts, mesh.faces, f).minR > SCREW_R_MM;
  mesh = splitByLevel(mesh, (x, y, z) => z - flZ(angleOf(x, y)), crossesOuter);
  mesh = splitByLevel(mesh, (x, y, z) => z - zTopOf(angleOf(x, y)), (f) => faceGeom(mesh.verts, mesh.faces, f).minR > SCREW_R_MM);

  const { verts, faces, faceAttr, faceMain: main } = mesh;
  const fc = faces.length / 3;
  const candidate = new Uint8Array(fc);
  for (let f = 0; f < fc; f += 1) {
    if (!main[f]) continue;
    if (faceAttr[f] === CUFF_BLEND_PATCH_ATTRIBUTE || faceAttr[f] === HOLE_FILL_PATCH_ATTRIBUTE) continue;
    const g = faceGeom(verts, faces, f);
    if (g.minR <= SCREW_R_MM || g.radial < 0.32 || g.nz > 0.86) continue;
    const th = Math.atan2(g.cy, g.cx);
    if (g.cz <= flZ(th) + 0.002 || g.cz >= zTopOf(th) + 0.05) continue;
    candidate[f] = 1;
  }
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const edgeFaces = new Map();
  for (let f = 0; f < fc; f += 1) {
    if (!main[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const key = ek(faces[f * 3 + k], faces[f * 3 + ((k + 1) % 3)]);
      const list = edgeFaces.get(key);
      if (list) list.push(f);
      else edgeFaces.set(key, [f]);
    }
  }
  const removed = new Uint8Array(fc);
  const stack = [];
  for (let f = 0; f < fc; f += 1) {
    if (!candidate[f]) continue;
    const g = faceGeom(verts, faces, f);
    if (g.radial > 0.85 && g.nz < 0.4) {
      removed[f] = 1;
      stack.push(f);
    }
  }
  while (stack.length) {
    const f = stack.pop();
    for (let k = 0; k < 3; k += 1) {
      const key = ek(faces[f * 3 + k], faces[f * 3 + ((k + 1) % 3)]);
      for (const g of edgeFaces.get(key) || []) {
        if (removed[g] || !candidate[g]) continue;
        removed[g] = 1;
        stack.push(g);
      }
    }
  }
  let removedCount = 0;
  let outwardVotes = 0;
  for (let f = 0; f < fc; f += 1) {
    if (!removed[f]) continue;
    removedCount += 1;
    const g = faceGeom(verts, faces, f);
    outwardVotes += Math.sign(g.nx * g.cx + g.ny * g.cy);
  }
  if (removedCount < 30) return unchanged(buffer, triCount, "다시 깔 축면이 없습니다.");

  const keptEdges = new Set();
  const removedEdges = [];
  for (let f = 0; f < fc; f += 1) {
    if (!main[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      if (removed[f]) removedEdges.push([a, b]);
      else keptEdges.add(`${a}_${b}`);
    }
  }
  const boundary = [];
  for (const [a, b] of removedEdges) {
    if (keptEdges.has(`${b}_${a}`)) boundary.push([b, a]);
  }
  const openEdgeCount = new Map();
  for (const [a, b] of removedEdges) {
    const key = ek(a, b);
    openEdgeCount.set(key, (openEdgeCount.get(key) || 0) + 1);
  }
  for (const [a, b] of removedEdges) {
    if (keptEdges.has(`${b}_${a}`) || keptEdges.has(`${a}_${b}`)) continue;
    if (openEdgeCount.get(ek(a, b)) !== 1) continue;
    boundary.push([b, a]);
  }
  const loops = chainBoundaryLoops(boundary);
  if (!loops) return unchanged(buffer, triCount, "축면 경계가 닫히지 않습니다.");
  const rings = [];
  for (const loop of loops) {
    if (loop.length < 12) continue;
    const row = angularRow(loop, verts);
    if (!row) continue;
    const meanR = loop.reduce((s, v) => s + Math.hypot(verts[v * 3], verts[v * 3 + 1]), 0) / loop.length;
    const meanZ = loop.reduce((s, v) => s + verts[v * 3 + 2], 0) / loop.length;
    if (meanR < SCREW_R_MM) continue;
    rings.push({ row, meanZ, meanR, n: loop.length });
  }
  if (rings.length !== 2) {
    return unchanged(buffer, triCount, `축면 경계 고리가 ${rings.length}개입니다.`);
  }
  rings.sort((a, b) => a.meanZ - b.meanZ);
  const bottom = rings[0];
  const top = rings[1];
  if (top.meanZ - bottom.meanZ < 0.4) return unchanged(buffer, triCount, "포스트 축면이 너무 낮습니다.");

  const zBottom = rowSampler(bottom.row, verts, (vs, v) => vs[v * 3 + 2]);
  const zTop = rowSampler(top.row, verts, (vs, v) => vs[v * 3 + 2]);
  const rBottom = rowSampler(bottom.row, verts, (vs, v) => Math.hypot(vs[v * 3], vs[v * 3 + 1]));
  const rTop = rowSampler(top.row, verts, (vs, v) => Math.hypot(vs[v * 3], vs[v * 3 + 1]));
  let maxH = 0;
  for (let j = 0; j < COLUMNS; j += 1) {
    const th = (j / COLUMNS) * TWO_PI;
    maxH = Math.max(maxH, zTop(th) - zBottom(th));
  }
  const rows = Math.max(8, Math.min(MAX_ROWS, Math.ceil(maxH / ROW_PITCH_MM)));
  const field = buildSmoothField(probe, zBottom, zTop);
  if (!field) return unchanged(buffer, triCount, "축면 반경을 읽지 못했습니다.");

  const grid = [];
  const desired = [];
  let maxInwardMm = 0;
  let maxOutwardMm = 0;
  let movedCount = 0;
  for (let r = 1; r < rows; r += 1) {
    const t = r / rows;
    const line = [];
    for (let j = 0; j < COLUMNS; j += 1) {
      const theta = (j / COLUMNS) * TWO_PI;
      const zb = zBottom(theta);
      const zt = zTop(theta);
      const zExact = zb + t * (zt - zb);
      const heightEdge = Math.min(zExact - zb, zt - zExact);
      const w = smoothstep(heightEdge / RIM_BLEND_MM);
      // 안쪽 행 높이는 편 경계로 잡는다. 성긴 경계 고리의 꺾임이 세로줄로 남지 않게.
      // 경계 바로 옆에서는 원래 고리 높이에 붙어 이음선이 생기지 않는다.
      const zbF = field.zBottomAt(theta);
      const zSmooth = zbF + t * (field.zTopAt(theta) - zbF);
      const z = zSmooth * w + zExact * (1 - w);
      const rs = field.sampleT(theta, t);
      const rim = z - zb <= zt - z ? rBottom(theta) : rTop(theta);
      let rad = (Number.isFinite(rs) ? rs : rim) * w + rim * (1 - w);
      const ro = field.rawT(theta, t);
      if (Number.isFinite(ro)) {
        const lo = ro - POST_FAIR_MAX_IN_MM;
        const hi = ro + POST_FAIR_MAX_OUT_MM;
        if (rad > hi) rad = hi;
        if (rad < lo) rad = lo;
        const delta = rad - ro;
        if (delta < -0.001) movedCount += 1;
        if (delta < 0) maxInwardMm = Math.max(maxInwardMm, -delta);
        else maxOutwardMm = Math.max(maxOutwardMm, delta);
        desired.push(Math.max(0, -delta));
      }
      const idx = verts.length / 3;
      verts.push(rad * Math.cos(theta), rad * Math.sin(theta), z);
      line.push({ v: idx, a: theta });
    }
    grid.push(line);
  }

  const outward = outwardVotes >= 0 ? 1 : -1;
  const newFaces = [];
  const emit = (a, b, c) => {
    const pa = a * 3;
    const pb = b * 3;
    const pc = c * 3;
    const ux = verts[pb] - verts[pa];
    const uy = verts[pb + 1] - verts[pa + 1];
    const uz = verts[pb + 2] - verts[pa + 2];
    const vx = verts[pc] - verts[pa];
    const vy = verts[pc + 1] - verts[pa + 1];
    const vz = verts[pc + 2] - verts[pa + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const cx = (verts[pa] + verts[pb] + verts[pc]) / 3;
    const cy = (verts[pa + 1] + verts[pb + 1] + verts[pc + 1]) / 3;
    if (Math.hypot(nx, ny, ux * vy - uy * vx) < 1e-14) return;
    if (Math.sign(nx * cx + ny * cy) === outward || Math.sign(nx * cx + ny * cy) === 0) newFaces.push(a, b, c);
    else newFaces.push(a, c, b);
  };
  const stackRows = [bottom.row, ...grid, top.row];
  for (let r = 0; r + 1 < stackRows.length; r += 1) zipperRows(stackRows[r], stackRows[r + 1], emit);

  const outFaces = [];
  const outAttr = [];
  for (let f = 0; f < fc; f += 1) {
    if (removed[f]) continue;
    outFaces.push(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
    outAttr.push(faceAttr[f]);
  }
  for (let i = 0; i < newFaces.length; i += 3) {
    outFaces.push(newFaces[i], newFaces[i + 1], newFaces[i + 2]);
    outAttr.push(POST_FAIR_PATCH_ATTRIBUTE);
  }
  const outTri = outFaces.length / 3;
  const positions = new Float64Array(outTri * 9);
  for (let t = 0; t < outTri; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = outFaces[t * 3 + k] * 3;
      positions[t * 9 + k * 3] = verts[v];
      positions[t * 9 + k * 3 + 1] = verts[v + 1];
      positions[t * 9 + k * 3 + 2] = verts[v + 2];
    }
  }
  desired.sort((a, b) => a - b);
  const q = (p) => (desired.length ? desired[Math.min(desired.length - 1, Math.floor(p * (desired.length - 1)))] * 1000 : 0);
  return {
    buffer: writeBinaryStl({ positions, attributes: Uint16Array.from(outAttr) }),
    movedCount,
    maxInwardMm,
    maxOutwardMm,
    faceCount: outTri,
    revertedVertices: 0,
    desiredInwardUm: desired.length
      ? { n: desired.length, p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), p95: +q(0.95).toFixed(1), max: +(desired[desired.length - 1] * 1000).toFixed(1) }
      : emptyDesired(),
    patchTriangles: newFaces.length / 3,
    rows,
    removedTriangles: removedCount,
    reason: "",
  };
}
