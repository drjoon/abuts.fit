// 포스트 윗면(평탄면 + 상단 라운드 테두리) → 대합치 최단 거리.
// 윗면 전체를 0.1mm 격자로 샘플링하고, 교합 방향 침투(< 0)와 주변 대합 교두 경사벽(3D 거리)을 함께 잰다.
// 전치부는 악궁 곡률·수평피개로 대합이 삽입축 바로 위에서 빗나가므로, archBiasU로 순설 탐색을 넓힌다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

type V = readonly [number, number, number];

const STEP_MM = 0.1;
const MAX_MM = 15;
const MIN_OPP_H_MM = 1.5;
const LATERAL_3D_MM = 0.9;
const LATERAL_CELLS = Math.round(LATERAL_3D_MM / STEP_MM);
const MAX_SAMPLES = 16000;
const MAX_LATERAL_MM = 6.5;

type DiskOffset = { di: number; dj: number; dLatSq: number; dLat: number };

function buildDiskOffsets(lateralMm: number): readonly DiskOffset[] {
  const r = Math.min(MAX_LATERAL_MM, Math.max(LATERAL_3D_MM, lateralMm));
  const cells = Math.round(r / STEP_MM);
  const list: DiskOffset[] = [];
  const r2Max = r * r + 1e-6;
  for (let dj = -cells; dj <= cells; dj += 1) {
    for (let di = -cells; di <= cells; di += 1) {
      if (di === 0 && dj === 0) continue;
      const dLatSq = (di * STEP_MM) ** 2 + (dj * STEP_MM) ** 2;
      if (dLatSq > r2Max) continue;
      list.push({ di, dj, dLatSq, dLat: Math.sqrt(dLatSq) });
    }
  }
  list.sort((a, b) => a.dLatSq - b.dLatSq);
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

function basis(upIn: V, labialHint?: V) {
  const up = norm(upIn);
  if (labialHint) {
    const raw: [number, number, number] = [
      labialHint[0] - up[0] * dot(labialHint, up),
      labialHint[1] - up[1] * dot(labialHint, up),
      labialHint[2] - up[2] * dot(labialHint, up),
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

type CapOpposingField = {
  sampleList: Array<{ iu: number; iv: number; h: number }>;
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
  const { up, u, v } = basis(args.up, args.labialHint);
  const lateralMm = Math.min(
    MAX_LATERAL_MM,
    Math.max(LATERAL_3D_MM, args.lateralMm ?? LATERAL_3D_MM),
  );
  const lateralCells = Math.round(lateralMm / STEP_MM);
  const archBiasU = Number.isFinite(args.archBiasU) ? Number(args.archBiasU) : 0;
  const archBiasCells = Math.round(Math.abs(archBiasU) / STEP_MM);
  const archHalfVMm = Math.min(
    MAX_LATERAL_MM,
    Math.max(lateralMm, args.archHalfVMm ?? lateralMm),
  );
  const archHalfVCells = Math.round(archHalfVMm / STEP_MM);
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

  const samples = new Map<string, { iu: number; iv: number; h: number }>();
  const keep = (p: V) => {
    const iu = Math.round(dot(p, u) / STEP_MM);
    const iv = Math.round(dot(p, v) / STEP_MM);
    const key = `${iu}:${iv}`;
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
  let sIuMin = Infinity;
  let sIuMax = -Infinity;
  let sIvMin = Infinity;
  let sIvMax = -Infinity;
  let maxSampleH = -Infinity;
  for (const s of sampleList) {
    if (s.iu < sIuMin) sIuMin = s.iu;
    if (s.iu > sIuMax) sIuMax = s.iu;
    if (s.iv < sIvMin) sIvMin = s.iv;
    if (s.iv > sIvMax) sIvMax = s.iv;
    if (s.h > maxSampleH) maxSampleH = s.h;
  }

  // 악궁 순설 바이어스 쪽으로 격자를 확장해, 포스트 footprint 밖의 대합 삼각형도 담는다.
  const biasSign = archBiasU >= 0 ? 1 : -1;
  const iuMin =
    sIuMin - lateralCells - (biasSign < 0 ? archBiasCells + lateralCells : 0);
  const iuMax =
    sIuMax + lateralCells + (biasSign > 0 ? archBiasCells + lateralCells : 0);
  const ivMin = sIvMin - Math.max(lateralCells, archHalfVCells);
  const ivMax = sIvMax + Math.max(lateralCells, archHalfVCells);
  const gCols = iuMax - iuMin + 1;
  const gRows = ivMax - ivMin + 1;
  if (gCols <= 0 || gRows <= 0 || gCols * gRows > 250000) return null;

  const oppGrid = new Float32Array(gCols * gRows).fill(Infinity);
  const maxOppH = maxSampleH + MAX_MM;
  const tris = args.opposingTris;
  const triCount = Math.floor(tris.length / 9);
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
  if (written === 0) return null;
  return { sampleList, iuMin, ivMin, gCols, gRows, oppGrid };
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
  const { sampleList, iuMin, ivMin, gCols, oppGrid } = field;
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
    const h0 = oppGrid[r * gCols + c]!;
    if (Number.isFinite(h0)) {
      const dz0 = h0 - s.h;
      if (dz0 < best) best = dz0;
    }
    if (best <= 0) continue;
    for (const off of disk) {
      if (off.dLat >= best) break;
      const oppH = oppGrid[(r + off.dj) * gCols + (c + off.di)]!;
      if (!Number.isFinite(oppH)) continue;
      const dzPos = oppH > s.h ? oppH - s.h : 0;
      const d3 = Math.sqrt(off.dLatSq + dzPos * dzPos);
      if (d3 < best) best = d3;
    }
    // 악궁 순설로 빗나간 대합: 포스트 셀에서 바이어스 쪽 복도로 추가 탐색(근원심은 halfV로 제한).
    if (Math.abs(biasCells) >= 2) {
      const step = biasCells > 0 ? 1 : -1;
      for (let di = step; step > 0 ? di <= biasCells + LATERAL_CELLS : di >= biasCells - LATERAL_CELLS; di += step) {
        for (let dj = -halfVCells; dj <= halfVCells; dj += 1) {
          const oppH = oppGrid[(r + dj) * gCols + (c + di)]!;
          if (!Number.isFinite(oppH)) continue;
          const dLatSq = (di * STEP_MM) ** 2 + (dj * STEP_MM) ** 2;
          const dLat = Math.sqrt(dLatSq);
          if (dLat >= best) continue;
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
  const { sampleList, iuMin, ivMin, gCols, oppGrid } = field;
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
    const h0 = oppGrid[r * gCols + c]!;
    if (Number.isFinite(h0)) {
      const allow = h0 - s.h - target;
      if (allow < minAllowShift) minAllowShift = allow;
    }
    for (const off of disk) {
      if (off.dLat >= rCheck) break;
      const oppH = oppGrid[(r + off.dj) * gCols + (c + off.di)]!;
      if (!Number.isFinite(oppH)) continue;
      const reqDz = Math.sqrt(Math.max(0, target * target - off.dLatSq));
      const allow = oppH - s.h - reqDz;
      if (allow < minAllowShift) minAllowShift = allow;
    }
    if (Math.abs(biasCells) >= 2) {
      const step = biasCells > 0 ? 1 : -1;
      for (let di = step; step > 0 ? di <= biasCells + LATERAL_CELLS : di >= biasCells - LATERAL_CELLS; di += step) {
        for (let dj = -halfVCells; dj <= halfVCells; dj += 1) {
          const dLatSq = (di * STEP_MM) ** 2 + (dj * STEP_MM) ** 2;
          if (dLatSq >= target * target) continue;
          const oppH = oppGrid[(r + dj) * gCols + (c + di)]!;
          if (!Number.isFinite(oppH)) continue;
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
