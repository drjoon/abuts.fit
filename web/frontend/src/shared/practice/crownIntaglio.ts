// 기공소 AI 크라운 — 지대치 스캔에서 크라운 내면(intaglio)을 만든다.
// 삽입축에서 본 지대치 높이장을 마진 안쪽 극좌표 단면으로 풀어, 마진 실·시멘트·추가 갭만큼 띄운다.
// 높이장은 축 방향 각 칸의 가장 높은 면이라 삽입 경로에 걸리는 언더컷이 이미 메워진다(블록아웃).
// 좌표는 월드 기하 단위. 간격·두께는 mm로 받고 unitToMm로 바꾼다.
// related files:
// - web/frontend/src/shared/components/practice/labProsthesisEditLayer.ts
// - web/frontend/src/shared/practice/labDesignPresets.ts

import type { ScanCloud } from "./crownAdapt";

export type IntaglioParams = {
  cementGapMm: number;
  extraGapMm: number;
  sealGapMm: number;
  sealHeightMm: number;
  /** 밀링 버 반지름. 0이면 프린트. */
  toolRadiusMm: number;
  /** 마진 끝 두께. 바깥 테두리를 이만큼 밖에 둔다. */
  marginWidthMm: number;
};

export type IntaglioInput = {
  /** 지대치 악 스캔 점(월드). */
  cloud: ScanCloud;
  center: readonly [number, number, number];
  /** 삽입축. 교합 쪽 단위 벡터. */
  axis: readonly [number, number, number];
  /** 마진 좌표계 가로·세로 단위 벡터. 마진 점 각도는 x에서 z 쪽으로 잰다. */
  xDir: readonly [number, number, number];
  zDir: readonly [number, number, number];
  /** 마진 점마다 바깥 반지름·축 높이(center 기준, 월드 단위). 각도는 i/n·2π. */
  marginRadii: readonly number[];
  marginDepths: readonly number[];
  /** 만들 열의 방위각(라디안). 오름차순. 크라운 테두리 정점과 같은 열이다. */
  azimuths: readonly number[];
  unitToMm: number;
  params: IntaglioParams;
};

export type IntaglioMesh = {
  columns: number;
  /** 열마다 극점을 뺀 정점 수. 0이 마진 테두리, 끝이 극점 바로 옆. */
  rings: number;
  /** 월드 정점. 열 j 링 k는 j*rings+k, 극점은 마지막 하나. */
  positions: Float32Array;
  /** 지대치에서 크라운 쪽으로 향하는 단위 벡터. */
  outward: Float32Array;
  /** 정점마다 설계한 간격(mm). */
  designedGapMm: Float32Array;
  /**
   * 삼각형. 마진 테두리 변이 I_j → I_{j+1} 방향으로 쓰인다.
   * 크라운 외면과 이어 닫을 때 `orientIntaglioIndex`로 방향을 맞춘다.
   */
  index: Uint32Array;
  /** 마진 테두리 정점 번호(열 순서). */
  rim: Uint32Array;
  poleIndex: number;
};

export type IntaglioFailure = "sparse" | "margin";

export type IntaglioResult =
  | { ok: true; mesh: IntaglioMesh; coverage: number }
  | { ok: false; reason: IntaglioFailure };

const GRID_CELL_MM = 0.12;
const PROFILE_BIN_MM = 0.05;
const SLAB_HALF_MM = 0.09;
const RING_COUNT = 26;
const MIN_COVERAGE = 0.5;
/** 마진 바깥 이만큼까지의 점만 지대치로 본다. 인접치·치은이 섞이지 않게 한다. */
const MARGIN_CLIP_MM = 0.1;
const BELOW_MARGIN_MM = 0.3;
const SEAL_BLEND_MM = 0.5;

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(edge1 - edge0, 1e-9)));
  return t * t * (3 - 2 * t);
}

function ringAt(values: readonly number[], phi: number) {
  const n = values.length;
  let a = (phi / (Math.PI * 2)) * n;
  a = ((a % n) + n) % n;
  const i0 = Math.floor(a) % n;
  const t = a - Math.floor(a);
  return values[i0]! * (1 - t) + values[(i0 + 1) % n]! * t;
}

/**
 * 삽입축에서 본 지대치 윗면 점. 칸마다 가장 높은 점 하나만 남겨 아래 층(언더컷 밑)을 걸러 내고,
 * 점은 칸 가운데로 옮기지 않고 제 위치(u, w, h)를 그대로 둔다. 가파른 옆면에서 칸 크기만큼 벌어지지 않는다.
 */
type TopPoints = { u: Float32Array; w: Float32Array; h: Float32Array; coverage: number };

function collectTopPoints(input: IntaglioInput, mm: number): TopPoints | null {
  const { cloud, center, axis, xDir, zDir, marginRadii, marginDepths } = input;
  const maxR = Math.max(...marginRadii);
  if (!(maxR > 0)) return null;
  const cell = GRID_CELL_MM * mm;
  const half = Math.min(maxR + cell * 3, 14 * mm);
  const size = Math.ceil((half * 2) / cell) + 1;
  const best = new Int32Array(size * size).fill(-1);
  const us: number[] = [];
  const ws: number[] = [];
  const hs: number[] = [];
  const clip = MARGIN_CLIP_MM * mm;
  const below = BELOW_MARGIN_MM * mm;
  const pts = cloud.points;
  for (let i = 0; i < pts.length; i += 3) {
    const dx = pts[i]! - center[0];
    const dy = pts[i + 1]! - center[1];
    const dz = pts[i + 2]! - center[2];
    const axial = dx * axis[0] + dy * axis[1] + dz * axis[2];
    const u = dx * xDir[0] + dy * xDir[1] + dz * xDir[2];
    const w = dx * zDir[0] + dy * zDir[1] + dz * zDir[2];
    const phi = Math.atan2(w, u);
    if (Math.hypot(u, w) > ringAt(marginRadii, phi) + clip) continue;
    if (axial < ringAt(marginDepths, phi) - below) continue;
    const iu = Math.floor((u + half) / cell);
    const iw = Math.floor((w + half) / cell);
    if (iu < 0 || iw < 0 || iu >= size || iw >= size) continue;
    const at = iw * size + iu;
    const prev = best[at]!;
    if (prev >= 0 && hs[prev]! >= axial) continue;
    if (prev >= 0) {
      us[prev] = u;
      ws[prev] = w;
      hs[prev] = axial;
    } else {
      best[at] = us.length;
      us.push(u);
      ws.push(w);
      hs.push(axial);
    }
  }

  let inside = 0;
  let filled = 0;
  for (let iw = 0; iw < size; iw += 1) {
    for (let iu = 0; iu < size; iu += 1) {
      const u = -half + (iu + 0.5) * cell;
      const w = -half + (iw + 0.5) * cell;
      if (Math.hypot(u, w) > ringAt(marginRadii, Math.atan2(w, u)) * 0.98) continue;
      inside += 1;
      if (best[iw * size + iu]! >= 0) filled += 1;
    }
  }
  return {
    u: Float32Array.from(us),
    w: Float32Array.from(ws),
    h: Float32Array.from(hs),
    coverage: inside > 0 ? filled / inside : 0,
  };
}

type ProfilePoint = { r: number; h: number };

/**
 * 마진에서 중심으로 올라가는 단면. 이 방위각 세로 평면 둘레 얇은 띠의 윗면 점을 반지름 칸마다 가장 높은
 * 점으로 모아 잇는다. 마진 아래는 자르고 시작점을 마진 높이에 둔다. 점이 모자라면 null.
 */
function columnProfile(
  tops: TopPoints,
  phi: number,
  radius: number,
  marginAxial: number,
  mm: number,
): ProfilePoint[] | null {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const bin = PROFILE_BIN_MM * mm;
  const clip = MARGIN_CLIP_MM * mm;
  let cands: ProfilePoint[] = [];
  for (let widen = 1; widen <= 3; widen += 1) {
    const slab = SLAB_HALF_MM * mm * widen;
    const byBin = new Map<number, ProfilePoint>();
    for (let i = 0; i < tops.u.length; i += 1) {
      const u = tops.u[i]!;
      const w = tops.w[i]!;
      const along = u * cos + w * sin;
      if (along < 0 || along > radius + clip) continue;
      if (Math.abs(-u * sin + w * cos) > slab) continue;
      const key = Math.floor(along / bin);
      const prev = byBin.get(key);
      if (!prev || prev.h < tops.h[i]!) byBin.set(key, { r: along, h: tops.h[i]! });
    }
    cands = [...byBin.values()];
    if (cands.length >= Math.max(8, Math.floor(radius / (bin * 3)))) break;
  }
  if (cands.length < 6) return null;
  cands.sort((a, b) => b.r - a.r);
  const profile: ProfilePoint[] = [];
  for (const p of cands) {
    if (p.r > radius) continue;
    profile.push({ r: p.r, h: Math.max(p.h, marginAxial) });
  }
  if (profile.length < 6) return null;
  if (profile[0]!.r < radius - 1e-9) profile.unshift({ r: radius, h: profile[0]!.h });
  if (profile[0]!.h > marginAxial + 1e-9) profile.unshift({ r: radius, h: marginAxial });
  // 중심 끝은 r=0까지 이어 준다.
  const tail = profile[profile.length - 1]!;
  if (tail.r > 1e-9) profile.push({ r: 0, h: tail.h });
  return profile;
}

function resampleByArc(points: ProfilePoint[], count: number): ProfilePoint[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.r - a.r, b.h - a.h));
  }
  const total = cumulative[cumulative.length - 1]!;
  const out: ProfilePoint[] = [];
  let seg = 1;
  for (let k = 0; k <= count; k += 1) {
    const target = (total * k) / count;
    while (seg < points.length - 1 && cumulative[seg]! < target) seg += 1;
    const a = points[seg - 1]!;
    const b = points[seg]!;
    const span = cumulative[seg]! - cumulative[seg - 1]!;
    const t = span > 1e-12 ? (target - cumulative[seg - 1]!) / span : 0;
    out.push({ r: a.r + (b.r - a.r) * t, h: a.h + (b.h - a.h) * t });
  }
  return out;
}

/** 마진 실 → 시멘트 갭. 마진에서 실 높이까지는 실 갭, 그 위 0.5mm 사이에 시멘트 갭으로 넘어간다. */
export function designedGapMm(
  params: IntaglioParams,
  heightAboveMarginMm: number,
  normalUp: number,
  cornerRadiusMm: number | null,
): number {
  const base =
    params.sealGapMm +
    (params.cementGapMm - params.sealGapMm) *
      smoothstep(params.sealHeightMm, params.sealHeightMm + SEAL_BLEND_MM, heightAboveMarginMm);
  const occlusal = smoothstep(0.5, 0.85, normalUp);
  let corner = 0;
  if (cornerRadiusMm != null && params.toolRadiusMm > 0 && cornerRadiusMm < params.toolRadiusMm) {
    corner = 1 - cornerRadiusMm / params.toolRadiusMm;
  }
  return base + params.extraGapMm * Math.max(occlusal, corner);
}

export function buildIntaglio(input: IntaglioInput): IntaglioResult {
  const n = input.marginRadii.length;
  const columns = input.azimuths.length;
  if (n < 8 || input.marginDepths.length !== n || columns < 8) {
    return { ok: false, reason: "margin" };
  }
  const unit = input.unitToMm > 0 ? input.unitToMm : 1;
  const mm = 1 / unit;
  const tops = collectTopPoints(input, mm);
  if (!tops) return { ok: false, reason: "margin" };
  if (tops.coverage < MIN_COVERAGE) return { ok: false, reason: "sparse" };

  const rings = RING_COUNT;
  const vertexCount = columns * rings + 1;
  const positions = new Float32Array(vertexCount * 3);
  const outward = new Float32Array(vertexCount * 3);
  const gaps = new Float32Array(vertexCount);
  const { center, axis, xDir, zDir, params } = input;
  const poleAt = columns * rings;
  let poleX = 0;
  let poleY = 0;
  let poleZ = 0;
  let poleGap = 0;

  for (let j = 0; j < columns; j += 1) {
    const phi = input.azimuths[j]!;
    const radius = ringAt(input.marginRadii, phi);
    const marginAxial = ringAt(input.marginDepths, phi);
    const raw = columnProfile(tops, phi, radius, marginAxial, mm);
    if (!raw) return { ok: false, reason: "sparse" };
    const profile = resampleByArc(raw, rings);
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const radial = [
      cos * xDir[0] + sin * zDir[0],
      cos * xDir[1] + sin * zDir[1],
      cos * xDir[2] + sin * zDir[2],
    ];
    for (let k = 0; k <= rings; k += 1) {
      const p = profile[k]!;
      const before = profile[Math.max(0, k - 1)]!;
      const after = profile[Math.min(rings, k + 1)]!;
      let tr = after.r - before.r;
      let th = after.h - before.h;
      const tl = Math.hypot(tr, th) || 1;
      tr /= tl;
      th /= tl;
      // 지대치 바깥쪽 법선. 마진 옆면은 반지름 바깥, 윗면은 교합 쪽.
      const nr = th;
      const nh = -tr;
      let corner: number | null = null;
      if (k > 0 && k < rings) {
        const a = { r: p.r - before.r, h: p.h - before.h };
        const b = { r: after.r - p.r, h: after.h - p.h };
        const la = Math.hypot(a.r, a.h);
        const lb = Math.hypot(b.r, b.h);
        if (la > 1e-12 && lb > 1e-12) {
          const cross = a.r * b.h - a.h * b.r;
          const dot = a.r * b.r + a.h * b.h;
          const turn = Math.atan2(cross, dot);
          if (turn > 1e-3) corner = (((la + lb) / 2) * unit) / turn;
        }
      }
      const gap = designedGapMm(params, (p.h - marginAxial) * unit, nh, corner);
      const r = Math.max(0, p.r + nr * gap * mm);
      const h = p.h + nh * gap * mm;
      const at = k === rings ? poleAt : j * rings + k;
      const ox = radial[0]! * nr + axis[0] * nh;
      const oy = radial[1]! * nr + axis[1] * nh;
      const oz = radial[2]! * nr + axis[2] * nh;
      const wx = center[0] + radial[0]! * r + axis[0] * h;
      const wy = center[1] + radial[1]! * r + axis[1] * h;
      const wz = center[2] + radial[2]! * r + axis[2] * h;
      if (k === rings) {
        poleX += wx / columns;
        poleY += wy / columns;
        poleZ += wz / columns;
        poleGap += gap / columns;
        continue;
      }
      positions[at * 3] = wx;
      positions[at * 3 + 1] = wy;
      positions[at * 3 + 2] = wz;
      outward[at * 3] = ox;
      outward[at * 3 + 1] = oy;
      outward[at * 3 + 2] = oz;
      gaps[at] = gap;
    }
  }
  positions[poleAt * 3] = poleX;
  positions[poleAt * 3 + 1] = poleY;
  positions[poleAt * 3 + 2] = poleZ;
  outward[poleAt * 3] = axis[0];
  outward[poleAt * 3 + 1] = axis[1];
  outward[poleAt * 3 + 2] = axis[2];
  gaps[poleAt] = poleGap;

  const tris: number[] = [];
  for (let j = 0; j < columns; j += 1) {
    const j1 = (j + 1) % columns;
    for (let k = 0; k < rings - 1; k += 1) {
      const a = j * rings + k;
      const b = j1 * rings + k;
      const c = j1 * rings + k + 1;
      const d = j * rings + k + 1;
      tris.push(a, b, c, a, c, d);
    }
    tris.push(j * rings + rings - 1, j1 * rings + rings - 1, poleAt);
  }
  const rim = new Uint32Array(columns);
  for (let j = 0; j < columns; j += 1) rim[j] = j * rings;
  return {
    ok: true,
    coverage: tops.coverage,
    mesh: {
      columns,
      rings,
      positions,
      outward,
      designedGapMm: gaps,
      index: Uint32Array.from(tris),
      rim,
      poleIndex: poleAt,
    },
  };
}

/** 크라운 외면 테두리가 D_j → D_{j+1}로 쓰이면(domeForward) 내면은 반대로 뒤집어 매니폴드를 잇는다. */
export function orientIntaglioIndex(index: Uint32Array, domeForward: boolean): Uint32Array {
  if (!domeForward) return index;
  const out = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i += 3) {
    out[i] = index[i]!;
    out[i + 1] = index[i + 2]!;
    out[i + 2] = index[i + 1]!;
  }
  return out;
}

/**
 * 테두리 띠. 바깥 테두리 D와 내면 테두리 I를 잇는다.
 * `domeForward`는 외면이 D_j → D_{j+1}로 쓰는지. 띠는 D 변을 반대로 쓴다.
 */
export function marginStripIndex(
  outerRim: ArrayLike<number>,
  innerRim: ArrayLike<number>,
  domeForward: boolean,
): number[] {
  const n = outerRim.length;
  const tris: number[] = [];
  for (let j = 0; j < n; j += 1) {
    const j1 = (j + 1) % n;
    const d0 = outerRim[j]!;
    const d1 = outerRim[j1]!;
    const i0 = innerRim[j]!;
    const i1 = innerRim[j1]!;
    if (domeForward) {
      tris.push(d1, d0, i0, d1, i0, i1);
    } else {
      tris.push(d0, d1, i1, d0, i1, i0);
    }
  }
  return tris;
}

type Vec3 = [number, number, number];

function closestOnTriangle(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): Vec3 {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp: Vec3 = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
  }
  const cp: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

export type IntaglioHit = {
  /** 내면까지 거리(mm). 크라운 재료 쪽이 +, 지대치·빈 공간 쪽이 −. */
  signedMm: number;
  /** 가장 가까운 내면 점(월드). */
  q: Vec3;
  /** 그 자리에서 지대치→크라운 쪽 단위 벡터. */
  n: Vec3;
};

/** 점에서 내면 메시까지 가장 가까운 점. 정점 수가 천 단위라 가장 가까운 정점을 찾고 그 둘레 삼각형만 본다. */
export class IntaglioProbe {
  private readonly incident: number[][];

  constructor(
    private readonly mesh: IntaglioMesh,
    private readonly unitToMm: number,
  ) {
    const count = mesh.positions.length / 3;
    this.incident = Array.from({ length: count }, () => []);
    for (let t = 0; t < mesh.index.length; t += 3) {
      for (let c = 0; c < 3; c += 1) this.incident[mesh.index[t + c]!]!.push(t);
    }
  }

  closest(x: number, y: number, z: number): IntaglioHit {
    const pos = this.mesh.positions;
    let best = Infinity;
    let bestVertex = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const dx = pos[i]! - x;
      const dy = pos[i + 1]! - y;
      const dz = pos[i + 2]! - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) {
        best = d2;
        bestVertex = i / 3;
      }
    }
    const p: Vec3 = [x, y, z];
    let q: Vec3 = [pos[bestVertex * 3]!, pos[bestVertex * 3 + 1]!, pos[bestVertex * 3 + 2]!];
    let bestD2 = best;
    for (const t of this.incident[bestVertex]!) {
      const ia = this.mesh.index[t]!;
      const ib = this.mesh.index[t + 1]!;
      const ic = this.mesh.index[t + 2]!;
      const cand = closestOnTriangle(
        p,
        [pos[ia * 3]!, pos[ia * 3 + 1]!, pos[ia * 3 + 2]!],
        [pos[ib * 3]!, pos[ib * 3 + 1]!, pos[ib * 3 + 2]!],
        [pos[ic * 3]!, pos[ic * 3 + 1]!, pos[ic * 3 + 2]!],
      );
      const d2 = (cand[0] - x) ** 2 + (cand[1] - y) ** 2 + (cand[2] - z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        q = cand;
      }
    }
    const nx = this.mesh.outward[bestVertex * 3]!;
    const ny = this.mesh.outward[bestVertex * 3 + 1]!;
    const nz = this.mesh.outward[bestVertex * 3 + 2]!;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const n: Vec3 = [nx / nl, ny / nl, nz / nl];
    const side = (x - q[0]) * n[0] + (y - q[1]) * n[1] + (z - q[2]) * n[2];
    const unit = this.unitToMm > 0 ? this.unitToMm : 1;
    return { signedMm: (side < 0 ? -1 : 1) * Math.sqrt(bestD2) * unit, q, n };
  }
}

/**
 * 외면 정점이 내면에서 minMm보다 가까우면 내면에서 minMm 떨어진 곳으로 민다.
 * skip이 참인 정점(테두리)은 건드리지 않는다. 두 번 돌려 밀린 이웃이 만든 얇은 곳을 다시 본다.
 */
export function raiseOuterToThickness(
  positions: Float32Array,
  skip: Uint8Array | null,
  probe: IntaglioProbe,
  minMm: number,
  unitToMm: number,
): number {
  const unit = unitToMm > 0 ? unitToMm : 1;
  const min = minMm / unit;
  let moved = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < positions.length; i += 3) {
      if (skip?.[i / 3]) continue;
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      const hit = probe.closest(x, y, z);
      if (hit.signedMm >= minMm) continue;
      const away =
        hit.signedMm > 1e-6
          ? ([
              (x - hit.q[0]) / (hit.signedMm / unit),
              (y - hit.q[1]) / (hit.signedMm / unit),
              (z - hit.q[2]) / (hit.signedMm / unit),
            ] as Vec3)
          : hit.n;
      positions[i] = hit.q[0] + away[0] * min;
      positions[i + 1] = hit.q[1] + away[1] * min;
      positions[i + 2] = hit.q[2] + away[2] * min;
      moved += 1;
    }
  }
  return moved;
}
