// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (피니시라인 아래 커프. 거기는 면을 다시 만든다)
// - web/backend/utils/screwHoleFill.js (parseStl / writeBinaryStl)
// - web/backend/scripts/abutment-stl-js/fair-post.js
// - web/backend/tests/unit/postFair.test.js
//
// 피니시라인 위 포스트(크라운이 안착하는 축면)만 매끈하게 한다.
// 커프와 달리 삼각형을 지우거나 더하지 않는다. 꼭짓점 연결은 그대로 두고 좌표만 옮긴다.
// 같은 세로줄에서 위·아래 반경보다 큰 가로 봉우리만 반경을 줄인다.
// 둘레 곡률(원통 살)은 반경이 같으므로 움직이지 않는다. 안쪽 골은 키우지 않는다.
// 바깥(반경 증가)은 2µm, 안쪽은 MAX_IN 까지.
import { parseStl, writeBinaryStl } from "../../utils/screwHoleFill.js";

export const POST_FAIR_VERSION = "post-fair-1";
/** 크라운 쪽(반경이 커지는 쪽). 이보다 나가면 조기 접촉한다. */
export const POST_FAIR_MAX_OUT_MM = 0.002;
/**
 * 안쪽(반경이 작아지는 쪽) 상한.
 * 봉우리를 누르는 양이다. 크라운과의 틈이 이 값까지 늘어날 수 있다.
 */
export const POST_FAIR_MAX_IN_MM = 0.03;

const TWO_PI = Math.PI * 2;
const WELD_EPS = 1e-5;
/** 축면으로 볼 최소 법선·반지름 성분. 1이면 수직 벽, 0이면 윗면. */
const MIN_RADIAL_NORMAL = 0.4;
/** 피니시라인보다 이만큼 아래 점은 샘플에서도 뺀다. */
const SAMPLE_BELOW_MM = 0.01;
/** 이 높이까지는 마진 꼭짓점을 그대로 둔다. */
const GUARD_MM = 0.05;
/** 가드 위에서 이 구간 동안 이동량을 0에서 1로 올린다. 마진에 턱이 생기지 않게. */
const FALLOFF_MM = 0.22;
/** 같은 세로줄(각도)에서 위·아래만 본다. 둘레로 평균하면 원통 곡률을 봉우리로 오인한다. */
const COL_BINS = 120;
const COL_TH = (8 * Math.PI) / 180;
const COL_Z_MIN = 0.05;
const COL_Z_MAX = 0.35;
const COL_SIGMA_Z = 0.16;
/** 위·아래 모두보다 이만큼 더 굵은 점만 봉우리로 본다. 한 칸 곡률은 여기 안 든다. */
const BUMP_DEADBAND_MM = 0.008;
/** 이보다 반경이 다른 점은 다른 면(홈·구멍)이라 봉우리 계산에 넣지 않는다. */
const COL_R_GATE_MM = 0.12;
const FAIR_PASSES = 1;

const wrap = (a) => {
  let t = a % TWO_PI;
  if (t < 0) t += TWO_PI;
  return t;
};

const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
};

const smoothstep = (t) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

const distPointSeg = (px, py, pz, a, b) => {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const apx = px - a[0];
  const apy = py - a[1];
  const apz = pz - a[2];
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 0 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(a[0] + abx * t - px, a[1] + aby * t - py, a[2] + abz * t - pz);
};

/** 피니시라인 폐곡선까지 거리. 마진 모서리 자체는 옮기지 않기 위해 쓴다. */
function distanceToFinishLine(x, y, z, points) {
  let best = Infinity;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const d = distPointSeg(x, y, z, points[i], points[(i + 1) % n]);
    if (d < best) best = d;
  }
  return best;
}

function finishLineAngleMap(points) {
  const bins = 360;
  const z = new Float64Array(bins).fill(NaN);
  for (const p of points) {
    const b = Math.min(bins - 1, Math.floor((wrap(Math.atan2(p[1], p[0])) / TWO_PI) * bins));
    z[b] = Number.isFinite(z[b]) ? Math.max(z[b], p[2]) : p[2];
  }
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

function weldSoup(positions) {
  const corners = positions.length / 3;
  const triCount = corners / 3;
  const keyTo = new Map();
  const verts = [];
  const cornerOf = new Int32Array(corners);
  const inv = 1 / WELD_EPS;
  for (let c = 0; c < corners; c += 1) {
    const o = c * 3;
    const key = `${Math.round(positions[o] * inv)},${Math.round(positions[o + 1] * inv)},${Math.round(positions[o + 2] * inv)}`;
    let v = keyTo.get(key);
    if (v === undefined) {
      v = verts.length / 3;
      verts.push(positions[o], positions[o + 1], positions[o + 2]);
      keyTo.set(key, v);
    }
    cornerOf[c] = v;
  }
  const faces = [];
  for (let t = 0; t < triCount; t += 1) {
    const a = cornerOf[t * 3];
    const b = cornerOf[t * 3 + 1];
    const c = cornerOf[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    faces.push(a, b, c);
  }
  return { verts, cornerOf, faces };
}

function vertexNormals(verts, faces) {
  const nv = verts.length / 3;
  const acc = new Float64Array(nv * 3);
  const nf = faces.length / 3;
  for (let f = 0; f < nf; f += 1) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];
    const ax = verts[ia * 3];
    const ay = verts[ia * 3 + 1];
    const az = verts[ia * 3 + 2];
    const ux = verts[ib * 3] - ax;
    const uy = verts[ib * 3 + 1] - ay;
    const uz = verts[ib * 3 + 2] - az;
    const vx = verts[ic * 3] - ax;
    const vy = verts[ic * 3 + 1] - ay;
    const vz = verts[ic * 3 + 2] - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    acc[ia * 3] += nx;
    acc[ia * 3 + 1] += ny;
    acc[ia * 3 + 2] += nz;
    acc[ib * 3] += nx;
    acc[ib * 3 + 1] += ny;
    acc[ib * 3 + 2] += nz;
    acc[ic * 3] += nx;
    acc[ic * 3 + 1] += ny;
    acc[ic * 3 + 2] += nz;
  }
  const out = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i += 1) {
    const x = acc[i * 3];
    const y = acc[i * 3 + 1];
    const z = acc[i * 3 + 2];
    const len = Math.hypot(x, y, z);
    if (len < 1e-12) continue;
    out[i * 3] = x / len;
    out[i * 3 + 1] = y / len;
    out[i * 3 + 2] = z / len;
  }
  return out;
}

function faceNormal(verts, a, b, c) {
  const ax = verts[a * 3];
  const ay = verts[a * 3 + 1];
  const az = verts[a * 3 + 2];
  const ux = verts[b * 3] - ax;
  const uy = verts[b * 3 + 1] - ay;
  const uz = verts[b * 3 + 2] - az;
  const vx = verts[c * 3] - ax;
  const vy = verts[c * 3 + 1] - ay;
  const vz = verts[c * 3 + 2] - az;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

/**
 * 정렬된 filled STL(축=Z, 피니시라인과 같은 좌표)에서 포스트 축면 봉우리를 누른다.
 * @param {Buffer} buffer
 * @param {{ finishLinePoints?: number[][], maxInMm?: number, maxOutMm?: number }} [options]
 */
export function fairPostAboveFinishLine(buffer, options = {}) {
  const parsed = parseStl(buffer);
  const positions = parsed.positions;
  const triCount = Math.floor(positions.length / 9);
  const empty = {
    buffer,
    movedCount: 0,
    maxInwardMm: 0,
    maxOutwardMm: 0,
    faceCount: triCount,
    revertedVertices: 0,
    desiredInwardUm: null,
  };
  const points = (options.finishLinePoints || [])
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => [Number(p[0]), Number(p[1]), Number(p[2])])
    .filter((p) => p.every((v) => Number.isFinite(v)));
  if (points.length < 8 || triCount < 10) return empty;

  const maxIn = Number.isFinite(options.maxInMm) ? options.maxInMm : POST_FAIR_MAX_IN_MM;
  const maxOut = Number.isFinite(options.maxOutMm) ? options.maxOutMm : POST_FAIR_MAX_OUT_MM;
  const flZAt = finishLineAngleMap(points);
  const { verts, cornerOf, faces } = weldSoup(positions);
  const nv = verts.length / 3;
  const normals = vertexNormals(verts, faces);
  const orig = Float64Array.from(verts);

  const theta = new Float64Array(nv);
  const radius = new Float64Array(nv);
  const above = new Float64Array(nv);
  const radialN = new Float64Array(nv);
  for (let i = 0; i < nv; i += 1) {
    const x = verts[i * 3];
    const y = verts[i * 3 + 1];
    const z = verts[i * 3 + 2];
    const r = Math.hypot(x, y);
    radius[i] = r;
    theta[i] = Math.atan2(y, x);
    above[i] = z - flZAt(theta[i]);
    if (r > 1e-6) {
      radialN[i] = (normals[i * 3] * x + normals[i * 3 + 1] * y) / r;
    }
  }

  let posN = 0;
  let negN = 0;
  for (let i = 0; i < nv; i += 1) {
    if (above[i] < 0.05 || radius[i] < 0.4) continue;
    if (radialN[i] > 0.3) posN += 1;
    else if (radialN[i] < -0.3) negN += 1;
  }
  const flipNormal = negN > posN * 2;
  const isOuter = (i) => {
    if (radius[i] < 0.35) return false;
    const rn = flipNormal ? -radialN[i] : radialN[i];
    return rn >= MIN_RADIAL_NORMAL;
  };

  const sample = new Uint8Array(nv);
  const weight = new Float64Array(nv);
  const marginDist = new Float64Array(nv);
  let sampleCount = 0;
  for (let i = 0; i < nv; i += 1) {
    if (!isOuter(i) || above[i] < -SAMPLE_BELOW_MM) continue;
    sample[i] = 1;
    sampleCount += 1;
    marginDist[i] = distanceToFinishLine(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2], points);
    const byZ = smoothstep((above[i] - GUARD_MM) / FALLOFF_MM);
    const byDist = smoothstep((marginDist[i] - 0.05) / 0.2);
    weight[i] = Math.min(byZ, byDist);
  }
  if (sampleCount < 30) return empty;

  const nSign = flipNormal ? -1 : 1;
  const nx = new Float64Array(nv);
  const ny = new Float64Array(nv);
  const nz = new Float64Array(nv);
  for (let i = 0; i < nv; i += 1) {
    nx[i] = nSign * normals[i * 3];
    ny[i] = nSign * normals[i * 3 + 1];
    nz[i] = nSign * normals[i * 3 + 2];
  }

  const colBins = Array.from({ length: COL_BINS }, () => []);
  const colOf = (th) => Math.min(COL_BINS - 1, Math.floor((wrap(th) / TWO_PI) * COL_BINS));
  for (let i = 0; i < nv; i += 1) if (sample[i]) colBins[colOf(theta[i])].push(i);
  const colReach = Math.ceil((COL_TH / TWO_PI) * COL_BINS) + 1;
  const sigZ2 = COL_SIGMA_Z * COL_SIGMA_Z;

  const weightedMedian = (pts) => {
    if (pts.length < 2) return null;
    pts.sort((a, b) => a[0] - b[0]);
    let sumW = 0;
    for (let k = 0; k < pts.length; k += 1) sumW += pts[k][1];
    let acc = 0;
    for (let k = 0; k < pts.length; k += 1) {
      acc += pts[k][1];
      if (acc >= sumW * 0.5) return pts[k][0];
    }
    return pts[pts.length - 1][0];
  };

  const columnDeltaR = (i) => {
    const th = theta[i];
    const z = verts[i * 3 + 2];
    const r = Math.hypot(verts[i * 3], verts[i * 3 + 1]);
    const tb = colOf(th);
    const abovePts = [];
    const belowPts = [];
    for (let dt = -colReach; dt <= colReach; dt += 1) {
      const list = colBins[(tb + dt + COL_BINS) % COL_BINS];
      for (let k = 0; k < list.length; k += 1) {
        const j = list[k];
        if (j === i) continue;
        const dth = angDiff(theta[j], th);
        const dz = verts[j * 3 + 2] - z;
        const adz = Math.abs(dz);
        if (Math.abs(dth) > COL_TH || adz < COL_Z_MIN || adz > COL_Z_MAX) continue;
        const rj = Math.hypot(verts[j * 3], verts[j * 3 + 1]);
        if (Math.abs(rj - r) > COL_R_GATE_MM) continue;
        const w = Math.exp(-0.5 * ((dz * dz) / sigZ2));
        (dz > 0 ? abovePts : belowPts).push([rj, w]);
      }
    }
    const aboveMed = weightedMedian(abovePts);
    const belowMed = weightedMedian(belowPts);
    if (aboveMed == null || belowMed == null) return null;
    // 위와 아래보다 동시에 굵을 때만 봉우리다. 경사면·골 어깨는 빠진다.
    return Math.max(aboveMed, belowMed) - r;
  };

  const desired = [];
  for (let pass = 0; pass < FAIR_PASSES; pass += 1) {
    const nextR = new Float64Array(nv);
    for (let i = 0; i < nv; i += 1) nextR[i] = Math.hypot(verts[i * 3], verts[i * 3 + 1]);
    for (let i = 0; i < nv; i += 1) {
      if (!(weight[i] > 0)) continue;
      const delta = columnDeltaR(i);
      if (delta == null) continue;
      // delta < 0 이면 위·아래보다 반경이 크다.
      if (pass === 0 && weight[i] > 0.85 && delta < 0) desired.push(-delta);
      if (!(-delta > BUMP_DEADBAND_MM)) continue;
      const origR = Math.hypot(orig[i * 3], orig[i * 3 + 1]);
      const room = nextR[i] - (origR - maxIn);
      if (!(room > 0)) continue;
      const shrink = Math.min(-delta, room) * weight[i];
      nextR[i] -= shrink;
      if (nextR[i] > origR + maxOut) nextR[i] = origR + maxOut;
    }
    for (let i = 0; i < nv; i += 1) {
      const r = Math.hypot(verts[i * 3], verts[i * 3 + 1]);
      if (!(r > 1e-8) || nextR[i] === r) continue;
      const scale = nextR[i] / r;
      verts[i * 3] *= scale;
      verts[i * 3 + 1] *= scale;
    }
  }

  const nf = faces.length / 3;
  const origN = new Float64Array(nf * 3);
  for (let f = 0; f < nf; f += 1) {
    const n = faceNormal(orig, faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
    origN[f * 3] = n[0];
    origN[f * 3 + 1] = n[1];
    origN[f * 3 + 2] = n[2];
  }
  const revert = new Uint8Array(nv);
  let revertedVertices = 0;
  for (let f = 0; f < nf; f += 1) {
    const n = faceNormal(verts, faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
    const dot = n[0] * origN[f * 3] + n[1] * origN[f * 3 + 1] + n[2] * origN[f * 3 + 2];
    const o2 = origN[f * 3] ** 2 + origN[f * 3 + 1] ** 2 + origN[f * 3 + 2] ** 2;
    const n2 = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
    if (o2 < 1e-16 || n2 < 1e-16 || dot <= 0) {
      revert[faces[f * 3]] = 1;
      revert[faces[f * 3 + 1]] = 1;
      revert[faces[f * 3 + 2]] = 1;
    }
  }
  for (let i = 0; i < nv; i += 1) {
    if (!revert[i]) continue;
    verts[i * 3] = orig[i * 3];
    verts[i * 3 + 1] = orig[i * 3 + 1];
    verts[i * 3 + 2] = orig[i * 3 + 2];
    revertedVertices += 1;
  }

  const moved = new Uint8Array(nv);
  let movedCount = 0;
  let maxInwardMm = 0;
  let maxOutwardMm = 0;
  for (let i = 0; i < nv; i += 1) {
    const dx = verts[i * 3] - orig[i * 3];
    const dy = verts[i * 3 + 1] - orig[i * 3 + 1];
    const dz = verts[i * 3 + 2] - orig[i * 3 + 2];
    if (dx * dx + dy * dy + dz * dz < 1e-16) continue;
    moved[i] = 1;
    movedCount += 1;
    const along = dx * nx[i] + dy * ny[i] + dz * nz[i];
    maxInwardMm = Math.max(maxInwardMm, -along);
    maxOutwardMm = Math.max(maxOutwardMm, along);
    const origR = Math.hypot(orig[i * 3], orig[i * 3 + 1]);
    const newR = Math.hypot(verts[i * 3], verts[i * 3 + 1]);
    maxOutwardMm = Math.max(maxOutwardMm, newR - origR);
  }

  const outPos = new Float64Array(positions.length);
  for (let c = 0; c < cornerOf.length; c += 1) {
    const v = cornerOf[c];
    const o = c * 3;
    if (moved[v]) {
      outPos[o] = verts[v * 3];
      outPos[o + 1] = verts[v * 3 + 1];
      outPos[o + 2] = verts[v * 3 + 2];
    } else {
      outPos[o] = positions[o];
      outPos[o + 1] = positions[o + 1];
      outPos[o + 2] = positions[o + 2];
    }
  }

  desired.sort((a, b) => a - b);
  const q = (p) => (desired.length ? desired[Math.min(desired.length - 1, Math.floor(p * (desired.length - 1)))] * 1000 : 0);

  return {
    buffer: writeBinaryStl({ positions: outPos, attributes: parsed.attributes }),
    movedCount,
    maxInwardMm,
    maxOutwardMm,
    faceCount: triCount,
    revertedVertices,
    desiredInwardUm: desired.length
      ? { n: desired.length, p50: q(0.5), p90: q(0.9), p95: q(0.95), max: desired[desired.length - 1] * 1000 }
      : { n: 0, p50: 0, p90: 0, p95: 0, max: 0 },
  };
}
