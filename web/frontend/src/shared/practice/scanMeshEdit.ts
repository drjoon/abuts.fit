// 구강 스캔 메시 편집 — 다듬기(브러시·올가미·조각으로 바로 지우기)·구멍 메우기·조각·가상 발치. three 없이 색인 메시로 계산한다.
// - 2026-09-28: 디자인 전에 스캔 파편·구멍·거친 면을 정리한다. 결과는 작업 스캔으로 저장한다.
// - 2026-09-30: 가상 발치. 뺄 치아를 지우고 발치와를 잇몸 곡면으로 메운다(virtualExtraction.ts).
// - 2026-10-04: 다듬기 브러시는 걸친 면을 잘라 테두리를 고르고, 안쪽 구멍은 주변 면에 잇는다.
// - 2026-10-04: 조각은 맞은 면을 반드시 움직이고, 올리기는 카메라 쪽으로 부푼다.
// related files:
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

export type MeshEditTab = "trim" | "fill" | "sculpt" | "extract";
export type TrimTool = "brush" | "lasso";
export type SelectMode = "add" | "remove";
export type SculptTool = "add" | "remove" | "smooth" | "flatten";
/** 가상 발치: 치아를 눌러 고르거나, 브러시로 경계를 고친다. */
export type ExtractTool = "pick" | "brush";

export type ScanMeshEdit = {
  tab: MeshEditTab;
  trimTool: TrimTool;
  selectMode: SelectMode;
  /** 다듬기 브러시 지름(mm). */
  trimBrushMm: number;
  sculptTool: SculptTool;
  /** 조각 브러시 지름(mm). */
  sculptBrushMm: number;
  /** 0–1 */
  strength: number;
  extractTool: ExtractTool;
  /** 발치 경계 브러시 지름(mm). */
  extractBrushMm: number;
};

export type ExtractToothStatus = {
  key: string;
  label: string;
  active: boolean;
  /** 경계가 또렷하지 않아 넓게 잡혔을 수 있다. */
  weak: boolean;
};

export type ScanMeshEditStatus = {
  /** 고른 정점 수. */
  selected: number;
  /** 메울 수 있는 구멍 수. 스캔 바깥 테두리는 뺀다. */
  holes: number;
  selectedHoles: number;
  /** 가상 발치로 고른 치아. */
  teeth: ExtractToothStatus[];
  /** 치아 경계를 찾는 중. */
  finding: boolean;
};

export const EMPTY_SCAN_MESH_EDIT_STATUS: ScanMeshEditStatus = {
  selected: 0,
  holes: 0,
  selectedHoles: 0,
  teeth: [],
  finding: false,
};

export type ExtractAction =
  | { kind: "activate"; key: string }
  | { kind: "remove"; key: string }
  | { kind: "grow" }
  | { kind: "shrink" }
  | { kind: "restore" }
  | { kind: "clear" };

export const DEFAULT_SCAN_MESH_EDIT: ScanMeshEdit = {
  tab: "trim",
  trimTool: "brush",
  selectMode: "add",
  trimBrushMm: 3,
  sculptTool: "smooth",
  sculptBrushMm: 2,
  strength: 0.35,
  extractTool: "pick",
  extractBrushMm: 1.5,
};

export function sameScanMeshEditStatus(a: ScanMeshEditStatus, b: ScanMeshEditStatus) {
  return (
    a.selected > 0 === b.selected > 0 &&
    a.holes === b.holes &&
    a.selectedHoles === b.selectedHoles &&
    a.finding === b.finding &&
    a.teeth.length === b.teeth.length &&
    a.teeth.every((row, i) => {
      const other = b.teeth[i]!;
      return (
        row.key === other.key &&
        row.label === other.label &&
        row.active === other.active &&
        row.weak === other.weak
      );
    })
  );
}

export const MESH_EDIT_BRUSH_RANGE_MM = { min: 0.5, max: 10 } as const;

export const TRIM_TOOLS: ReadonlyArray<{ id: TrimTool; label: string; hint: string }> = [
  { id: "brush", label: "브러시", hint: "칠한 면을 지웁니다." },
  { id: "lasso", label: "올가미", hint: "끌어서 둘러싼 면을 지웁니다." },
];

export const SCULPT_TOOLS: ReadonlyArray<{ id: SculptTool; label: string; hint: string }> = [
  { id: "add", label: "올리기", hint: "면을 바깥으로 부풀립니다." },
  { id: "remove", label: "깎기", hint: "면을 안으로 누릅니다." },
  { id: "smooth", label: "매끄럽게", hint: "울퉁불퉁한 면을 고릅니다." },
  { id: "flatten", label: "평평하게", hint: "브러시 안을 한 평면으로 폅니다." },
];

/** 이만큼 긴 테두리는 메우지 않는다. 스캔 바깥 테두리일 가능성이 크다. */
export const FILL_HOLE_MAX_EDGES = 3000;
/** 최소 면적 삼각분할(O(n³))을 쓰는 테두리 길이 한도. 넘으면 가운데 점으로 부채꼴을 만든다. */
const MIN_AREA_MAX_EDGES = 420;

export type MeshTopology = {
  vertexCount: number;
  index: Uint32Array;
  /** 정점마다 이웃 정점(CSR). 내부 이웃은 두 번 들어간다. */
  nbrStart: Uint32Array;
  nbr: Uint32Array;
  /** 정점마다 닿은 삼각형(CSR). */
  triStart: Uint32Array;
  tris: Uint32Array;
};

export function buildTopology(index: Uint32Array, vertexCount: number): MeshTopology {
  const triCount = Math.floor(index.length / 3);
  const triStart = new Uint32Array(vertexCount + 1);
  for (let i = 0; i < triCount * 3; i += 1) triStart[index[i]! + 1] += 1;
  for (let v = 0; v < vertexCount; v += 1) triStart[v + 1] += triStart[v]!;
  const tris = new Uint32Array(triStart[vertexCount]!);
  const fill = triStart.slice(0, vertexCount);
  for (let t = 0; t < triCount; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = index[t * 3 + k]!;
      tris[fill[v]!] = t;
      fill[v] += 1;
    }
  }
  const nbrStart = new Uint32Array(vertexCount + 1);
  for (let v = 0; v < vertexCount; v += 1) {
    nbrStart[v + 1] = nbrStart[v]! + (triStart[v + 1]! - triStart[v]!) * 2;
  }
  const nbr = new Uint32Array(nbrStart[vertexCount]!);
  const at = nbrStart.slice(0, vertexCount);
  for (let t = 0; t < triCount; t += 1) {
    const a = index[t * 3]!;
    const b = index[t * 3 + 1]!;
    const c = index[t * 3 + 2]!;
    nbr[at[a]!++] = b;
    nbr[at[a]!++] = c;
    nbr[at[b]!++] = a;
    nbr[at[b]!++] = c;
    nbr[at[c]!++] = a;
    nbr[at[c]!++] = b;
  }
  return { vertexCount, index, nbrStart, nbr, triStart, tris };
}

/** 같은 좌표 정점을 하나로 묶는다. 색인이 없는 STL·OBJ를 편집할 때 쓴다. */
export function weldVertices(
  positions: Float32Array,
  index: Uint32Array | null,
  tolerance: number,
): { index: Uint32Array; rep: Uint32Array } {
  const count = Math.floor(positions.length / 3);
  const inv = 1 / Math.max(tolerance, 1e-9);
  const ids = new Map<string, number>();
  const remap = new Uint32Array(count);
  const rep: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const key = `${Math.round(positions[i * 3]! * inv)},${Math.round(positions[i * 3 + 1]! * inv)},${Math.round(positions[i * 3 + 2]! * inv)}`;
    let id = ids.get(key);
    if (id == null) {
      id = rep.length;
      ids.set(key, id);
      rep.push(i);
    }
    remap[i] = id;
  }
  const source = index ?? Uint32Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  for (let t = 0; t + 2 < source.length; t += 3) {
    const a = remap[source[t]!]!;
    const b = remap[source[t + 1]!]!;
    const c = remap[source[t + 2]!]!;
    if (a === b || b === c || c === a) continue;
    out.push(a, b, c);
  }
  return { index: Uint32Array.from(out), rep: Uint32Array.from(rep) };
}

/** 정점마다 이어진 조각 번호와 조각별 정점 수. */
export function vertexComponents(topo: MeshTopology): { comp: Int32Array; sizes: number[] } {
  const n = topo.vertexCount;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (x: number) => {
    let v = x;
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]!]!;
      v = parent[v]!;
    }
    return v;
  };
  const index = topo.index;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = find(index[t]!);
    const b = find(index[t + 1]!);
    const c = find(index[t + 2]!);
    if (a !== b) parent[b] = a;
    const r = find(a);
    if (r !== c) parent[c] = r;
  }
  const comp = new Int32Array(n).fill(-1);
  const ids = new Map<number, number>();
  const sizes: number[] = [];
  for (let v = 0; v < n; v += 1) {
    if (topo.triStart[v + 1] === topo.triStart[v]) continue;
    const root = find(v);
    let id = ids.get(root);
    if (id == null) {
      id = sizes.length;
      ids.set(root, id);
      sizes.push(0);
    }
    comp[v] = id;
    sizes[id]! += 1;
  }
  return { comp, sizes };
}

function hasDirectedEdge(topo: MeshTopology, from: number, to: number) {
  const index = topo.index;
  for (let i = topo.triStart[from]!; i < topo.triStart[from + 1]!; i += 1) {
    const t = topo.tris[i]! * 3;
    const a = index[t]!;
    const b = index[t + 1]!;
    const c = index[t + 2]!;
    if ((a === from && b === to) || (b === from && c === to) || (c === from && a === to)) {
      return true;
    }
  }
  return false;
}

export type BoundaryLoop = {
  /** 메시 삼각형의 방향을 따라 도는 정점. */
  verts: Uint32Array;
  /** 테두리 길이(기하 단위). */
  length: number;
  comp: number;
};

function collectBoundaryLoops(
  topo: MeshTopology,
  positions: Float32Array | null,
  comp: Int32Array,
): BoundaryLoop[] {
  const index = topo.index;
  const out = new Map<number, number[]>();
  for (let t = 0; t + 2 < index.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = index[t + k]!;
      const b = index[t + ((k + 1) % 3)]!;
      if (hasDirectedEdge(topo, b, a)) continue;
      const list = out.get(a);
      if (list) list.push(b);
      else out.set(a, [b]);
    }
  }
  const loops: BoundaryLoop[] = [];
  const len = (a: number, b: number) =>
    positions
      ? Math.hypot(
          positions[a * 3]! - positions[b * 3]!,
          positions[a * 3 + 1]! - positions[b * 3 + 1]!,
          positions[a * 3 + 2]! - positions[b * 3 + 2]!,
        )
      : 1;
  for (const [start, targets] of out) {
    while (targets.length > 0) {
      const verts = [start];
      let length = 0;
      let cur = targets.pop()!;
      length += len(start, cur);
      let closed = false;
      let guard = 0;
      while (guard < 200000) {
        guard += 1;
        if (cur === start) {
          closed = true;
          break;
        }
        verts.push(cur);
        const next = out.get(cur);
        if (!next || next.length === 0) break;
        const to = next.pop()!;
        length += len(cur, to);
        cur = to;
      }
      if (!closed || verts.length < 3) continue;
      loops.push({ verts: Uint32Array.from(verts), length, comp: comp[start] ?? -1 });
    }
  }
  return loops;
}

/**
 * 열린 테두리 고리. 조각마다 가장 긴 고리(스캔 바깥 테두리)는 뺀다.
 * 고리를 이루지 못한 비다양체 테두리도 뺀다.
 */
export function holeLoops(
  topo: MeshTopology,
  positions: Float32Array,
  comp: Int32Array,
): BoundaryLoop[] {
  const loops = collectBoundaryLoops(topo, positions, comp);
  const longest = new Map<number, number>();
  loops.forEach((loop, i) => {
    const prev = longest.get(loop.comp);
    if (prev == null || loops[prev]!.length < loop.length) longest.set(loop.comp, i);
  });
  const outer = new Set(longest.values());
  return loops.filter((loop, i) => !outer.has(i) && loop.verts.length <= FILL_HOLE_MAX_EDGES);
}

/** 조각마다 가장 긴 테두리(스캔 바깥). 안쪽 구멍·짧은 찢김은 넣지 않는다. */
export function outerBoundaryMask(topo: MeshTopology) {
  const { comp } = vertexComponents(topo);
  const loops = collectBoundaryLoops(topo, null, comp);
  const longest = new Map<number, number>();
  loops.forEach((loop, i) => {
    const prev = longest.get(loop.comp);
    if (prev == null || loops[prev]!.length < loop.length) longest.set(loop.comp, i);
  });
  const out = new Uint8Array(topo.vertexCount);
  for (const i of longest.values()) {
    for (const v of loops[i]!.verts) out[v] = 1;
  }
  return out;
}

/**
 * 고른 정점이 하나라도 닿은 삼각형을 지운다. 쓰지 않는 정점도 뺀다.
 * keep[새 정점] = 옛 정점. 지울 게 없으면 null.
 */
export function trimSelected(
  topo: MeshTopology,
  selected: Uint8Array,
): { index: Uint32Array; keep: Uint32Array } | null {
  const index = topo.index;
  const kept: number[] = [];
  let dropped = false;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]!;
    const b = index[t + 1]!;
    const c = index[t + 2]!;
    if (selected[a] || selected[b] || selected[c]) {
      dropped = true;
      continue;
    }
    kept.push(a, b, c);
  }
  if (!dropped) return null;
  const remap = new Int32Array(topo.vertexCount).fill(-1);
  const keep: number[] = [];
  const next = new Uint32Array(kept.length);
  for (let i = 0; i < kept.length; i += 1) {
    const v = kept[i]!;
    if (remap[v]! < 0) {
      remap[v] = keep.length;
      keep.push(v);
    }
    next[i] = remap[v]!;
  }
  return { index: next, keep: Uint32Array.from(keep) };
}

function mixAttr(src: Float32Array | null, a: number, b: number, size: number, t: number) {
  if (!src) return null as number[] | null;
  const out: number[] = [];
  for (let k = 0; k < size; k += 1) {
    out.push(src[a * size + k]! * (1 - t) + src[b * size + k]! * t);
  }
  return out;
}

function fairBoundaryLoops(
  positions: Float32Array,
  loops: readonly BoundaryLoop[],
  movable: Uint8Array,
  iters: number,
  lambda: number,
) {
  const next = new Float32Array(positions.length);
  for (let pass = 0; pass < iters; pass += 1) {
    next.set(positions);
    for (const loop of loops) {
      const n = loop.verts.length;
      if (n < 3) continue;
      for (let i = 0; i < n; i += 1) {
        const v = loop.verts[i]!;
        if (!movable[v]) continue;
        const p = loop.verts[(i + n - 1) % n]!;
        const q = loop.verts[(i + 1) % n]!;
        for (let k = 0; k < 3; k += 1) {
          const mean = (positions[p * 3 + k]! + positions[q * 3 + k]!) * 0.5;
          next[v * 3 + k] = positions[v * 3 + k]! + (mean - positions[v * 3 + k]!) * lambda;
        }
      }
    }
    positions.set(next);
  }
}

function relaxMovable(
  topo: MeshTopology,
  positions: Float32Array,
  movable: Uint8Array,
  iters: number,
  lambda: number,
) {
  const next = new Float32Array(positions.length);
  for (let pass = 0; pass < iters; pass += 1) {
    next.set(positions);
    for (let v = 0; v < topo.vertexCount; v += 1) {
      if (!movable[v]) continue;
      const start = topo.nbrStart[v]!;
      const end = topo.nbrStart[v + 1]!;
      if (end <= start) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let n = 0;
      let last = -1;
      for (let k = start; k < end; k += 1) {
        const u = topo.nbr[k]!;
        if (u === last) continue;
        last = u;
        sx += positions[u * 3]!;
        sy += positions[u * 3 + 1]!;
        sz += positions[u * 3 + 2]!;
        n += 1;
      }
      if (n === 0) continue;
      const inv = 1 / n;
      next[v * 3] = positions[v * 3]! + (sx * inv - positions[v * 3]!) * lambda;
      next[v * 3 + 1] = positions[v * 3 + 1]! + (sy * inv - positions[v * 3 + 1]!) * lambda;
      next[v * 3 + 2] = positions[v * 3 + 2]! + (sz * inv - positions[v * 3 + 2]!) * lambda;
    }
    positions.set(next);
  }
}

/**
 * 고른 정점 안쪽 면은 지우고, 걸친 면은 잘라 테두리를 잇는다.
 * field가 있으면 발치 경계처럼 0.5 등치선에서 자른다. 없으면 모서리 가운데다.
 * 지운 자리 테두리는 고르고, 안쪽에 난 구멍은 메울 수 있게 cutRim을 표시한다.
 * 지울 게 없으면 null.
 */
export function trimSelectedFair(args: {
  positions: Float32Array;
  index: Uint32Array;
  selected: Uint8Array;
  color: Float32Array | null;
  uv: Float32Array | null;
  /** 정점마다 덮임(0–1). 0.5 이상이 안쪽. */
  field?: Float32Array | null;
}): {
  positions: Float32Array;
  index: Uint32Array;
  color: Float32Array | null;
  uv: Float32Array | null;
  origin: Int32Array;
  cutRim: Uint8Array;
} | null {
  const { positions, index, selected, color, uv, field } = args;
  const vertexCount = Math.floor(positions.length / 3);
  const value = (v: number) => {
    if (field && v < field.length) return field[v]!;
    return selected[v] ? 1 : 0;
  };
  const isInside = (v: number) => value(v) >= 0.5;
  const oldRim = new Uint8Array(vertexCount);
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]!;
    const b = index[t + 1]!;
    const c = index[t + 2]!;
    const ia = isInside(a);
    const ib = isInside(b);
    const ic = isInside(c);
    if (ia === ib && ib === ic) continue;
    if (!ia) oldRim[a] = 1;
    if (!ib) oldRim[b] = 1;
    if (!ic) oldRim[c] = 1;
  }
  const remap = new Int32Array(vertexCount).fill(-1);
  const origin: number[] = [];
  const nextPos: number[] = [];
  const nextColor: number[] = [];
  const nextUv: number[] = [];
  const takeOld = (v: number) => {
    let id = remap[v]!;
    if (id >= 0) return id;
    id = origin.length;
    remap[v] = id;
    origin.push(v);
    nextPos.push(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
    if (color) nextColor.push(color[v * 3]!, color[v * 3 + 1]!, color[v * 3 + 2]!);
    if (uv) nextUv.push(uv[v * 2]!, uv[v * 2 + 1]!);
    return id;
  };
  const edgeNew = new Map<number, number>();
  const ekey = (a: number, b: number) => (a < b ? a * vertexCount + b : b * vertexCount + a);
  const takeEdge = (a: number, b: number) => {
    const key = ekey(a, b);
    const hit = edgeNew.get(key);
    if (hit != null) return hit;
    const fa = value(a);
    const fb = value(b);
    let t = (0.5 - fa) / (fb - fa || 1e-9);
    if (t < 0.02) t = 0.02;
    else if (t > 0.98) t = 0.98;
    const id = origin.length;
    edgeNew.set(key, id);
    origin.push(-1);
    nextPos.push(
      positions[a * 3]! * (1 - t) + positions[b * 3]! * t,
      positions[a * 3 + 1]! * (1 - t) + positions[b * 3 + 1]! * t,
      positions[a * 3 + 2]! * (1 - t) + positions[b * 3 + 2]! * t,
    );
    const rgb = mixAttr(color, a, b, 3, t);
    if (rgb) nextColor.push(rgb[0]!, rgb[1]!, rgb[2]!);
    const st = mixAttr(uv, a, b, 2, t);
    if (st) nextUv.push(st[0]!, st[1]!);
    return id;
  };
  const nextIndex: number[] = [];
  let changed = false;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const v0 = index[t]!;
    const v1 = index[t + 1]!;
    const v2 = index[t + 2]!;
    const i0 = isInside(v0);
    const i1 = isInside(v1);
    const i2 = isInside(v2);
    if (i0 && i1 && i2) {
      changed = true;
      continue;
    }
    if (!i0 && !i1 && !i2) {
      nextIndex.push(takeOld(v0), takeOld(v1), takeOld(v2));
      continue;
    }
    changed = true;
    const src = [v0, v1, v2];
    const inside = [i0, i1, i2];
    const poly: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const a = src[k]!;
      const b = src[(k + 1) % 3]!;
      const ia = inside[k]!;
      const ib = inside[(k + 1) % 3]!;
      if (!ia) poly.push(takeOld(a));
      if (ia !== ib) poly.push(takeEdge(a, b));
    }
    if (poly.length < 3) continue;
    for (let k = 1; k + 1 < poly.length; k += 1) {
      const a = poly[0]!;
      const b = poly[k]!;
      const c = poly[k + 1]!;
      if (a === b || b === c || c === a) continue;
      nextIndex.push(a, b, c);
    }
  }
  if (!changed) return null;
  const outPos = Float32Array.from(nextPos);
  const outIndex = Uint32Array.from(nextIndex);
  const outOrigin = Int32Array.from(origin);
  const outColor = color ? Float32Array.from(nextColor) : null;
  const outUv = uv ? Float32Array.from(nextUv) : null;
  const cutRim = new Uint8Array(origin.length);
  for (let v = 0; v < origin.length; v += 1) {
    const old = outOrigin[v]!;
    cutRim[v] = old < 0 || oldRim[old]! ? 1 : 0;
  }
  if (outIndex.length === 0) {
    return { positions: outPos, index: outIndex, color: outColor, uv: outUv, origin: outOrigin, cutRim };
  }
  const topo = buildTopology(outIndex, origin.length);
  const comps = vertexComponents(topo);
  const loops = collectBoundaryLoops(topo, outPos, comps.comp);
  fairBoundaryLoops(outPos, loops, cutRim, 18, 0.55);
  relaxMovable(topo, outPos, cutRim, 10, 0.4);
  return { positions: outPos, index: outIndex, color: outColor, uv: outUv, origin: outOrigin, cutRim };
}

type PatchVec = number[];

function pdist(data: number[], dims: number, a: number, b: number) {
  const x = data[a * dims]! - data[b * dims]!;
  const y = data[a * dims + 1]! - data[b * dims + 1]!;
  const z = data[a * dims + 2]! - data[b * dims + 2]!;
  return Math.sqrt(x * x + y * y + z * z);
}

function triArea(data: number[], dims: number, a: number, b: number, c: number) {
  const ax = data[a * dims]!;
  const ay = data[a * dims + 1]!;
  const az = data[a * dims + 2]!;
  const ux = data[b * dims]! - ax;
  const uy = data[b * dims + 1]! - ay;
  const uz = data[b * dims + 2]! - az;
  const vx = data[c * dims]! - ax;
  const vy = data[c * dims + 1]! - ay;
  const vz = data[c * dims + 2]! - az;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function cornerAngle(data: number[], dims: number, at: number, a: number, b: number) {
  const ux = data[a * dims]! - data[at * dims]!;
  const uy = data[a * dims + 1]! - data[at * dims + 1]!;
  const uz = data[a * dims + 2]! - data[at * dims + 2]!;
  const vx = data[b * dims]! - data[at * dims]!;
  const vy = data[b * dims + 1]! - data[at * dims + 1]!;
  const vz = data[b * dims + 2]! - data[at * dims + 2]!;
  const lu = Math.hypot(ux, uy, uz);
  const lv = Math.hypot(vx, vy, vz);
  if (lu < 1e-12 || lv < 1e-12) return 0;
  const cos = (ux * vx + uy * vy + uz * vz) / (lu * lv);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** 다각형 p[0..n-1] 최소 면적 삼각분할. 삼각형은 다각형 방향을 따른다. */
function minAreaTriangulation(data: number[], dims: number, p: number[]): number[] {
  const n = p.length;
  const w = new Float64Array(n * n);
  const arg = new Int32Array(n * n).fill(-1);
  for (let gap = 2; gap < n; gap += 1) {
    for (let i = 0; i + gap < n; i += 1) {
      const j = i + gap;
      let best = Infinity;
      let bestK = -1;
      for (let k = i + 1; k < j; k += 1) {
        const value = w[i * n + k]! + w[k * n + j]! + triArea(data, dims, p[i]!, p[k]!, p[j]!);
        if (value < best) {
          best = value;
          bestK = k;
        }
      }
      w[i * n + j] = best;
      arg[i * n + j] = bestK;
    }
  }
  const tris: number[] = [];
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [i, j] = stack.pop()!;
    if (j - i < 2) continue;
    const k = arg[i * n + j]!;
    if (k < 0) continue;
    tris.push(p[i]!, p[k]!, p[j]!);
    stack.push([i, k], [k, j]);
  }
  return tris;
}

/**
 * 구멍 하나를 메운다(Liepa 방식: 최소 면적 삼각분할 → 무게중심 분할·Delaunay 뒤집기 → 막 평활).
 * `loopData`는 고리 정점 n개 × dims 값이다. 앞 3개는 좌표, 나머지(색·UV)는 같이 평균낸다.
 * 돌려주는 tris의 번호가 n보다 작으면 고리 정점, 크거나 같으면 verts의 (번호 − n)번 새 정점이다.
 */
export function fillHole(
  loopData: Float32Array,
  dims: number,
): { verts: Float32Array; tris: Uint32Array } | null {
  const n = Math.floor(loopData.length / dims);
  if (n < 3) return null;
  const data: number[] = Array.from(loopData);
  // 메시 테두리 a→b는 이미 있다. 채우는 면은 b→a를 가져야 하므로 거꾸로 돈다.
  const polygon = Array.from({ length: n }, (_, i) => n - 1 - i);
  let tris: number[];
  if (n === 3) {
    tris = [polygon[0]!, polygon[1]!, polygon[2]!];
  } else if (n <= MIN_AREA_MAX_EDGES) {
    tris = minAreaTriangulation(data, dims, polygon);
  } else {
    const center = n;
    for (let d = 0; d < dims; d += 1) {
      let sum = 0;
      for (let i = 0; i < n; i += 1) sum += data[i * dims + d]!;
      data.push(sum / n);
    }
    tris = [];
    for (let i = 0; i < n; i += 1) {
      tris.push(polygon[i]!, polygon[(i + 1) % n]!, center);
    }
  }
  if (tris.length < 3) return null;

  const vertexTotal = () => data.length / dims;
  const sigma: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;
    sigma.push((pdist(data, dims, i, prev) + pdist(data, dims, i, next)) / 2);
  }
  for (let v = n; v < vertexTotal(); v += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += sigma[i]!;
    sigma.push(sum / n);
  }

  const M = 1 << 21;
  const ekey = (a: number, b: number) => (a < b ? a * M + b : b * M + a);
  const edges = new Map<number, number[]>();
  const addEdge = (a: number, b: number, t: number) => {
    const key = ekey(a, b);
    const list = edges.get(key);
    if (list) list.push(t);
    else edges.set(key, [t]);
  };
  const swapEdgeTri = (a: number, b: number, from: number, to: number) => {
    const list = edges.get(ekey(a, b));
    if (!list) return;
    const at = list.indexOf(from);
    if (at >= 0) list[at] = to;
  };
  for (let t = 0; t * 3 < tris.length; t += 1) {
    addEdge(tris[t * 3]!, tris[t * 3 + 1]!, t);
    addEdge(tris[t * 3 + 1]!, tris[t * 3 + 2]!, t);
    addEdge(tris[t * 3 + 2]!, tris[t * 3]!, t);
  }

  /** a-b 모서리를 공유한 두 삼각형이 Delaunay가 아니면 뒤집는다. */
  const relax = (a: number, b: number) => {
    const list = edges.get(ekey(a, b));
    if (!list || list.length !== 2) return false;
    const [t1, t2] = list as [number, number];
    let x = -1;
    let y = -1;
    let c = -1;
    for (let k = 0; k < 3; k += 1) {
      const v0 = tris[t1 * 3 + k]!;
      const v1 = tris[t1 * 3 + ((k + 1) % 3)]!;
      const v2 = tris[t1 * 3 + ((k + 2) % 3)]!;
      if ((v0 === a && v1 === b) || (v0 === b && v1 === a)) {
        x = v0;
        y = v1;
        c = v2;
        break;
      }
    }
    if (c < 0) return false;
    let d = -1;
    for (let k = 0; k < 3; k += 1) {
      const v = tris[t2 * 3 + k]!;
      if (v !== x && v !== y) d = v;
    }
    if (d < 0 || c === d || edges.has(ekey(c, d))) return false;
    const angles = cornerAngle(data, dims, c, x, y) + cornerAngle(data, dims, d, x, y);
    if (angles <= Math.PI + 1e-9) return false;
    // t1 = (x, y, c), t2 = (y, x, d) → (c, x, d), (d, y, c)
    tris[t1 * 3] = c;
    tris[t1 * 3 + 1] = x;
    tris[t1 * 3 + 2] = d;
    tris[t2 * 3] = d;
    tris[t2 * 3 + 1] = y;
    tris[t2 * 3 + 2] = c;
    edges.delete(ekey(x, y));
    edges.set(ekey(c, d), [t1, t2]);
    swapEdgeTri(x, d, t2, t1);
    swapEdgeTri(y, c, t1, t2);
    return true;
  };

  const alpha = Math.SQRT2;
  for (let pass = 0; pass < 24; pass += 1) {
    let split = false;
    const count = tris.length / 3;
    for (let t = 0; t < count; t += 1) {
      const i = tris[t * 3]!;
      const j = tris[t * 3 + 1]!;
      const k = tris[t * 3 + 2]!;
      const centroid: PatchVec = [];
      for (let d = 0; d < dims; d += 1) {
        centroid.push(
          (data[i * dims + d]! + data[j * dims + d]! + data[k * dims + d]!) / 3,
        );
      }
      const sc = (sigma[i]! + sigma[j]! + sigma[k]!) / 3;
      let ok = true;
      for (const m of [i, j, k]) {
        const dx = centroid[0]! - data[m * dims]!;
        const dy = centroid[1]! - data[m * dims + 1]!;
        const dz = centroid[2]! - data[m * dims + 2]!;
        const reach = alpha * Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (reach <= sc || reach <= sigma[m]!) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (vertexTotal() >= M - 1) break;
      const c = vertexTotal();
      data.push(...centroid);
      sigma.push(sc);
      const t2 = tris.length / 3;
      const t3 = t2 + 1;
      tris[t * 3 + 2] = c;
      tris.push(j, k, c, k, i, c);
      swapEdgeTri(j, k, t, t2);
      swapEdgeTri(k, i, t, t3);
      addEdge(i, c, t);
      addEdge(i, c, t3);
      addEdge(j, c, t);
      addEdge(j, c, t2);
      addEdge(k, c, t2);
      addEdge(k, c, t3);
      relax(i, j);
      relax(j, k);
      relax(k, i);
      split = true;
    }
    let flips = 0;
    for (let round = 0; round < 8; round += 1) {
      let any = false;
      for (const key of [...edges.keys()]) {
        const a = Math.floor(key / M);
        const b = key - a * M;
        if (relax(a, b)) {
          any = true;
          flips += 1;
        }
      }
      if (!any) break;
    }
    if (!split && flips === 0) break;
  }

  const total = vertexTotal();
  if (total > n) {
    const nbrs: number[][] = Array.from({ length: total }, () => []);
    for (let t = 0; t * 3 < tris.length; t += 1) {
      const a = tris[t * 3]!;
      const b = tris[t * 3 + 1]!;
      const c = tris[t * 3 + 2]!;
      nbrs[a]!.push(b, c);
      nbrs[b]!.push(a, c);
      nbrs[c]!.push(a, b);
    }
    const next = new Float64Array(total * dims);
    for (let iter = 0; iter < 60; iter += 1) {
      for (let v = n; v < total; v += 1) {
        const list = nbrs[v]!;
        if (list.length === 0) continue;
        for (let d = 0; d < dims; d += 1) {
          let sum = 0;
          for (const u of list) sum += data[u * dims + d]!;
          next[v * dims + d] = sum / list.length;
        }
      }
      for (let v = n; v < total; v += 1) {
        if (nbrs[v]!.length === 0) continue;
        for (let d = 0; d < dims; d += 1) data[v * dims + d] = next[v * dims + d]!;
      }
    }
  }
  return {
    verts: Float32Array.from(data.slice(n * dims)),
    tris: Uint32Array.from(tris),
  };
}

function smoothFalloff(d2: number, r2: number) {
  const t = 1 - d2 / r2;
  return t * t;
}

/**
 * 브러시 구 안의 정점을 고른다. 누른 면과 반대쪽을 보는 면(얇은 벽 뒤)은 뺀다.
 * 돌려주는 값은 고른 정점 번호.
 */
export function verticesInBrush(
  positions: Float32Array,
  normals: Float32Array | null,
  center: readonly [number, number, number],
  facing: readonly [number, number, number],
  radius: number,
  minDot = -0.2,
): number[] {
  const r2 = radius * radius;
  const [cx, cy, cz] = center;
  const out: number[] = [];
  const count = Math.floor(positions.length / 3);
  for (let v = 0; v < count; v += 1) {
    const dx = positions[v * 3]! - cx;
    if (dx > radius || dx < -radius) continue;
    const dy = positions[v * 3 + 1]! - cy;
    if (dy > radius || dy < -radius) continue;
    const dz = positions[v * 3 + 2]! - cz;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    if (normals) {
      const dot =
        normals[v * 3]! * facing[0] + normals[v * 3 + 1]! * facing[1] + normals[v * 3 + 2]! * facing[2];
      if (dot < minDot) continue;
    }
    out.push(v);
  }
  return out;
}

/** 이 정점들과 1-이웃의 법선을 닿은 삼각형 면적 가중으로 다시 잡는다. */
export function refreshNormals(
  topo: MeshTopology,
  positions: Float32Array,
  normals: Float32Array,
  touched: readonly number[],
) {
  const ring = new Set<number>();
  for (const v of touched) {
    ring.add(v);
    for (let i = topo.nbrStart[v]!; i < topo.nbrStart[v + 1]!; i += 1) ring.add(topo.nbr[i]!);
  }
  const index = topo.index;
  for (const v of ring) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = topo.triStart[v]!; i < topo.triStart[v + 1]!; i += 1) {
      const t = topo.tris[i]! * 3;
      const a = index[t]! * 3;
      const b = index[t + 1]! * 3;
      const c = index[t + 2]! * 3;
      const ux = positions[b]! - positions[a]!;
      const uy = positions[b + 1]! - positions[a + 1]!;
      const uz = positions[b + 2]! - positions[a + 2]!;
      const wx = positions[c]! - positions[a]!;
      const wy = positions[c + 1]! - positions[a + 1]!;
      const wz = positions[c + 2]! - positions[a + 2]!;
      nx += uy * wz - uz * wy;
      ny += uz * wx - ux * wz;
      nz += ux * wy - uy * wx;
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-20) continue;
    normals[v * 3] = nx / len;
    normals[v * 3 + 1] = ny / len;
    normals[v * 3 + 2] = nz / len;
  }
  return ring;
}

/**
 * 조각 브러시 한 번. positions를 바로 고치고 움직인 정점 번호를 돌려준다.
 * 올리기·깎기는 한 번에 브러시 반지름의 최대 28%를 옮긴다.
 * toward가 있으면 그쪽으로 면을 올린다(카메라 쪽). 스캔 와인딩이 반대여도 화면에서 부풀어 보이게.
 */
export function sculptStamp(args: {
  topo: MeshTopology;
  positions: Float32Array;
  normals: Float32Array;
  center: readonly [number, number, number];
  facing: readonly [number, number, number];
  /** 보이는 쪽으로 올리는 단위 벡터. 없으면 facing. */
  toward?: readonly [number, number, number];
  radius: number;
  strength: number;
  tool: SculptTool;
  /** 누른 삼각형 정점. 구 안에 정점이 없어도 면을 움직인다. */
  seeds?: readonly number[];
}): number[] {
  const { topo, positions, normals, center, facing, radius, tool } = args;
  const strength = Math.max(0, Math.min(1, args.strength));
  const count = Math.floor(positions.length / 3);
  const hit = verticesInBrush(positions, normals, center, facing, radius, -0.6);
  if (args.seeds) {
    for (const v of args.seeds) {
      if (v < 0 || v >= count || hit.includes(v)) continue;
      hit.push(v);
    }
  }
  if (hit.length === 0) return hit;
  const r2 = radius * radius;
  const weights = hit.map((v) => {
    const dx = positions[v * 3]! - center[0];
    const dy = positions[v * 3 + 1]! - center[1];
    const dz = positions[v * 3 + 2]! - center[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) return 0.4;
    return smoothFalloff(d2, r2);
  });
  let ax = 0;
  let ay = 0;
  let az = 0;
  let px = 0;
  let py = 0;
  let pz = 0;
  let wsum = 0;
  hit.forEach((v, i) => {
    const w = weights[i]!;
    ax += normals[v * 3]! * w;
    ay += normals[v * 3 + 1]! * w;
    az += normals[v * 3 + 2]! * w;
    px += positions[v * 3]! * w;
    py += positions[v * 3 + 1]! * w;
    pz += positions[v * 3 + 2]! * w;
    wsum += w;
  });
  const alen = Math.hypot(ax, ay, az);
  const pull = args.toward ?? facing;
  let n: [number, number, number] =
    alen > 1e-12 ? [ax / alen, ay / alen, az / alen] : [pull[0], pull[1], pull[2]];
  if (n[0] * pull[0] + n[1] * pull[1] + n[2] * pull[2] < 0) {
    n = [-n[0], -n[1], -n[2]];
  }

  if (tool === "add" || tool === "remove") {
    const step = radius * 0.28 * strength * (tool === "add" ? 1 : -1);
    hit.forEach((v, i) => {
      const s = step * weights[i]!;
      positions[v * 3] += n[0] * s;
      positions[v * 3 + 1] += n[1] * s;
      positions[v * 3 + 2] += n[2] * s;
    });
  } else if (tool === "smooth") {
    const moves = hit.map((v) => {
      const start = topo.nbrStart[v]!;
      const end = topo.nbrStart[v + 1]!;
      if (end <= start) return null;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let k = start; k < end; k += 1) {
        const u = topo.nbr[k]!;
        sx += positions[u * 3]!;
        sy += positions[u * 3 + 1]!;
        sz += positions[u * 3 + 2]!;
      }
      const inv = 1 / (end - start);
      return [sx * inv, sy * inv, sz * inv] as const;
    });
    hit.forEach((v, i) => {
      const target = moves[i];
      if (!target) return;
      const f = Math.min(1, Math.max(0.2, strength) * weights[i]!);
      positions[v * 3] += (target[0] - positions[v * 3]!) * f;
      positions[v * 3 + 1] += (target[1] - positions[v * 3 + 1]!) * f;
      positions[v * 3 + 2] += (target[2] - positions[v * 3 + 2]!) * f;
    });
  } else if (wsum > 0) {
    const c = [px / wsum, py / wsum, pz / wsum] as const;
    hit.forEach((v, i) => {
      const f = Math.min(1, Math.max(0.2, strength) * weights[i]!);
      const off =
        (positions[v * 3]! - c[0]) * n[0] +
        (positions[v * 3 + 1]! - c[1]) * n[1] +
        (positions[v * 3 + 2]! - c[2]) * n[2];
      positions[v * 3] -= n[0] * off * f;
      positions[v * 3 + 1] -= n[1] * off * f;
      positions[v * 3 + 2] -= n[2] * off * f;
    });
  }
  return hit;
}

/** 화면 좌표 다각형 안인지(짝홀 규칙). poly는 x,y 쌍. */
export function pointInPolygon(x: number, y: number, poly: readonly number[]) {
  let inside = false;
  const count = poly.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = poly[i * 2]!;
    const yi = poly[i * 2 + 1]!;
    const xj = poly[j * 2]!;
    const yj = poly[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
