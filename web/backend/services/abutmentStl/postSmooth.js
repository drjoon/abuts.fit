// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (마진 모서리 findFinishCrease · 메시 준비)
// - web/backend/services/abutmentStl/cuffBlend.worker.js (커프 보정 뒤 같은 worker에서 실행)
// - web/backend/tests/unit/postSmooth.test.js
//
// 피니시라인 위 포스트(크라운이 앉는 면)의 계단 결을 없앤다.
// - 마진 모서리 꼭짓점과 그 아래는 하나도 옮기지 않는다.
// - 20° 모서리가 한 바퀴로 안 붙는 둥근 챔퍼는 피니시라인 높이의 바깥 꼭짓점을 메시 변으로 이어 마진으로 쓴다.
// - 나머지 포스트 꼭짓점은 원본 면 안쪽으로만 옮긴다. 새 면의 어느 점도 원본 면 밖으로 나가지 않는다.
// - 삼각형을 한 번 4등분하고, 원본 면에 국소 2차 곡면을 맞춘 뒤 원본 면 안쪽에 들어갈 만큼만 함께 내린다.
// - 슬롯·스크류 채널 입구처럼 30° 넘게 꺾이는 모서리는 디자인으로 보고 그대로 둔다.
// 스크류홀 캡은 이 다듬기 다음에 붙인다. 먼저 붙이면 캡 테두리가 다듬기를 가로막는다.
// - 50µm보다 깊이 들어가야 하는 꼭짓점은 그 자리만 고정한다. 그 때문에 포스트 전체를 건너뛰지 않는다.
import { writeBinaryStl } from "../../utils/screwHoleFill.js";
import { decimatePatch } from "./postDecimate.js";
import { findFinishCrease, finishLineZByAngle, prepareCuffMesh } from "./cuffBlend.js";

export const POST_SMOOTH_VERSION = "post-smooth-1";
/** 이미 다듬은 filled를 다시 받은 경우. 누락이 아니다. */
export const POST_SMOOTH_ALREADY_REASON = "이미 다듬은 포스트입니다.";
/** 이 attribute의 삼각형은 포스트 다듬기 곡면이다. */
export const POST_SMOOTH_PATCH_ATTRIBUTE = 0x5053;

/** 이보다 꺾인 모서리는 디자인 모서리. 포스트 축면→교합면 전이(약 35~41°)는 넘어간다. */
const FEATURE_DEG = 45;
/** 마진 바로 위 수직 칼라·챔퍼에서 숄더로 꺾이는 고리는 디자인 경계로 막지 않는다. */
const MARGIN_COLLAR_HEIGHT_MM = 0.65;
const MARGIN_COLLAR_MAX_DEG = 78;
/** 포스트 전체를 2회 균일 4등분하고, 원본 큰 면(>0.42mm)과 급한 꺾임(>20°) 주변은 1회 더 4등분한다. */
const LARGE_FACE_EDGE_MM = 0.42;
const HOT_EDGE_DEG = 20;
/** 포스트 꼭짓점이 그 각도의 마진 모서리 높이보다 이만큼 넘게 낮으면 포스트가 아니다. */
const BELOW_MARGIN_MM = 0.1;
/** 마진 모서리에서 이 높이까지 원본 → 다듬은 면으로 넘어간다. */
const MARGIN_RAMP_MM = 0.08;
/** 디자인 모서리에서 이 거리까지 원본 → 다듬은 면으로 넘어간다. */
const FEATURE_RAMP_MM = 0.12;
/** 원본 밖으로 나간 양을 덮는 내림 폭. 이 반경 안에서 매끈하게 함께 내린다. */
const LIFT_RADIUS_MM = 0.1;
const LIFT_ROUNDS = 5;
/** 내림으로 안 없어지는 꼭짓점을 고정하고 다시 맞추는 최대 횟수. */
const SETTLE_ATTEMPTS = 6;
/** 한 번에 넘친 양보다 조금 더 내려 반복 횟수를 줄인다. */
const LIFT_OVERSHOOT = 1.2;
/** 한 번 내린 뒤에도 넘친 양이 이 비율 넘게 남으면 그 꼭짓점은 고정한다. */
const STUCK_RATIO = 0.5;
/** 원본 면 밖으로 이만큼도 나가지 않는다(float32 반올림 여유 포함). */
const OUTSIDE_TOL_MM = 2e-5;
/** 이보다 깊이 들어가야 하는 꼭짓점은 안쪽 이동을 15µm 안으로 묶거나(평균 ~3µm) 급한 돌기는 고정한다. */
const MAX_INWARD_MM = 0.015;
/** 스크류 채널 벽과 그 입구 띠 반경. 여기서는 거친 면을 디자인 모서리나 얇은 벽으로 고정하지 않는다. */
const CHANNEL_COLLAR_MAX_R_MM = 1.55;
/** 면 안쪽 이 깊이들에 다른 면(스크류 채널 등)이 먼저 나오면 얇은 벽이라 그 꼭짓점은 고정한다. */
const THIN_PROBE_MM = [0.03, 0.06, 0.1];

const TWO_PI = Math.PI * 2;

class PostSmoothSkip extends Error {
  constructor(reason, detail = {}) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

const skip = (reason, detail) => {
  throw new PostSmoothSkip(reason, detail);
};

/** 피니시라인에 스냅할 때 이 높이 안의 바깥 꼭짓점만 본다. */
const MARGIN_SNAP_MM = 0.3;
/** 스냅한 점 사이를 잇는 경로는 이 높이 안에 둔다. */
const MARGIN_PATH_MM = 0.5;
/** 스크류 채널 안쪽 꼭짓점은 마진이 아니다. */
const MARGIN_MIN_R_MM = 1.45;
const MARGIN_BINS = 180;
const MARGIN_MAX_LINKS = 28;

/**
 * 날카로운 모서리가 없는 둥근 마진. 각도마다 피니시라인에 가장 가까운 바깥 꼭짓점을 고르고,
 * 그 점들을 피니시라인 근처의 메시 변으로 한 바퀴 잇는다. 고리가 안 닫히면 null.
 * @returns {{ loop: number[], zOf: (theta: number) => number, fromFinishLine: true } | null}
 */
function traceFinishMargin(mesh, flZ) {
  const { verts, faces, faceMain } = mesh;
  const nv = verts.length / 3;
  const fc = faces.length / 3;
  const adj = Array.from({ length: nv }, () => []);
  const on = new Uint8Array(nv);
  const seenE = new Set();
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      on[a] = 1;
      on[b] = 1;
      const key = a < b ? a * nv + b : b * nv + a;
      if (seenE.has(key)) continue;
      seenE.add(key);
      adj[a].push(b);
      adj[b].push(a);
    }
  }
  const polar = (v) => {
    const x = verts[v * 3];
    const y = verts[v * 3 + 1];
    return { r: Math.hypot(x, y), z: verts[v * 3 + 2], a: Math.atan2(y, x) };
  };
  const within = (v, win) => {
    if (!on[v]) return false;
    const p = polar(v);
    return p.r >= MARGIN_MIN_R_MM && Math.abs(p.z - flZ(p.a)) <= win;
  };
  const pick = new Int32Array(MARGIN_BINS).fill(-1);
  const pickDz = new Float64Array(MARGIN_BINS).fill(Infinity);
  const pickR = new Float64Array(MARGIN_BINS).fill(-1);
  for (let v = 0; v < nv; v += 1) {
    if (!within(v, MARGIN_SNAP_MM)) continue;
    const p = polar(v);
    const dz = Math.abs(p.z - flZ(p.a));
    const bi = Math.floor((((p.a + Math.PI) / TWO_PI) * MARGIN_BINS) % MARGIN_BINS);
    const bucket = Math.round(dz / 0.05);
    const bestBucket = pick[bi] < 0 ? Infinity : Math.round(pickDz[bi] / 0.05);
    if (pick[bi] < 0 || bucket < bestBucket || (bucket === bestBucket && p.r > pickR[bi])) {
      pick[bi] = v;
      pickDz[bi] = dz;
      pickR[bi] = p.r;
    }
  }
  const seeds = [];
  for (let i = 0; i < MARGIN_BINS; i += 1) {
    if (pick[i] < 0) continue;
    if (seeds[seeds.length - 1] !== pick[i]) seeds.push(pick[i]);
  }
  if (seeds.length > 1 && seeds[0] === seeds[seeds.length - 1]) seeds.pop();
  let maxGapBins = 0;
  let prevBin = -1;
  let firstBin = -1;
  for (let i = 0; i < MARGIN_BINS; i += 1) {
    if (pick[i] < 0) continue;
    if (firstBin < 0) firstBin = i;
    if (prevBin >= 0) maxGapBins = Math.max(maxGapBins, i - prevBin);
    prevBin = i;
  }
  if (firstBin >= 0 && prevBin >= 0) maxGapBins = Math.max(maxGapBins, firstBin + MARGIN_BINS - prevBin);
  if (seeds.length < 24 || (maxGapBins / MARGIN_BINS) * 360 > 12) return null;

  const stamp = new Int32Array(nv);
  const prev = new Int32Array(nv);
  const depth = new Int32Array(nv);
  let token = 1;
  const link = (a, b) => {
    if (a === b) return [a];
    token += 1;
    if (token === 0x7fffffff) {
      stamp.fill(0);
      token = 1;
    }
    const q = [a];
    stamp[a] = token;
    prev[a] = -1;
    depth[a] = 0;
    for (let qi = 0; qi < q.length; qi += 1) {
      const v = q[qi];
      if (depth[v] >= MARGIN_MAX_LINKS) continue;
      for (const w of adj[v]) {
        if (stamp[w] === token) continue;
        if (w !== b && !within(w, MARGIN_PATH_MM)) continue;
        stamp[w] = token;
        prev[w] = v;
        depth[w] = depth[v] + 1;
        if (w === b) {
          const path = [b];
          let c = b;
          while (c !== a) {
            c = prev[c];
            path.push(c);
            if (path.length > MARGIN_MAX_LINKS + 2) return null;
          }
          path.reverse();
          return path;
        }
        q.push(w);
      }
    }
    return null;
  };

  const loop = [];
  for (let i = 0; i < seeds.length; i += 1) {
    const path = link(seeds[i], seeds[(i + 1) % seeds.length]);
    if (!path) return null;
    for (let k = 0; k < path.length - 1; k += 1) loop.push(path[k]);
  }
  if (loop.length < 24) return null;

  const angs = loop.map((v) => polar(v).a);
  const steps = angs.map((a, i) => {
    let d = angs[(i + 1) % angs.length] - a;
    if (d > Math.PI) d -= TWO_PI;
    if (d < -Math.PI) d += TWO_PI;
    return d;
  });
  const turn = steps.reduce((s, d) => s + d, 0);
  if (Math.abs(Math.abs(turn) - TWO_PI) > 0.35) return null;
  const dir = Math.sign(turn) || 1;
  let progress = 0;
  let peak = 0;
  let fold = 0;
  for (const d of steps) {
    progress += d * dir;
    if (progress >= peak) peak = progress;
    else fold = Math.max(fold, peak - progress);
  }
  if (fold > 0.7) return null;

  const binZ = new Float64Array(360);
  const binN = new Uint16Array(360);
  for (const v of loop) {
    const p = polar(v);
    const bi = Math.floor((((p.a + Math.PI) / TWO_PI) * 360) % 360);
    binZ[bi] += p.z;
    binN[bi] += 1;
  }
  const zRing = new Float64Array(360);
  for (let i = 0; i < 360; i += 1) {
    if (binN[i]) {
      zRing[i] = binZ[i] / binN[i];
      continue;
    }
    for (let d = 1; d < 180; d += 1) {
      const left = (i - d + 360) % 360;
      const right = (i + d) % 360;
      if (binN[left]) {
        zRing[i] = binZ[left] / binN[left];
        break;
      }
      if (binN[right]) {
        zRing[i] = binZ[right] / binN[right];
        break;
      }
    }
  }
  const zOf = (theta) => {
    const t = ((((theta + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI / TWO_PI) * 360;
    const i = Math.floor(t) % 360;
    const f = t - Math.floor(t);
    return zRing[i] * (1 - f) + zRing[(i + 1) % 360] * f;
  };
  return { loop, zOf, fromFinishLine: true };
}

const smoothstep5 = (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * x * (10 + x * (-15 + 6 * x));
};

function faceNormalArea(P, a, b, c, out, o) {
  const ux = P[b * 3] - P[a * 3];
  const uy = P[b * 3 + 1] - P[a * 3 + 1];
  const uz = P[b * 3 + 2] - P[a * 3 + 2];
  const vx = P[c * 3] - P[a * 3];
  const vy = P[c * 3 + 1] - P[a * 3 + 1];
  const vz = P[c * 3 + 2] - P[a * 3 + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len > 0) {
    out[o] = nx / len;
    out[o + 1] = ny / len;
    out[o + 2] = nz / len;
  } else {
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
  }
  return len / 2;
}

/** 균일 격자. 점 질의는 주변 27칸. */
class PointGrid {
  constructor(P, ids, cell) {
    this.P = P;
    this.cell = cell;
    this.map = new Map();
    for (const i of ids) {
      const k = this.key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      const list = this.map.get(k);
      if (list) list.push(i);
      else this.map.set(k, [i]);
    }
  }

  key(x, y, z) {
    const c = this.cell;
    return `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`;
  }

  /** 반경 r(≤ cell) 안의 점 */
  forEachNear(x, y, z, r, fn) {
    const c = this.cell;
    const ix = Math.floor(x / c);
    const iy = Math.floor(y / c);
    const iz = Math.floor(z / c);
    const r2 = r * r;
    const P = this.P;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = this.map.get(`${ix + dx},${iy + dy},${iz + dz}`);
          if (!list) continue;
          for (const j of list) {
            const ex = P[j * 3] - x;
            const ey = P[j * 3 + 1] - y;
            const ez = P[j * 3 + 2] - z;
            const d2 = ex * ex + ey * ey + ez * ez;
            if (d2 <= r2) fn(j, d2);
          }
        }
      }
    }
  }
}

/** 점 p에서 삼각형 abc까지 가장 가까운 점. 영역 코드: 0=면, 1..3=모서리(ab,bc,ca), 4..6=꼭짓점(a,b,c) */
function closestOnTriangle(px, py, pz, A, B, C, out) {
  const abx = B[0] - A[0], aby = B[1] - A[1], abz = B[2] - A[2];
  const acx = C[0] - A[0], acy = C[1] - A[1], acz = C[2] - A[2];
  const apx = px - A[0], apy = py - A[1], apz = pz - A[2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return set(out, A[0], A[1], A[2], 4);
  const bpx = px - B[0], bpy = py - B[1], bpz = pz - B[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return set(out, B[0], B[1], B[2], 5);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return set(out, A[0] + v * abx, A[1] + v * aby, A[2] + v * abz, 1);
  }
  const cpx = px - C[0], cpy = py - C[1], cpz = pz - C[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return set(out, C[0], C[1], C[2], 6);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return set(out, A[0] + w * acx, A[1] + w * acy, A[2] + w * acz, 3);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return set(out, B[0] + w * (C[0] - B[0]), B[1] + w * (C[1] - B[1]), B[2] + w * (C[2] - B[2]), 2);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return set(out, A[0] + abx * v + acx * w, A[1] + aby * v + acy * w, A[2] + abz * v + acz * w, 0);
}

function set(out, x, y, z, region) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return region;
}

/**
 * 원본 메시에 대한 부호 거리(밖 +). 부호는 가장 가까운 요소의 각도 가중 의사 법선으로 정한다.
 * 질의점은 원본 면 근처(수 µm)라서, 그 점이 나온 원본 면에 닿는 면만 본다. 얇은 벽은 따로 막는다(THIN_PROBE_MM).
 */
class SignedDistance {
  constructor(verts, faces, faceMain) {
    this.verts = verts;
    this.faces = faces;
    this.faceMain = faceMain;
    const fc = faces.length / 3;
    const nv = verts.length / 3;
    this.fn = new Float64Array(fc * 3);
    this.vn = new Float64Array(nv * 3);
    this.vertFaces = Array.from({ length: nv }, () => []);
    this.edgeN = new Map();
    this.nv = nv;
    for (let f = 0; f < fc; f += 1) {
      if (!faceMain[f]) continue;
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      faceNormalArea(verts, a, b, c, this.fn, f * 3);
      const ids = [a, b, c];
      for (let k = 0; k < 3; k += 1) {
        const v = ids[k];
        const p = ids[(k + 1) % 3];
        const q = ids[(k + 2) % 3];
        const e1x = verts[p * 3] - verts[v * 3], e1y = verts[p * 3 + 1] - verts[v * 3 + 1], e1z = verts[p * 3 + 2] - verts[v * 3 + 2];
        const e2x = verts[q * 3] - verts[v * 3], e2y = verts[q * 3 + 1] - verts[v * 3 + 1], e2z = verts[q * 3 + 2] - verts[v * 3 + 2];
        const l1 = Math.hypot(e1x, e1y, e1z) || 1;
        const l2 = Math.hypot(e2x, e2y, e2z) || 1;
        const cos = Math.max(-1, Math.min(1, (e1x * e2x + e1y * e2y + e1z * e2z) / (l1 * l2)));
        const ang = Math.acos(cos);
        this.vn[v * 3] += ang * this.fn[f * 3];
        this.vn[v * 3 + 1] += ang * this.fn[f * 3 + 1];
        this.vn[v * 3 + 2] += ang * this.fn[f * 3 + 2];
        this.vertFaces[v].push(f);
        const key = v < p ? v * nv + p : p * nv + v;
        const en = this.edgeN.get(key);
        if (en) {
          en[0] += this.fn[f * 3];
          en[1] += this.fn[f * 3 + 1];
          en[2] += this.fn[f * 3 + 2];
        } else this.edgeN.set(key, [this.fn[f * 3], this.fn[f * 3 + 1], this.fn[f * 3 + 2]]);
      }
    }
    this.ringCache = new Map();
    this.cp = new Float64Array(3);
    this.A = new Float64Array(3);
    this.B = new Float64Array(3);
    this.C = new Float64Array(3);
  }

  /** 원본 면 f와 꼭짓점을 나눠 가진 면들. 몇 µm 안쪽 점의 가장 가까운 면은 이 안에 있다. */
  ring(f) {
    let r = this.ringCache.get(f);
    if (r) return r;
    const { faces, vertFaces } = this;
    const set = new Set();
    for (let k = 0; k < 3; k += 1) for (const g of vertFaces[faces[f * 3 + k]]) set.add(g);
    r = Int32Array.from(set);
    this.ringCache.set(f, r);
    return r;
  }

  query(x, y, z, parentFace) {
    return this.nearest(x, y, z, this.ring(parentFace));
  }

  /** 위상과 상관없이 가까운 면 전부(얇은 벽 뒤 다른 면까지) 본다. */
  queryGlobal(x, y, z) {
    if (!this.grid) {
      const { verts, faces } = this;
      const cell = THIN_PROBE_MM.at(-1);
      this.gridCell = cell;
      this.grid = new Map();
      for (let f = 0; f < faces.length / 3; f += 1) {
        if (!this.faceMain[f]) continue;
        const a0 = faces[f * 3] * 3;
        const b0 = faces[f * 3 + 1] * 3;
        const c0 = faces[f * 3 + 2] * 3;
        const cx = (verts[a0] + verts[b0] + verts[c0]) / 3;
        const cy = (verts[a0 + 1] + verts[b0 + 1] + verts[c0 + 1]) / 3;
        const rc = Math.hypot(cx, cy);
        if (
          rc > 1e-6 &&
          rc <= 2.0 &&
          -(this.fn[f * 3] * cx + this.fn[f * 3 + 1] * cy) / rc >= 0.7 &&
          Math.abs(this.fn[f * 3 + 2]) <= 0.65
        ) {
          continue;
        }
        const lo = [0, 1, 2].map((q) => Math.floor(Math.min(verts[faces[f * 3] * 3 + q], verts[faces[f * 3 + 1] * 3 + q], verts[faces[f * 3 + 2] * 3 + q]) / cell));
        const hi = [0, 1, 2].map((q) => Math.floor(Math.max(verts[faces[f * 3] * 3 + q], verts[faces[f * 3 + 1] * 3 + q], verts[faces[f * 3 + 2] * 3 + q]) / cell));
        for (let i = lo[0]; i <= hi[0]; i += 1) {
          for (let j = lo[1]; j <= hi[1]; j += 1) {
            for (let k = lo[2]; k <= hi[2]; k += 1) {
              const key = `${i},${j},${k}`;
              const list = this.grid.get(key);
              if (list) list.push(f);
              else this.grid.set(key, [f]);
            }
          }
        }
      }
    }
    const c = this.gridCell;
    const ix = Math.floor(x / c);
    const iy = Math.floor(y / c);
    const iz = Math.floor(z / c);
    const cand = new Set();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const f of this.grid.get(`${ix + dx},${iy + dy},${iz + dz}`) || []) cand.add(f);
        }
      }
    }
    return this.nearest(x, y, z, cand);
  }

  nearest(x, y, z, candidates) {
    const { verts, faces, cp, A, B, C, nv } = this;
    let best = Infinity;
    let sign = 1;
    for (const f of candidates) {
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      for (let k = 0; k < 3; k += 1) {
        A[k] = verts[a * 3 + k];
        B[k] = verts[b * 3 + k];
        C[k] = verts[c * 3 + k];
      }
      const region = closestOnTriangle(x, y, z, A, B, C, cp);
      const dx = x - cp[0];
      const dy = y - cp[1];
      const dz = z - cp[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= best) continue;
      best = d2;
      let n;
      if (region === 0) n = [this.fn[f * 3], this.fn[f * 3 + 1], this.fn[f * 3 + 2]];
      else if (region >= 4) {
        const v = [a, b, c][region - 4];
        n = [this.vn[v * 3], this.vn[v * 3 + 1], this.vn[v * 3 + 2]];
      } else {
        const p = [a, b, c][region - 1];
        const q = [a, b, c][region % 3];
        n = this.edgeN.get(p < q ? p * nv + q : q * nv + p);
      }
      sign = dx * n[0] + dy * n[1] + dz * n[2] >= 0 ? 1 : -1;
    }
    return Math.sqrt(best) * sign;
  }
}

/**
 * 크라운이 앉는 포스트 면을 고른다. 마진 모서리 바로 위 면에서 시작해 디자인 모서리(45° 초과)를 넘지 않고 이어진 면만.
 * 스크류 채널 벽·슬롯 벽은 날카로운 모서리 너머라 들어오지 않는다. 홀은 이 단계에서 열려 있다.
 */
function selectPostRegion(mesh, crease, fn) {
  const { verts, faces, faceMain } = mesh;
  const fc = faces.length / 3;
  const nv = verts.length / 3;
  const edgeFaces = new Map();
  for (let f = 0; f < fc; f += 1) {
    if (!faceMain[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      const key = a < b ? a * nv + b : b * nv + a;
      const list = edgeFaces.get(key);
      if (list) list.push(f);
      else edgeFaces.set(key, [f]);
    }
  }
  const creaseKeys = new Set();
  const loop = crease.loop;
  const creaseSet = new Set(loop);
  const inRegion = new Uint8Array(fc);
  const stack = [];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const key = a < b ? a * nv + b : b * nv + a;
    creaseKeys.add(key);
    // 모서리 양쪽 면 중 셋째 꼭짓점이 모서리보다 높은 쪽이 포스트
    for (const f of edgeFaces.get(key) || []) {
      let third = -1;
      for (let k = 0; k < 3; k += 1) if (faces[f * 3 + k] !== a && faces[f * 3 + k] !== b) third = faces[f * 3 + k];
      const z = verts[third * 3 + 2];
      const th = Math.atan2(verts[third * 3 + 1], verts[third * 3]);
      // 마진이 각도마다 높이가 다르면 변의 가운데 높이보다 커프 쪽 꼭짓점이 더 높을 수 있다. 그 각도의 마진 높이로 가른다.
      if (z > crease.zOf(th) - 0.02 && !inRegion[f]) {
        inRegion[f] = 1;
        stack.push(f);
      }
    }
  }
  if (!stack.length) skip("마진 모서리 위 포스트 면을 찾지 못했습니다.");
  const cosFeature = Math.cos((FEATURE_DEG * Math.PI) / 180);
  const cosCollar = Math.cos((MARGIN_COLLAR_MAX_DEG * Math.PI) / 180);
  // 스크류홀 입구가 완만하게 이어지면 채널 벽을 타고 커넥션까지 번진다. 마진 모서리 아래로 내려가는 면은 영역에 넣지 않는다.
  const belowMargin = (g) => {
    for (let k = 0; k < 3; k += 1) {
      const v = faces[g * 3 + k];
      if (creaseSet.has(v)) continue;
      if (verts[v * 3 + 2] < crease.zOf(Math.atan2(verts[v * 3 + 1], verts[v * 3])) - BELOW_MARGIN_MM) return true;
    }
    return false;
  };
  while (stack.length) {
    const f = stack.pop();
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      const key = a < b ? a * nv + b : b * nv + a;
      if (creaseKeys.has(key)) continue;
      const list = edgeFaces.get(key) || [];
      if (list.length !== 2) continue;
      const g = list[0] === f ? list[1] : list[0];
      if (inRegion[g]) continue;
      if (belowMargin(g)) continue;
      const ga = faces[g * 3] * 3, gb = faces[g * 3 + 1] * 3, gc = faces[g * 3 + 2] * 3;
      const gcx = (verts[ga] + verts[gb] + verts[gc]) / 3;
      const gcy = (verts[ga + 1] + verts[gb + 1] + verts[gc + 1]) / 3;
      const grc = Math.hypot(gcx, gcy);
      if (
        grc > 1e-6 &&
        grc <= 1.65 &&
        -(fn[g * 3] * gcx + fn[g * 3 + 1] * gcy) / grc >= 0.65 &&
        Math.abs(fn[g * 3 + 2]) <= 0.7
      ) {
        continue;
      }
      const dot = fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2];
      const mz = (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2;
      const mth = Math.atan2((verts[a * 3 + 1] + verts[b * 3 + 1]) / 2, (verts[a * 3] + verts[b * 3]) / 2);
      const dz = mz - crease.zOf(mth);
      const minCos = dz > 0 && dz < MARGIN_COLLAR_HEIGHT_MM && fn[g * 3 + 2] >= 0 ? cosCollar : cosFeature;
      if (dot < minCos) continue;
      inRegion[g] = 1;
      stack.push(g);
    }
  }
  for (let f = 0; f < fc; f += 1) {
    if (!inRegion[f]) continue;
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k];
      if (creaseSet.has(v)) continue;
      const theta = Math.atan2(verts[v * 3 + 1], verts[v * 3]);
      const below = crease.zOf(theta) - verts[v * 3 + 2];
      if (below > BELOW_MARGIN_MM) {
        skip("마진 모서리가 끊겨 포스트 면이 커프 아래로 이어집니다.", {
          belowUm: Math.round(below * 1e3),
          at: [verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]].map((x) => Math.round(x * 1e3) / 1e3),
        });
      }
    }
  }
  return { inRegion, edgeFaces, creaseKeys };
}

/**
 * 영역 삼각형을 한 번 4등분한다. 원본 한 칸이 곡면을 따라가기엔 거칠어서다.
 * 고정 꼭짓점 둘을 잇는 모서리(마진 모서리·영역 경계)는 나누지 않는다. 나누면 바깥 면과 T자 이음이 생긴다.
 * 새 점은 원본 모서리 가운데라 원본 면 위에 있다.
 */
function refineRegion(pos, tri, fixed) {
  const nv = pos.length / 3;
  const tc = tri.length / 4;
  const keyOf = (a, b) => (a < b ? a * nv + b : b * nv + a);
  const splittable = (a, b) => !(fixed[a] && fixed[b]);
  const mid = new Map();
  const next = Array.from(pos);
  const midOf = (a, b) => {
    const key = keyOf(a, b);
    let m = mid.get(key);
    if (m === undefined) {
      m = next.length / 3;
      next.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
      mid.set(key, m);
    }
    return m;
  };
  const out = [];
  for (let t = 0; t < tc; t += 1) {
    const v = [tri[t * 4], tri[t * 4 + 1], tri[t * 4 + 2]];
    const orig = tri[t * 4 + 3];
    const split = [0, 1, 2].map((k) => splittable(v[k], v[(k + 1) % 3]));
    const n = split.filter(Boolean).length;
    if (n === 0) {
      out.push(v[0], v[1], v[2], orig);
    } else if (n === 1) {
      const k = split.indexOf(true);
      const a = v[k];
      const b = v[(k + 1) % 3];
      const c = v[(k + 2) % 3];
      const m = midOf(a, b);
      out.push(a, m, c, orig, m, b, c, orig);
    } else if (n === 2) {
      // 나누지 않는 모서리 c→a의 맞은편부터 세 조각
      const k = split.indexOf(false);
      const c = v[k];
      const a = v[(k + 1) % 3];
      const b = v[(k + 2) % 3];
      const ab = midOf(a, b);
      const bc = midOf(b, c);
      out.push(ab, b, bc, orig);
      const d1 = (pos[a * 3] - pos[bc * 3]) ** 2 + (pos[a * 3 + 1] - pos[bc * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[bc * 3 + 2]) ** 2;
      const d2 = (pos[c * 3] - pos[ab * 3]) ** 2 + (pos[c * 3 + 1] - pos[ab * 3 + 1]) ** 2 + (pos[c * 3 + 2] - pos[ab * 3 + 2]) ** 2;
      if (d1 <= d2) out.push(c, a, bc, orig, a, ab, bc, orig);
      else out.push(c, a, ab, orig, c, ab, bc, orig);
    } else {
      const [a, b, c] = v;
      const ab = midOf(a, b);
      const bc = midOf(b, c);
      const ca = midOf(c, a);
      out.push(a, ab, ca, orig, ab, b, bc, orig, ca, bc, c, orig, ab, bc, ca, orig);
    }
  }
  const P = Float64Array.from(next);
  const nvOut = P.length / 3;
  const tcOut = out.length / 4;
  const eMap = new Map();
  for (let t = 0; t < tcOut; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = out[t * 4 + k];
      const b = out[t * 4 + ((k + 1) % 3)];
      const key = a < b ? a * nvOut + b : b * nvOut + a;
      const list = eMap.get(key);
      if (list) list.push(t);
      else eMap.set(key, [t]);
    }
  }
  const cosAngleAt = (u, v, w) => {
    const ux = P[u * 3] - P[v * 3], uy = P[u * 3 + 1] - P[v * 3 + 1], uz = P[u * 3 + 2] - P[v * 3 + 2];
    const wx = P[w * 3] - P[v * 3], wy = P[w * 3 + 1] - P[v * 3 + 1], wz = P[w * 3 + 2] - P[v * 3 + 2];
    const l = Math.hypot(ux, uy, uz) * Math.hypot(wx, wy, wz);
    return l > 0 ? (ux * wx + uy * wy + uz * wz) / l : 1;
  };
  for (const [, ts] of eMap) {
    if (ts.length !== 2) continue;
    const [t1, t2] = ts;
    if (out[t1 * 4 + 3] !== out[t2 * 4 + 3]) continue;
    const v1 = [out[t1 * 4], out[t1 * 4 + 1], out[t1 * 4 + 2]];
    const v2 = [out[t2 * 4], out[t2 * 4 + 1], out[t2 * 4 + 2]];
    let i1 = -1;
    for (let k = 0; k < 3; k += 1) if (!v2.includes(v1[k])) i1 = k;
    let i2 = -1;
    for (let k = 0; k < 3; k += 1) if (!v1.includes(v2[k])) i2 = k;
    if (i1 < 0 || i2 < 0) continue;
    const c = v1[i1], a = v1[(i1 + 1) % 3], b = v1[(i1 + 2) % 3], d = v2[i2];
    if (cosAngleAt(a, c, b) < -0.92 && cosAngleAt(b, d, a) < -0.92) {
      out[t1 * 4] = c;
      out[t1 * 4 + 1] = a;
      out[t1 * 4 + 2] = d;
      out[t2 * 4] = d;
      out[t2 * 4 + 1] = b;
      out[t2 * 4 + 2] = c;
    }
  }
  return { pos: P, tri: out };
}

/**
 * @param {Buffer} buffer filled STL(커프 보정 뒤)
 * @param {{ finishLine: object|null }} options
 * @returns {{ ok: boolean, status: "applied"|"skipped", reason: string|null, buffer?: Buffer, detail: object }}
 */
export function smoothPostAboveFinishLine(buffer, options = {}) {
  try {
    return run(buffer, options);
  } catch (error) {
    if (error instanceof PostSmoothSkip) {
      return { ok: false, status: "skipped", reason: error.reason, detail: error.detail };
    }
    return { ok: false, status: "failed", reason: String(error?.message || error), detail: {} };
  }
}

function run(buffer, { finishLine }) {
  const started = Date.now();
  const stages = {};
  let mark = started;
  const lap = (name) => {
    const now = Date.now();
    stages[name] = now - mark;
    mark = now;
  };
  const flZ = finishLineZByAngle(finishLine);
  if (!flZ) skip("피니시라인이 없습니다.");
  const { mesh } = prepareCuffMesh(buffer);
  // Re 재디자인은 이미 다듬은 filled를 다시 받는다. 또 다듬으면 안쪽으로 누적해 들어간다.
  if (mesh.faceAttr.some((a) => a === POST_SMOOTH_PATCH_ATTRIBUTE)) skip(POST_SMOOTH_ALREADY_REASON);
  const sharpCrease = findFinishCrease(mesh, flZ) || (mesh.faceAttr.some((a) => a !== 0) ? findFinishCrease(mesh, flZ, { allowWideFallback: true }) : null);
  const crease = sharpCrease || traceFinishMargin(mesh, flZ) || findFinishCrease(mesh, flZ, { allowWideFallback: true });
  if (!crease) skip("마진 모서리를 찾지 못했습니다.");
  lap("prepare");
  const { verts, faces, faceAttr, faceMain } = mesh;
  const fc = faces.length / 3;
  const nv0 = verts.length / 3;
  const P0 = Float64Array.from(verts);
  const fn = new Float64Array(fc * 3);
  const farea = new Float64Array(fc);
  for (let f = 0; f < fc; f += 1) {
    if (faceMain[f]) farea[f] = faceNormalArea(P0, faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2], fn, f * 3);
  }
  const { inRegion, edgeFaces, creaseKeys } = selectPostRegion(mesh, crease, fn);

  // 고정: 마진 모서리, 디자인 모서리(30° 초과), 영역 경계. 영역 밖 꼭짓점은 애초에 안 움직인다.
  const fixed = new Uint8Array(nv0);
  const feature = new Uint8Array(nv0);
  for (const v of crease.loop) fixed[v] = 1;
  // 피니시라인보다 아래는 마진·커프다. 스냅 고리가 곡선보다 조금 낮아도 그 아래 꼭짓점은 움직이지 않는다.
  for (let v = 0; v < nv0; v += 1) {
    if (fixed[v]) continue;
    const z = P0[v * 3 + 2];
    if (z < crease.zOf(Math.atan2(P0[v * 3 + 1], P0[v * 3])) - 0.005) fixed[v] = 1;
  }
  const cosFeature = Math.cos((FEATURE_DEG * Math.PI) / 180);
  /** 원본 영역 면 이웃(디자인 모서리·경계는 -1). 국소 곡면 맞춤 범위를 넓힐 때 쓴다. */
  const nbr = new Int32Array(fc * 3).fill(-1);
  const regionEdges = new Map();
  for (const [key, fs] of edgeFaces) {
    const inside = fs.filter((f) => inRegion[f]);
    if (!inside.length) continue;
    const a = Math.floor(key / nv0);
    const b = key - a * nv0;
    if (inside.length !== 2 || fs.length !== 2 || creaseKeys.has(key)) {
      fixed[a] = 1;
      fixed[b] = 1;
      continue;
    }
    const [f, g] = inside;
    const dot = fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2];
    regionEdges.set(key, { a, b, w: (farea[f] + farea[g]) / 3 });
    if (dot < cosFeature) {
      const mx = (P0[a * 3] + P0[b * 3]) / 2;
      const my = (P0[a * 3 + 1] + P0[b * 3 + 1]) / 2;
      const mz = (P0[a * 3 + 2] + P0[b * 3 + 2]) / 2;
      const mr = Math.hypot(mx, my);
      const mth = Math.atan2(my, mx);
      const isMarginCollar = mz - crease.zOf(mth) < MARGIN_COLLAR_HEIGHT_MM;
      const isChannelOpening = mr < CHANNEL_COLLAR_MAX_R_MM && fn[f * 3 + 2] > -0.1 && fn[g * 3 + 2] > -0.1;
      if (!isMarginCollar && !isChannelOpening) {
        fixed[a] = 1;
        fixed[b] = 1;
        feature[a] = 1;
        feature[b] = 1;
        continue;
      }
      if (!isChannelOpening) continue;
    }
    for (const [p, q] of [[f, g], [g, f]]) {
      for (let k = 0; k < 3; k += 1) {
        const x = faces[p * 3 + k];
        const y = faces[p * 3 + ((k + 1) % 3)];
        if ((x < y ? x * nv0 + y : y * nv0 + x) === key) nbr[p * 3 + k] = q;
      }
    }
  }

  const regionFaces = [];
  for (let f = 0; f < fc; f += 1) if (inRegion[f]) regionFaces.push(f);

  // 얇은 벽: 안쪽으로 조금만 들어가도 다른 면(스크류 채널 등)이 나오면 그 꼭짓점은 디자인 모서리처럼 고정한다.
  const sd = new SignedDistance(P0, faces, faceMain);
  const vnr = new Float64Array(nv0 * 3);
  for (const f of regionFaces) {
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k];
      for (let q = 0; q < 3; q += 1) vnr[v * 3 + q] += fn[f * 3 + q] * farea[f];
    }
  }
  let thinVertices = 0;
  const probed = new Uint8Array(nv0);
  for (const f of regionFaces) {
    for (let k = 0; k < 3; k += 1) {
      const v = faces[f * 3 + k];
      if (probed[v] || fixed[v]) continue;
      probed[v] = 1;
      // 마진 쐐기 바로 위(수직 칼라 등)는 안쪽 탐사선이 바로 아래 커프 면에 닿으므로 얇은 벽 판정에서 뺀다.
      if (P0[v * 3 + 2] - crease.zOf(Math.atan2(P0[v * 3 + 1], P0[v * 3])) < 0.25) continue;
      const l = Math.hypot(vnr[v * 3], vnr[v * 3 + 1], vnr[v * 3 + 2]) || 1;
      const thin = THIN_PROBE_MM.some((depth) => {
        const d = sd.queryGlobal(
          P0[v * 3] - (vnr[v * 3] / l) * depth,
          P0[v * 3 + 1] - (vnr[v * 3 + 1] / l) * depth,
          P0[v * 3 + 2] - (vnr[v * 3 + 2] / l) * depth,
        );
        return d > -0.6 * depth;
      });
      if (!thin) continue;
      fixed[v] = 1;
      feature[v] = 1;
      thinVertices += 1;
    }
  }

  lap("region");
  const rfaces = [];
  for (const f of regionFaces) rfaces.push(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2], f);
  const refined1 = refineRegion(P0, rfaces, fixed);
  const fixed2 = new Uint8Array(refined1.pos.length / 3);
  for (let v = 0; v < fixed.length; v += 1) if (fixed[v]) fixed2[v] = 1;
  const refined2 = refineRegion(refined1.pos, refined1.tri, fixed2);
  const cosHot = Math.cos((HOT_EDGE_DEG * Math.PI) / 180);
  const origHot = new Uint8Array(fc);
  for (const [key] of regionEdges) {
    const [f, g] = edgeFaces.get(key);
    if (fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2] < cosHot) {
      origHot[f] = 1;
      origHot[g] = 1;
    }
  }
  for (const f of regionFaces) {
    const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3;
    const l1 = Math.hypot(P0[a] - P0[b], P0[a + 1] - P0[b + 1], P0[a + 2] - P0[b + 2]);
    const l2 = Math.hypot(P0[b] - P0[c], P0[b + 1] - P0[c + 1], P0[b + 2] - P0[c + 2]);
    const l3 = Math.hypot(P0[c] - P0[a], P0[c + 1] - P0[a + 1], P0[c + 2] - P0[a + 2]);
    if (Math.max(l1, l2, l3) > LARGE_FACE_EDGE_MM) origHot[f] = 1;
  }
  {
    const prevHot = Uint8Array.from(origHot);
    for (const f of regionFaces) {
      if (!prevHot[f]) continue;
      for (let k = 0; k < 3; k += 1) if (nbr[f * 3 + k] >= 0) origHot[nbr[f * 3 + k]] = 1;
    }
  }
  const nv2 = refined2.pos.length / 3;
  const tc2 = refined2.tri.length / 4;
  const hotVert2 = new Uint8Array(nv2);
  for (let t = 0; t < tc2; t += 1) {
    if (!origHot[refined2.tri[t * 4 + 3]]) continue;
    hotVert2[refined2.tri[t * 4]] = 1;
    hotVert2[refined2.tri[t * 4 + 1]] = 1;
    hotVert2[refined2.tri[t * 4 + 2]] = 1;
  }
  const fixed3 = new Uint8Array(nv2);
  for (let v = 0; v < nv2; v += 1) {
    if ((v < fixed.length && fixed[v]) || !hotVert2[v]) fixed3[v] = 1;
  }
  const refined = refineRegion(refined2.pos, refined2.tri, fixed3);
  const pos = refined.pos;
  const tri = refined.tri;
  const nv = pos.length / 3;
  const tc = tri.length / 4;
  lap("refine");

  // 영역 꼭짓점, 각 꼭짓점이 놓인 원본 면(칼라 경계 꼭짓점은 숄더 쪽 면을 일관되게 쓴다)
  const vOrig = new Int32Array(nv).fill(-1);
  for (let t = 0; t < tc; t += 1) {
    const orig = tri[t * 4 + 3];
    for (let k = 0; k < 3; k += 1) {
      const v = tri[t * 4 + k];
      if (vOrig[v] < 0 || fn[orig * 3 + 2] > fn[vOrig[v] * 3 + 2]) vOrig[v] = orig;
    }
  }
  const regionVerts = [];
  for (let v = 0; v < nv; v += 1) if (vOrig[v] >= 0) regionVerts.push(v);
  const isFixed = (v) => v < nv0 && fixed[v] === 1;

  // 원본 → 다듬은 면 전환 가중치: 마진 모서리 위 높이, 디자인 모서리(·고정한 꼭짓점)까지 거리
  const featureIds = [];
  for (let v = 0; v < nv0; v += 1) if (feature[v] && vOrig[v] >= 0) featureIds.push(v);
  const marginRamp = new Float64Array(nv);
  for (const v of regionVerts) {
    if (isFixed(v)) continue;
    marginRamp[v] = smoothstep5((pos[v * 3 + 2] - crease.zOf(Math.atan2(pos[v * 3 + 1], pos[v * 3]))) / MARGIN_RAMP_MM);
  }
  const ramp = new Float64Array(nv);
  const computeRamp = (ids) => {
    const grid = new PointGrid(pos, ids, FEATURE_RAMP_MM);
    for (const v of regionVerts) {
      if (!(marginRamp[v] > 0)) {
        ramp[v] = 0;
        continue;
      }
      let df2 = FEATURE_RAMP_MM * FEATURE_RAMP_MM;
      grid.forEachNear(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], FEATURE_RAMP_MM, (_, d2) => {
        if (d2 < df2) df2 = d2;
      });
      ramp[v] = marginRamp[v] * smoothstep5(Math.sqrt(df2) / FEATURE_RAMP_MM);
    }
  };
  computeRamp(featureIds);
  lap("ramp");

  // 꼭짓점 법선(SN): 인접 면 법선(넓이 가중)을 구하고 메시 이웃으로 매끈하게 편다.
  const SN = new Float64Array(nv * 3);
  for (let t = 0; t < tc; t += 1) {
    const orig = tri[t * 4 + 3];
    const nx = fn[orig * 3], ny = fn[orig * 3 + 1], nz = fn[orig * 3 + 2];
    const w = farea[orig];
    for (let k = 0; k < 3; k += 1) {
      const v = tri[t * 4 + k];
      SN[v * 3] += nx * w;
      SN[v * 3 + 1] += ny * w;
      SN[v * 3 + 2] += nz * w;
    }
  }
  for (const v of regionVerts) {
    const l = Math.hypot(SN[v * 3], SN[v * 3 + 1], SN[v * 3 + 2]);
    if (!(l > 0)) {
      ramp[v] = 0;
      continue;
    }
    SN[v * 3] /= l;
    SN[v * 3 + 1] /= l;
    SN[v * 3 + 2] /= l;
  }
  const vAdj = Array.from({ length: nv }, () => []);
  {
    const seen = new Set();
    for (let t = 0; t < tc; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const a = tri[t * 4 + k], b = tri[t * 4 + ((k + 1) % 3)];
        const key = a < b ? a * nv + b : b * nv + a;
        if (seen.has(key)) continue;
        seen.add(key);
        vAdj[a].push(b);
        vAdj[b].push(a);
      }
    }
  }
  {
    let curSN = SN;
    for (let pass = 0; pass < 8; pass += 1) {
      const nextSN = Float64Array.from(curSN);
      for (const v of regionVerts) {
        if (ramp[v] <= 0) continue;
        const nbs = vAdj[v];
        if (!nbs.length) continue;
        let nx = curSN[v * 3], ny = curSN[v * 3 + 1], nz = curSN[v * 3 + 2];
        for (const u of nbs) {
          if (ramp[u] <= 0) continue;
          nx += curSN[u * 3];
          ny += curSN[u * 3 + 1];
          nz += curSN[u * 3 + 2];
        }
        const l = Math.hypot(nx, ny, nz) || 1;
        nextSN[v * 3] = nx / l;
        nextSN[v * 3 + 1] = ny / l;
        nextSN[v * 3 + 2] = nz / l;
      }
      curSN = nextSN;
    }
    SN.set(curSN);
  }
  // 법선 방향 페어링: 가우시안 커널로 계단 결을 먼저 평균한 뒤, 메시 이웃으로 매끈하게 편다.
  const S = Float64Array.from(pos);
  {
    const sGrid = new PointGrid(pos, regionVerts, 0.25);
    const inv2s = 1 / (0.18 * 0.18);
    for (const v of regionVerts) {
      if (ramp[v] <= 0) continue;
      const qx = pos[v * 3], qy = pos[v * 3 + 1], qz = pos[v * 3 + 2];
      const nx = SN[v * 3], ny = SN[v * 3 + 1], nz = SN[v * 3 + 2];
      let hSum = 0, wSum = 0;
      sGrid.forEachNear(qx, qy, qz, 0.25, (j, d2) => {
        const w = Math.exp(-d2 * inv2s);
        hSum += ((pos[j * 3] - qx) * nx + (pos[j * 3 + 1] - qy) * ny + (pos[j * 3 + 2] - qz) * nz) * w;
        wSum += w;
      });
      if (wSum > 0) {
        const rawH = hSum / wSum;
        const h = rawH < -0.025 ? rawH : Math.max(-0.004, Math.min(0.004, rawH * 0.45));
        S[v * 3] = qx + h * nx;
        S[v * 3 + 1] = qy + h * ny;
        S[v * 3 + 2] = qz + h * nz;
      }
    }
    let curS = S;
    for (let pass = 0; pass < 10; pass += 1) {
      const nextS = Float64Array.from(curS);
      for (const v of regionVerts) {
        if (ramp[v] <= 0) continue;
        const nbs = vAdj[v];
        if (!nbs.length) continue;
        let mx = 0, my = 0, mz = 0;
        for (const u of nbs) {
          mx += curS[u * 3];
          my += curS[u * 3 + 1];
          mz += curS[u * 3 + 2];
        }
        const inv = 1 / nbs.length;
        const tx = 0.25 * curS[v * 3] + 0.75 * mx * inv - pos[v * 3];
        const ty = 0.25 * curS[v * 3 + 1] + 0.75 * my * inv - pos[v * 3 + 1];
        const tz = 0.25 * curS[v * 3 + 2] + 0.75 * mz * inv - pos[v * 3 + 2];
        const h = tx * SN[v * 3] + ty * SN[v * 3 + 1] + tz * SN[v * 3 + 2];
        nextS[v * 3] = pos[v * 3] + h * SN[v * 3];
        nextS[v * 3 + 1] = pos[v * 3 + 1] + h * SN[v * 3 + 1];
        nextS[v * 3 + 2] = pos[v * 3 + 2] + h * SN[v * 3 + 2];
      }
      curS = nextS;
    }
    S.set(curS);
  }

  lap("fit");

  // 꼭짓점 넓이(내림 폭을 평균할 때 가중치)
  const vArea = new Float64Array(nv);
  {
    const tmp = new Float64Array(3);
    for (let t = 0; t < tc; t += 1) {
      const area = faceNormalArea(pos, tri[t * 4], tri[t * 4 + 1], tri[t * 4 + 2], tmp, 0);
      for (let k = 0; k < 3; k += 1) vArea[tri[t * 4 + k]] += area / 3;
    }
  }
  let moving = regionVerts.filter((v) => ramp[v] > 0);
  const lift = new Float64Array(nv);
  const scale = new Float64Array(nv).fill(1);
  const X = Float64Array.from(pos);
  const prevX = new Float64Array(pos.length);
  prevX.fill(NaN);
  const dirtyV = new Uint8Array(nv);
  const vSD = new Float64Array(nv);
  const place = () => {
    dirtyV.fill(0);
    for (const v of regionVerts) {
      const w = ramp[v] * scale[v];
      const nx = w > 0 ? pos[v * 3] + w * (S[v * 3] - lift[v] * SN[v * 3] - pos[v * 3]) : pos[v * 3];
      const ny = w > 0 ? pos[v * 3 + 1] + w * (S[v * 3 + 1] - lift[v] * SN[v * 3 + 1] - pos[v * 3 + 1]) : pos[v * 3 + 1];
      const nz = w > 0 ? pos[v * 3 + 2] + w * (S[v * 3 + 2] - lift[v] * SN[v * 3 + 2] - pos[v * 3 + 2]) : pos[v * 3 + 2];
      if (nx !== prevX[v * 3] || ny !== prevX[v * 3 + 1] || nz !== prevX[v * 3 + 2]) {
        X[v * 3] = prevX[v * 3] = nx;
        X[v * 3 + 1] = prevX[v * 3 + 1] = ny;
        X[v * 3 + 2] = prevX[v * 3 + 2] = nz;
        dirtyV[v] = 1;
      }
    }
  };
  /** 꼭짓점·모서리 가운데·면 가운데 중 원본 밖으로 나간 양을, 그 점을 만드는 움직이는 꼭짓점에 돌린다. */
  const excess = new Float64Array(nv);
  const triOut = new Uint8Array(tc);
  const measure = (full = false) => {
    excess.fill(0);
    let worst = 0;
    const blame = (ids, d) => {
      if (d <= OUTSIDE_TOL_MM / 2) return false;
      if (d > worst) worst = d;
      for (const v of ids) {
        if (ramp[v] <= 0) continue;
        if (d > excess[v]) excess[v] = d;
      }
      return true;
    };
    for (const v of moving) {
      if (dirtyV[v]) vSD[v] = sd.query(X[v * 3], X[v * 3 + 1], X[v * 3 + 2], vOrig[v]);
      blame([v], vSD[v]);
    }
    for (let t = 0; t < tc; t += 1) {
      const a0 = tri[t * 4], b0 = tri[t * 4 + 1], c0 = tri[t * 4 + 2];
      if (!(ramp[a0] > 0 || ramp[b0] > 0 || ramp[c0] > 0)) continue;
      if (!full && !triOut[t] && !(dirtyV[a0] | dirtyV[b0] | dirtyV[c0])) continue;
      if (!full && !triOut[t] && vSD[a0] < -2e-4 && vSD[b0] < -2e-4 && vSD[c0] < -2e-4) continue;
      const orig = tri[t * 4 + 3];
      const ids = [a0, b0, c0];
      let cx = 0, cy = 0, cz = 0, anyOut = false;
      for (let k = 0; k < 3; k += 1) {
        const a = ids[k], b = ids[(k + 1) % 3];
        cx += X[a * 3];
        cy += X[a * 3 + 1];
        cz += X[a * 3 + 2];
        if (a < b) {
          if (blame([a, b], sd.query((X[a * 3] + X[b * 3]) / 2, (X[a * 3 + 1] + X[b * 3 + 1]) / 2, (X[a * 3 + 2] + X[b * 3 + 2]) / 2, orig))) {
            anyOut = true;
          }
        }
      }
      if (blame(ids, sd.query(cx / 3, cy / 3, cz / 3, orig))) anyOut = true;
      triOut[t] = anyOut ? 1 : 0;
    }
    return worst;
  };
  /** 넘친 양 이상이면서 매끈한 내림 폭: 2R 안 최댓값을 이웃 넓이 가중으로 편다(편 값이 원래 값보다 작아지지 않는다). */
  const majorant = (values) => {
    const active = [];
    for (const v of moving) if (values[v] > 0) active.push(v);
    if (!active.length) return new Float64Array(nv);
    const activeGrid = new PointGrid(pos, active, LIFT_RADIUS_MM * 2);
    const dil = new Float64Array(nv);
    for (const v of moving) {
      let m = values[v];
      activeGrid.forEachNear(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], LIFT_RADIUS_MM * 2, (j) => {
        if (values[j] > m) m = values[j];
      });
      if (m > 0) dil[v] = m;
    }
    let cur = dil;
    for (let pass = 0; pass < 4; pass += 1) {
      const nextVals = Float64Array.from(cur);
      for (const v of moving) {
        const nbs = vAdj[v];
        if (!nbs.length) continue;
        let s = cur[v] * vArea[v];
        let w = vArea[v];
        for (const j of nbs) {
          if (ramp[j] <= 0) continue;
          s += cur[j] * vArea[j];
          w += vArea[j];
        }
        if (w > 0) nextVals[v] = Math.max(values[v], s / w);
      }
      cur = nextVals;
    }
    return cur;
  };

  // 안쪽으로 내려도 줄지 않는 꼭짓점은 고정하고 주변 전환 가중치를 다시 잡는다.
  let frozenVertices = 0;
  const freeze = (ids) => {
    for (const v of ids) featureIds.push(v);
    frozenVertices += ids.length;
    computeRamp(featureIds);
    moving = moving.filter((v) => ramp[v] > 0);
    place();
  };
  const inwardOf = (v) => (dirtyV[v] ? -(vSD[v] = sd.query(X[v * 3], X[v * 3 + 1], X[v * 3 + 2], vOrig[v])) : -vSD[v]);
  const inwardStats = () => {
    let maxInward = 0;
    let sumInward = 0;
    let movedCount = 0;
    const deep = [];
    for (const v of moving) {
      const d = inwardOf(v);
      if (d > maxInward) maxInward = d;
      sumInward += Math.max(0, d);
      movedCount += 1;
      if (d > MAX_INWARD_MM) deep.push(v);
    }
    return { maxInward, sumInward, movedCount, deep };
  };
  const liftOnce = () => {
    for (const v of moving) if (excess[v] > 0) excess[v] = excess[v] * LIFT_OVERSHOOT + OUTSIDE_TOL_MM;
    const add = majorant(excess);
    for (const v of moving) lift[v] += add[v] / Math.max(ramp[v] * scale[v], 0.05);
    place();
    worst = measure();
    rounds += 1;
    const stuck = moving.filter(
      (v) => scale[v] >= 0.99 && excess[v] > 0 && prev[v] > 0 && excess[v] > prev[v] * STUCK_RATIO,
    );
    if (rounds >= 3 && stuck.length) {
      freeze(stuck);
      worst = measure();
    }
    prev = Float64Array.from(excess);
  };

  place();
  let worst = measure();
  let rounds = 0;
  let prev = Float64Array.from(excess);
  /**
   * 내림을 반복해도 원본 밖으로 몇 µm 남는 꼭짓점은 원본 자리에 고정하고 다시 맞춘다.
   * 한 곳 때문에 포스트 다듬기 전체를 건너뛰지 않는다(2026-11-09 WTRQZXSQ).
   */
  const settle = (extraRounds) => {
    for (let attempt = 0; attempt < SETTLE_ATTEMPTS && worst > OUTSIDE_TOL_MM / 2; attempt += 1) {
      const stuck = moving.filter((v) => excess[v] > 0);
      if (!stuck.length) break;
      freeze(stuck);
      worst = measure();
      prev = Float64Array.from(excess);
      const budget = rounds + extraRounds;
      while (worst > OUTSIDE_TOL_MM / 2 && rounds < budget) liftOnce();
    }
  };
  while (worst > OUTSIDE_TOL_MM / 2 && rounds < LIFT_ROUNDS) liftOnce();
  settle(LIFT_ROUNDS);
  lap("lift");
  if (worst > OUTSIDE_TOL_MM / 2) {
    skip("다듬은 면이 원본 밖으로 나가는 곳을 다 없애지 못했습니다.", { outsideUm: Math.round(worst * 1e4) / 10 });
  }

  // 안쪽 이동이 MAX_INWARD_MM을 넘는 곳은 먼저 급한 돌기(30µm 초과)만 고정하고, 나머지는 주변과 함께 부드럽게 줄인다.
  let heldDeep = 0;
  let stats = inwardStats();
  let holdPasses = 0;
  while (stats.deep.length && holdPasses < 4) {
    const ridge = stats.deep.filter((v) => inwardOf(v) > 0.03);
    if (!ridge.length) break;
    heldDeep += ridge.length;
    freeze(ridge);
    worst = measure();
    prev = Float64Array.from(excess);
    const budget = rounds + LIFT_ROUNDS;
    while (worst > OUTSIDE_TOL_MM / 2 && rounds < budget) liftOnce();
    settle(LIFT_ROUNDS);
    if (worst > OUTSIDE_TOL_MM / 2) {
      skip("다듬은 면이 원본 밖으로 나가는 곳을 다 없애지 못했습니다.", { outsideUm: Math.round(worst * 1e4) / 10 });
    }
    stats = inwardStats();
    holdPasses += 1;
  }
  const scaleGrid = new PointGrid(pos, moving, 0.35);
  const smoothScaleField = (rawD) => {
    const dil = new Float64Array(nv);
    for (const v of moving) {
      let m = rawD[v];
      scaleGrid.forEachNear(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], 0.35, (j) => {
        if (rawD[j] > m) m = rawD[j];
      });
      dil[v] = m;
    }
    let cur = dil;
    for (let pass = 0; pass < 3; pass += 1) {
      const nextVals = new Float64Array(nv);
      for (const v of moving) {
        let s = 0, w = 0;
        scaleGrid.forEachNear(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], 0.25, (j) => {
          s += cur[j] * vArea[j];
          w += vArea[j];
        });
        nextVals[v] = w > 0 ? s / w : cur[v];
      }
      cur = nextVals;
    }
    return cur;
  };
  for (let capPass = 0; capPass < 3 && stats.maxInward > MAX_INWARD_MM; capPass += 1) {
    const rawD = new Float64Array(nv);
    for (const v of moving) {
      rawD[v] = Math.max(
        0,
        inwardOf(v),
        Math.hypot(X[v * 3] - pos[v * 3], X[v * 3 + 1] - pos[v * 3 + 1], X[v * 3 + 2] - pos[v * 3 + 2]),
      );
    }
    const envD = smoothScaleField(rawD);
    const cap = MAX_INWARD_MM * 0.98;
    for (const v of moving) {
      const D = Math.max(rawD[v], envD[v]);
      if (D > cap && rawD[v] > 0) {
        const p = Math.min(3.5, D / cap);
        const targetD = cap * Math.pow(rawD[v] / D, p);
        scale[v] *= targetD / rawD[v];
      }
    }
    place();
    worst = measure();
    prev = Float64Array.from(excess);
    const budget = rounds + LIFT_ROUNDS;
    while (worst > OUTSIDE_TOL_MM / 2 && rounds < budget) liftOnce();
    settle(LIFT_ROUNDS);
    if (worst > OUTSIDE_TOL_MM / 2) {
      skip("다듬은 면이 원본 밖으로 나가는 곳을 다 없애지 못했습니다.", { outsideUm: Math.round(worst * 1e4) / 10 });
    }
    stats = inwardStats();
  }
  if (stats.maxInward > MAX_INWARD_MM) {
    for (const v of moving) {
      const d = inwardOf(v);
      if (d > MAX_INWARD_MM) scale[v] *= (MAX_INWARD_MM * 0.98) / d;
    }
    place();
    stats = inwardStats();
  }
  const { maxInward, sumInward, movedCount } = stats;
  if (maxInward > MAX_INWARD_MM + OUTSIDE_TOL_MM || movedCount === 0) {
    skip("포스트를 너무 깊이 깎아야 해서 적용하지 않았습니다.", { maxInwardUm: Math.round(maxInward * 1e4) / 10 });
  }

  // 다듬기가 끝난 패치를 간소화한다. 고정·전환 구간·경계 꼭짓점은 건드리지 않고, 평평한 곳의 삼각형만 걷어 낸다.
  const protect = new Uint8Array(nv);
  for (let v = 0; v < nv; v += 1) if (isFixed(v) || !(ramp[v] > 0) || vOrig[v] < 0) protect[v] = 1;
  const dec = decimatePatch({ X, tri, protect, sd, outsideTol: OUTSIDE_TOL_MM, maxInward: MAX_INWARD_MM });
  const triOutList = dec.tri;
  const tcFinal = triOutList.length / 4;
  lap("decimate");

  // 영역 밖 면은 그대로, 영역 면은 나눈 면으로 바꾼다.
  const outPos = [];
  const outAttr = [];
  const pushTri = (Q, a, b, c, attr) => {
    outPos.push(Q[a * 3], Q[a * 3 + 1], Q[a * 3 + 2], Q[b * 3], Q[b * 3 + 1], Q[b * 3 + 2], Q[c * 3], Q[c * 3 + 1], Q[c * 3 + 2]);
    outAttr.push(attr);
  };
  for (let f = 0; f < fc; f += 1) {
    if (inRegion[f]) continue;
    pushTri(P0, faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2], faceAttr[f]);
  }
  for (let t = 0; t < tcFinal; t += 1) {
    const ids = [triOutList[t * 4], triOutList[t * 4 + 1], triOutList[t * 4 + 2]];
    const touched = ids.some((v) => ramp[v] > 0) || ids.some((v) => v >= nv0);
    pushTri(X, ids[0], ids[1], ids[2], touched ? POST_SMOOTH_PATCH_ATTRIBUTE : faceAttr[triOutList[t * 4 + 3]]);
  }
  lap("verify");
  const out = writeBinaryStl({ positions: Float64Array.from(outPos), attributes: Uint16Array.from(outAttr) });
  return {
    ok: true,
    status: "applied",
    reason: null,
    buffer: out,
    detail: {
      version: POST_SMOOTH_VERSION,
      regionTriangles: regionFaces.length,
      patchTriangles: tcFinal,
      patchTrianglesRefined: tc,
      decimatedVertices: dec.removed,
      movedVertices: movedCount,
      fixedFinishVertices: crease.loop.length,
      margin: crease.fromFinishLine ? "finish-line" : "crease",
      thinVertices,
      maxInwardUm: Math.round(maxInward * 1e4) / 10,
      meanInwardUm: movedCount ? Math.round((sumInward / movedCount) * 1e4) / 10 : 0,
      frozenVertices,
      heldDeepVertices: heldDeep,
      liftRounds: rounds,
      ms: Date.now() - started,
      stagesMs: stages,
    },
  };
}
