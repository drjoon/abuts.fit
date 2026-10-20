// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (마진 모서리 findFinishCrease · 메시 준비)
// - web/backend/services/abutmentStl/cuffBlend.worker.js (커프 보정 뒤 같은 worker에서 실행)
// - web/backend/tests/unit/postSmooth.test.js
//
// 피니시라인 위 포스트(크라운이 앉는 면)의 계단 결을 없앤다.
// - 마진 모서리 꼭짓점과 그 아래는 하나도 옮기지 않는다.
// - 나머지 포스트 꼭짓점은 원본 면 안쪽으로만 옮긴다. 새 면의 어느 점도 원본 면 밖으로 나가지 않는다.
// - 삼각형을 한 번 4등분하고, 원본 면에 국소 2차 곡면을 맞춘 뒤 원본 면 안쪽에 들어갈 만큼만 함께 내린다.
// - 슬롯·스크류홀 메움 테두리처럼 30° 넘게 꺾이는 모서리는 디자인으로 보고 그대로 둔다.
// - 50µm보다 깊이 들어가야 하는 꼭짓점은 그 자리만 고정한다. 그 때문에 포스트 전체를 건너뛰지 않는다.
import { writeBinaryStl } from "../../utils/screwHoleFill.js";
import { findFinishCrease, finishLineZByAngle, prepareCuffMesh } from "./cuffBlend.js";

export const POST_SMOOTH_VERSION = "post-smooth-1";
/** 이 attribute의 삼각형은 포스트 다듬기 곡면이다. */
export const POST_SMOOTH_PATCH_ATTRIBUTE = 0x5053;

/** 이보다 꺾인 모서리는 디자인 모서리. 매끈한 면의 계단은 10° 안이다. */
const FEATURE_DEG = 30;
/** 국소 2차 곡면 가중치 폭. 기공소 메시 한 칸(약 0.18mm)보다 넓어야 계단이 평균된다. */
const FIT_SIGMA_MM = 0.2;
const FIT_RADIUS_MM = FIT_SIGMA_MM * 2.5;
/** 포스트 꼭짓점이 그 각도의 마진 모서리 높이보다 이만큼 넘게 낮으면 포스트가 아니다. */
const BELOW_MARGIN_MM = 0.1;
/** 마진 모서리에서 이 높이까지 원본 → 다듬은 면으로 넘어간다. */
const MARGIN_RAMP_MM = 0.25;
/** 디자인 모서리에서 이 거리까지 원본 → 다듬은 면으로 넘어간다. */
const FEATURE_RAMP_MM = 0.12;
/** 원본 밖으로 나간 양을 덮는 내림 폭. 이 반경 안에서 매끈하게 함께 내린다. */
const LIFT_RADIUS_MM = 0.1;
const LIFT_ROUNDS = 5;
/** 한 번에 넘친 양보다 조금 더 내려 반복 횟수를 줄인다. */
const LIFT_OVERSHOOT = 1.25;
/** 한 번 내린 뒤에도 넘친 양이 이 비율 넘게 남으면 그 꼭짓점은 고정한다. */
const STUCK_RATIO = 0.5;
/** 원본 면 밖으로 이만큼도 나가지 않는다(float32 반올림 여유 포함). */
const OUTSIDE_TOL_MM = 2e-5;
/** 이보다 깊이 들어가야 하는 꼭짓점은 고정한다. 포스트 전체를 건너뛰지는 않는다. */
const MAX_INWARD_MM = 0.05;
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

/** 6×6 대칭 연립방정식(가우스 소거, 부분 피벗). 특이하면 null. */
function solve6(M, rhs) {
  const n = 6;
  const a = new Float64Array(42);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) a[i * 7 + j] = M[i * 6 + j];
    a[i * 7 + 6] = rhs[i];
  }
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r * 7 + col]) > Math.abs(a[piv * 7 + col])) piv = r;
    if (Math.abs(a[piv * 7 + col]) < 1e-18) return null;
    if (piv !== col) {
      for (let j = 0; j < 7; j += 1) {
        const t = a[col * 7 + j];
        a[col * 7 + j] = a[piv * 7 + j];
        a[piv * 7 + j] = t;
      }
    }
    for (let r = col + 1; r < n; r += 1) {
      const fct = a[r * 7 + col] / a[col * 7 + col];
      if (!fct) continue;
      for (let j = col; j < 7; j += 1) a[r * 7 + j] -= fct * a[col * 7 + j];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = a[r * 7 + 6];
    for (let j = r + 1; j < n; j += 1) s -= a[r * 7 + j] * x[j];
    x[r] = s / a[r * 7 + r];
  }
  return x;
}

/**
 * 크라운이 앉는 포스트 면을 고른다. 마진 모서리 바로 위 면에서 시작해 디자인 모서리(30° 초과)를 넘지 않고 이어진 면만.
 * 스크류 채널 벽·슬롯 벽·스크류홀 메움 부채는 날카로운 모서리 너머라 들어오지 않는다.
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
      if (z > (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2 && !inRegion[f]) {
        inRegion[f] = 1;
        stack.push(f);
      }
    }
  }
  if (!stack.length) skip("마진 모서리 위 포스트 면을 찾지 못했습니다.");
  const cosFeature = Math.cos((FEATURE_DEG * Math.PI) / 180);
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
      const dot = fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2];
      if (dot < cosFeature) continue;
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
  return { pos: Float64Array.from(next), tri: out };
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
  if (mesh.faceAttr.some((a) => a === POST_SMOOTH_PATCH_ATTRIBUTE)) skip("이미 다듬은 포스트입니다.");
  const crease = findFinishCrease(mesh, flZ);
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
      fixed[a] = 1;
      fixed[b] = 1;
      feature[a] = 1;
      feature[b] = 1;
      continue;
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
  const refined = refineRegion(P0, rfaces, fixed);
  const pos = refined.pos;
  const tri = refined.tri;
  const nv = pos.length / 3;
  const tc = tri.length / 4;
  lap("refine");

  // 영역 꼭짓점, 각 꼭짓점이 놓인 원본 면
  const vOrig = new Int32Array(nv).fill(-1);
  for (let t = 0; t < tc; t += 1) for (let k = 0; k < 3; k += 1) if (vOrig[tri[t * 4 + k]] < 0) vOrig[tri[t * 4 + k]] = tri[t * 4 + 3];
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

  // 국소 2차 곡면: 원본 영역 모서리 가운데 점(면 넓이 가중)에 맞춘다. 디자인 모서리를 넘지 않는다.
  const edgeSamples = [];
  const edgeIdOf = new Map();
  for (const [key, e] of regionEdges) {
    edgeIdOf.set(key, edgeSamples.length / 4);
    edgeSamples.push((P0[e.a * 3] + P0[e.b * 3]) / 2, (P0[e.a * 3 + 1] + P0[e.b * 3 + 1]) / 2, (P0[e.a * 3 + 2] + P0[e.b * 3 + 2]) / 2, e.w);
  }
  const faceEdgeIds = new Int32Array(fc * 3).fill(-1);
  for (const f of regionFaces) {
    for (let k = 0; k < 3; k += 1) {
      const a = faces[f * 3 + k];
      const b = faces[f * 3 + ((k + 1) % 3)];
      const id = edgeIdOf.get(a < b ? a * nv0 + b : b * nv0 + a);
      if (id !== undefined) faceEdgeIds[f * 3 + k] = id;
    }
  }
  // 원본 면마다 맞춤 범위(그 면에서 FIT_RADIUS 안, 디자인 모서리 너머 제외)를 한 번만 모은다. 같은 면 위 새 꼭짓점이 함께 쓴다.
  const faceStamp = new Int32Array(fc);
  let stamp = 0;
  const neighborhoodCache = new Map();
  const neighborhoodOf = (f0) => {
    let hood = neighborhoodCache.get(f0);
    if (hood) return hood;
    const a0 = faces[f0 * 3] * 3;
    const b0 = faces[f0 * 3 + 1] * 3;
    const c0 = faces[f0 * 3 + 2] * 3;
    const cx = (P0[a0] + P0[b0] + P0[c0]) / 3;
    const cy = (P0[a0 + 1] + P0[b0 + 1] + P0[c0 + 1]) / 3;
    const cz = (P0[a0 + 2] + P0[b0 + 2] + P0[c0 + 2]) / 3;
    let rad = 0;
    for (const p of [a0, b0, c0]) rad = Math.max(rad, Math.hypot(P0[p] - cx, P0[p + 1] - cy, P0[p + 2] - cz));
    const reach2 = (FIT_RADIUS_MM + rad) ** 2;
    stamp += 1;
    const visited = [f0];
    faceStamp[f0] = stamp;
    for (let i = 0; i < visited.length; i += 1) {
      const f = visited[i];
      for (let k = 0; k < 3; k += 1) {
        const g = nbr[f * 3 + k];
        if (g < 0 || faceStamp[g] === stamp) continue;
        faceStamp[g] = stamp;
        let near = false;
        for (let m = 0; m < 3 && !near; m += 1) {
          const p = faces[g * 3 + m] * 3;
          near = (P0[p] - cx) ** 2 + (P0[p + 1] - cy) ** 2 + (P0[p + 2] - cz) ** 2 <= reach2;
        }
        if (near) visited.push(g);
      }
    }
    const edgeSet = new Set();
    for (const f of visited) for (let k = 0; k < 3; k += 1) if (faceEdgeIds[f * 3 + k] >= 0) edgeSet.add(faceEdgeIds[f * 3 + k]);
    const fcent = new Float64Array(visited.length * 3);
    visited.forEach((f, i) => {
      for (let q = 0; q < 3; q += 1) fcent[i * 3 + q] = (P0[faces[f * 3] * 3 + q] + P0[faces[f * 3 + 1] * 3 + q] + P0[faces[f * 3 + 2] * 3 + q]) / 3;
    });
    hood = { faces: Int32Array.from(visited), centroids: fcent, edges: Int32Array.from(edgeSet) };
    neighborhoodCache.set(f0, hood);
    return hood;
  };
  const S = Float64Array.from(pos);
  const SN = new Float64Array(nv * 3);
  const M = new Float64Array(36);
  const rhs = new Float64Array(6);
  const basis = new Float64Array(6);
  const r2Max = FIT_RADIUS_MM * FIT_RADIUS_MM;
  const inv2s = 1 / (FIT_SIGMA_MM * FIT_SIGMA_MM);
  for (const v of regionVerts) {
    if (ramp[v] <= 0) continue;
    const qx = pos[v * 3];
    const qy = pos[v * 3 + 1];
    const qz = pos[v * 3 + 2];
    const hood = neighborhoodOf(vOrig[v]);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < hood.faces.length; i += 1) {
      const f = hood.faces[i];
      const d2 = (hood.centroids[i * 3] - qx) ** 2 + (hood.centroids[i * 3 + 1] - qy) ** 2 + (hood.centroids[i * 3 + 2] - qz) ** 2;
      if (d2 > r2Max) continue;
      const wgt = farea[f] * Math.exp(-d2 * inv2s);
      nx += fn[f * 3] * wgt;
      ny += fn[f * 3 + 1] * wgt;
      nz += fn[f * 3 + 2] * wgt;
    }
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 0)) {
      ramp[v] = 0;
      continue;
    }
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // 접평면 기저
    let tx = Math.abs(nz) < 0.9 ? -ny : 0;
    let ty = Math.abs(nz) < 0.9 ? nx : -nz;
    let tz = Math.abs(nz) < 0.9 ? 0 : ny;
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    M.fill(0);
    rhs.fill(0);
    let count = 0;
    let wsum = 0;
    for (const id of hood.edges) {
      const ex = edgeSamples[id * 4] - qx;
      const ey = edgeSamples[id * 4 + 1] - qy;
      const ez = edgeSamples[id * 4 + 2] - qz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > r2Max) continue;
      const wgt = edgeSamples[id * 4 + 3] * Math.exp(-d2 * inv2s);
      const u = ex * tx + ey * ty + ez * tz;
      const w = ex * bx + ey * by + ez * bz;
      const h = ex * nx + ey * ny + ez * nz;
      basis[0] = 1;
      basis[1] = u;
      basis[2] = w;
      basis[3] = u * u;
      basis[4] = u * w;
      basis[5] = w * w;
      for (let i = 0; i < 6; i += 1) {
        const bi = wgt * basis[i];
        rhs[i] += bi * h;
        for (let j = i; j < 6; j += 1) M[i * 6 + j] += bi * basis[j];
      }
      count += 1;
      wsum += wgt;
    }
    if (count < 8) {
      ramp[v] = 0;
      continue;
    }
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < i; j += 1) M[i * 6 + j] = M[j * 6 + i];
    // 한쪽으로 몰린 표본에서 2차 항이 튀지 않게 약하게 묶는다.
    const ridge = wsum * 1e-6;
    for (let i = 3; i < 6; i += 1) M[i * 6 + i] += ridge;
    const coef = solve6(M, rhs);
    if (!coef || !Number.isFinite(coef[0])) {
      ramp[v] = 0;
      continue;
    }
    S[v * 3] = qx + coef[0] * nx;
    S[v * 3 + 1] = qy + coef[0] * ny;
    S[v * 3 + 2] = qz + coef[0] * nz;
    let sx = nx - coef[1] * tx - coef[2] * bx;
    let sy = ny - coef[1] * ty - coef[2] * by;
    let sz = nz - coef[1] * tz - coef[2] * bz;
    const sl = Math.hypot(sx, sy, sz) || 1;
    SN[v * 3] = sx / sl;
    SN[v * 3 + 1] = sy / sl;
    SN[v * 3 + 2] = sz / sl;
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
  let liftGrid = new PointGrid(pos, moving, LIFT_RADIUS_MM * 2);
  const lift = new Float64Array(nv);
  const X = Float64Array.from(pos);
  const place = () => {
    for (const v of moving) {
      const w = ramp[v];
      for (let k = 0; k < 3; k += 1) {
        X[v * 3 + k] = pos[v * 3 + k] + w * (S[v * 3 + k] - lift[v] * SN[v * 3 + k] - pos[v * 3 + k]);
      }
    }
  };
  /** 꼭짓점·모서리 가운데·면 가운데 중 원본 밖으로 나간 양을, 그 점을 만드는 움직이는 꼭짓점에 돌린다. */
  const excess = new Float64Array(nv);
  const measure = () => {
    excess.fill(0);
    let worst = 0;
    const blame = (ids, d) => {
      if (d <= OUTSIDE_TOL_MM / 2) return;
      worst = Math.max(worst, d);
      for (const v of ids) {
        if (ramp[v] <= 0) continue;
        const need = d / Math.max(ramp[v], 0.05);
        if (need > excess[v]) excess[v] = need;
      }
    };
    for (const v of moving) blame([v], sd.query(X[v * 3], X[v * 3 + 1], X[v * 3 + 2], vOrig[v]));
    for (let t = 0; t < tc; t += 1) {
      const ids = [tri[t * 4], tri[t * 4 + 1], tri[t * 4 + 2]];
      if (!ids.some((v) => ramp[v] > 0)) continue;
      const orig = tri[t * 4 + 3];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 3; k += 1) {
        const a = ids[k];
        const b = ids[(k + 1) % 3];
        cx += X[a * 3];
        cy += X[a * 3 + 1];
        cz += X[a * 3 + 2];
        if (a < b) {
          blame(
            [a, b],
            sd.query((X[a * 3] + X[b * 3]) / 2, (X[a * 3 + 1] + X[b * 3 + 1]) / 2, (X[a * 3 + 2] + X[b * 3 + 2]) / 2, orig),
          );
        }
      }
      blame(ids, sd.query(cx / 3, cy / 3, cz / 3, orig));
    }
    return worst;
  };
  /** 넘친 양 이상이면서 매끈한 내림 폭: 2R 안 최댓값을 R 반경 평균으로 두 번 편다(편 값이 원래 값보다 작아지지 않는다). */
  const majorant = (values) => {
    const dil = new Float64Array(nv);
    for (const v of moving) {
      let m = values[v];
      liftGrid.forEachNear(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], LIFT_RADIUS_MM * 2, (j) => {
        if (values[j] > m) m = values[j];
      });
      dil[v] = m;
    }
    let cur = dil;
    for (let pass = 0; pass < 2; pass += 1) {
      const nextVals = new Float64Array(nv);
      for (const v of moving) {
        let s = 0;
        let w = 0;
        liftGrid.forEachNear(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], LIFT_RADIUS_MM, (j) => {
          s += cur[j] * vArea[j];
          w += vArea[j];
        });
        nextVals[v] = w > 0 ? s / w : cur[v];
      }
      cur = nextVals;
    }
    return cur;
  };

  // 안쪽으로 내려도 줄지 않는 꼭짓점(스크류 채널이 면을 뚫고 지나가는 곳 등)은 고정하고 주변 전환 가중치를 다시 잡는다.
  let frozenVertices = 0;
  const freeze = (ids) => {
    for (const v of ids) featureIds.push(v);
    frozenVertices += ids.length;
    computeRamp(featureIds);
    for (const v of moving) {
      if (ramp[v] > 0) continue;
      for (let k = 0; k < 3; k += 1) X[v * 3 + k] = pos[v * 3 + k];
    }
    moving = moving.filter((v) => ramp[v] > 0);
    liftGrid = new PointGrid(pos, moving, LIFT_RADIUS_MM * 2);
    place();
  };
  const inwardOf = (v) => -sd.query(X[v * 3], X[v * 3 + 1], X[v * 3 + 2], vOrig[v]);
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
    for (const v of moving) lift[v] += add[v];
    place();
    worst = measure();
    rounds += 1;
    const stuck = moving.filter((v) => excess[v] > 0 && prev[v] > 0 && excess[v] > prev[v] * STUCK_RATIO);
    if (stuck.length) {
      freeze(stuck);
      worst = measure();
    }
    prev = Float64Array.from(excess);
  };

  place();
  let worst = measure();
  let rounds = 0;
  let prev = Float64Array.from(excess);
  while (worst > OUTSIDE_TOL_MM / 2 && rounds < LIFT_ROUNDS) liftOnce();
  lap("lift");
  if (worst > OUTSIDE_TOL_MM / 2) {
    skip("다듬은 면이 원본 밖으로 나가는 곳을 다 없애지 못했습니다.", { outsideUm: Math.round(worst * 1e4) / 10 });
  }

  // 한 곳이 50µm를 넘으면 포스트 전체를 포기하지 않는다. 그 꼭짓점만 디자인 모서리로 고정하고
  // 0.12mm 안은 원본으로 넘긴 뒤, 나머지 계단은 다듬는다.
  let heldDeep = 0;
  let stats = inwardStats();
  let holdPasses = 0;
  while (stats.deep.length && holdPasses < 6) {
    heldDeep += stats.deep.length;
    freeze(stats.deep);
    worst = measure();
    prev = Float64Array.from(excess);
    const budget = rounds + LIFT_ROUNDS;
    while (worst > OUTSIDE_TOL_MM / 2 && rounds < budget) liftOnce();
    if (worst > OUTSIDE_TOL_MM / 2) {
      skip("다듬은 면이 원본 밖으로 나가는 곳을 다 없애지 못했습니다.", { outsideUm: Math.round(worst * 1e4) / 10 });
    }
    stats = inwardStats();
    holdPasses += 1;
  }
  const { maxInward, sumInward, movedCount } = stats;
  if (maxInward > MAX_INWARD_MM || movedCount === 0) {
    skip("포스트를 너무 깊이 깎아야 해서 적용하지 않았습니다.", { maxInwardUm: Math.round(maxInward * 1e4) / 10 });
  }

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
  for (let t = 0; t < tc; t += 1) {
    const ids = [tri[t * 4], tri[t * 4 + 1], tri[t * 4 + 2]];
    const touched = ids.some((v) => ramp[v] > 0) || ids.some((v) => v >= nv0);
    pushTri(X, ids[0], ids[1], ids[2], touched ? POST_SMOOTH_PATCH_ATTRIBUTE : faceAttr[tri[t * 4 + 3]]);
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
      patchTriangles: tc,
      movedVertices: movedCount,
      fixedFinishVertices: crease.loop.length,
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
