// 자동 삽입축. 평소에는 교합면 수직 · 크라운 중심 · 인접 어벗 정렬을 비슷한 비중으로 섞는다.
// 픽스쳐가 교합면에서 기울면 픽스쳐·인접 추종을 줄이고 교합면 수직과 크라운 중심을 올린다.
// 픽스쳐는 곧은데 인접만 부정교합이면 인접 비중만 줄인다.
// 픽스쳐 장축은 블렌드 항이 아니다. 기울기 판정에만 쓴다.
// SSOT: docs/intent/auto-insertion-axis.md

import type { Vec3 } from "@/shared/practice/scanbodyRegistration";

export type { Vec3 };

/** 이 각도까지는 곧은 식립으로 보고 세 비중을 유지한다. */
const FIXTURE_TILT_START_DEG = 6;
/** 시작각에서 이만큼 더 기울면 픽스쳐·인접 비중 조정이 끝까지 간다. */
const FIXTURE_TILT_SPAN_DEG = 12;
/** 인접 장축이 교합·크라운 방향에서 이 각도까지는 정상 경사다. */
const ADJ_DEV_START_DEG = 16;
const ADJ_DEV_SPAN_DEG = 14;
/** 양옆 장축이 서로 이 각도 이상 벌어지면 인접 부정교합으로 본다. */
const ADJ_SPREAD_START_DEG = 12;
const ADJ_SPREAD_SPAN_DEG = 14;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function smootherstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** ref와 같은 반구를 보게 단위 벡터로 맞춘다. */
export function upAxis(v: Vec3, ref: Vec3): Vec3 {
  const n = norm(v);
  return dot(n, ref) < 0 ? scale(n, -1) : n;
}

export function angleDeg(a: Vec3, b: Vec3): number {
  return (Math.acos(clamp(dot(norm(a), norm(b)), -1, 1)) * 180) / Math.PI;
}

/** 픽스쳐 +Z 기울기(순설·근원심 탄젠트)로 방향을 만든다. */
export function axisFromFixtureSlopes(labXY: Vec3, mesXY: Vec3, labSlope: number, mesSlope: number): Vec3 {
  return upAxis(
    [
      labXY[0] * labSlope + mesXY[0] * mesSlope,
      labXY[1] * labSlope + mesXY[1] * mesSlope,
      1,
    ],
    [0, 0, 1],
  );
}

/**
 * 교합 수직으로 heightMm 올라간 뒤, 그 평면에 수직인 labial·mesial 방향으로
 * 크라운 중심까지 옮긴 점을 향하는 축.
 */
export function axisTowardCrownCenter(
  occlusalVertical: Vec3,
  labial: Vec3,
  mesial: Vec3,
  labialMm: number,
  mesialMm: number,
  heightMm: number,
): Vec3 {
  const h = Math.max(heightMm, 0.5);
  const occ = upAxis(occlusalVertical, [0, 0, 1]);
  return upAxis(add(scale(occ, h), add(scale(labial, labialMm), scale(mesial, mesialMm))), occ);
}

/** 서로 상쇄되면 null. 인접을 평균으로 흉내 내지 않는다. */
export function meanUpAxis(axes: readonly Vec3[], ref: Vec3): Vec3 | null {
  if (axes.length === 0) return null;
  const ups = axes.map((a) => upAxis(a, ref));
  let acc: Vec3 = [0, 0, 0];
  for (const a of ups) acc = add(acc, a);
  const len = Math.hypot(acc[0], acc[1], acc[2]);
  if (len < ups.length * 0.25) return null;
  return scale(acc, 1 / len);
}

export function maxPairAngleDeg(axes: readonly Vec3[]): number {
  let maxA = 0;
  const ups = axes.map((a) => upAxis(a, [0, 0, 1]));
  for (let i = 0; i < ups.length; i += 1) {
    for (let j = i + 1; j < ups.length; j += 1) {
      maxA = Math.max(maxA, angleDeg(ups[i]!, ups[j]!));
    }
  }
  return maxA;
}

export type InsertionAxisBlendMode = "balanced" | "fixture-tilt" | "adjacent-malocclusion";

export type InsertionAxisBlendInput = {
  occlusalVertical: Vec3;
  crownCenter: Vec3;
  adjacent: Vec3 | null;
  /** 양옆 장축이 서로 벌어진 각도(°). 크라운·교합과의 차이와 따로 본다. */
  adjacentSpreadDeg?: number;
  fixtureAxis?: Vec3;
};

export type InsertionAxisBlendResult = {
  axis: Vec3;
  weights: { occlusal: number; crown: number; adjacent: number };
  fixtureTiltDeg: number;
  adjacentDeviationDeg: number | null;
  mode: InsertionAxisBlendMode;
};

export function blendAutoInsertionAxis(input: InsertionAxisBlendInput): InsertionAxisBlendResult {
  const fixture = upAxis(input.fixtureAxis ?? [0, 0, 1], [0, 0, 1]);
  const occ = upAxis(input.occlusalVertical, fixture);
  const crown = upAxis(input.crownCenter, occ);
  const adj = input.adjacent ? upAxis(input.adjacent, occ) : null;
  const fixtureTiltDeg = angleDeg(fixture, occ);
  const occCrown = upAxis(add(occ, crown), occ);
  const spread = Math.max(0, input.adjacentSpreadDeg ?? 0);
  const adjacentDeviationDeg = adj ? angleDeg(adj, occCrown) : null;

  let occW = 1;
  let crownW = 1;
  let adjW = adj ? 1 : 0;

  const tiltT = smootherstep((fixtureTiltDeg - FIXTURE_TILT_START_DEG) / FIXTURE_TILT_SPAN_DEG);
  if (tiltT > 0) {
    adjW *= 1 - 0.72 * tiltT;
    occW *= 1 + 0.5 * tiltT;
    crownW *= 1 + 0.5 * tiltT;
  }

  const malGate = 1 - tiltT;
  const devT =
    adjacentDeviationDeg == null
      ? 0
      : smootherstep((adjacentDeviationDeg - ADJ_DEV_START_DEG) / ADJ_DEV_SPAN_DEG);
  const spreadT = smootherstep((spread - ADJ_SPREAD_START_DEG) / ADJ_SPREAD_SPAN_DEG);
  const malT = Math.max(devT, spreadT) * malGate;
  if (malT > 0 && adj) adjW *= 1 - 0.8 * malT;

  let mode: InsertionAxisBlendMode = "balanced";
  if (tiltT >= 0.35) mode = "fixture-tilt";
  else if (malT >= 0.35) mode = "adjacent-malocclusion";

  let sum = add(scale(occ, occW), scale(crown, crownW));
  if (adj && adjW > 1e-4) sum = add(sum, scale(adj, adjW));
  return {
    axis: upAxis(sum, occ),
    weights: { occlusal: occW, crown: crownW, adjacent: adjW },
    fixtureTiltDeg,
    adjacentDeviationDeg,
    mode,
  };
}
