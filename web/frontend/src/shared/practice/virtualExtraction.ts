// 가상 발치 — 누른 치아의 경계를 찾고, 지운 자리(발치와)를 고른다. three 없이 색인 메시로 계산한다.
// - 2026-09-30: 치아·잇몸 경계는 오목한 주름과 스캔 색(잇몸 붉은 기)으로 잡는다. random walker라 주름이 조금 끊겨도 새지 않는다.
// related files:
// - web/frontend/src/shared/practice/scanMeshEdit.ts
// - web/frontend/src/shared/components/practice/scanMeshEditController.ts

import type { MeshTopology } from "@/shared/practice/scanMeshEdit";

/** 누른 곳에서 이 거리(측지) 안만 본다. 교합면 폭 + 치관 높이를 넘어야 큰 어금니가 다 담긴다. */
export const EXTRACT_PATCH_RADIUS_MM = 18;
/** 누른 곳 둘레는 치아로 고정한다. */
const SOURCE_RADIUS_MM = 0.8;
/** 곡률을 재는 크기. 스캔 잡음보다 크고 치은 열구보다 작다. */
const CURVATURE_SCALE_MM = 0.5;
/** 이보다 오목하면(mm⁻¹) 경계로 본다. */
const CONCAVE_START = 0.15;
const CONCAVE_BETA = 10;
/** 잇몸 붉은 기가 mm당 바뀌는 만큼 끊는다. */
const GUM_BETA = 2.5;
const MIN_WEIGHT = 1e-6;
const CG_MAX_ITER = 900;

export type ToothSegment = {
  seed: number;
  /** 본 정점(전역 번호). */
  patch: Uint32Array;
  /** local[전역] = patch 안 번호, 밖은 -1. */
  local: Int32Array;
  /** patch 정점마다 치아일 정도(0–1). 0.5 이상이 치아다. */
  field: Float32Array;
  /** 세 꼭짓점이 모두 patch 안인 삼각형 번호. */
  tris: Uint32Array;
  /** patch 평균 모서리 길이(기하 단위). */
  edge: number;
  /** 경계가 또렷하지 않아 넓게 잡혔을 수 있다. */
  weak: boolean;
};

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size() {
    return this.keys.length;
  }

  push(key: number, val: number) {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): [number, number] {
    const keys = this.keys;
    const vals = this.vals;
    const topKey = keys[0]!;
    const topVal = vals[0]!;
    const lastKey = keys.pop()!;
    const lastVal = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= lastKey) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return [topKey, topVal];
  }
}

function edgeLen(positions: Float32Array, a: number, b: number) {
  return Math.hypot(
    positions[a * 3]! - positions[b * 3]!,
    positions[a * 3 + 1]! - positions[b * 3 + 1]!,
    positions[a * 3 + 2]! - positions[b * 3 + 2]!,
  );
}

/** seed에서 limit 안 정점까지 측지 거리. 가까운 순서로 돌려준다. */
function geodesic(topo: MeshTopology, positions: Float32Array, seed: number, limit: number) {
  const dist = new Map<number, number>();
  const order: number[] = [];
  const done = new Set<number>();
  const heap = new MinHeap();
  dist.set(seed, 0);
  heap.push(0, seed);
  while (heap.size > 0) {
    const [d, v] = heap.pop();
    if (done.has(v)) continue;
    done.add(v);
    order.push(v);
    for (let i = topo.nbrStart[v]!; i < topo.nbrStart[v + 1]!; i += 1) {
      const u = topo.nbr[i]!;
      if (done.has(u)) continue;
      const nd = d + edgeLen(positions, v, u);
      if (nd > limit) continue;
      const prev = dist.get(u);
      if (prev != null && prev <= nd) continue;
      dist.set(u, nd);
      heap.push(nd, u);
    }
  }
  return { order, dist };
}

function isMeshBoundary(topo: MeshTopology, v: number) {
  const start = topo.nbrStart[v]!;
  const end = topo.nbrStart[v + 1]!;
  for (let i = start; i < end; i += 1) {
    const u = topo.nbr[i]!;
    let count = 0;
    for (let k = start; k < end; k += 1) if (topo.nbr[k] === u) count += 1;
    if (count % 2 === 1) return true;
  }
  return false;
}

function smoothstep(lo: number, hi: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

type LocalGraph = {
  start: Uint32Array;
  nbr: Uint32Array;
};

function localGraph(topo: MeshTopology, patch: Uint32Array, local: Int32Array): LocalGraph {
  const m = patch.length;
  const start = new Uint32Array(m + 1);
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    let count = 0;
    for (let k = topo.nbrStart[v]!; k < topo.nbrStart[v + 1]!; k += 1) {
      if (local[topo.nbr[k]!]! >= 0) count += 1;
    }
    start[i + 1] = start[i]! + count;
  }
  const nbr = new Uint32Array(start[m]!);
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    let at = start[i]!;
    for (let k = topo.nbrStart[v]!; k < topo.nbrStart[v + 1]!; k += 1) {
      const j = local[topo.nbr[k]!]!;
      if (j >= 0) nbr[at++] = j;
    }
  }
  return { start, nbr };
}

function smoothScalar(g: LocalGraph, values: Float32Array, iters: number) {
  const m = values.length;
  const next = new Float32Array(m);
  for (let it = 0; it < iters; it += 1) {
    for (let i = 0; i < m; i += 1) {
      const s = g.start[i]!;
      const e = g.start[i + 1]!;
      if (e <= s) {
        next[i] = values[i]!;
        continue;
      }
      let sum = 0;
      for (let k = s; k < e; k += 1) sum += values[g.nbr[k]!]!;
      next[i] = 0.5 * values[i]! + (0.5 * sum) / (e - s);
    }
    values.set(next);
  }
}

/** 오목할수록 큰 값(mm⁻¹). 볼록은 음수. */
function concavity(
  topo: MeshTopology,
  g: LocalGraph,
  patch: Uint32Array,
  local: Int32Array,
  positions: Float32Array,
  unitToMm: number,
  edge: number,
) {
  const m = patch.length;
  const sp = new Float32Array(m * 3);
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    sp[i * 3] = positions[v * 3]!;
    sp[i * 3 + 1] = positions[v * 3 + 1]!;
    sp[i * 3 + 2] = positions[v * 3 + 2]!;
  }
  const edgeMm = Math.max(edge * unitToMm, 1e-4);
  const iters = Math.max(2, Math.min(40, Math.round((CURVATURE_SCALE_MM / edgeMm) ** 2)));
  const next = new Float32Array(m * 3);
  for (let it = 0; it < iters; it += 1) {
    for (let i = 0; i < m; i += 1) {
      const s = g.start[i]!;
      const e = g.start[i + 1]!;
      for (let d = 0; d < 3; d += 1) {
        if (e <= s) {
          next[i * 3 + d] = sp[i * 3 + d]!;
          continue;
        }
        let sum = 0;
        for (let k = s; k < e; k += 1) sum += sp[g.nbr[k]! * 3 + d]!;
        next[i * 3 + d] = 0.5 * sp[i * 3 + d]! + (0.5 * sum) / (e - s);
      }
    }
    sp.set(next);
  }

  const normals = new Float32Array(m * 3);
  const index = topo.index;
  const seen = new Set<number>();
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    for (let k = topo.triStart[v]!; k < topo.triStart[v + 1]!; k += 1) {
      const t = topo.tris[k]!;
      if (seen.has(t)) continue;
      seen.add(t);
      const a = local[index[t * 3]!]!;
      const b = local[index[t * 3 + 1]!]!;
      const c = local[index[t * 3 + 2]!]!;
      if (a < 0 || b < 0 || c < 0) continue;
      const ux = sp[b * 3]! - sp[a * 3]!;
      const uy = sp[b * 3 + 1]! - sp[a * 3 + 1]!;
      const uz = sp[b * 3 + 2]! - sp[a * 3 + 2]!;
      const wx = sp[c * 3]! - sp[a * 3]!;
      const wy = sp[c * 3 + 1]! - sp[a * 3 + 1]!;
      const wz = sp[c * 3 + 2]! - sp[a * 3 + 2]!;
      const nx = uy * wz - uz * wy;
      const ny = uz * wx - ux * wz;
      const nz = ux * wy - uy * wx;
      for (const j of [a, b, c]) {
        normals[j * 3] += nx;
        normals[j * 3 + 1] += ny;
        normals[j * 3 + 2] += nz;
      }
    }
  }

  const out = new Float32Array(m);
  for (let i = 0; i < m; i += 1) {
    const s = g.start[i]!;
    const e = g.start[i + 1]!;
    const nl = Math.hypot(normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!);
    if (e <= s || nl < 1e-20) continue;
    let mx = 0;
    let my = 0;
    let mz = 0;
    let e2 = 0;
    for (let k = s; k < e; k += 1) {
      const j = g.nbr[k]!;
      const dx = sp[j * 3]! - sp[i * 3]!;
      const dy = sp[j * 3 + 1]! - sp[i * 3 + 1]!;
      const dz = sp[j * 3 + 2]! - sp[i * 3 + 2]!;
      mx += dx;
      my += dy;
      mz += dz;
      e2 += dx * dx + dy * dy + dz * dz;
    }
    const cnt = e - s;
    const dot = ((mx * normals[i * 3]! + my * normals[i * 3 + 1]! + mz * normals[i * 3 + 2]!) / nl) / cnt;
    const meanE2 = e2 / cnt;
    if (meanE2 < 1e-20) continue;
    out[i] = (2 * dot) / meanE2 / unitToMm;
  }
  smoothScalar(g, out, 2);
  return out;
}

/** 잇몸 붉은 기(0–1). 색이 없으면 null. */
function gumness(patch: Uint32Array, color: Float32Array | null, g: LocalGraph) {
  if (!color) return null;
  const m = patch.length;
  const out = new Float32Array(m);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    const r = color[v * 3]!;
    const gg = color[v * 3 + 1]!;
    const b = color[v * 3 + 2]!;
    const red = r - (gg + b) / 2;
    out[i] = smoothstep(0.08, 0.22, red);
    lo = Math.min(lo, out[i]!);
    hi = Math.max(hi, out[i]!);
  }
  if (hi - lo < 0.2) return null;
  smoothScalar(g, out, 2);
  return out;
}

/** 경계(sink=0)와 누른 곳(source=1)을 고정하고 조화 함수를 푼다. */
function solveWalker(
  g: LocalGraph,
  w: Float32Array,
  fixed: Int8Array,
  x: Float32Array,
) {
  const m = x.length;
  const diag = new Float32Array(m);
  for (let i = 0; i < m; i += 1) {
    let d = 0;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) d += w[k]!;
    diag[i] = Math.max(d, 1e-12);
  }
  const r = new Float64Array(m);
  const z = new Float64Array(m);
  const p = new Float64Array(m);
  const q = new Float64Array(m);
  let rz = 0;
  for (let i = 0; i < m; i += 1) {
    if (fixed[i] !== 0) continue;
    let s = 0;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) s += w[k]! * x[g.nbr[k]!]!;
    r[i] = s - diag[i]! * x[i]!;
    z[i] = r[i]! / diag[i]!;
    p[i] = z[i]!;
    rz += r[i]! * z[i]!;
  }
  const rz0 = rz;
  if (rz0 <= 0) return;
  for (let it = 0; it < CG_MAX_ITER; it += 1) {
    let pq = 0;
    for (let i = 0; i < m; i += 1) {
      if (fixed[i] !== 0) continue;
      let s = diag[i]! * p[i]!;
      for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
        const j = g.nbr[k]!;
        if (fixed[j] === 0) s -= w[k]! * p[j]!;
      }
      q[i] = s;
      pq += p[i]! * s;
    }
    if (pq <= 0) break;
    const alpha = rz / pq;
    let nextRz = 0;
    for (let i = 0; i < m; i += 1) {
      if (fixed[i] !== 0) continue;
      x[i] += alpha * p[i]!;
      r[i] -= alpha * q[i]!;
      z[i] = r[i]! / diag[i]!;
      nextRz += r[i]! * z[i]!;
    }
    if (nextRz < rz0 * 1e-10) break;
    const beta = nextRz / rz;
    rz = nextRz;
    for (let i = 0; i < m; i += 1) {
      if (fixed[i] !== 0) continue;
      p[i] = z[i]! + beta * p[i]!;
    }
  }
  for (let i = 0; i < m; i += 1) x[i] = Math.max(0, Math.min(1, x[i]!));
}

/** 치아 쪽 조각만 남기고, 치아 안에 갇힌 틈(열구 등)은 채운다. */
function cleanField(
  g: LocalGraph,
  field: Float32Array,
  seedLocal: number,
  open: Uint8Array,
) {
  const m = field.length;
  const keep = new Uint8Array(m);
  const stack = [seedLocal];
  keep[seedLocal] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      if (keep[j] || field[j]! < 0.5) continue;
      keep[j] = 1;
      stack.push(j);
    }
  }
  for (let i = 0; i < m; i += 1) {
    if (field[i]! >= 0.5 && !keep[i]) field[i] = 0.4;
  }
  const seen = new Uint8Array(m);
  for (let i = 0; i < m; i += 1) {
    if (seen[i] || keep[i]) continue;
    const comp: number[] = [];
    let enclosed = true;
    seen[i] = 1;
    const st = [i];
    while (st.length > 0) {
      const a = st.pop()!;
      comp.push(a);
      if (open[a]) enclosed = false;
      for (let k = g.start[a]!; k < g.start[a + 1]!; k += 1) {
        const b = g.nbr[k]!;
        if (seen[b] || keep[b]) continue;
        seen[b] = 1;
        st.push(b);
      }
    }
    if (enclosed) for (const a of comp) field[a] = Math.max(field[a]!, 0.6);
  }
}

/**
 * seed가 있는 치아를 찾는다. blocked(다른 치아로 이미 고른 정점)는 치아 밖으로 둔다.
 * 스캔이 너무 작거나 seed가 막혀 있으면 null.
 */
export function segmentTooth(args: {
  topo: MeshTopology;
  positions: Float32Array;
  color: Float32Array | null;
  seed: number;
  unitToMm: number;
  blocked?: (v: number) => boolean;
}): ToothSegment | null {
  const { topo, positions, color, seed } = args;
  const unit = Math.max(args.unitToMm, 1e-9);
  const radius = EXTRACT_PATCH_RADIUS_MM / unit;
  const { order, dist } = geodesic(topo, positions, seed, radius);
  if (order.length < 30) return null;
  const patch = Uint32Array.from(order);
  const local = new Int32Array(topo.vertexCount).fill(-1);
  patch.forEach((v, i) => {
    local[v] = i;
  });
  const g = localGraph(topo, patch, local);
  const m = patch.length;

  let edgeSum = 0;
  let edgeCount = 0;
  for (let i = 0; i < m; i += 1) {
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      edgeSum += edgeLen(positions, patch[i]!, patch[g.nbr[k]!]!);
      edgeCount += 1;
    }
  }
  const edge = edgeCount > 0 ? edgeSum / edgeCount : 1;

  const concave = concavity(topo, g, patch, local, positions, unit, edge);
  const gum = gumness(patch, color, g);
  const w = new Float32Array(g.nbr.length);
  for (let i = 0; i < m; i += 1) {
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      const c = (concave[i]! + concave[j]!) / 2;
      let weight = Math.exp(-CONCAVE_BETA * Math.max(0, c - CONCAVE_START));
      if (gum) {
        const lenMm = Math.max(edgeLen(positions, patch[i]!, patch[j]!) * unit, 0.02);
        weight *= Math.exp((-GUM_BETA * Math.abs(gum[i]! - gum[j]!)) / lenMm);
      }
      w[k] = Math.max(weight, MIN_WEIGHT);
    }
  }

  const fixed = new Int8Array(m);
  const x = new Float32Array(m);
  const open = new Uint8Array(m);
  const sourceR = SOURCE_RADIUS_MM / unit;
  let sinks = 0;
  let maxDist = 0;
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    const d = dist.get(v) ?? 0;
    maxDist = Math.max(maxDist, d);
    let frontier = false;
    for (let k = topo.nbrStart[v]!; k < topo.nbrStart[v + 1]!; k += 1) {
      if (local[topo.nbr[k]!]! < 0) {
        frontier = true;
        break;
      }
    }
    if (frontier || isMeshBoundary(topo, v)) open[i] = 1;
    if (args.blocked?.(v)) {
      fixed[i] = -1;
      open[i] = 1;
      sinks += 1;
    } else if (d <= sourceR) {
      fixed[i] = 1;
      x[i] = 1;
    } else if (frontier) {
      fixed[i] = -1;
      sinks += 1;
    }
  }
  if (fixed[0] !== 1) return null;
  if (sinks === 0) {
    for (let i = 0; i < m; i += 1) {
      if (fixed[i] === 0 && (dist.get(patch[i]!) ?? 0) >= maxDist * 0.9) {
        fixed[i] = -1;
        open[i] = 1;
        sinks += 1;
      }
    }
    if (sinks === 0) return null;
  }

  // 시작값: 누른 곳에서 경계를 넘지 않고 닿는 곳은 1.
  const stack: number[] = [];
  for (let i = 0; i < m; i += 1) if (fixed[i] === 1) stack.push(i);
  const reached = new Uint8Array(m);
  for (const i of stack) reached[i] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      if (reached[j] || fixed[j] !== 0 || w[k]! < 0.1) continue;
      reached[j] = 1;
      x[j] = 1;
      stack.push(j);
    }
  }

  solveWalker(g, w, fixed, x);
  cleanField(g, x, 0, open);

  // 치아가 탐색 한계까지 닿았으면 경계를 못 찾고 샜을 수 있다.
  let regionCount = 0;
  let reachesLimit = false;
  for (let i = 0; i < m; i += 1) {
    if (x[i]! < 0.5) continue;
    regionCount += 1;
    if (reachesLimit) continue;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      if (fixed[j] === -1 && !args.blocked?.(patch[j]!)) {
        reachesLimit = true;
        break;
      }
    }
  }

  const triSet = new Set<number>();
  const index = topo.index;
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    for (let k = topo.triStart[v]!; k < topo.triStart[v + 1]!; k += 1) {
      const t = topo.tris[k]!;
      if (
        local[index[t * 3]!]! >= 0 &&
        local[index[t * 3 + 1]!]! >= 0 &&
        local[index[t * 3 + 2]!]! >= 0
      ) {
        triSet.add(t);
      }
    }
  }

  return {
    seed,
    patch,
    local,
    field: x,
    tris: Uint32Array.from(triSet),
    edge,
    weak: regionCount < 30 || reachesLimit,
  };
}

/** 경계를 정점 고리 rings만큼 밀거나 당긴다. */
export function growToothField(
  topo: MeshTopology,
  seg: ToothSegment,
  rings: number,
  grow: boolean,
) {
  const { patch, local, field } = seg;
  for (let r = 0; r < rings; r += 1) {
    const flip: number[] = [];
    for (let i = 0; i < patch.length; i += 1) {
      const inside = field[i]! >= 0.5;
      if (inside === grow) continue;
      const v = patch[i]!;
      for (let k = topo.nbrStart[v]!; k < topo.nbrStart[v + 1]!; k += 1) {
        const j = local[topo.nbr[k]!]!;
        if (j < 0) continue;
        if (field[j]! >= 0.5 === grow) {
          flip.push(i);
          break;
        }
      }
    }
    if (flip.length === 0) break;
    for (const i of flip) field[i] = grow ? 0.75 : 0.25;
  }
}

/** 치아 경계선. field 0.5 등치선을 선분 쌍(x y z × 2)으로 돌려준다. */
export function toothBorderSegments(
  topo: MeshTopology,
  positions: Float32Array,
  seg: ToothSegment,
): Float32Array {
  const out: number[] = [];
  const index = topo.index;
  const { local, field } = seg;
  const at = (a: number, b: number) => {
    const fa = field[local[a]!]!;
    const fb = field[local[b]!]!;
    const t = (0.5 - fa) / (fb - fa || 1e-9);
    out.push(
      positions[a * 3]! + (positions[b * 3]! - positions[a * 3]!) * t,
      positions[a * 3 + 1]! + (positions[b * 3 + 1]! - positions[a * 3 + 1]!) * t,
      positions[a * 3 + 2]! + (positions[b * 3 + 2]! - positions[a * 3 + 2]!) * t,
    );
  };
  for (const t of seg.tris) {
    const a = index[t * 3]!;
    const b = index[t * 3 + 1]!;
    const c = index[t * 3 + 2]!;
    const ia = field[local[a]!]! >= 0.5;
    const ib = field[local[b]!]! >= 0.5;
    const ic = field[local[c]!]! >= 0.5;
    if (ia === ib && ib === ic) continue;
    if (ia !== ib) at(a, b);
    if (ib !== ic) at(b, c);
    if (ic !== ia) at(c, a);
  }
  return Float32Array.from(out);
}

/**
 * 지울 정점을 닫는다(넓혔다 좁히기). 붙은 두 치아 사이에 남는 얇은 띠와 톱니 경계를 없앤다.
 * mask를 바로 고친다.
 */
export function closeMask(topo: MeshTopology, mask: Uint8Array, rings: number) {
  const n = topo.vertexCount;
  const step = (on: 0 | 1) => {
    const flip: number[] = [];
    for (let v = 0; v < n; v += 1) {
      if (mask[v] === on) continue;
      for (let k = topo.nbrStart[v]!; k < topo.nbrStart[v + 1]!; k += 1) {
        if (mask[topo.nbr[k]!] === on) {
          flip.push(v);
          break;
        }
      }
    }
    for (const v of flip) mask[v] = on;
  };
  for (let r = 0; r < rings; r += 1) step(1);
  for (let r = 0; r < rings; r += 1) step(0);
}

/** mask가 스캔 가장자리에 닿았는지. 닿으면 발치와가 바깥 테두리와 이어져 메울 수 없다. */
export function maskTouchesMeshBoundary(topo: MeshTopology, mask: Uint8Array) {
  for (let v = 0; v < topo.vertexCount; v += 1) {
    if (!mask[v]) continue;
    for (let k = topo.nbrStart[v]!; k < topo.nbrStart[v + 1]!; k += 1) {
      const u = topo.nbr[k]!;
      if (!mask[u] && isMeshBoundary(topo, u)) return true;
    }
    if (isMeshBoundary(topo, v)) return true;
  }
  return false;
}

/** mask 둘레(지우지 않는 이웃 정점). */
export function maskRim(topo: MeshTopology, mask: Uint8Array) {
  const rim = new Uint8Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v += 1) {
    if (mask[v]) continue;
    for (let k = topo.nbrStart[v]!; k < topo.nbrStart[v + 1]!; k += 1) {
      if (mask[topo.nbr[k]!]) {
        rim[v] = 1;
        break;
      }
    }
  }
  return rim;
}

/** mask의 이어진 덩어리 수. 발치와 수와 같다. */
export function maskComponentCount(topo: MeshTopology, mask: Uint8Array) {
  const seen = new Uint8Array(topo.vertexCount);
  let count = 0;
  for (let v = 0; v < topo.vertexCount; v += 1) {
    if (!mask[v] || seen[v]) continue;
    count += 1;
    seen[v] = 1;
    const stack = [v];
    while (stack.length > 0) {
      const a = stack.pop()!;
      for (let k = topo.nbrStart[a]!; k < topo.nbrStart[a + 1]!; k += 1) {
        const b = topo.nbr[k]!;
        if (!mask[b] || seen[b]) continue;
        seen[b] = 1;
        stack.push(b);
      }
    }
  }
  return count;
}
