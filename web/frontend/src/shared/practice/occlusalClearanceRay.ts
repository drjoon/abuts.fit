// 포스트 표면(평탄면·상단 라운드·축벽·사면) → 대합치 최단 거리 및 높이 보정.
// 1) 포스트 높이 맞춤(solvePostTopClearanceShiftMm / shortestPostTopClearanceMm):
//    윗면을 0.1mm 격자로 샘플링하고 대합 스캔 높이장을(opposingTris별 1회 캐시) 참조해 수직·주변 3D 간격을 푼다.
// 2) 표면 최단 대합 거리(OpposingClearanceIndex / closestSurfaceClearanceMm):
//    대합 삼각형 평탄 BVH(AABB 트리) + 수직 침투 격자를 캐시해 초기 생성·재생성·검볼 실시간 편집 모두 밀리초 미만으로 잰다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/components/practice/abutmentDirectEdit.ts

type V = readonly [number, number, number];

const STEP_MM = 0.1;
const MAX_MM = 15;
const MIN_OPP_H_MM = 1.5;
const LATERAL_3D_MM = 0.9;
const LATERAL_CELLS = Math.round(LATERAL_3D_MM / STEP_MM);
const MAX_SAMPLES = 16000;
const MAX_LATERAL_MM = 6.5;
const MAX_GRID_SPAN_MM = 14.5;

type DiskOffset = { di: number; dj: number; dLatSq: number; dLat: number };

const diskOffsetCache = new Map<number, readonly DiskOffset[]>();

function buildDiskOffsets(lateralMm: number): readonly DiskOffset[] {
  const r = Math.min(MAX_LATERAL_MM, Math.max(LATERAL_3D_MM, lateralMm));
  const cells = Math.round(r / STEP_MM);
  const hit = diskOffsetCache.get(cells);
  if (hit) return hit;
  const list: DiskOffset[] = [];
  const rActual = cells * STEP_MM;
  const r2Max = rActual * rActual + 1e-6;
  for (let dj = -cells; dj <= cells; dj += 1) {
    for (let di = -cells; di <= cells; di += 1) {
      if (di === 0 && dj === 0) continue;
      const dLatSq = (di * STEP_MM) ** 2 + (dj * STEP_MM) ** 2;
      if (dLatSq > r2Max) continue;
      list.push({ di, dj, dLatSq, dLat: Math.sqrt(dLatSq) });
    }
  }
  list.sort((a, b) => a.dLatSq - b.dLatSq);
  diskOffsetCache.set(cells, list);
  return list;
}

const DISK_OFFSETS: readonly DiskOffset[] = buildDiskOffsets(LATERAL_3D_MM);

function sub(a: V, b: V): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: V, b: V) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: V, b: V): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(a: V): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l < 1e-8) return [0, 0, 1];
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function clearanceBasis(upIn: V, labialHint?: V) {
  const up = norm(upIn);
  if (labialHint) {
    const d = dot(labialHint, up);
    const raw: [number, number, number] = [
      labialHint[0] - up[0] * d,
      labialHint[1] - up[1] * d,
      labialHint[2] - up[2] * d,
    ];
    if (Math.hypot(raw[0], raw[1], raw[2]) > 1e-6) {
      const u = norm(raw);
      return { up, u, v: cross(up, u) };
    }
  }
  const helper: V = Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(helper, up));
  const v = cross(up, u);
  return { up, u, v };
}

function uv(p: V, u: V, v: V): [number, number] {
  return [dot(p, u), dot(p, v)];
}

/** 평면 좌표 (pu,pv)가 삼각형 안이면 무게중심. */
function bary(
  pu: number,
  pv: number,
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): [number, number, number] | null {
  const v0x = b[0] - a[0];
  const v0y = b[1] - a[1];
  const v1x = c[0] - a[0];
  const v1y = c[1] - a[1];
  const v2x = pu - a[0];
  const v2y = pv - a[1];
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-10) return null;
  const w1 = (v2x * v1y - v1x * v2y) / den;
  const w2 = (v0x * v2y - v2x * v0y) / den;
  const w0 = 1 - w1 - w2;
  if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) return null;
  return [w0, w1, w2];
}

function pushTop(
  out: [V, V, V][],
  a: V,
  b: V,
  c: V,
  up: V,
) {
  const n = cross(sub(b, a), sub(c, a));
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-8 || Math.abs(dot(n, up)) <= 0.12 * len) return;
  out.push([a, b, c]);
}

type CachedOppUvGrid = {
  iuMin: number;
  ivMin: number;
  gCols: number;
  gRows: number;
  oppGrid: Float32Array;
};

const oppUvGridCache = new WeakMap<Float32Array, Map<string, CachedOppUvGrid | null>>();

function getOrBuildOppUvGrid(
  tris: Float32Array,
  up: V,
  u: V,
  v: V,
): CachedOppUvGrid | null {
  const triCount = Math.floor(tris.length / 9);
  if (triCount < 1) return null;
  const key = `${Math.round(up[0] * 1e4)},${Math.round(up[1] * 1e4)},${Math.round(up[2] * 1e4)}:${Math.round(u[0] * 1e4)},${Math.round(u[1] * 1e4)},${Math.round(u[2] * 1e4)}`;
  let byKey = oppUvGridCache.get(tris);
  if (!byKey) {
    byKey = new Map();
    oppUvGridCache.set(tris, byKey);
  }
  if (byKey.has(key)) return byKey.get(key) ?? null;

  const maxCellBound = Math.round(MAX_GRID_SPAN_MM / STEP_MM);
  const maxOppH = 30;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < triCount; i += 1) {
    const o = i * 9;
    const ax = tris[o]!, ay = tris[o + 1]!, az = tris[o + 2]!;
    const bx = tris[o + 3]!, by = tris[o + 4]!, bz = tris[o + 5]!;
    const cx = tris[o + 6]!, cy = tris[o + 7]!, cz = tris[o + 8]!;
    const ah = ax * up[0] + ay * up[1] + az * up[2];
    const bh = bx * up[0] + by * up[1] + bz * up[2];
    const ch = cx * up[0] + cy * up[1] + cz * up[2];
    if (Math.max(ah, bh, ch) < MIN_OPP_H_MM || Math.min(ah, bh, ch) > maxOppH) continue;
    const au = ax * u[0] + ay * u[1] + az * u[2];
    const bu = bx * u[0] + by * u[1] + bz * u[2];
    const cu = cx * u[0] + cy * u[1] + cz * u[2];
    const av = ax * v[0] + ay * v[1] + az * v[2];
    const bv = bx * v[0] + by * v[1] + bz * v[2];
    const cv = cx * v[0] + cy * v[1] + cz * v[2];
    const u0 = Math.min(au, bu, cu);
    const u1 = Math.max(au, bu, cu);
    const v0 = Math.min(av, bv, cv);
    const v1 = Math.max(av, bv, cv);
    if (u1 < -MAX_GRID_SPAN_MM || u0 > MAX_GRID_SPAN_MM || v1 < -MAX_GRID_SPAN_MM || v0 > MAX_GRID_SPAN_MM) {
      continue;
    }
    if (u0 < minU) minU = u0;
    if (u1 > maxU) maxU = u1;
    if (v0 < minV) minV = v0;
    if (v1 > maxV) maxV = v1;
  }
  if (!Number.isFinite(minU) || !Number.isFinite(minV)) {
    byKey.set(key, null);
    return null;
  }
  const iuMin = Math.max(-maxCellBound, Math.floor(minU / STEP_MM) - 1);
  const iuMax = Math.min(maxCellBound, Math.ceil(maxU / STEP_MM) + 1);
  const ivMin = Math.max(-maxCellBound, Math.floor(minV / STEP_MM) - 1);
  const ivMax = Math.min(maxCellBound, Math.ceil(maxV / STEP_MM) + 1);
  const gCols = iuMax - iuMin + 1;
  const gRows = ivMax - ivMin + 1;
  if (gCols <= 0 || gRows <= 0 || gCols * gRows > 250000) {
    byKey.set(key, null);
    return null;
  }

  const oppGrid = new Float32Array(gCols * gRows).fill(Infinity);
  let written = 0;
  for (let i = 0; i < triCount; i += 1) {
    const o = i * 9;
    const ax = tris[o]!, ay = tris[o + 1]!, az = tris[o + 2]!;
    const bx = tris[o + 3]!, by = tris[o + 4]!, bz = tris[o + 5]!;
    const cx = tris[o + 6]!, cy = tris[o + 7]!, cz = tris[o + 8]!;
    const ah = ax * up[0] + ay * up[1] + az * up[2];
    const bh = bx * up[0] + by * up[1] + bz * up[2];
    const ch = cx * up[0] + cy * up[1] + cz * up[2];
    if (Math.max(ah, bh, ch) < MIN_OPP_H_MM || Math.min(ah, bh, ch) > maxOppH) continue;

    const au = ax * u[0] + ay * u[1] + az * u[2];
    const av = ax * v[0] + ay * v[1] + az * v[2];
    const bu = bx * u[0] + by * u[1] + bz * u[2];
    const bv = bx * v[0] + by * v[1] + bz * v[2];
    const cu = cx * u[0] + cy * u[1] + cz * u[2];
    const cv = cx * v[0] + cy * v[1] + cz * v[2];

    const cLo = Math.max(0, Math.floor(Math.min(au, bu, cu) / STEP_MM - 1e-4) - iuMin);
    const cHi = Math.min(gCols - 1, Math.ceil(Math.max(au, bu, cu) / STEP_MM + 1e-4) - iuMin);
    const rLo = Math.max(0, Math.floor(Math.min(av, bv, cv) / STEP_MM - 1e-4) - ivMin);
    const rHi = Math.min(gRows - 1, Math.ceil(Math.max(av, bv, cv) / STEP_MM + 1e-4) - ivMin);
    if (cLo > cHi || rLo > rHi) continue;

    const v0x = bu - au, v0y = bv - av;
    const v1x = cu - au, v1y = cv - av;
    const den = v0x * v1y - v1x * v0y;
    if (Math.abs(den) < 1e-10) continue;
    const invDen = 1 / den;

    for (let r = rLo; r <= rHi; r += 1) {
      const pv = (ivMin + r) * STEP_MM;
      const v2y = pv - av;
      const rowOff = r * gCols;
      for (let c = cLo; c <= cHi; c += 1) {
        const pu = (iuMin + c) * STEP_MM;
        const v2x = pu - au;
        const w1 = (v2x * v1y - v1x * v2y) * invDen;
        const w2 = (v0x * v2y - v2x * v0y) * invDen;
        const w0 = 1 - w1 - w2;
        if (w0 < -1e-3 || w1 < -1e-3 || w2 < -1e-3) continue;
        const h = ah * w0 + bh * w1 + ch * w2;
        if (h < MIN_OPP_H_MM || h > maxOppH) continue;
        const idx = rowOff + c;
        if (h < oppGrid[idx]!) {
          oppGrid[idx] = h;
          written += 1;
        }
      }
    }
  }

  const built = written > 0 ? { iuMin, ivMin, gCols, gRows, oppGrid } : null;
  byKey.set(key, built);
  return built;
}

type CapOpposingField = {
  sampleList: Array<{ iu: number; iv: number; h: number }>;
  maxSampleH: number;
  iuMin: number;
  ivMin: number;
  gCols: number;
  gRows: number;
  oppGrid: Float32Array;
};

function buildCapOpposingField(args: {
  columns: readonly (readonly V[])[];
  apex: V;
  roundSteps: number;
  opposingTris: Float32Array;
  up: V;
  /** 순측 힌트. 있으면 UV가 순설·근원심에 맞춰져 archBiasU가 악궁 순설을 의미한다. */
  labialHint?: V;
  /** 포스트 주변 대합까지 보는 기본 수평 반경(mm). */
  lateralMm?: number;
  /**
   * 악궁 순설 방향 대합 중심 오프셋(mm, + = 순측).
   * 전치 수평피개처럼 대합이 삽입축 바로 위에서 빗나갈 때 격자·탐색을 그쪽으로 넓힌다.
   */
  archBiasU?: number;
  /** 악궁 탐색 시 근원심 반폭(mm). 옆 치아 대합에 걸리지 않게 제한한다. */
  archHalfVMm?: number;
}): CapOpposingField | null {
  const cols = args.columns;
  if (cols.length < 3 || args.opposingTris.length < 9) return null;
  const { up, u, v } = clearanceBasis(args.up, args.labialHint);
  const grid = getOrBuildOppUvGrid(args.opposingTris, up, u, v);
  if (!grid) return null;

  const cap: [V, V, V][] = [];
  for (let col = 0; col < cols.length; col += 1) {
    const post = cols[col]!;
    const next = cols[(col + 1) % cols.length]!;
    if (post.length < 2 || next.length < 2) continue;
    const start = Math.max(0, post.length - args.roundSteps - 1);
    const start2 = Math.max(0, next.length - args.roundSteps - 1);
    const span = Math.min(post.length - start, next.length - start2);
    for (let s = 0; s < span - 1; s += 1) {
      const a = post[start + s]!;
      const b = post[start + s + 1]!;
      const c = next[start2 + s + 1]!;
      const d = next[start2 + s]!;
      pushTop(cap, a, d, c, up);
      pushTop(cap, a, c, b, up);
    }
    const last = post[post.length - 1];
    const last2 = next[next.length - 1];
    if (last && last2) pushTop(cap, last, last2, args.apex, up);
  }
  if (cap.length === 0) return null;

  const samples = new Map<number, { iu: number; iv: number; h: number }>();
  const keep = (p: V) => {
    const iu = Math.round(dot(p, u) / STEP_MM);
    const iv = Math.round(dot(p, v) / STEP_MM);
    const key = (iu + 4096) * 8192 + (iv + 4096);
    if (samples.size >= MAX_SAMPLES && !samples.has(key)) return;
    const h = dot(p, up);
    const prev = samples.get(key);
    if (!prev || h > prev.h) samples.set(key, { iu, iv, h });
  };

  keep(args.apex);
  for (let col = 0; col < cols.length; col += 1) {
    const post = cols[col]!;
    const start = Math.max(0, post.length - args.roundSteps - 1);
    for (let idx = start; idx < post.length; idx += 1) {
      keep(post[idx]!);
    }
  }

  for (const [a, b, c] of cap) {
    const au = uv(a, u, v);
    const bu = uv(b, u, v);
    const cu = uv(c, u, v);
    const umin = Math.min(au[0], bu[0], cu[0]);
    const umax = Math.max(au[0], bu[0], cu[0]);
    const vmin = Math.min(au[1], bu[1], cu[1]);
    const vmax = Math.max(au[1], bu[1], cu[1]);
    if (!Number.isFinite(umin) || umax - umin > 20 || vmax - vmin > 20) continue;
    const u0 = Math.ceil(umin / STEP_MM - 1e-6) * STEP_MM;
    const v0 = Math.ceil(vmin / STEP_MM - 1e-6) * STEP_MM;
    for (let uu = u0; uu <= umax + 1e-6; uu += STEP_MM) {
      for (let vv = v0; vv <= vmax + 1e-6; vv += STEP_MM) {
        const w = bary(uu, vv, au, bu, cu);
        if (!w) continue;
        keep([
          a[0] * w[0] + b[0] * w[1] + c[0] * w[2],
          a[1] * w[0] + b[1] * w[1] + c[1] * w[2],
          a[2] * w[0] + b[2] * w[1] + c[2] * w[2],
        ]);
      }
    }
  }
  if (samples.size === 0) return null;

  const sampleList = [...samples.values()];
  let maxSampleH = -Infinity;
  for (const s of sampleList) {
    if (s.h > maxSampleH) maxSampleH = s.h;
  }

  return {
    sampleList,
    maxSampleH,
    iuMin: grid.iuMin,
    ivMin: grid.ivMin,
    gCols: grid.gCols,
    gRows: grid.gRows,
    oppGrid: grid.oppGrid,
  };
}

type ClearanceRayOpts = {
  columns: readonly (readonly V[])[];
  apex: V;
  roundSteps: number;
  opposingTris: Float32Array;
  up: V;
  labialHint?: V;
  lateralMm?: number;
  archBiasU?: number;
  archHalfVMm?: number;
};

/**
 * 포스트 윗면(상단 라운드 포함)에서 대합 스캔 면까지의 최단 거리(mm).
 * 수직 침투 시 0을 돌려주고, 급경사 대합 교두벽·오버행 교두까지의 3D 거리도 반영한다.
 * 닿는 면이 없으면 null.
 */
export function shortestPostTopClearanceMm(args: ClearanceRayOpts): number | null {
  const field = buildCapOpposingField(args);
  if (!field) return null;
  const { sampleList, maxSampleH, iuMin, ivMin, gCols, gRows, oppGrid } = field;
  const maxOppH = maxSampleH + MAX_MM;
  const lateralMm = Math.min(
    MAX_LATERAL_MM,
    Math.max(LATERAL_3D_MM, args.lateralMm ?? LATERAL_3D_MM),
  );
  const disk =
    Math.abs(lateralMm - LATERAL_3D_MM) < 1e-6 ? DISK_OFFSETS : buildDiskOffsets(lateralMm);
  const archBiasU = Number.isFinite(args.archBiasU) ? Number(args.archBiasU) : 0;
  const archHalfVMm = args.archHalfVMm ?? lateralMm;
  const biasCells = Math.round(archBiasU / STEP_MM);
  const halfVCells = Math.round(archHalfVMm / STEP_MM);

  let best = Infinity;
  for (const s of sampleList) {
    const c = s.iu - iuMin;
    const r = s.iv - ivMin;
    if (c >= 0 && c < gCols && r >= 0 && r < gRows) {
      const h0 = oppGrid[r * gCols + c]!;
      if (Number.isFinite(h0) && h0 <= maxOppH) {
        const dz0 = h0 - s.h;
        if (dz0 < best) best = dz0;
      }
    }
    if (best <= 0) continue;
    for (const off of disk) {
      if (off.dLat >= best) break;
      const cc = c + off.di;
      const rr = r + off.dj;
      if (cc < 0 || cc >= gCols || rr < 0 || rr >= gRows) continue;
      const oppH = oppGrid[rr * gCols + cc]!;
      if (!Number.isFinite(oppH) || oppH > maxOppH) continue;
      const dzPos = oppH > s.h ? oppH - s.h : 0;
      const d3 = Math.sqrt(off.dLatSq + dzPos * dzPos);
      if (d3 < best) best = d3;
    }
    // 악궁 순설로 빗나간 대합: 포스트 셀에서 바이어스 쪽 복도로 추가 탐색(근원심은 halfV로 제한).
    if (Math.abs(biasCells) >= 2) {
      const step = biasCells > 0 ? 1 : -1;
      for (let di = step; step > 0 ? di <= biasCells + LATERAL_CELLS : di >= biasCells - LATERAL_CELLS; di += step) {
        if (Math.abs(di) * STEP_MM >= best) break;
        const cc = c + di;
        if (cc < 0 || cc >= gCols) continue;
        const djLo = Math.max(-halfVCells, -r);
        const djHi = Math.min(halfVCells, gRows - 1 - r);
        for (let dj = djLo; dj <= djHi; dj += 1) {
          const oppH = oppGrid[(r + dj) * gCols + cc]!;
          if (!Number.isFinite(oppH) || oppH > maxOppH) continue;
          const dLatSq = (di * STEP_MM) ** 2 + (dj * STEP_MM) ** 2;
          if (dLatSq >= best * best) continue;
          const dzPos = oppH > s.h ? oppH - s.h : 0;
          const d3 = Math.sqrt(dLatSq + dzPos * dzPos);
          if (d3 < best) best = d3;
        }
      }
    }
  }
  if (!Number.isFinite(best) || best >= MAX_MM) return null;
  return Math.max(0, Math.round(best * 100) / 100);
}

/**
 * 포스트 윗면(상단 라운드 포함) 전체가 대합 스캔과 최소 targetClearanceMm(3D + 수직)를 확보하도록
 * 교합 방향(up)으로 옮겨야 하는 정확한 이동량(mm). 양수면 올리고 음수면 내린다.
 */
export function solvePostTopClearanceShiftMm(
  args: ClearanceRayOpts & {
    targetClearanceMm: number;
  },
): number | null {
  const field = buildCapOpposingField(args);
  if (!field) return null;
  const { sampleList, maxSampleH, iuMin, ivMin, gCols, gRows, oppGrid } = field;
  const maxOppH = maxSampleH + MAX_MM;
  const target = Math.max(0, args.targetClearanceMm);
  const lateralMm = Math.min(
    MAX_LATERAL_MM,
    Math.max(0, args.lateralMm ?? LATERAL_3D_MM),
  );
  const rCheck = Math.min(lateralMm, target);
  const disk =
    Math.abs(lateralMm - LATERAL_3D_MM) < 1e-6 ? DISK_OFFSETS : buildDiskOffsets(Math.max(LATERAL_3D_MM, lateralMm));
  const archBiasU = Number.isFinite(args.archBiasU) ? Number(args.archBiasU) : 0;
  const archHalfVMm = args.archHalfVMm ?? lateralMm;
  const biasCells = Math.round(archBiasU / STEP_MM);
  const halfVCells = Math.round(archHalfVMm / STEP_MM);

  let minAllowShift = Infinity;
  for (const s of sampleList) {
    const c = s.iu - iuMin;
    const r = s.iv - ivMin;
    if (c >= 0 && c < gCols && r >= 0 && r < gRows) {
      const h0 = oppGrid[r * gCols + c]!;
      if (Number.isFinite(h0) && h0 <= maxOppH) {
        const allow = h0 - s.h - target;
        if (allow < minAllowShift) minAllowShift = allow;
      }
    }
    for (const off of disk) {
      if (off.dLat >= rCheck) break;
      const cc = c + off.di;
      const rr = r + off.dj;
      if (cc < 0 || cc >= gCols || rr < 0 || rr >= gRows) continue;
      const oppH = oppGrid[rr * gCols + cc]!;
      if (!Number.isFinite(oppH) || oppH > maxOppH) continue;
      const reqDz = Math.sqrt(Math.max(0, target * target - off.dLatSq));
      const allow = oppH - s.h - reqDz;
      if (allow < minAllowShift) minAllowShift = allow;
    }
    if (Math.abs(biasCells) >= 2) {
      const step = biasCells > 0 ? 1 : -1;
      for (let di = step; step > 0 ? di <= biasCells + LATERAL_CELLS : di >= biasCells - LATERAL_CELLS; di += step) {
        if (Math.abs(di) * STEP_MM >= target) break;
        const cc = c + di;
        if (cc < 0 || cc >= gCols) continue;
        const djLo = Math.max(-halfVCells, -r);
        const djHi = Math.min(halfVCells, gRows - 1 - r);
        for (let dj = djLo; dj <= djHi; dj += 1) {
          const dLatSq = (di * STEP_MM) ** 2 + (dj * STEP_MM) ** 2;
          if (dLatSq >= target * target) continue;
          const oppH = oppGrid[(r + dj) * gCols + cc]!;
          if (!Number.isFinite(oppH) || oppH > maxOppH) continue;
          const reqDz = Math.sqrt(Math.max(0, target * target - dLatSq));
          const allow = oppH - s.h - reqDz;
          if (allow < minAllowShift) minAllowShift = allow;
        }
      }
    }
  }
  if (!Number.isFinite(minAllowShift)) return null;
  return minAllowShift;
}

const CLEAR_SEARCH_MM = 12;
const BVH_LEAF_SIZE = 8;
const BVH_MAX_DEPTH = 22;
const PEN_STEP_MM = 0.2;
const PEN_HALF_SPAN_MM = 8.4;

function distPointTriangleSq(px: number, py: number, pz: number, tri: Float32Array, o: number): number {
  const ax = tri[o]!, ay = tri[o + 1]!, az = tri[o + 2]!;
  const bx = tri[o + 3]!, by = tri[o + 4]!, bz = tri[o + 5]!;
  const cx = tri[o + 6]!, cy = tri[o + 7]!, cz = tri[o + 8]!;
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const dx = ax + abx * v - px;
    const dy = ay + aby * v - py;
    const dz = az + abz * v - pz;
    return dx * dx + dy * dy + dz * dz;
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const dx = ax + acx * w - px;
    const dy = ay + acy * w - py;
    const dz = az + acz * w - pz;
    return dx * dx + dy * dy + dz * dz;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const dx = bx + (cx - bx) * w - px;
    const dy = by + (cy - by) * w - py;
    const dz = bz + (cz - bz) * w - pz;
    return dx * dx + dy * dy + dz * dz;
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const dx = ax + abx * v + acx * w - px;
  const dy = ay + aby * v + acy * w - py;
  const dz = az + abz * v + acz * w - pz;
  return dx * dx + dy * dy + dz * dz;
}

function distPointAabbSq(
  px: number,
  py: number,
  pz: number,
  bounds: Float32Array,
  bo: number,
): number {
  let dSq = 0;
  const minX = bounds[bo]!;
  const maxX = bounds[bo + 3]!;
  if (px < minX) dSq += (minX - px) * (minX - px);
  else if (px > maxX) dSq += (px - maxX) * (px - maxX);

  const minY = bounds[bo + 1]!;
  const maxY = bounds[bo + 4]!;
  if (py < minY) dSq += (minY - py) * (minY - py);
  else if (py > maxY) dSq += (py - maxY) * (py - maxY);

  const minZ = bounds[bo + 2]!;
  const maxZ = bounds[bo + 5]!;
  if (pz < minZ) dSq += (minZ - pz) * (minZ - pz);
  else if (pz > maxZ) dSq += (pz - maxZ) * (pz - maxZ);
  return dSq;
}

export type OpposingClearanceIndexOptions = {
  /** 기준점(기본 [0,0,0]). minHeightMm·근원심(v) 계산의 원점. */
  origin?: V;
  /** 교합 방향 단위벡터. 주어지면 치은 아래 스캔 스커트 제외 및 수직 침투(0mm) 판정에 쓴다. */
  up?: V;
  /** 순측 방향 힌트. 주어지면 근원심(v) 범위를 자기 치아 폭 안으로 제한할 수 있다. */
  labialHint?: V;
  /** origin 기준 최소 교합 높이(mm). 마진 아래 반대악 잇몸 스커트를 제외한다. */
  minHeightMm?: number;
  /** origin 기준 최대 교합 높이(mm). */
  maxHeightMm?: number;
  /** 순설 방향 최대 탐색 반폭(mm). */
  maxAbsUMm?: number;
};

export type OpposingClearanceQuery = {
  /** 크라운이 올라가는 포스트 표면 샘플(x,y,z 반복). */
  points: Float32Array;
  /** 수직 침투(속 빈 대합 스캔 내부 관통) 판정용 포스트 상단 샘플(x,y,z 반복). */
  topPoints?: Float32Array | null;
  /** 포스트 자체 근원심(v) 양끝에서 허용할 대합 여유 폭(mm). 지정 시 포스트 점들에서 자동 계산해 부호 불일치를 원천 차단한다. */
  postCorridorMarginMm?: number;
  /** 현재 포스트의 근원심 중심(v, mm). */
  centerVMm?: number;
  /** 옆 치아 대합을 배제할 근원심 반폭(mm). 미지정 시 제한 없음. */
  maxAbsVMm?: number;
  /** 최대 탐색 거리(mm, 기본 12mm). */
  maxSearchMm?: number;
};

export type OpposingClearanceIndex = {
  readonly triCount: number;
  readonly up: [number, number, number] | null;
  readonly u: [number, number, number] | null;
  readonly v: [number, number, number] | null;
  readonly origin: [number, number, number];
  measureClearanceMm: (query: OpposingClearanceQuery) => number | null;
};

/**
 * 대합 스캔 삼각형에 대한 평탄 AABB BVH + 수직 침투 격자를 만든다.
 * 한 번 만들어 두면 초기 생성·후보 비교·검볼 드래그 프레임마다 0.2~0.4ms 안에 정확한 3D 대합 거리를 잰다.
 */
export function buildOpposingClearanceIndex(
  rawTris: Float32Array,
  opts?: OpposingClearanceIndexOptions,
): OpposingClearanceIndex | null {
  const rawCount = Math.floor(rawTris.length / 9);
  if (rawCount < 1) return null;

  const origin: [number, number, number] = opts?.origin
    ? [opts.origin[0], opts.origin[1], opts.origin[2]]
    : [0, 0, 0];
  const hasFrame = Boolean(opts?.up);
  const frame = opts?.up ? clearanceBasis(opts.up, opts.labialHint) : null;
  const up = frame ? frame.up : null;
  const u = frame ? frame.u : null;
  const v = frame ? frame.v : null;
  const minH = opts?.minHeightMm ?? -Infinity;
  const maxH = opts?.maxHeightMm ?? Infinity;
  const maxAbsU = opts?.maxAbsUMm ?? Infinity;

  let tris = rawTris;
  let triCount = rawCount;
  let triMinV: Float32Array | null = null;
  let triMaxV: Float32Array | null = null;

  if (hasFrame && up && u && v) {
    const kept: number[] = [];
    const minVs: number[] = [];
    const maxVs: number[] = [];
    const ox = origin[0], oy = origin[1], oz = origin[2];
    for (let i = 0; i < rawCount; i += 1) {
      const o = i * 9;
      const ax = rawTris[o]!, ay = rawTris[o + 1]!, az = rawTris[o + 2]!;
      const bx = rawTris[o + 3]!, by = rawTris[o + 4]!, bz = rawTris[o + 5]!;
      const cx = rawTris[o + 6]!, cy = rawTris[o + 7]!, cz = rawTris[o + 8]!;
      const arx = ax - ox, ary = ay - oy, arz = az - oz;
      const brx = bx - ox, bry = by - oy, brz = bz - oz;
      const crx = cx - ox, cry = cy - oy, crz = cz - oz;
      const ah = arx * up[0] + ary * up[1] + arz * up[2];
      const bh = brx * up[0] + bry * up[1] + brz * up[2];
      const ch = crx * up[0] + cry * up[1] + crz * up[2];
      if (Math.max(ah, bh, ch) < minH || Math.min(ah, bh, ch) > maxH) continue;
      const au = arx * u[0] + ary * u[1] + arz * u[2];
      const bu = brx * u[0] + bry * u[1] + brz * u[2];
      const cu = crx * u[0] + cry * u[1] + crz * u[2];
      if (Math.min(Math.abs(au), Math.abs(bu), Math.abs(cu)) > maxAbsU && au * bu > 0 && au * cu > 0) {
        continue;
      }
      const av = arx * v[0] + ary * v[1] + arz * v[2];
      const bv = brx * v[0] + bry * v[1] + brz * v[2];
      const cv = crx * v[0] + cry * v[1] + crz * v[2];
      kept.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      minVs.push(Math.min(av, bv, cv));
      maxVs.push(Math.max(av, bv, cv));
    }
    if (kept.length < 9) return null;
    tris = new Float32Array(kept);
    triCount = Math.floor(tris.length / 9);
    triMinV = new Float32Array(minVs);
    triMaxV = new Float32Array(maxVs);
  }

  // 속이 빈 대합 스캔 껍질을 포스트 상단이 수직으로 관통했을 때(>0 오보고 방지) 즉시 0mm로 판정하는 경량 격자.
  let penGrid: Float32Array | null = null;
  const penCols = Math.round((PEN_HALF_SPAN_MM * 2) / PEN_STEP_MM) + 1;
  if (up && u && v) {
    const grid = new Float32Array(penCols * penCols).fill(Infinity);
    const ox = origin[0], oy = origin[1], oz = origin[2];
    const penMinH = Number.isFinite(minH) ? minH : 0.8;
    let penWritten = 0;
    for (let i = 0; i < triCount; i += 1) {
      const o = i * 9;
      const ax = tris[o]!, ay = tris[o + 1]!, az = tris[o + 2]!;
      const bx = tris[o + 3]!, by = tris[o + 4]!, bz = tris[o + 5]!;
      const cx = tris[o + 6]!, cy = tris[o + 7]!, cz = tris[o + 8]!;
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const tnx = e1y * e2z - e1z * e2y;
      const tny = e1z * e2x - e1x * e2z;
      const tnz = e1x * e2y - e1y * e2x;
      const tnLen = Math.hypot(tnx, tny, tnz);
      if (tnLen < 1e-8 || Math.abs(tnx * up[0] + tny * up[1] + tnz * up[2]) < 0.35 * tnLen) continue;
      const arx = ax - ox, ary = ay - oy, arz = az - oz;
      const brx = bx - ox, bry = by - oy, brz = bz - oz;
      const crx = cx - ox, cry = cy - oy, crz = cz - oz;
      const ah = arx * up[0] + ary * up[1] + arz * up[2];
      const bh = brx * up[0] + bry * up[1] + brz * up[2];
      const ch = crx * up[0] + cry * up[1] + crz * up[2];
      if (Math.max(ah, bh, ch) < penMinH) continue;
      const au = arx * u[0] + ary * u[1] + arz * u[2];
      const av = arx * v[0] + ary * v[1] + arz * v[2];
      const bu = brx * u[0] + bry * u[1] + brz * u[2];
      const bv = brx * v[0] + bry * v[1] + brz * v[2];
      const cu = crx * u[0] + cry * u[1] + crz * u[2];
      const cv = crx * v[0] + cry * v[1] + crz * v[2];
      const cLo = Math.max(0, Math.floor((Math.min(au, bu, cu) + PEN_HALF_SPAN_MM) / PEN_STEP_MM));
      const cHi = Math.min(penCols - 1, Math.ceil((Math.max(au, bu, cu) + PEN_HALF_SPAN_MM) / PEN_STEP_MM));
      const rLo = Math.max(0, Math.floor((Math.min(av, bv, cv) + PEN_HALF_SPAN_MM) / PEN_STEP_MM));
      const rHi = Math.min(penCols - 1, Math.ceil((Math.max(av, bv, cv) + PEN_HALF_SPAN_MM) / PEN_STEP_MM));
      if (cLo > cHi || rLo > rHi) continue;
      const v0x = bu - au, v0y = bv - av;
      const v1x = cu - au, v1y = cv - av;
      const den = v0x * v1y - v1x * v0y;
      if (Math.abs(den) < 1e-9) continue;
      const invDen = 1 / den;
      for (let r = rLo; r <= rHi; r += 1) {
        const pv = -PEN_HALF_SPAN_MM + r * PEN_STEP_MM;
        const v2y = pv - av;
        const rowOff = r * penCols;
        for (let c = cLo; c <= cHi; c += 1) {
          const pu = -PEN_HALF_SPAN_MM + c * PEN_STEP_MM;
          const v2x = pu - au;
          const w1 = (v2x * v1y - v1x * v2y) * invDen;
          const w2 = (v0x * v2y - v2x * v0y) * invDen;
          const w0 = 1 - w1 - w2;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
          const h = ah * w0 + bh * w1 + ch * w2;
          if (h < penMinH) continue;
          const idx = rowOff + c;
          if (h < grid[idx]!) {
            grid[idx] = h;
            penWritten += 1;
          }
        }
      }
    }
    if (penWritten > 0) penGrid = grid;
  }

  const triAabb = new Float32Array(triCount * 6);
  const triCent = new Float32Array(triCount * 3);
  const order = new Int32Array(triCount);
  for (let i = 0; i < triCount; i += 1) {
    order[i] = i;
    const o = i * 9;
    const ax = tris[o]!, ay = tris[o + 1]!, az = tris[o + 2]!;
    const bx = tris[o + 3]!, by = tris[o + 4]!, bz = tris[o + 5]!;
    const cx = tris[o + 6]!, cy = tris[o + 7]!, cz = tris[o + 8]!;
    const bo = i * 6;
    triAabb[bo] = Math.min(ax, bx, cx);
    triAabb[bo + 1] = Math.min(ay, by, cy);
    triAabb[bo + 2] = Math.min(az, bz, cz);
    triAabb[bo + 3] = Math.max(ax, bx, cx);
    triAabb[bo + 4] = Math.max(ay, by, cy);
    triAabb[bo + 5] = Math.max(az, bz, cz);
    const co = i * 3;
    triCent[co] = (ax + bx + cx) * (1 / 3);
    triCent[co + 1] = (ay + by + cy) * (1 / 3);
    triCent[co + 2] = (az + bz + cz) * (1 / 3);
  }

  const maxNodes = Math.max(4, triCount * 2);
  const nodeBounds = new Float32Array(maxNodes * 6);
  const nodeMinV = triMinV ? new Float32Array(maxNodes) : null;
  const nodeMaxV = triMaxV ? new Float32Array(maxNodes) : null;
  const nodeLeftOrStart = new Int32Array(maxNodes);
  const nodeRightOrCount = new Int32Array(maxNodes); // >0: leaf count, <=0: -rightChildIdx
  let nodeCount = 0;

  const buildNode = (start: number, end: number, depth: number): number => {
    const idx = nodeCount;
    nodeCount += 1;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
    let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;
    let vLo = Infinity, vHi = -Infinity;
    for (let k = start; k < end; k += 1) {
      const ti = order[k]!;
      const bo = ti * 6;
      if (triAabb[bo]! < minX) minX = triAabb[bo]!;
      if (triAabb[bo + 1]! < minY) minY = triAabb[bo + 1]!;
      if (triAabb[bo + 2]! < minZ) minZ = triAabb[bo + 2]!;
      if (triAabb[bo + 3]! > maxX) maxX = triAabb[bo + 3]!;
      if (triAabb[bo + 4]! > maxY) maxY = triAabb[bo + 4]!;
      if (triAabb[bo + 5]! > maxZ) maxZ = triAabb[bo + 5]!;
      const co = ti * 3;
      const cx = triCent[co]!, cy = triCent[co + 1]!, cz = triCent[co + 2]!;
      if (cx < cMinX) cMinX = cx;
      if (cx > cMaxX) cMaxX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cy > cMaxY) cMaxY = cy;
      if (cz < cMinZ) cMinZ = cz;
      if (cz > cMaxZ) cMaxZ = cz;
      if (triMinV && triMaxV) {
        if (triMinV[ti]! < vLo) vLo = triMinV[ti]!;
        if (triMaxV[ti]! > vHi) vHi = triMaxV[ti]!;
      }
    }
    const nbo = idx * 6;
    nodeBounds[nbo] = minX;
    nodeBounds[nbo + 1] = minY;
    nodeBounds[nbo + 2] = minZ;
    nodeBounds[nbo + 3] = maxX;
    nodeBounds[nbo + 4] = maxY;
    nodeBounds[nbo + 5] = maxZ;
    if (nodeMinV && nodeMaxV) {
      nodeMinV[idx] = vLo;
      nodeMaxV[idx] = vHi;
    }

    const count = end - start;
    const sx = cMaxX - cMinX;
    const sy = cMaxY - cMinY;
    const sz = cMaxZ - cMinZ;
    const axis = sx >= sy && sx >= sz ? 0 : sy >= sz ? 1 : 2;
    const span = axis === 0 ? sx : axis === 1 ? sy : sz;
    if (count <= BVH_LEAF_SIZE || depth >= BVH_MAX_DEPTH || span < 1e-5 || nodeCount + 2 >= maxNodes) {
      nodeLeftOrStart[idx] = start;
      nodeRightOrCount[idx] = count;
      return idx;
    }

    const split = 0.5 * (axis === 0 ? cMinX + cMaxX : axis === 1 ? cMinY + cMaxY : cMinZ + cMaxZ);
    let i = start;
    let j = end - 1;
    while (i <= j) {
      const ti = order[i]!;
      if (triCent[ti * 3 + axis]! < split) {
        i += 1;
      } else {
        const tmp = order[i]!;
        order[i] = order[j]!;
        order[j] = tmp;
        j -= 1;
      }
    }
    let mid = i;
    if (mid <= start || mid >= end) mid = (start + end) >> 1;
    const left = buildNode(start, mid, depth + 1);
    const right = buildNode(mid, end, depth + 1);
    nodeLeftOrStart[idx] = left;
    nodeRightOrCount[idx] = -right;
    return idx;
  };

  buildNode(0, triCount, 0);

  const stackNode = new Int32Array(64);
  const stackDist = new Float64Array(64);

  const measureClearanceMm = (query: OpposingClearanceQuery): number | null => {
    const pts = query.points;
    const pointCount = Math.floor(pts.length / 3);
    if (pointCount < 1 || nodeCount < 1) return null;

    let vAllowedMin = -Infinity;
    let vAllowedMax = Infinity;
    let hasVFilter = false;
    if (nodeMinV && nodeMaxV && triMinV && triMaxV && v) {
      if (query.postCorridorMarginMm != null && Number.isFinite(query.postCorridorMarginMm)) {
        const margin = Math.max(1.2, Number(query.postCorridorMarginMm));
        const ox = origin[0], oy = origin[1], oz = origin[2];
        let pMinV = Infinity;
        let pMaxV = -Infinity;
        const stepP = Math.max(1, Math.floor(pointCount / 96)) * 3;
        for (let k = 0; k < pts.length; k += stepP) {
          const pv = (pts[k]! - ox) * v[0] + (pts[k + 1]! - oy) * v[1] + (pts[k + 2]! - oz) * v[2];
          if (pv < pMinV) pMinV = pv;
          if (pv > pMaxV) pMaxV = pv;
        }
        if (Number.isFinite(pMinV) && Number.isFinite(pMaxV)) {
          vAllowedMin = pMinV - margin;
          vAllowedMax = pMaxV + margin;
          hasVFilter = true;
        }
      } else if (query.maxAbsVMm != null && Number.isFinite(query.maxAbsVMm)) {
        const centerV = query.centerVMm ?? 0;
        vAllowedMin = centerV - Number(query.maxAbsVMm);
        vAllowedMax = centerV + Number(query.maxAbsVMm);
        hasVFilter = true;
      }
    }

    if (penGrid && up && u && v && query.topPoints && query.topPoints.length >= 3) {
      const tPts = query.topPoints;
      const ox = origin[0], oy = origin[1], oz = origin[2];
      for (let k = 0; k < tPts.length; k += 3) {
        const rx = tPts[k]! - ox;
        const ry = tPts[k + 1]! - oy;
        const rz = tPts[k + 2]! - oz;
        const pv = rx * v[0] + ry * v[1] + rz * v[2];
        if (pv < vAllowedMin || pv > vAllowedMax) continue;
        const pu = rx * u[0] + ry * u[1] + rz * u[2];
        const ci = Math.round((pu + PEN_HALF_SPAN_MM) / PEN_STEP_MM);
        const ri = Math.round((pv + PEN_HALF_SPAN_MM) / PEN_STEP_MM);
        if (ci < 0 || ci >= penCols || ri < 0 || ri >= penCols) continue;
        const oppH = penGrid[ri * penCols + ci]!;
        if (!Number.isFinite(oppH)) continue;
        const ph = rx * up[0] + ry * up[1] + rz * up[2];
        if (ph >= oppH && ph <= oppH + 5.0) return 0;
      }
    }

    const searchMax = query.maxSearchMm ?? CLEAR_SEARCH_MM;
    let bestSq = searchMax * searchMax;

    const queryPoint = (pIdx: number) => {
      const po = pIdx * 3;
      const px = pts[po]!, py = pts[po + 1]!, pz = pts[po + 2]!;
      if (hasVFilter && nodeMinV && nodeMaxV) {
        if (nodeMaxV[0]! < vAllowedMin || nodeMinV[0]! > vAllowedMax) return;
      }
      if (distPointAabbSq(px, py, pz, nodeBounds, 0) >= bestSq) return;

      let sp = 0;
      stackNode[sp] = 0;
      stackDist[sp] = 0;
      sp += 1;
      while (sp > 0) {
        sp -= 1;
        if (stackDist[sp]! >= bestSq) continue;
        const ni = stackNode[sp]!;
        const rc = nodeRightOrCount[ni]!;
        if (rc > 0) {
          const start = nodeLeftOrStart[ni]!;
          const end = start + rc;
          for (let k = start; k < end; k += 1) {
            const ti = order[k]!;
            if (hasVFilter && triMinV && triMaxV) {
              if (triMaxV[ti]! < vAllowedMin || triMinV[ti]! > vAllowedMax) continue;
            }
            const dSq = distPointTriangleSq(px, py, pz, tris, ti * 9);
            if (dSq < bestSq) bestSq = dSq;
          }
          continue;
        }
        const left = nodeLeftOrStart[ni]!;
        const right = -rc;
        const leftOk = !hasVFilter || !nodeMinV || !nodeMaxV || (nodeMaxV[left]! >= vAllowedMin && nodeMinV[left]! <= vAllowedMax);
        const rightOk = !hasVFilter || !nodeMinV || !nodeMaxV || (nodeMaxV[right]! >= vAllowedMin && nodeMinV[right]! <= vAllowedMax);
        const dL = leftOk ? distPointAabbSq(px, py, pz, nodeBounds, left * 6) : Infinity;
        const dR = rightOk ? distPointAabbSq(px, py, pz, nodeBounds, right * 6) : Infinity;
        if (dL <= dR) {
          if (dR < bestSq && sp < 63) {
            stackNode[sp] = right;
            stackDist[sp] = dR;
            sp += 1;
          }
          if (dL < bestSq && sp < 63) {
            stackNode[sp] = left;
            stackDist[sp] = dL;
            sp += 1;
          }
        } else {
          if (dL < bestSq && sp < 63) {
            stackNode[sp] = left;
            stackDist[sp] = dL;
            sp += 1;
          }
          if (dR < bestSq && sp < 63) {
            stackNode[sp] = right;
            stackDist[sp] = dR;
            sp += 1;
          }
        }
      }
    };

    const seedStride = Math.max(1, Math.floor(pointCount / 48));
    if (seedStride > 1) {
      for (let p = 0; p < pointCount; p += seedStride) {
        queryPoint(p);
        if (bestSq <= 1e-4) return 0;
      }
      for (let p = 0; p < pointCount; p += 1) {
        if (p % seedStride === 0) continue;
        queryPoint(p);
        if (bestSq <= 1e-4) return 0;
      }
    } else {
      for (let p = 0; p < pointCount; p += 1) {
        queryPoint(p);
        if (bestSq <= 1e-4) return 0;
      }
    }

    if (!(bestSq < (searchMax - 1e-3) * (searchMax - 1e-3))) return null;
    return Math.max(0, Math.round(Math.sqrt(bestSq) * 100) / 100);
  };

  return { triCount, up, u, v, origin, measureClearanceMm };
}

const rawSurfaceIndexCache = new WeakMap<Float32Array, OpposingClearanceIndex | null>();
const framedSurfaceIndexCache = new WeakMap<Float32Array, Map<string, OpposingClearanceIndex | null>>();

/**
 * 어벗 겉면 점과 대합 스캔 삼각형의 최단 거리(mm).
 * 윗면 수직 간격이 아니라, 축벽·절단연을 포함한 가장 가까운 점 쌍이다.
 * 닿는 면이 없으면 null.
 */
export function closestSurfaceClearanceMm(args: {
  points: Float32Array;
  opposingTris: Float32Array;
  topPoints?: Float32Array | null;
  origin?: V;
  up?: V;
  labialHint?: V;
  minHeightMm?: number;
  maxHeightMm?: number;
  maxAbsUMm?: number;
  postCorridorMarginMm?: number;
  centerVMm?: number;
  maxAbsVMm?: number;
}): number | null {
  if (args.opposingTris.length < 9 || args.points.length < 3) return null;
  const hasFrameOpts =
    args.up != null ||
    args.minHeightMm != null ||
    args.maxHeightMm != null ||
    args.maxAbsUMm != null;
  let index: OpposingClearanceIndex | null;
  if (!hasFrameOpts) {
    if (rawSurfaceIndexCache.has(args.opposingTris)) {
      index = rawSurfaceIndexCache.get(args.opposingTris) ?? null;
    } else {
      index = buildOpposingClearanceIndex(args.opposingTris);
      rawSurfaceIndexCache.set(args.opposingTris, index);
    }
  } else {
    const r3 = (v: number | undefined) => (v == null || !Number.isFinite(v) ? "_" : String(Math.round(v * 200)));
    const key = [
      args.origin ? `${r3(args.origin[0])},${r3(args.origin[1])},${r3(args.origin[2])}` : "0",
      args.up ? `${r3(args.up[0])},${r3(args.up[1])},${r3(args.up[2])}` : "_",
      args.labialHint ? `${r3(args.labialHint[0])},${r3(args.labialHint[1])},${r3(args.labialHint[2])}` : "_",
      r3(args.minHeightMm),
      r3(args.maxHeightMm),
      r3(args.maxAbsUMm),
    ].join("|");
    let byKey = framedSurfaceIndexCache.get(args.opposingTris);
    if (!byKey) {
      byKey = new Map();
      framedSurfaceIndexCache.set(args.opposingTris, byKey);
    }
    if (byKey.has(key)) {
      index = byKey.get(key) ?? null;
    } else {
      index = buildOpposingClearanceIndex(args.opposingTris, {
        origin: args.origin,
        up: args.up,
        labialHint: args.labialHint,
        minHeightMm: args.minHeightMm,
        maxHeightMm: args.maxHeightMm,
        maxAbsUMm: args.maxAbsUMm,
      });
      byKey.set(key, index);
    }
  }
  if (!index) return null;
  return index.measureClearanceMm({
    points: args.points,
    topPoints: args.topPoints,
    postCorridorMarginMm: args.postCorridorMarginMm,
    centerVMm: args.centerVMm,
    maxAbsVMm: args.maxAbsVMm,
  });
}
