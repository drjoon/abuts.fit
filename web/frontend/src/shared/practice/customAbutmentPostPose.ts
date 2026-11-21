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

/** 2mm 간격으로 이어진 악궁에서도 가장 가까운 치아 하나만 집는다. */
function nearestToothBand(side: readonly ArchStation[]): { mean: ToothStation; next: ToothStation | null } | null {
  if (side.length === 0) return null;
  const start = Math.abs(side[0]!.v);
  const band = side.filter((s) => {
    const av = Math.abs(s.v);
    return av >= start - 0.8 && av <= start + 3.4;
  });
  const mean = meanStation(band);
  if (!mean) return null;
  const next = meanStation(
    side.filter((s) => {
      const av = Math.abs(s.v);
      return av > start + 3.4 && av <= start + 9.2;
    }),
  );
  return { mean, next };
}

function dropNearestTooth(side: readonly ArchStation[]): ArchStation[] {
  if (side.length === 0) return [];
  const start = Math.abs(side[0]!.v);
  return side.filter((s) => Math.abs(s.v) > start + 3.4);
}

/** 반대편과 그다음 치아를 이은 선에서 1.55mm 넘게 벗어나면 그 치아는 부정교합으로 본다. */
function offArchLine(tooth: ToothStation, anchor: ToothStation, far: ToothStation): boolean {
  const dv = far.v - anchor.v;
  if (Math.abs(dv) < 2.4) return false;
  const pred = anchor.u + ((far.u - anchor.u) * (tooth.v - anchor.v)) / dv;
  return Math.abs(tooth.u - pred) > 1.55;
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
 */
export function localArchTangent(
  stations: readonly ArchStation[],
): { slope: number; offsetU: number } | null {
  const rows = stations.filter(
    (s) => s.w > 0 && Math.abs(s.v) >= 3.4 && Number.isFinite(s.u) && Number.isFinite(s.v),
  );
  if (rows.length === 0) return null;
  let mesial = rows.filter((t) => t.v > 0).sort((a, b) => a.v - b.v);
  let distal = rows.filter((t) => t.v < 0).sort((a, b) => b.v - a.v);
  let bandM = nearestToothBand(mesial);
  let bandD = nearestToothBand(distal);
  if (bandM && bandD?.next && offArchLine(bandD.mean, bandM.mean, bandD.next)) {
    distal = dropNearestTooth(distal);
    bandD = nearestToothBand(distal);
  }
  if (bandD && bandM?.next && offArchLine(bandM.mean, bandD.mean, bandM.next)) {
    mesial = dropNearestTooth(mesial);
    bandM = nearestToothBand(mesial);
  }
  const nearM = bandM?.mean ?? null;
  const nearD = bandD?.mean ?? null;
  const teeth = rows;
  if (nearM && nearD) {
    const dv = nearM.v - nearD.v;
    if (Math.abs(dv) < 3.8) return null;
    const slope = clamp((nearM.u - nearD.u) / dv, -TAN_20, TAN_20);
    const chordU = nearD.u + ((nearM.u - nearD.u) * (0 - nearD.v)) / dv;
    const half = Math.min(Math.abs(nearM.v), Math.abs(nearD.v));
    const sagitta = parabolaSagitta(teeth, nearM, nearD, chordU, slope, half);
    return { slope, offsetU: clamp(chordU + sagitta, -3.4, 3.4) };
  }
  const sideRows = nearM ? mesial : distal;
  const sideBand = nearestToothBand(sideRows);
  const side = sideBand?.mean ?? null;
  if (!side) return null;
  const next = sideBand?.next ?? null;
  if (!next || Math.abs(next.v - side.v) < 2.4) return { slope: 0, offsetU: clamp(side.u, -3.4, 3.4) };
  const slope = clamp((next.u - side.u) / (next.v - side.v), -TAN_20, TAN_20);
  return { slope, offsetU: clamp(side.u + slope * (0 - side.v), -3.4, 3.4) };
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

function sideTooth(points: readonly ArchCrownPoint[], sign: 1 | -1): ToothCenter | null {
  const near = toothBlCenter(windowPoints(points, sign, 4.0, 11.4));
  const far = toothBlCenter(windowPoints(points, sign, 11.4, 19.0));
  if (near && far && Math.abs(near.u - far.u) > 1.7) {
    return far;
  }
  return near ?? far;
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
 * 악궁에서 크게 어긋난(부정교합·회전된) 인접면은 빼고 나머지를 쓴다.
 */
export function neighborCrownBlPose(
  points: readonly ArchCrownPoint[],
  archSlopeHint?: number | null,
): { slope: number; offsetU: number } | null {
  const mesial = sideTooth(points, 1);
  const distal = sideTooth(points, -1);

  let archSlope: number | null = archSlopeHint != null && Number.isFinite(archSlopeHint)
    ? clamp(archSlopeHint, -TAN_20, TAN_20)
    : null;
  let offsetU: number | null = null;

  if (mesial && distal) {
    const dv = mesial.v - distal.v;
    if (Math.abs(dv) >= 3.8) {
      const chordSlope = clamp((mesial.u - distal.u) / dv, -TAN_20, TAN_20);
      archSlope = archSlope != null ? archSlope * 0.4 + chordSlope * 0.6 : chordSlope;
      offsetU = clamp(distal.u + ((mesial.u - distal.u) * (0 - distal.v)) / dv, -3.4, 3.4);
    }
  } else if (mesial || distal) {
    const only = (mesial ?? distal)!;
    const s = archSlope ?? 0;
    offsetU = clamp(only.u - s * only.v, -3.4, 3.4);
  }

  const wallM = proximalWallSlope(points, 1, mesial?.u ?? offsetU ?? 0);
  const wallD = proximalWallSlope(points, -1, distal?.u ?? offsetU ?? 0);
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

  let slope = 0;
  if (archSlope != null && wallSlope != null) {
    slope = clamp(archSlope * 0.45 + wallSlope * 0.55, -TAN_20, TAN_20);
  } else if (wallSlope != null) {
    slope = clamp(wallSlope, -TAN_20, TAN_20);
  } else if (archSlope != null) {
    slope = clamp(archSlope, -TAN_20, TAN_20);
  }

  return { slope, offsetU: offsetU ?? 0 };
}

/**
 * 악궁 연장선 근처에서 상악은 협측, 하악은 설측으로 둔다.
 * 대합 B가 그 악궁에서 많이 벗어나면 그 대합치는 쓰지 않는다.
 * 10mm를 넘길 만큼 먼 이동만 줄인다. 악궁 위의 위치는 임플란트 쪽으로 당기지 않는다.
 */
export function pickCompactFunctionalU(args: {
  jaw: "upper" | "lower";
  archU: number | null;
  contactU: number | null;
  /** 넘기면 상악 협측·하악 설측 최소 이동을 이 값까지 보장한다. */
  biasMm?: number;
}): number | null {
  const sign = args.jaw === "upper" ? 1 : -1;
  const slight = args.biasMm ?? 0.4;
  const { archU, contactU } = args;
  if (archU == null && contactU == null) return null;

  let target: number;
  if (archU != null && contactU != null && Math.abs(contactU - archU) <= 2.4) {
    const functionalDelta = sign * (contactU - archU);
    const follow = functionalDelta > 0 ? Math.min(functionalDelta, 0.55) : 0;
    target = archU + sign * Math.max(slight, follow);
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
