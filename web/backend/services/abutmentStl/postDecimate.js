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
      (vTris[v] ||= new Set()).add(t);
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

  const neighborsOf = (v) => {
    const set = new Set();
    for (const t of vTris[v]) {
      for (let k = 0; k < 3; k += 1) {
        const w = T[t * 4 + k];
        if (w !== v) set.add(w);
      }
    }
    return set;
  };

  /** v를 u로 합친다. 가능하면 { cost, fan }(fan: u가 없는 v 둘레 면), 아니면 null. sd 검사는 따로. */
  const evaluate = (v, u) => {
    const shared = [];
    const fan = [];
    for (const t of vTris[v]) {
      if (T[t * 4] === u || T[t * 4 + 1] === u || T[t * 4 + 2] === u) shared.push(t);
      else fan.push(t);
    }
    if (shared.length !== 2 || !fan.length) return null;
    const opp = shared.map((t) => {
      for (let k = 0; k < 3; k += 1) {
        const w = T[t * 4 + k];
        if (w !== v && w !== u) return w;
      }
      return -1;
    });
    const nv1 = neighborsOf(v);
    const nu1 = neighborsOf(u);
    let common = 0;
    for (const w of nv1) {
      if (w !== u && nu1.has(w)) {
        if (w !== opp[0] && w !== opp[1]) return null;
        common += 1;
      }
    }
    if (common !== 2) return null;

    const xv = X[v * 3], yv = X[v * 3 + 1], zv = X[v * 3 + 2];
    const xu = X[u * 3], yu = X[u * 3 + 1], zu = X[u * 3 + 2];
    let direct = 0;
    for (const t of fan) {
      const ids = [T[t * 4], T[t * 4 + 1], T[t * 4 + 2]];
      const P = ids.map((w) => (w === v ? [xu, yu, zu] : [X[w * 3], X[w * 3 + 1], X[w * 3 + 2]]));
      const O = ids.map((w) => [X[w * 3], X[w * 3 + 1], X[w * 3 + 2]]);
      const nrm = (A) => {
        const ux = A[1][0] - A[0][0], uy = A[1][1] - A[0][1], uz = A[1][2] - A[0][2];
        const vx = A[2][0] - A[0][0], vy = A[2][1] - A[0][1], vz = A[2][2] - A[0][2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        return l > 0 ? [nx / l, ny / l, nz / l] : null;
      };
      const nn = nrm(P);
      const no = nrm(O);
      if (!nn || !no) return null;
      if (nn[0] * no[0] + nn[1] * no[1] + nn[2] * no[2] < cosMax) return null;
      const qNew = quality(...P[0], ...P[1], ...P[2]);
      if (qNew < MIN_QUALITY && qNew < quality(...O[0], ...O[1], ...O[2])) return null;
      direct = Math.max(direct, Math.abs(nn[0] * (xv - xu) + nn[1] * (yv - yu) + nn[2] * (zv - zu)));
    }
    if (direct > tol * 1.5) return null;
    const cost = Math.max(direct, quadricAt(v, xu, yu, zu));
    if (cost > tol) return null;
    return { cost, fan };
  };

  /** 합친 새 삼각형의 중심·새 변 가운데가 원본 면 밖으로 나가거나 너무 안쪽으로 들어가지 않는지. */
  const insideOriginal = (v, u, fan) => {
    const xu = X[u * 3], yu = X[u * 3 + 1], zu = X[u * 3 + 2];
    const okAt = (x, y, z) => {
      const d = sd.queryGlobal(x, y, z);
      return d <= outsideTol / 2 && d >= -maxInward;
    };
    for (const t of fan) {
      const ids = [T[t * 4], T[t * 4 + 1], T[t * 4 + 2]];
      const P = ids.map((w) => (w === v ? [xu, yu, zu] : [X[w * 3], X[w * 3 + 1], X[w * 3 + 2]]));
      if (!okAt((P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3, (P[0][2] + P[1][2] + P[2][2]) / 3)) return false;
      for (let k = 0; k < 3; k += 1) {
        if (ids[k] === v || ids[(k + 1) % 3] === v) {
          const A = P[k];
          const B = P[(k + 1) % 3];
          if (!okAt((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2)) return false;
        }
      }
    }
    return true;
  };

  const ver = new Uint32Array(nv);
  const removedV = new Uint8Array(nv);
  const heap = new MinHeap();
  /** sd 검사에서 막힌 (v→u) 짝. 둘레가 바뀌면 지운다. */
  const blocked = new Map();
  const enqueue = (v) => {
    if (locked[v] || removedV[v] || !vTris[v]?.size) return;
    const blk = blocked.get(v);
    let best = null;
    for (const u of neighborsOf(v)) {
      if (blk?.has(u)) continue;
      const r = evaluate(v, u);
      if (r && (!best || r.cost < best.cost)) best = { u, cost: r.cost };
    }
    ver[v] += 1;
    if (best) heap.push(best.cost, { v, u: best.u, ver: ver[v] });
  };
  for (let v = 0; v < nv; v += 1) enqueue(v);

  let removed = 0;
  while (heap.size) {
    const { v, u, ver: stamp } = heap.pop();
    if (removedV[v] || ver[v] !== stamp || removedV[u]) continue;
    const r = evaluate(v, u);
    if (!r || !insideOriginal(v, u, r.fan)) {
      if (r) {
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
        for (let k = 0; k < 3; k += 1) vTris[T[t * 4 + k]].delete(t);
      } else {
        for (let k = 0; k < 3; k += 1) if (T[t * 4 + k] === v) T[t * 4 + k] = u;
        vTris[u].add(t);
      }
    }
    vTris[v].clear();
    removedV[v] = 1;
    for (let k = 0; k < 10; k += 1) Q[u * 10 + k] += Q[v * 10 + k];
    Qn[u] += Qn[v];
    removed += 1;
    ver[u] += 1;
    blocked.delete(u);
    for (const w of neighborsOf(u)) {
      blocked.delete(w);
      enqueue(w);
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
