// related files:
// - web/backend/services/abutmentStl/postSmooth.js (다듬기·내림 검증이 끝난 패치를 넘긴다)
// - web/backend/tests/unit/postSmooth.test.js
//
// 다듬은 포스트 패치를 간소화한다. 촘촘하게 나눈 삼각형 중 평평한 곳의 것을 걷어 내 용량을 줄인다.
// - 꼭짓점을 새로 만들거나 옮기지 않는다. 변을 한 끝점으로 합치므로 남는 꼭짓점 좌표는 그대로다.
// - protect 꼭짓점(마진·고정·전환 구간·패치 경계)은 제거하지 않는다. 패치 경계는 위상으로도 막는다.
// - 제거한 꼭짓점이 새 면에서 TOL 넘게 벗어나거나, 법선이 꺾이거나, 뒤집히거나, 원본 면 밖으로 나가면 합치지 않는다.

/** 제거 꼭짓점이 남는 면에서 벗어나도 되는 양(RMS 기준, 직접 거리는 1.5배까지). */
export const DECIMATE_TOL_MM = 0.001;
/** 합친 뒤 이웃 면 법선이 이 각도 넘게 틀어지면 거부한다. */
const MAX_NORMAL_DEG = 2;
/** 새 삼각형 품질(4√3·넓이/변 제곱합)이 이보다 나쁘고 원래보다도 나빠지면 거부한다. */
const MIN_QUALITY = 0.2;

class MinHeap {
  constructor() {
    this.cost = [];
    this.item = [];
  }

  get size() {
    return this.cost.length;
  }

  push(cost, item) {
    const c = this.cost;
    const it = this.item;
    let i = c.length;
    c.push(cost);
    it.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= cost) break;
      c[i] = c[p];
      it[i] = it[p];
      i = p;
    }
    c[i] = cost;
    it[i] = item;
  }

  pop() {
    const c = this.cost;
    const it = this.item;
    const topItem = it[0];
    const lastCost = c.pop();
    const lastItem = it.pop();
    const n = c.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let l = i * 2 + 1;
        if (l >= n) break;
        if (l + 1 < n && c[l + 1] < c[l]) l += 1;
        if (c[l] >= lastCost) break;
        c[i] = c[l];
        it[i] = it[l];
        i = l;
      }
      c[i] = lastCost;
      it[i] = lastItem;
    }
    return topItem;
  }
}

/**
 * @param {object} args
 * @param {Float64Array} args.X 꼭짓점 좌표(최종)
 * @param {number[]} args.tri [a,b,c,원본면] 반복
 * @param {Uint8Array} args.protect 1이면 제거하지 않는다
 * @param {{ queryGlobal: Function }} args.sd 원본 부호거리(밖 +)
 * @param {number} args.outsideTol 원본 밖 허용량
 * @param {number} args.maxInward 원본 안쪽 허용 깊이
 * @returns {{ tri: number[], removed: number, before: number, after: number }}
 */
export function decimatePatch({ X, tri, protect, sd, outsideTol, maxInward, tol = DECIMATE_TOL_MM }) {
  const nv = X.length / 3;
  const tc = tri.length / 4;
  const T = Int32Array.from(tri);
  const alive = new Uint8Array(tc).fill(1);
  const vTris = Array.from({ length: nv }, () => null);
  const edgeCount = new Map();
  const ek = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let t = 0; t < tc; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = T[t * 4 + k];
      const list = (vTris[v] ||= []);
      // 같은 삼각형에 같은 꼭짓점이 겹쳐 있어도 한 번만 넣는다(Set과 같은 동작).
      if (list[list.length - 1] !== t) list.push(t);
      const key = ek(v, T[t * 4 + ((k + 1) % 3)]);
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }
  const locked = Uint8Array.from(protect);
  for (const [key, n] of edgeCount) {
    if (n === 2) continue;
    const a = Math.floor(key / nv);
    locked[a] = 1;
    locked[key - a * nv] = 1;
  }

  const triPlane = (t, out) => {
    const a = T[t * 4] * 3, b = T[t * 4 + 1] * 3, c = T[t * 4 + 2] * 3;
    const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
    const vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 0)) return false;
    out[0] = nx / l;
    out[1] = ny / l;
    out[2] = nz / l;
    out[3] = -(out[0] * X[a] + out[1] * X[a + 1] + out[2] * X[a + 2]);
    return true;
  };

  const Q = new Float64Array(nv * 10);
  const Qn = new Float64Array(nv);
  const pl = new Float64Array(4);
  for (let t = 0; t < tc; t += 1) {
    if (!triPlane(t, pl)) continue;
    const [nx, ny, nz, d] = pl;
    for (let k = 0; k < 3; k += 1) {
      const o = T[t * 4 + k] * 10;
      Q[o] += nx * nx;
      Q[o + 1] += nx * ny;
      Q[o + 2] += nx * nz;
      Q[o + 3] += nx * d;
      Q[o + 4] += ny * ny;
      Q[o + 5] += ny * nz;
      Q[o + 6] += ny * d;
      Q[o + 7] += nz * nz;
      Q[o + 8] += nz * d;
      Q[o + 9] += d * d;
      Qn[T[t * 4 + k]] += 1;
    }
  }
  const quadricAt = (v, x, y, z) => {
    const o = v * 10;
    const e =
      Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x +
      Q[o + 4] * y * y + 2 * Q[o + 5] * y * z + 2 * Q[o + 6] * y +
      Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
    return Math.sqrt(Math.max(0, e) / Math.max(1, Qn[v]));
  };

  const cosMax = Math.cos((MAX_NORMAL_DEG * Math.PI) / 180);
  const quality = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz) / 2;
    const wx = cx - bx, wy = cy - by, wz = cz - bz;
    const s = ux * ux + uy * uy + uz * uz + vx * vx + vy * vy + vz * vz + wx * wx + wy * wy + wz * wz;
    return s > 0 ? (4 * Math.sqrt(3) * area) / s : 0;
  };

  // 이웃 수집·공통 이웃 판정용 스탬프. 호출마다 Set을 만들지 않는다.
  const nbStamp = new Int32Array(nv);
  let nbEpoch = 0;
  const markU = new Int32Array(nv);
  const seenW = new Int32Array(nv);
  let evalEpoch = 0;

  /** 처음 만난 순서대로 v의 이웃(v 제외). 순서가 enqueue 동점 처리에 쓰인다. */
  const neighborsOf = (v) => {
    nbEpoch += 1;
    const out = [];
    for (const t of vTris[v]) {
      for (let k = 0; k < 3; k += 1) {
        const w = T[t * 4 + k];
        if (w !== v && nbStamp[w] !== nbEpoch) {
          nbStamp[w] = nbEpoch;
          out.push(w);
        }
      }
    }
    return out;
  };

  const nA = new Float64Array(3);
  const nB = new Float64Array(3);
  /** 삼각형 단위 법선. 퇴화면이면 false. */
  const unitNormal = (ax, ay, az, bx, by, bz, cx, cy, cz, out) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 0)) return false;
    out[0] = nx / l;
    out[1] = ny / l;
    out[2] = nz / l;
    return true;
  };

  const NO_MERGE = -1;
  /** 이전 법선 캐시. 삼각형 정점이 바뀌면(합치기) 지운다. 0=모름, 1=유효, 2=퇴화. */
  const nState = new Uint8Array(tc);
  const nCache = new Float64Array(tc * 3);

  /** v를 u로 합친다. 가능하면 합침 비용, 아니면 NO_MERGE. fan(u가 없는 v 둘레 면)은 vTris[v]에서 u를 가진 면을 뺀 것. sd 검사는 따로. */
  const evaluate = (v, u) => {
    let s0 = -1;
    let s1 = -1;
    let sharedN = 0;
    let fanN = 0;
    for (const t of vTris[v]) {
      const o = t * 4;
      if (T[o] === u || T[o + 1] === u || T[o + 2] === u) {
        if (sharedN === 0) s0 = t;
        else if (sharedN === 1) s1 = t;
        sharedN += 1;
      } else fanN += 1;
    }
    if (sharedN !== 2 || !fanN) return NO_MERGE;
    let opp0 = -1;
    let opp1 = -1;
    for (let k = 0; k < 3; k += 1) {
      const w = T[s0 * 4 + k];
      if (w !== v && w !== u) {
        opp0 = w;
        break;
      }
    }
    for (let k = 0; k < 3; k += 1) {
      const w = T[s1 * 4 + k];
      if (w !== v && w !== u) {
        opp1 = w;
        break;
      }
    }
    // v와 u가 둘 다 이웃으로 둔 꼭짓점은 두 삼각형의 맞은편 점 둘뿐이어야 한다.
    evalEpoch += 1;
    for (const t of vTris[u]) {
      const o = t * 4;
      markU[T[o]] = evalEpoch;
      markU[T[o + 1]] = evalEpoch;
      markU[T[o + 2]] = evalEpoch;
    }
    let common = 0;
    for (const t of vTris[v]) {
      const o = t * 4;
      for (let k = 0; k < 3; k += 1) {
        const w = T[o + k];
        if (w === v || w === u || markU[w] !== evalEpoch || seenW[w] === evalEpoch) continue;
        seenW[w] = evalEpoch;
        if (w !== opp0 && w !== opp1) return NO_MERGE;
        common += 1;
      }
    }
    if (common !== 2) return NO_MERGE;

    const xv = X[v * 3], yv = X[v * 3 + 1], zv = X[v * 3 + 2];
    const xu = X[u * 3], yu = X[u * 3 + 1], zu = X[u * 3 + 2];
    // 쿼드릭 비용이 tol을 넘으면 어느 경로든 null이다. 비싼 팬 검사 전에 먼저 거른다.
    const quad = quadricAt(v, xu, yu, zu);
    if (quad > tol) return NO_MERGE;
    let direct = 0;
    for (const t of vTris[v]) {
      if (t === s0 || t === s1) continue;
      const o = t * 4;
      const ia = T[o], ib = T[o + 1], ic = T[o + 2];
      const oax = X[ia * 3], oay = X[ia * 3 + 1], oaz = X[ia * 3 + 2];
      const obx = X[ib * 3], oby = X[ib * 3 + 1], obz = X[ib * 3 + 2];
      const ocx = X[ic * 3], ocy = X[ic * 3 + 1], ocz = X[ic * 3 + 2];
      const pax = ia === v ? xu : oax, pay = ia === v ? yu : oay, paz = ia === v ? zu : oaz;
      const pbx = ib === v ? xu : obx, pby = ib === v ? yu : oby, pbz = ib === v ? zu : obz;
      const pcx = ic === v ? xu : ocx, pcy = ic === v ? yu : ocy, pcz = ic === v ? zu : ocz;
      if (!unitNormal(pax, pay, paz, pbx, pby, pbz, pcx, pcy, pcz, nA)) return NO_MERGE;
      if (nState[t] === 0) {
        if (unitNormal(oax, oay, oaz, obx, oby, obz, ocx, ocy, ocz, nB)) {
          nCache[t * 3] = nB[0];
          nCache[t * 3 + 1] = nB[1];
          nCache[t * 3 + 2] = nB[2];
          nState[t] = 1;
        } else nState[t] = 2;
      }
      if (nState[t] === 2) return NO_MERGE;
      const bx = nCache[t * 3], by = nCache[t * 3 + 1], bz = nCache[t * 3 + 2];
      if (nA[0] * bx + nA[1] * by + nA[2] * bz < cosMax) return NO_MERGE;
      const qNew = quality(pax, pay, paz, pbx, pby, pbz, pcx, pcy, pcz);
      if (qNew < MIN_QUALITY && qNew < quality(oax, oay, oaz, obx, oby, obz, ocx, ocy, ocz)) return NO_MERGE;
      direct = Math.max(direct, Math.abs(nA[0] * (xv - xu) + nA[1] * (yv - yu) + nA[2] * (zv - zu)));
    }
    if (direct > tol * 1.5) return NO_MERGE;
    const cost = Math.max(direct, quad);
    if (cost > tol) return NO_MERGE;
    return cost;
  };

  /** 합친 새 삼각형의 중심·새 변 가운데가 원본 면 밖으로 나가거나 너무 안쪽으로 들어가지 않는지. */
  const insideOriginal = (v, u) => {
    const xu = X[u * 3], yu = X[u * 3 + 1], zu = X[u * 3 + 2];
    const outHalf = outsideTol / 2;
    const okAt = (x, y, z) => {
      const d = sd.queryGlobal(x, y, z);
      return d <= outHalf && d >= -maxInward;
    };
    for (const t of vTris[v]) {
      const o = t * 4;
      if (T[o] === u || T[o + 1] === u || T[o + 2] === u) continue;
      const i0 = T[o], i1 = T[o + 1], i2 = T[o + 2];
      const p0x = i0 === v ? xu : X[i0 * 3], p0y = i0 === v ? yu : X[i0 * 3 + 1], p0z = i0 === v ? zu : X[i0 * 3 + 2];
      const p1x = i1 === v ? xu : X[i1 * 3], p1y = i1 === v ? yu : X[i1 * 3 + 1], p1z = i1 === v ? zu : X[i1 * 3 + 2];
      const p2x = i2 === v ? xu : X[i2 * 3], p2y = i2 === v ? yu : X[i2 * 3 + 1], p2z = i2 === v ? zu : X[i2 * 3 + 2];
      if (!okAt((p0x + p1x + p2x) / 3, (p0y + p1y + p2y) / 3, (p0z + p1z + p2z) / 3)) return false;
      if ((i0 === v || i1 === v) && !okAt((p0x + p1x) / 2, (p0y + p1y) / 2, (p0z + p1z) / 2)) return false;
      if ((i1 === v || i2 === v) && !okAt((p1x + p2x) / 2, (p1y + p2y) / 2, (p1z + p2z) / 2)) return false;
      if ((i2 === v || i0 === v) && !okAt((p2x + p0x) / 2, (p2y + p0y) / 2, (p2z + p0z) / 2)) return false;
    }
    return true;
  };

  const ver = new Uint32Array(nv);
  const removedV = new Uint8Array(nv);
  const heap = new MinHeap();
  /** sd 검사에서 막힌 (v→u) 짝. 둘레가 바뀌면 지운다. */
  const blocked = new Map();
  const enqueue = (v) => {
    if (locked[v] || removedV[v] || !vTris[v]?.length) return;
    const blk = blocked.get(v);
    let best = null;
    for (const u of neighborsOf(v)) {
      if (blk?.has(u)) continue;
      const cost = evaluate(v, u);
      if (cost !== NO_MERGE && (!best || cost < best.cost)) best = { u, cost };
    }
    ver[v] += 1;
    if (best) heap.push(best.cost, { v, u: best.u, ver: ver[v] });
  };
  /**
   * 합치기로 둘레가 바뀐 이웃 w는 새로 생긴 후보 (w→u)만 평가해 힙에 더한다.
   * w의 기존 항목은 버전을 올리지 않고 남긴다. pop 때 evaluate·insideOriginal을 다시 하므로
   * 이제 못 합치는 항목은 거기서 걸러지고 enqueue(w) 전체 재평가로 돌아간다.
   * 병합 순서가 달라질 뿐 병합마다 tol·원본 밖 검사를 그대로 거친다.
   */
  const enqueueToward = (w, u) => {
    if (locked[w] || removedV[w] || !vTris[w]?.length) return;
    const cost = evaluate(w, u);
    if (cost !== NO_MERGE) heap.push(cost, { v: w, u, ver: ver[w] });
  };
  for (let v = 0; v < nv; v += 1) enqueue(v);

  let removed = 0;
  while (heap.size) {
    const { v, u, ver: stamp } = heap.pop();
    if (removedV[v] || ver[v] !== stamp) continue;
    if (removedV[u]) {
      // 목표가 이미 합쳐져 사라졌다. v의 후보를 처음부터 다시 잡는다.
      enqueue(v);
      continue;
    }
    const r = evaluate(v, u);
    if (r === NO_MERGE || !insideOriginal(v, u)) {
      if (r !== NO_MERGE) {
        if (!blocked.has(v)) blocked.set(v, new Set());
        blocked.get(v).add(u);
      }
      enqueue(v);
      continue;
    }
    // 합치기
    for (const t of Array.from(vTris[v])) {
      const hasU = T[t * 4] === u || T[t * 4 + 1] === u || T[t * 4 + 2] === u;
      if (hasU) {
        alive[t] = 0;
        for (let k = 0; k < 3; k += 1) {
          const list = vTris[T[t * 4 + k]];
          const at = list.indexOf(t);
          if (at >= 0) list.splice(at, 1);
        }
      } else {
        for (let k = 0; k < 3; k += 1) if (T[t * 4 + k] === v) T[t * 4 + k] = u;
        nState[t] = 0;
        vTris[u].push(t);
      }
    }
    vTris[v].length = 0;
    removedV[v] = 1;
    for (let k = 0; k < 10; k += 1) Q[u * 10 + k] += Q[v * 10 + k];
    Qn[u] += Qn[v];
    removed += 1;
    ver[u] += 1;
    blocked.delete(u);
    for (const w of neighborsOf(u)) {
      blocked.delete(w);
      enqueueToward(w, u);
    }
    enqueue(u);
  }

  const out = [];
  for (let t = 0; t < tc; t += 1) {
    if (!alive[t]) continue;
    out.push(T[t * 4], T[t * 4 + 1], T[t * 4 + 2], T[t * 4 + 3]);
  }
  return { tri: out, removed, before: tc, after: out.length / 4 };
}
