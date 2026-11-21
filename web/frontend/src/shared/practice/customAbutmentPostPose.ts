// 포스트 협설 위치·수평 회전. 메시를 만들지 않고, 악궁 포물선과 대합 B 컨택만 계산한다.
// +u 는 협측(순측), +v 는 근심. 상악은 대합보다 약간 협측, 하악은 약간 설측.

const DEG = Math.PI / 180;
const TAN_20 = Math.tan(20 * DEG);

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export type ArchStation = { v: number; u: number; w: number };

type ToothStation = { v: number; u: number; w: number };

function meanStation(rows: readonly ArchStation[]): ToothStation | null {
  let sw = 0;
  let sv = 0;
  let su = 0;
  for (const q of rows) {
    sw += q.w;
    sv += q.w * q.v;
    su += q.w * q.u;
  }
  if (sw < 0.2) return null;
  return { v: sv / sw, u: su / sw, w: sw };
}

/** 한쪽(근심 또는 원심)의 스테이션을 치아 폭(~5.8mm) 단위 밴드 목록으로 나눈다. */
function splitSideTeeth(side: readonly ArchStation[]): ToothStation[] {
  const out: ToothStation[] = [];
  let remaining = side;
  while (remaining.length > 0 && out.length < 4) {
    const start = Math.abs(remaining[0]!.v);
    const band = remaining.filter((s) => {
      const av = Math.abs(s.v);
      return av >= start - 0.8 && av <= start + 3.4;
    });
    const mean = meanStation(band);
    if (mean) out.push(mean);
    remaining = remaining.filter((s) => Math.abs(s.v) > start + 3.4);
  }
  return out;
}

const ARCH_OUTLIER_MM = 1.25;
const NOMINAL_ARCH_C2 = -0.0012;

/**
 * 악궁 내 여러 치아 중심 중 위치가 크게 벗어난 부정교합 치아를 제외한다.
 * - 대합 악궁 힌트(refOffsetU, refSlope)가 있고 다수 치아가 힌트와 맞으면, 힌트에서 크게(> 2.0mm) 벗어난 치아를 먼저 제외한다.
 * - 양쪽 치아와 멀리 있는 치아까지 포함해 다수결 합의 악궁(완만한 포물선)을 찾는다.
 * - 한쪽에 2개 이상(정상 정렬), 반대쪽에 1개만 크게 벗어난 단독 부정교합 치아도 제외한다.
 */
function filterArchOutlierTeeth(
  teeth: readonly ToothStation[],
  opts?: { refSlope?: number | null; refOffsetU?: number | null },
): ToothStation[] {
  if (teeth.length < 3) return [...teeth];
  const refSlope = opts?.refSlope != null && Number.isFinite(opts.refSlope) ? opts.refSlope : null;
  const refOffsetU =
    opts?.refOffsetU != null && Number.isFinite(opts.refOffsetU) ? opts.refOffsetU : null;

  let pool: ToothStation[] = [...teeth];
  if (refOffsetU != null) {
    const s = refSlope ?? 0;
    const consistent = pool.filter(
      (t) => Math.abs(t.u - (refOffsetU + s * t.v + NOMINAL_ARCH_C2 * t.v * t.v)) <= 2.0,
    );
    if (consistent.length >= 2 && consistent.length < pool.length) {
      pool = consistent;
    }
  }
  if (pool.length < 3) return pool;

  const predict = (a: ToothStation, b: ToothStation, v: number): { u: number; slope: number } => {
    const dv = b.v - a.v;
    const rawSlope = (b.u - a.u) / dv;
    const slope = clamp(rawSlope, -TAN_20, TAN_20);
    // 완만한 악궁 곡률(c2 <= 0)을 보정한 예측선: a, b를 통과하면서 양 끝이 약간 설측으로 휘는 곡선
    const linearU = a.u + slope * (v - a.v);
    const curve = NOMINAL_ARCH_C2 * (v - a.v) * (v - b.v);
    return { u: linearU + curve, slope };
  };

  let bestInliers: ToothStation[] = [...pool];
  let bestScore = -Infinity;

  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const a = pool[i]!;
      const b = pool[j]!;
      const dv = Math.abs(b.v - a.v);
      if (dv < 3.8) continue;
      const rawSlope = (b.u - a.u) / (b.v - a.v);
      if (Math.abs(rawSlope) > TAN_20 * 1.15) continue;

      const inliers: ToothStation[] = [];
      let errSqSum = 0;
      for (const t of pool) {
        const pred = predict(a, b, t.v);
        const err = Math.abs(t.u - pred.u);
        if (err <= ARCH_OUTLIER_MM) {
          inliers.push(t);
          errSqSum += err * err;
        }
      }
      if (inliers.length < 2) continue;

      const slopeAt0 = clamp(rawSlope, -TAN_20, TAN_20);
      const uAt0 = predict(a, b, 0).u;
      // 점수: (1) inlier 개수 최우선, (2) 대합 악궁 힌트 일관성, (3) 과도한 기울기 패널티, (4) 잔차·근접성
      let score = inliers.length * 100;
      if (refSlope != null) {
        score -= Math.abs(slopeAt0 - refSlope) * 45;
      }
      if (refOffsetU != null) {
        score -= Math.min(4.0, Math.abs(uAt0 - refOffsetU)) * 12;
      }
      score -= Math.abs(slopeAt0) * 18;
      score -= (errSqSum / inliers.length) * 10;
      const meanAbsV = inliers.reduce((s, t) => s + Math.abs(t.v), 0) / inliers.length;
      score -= meanAbsV * 0.25;

      if (score > bestScore) {
        bestScore = score;
        bestInliers = inliers;
      }
    }
  }

  return bestInliers;
}

function parabolaSagitta(
  teeth: readonly ToothStation[],
  mesial: ToothStation,
  distal: ToothStation,
  chordU: number,
  slope: number,
  halfSpan: number,
): number {
  let num = 0;
  let den = 0;
  for (const t of teeth) {
    if (Math.abs(t.v - mesial.v) < 1.2 || Math.abs(t.v - distal.v) < 1.2) continue;
    const v2 = t.v * t.v;
    if (v2 < 20) continue;
    const residual = t.u - (chordU + slope * t.v);
    num += t.w * v2 * residual;
    den += t.w * v2 * v2;
  }
  if (den < 30) return clamp(0.0045 * halfSpan * halfSpan, 0, 0.45);
  const c2 = clamp(num / den, -0.02, 0.006);
  if (c2 >= 0) return 0;
  return clamp(-c2 * halfSpan * halfSpan, 0, 0.65);
}

/**
 * 인접 치아 협설 중심을 이은 포물선의 v=0 접선(slope)과 협설 위치(offsetU).
 * 임플란트 원점을 통과한다고 가정하지 않는다.
 * 악궁에서 크게 벗어난(부정교합) 치아는 단독 원심/근심 치아라도 제외한다.
 */
export function localArchTangent(
  stations: readonly ArchStation[],
  opts?: { refSlope?: number | null; refOffsetU?: number | null },
): { slope: number; offsetU: number; hasBothSides: boolean; toothCount: number; hasSlope: boolean } | null {
  const rows = stations.filter(
    (s) => s.w > 0 && Math.abs(s.v) >= 3.4 && Number.isFinite(s.u) && Number.isFinite(s.v),
  );
  if (rows.length === 0) return null;
  const mesialRows = rows.filter((t) => t.v > 0).sort((a, b) => a.v - b.v);
  const distalRows = rows.filter((t) => t.v < 0).sort((a, b) => b.v - a.v);
  const mesialTeeth = splitSideTeeth(mesialRows);
  const distalTeeth = splitSideTeeth(distalRows);
  const allTeeth = [...mesialTeeth, ...distalTeeth];
  if (allTeeth.length === 0) return null;

  const cleanTeeth = filterArchOutlierTeeth(allTeeth, opts);
  const cleanMesial = cleanTeeth.filter((t) => t.v > 0).sort((a, b) => a.v - b.v);
  const cleanDistal = cleanTeeth.filter((t) => t.v < 0).sort((a, b) => b.v - a.v);
  const nearM = cleanMesial[0] ?? null;
  const nearD = cleanDistal[0] ?? null;

  if (nearM && nearD) {
    const dv = nearM.v - nearD.v;
    if (Math.abs(dv) < 3.8) return null;
    const slope = clamp((nearM.u - nearD.u) / dv, -TAN_20, TAN_20);
    const chordU = nearD.u + ((nearM.u - nearD.u) * (0 - nearD.v)) / dv;
    const half = Math.min(Math.abs(nearM.v), Math.abs(nearD.v));
    const sagitta = parabolaSagitta(cleanTeeth, nearM, nearD, chordU, slope, half);
    return {
      slope,
      offsetU: clamp(chordU + sagitta, -3.4, 3.4),
      hasBothSides: true,
      toothCount: cleanTeeth.length,
      hasSlope: true,
    };
  }
  const sideTeeth = nearM ? cleanMesial : cleanDistal;
  const side = sideTeeth[0] ?? null;
  if (!side) return null;
  const next = sideTeeth[1] ?? null;
  if (!next || Math.abs(next.v - side.v) < 2.4) {
    return {
      slope: 0,
      offsetU: clamp(side.u, -3.4, 3.4),
      hasBothSides: false,
      toothCount: cleanTeeth.length,
      hasSlope: false,
    };
  }
  const slope = clamp((next.u - side.u) / (next.v - side.v), -TAN_20, TAN_20);
  // 편측 외삽 시 완만한 악궁 곡률(양 끝이 설측으로 휨)을 보정해 v=0 위치가 과도하게 직선 외삽되지 않게 한다.
  const extrapU = side.u + slope * (0 - side.v);
  return {
    slope,
    offsetU: clamp(extrapU, -3.4, 3.4),
    hasBothSides: false,
    toothCount: cleanTeeth.length,
    hasSlope: true,
  };
}

export type ArchCrownPoint = { v: number; u: number; h: number };

const TAN_22 = Math.tan(22 * DEG);

function meanVU(points: readonly ArchCrownPoint[]): { v: number; u: number } | null {
  if (points.length === 0) return null;
  let v = 0;
  let u = 0;
  for (const p of points) {
    v += p.v;
    u += p.u;
  }
  return { v: v / points.length, u: u / points.length };
}

type ToothCenter = { v: number; u: number };

/** 교두 높이만 남긴 협측·설측 무리. 낮은 구개 점막은 중심을 설측으로 끌지 않는다. */
function toothBlCenter(points: readonly ArchCrownPoint[]): ToothCenter | null {
  if (points.length < 16) return null;
  const hs = points.map((p) => p.h).sort((a, b) => a - b);
  const hCut = hs[Math.floor(hs.length * 0.58)]!;
  const tips = points.filter((p) => p.h >= hCut);
  if (tips.length < 8) return null;
  const us = tips.map((p) => p.u).sort((a, b) => a - b);
  const uMid = us[Math.floor(us.length * 0.5)]!;
  const highOf = (side: readonly ArchCrownPoint[]) => {
    if (side.length < 4) return null;
    const sh = side.map((p) => p.h).sort((a, b) => a - b);
    const cut = sh[Math.floor(sh.length * 0.4)]!;
    const top = side.filter((p) => p.h >= cut);
    return meanVU(top.length >= 3 ? top : side);
  };
  const buccal = highOf(tips.filter((p) => p.u >= uMid));
  const lingual = highOf(tips.filter((p) => p.u < uMid));
  if (!buccal || !lingual) return null;
  if (buccal.u - lingual.u < 1.5) return null;
  return {
    v: (buccal.v + lingual.v) * 0.5,
    u: (buccal.u + lingual.u) * 0.5,
  };
}

function windowPoints(
  points: readonly ArchCrownPoint[],
  sign: 1 | -1,
  lo: number,
  hi: number,
): ArchCrownPoint[] {
  const out: ArchCrownPoint[] = [];
  for (const p of points) {
    const av = p.v * sign;
    if (av >= lo && av < hi) out.push(p);
  }
  return out;
}

function sideTooth(
  points: readonly ArchCrownPoint[],
  sign: 1 | -1,
  archHint?: { slope: number | null; offsetU: number | null },
): ToothCenter | null {
  const near = toothBlCenter(windowPoints(points, sign, 4.0, 11.4));
  const far = toothBlCenter(windowPoints(points, sign, 11.4, 19.0));
  const refSlope = archHint?.slope ?? 0;
  const refOffsetU = archHint?.offsetU ?? null;
  const isOutlier = (t: ToothCenter | null): boolean => {
    if (!t || refOffsetU == null) return false;
    const pred = refOffsetU + refSlope * t.v + NOMINAL_ARCH_C2 * t.v * t.v;
    return Math.abs(t.u - pred) > 1.55;
  };
  const validNear = near && !isOutlier(near) ? near : null;
  const validFar = far && !isOutlier(far) ? far : null;
  if (validNear && validFar && Math.abs(validNear.u - validFar.u) > 1.7) {
    if (refOffsetU != null) {
      const errNear = Math.abs(validNear.u - (refOffsetU + refSlope * validNear.v));
      const errFar = Math.abs(validFar.u - (refOffsetU + refSlope * validFar.v));
      return errNear <= errFar ? validNear : validFar;
    }
    return validFar;
  }
  return validNear ?? validFar;
}

/**
 * 인접 치아의 마주 보는 인접면(접촉벽) 기울기를 잰다.
 * 벽이 v = a + k·u 로 기울면(dv/du = k), 포스트의 근원심 축(v)은 그에 수직이므로 slope = -k 다.
 */
export function proximalWallSlope(
  points: readonly ArchCrownPoint[],
  sign: 1 | -1,
  uCenter = 0,
): { slope: number; dist: number } | null {
  const wallPts: ArchCrownPoint[] = [];
  for (const p of points) {
    const av = p.v * sign;
    if (av < 2.6 || av > 8.6) continue;
    if (Math.abs(p.u - uCenter) > 2.6) continue;
    wallPts.push(p);
  }
  if (wallPts.length < 24) return null;
  const hs = wallPts.map((p) => p.h).sort((a, b) => a - b);
  const hLo = hs[Math.floor(hs.length * 0.35)]!;
  const hHi = hs[Math.floor(hs.length * 0.95)]!;
  if (hHi - hLo < 1.0) return null;

  const rawStrips: Array<{ u: number; front: number }> = [];
  for (let u = uCenter - 2.25; u <= uCenter + 2.26; u += 0.45) {
    const vs: number[] = [];
    for (const p of wallPts) {
      if (p.h < hLo || p.h > hHi) continue;
      if (Math.abs(p.u - u) > 0.32) continue;
      vs.push(p.v * sign);
    }
    if (vs.length < 4) continue;
    vs.sort((a, b) => a - b);
    rawStrips.push({ u, front: vs[Math.floor(vs.length * 0.1)]! });
  }
  if (rawStrips.length < 4) return null;

  // 협·설 모서리로 휘어 들어가는 부분은 빼고, 마주 보는 평탄한 접촉벽만 남긴다.
  let minFront = Infinity;
  for (const s of rawStrips) {
    if (s.front < minFront) minFront = s.front;
  }
  const strips = rawStrips.filter((s) => s.front <= minFront + 1.5);
  if (strips.length < 4) return null;
  if (strips[strips.length - 1]!.u - strips[0]!.u < 1.35) return null;

  let mu = 0;
  let mv = 0;
  for (const s of strips) {
    mu += s.u;
    mv += sign * s.front;
  }
  mu /= strips.length;
  mv /= strips.length;
  if (Math.abs(mv) > 7.4) return null;

  let suu = 0;
  let suv = 0;
  for (const s of strips) {
    const du = s.u - mu;
    const dv = sign * s.front - mv;
    suu += du * du;
    suv += du * dv;
  }
  if (suu < 0.35) return null;
  const rawSlope = suv / suu;
  if (Math.abs(rawSlope) > Math.tan(24 * DEG)) return null;

  let errSq = 0;
  for (const s of strips) {
    const pred = mv + rawSlope * (s.u - mu);
    errSq += (sign * s.front - pred) ** 2;
  }
  if (Math.sqrt(errSq / strips.length) > 0.38) return null;

  return {
    slope: clamp(-rawSlope, -TAN_22, TAN_22),
    dist: Math.abs(mv),
  };
}

/**
 * 인접 치아 교두의 협설 중심(offsetU)과 회전(slope).
 * 회전은 악궁 접선과 인접 치아의 마주 보는 인접면 기울기를 함께 맞춘다.
 * 악궁에서 크게 어긋난(부정교합·회전된) 인접치·인접면은 빼고 나머지를 쓴다.
 */
export function neighborCrownBlPose(
  points: readonly ArchCrownPoint[],
  archSlopeHint?: number | null,
  archOffsetUHint?: number | null,
): { slope: number; offsetU: number; hasBothSides: boolean; wallSlope: number | null } | null {
  let archSlope: number | null =
    archSlopeHint != null && Number.isFinite(archSlopeHint)
      ? clamp(archSlopeHint, -TAN_20, TAN_20)
      : null;
  const archOffsetRef =
    archOffsetUHint != null && Number.isFinite(archOffsetUHint) ? archOffsetUHint : null;

  let mesial = sideTooth(points, 1, { slope: archSlope, offsetU: archOffsetRef });
  let distal = sideTooth(points, -1, { slope: archSlope, offsetU: archOffsetRef });

  const wallM = proximalWallSlope(points, 1, mesial?.u ?? archOffsetRef ?? 0);
  const wallD = proximalWallSlope(points, -1, distal?.u ?? archOffsetRef ?? 0);

  // 각도가 크게 돌아간(악궁과 15° 초과 어긋난) 부정교합 인접치는 회전뿐 아니라 위치 추정에서도 제외한다(정상 인접치가 있을 때).
  const isBadAngle = (w: { slope: number; dist: number } | null): boolean =>
    Boolean(w && archSlope != null && Math.abs(w.slope - archSlope) > Math.tan(15 * DEG));
  const mesialBadAngle = isBadAngle(wallM);
  const distalBadAngle = isBadAngle(wallD);
  if (mesialBadAngle && (distal || archOffsetRef != null)) mesial = null;
  if (distalBadAngle && (mesial || archOffsetRef != null)) distal = null;

  const hasBothSides = Boolean(mesial && distal);

  let offsetU: number | null = null;
  if (mesial && distal) {
    const dv = mesial.v - distal.v;
    if (Math.abs(dv) >= 3.8) {
      const chordSlope = clamp((mesial.u - distal.u) / dv, -TAN_20, TAN_20);
      archSlope = archSlope != null ? archSlope * 0.45 + chordSlope * 0.55 : chordSlope;
      offsetU = clamp(distal.u + ((mesial.u - distal.u) * (0 - distal.v)) / dv, -3.4, 3.4);
    }
  } else if (mesial || distal) {
    const only = (mesial ?? distal)!;
    const s = archSlope ?? 0;
    offsetU = clamp(only.u - s * only.v, -3.4, 3.4);
  }

  const walls: { slope: number; w: number }[] = [];
  for (const w of [wallM, wallD]) {
    if (!w) continue;
    // 악궁과 15° 넘게 어긋난 인접면은 돌아간 치아로 보고 제외한다.
    if (archSlope != null && Math.abs(w.slope - archSlope) > Math.tan(15 * DEG)) continue;
    walls.push({ slope: w.slope, w: 1 / Math.max(3.0, w.dist) });
  }

  let wallSlope: number | null = null;
  if (walls.length > 0) {
    let sw = 0;
    let ss = 0;
    for (const q of walls) {
      sw += q.w;
      ss += q.w * q.slope;
    }
    wallSlope = ss / sw;
  }

  if (offsetU == null && wallSlope == null && archSlope == null) return null;

  // 큰 틀 → 세부: 악궁 아치 회전(archSlope)이 주축, 인접 자연치 접촉벽(wallSlope)은 세부 보정.
  let slope = 0;
  if (archSlope != null && wallSlope != null) {
    slope = clamp(archSlope * 0.65 + wallSlope * 0.35, -TAN_20, TAN_20);
  } else if (archSlope != null) {
    slope = clamp(archSlope, -TAN_20, TAN_20);
  } else if (wallSlope != null) {
    slope = clamp(wallSlope, -TAN_20, TAN_20);
  }

  return { slope, offsetU: offsetU ?? archOffsetRef ?? 0, hasBothSides, wallSlope };
}

export type ArchSlopeSignal = {
  slope: number;
  hasBothSides: boolean;
  toothCount: number;
  hasSlope?: boolean;
};

/**
 * 단독·복수 공통 구치 수평 회전(yaw) 기울기 결합.
 * 우선순위: (2순위) 악궁 아치 회전(같은 악 + 대합 악궁 + 공동 피팅) → (3순위) 인접 자연치 접촉벽 · 인접 어벗 연결선.
 * 같은 악이 편측·말단(예: #17)이어도 대합 악궁과 인접 어벗 신호를 모두 참고해 안정적으로 아치를 따른다.
 */
export function blendArchAndAdjacentYawSlope(args: {
  jawArch?: ArchSlopeSignal | null;
  oppArch?: ArchSlopeSignal | null;
  jointArchSlope?: number | null;
  adjacentWallSlope?: number | null;
  adjacentAbutmentLineSlope?: number | null;
}): { slope: number; confidence: number; archSlope: number | null } | null {
  const usable = (s?: ArchSlopeSignal | null): s is ArchSlopeSignal =>
    Boolean(s && s.hasSlope !== false && Number.isFinite(s.slope));

  const jaw = usable(args.jawArch) ? args.jawArch : null;
  const opp = usable(args.oppArch) ? args.oppArch : null;
  const joint =
    args.jointArchSlope != null && Number.isFinite(args.jointArchSlope)
      ? clamp(args.jointArchSlope, -TAN_20, TAN_20)
      : null;

  let archNum = 0;
  let archDen = 0;
  if (jaw) {
    const wJaw = jaw.hasBothSides ? 1.25 : jaw.toothCount >= 2 ? 0.72 : 0.35;
    archNum += clamp(jaw.slope, -TAN_20, TAN_20) * wJaw;
    archDen += wJaw;
  }
  if (opp) {
    const oppSlope = clamp(opp.slope, -TAN_20, TAN_20);
    // 같은 악과 대합 악궁이 정상 교합(≤15°)이면 대합 아치로 연속성을 보강한다.
    const agreed = !jaw || Math.abs(oppSlope - jaw.slope) <= Math.tan(15 * DEG);
    if (agreed) {
      const wOpp = opp.hasBothSides ? 1.05 : opp.toothCount >= 2 ? 0.68 : 0.3;
      archNum += oppSlope * wOpp;
      archDen += wOpp;
    }
  }
  if (joint != null) {
    const baseEst = archDen > 0 ? archNum / archDen : null;
    if (baseEst == null || Math.abs(joint - baseEst) <= Math.tan(15 * DEG)) {
      const wJoint = archDen >= 1.5 ? 0.35 : 0.65;
      archNum += joint * wJoint;
      archDen += wJoint;
    }
  }

  const archSlope = archDen > 0 ? clamp(archNum / archDen, -TAN_20, TAN_20) : null;

  // 3순위: 인접 자연치 접촉벽 + 인접 어벗 연결선(아치와 크게 어긋난 부정교합/경사는 배제)
  const adjTerms: Array<{ slope: number; w: number }> = [];
  const pushAdj = (raw: number | null | undefined, baseW: number) => {
    if (raw == null || !Number.isFinite(raw)) return;
    const s = clamp(raw, -TAN_20, TAN_20);
    if (archSlope != null) {
      const diff = Math.abs(s - archSlope);
      const maxDiff = Math.tan(14 * DEG);
      if (diff >= maxDiff) return;
      const keep = 1 - (diff / maxDiff) ** 2;
      adjTerms.push({ slope: s, w: baseW * keep });
    } else {
      adjTerms.push({ slope: s, w: baseW });
    }
  };
  pushAdj(args.adjacentWallSlope, 0.52);
  pushAdj(args.adjacentAbutmentLineSlope, 0.58);

  let adjNum = 0;
  let adjDen = 0;
  for (const t of adjTerms) {
    adjNum += t.slope * t.w;
    adjDen += t.w;
  }
  const adjSlope = adjDen > 0 ? adjNum / adjDen : null;

  if (archSlope == null && adjSlope == null) return null;

  let slope: number;
  if (archSlope != null && adjSlope != null) {
    // 악궁 아치(큰 틀) 68% + 인접 자연치·어벗(세부) 32%
    const adjShare = clamp(0.32 * Math.min(1, adjDen / 0.55), 0.14, 0.34);
    slope = clamp(archSlope * (1 - adjShare) + adjSlope * adjShare, -TAN_20, TAN_20);
  } else {
    slope = clamp((archSlope ?? adjSlope)!, -TAN_20, TAN_20);
  }

  const confidence = clamp(
    (jaw?.hasBothSides ? 0.45 : jaw ? 0.22 : 0) +
      (opp?.hasBothSides ? 0.35 : opp ? 0.18 : 0) +
      (adjDen > 0 ? Math.min(0.2, adjDen * 0.2) : 0),
    0.15,
    1.0,
  );

  return { slope, confidence, archSlope };
}

export type PeerYawEntry = {
  toothNumber: string;
  /** 공통 교합평면 위에서의 근심 방향각(rad). */
  angleRad: number;
  /** 개별 회전 추정의 신뢰도(0.1~1.0). */
  confidence: number;
  /** 사분악 내 FDI 위치 번호(1~8). */
  fdiPos: number;
  /** 전치 여부. */
  anterior: boolean;
  /** 사용자가 postYawDeg를 명시적으로 지정한 경우 true(자동 조율에서 보호). */
  locked?: boolean;
};

function wrapAngleRad(a: number): number {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

/**
 * 같은 사분악 인접 어벗끼리 수평 회전각(yaw)이 크게 어긋나지 않게 부드럽게 조율한다.
 * - 구치 인접 어벗(#16-#17 등)은 자연 악궁 곡률(약 3~5°) 안에서 비슷하게 맞춘다.
 * - 신뢰도가 높은 치아 쪽으로 약한 치아(편측/말단)가 더 많이 따라간다.
 * - 수동 회전(locked=true)은 덮어쓰지 않는다.
 */
export function harmonizeAdjacentAbutmentYaws(
  entries: readonly PeerYawEntry[],
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const e of entries) deltas.set(e.toothNumber, 0);
  if (entries.length < 2) return deltas;

  const sorted = [...entries].sort((a, b) => a.fdiPos - b.fdiPos);
  const cur = sorted.map((e) => e.angleRad);
  const conf = sorted.map((e) => clamp(e.confidence, 0.15, 1.0));
  const locked = sorted.map((e) => Boolean(e.locked));

  // 인접 쌍(FDI 1~2칸 이내)만 반복 완화한다.
  for (let pass = 0; pass < 6; pass += 1) {
    const next = [...cur];
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      const step = Math.abs(b.fdiPos - a.fdiPos);
      if (step < 1 || step > 2) continue;
      // 대구치끼리(6-7, 7-8)는 악궁 곡률이 매우 완만해 4° 이내, 소구치-대구치는 6°, 전치는 12°까지 자연 곡률 허용.
      const naturalAllowanceDeg =
        a.anterior || b.anterior
          ? 12 * step
          : a.fdiPos >= 6 && b.fdiPos >= 6
            ? 3.5 * step
            : 5.0 * step;
      const maxGapRad = naturalAllowanceDeg * DEG;
      const diff = wrapAngleRad(cur[i + 1]! - cur[i]!);
      const absDiff = Math.abs(diff);
      // 자연 곡률을 넘는 차이는 강하게(85%) 줄인다. 곡률 이내 차이는 첫 회에만 살짝 맞춰 자연 곡률을 접지 않는다.
      const excess = Math.max(0, absDiff - maxGapRad);
      const softPull =
        pass === 0
          ? Math.min(absDiff, maxGapRad) * (Math.min(conf[i]!, conf[i + 1]!) < 0.55 ? 0.35 : 0.18)
          : 0;
      const totalFix = excess * 0.85 + softPull;
      if (totalFix <= 1e-4) continue;
      const fixSigned = Math.sign(diff) * totalFix;

      if (locked[i] && locked[i + 1]) continue;
      if (locked[i]) {
        next[i + 1] = wrapAngleRad(next[i + 1]! - fixSigned);
      } else if (locked[i + 1]) {
        next[i] = wrapAngleRad(next[i]! + fixSigned);
      } else {
        // 신뢰도가 낮은 쪽이 더 많이 양보한다.
        const invA = 1 / conf[i]!;
        const invB = 1 / conf[i + 1]!;
        const shareA = invA / (invA + invB);
        const shareB = 1 - shareA;
        next[i] = wrapAngleRad(next[i]! + fixSigned * shareA);
        next[i + 1] = wrapAngleRad(next[i + 1]! - fixSigned * shareB);
      }
    }
    for (let i = 0; i < sorted.length; i += 1) cur[i] = next[i]!;
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const e = sorted[i]!;
    if (e.locked) continue;
    deltas.set(e.toothNumber, clamp(wrapAngleRad(cur[i]! - e.angleRad), -16 * DEG, 16 * DEG));
  }
  return deltas;
}

/**
 * 대합 구치 교합면의 협측·설측 교두정(bucU, linU)과 외곽(uLo, uHi)에서
 * 본 어벗 치아의 중심이 놓여야 할 교두 경사면 u 좌표를 계산한다.
 * - 상악 어벗(예: #26): 하악 대합치(#36)의 협측 교두(bucU) 설측 경사면(중심구와 협측 교두정 사이).
 * - 하악 어벗(예: #36): 상악 대합치(#26)의 설측 교두(linU) 설측 경사면(설측 교두정보다 약간 설측).
 */
export function opposingSlopeTargetU(args: {
  jaw: "upper" | "lower";
  uLo: number;
  uHi: number;
  bucU: number;
  linU: number;
}): { u: number; fossaU: number } {
  const { jaw, uLo, uHi } = args;
  const width = Math.max(1.0, uHi - uLo);
  const mid = 0.5 * (uLo + uHi);
  const bucU = clamp(args.bucU, mid + width * 0.12, uHi - width * 0.12);
  const linU = clamp(args.linU, uLo + width * 0.12, mid - width * 0.12);
  const third = width / 3;
  const fossaU = clamp(0.5 * (bucU + linU), uLo + third, uHi - third);

  if (jaw === "upper") {
    // 하악 협측 교두(bucU)의 설측 경사면: 중심구(fossaU)와 협측 교두정(bucU) 사이
    const raw = fossaU + (bucU - fossaU) * 0.55;
    const u = clamp(raw, fossaU + 0.55, Math.min(bucU - 0.1, uHi - width * 0.16));
    return { u, fossaU };
  }
  // 하악 어벗: 상악 설측 교두(linU)의 설측 경사면(linU에서 설측 외곽 uLo 쪽으로 약간)
  const slopeStep = clamp((linU - uLo) * 0.25, 0.15, 0.5);
  const raw = linU - slopeStep;
  const u = clamp(raw, Math.max(uLo + 0.2, fossaU - 2.5), linU - 0.1);
  return { u, fossaU };
}

/**
 * 악궁 연장선 근처에서 상악은 협측, 하악은 설측으로 둔다.
 * 대합 B가 그 악궁에서 많이 벗어나면 그 대합치는 쓰지 않는다.
 * contactIsFunctionalTarget=true이면 contactU가 이미 교두 경사면 목표 위치
 * (상악: 하악 협측 교두 설측 경사면, 하악: 상악 설측 교두 설측 경사면)를 의미한다.
 */
export function pickCompactFunctionalU(args: {
  jaw: "upper" | "lower";
  archU: number | null;
  contactU: number | null;
  /** 넘기면 상악 협측·하악 설측 최소 이동을 이 값까지 보장한다(contactIsFunctionalTarget=false일 때). */
  biasMm?: number;
  /** true이면 contactU 자체가 이미 교두 경사면 기준 목표 u 좌표다. */
  contactIsFunctionalTarget?: boolean;
}): number | null {
  const sign = args.jaw === "upper" ? 1 : -1;
  const slight = args.biasMm ?? 0.4;
  const { archU, contactU } = args;
  if (archU == null && contactU == null) return null;

  if (args.contactIsFunctionalTarget) {
    let target: number;
    if (archU != null && contactU != null && Math.abs(contactU - archU) <= 2.8) {
      // 1순위 대합치 중심(contactU) + 악궁 곡선(archU): 대합치 중심을 우선한다.
      const functionalSide = sign * (contactU - archU) >= 0;
      const wContact = functionalSide ? 0.72 : 0.58;
      target = archU * (1 - wContact) + contactU * wContact;
    } else if (archU != null) {
      target = archU;
    } else {
      target = contactU!;
    }
    const prefer = 2.2;
    if (Math.abs(target) <= prefer) return target;
    const pulled = Math.sign(target) * prefer;
    const stillNear = Math.abs(target - pulled) <= 0.5;
    const stillFunctional = archU == null || sign * (pulled - archU) >= -0.15;
    if (stillNear && stillFunctional) return pulled;
    return target;
  }

  let target: number;
  if (archU != null && contactU != null && Math.abs(contactU - archU) <= 2.6) {
    const archTarget = archU + sign * slight;
    if (args.jaw === "upper") {
      if (contactU > archU) {
        // 상악: 대합 하악 B 컨택보다 설측으로 들어가지 않고 약간 협측에 놓이도록 대합 쪽으로 충분히 이동한다.
        const oppFollow = archU * 0.1 + (contactU + 0.25) * 0.9;
        target = Math.max(archTarget, oppFollow);
      } else {
        // 대합이 더 설측이면 상악이 설측으로 끌려가지 않고 같은 악 악궁 기준을 유지한다.
        target = archTarget;
      }
    } else {
      // 하악: 같은 악 악궁과 대합 상악 B 컨택(보다 약간 설측)을 균형 있게 맞춘다.
      const oppTarget = contactU - Math.min(0.3, slight);
      target = archTarget * 0.6 + oppTarget * 0.4;
    }
  } else if (archU != null) {
    target = archU + sign * slight;
  } else {
    target = contactU! + sign * Math.max(slight, 0.5);
  }

  const prefer = 1.65;
  if (Math.abs(target) <= prefer) return target;
  const pulled = Math.sign(target) * prefer;
  const stillNear = Math.abs(target - pulled) <= 0.6;
  const stillFunctional = archU == null || sign * (pulled - archU) >= -0.15;
  if (stillNear && stillFunctional) return pulled;
  return target;
}

/**
 * 스크류 홀 주변 포스트 벽.
 * 최소는 자동 배치에서 양보하지 않는다. 적절 두께는 악궁 정렬과 서로 양보한다.
 * 전치 절단측(포스트 길이의 위 1/2)은 개방을 허용하므로 여기 하한을 두지 않는다.
 */
export const POSTERIOR_POST_WALL_MIN_MM = 0.5;
export const POSTERIOR_POST_WALL_IDEAL_MM = 1;
export const ANTERIOR_MARGIN_POST_WALL_MIN_MM = 0.3;
export const ANTERIOR_MARGIN_POST_WALL_IDEAL_MM = 0.5;
/** 적절 두께와 악궁이 겹치는 구간을 나누는 비율. 0.5면 남는 여유를 반씩 가진다. */
export const ARCH_WALL_YIELD = 0.5;

/**
 * 스크류 홀 설측 벽의 적절 두께.
 * 이 값보다 얇아도 최소(0.5mm)까지는 악궁을 향해 양보할 수 있다.
 */
export const LINGUAL_SCREW_WALL_LIMIT_MM = POSTERIOR_POST_WALL_IDEAL_MM;

/**
 * 악궁이 원하는 이동이 적절 벽 한도 안이면 그대로 둔다.
 * 한도를 넘으면 최소 벽 한도까지 중 겹치는 구간만 yieldRatio만큼 악궁 쪽으로 간다.
 */
export function compromiseArchAgainstWall(args: {
  archMm: number;
  idealLimitMm: number;
  minLimitMm: number;
  yieldRatio?: number;
}): number {
  const y = clamp(args.yieldRatio ?? ARCH_WALL_YIELD, 0, 1);
  const ideal = args.idealLimitMm;
  const minLim = Math.max(ideal, args.minLimitMm);
  if (!(args.archMm > ideal)) return args.archMm;
  const capped = Math.min(args.archMm, minLim);
  return ideal + (capped - ideal) * y;
}

/**
 * 이미 악궁에 놓인 축을, 벽 두께를 맞추려고 얼마나 옮길지.
 * 최소 두께에 모자란 거리는 전부 옮기고, 적절 두께까지 남은 거리만 양보한다.
 */
export function compromiseWallShiftFromArch(args: {
  mustShiftMm: number;
  idealShiftMm: number;
  yieldRatio?: number;
}): number {
  const y = clamp(args.yieldRatio ?? ARCH_WALL_YIELD, 0, 1);
  const must = Math.max(0, args.mustShiftMm);
  const ideal = Math.max(must, args.idealShiftMm);
  if (ideal <= 0) return 0;
  return must + (ideal - must) * y;
}

/** 여러 벽의 적절·최소 한도 중 가장 빡센 값으로 악궁 이동을 고른다. */
export function resolveAutoPlacementTradeoff(args: {
  archOffsetMm: number;
  idealLimitsMm: readonly number[];
  minLimitsMm: readonly number[];
  yieldRatio?: number;
}): number {
  let ideal = Infinity;
  let minLim = Infinity;
  for (const v of args.idealLimitsMm) if (Number.isFinite(v)) ideal = Math.min(ideal, v);
  for (const v of args.minLimitsMm) if (Number.isFinite(v)) minLim = Math.min(minLim, v);
  if (!Number.isFinite(ideal) || !Number.isFinite(minLim)) return args.archOffsetMm;
  return compromiseArchAgainstWall({
    archMm: args.archOffsetMm,
    idealLimitMm: ideal,
    minLimitMm: minLim,
    yieldRatio: args.yieldRatio,
  });
}

/**
 * 스크류가 빠지는 교합면 쪽 설측 반폭.
 * 치종 상단과, 마진에서 3° 테이퍼로 좁힌 값의 중간이다.
 * 상단 템플릿만 쓰면 악궁을 거의 못 따르고, 마진 전체는 상단보다 넓어 벽을 두껍게 본다.
 */
export function lingualHalfAtScrewExitMm(args: {
  topLingualHalfMm: number;
  marginHalfBlMm: number;
  postHeightMm: number;
}): number {
  const taperDrop = Math.tan((3 * Math.PI) / 180) * Math.max(2.2, args.postHeightMm) * 0.9;
  const fromMargin = Math.max(args.topLingualHalfMm, args.marginHalfBlMm - taperDrop);
  const upper = Math.min(args.marginHalfBlMm, fromMargin);
  return Math.max(0.8, args.topLingualHalfMm + (upper - args.topLingualHalfMm) * 0.5);
}

/** 설측 벽이 minWall 이상 남도록 허용하는 협측 이동. 반폭이 부족하면 0. */
export function maxBuccalOffsetForLingualScrewWall(args: {
  lingualHalfMm: number;
  screwRadiusMm: number;
  minLingualWallMm?: number;
}): number {
  const minWall = args.minLingualWallMm ?? LINGUAL_SCREW_WALL_LIMIT_MM;
  return Math.max(0, args.lingualHalfMm - args.screwRadiusMm - minWall);
}

/**
 * 악궁·대합이 가리키는 협측 위치까지 가면 임플란트 축 스크류가 설측 벽에 붙는다.
 * 그 벽을 남기는 협측 이동까지만 허용한다. 설측 이동은 벽을 두껍게 하므로 그대로 둔다.
 */
export function clampBuccalOffsetForLingualScrewWall(args: {
  buccalOffsetMm: number;
  lingualHalfMm: number;
  screwRadiusMm: number;
  minLingualWallMm?: number;
}): number {
  const offset = args.buccalOffsetMm;
  if (!(offset > 0) || !Number.isFinite(offset)) return offset;
  return Math.min(offset, maxBuccalOffsetForLingualScrewWall(args));
}

/** 수평 이동이 목표 근처면 짧은 쪽으로 줄여 최대 직경 10mm를 넘기지 않게 한다. 멀면 그대로 둔다. */
export function clampLateralForCompactDiameter(
  u: number,
  v: number,
  preferMm = 1.15,
  slackMm = 0.55,
): { u: number; v: number } {
  const lat = Math.hypot(u, v);
  if (!(lat > preferMm)) return { u, v };
  if (lat - preferMm > slackMm) return { u, v };
  const k = preferMm / lat;
  return { u: u * k, v: v * k };
}

/**
 * 양방향(협측 + / 설측 -, 근심 + / 원심 -) 대합·악궁 중심 이동과 포스트·크라운 벽 타협.
 * 최소 벽은 절대 위반하지 않고, 적절 벽 구간만 서로 양보한다.
 */
export function resolveSignedPlacementTradeoff(args: {
  targetOffsetMm: number;
  posIdealLimitsMm: readonly number[];
  posMinLimitsMm: readonly number[];
  negIdealLimitsMm: readonly number[];
  negMinLimitsMm: readonly number[];
  yieldRatio?: number;
}): number {
  const raw = args.targetOffsetMm;
  if (!Number.isFinite(raw) || Math.abs(raw) <= 1e-6) return 0;
  if (raw > 0) {
    return resolveAutoPlacementTradeoff({
      archOffsetMm: raw,
      idealLimitsMm: args.posIdealLimitsMm,
      minLimitsMm: args.posMinLimitsMm,
      yieldRatio: args.yieldRatio,
    });
  }
  return -resolveAutoPlacementTradeoff({
    archOffsetMm: -raw,
    idealLimitsMm: args.negIdealLimitsMm,
    minLimitsMm: args.negMinLimitsMm,
    yieldRatio: args.yieldRatio,
  });
}

/**
 * 단독·복수 공통 로컬 치관 크기 스케일.
 * 치종 표준(1.0)을 앵커로 두고 인접 자연치 폭 비율과 대합치 폭 비율을 모두 참고해
 * 환자 고유 치아 크기 스케일(0.85~1.15)을 산출한다.
 */
export function blendLocalCrownSizeScale(args: {
  adjacentNaturalRatios?: readonly number[];
  opposingRatio?: number | null;
}): number {
  let num = 1.0 * 0.55;
  let den = 0.55;
  const adjValid = (args.adjacentNaturalRatios ?? []).filter(
    (r) => Number.isFinite(r) && r >= 0.72 && r <= 1.32,
  );
  if (adjValid.length > 0) {
    const meanAdj = adjValid.reduce((s, v) => s + v, 0) / adjValid.length;
    const wAdj = adjValid.length >= 2 ? 0.6 : 0.42;
    num += clamp(meanAdj, 0.84, 1.16) * wAdj;
    den += wAdj;
  }
  if (
    args.opposingRatio != null &&
    Number.isFinite(args.opposingRatio) &&
    args.opposingRatio >= 0.72 &&
    args.opposingRatio <= 1.32
  ) {
    const wOpp = 0.42;
    num += clamp(args.opposingRatio, 0.84, 1.16) * wOpp;
    den += wOpp;
  }
  return clamp(num / den, 0.85, 1.15);
}

export type PeerSizeEntry = {
  toothNumber: string;
  /** 같은 부위(예: "molar", "premolar")끼리만 크기를 맞춘다. */
  kind: string;
  /** 사분악 내 FDI 위치(1~8). */
  fdiPos: number;
  /** 현재 개별 산출된 정규화 크기 배율(실제 평균 마진 반폭 / 표준 마진 반폭). */
  normScale: number;
  /** 물리 제약(스크류 벽 최소·커프 최소)에 의한 하한 배율. */
  minNormScale: number;
  /** 물리 제약(인접 경계 marginCap·크라운 최소 벽)에 의한 상한 배율. */
  maxNormScale: number;
  /** 사용자가 marginSizeScale / postWidthScale을 직접 지정한 경우 true(보호). */
  locked?: boolean;
};

/**
 * 같은 사분악·같은 부위(대구치끼리 등) 인접 어벗의 크기가 확 갈리지 않게 목표 배율을 조율한다.
 * - 물리 상·하한([minNormScale, maxNormScale])은 절대 위반하지 않는다.
 * - 수동 편집(locked=true) 치아는 건드리지 않고, 이웃이 그 크기를 참고한다.
 */
export function harmonizeAdjacentSameKindSizes(
  entries: readonly PeerSizeEntry[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.toothNumber, e.normScale);
  if (entries.length < 2) return out;

  // 같은 kind(예: molar끼리)로 묶어서 인접(FDI 1~2칸) 그룹을 만든다.
  const byKind = new Map<string, PeerSizeEntry[]>();
  for (const e of entries) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }

  for (const group of byKind.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.fdiPos - b.fdiPos);
    const cur = sorted.map((e) => e.normScale);

    // 같은 부위 인접 어벗 간 정규화 크기 차이를 3% 이내(예: 대구치 Ø6.8 vs Ø6.6 수준)로 부드럽게 수렴시킨다.
    const maxRelGap = 0.03;
    for (let pass = 0; pass < 6; pass += 1) {
      const next = [...cur];
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const a = sorted[i]!;
        const b = sorted[i + 1]!;
        if (Math.abs(b.fdiPos - a.fdiPos) > 2) continue;
        const diff = cur[i + 1]! - cur[i]!;
        const absDiff = Math.abs(diff);
        if (absDiff <= maxRelGap) continue;
        const excess = absDiff - maxRelGap;
        const fix = Math.sign(diff) * excess * 0.8;

        if (a.locked && b.locked) continue;
        if (a.locked) {
          next[i + 1] = clamp(next[i + 1]! - fix, b.minNormScale, b.maxNormScale);
        } else if (b.locked) {
          next[i] = clamp(next[i]! + fix, a.minNormScale, a.maxNormScale);
        } else {
          // 각 치아가 목표로 움직일 수 있는 여유(물리 한도까지)에 비례해 양보한다.
          const roomA = fix > 0 ? Math.max(0, a.maxNormScale - cur[i]!) : Math.max(0, cur[i]! - a.minNormScale);
          const roomB = fix > 0 ? Math.max(0, cur[i + 1]! - b.minNormScale) : Math.max(0, b.maxNormScale - cur[i + 1]!);
          const totalRoom = roomA + roomB;
          if (totalRoom <= 1e-4) continue;
          const shareA = roomA / totalRoom;
          const shareB = roomB / totalRoom;
          next[i] = clamp(next[i]! + fix * shareA, a.minNormScale, a.maxNormScale);
          next[i + 1] = clamp(next[i + 1]! - fix * shareB, b.minNormScale, b.maxNormScale);
        }
      }
      for (let i = 0; i < sorted.length; i += 1) cur[i] = next[i]!;
    }

    for (let i = 0; i < sorted.length; i += 1) {
      const e = sorted[i]!;
      if (e.locked) continue;
      out.set(e.toothNumber, clamp(cur[i]!, e.minNormScale, e.maxNormScale));
    }
  }
  return out;
}
