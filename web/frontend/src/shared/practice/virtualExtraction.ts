// 가상 발치 — 누른 치아의 경계를 찾고, 지운 자리(발치와)를 고른다. three 없이 색인 메시로 계산한다.
// - 2026-09-30: 치아·잇몸 경계는 오목한 주름과 스캔 색(잇몸 붉은 기)으로 잡는다. random walker라 주름이 조금 끊겨도 새지 않는다.
// - 2026-10-04: 치관 경계 아래·안쪽에 남는 잔존 치근·파절편을 같은 치아에 넣는다.
// - 2026-10-04: 넓은 인접면 컨택으로 붙은 다른 치아는 목에서 잘라 누른 치아만 남긴다.
// - 2026-10-04: 치아·잇몸 색(누른 곳보다 붉은지)으로 경계를 두고, 협측처럼 이어진 치아색은 넣는다.
// related files:
// - web/frontend/src/shared/practice/scanMeshEdit.ts
// - web/frontend/src/shared/components/practice/scanMeshEditController.ts

import { outerBoundaryMask, type MeshTopology } from "@/shared/practice/scanMeshEdit";

/** 누른 곳에서 이 거리(측지) 안만 본다. 교합면 폭 + 치관 높이를 넘어야 큰 어금니가 다 담긴다. */
export const EXTRACT_PATCH_RADIUS_MM = 16;
/** 치아 한 개의 크기는 거의 정해져 있다(어금니 치관 폭 약 12mm, 높이 약 8mm). 중심에서 이 반지름(mm) 밖은 치아가 아니다. */
const TOOTH_CAP_RADIUS_MM = 6;
const TOOTH_CAP_ITERS = 4;
const RECENTER_PASSES = 3;
const RECENTER_MIN_MM = 0.8;
const RECENTER_MAX_MM = 5;
/** 누른 곳 둘레는 치아로 고정한다. */
const SOURCE_RADIUS_MM = 0.8;
/** 치관 발치선에서 이만큼(측지)까지 치근을 더 담는다. */
const RESIDUAL_REACH_MM = 6;
/** 치관 발자국을 이만큼 넓혀 치근이 살짝 바깥으로 나온 것도 담는다. */
const RESIDUAL_HULL_PAD_MM = 0.9;
/** 치은선보다 이만큼 교합 쪽으로 올라온 치근 허리도 치아로 본다. */
const RESIDUAL_APICAL_SLACK_MM = 1.2;
/** 이보다 잇몸 붉은 기가 크면 치근이 아니다. */
const RESIDUAL_GUM_CUTOFF = 0.4;
/** 붙은 두 치아를 가르기 위해 컨택 목을 이만큼까지 줄인다. */
const CONTACT_SPLIT_MAX_MM = 5.5;
/** 다른 덩어리가 이 비율(또는 정점 수)보다 커야 인접치로 본다. */
const CONTACT_SPLIT_MIN_FRAC = 0.1;
const CONTACT_SPLIT_MIN_VERTS = 36;
/** 곡률을 재는 크기. 스캔 잡음보다 크고 치은 열구보다 작다. */
const CURVATURE_SCALE_MM = 0.5;
/** 이보다 오목하면(mm⁻¹) 경계로 본다. */
const CONCAVE_START = 0.15;
const CONCAVE_BETA = 10;
/** 잇몸 색이 mm당 바뀌는 만큼 끊는다. */
const GUM_BETA = 4;
/** 누른 치아보다 이만큼 더 붉으면(R−G) 잇몸으로 본다. */
const GUM_RG_LO = 0.045;
const GUM_RG_HI = 0.13;
/** 이 이상이면 잇몸으로 고정한다. */
const GUM_SINK = 0.58;
/** 이 이하면 치아색으로 이어 간다. */
const TOOTH_LIKE = 0.38;
/** 치아색끼리 오목해도 협측으로 넘어갈 최소 가중치. */
const TOOTH_EDGE_FLOOR = 0.02;
const MIN_WEIGHT = 1e-6;
/** 치아색 확장이 넘지 못하는 오목 장벽(인접 치아 사이 틈). */
const EXPAND_BARRIER_MIN = 0.25;
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

/** 잇몸일 정도(0–1). 누른 곳의 R−G를 기준으로, 더 붉으면 잇몸이다. 노란 치아가 잇몸으로 안 잡히게 G가 아니라 평균에서 빼지 않는다. */
function gumness(patch: Uint32Array, color: Float32Array | null, g: LocalGraph, seedLocal = 0) {
  if (!color) return null;
  const m = patch.length;
  const rg = new Float32Array(m);
  for (let i = 0; i < m; i += 1) {
    const v = patch[i]!;
    rg[i] = color[v * 3]! - color[v * 3 + 1]!;
  }
  let seedRg = rg[seedLocal]!;
  let seedN = 1;
  for (let k = g.start[seedLocal]!; k < g.start[seedLocal + 1]!; k += 1) {
    seedRg += rg[g.nbr[k]!]!;
    seedN += 1;
  }
  seedRg /= seedN;
  const out = new Float32Array(m);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < m; i += 1) {
    out[i] = smoothstep(GUM_RG_LO, GUM_RG_HI, rg[i]! - seedRg);
    lo = Math.min(lo, out[i]!);
    hi = Math.max(hi, out[i]!);
  }
  if (hi - lo < 0.12) return null;
  smoothScalar(g, out, 2);
  return out;
}

/** 누른 곳에서 치아색으로 이어진 면(협측 포함)을 치아에 넣는다. 잇몸색에서 멈춘다. */
function expandThroughToothColor(
  g: LocalGraph,
  field: Float32Array,
  gum: Float32Array,
  seedLocal: number,
  blocked?: (i: number) => boolean,
  barrier?: Float32Array,
) {
  const m = field.length;
  const seen = new Uint8Array(m);
  const stack = [seedLocal];
  seen[seedLocal] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (gum[i]! <= TOOTH_LIKE) field[i] = Math.max(field[i]!, 0.62);
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      if (seen[j] || gum[j]! > TOOTH_LIKE || blocked?.(j)) continue;
      if (barrier && barrier[k]! < EXPAND_BARRIER_MIN) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
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
 * 치아 크기 상한. 누른 곳에서 이어진 영역의 중심을 구해 그 둘레 구(球) 안만 남긴다.
 * 중심은 구 안 영역의 무게중심으로 몇 번 옮겨, 누른 곳이 치아 가장자리여도 치아 가운데로 모인다.
 */
function capToothSize(
  g: LocalGraph,
  positions: Float32Array,
  patch: Uint32Array,
  field: Float32Array,
  seedLocal: number,
  unit: number,
) {
  const m = field.length;
  const radius = TOOTH_CAP_RADIUS_MM / unit;
  const px = (i: number, k: number) => positions[patch[i]! * 3 + k]!;
  let cx = px(seedLocal, 0);
  let cy = px(seedLocal, 1);
  let cz = px(seedLocal, 2);
  const inside = new Uint8Array(m);
  const connect = (r2: number) => {
    inside.fill(0);
    const st = [seedLocal];
    inside[seedLocal] = 1;
    while (st.length > 0) {
      const i = st.pop()!;
      for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
        const j = g.nbr[k]!;
        if (inside[j] || field[j]! < 0.5) continue;
        const dx = px(j, 0) - cx;
        const dy = px(j, 1) - cy;
        const dz = px(j, 2) - cz;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        inside[j] = 1;
        st.push(j);
      }
    }
  };
  for (let it = 0; it < TOOTH_CAP_ITERS; it += 1) {
    connect(radius * radius * 1.35);
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < m; i += 1) {
      if (!inside[i]) continue;
      n += 1;
      sx += px(i, 0);
      sy += px(i, 1);
      sz += px(i, 2);
    }
    if (n === 0) break;
    cx = sx / n;
    cy = sy / n;
    cz = sz / n;
  }
  connect(radius * radius);
  for (let i = 0; i < m; i += 1) {
    if (field[i]! >= 0.5 && !inside[i]) field[i] = 0.3;
  }
}

function maskComponents(g: LocalGraph, mask: Uint8Array) {
  const m = mask.length;
  const id = new Int32Array(m).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < m; i += 1) {
    if (!mask[i] || id[i] >= 0) continue;
    const cid = sizes.length;
    let size = 0;
    const stack = [i];
    id[i] = cid;
    while (stack.length > 0) {
      const a = stack.pop()!;
      size += 1;
      for (let k = g.start[a]!; k < g.start[a + 1]!; k += 1) {
        const b = g.nbr[k]!;
        if (!mask[b] || id[b] >= 0) continue;
        id[b] = cid;
        stack.push(b);
      }
    }
    sizes.push(size);
  }
  return { id, sizes };
}

function erodeMask(g: LocalGraph, mask: Uint8Array) {
  const m = mask.length;
  const next = new Uint8Array(mask);
  for (let i = 0; i < m; i += 1) {
    if (!mask[i]) continue;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      if (!mask[g.nbr[k]!]) {
        next[i] = 0;
        break;
      }
    }
  }
  return next;
}

/**
 * 땅콩처럼 붙은 두 치아를 컨택 목에서 가른다. 표면 바깥에서 줄이면 목만 끊기고 한 치아의 교두는 남는다.
 * 누른 쪽 덩어리만 치아로 두고, 목은 가까운 쪽으로 나눈다.
 */
function splitContactLeak(
  g: LocalGraph,
  field: Float32Array,
  seedLocal: number,
  edge: number,
  unit: number,
) {
  const m = field.length;
  const orig = new Uint8Array(m);
  let origCount = 0;
  for (let i = 0; i < m; i += 1) {
    if (field[i]! < 0.5) continue;
    orig[i] = 1;
    origCount += 1;
  }
  if (origCount < CONTACT_SPLIT_MIN_VERTS * 2) return;

  const minOther = Math.max(CONTACT_SPLIT_MIN_VERTS, Math.round(origCount * CONTACT_SPLIT_MIN_FRAC));
  const maxRings = Math.max(2, Math.round(CONTACT_SPLIT_MAX_MM / unit / Math.max(edge, 1e-9)));
  let eroded = orig;
  let split: ReturnType<typeof maskComponents> | null = null;
  let seedComp = -1;

  for (let r = 0; r < maxRings; r += 1) {
    eroded = erodeMask(g, eroded);
    const parts = maskComponents(g, eroded);
    let seedAt = parts.id[seedLocal]!;
    if (seedAt < 0) {
      const q = [seedLocal];
      const seen = new Uint8Array(m);
      seen[seedLocal] = 1;
      let hq = 0;
      while (hq < q.length) {
        const a = q[hq++]!;
        if (parts.id[a]! >= 0) {
          seedAt = parts.id[a]!;
          break;
        }
        for (let k = g.start[a]!; k < g.start[a + 1]!; k += 1) {
          const b = g.nbr[k]!;
          if (!orig[b] || seen[b]) continue;
          seen[b] = 1;
          q.push(b);
        }
      }
    }
    if (seedAt < 0) break;
    const other = parts.sizes.some((size, c) => c !== seedAt && size >= minOther);
    if (!other) continue;
    split = parts;
    seedComp = seedAt;
    break;
  }
  if (!split || seedComp < 0) return;

  const label = new Int8Array(m);
  const queue: number[] = [];
  let head = 0;
  for (let i = 0; i < m; i += 1) {
    const c = split.id[i]!;
    if (c < 0) continue;
    if (c === seedComp) {
      label[i] = 1;
      queue.push(i);
    } else if (split.sizes[c]! >= minOther) {
      label[i] = -1;
      queue.push(i);
    }
  }
  while (head < queue.length) {
    const i = queue[head++]!;
    const lab = label[i]!;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      if (!orig[j] || label[j]) continue;
      label[j] = lab;
      queue.push(j);
    }
  }
  if (label[seedLocal] !== 1) return;
  for (let i = 0; i < m; i += 1) {
    if (!orig[i]) continue;
    field[i] = label[i] === 1 ? Math.max(field[i]!, 0.62) : Math.min(field[i]!, 0.35);
  }
}

export function splitContactLeakOnSeg(topo: MeshTopology, seg: ToothSegment, unitToMm: number) {
  const j = seg.local[seg.seed]!;
  if (j < 0) return;
  splitContactLeak(localGraph(topo, seg.patch, seg.local), seg.field, j, seg.edge, Math.max(unitToMm, 1e-9));
}

/**
 * seed가 있는 치아를 찾는다. blocked(다른 치아로 이미 고른 정점)는 치아 밖으로 둔다.
 * 스캔이 너무 작거나 seed가 막혀 있으면 null.
 */
function segmentToothOnce(args: {
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
  const gum = gumness(patch, color, g, 0);
  const w = new Float32Array(g.nbr.length);
  const barrier = new Float32Array(g.nbr.length);
  for (let i = 0; i < m; i += 1) {
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      const c = (concave[i]! + concave[j]!) / 2;
      let weight = Math.exp(-CONCAVE_BETA * Math.max(0, c - CONCAVE_START));
      barrier[k] = weight;
      if (gum) {
        const lenMm = Math.max(edgeLen(positions, patch[i]!, patch[j]!) * unit, 0.02);
        let gumTerm = Math.exp((-GUM_BETA * Math.abs(gum[i]! - gum[j]!)) / lenMm);
        if (gum[i]! <= TOOTH_LIKE && gum[j]! <= TOOTH_LIKE) {
          gumTerm = Math.max(gumTerm, TOOTH_EDGE_FLOOR);
        }
        weight *= gumTerm;
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
    } else if (gum && gum[i]! >= GUM_SINK) {
      fixed[i] = -1;
      x[i] = 0;
      sinks += 1;
    } else if (frontier && (!gum || gum[i]! > TOOTH_LIKE)) {
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
      if (reached[j] || fixed[j] !== 0) continue;
      const toothEdge = gum && gum[i]! <= TOOTH_LIKE && gum[j]! <= TOOTH_LIKE;
      if (barrier[k]! < EXPAND_BARRIER_MIN) continue;
      if (!toothEdge && w[k]! < 0.1) continue;
      reached[j] = 1;
      x[j] = 1;
      stack.push(j);
    }
  }

  solveWalker(g, w, fixed, x);
  if (gum) {
    expandThroughToothColor(g, x, gum, 0, (i) => args.blocked?.(patch[i]!) === true, barrier);
  }
  capToothSize(g, positions, patch, x, 0, unit);
  cleanField(g, x, 0, open);
  splitContactLeak(g, x, 0, edge, unit);
  includeResidualRoot({
    topo,
    positions,
    color,
    unitToMm: unit,
    patch,
    local,
    field: x,
    seed,
    blocked: args.blocked,
  });
  splitContactLeak(g, x, 0, edge, unit);
  capToothSize(g, positions, patch, x, 0, unit);
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

/**
 * 누른 곳이 치아 가장자리여도 같은 치아가 나오게, 찾은 영역의 중심으로 시작점을 옮겨 다시 찾는다.
 * 치아 한 개 크기가 거의 정해져 있어 중심이 안정되면 어디를 눌러도 같은 영역으로 모인다.
 */
export function segmentTooth(args: Parameters<typeof segmentToothOnce>[0]): ToothSegment | null {
  const unit = Math.max(args.unitToMm, 1e-9);
  let seg = segmentToothOnce(args);
  if (!seg) return null;
  const pos = args.positions;
  for (let pass = 0; pass < RECENTER_PASSES; pass += 1) {
    let n = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < seg.patch.length; i += 1) {
      if (seg.field[i]! < 0.5) continue;
      const v = seg.patch[i]!;
      n += 1;
      cx += pos[v * 3]!;
      cy += pos[v * 3 + 1]!;
      cz += pos[v * 3 + 2]!;
    }
    if (n < 30) break;
    cx /= n;
    cy /= n;
    cz /= n;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < seg.patch.length; i += 1) {
      if (seg.field[i]! < 0.5) continue;
      const v = seg.patch[i]!;
      const d = (pos[v * 3]! - cx) ** 2 + (pos[v * 3 + 1]! - cy) ** 2 + (pos[v * 3 + 2]! - cz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    if (best < 0 || best === seg.seed) break;
    const ox = pos[args.seed * 3]! - pos[best * 3]!;
    const oy = pos[args.seed * 3 + 1]! - pos[best * 3 + 1]!;
    const oz = pos[args.seed * 3 + 2]! - pos[best * 3 + 2]!;
    // 누른 곳에서 크게 벗어나면 이웃 치아로 옮겨 간 것이다.
    if (Math.sqrt(ox * ox + oy * oy + oz * oz) * unit > RECENTER_MAX_MM) break;
    const sx = pos[seg.seed * 3]! - pos[best * 3]!;
    const sy = pos[seg.seed * 3 + 1]! - pos[best * 3 + 1]!;
    const sz = pos[seg.seed * 3 + 2]! - pos[best * 3 + 2]!;
    if (Math.sqrt(sx * sx + sy * sy + sz * sz) * unit < RECENTER_MIN_MM) break;
    const next = segmentToothOnce({ ...args, seed: best });
    if (!next) break;
    seg = next;
  }
  return seg;
}

function toothBasis(topo: MeshTopology, positions: Float32Array, patch: Uint32Array, local: Int32Array, field: Float32Array) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const index = topo.index;
  const seen = new Set<number>();
  for (let i = 0; i < patch.length; i += 1) {
    if (field[i]! < 0.5) continue;
    const v = patch[i]!;
    for (let k = topo.triStart[v]!; k < topo.triStart[v + 1]!; k += 1) {
      const t = topo.tris[k]!;
      if (seen.has(t)) continue;
      seen.add(t);
      const a = index[t * 3]!;
      const b = index[t * 3 + 1]!;
      const c = index[t * 3 + 2]!;
      const ia = local[a]!;
      const ib = local[b]!;
      const ic = local[c]!;
      if (ia < 0 || ib < 0 || ic < 0) continue;
      if (field[ia]! < 0.5 || field[ib]! < 0.5 || field[ic]! < 0.5) continue;
      const ux = positions[b * 3]! - positions[a * 3]!;
      const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
      const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
      const wx = positions[c * 3]! - positions[a * 3]!;
      const wy = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
      const wz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
      nx += uy * wz - uz * wy;
      ny += uz * wx - ux * wz;
      nz += ux * wy - uy * wx;
    }
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  return [nx / len, ny / len, nz / len] as const;
}

function planeAxes(n: readonly [number, number, number]) {
  const ax = Math.abs(n[0]!) < 0.9 ? ([1, 0, 0] as const) : ([0, 1, 0] as const);
  let ux = n[1]! * ax[2]! - n[2]! * ax[1]!;
  let uy = n[2]! * ax[0]! - n[0]! * ax[2]!;
  let uz = n[0]! * ax[1]! - n[1]! * ax[0]!;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  return {
    u: [ux, uy, uz] as const,
    v: [n[1]! * uz - n[2]! * uy, n[2]! * ux - n[0]! * uz, n[0]! * uy - n[1]! * ux] as const,
  };
}

function convexHull2(pts: Array<{ x: number; y: number }>) {
  if (pts.length < 3) return pts.slice();
  const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Array<{ x: number; y: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function distToConvex(x: number, y: number, hull: Array<{ x: number; y: number }>) {
  const n = hull.length;
  if (n === 0) return Infinity;
  if (n === 1) return Math.hypot(x - hull[0]!.x, y - hull[0]!.y);
  let inside = n >= 3;
  let min = Infinity;
  for (let i = 0; i < n; i += 1) {
    const a = hull[i]!;
    const b = hull[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const px = x - a.x;
    const py = y - a.y;
    if (ex * py - ey * px < -1e-12) inside = false;
    const e2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, (px * ex + py * ey) / e2));
    min = Math.min(min, Math.hypot(px - ex * t, py - ey * t));
  }
  return inside ? 0 : min;
}

/**
 * 치관 경계 안·치은선 아래로 남는 잔존 치근·파절편을 치아에 넣는다.
 * 인접치 교합면은 발자국 밖이라 넣지 않는다. field를 바로 고친다.
 */
export function includeResidualRoot(args: {
  topo: MeshTopology;
  positions: Float32Array;
  color: Float32Array | null;
  unitToMm: number;
  patch?: Uint32Array;
  local?: Int32Array;
  field?: Float32Array;
  seed?: number;
  seg?: ToothSegment;
  blocked?: (v: number) => boolean;
}) {
  const patch = args.patch ?? args.seg?.patch;
  const local = args.local ?? args.seg?.local;
  const field = args.field ?? args.seg?.field;
  if (!patch || !local || !field) return;
  const { topo, positions } = args;
  const unit = Math.max(args.unitToMm, 1e-9);
  const m = patch.length;
  const g = localGraph(topo, patch, local);
  const seed = args.seed ?? args.seg?.seed ?? patch[0]!;
  const basis = toothBasis(topo, positions, patch, local, field);
  if (!basis) return;
  let nx = basis[0]!;
  let ny = basis[1]!;
  let nz = basis[2]!;
  const gum = gumness(patch, args.color, g, local[seed]! >= 0 ? local[seed]! : 0);
  const pts: Array<{ x: number; y: number }> = [];
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let border = 0;
  let toothCount = 0;
  for (let i = 0; i < m; i += 1) {
    if (field[i]! < 0.5) continue;
    toothCount += 1;
    const p = patch[i]!;
    let rim = false;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      if (field[g.nbr[k]!]! < 0.5) {
        rim = true;
        break;
      }
    }
    if (!rim) continue;
    ox += positions[p * 3]!;
    oy += positions[p * 3 + 1]!;
    oz += positions[p * 3 + 2]!;
    border += 1;
  }
  if (toothCount < 8 || border < 3) return;
  ox /= border;
  oy /= border;
  oz /= border;
  if (
    (positions[seed * 3]! - ox) * nx +
      (positions[seed * 3 + 1]! - oy) * ny +
      (positions[seed * 3 + 2]! - oz) * nz <
    0
  ) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const { u, v } = planeAxes([nx, ny, nz]);
  for (let i = 0; i < m; i += 1) {
    if (field[i]! < 0.5) continue;
    const p = patch[i]!;
    pts.push({
      x: positions[p * 3]! * u[0]! + positions[p * 3 + 1]! * u[1]! + positions[p * 3 + 2]! * u[2]!,
      y: positions[p * 3]! * v[0]! + positions[p * 3 + 1]! * v[1]! + positions[p * 3 + 2]! * v[2]!,
    });
  }
  const hull = convexHull2(pts);
  const pad = RESIDUAL_HULL_PAD_MM / unit;
  const slack = RESIDUAL_APICAL_SLACK_MM / unit;
  const reach = RESIDUAL_REACH_MM / unit;
  const near = new Uint8Array(m);
  const heap = new MinHeap();
  for (let i = 0; i < m; i += 1) {
    if (field[i]! < 0.5) continue;
    near[i] = 1;
    heap.push(0, i);
  }
  const done = new Uint8Array(m);
  while (heap.size > 0) {
    const [d, i] = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      if (done[j]) continue;
      const nd = d + edgeLen(positions, patch[i]!, patch[j]!);
      if (nd > reach) continue;
      near[j] = 1;
      heap.push(nd, j);
    }
  }

  const height = (p: number) =>
    (positions[p * 3]! - ox) * nx + (positions[p * 3 + 1]! - oy) * ny + (positions[p * 3 + 2]! - oz) * nz;
  const inFootprint = (p: number) => {
    const x = positions[p * 3]! * u[0]! + positions[p * 3 + 1]! * u[1]! + positions[p * 3 + 2]! * u[2]!;
    const y = positions[p * 3]! * v[0]! + positions[p * 3 + 1]! * v[1]! + positions[p * 3 + 2]! * v[2]!;
    return distToConvex(x, y, hull) <= pad;
  };
  const candidate = new Uint8Array(m);
  for (let i = 0; i < m; i += 1) {
    if (field[i]! >= 0.5) continue;
    const p = patch[i]!;
    if (args.blocked?.(p)) continue;
    if (gum && gum[i]! >= RESIDUAL_GUM_CUTOFF) continue;
    const h = height(p);
    const foot = inFootprint(p);
    const apical = h <= slack;
    const deep = h < -0.4 / unit;
    if (foot && apical) candidate[i] = 1;
    else if (deep && near[i]) candidate[i] = 1;
  }

  const stack: number[] = [];
  for (let i = 0; i < m; i += 1) if (field[i]! >= 0.5) stack.push(i);
  while (stack.length > 0) {
    const i = stack.pop()!;
    for (let k = g.start[i]!; k < g.start[i + 1]!; k += 1) {
      const j = g.nbr[k]!;
      if (!candidate[j] || field[j]! >= 0.5) continue;
      field[j] = 0.62;
      stack.push(j);
    }
  }

  const seen = new Uint8Array(m);
  for (let i = 0; i < m; i += 1) {
    if (seen[i] || field[i]! >= 0.5 || !candidate[i]) continue;
    const comp: number[] = [];
    let allInside = true;
    seen[i] = 1;
    const st = [i];
    while (st.length > 0) {
      const a = st.pop()!;
      comp.push(a);
      if (!inFootprint(patch[a]!)) allInside = false;
      for (let k = g.start[a]!; k < g.start[a + 1]!; k += 1) {
        const b = g.nbr[k]!;
        if (seen[b] || field[b]! >= 0.5 || !candidate[b]) continue;
        seen[b] = 1;
        st.push(b);
      }
    }
    if (!allInside || comp.length < 8 || comp.length >= toothCount) continue;
    for (const a of comp) field[a] = 0.62;
  }
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

/** mask가 스캔 바깥 테두리에 닿았는지. 안쪽 구멍은 발치와와 같이 메울 수 있어 막지 않는다. */
export function maskTouchesMeshBoundary(topo: MeshTopology, mask: Uint8Array) {
  const outer = outerBoundaryMask(topo);
  for (let v = 0; v < topo.vertexCount; v += 1) {
    if (mask[v] && outer[v]) return true;
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
