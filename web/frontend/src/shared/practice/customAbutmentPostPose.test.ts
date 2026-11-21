import assert from "node:assert/strict";
import test from "node:test";

import {
  blendArchAndAdjacentYawSlope,
  blendLocalCrownSizeScale,
  harmonizeAdjacentAbutmentYaws,
  harmonizeAdjacentSameKindSizes,
  resolveSignedPlacementTradeoff,
  clampBuccalOffsetForLingualScrewWall,
  clampLateralForCompactDiameter,
  compromiseArchAgainstWall,
  compromiseWallShiftFromArch,
  lingualHalfAtScrewExitMm,
  localArchTangent,
  maxBuccalOffsetForLingualScrewWall,
  neighborCrownBlPose,
  opposingSlopeTargetU,
  pickCompactFunctionalU,
  proximalWallSlope,
  resolveAutoPlacementTradeoff,
  POSTERIOR_POST_WALL_IDEAL_MM,
  POSTERIOR_POST_WALL_MIN_MM,
  type ArchCrownPoint,
  type ArchStation,
} from "./customAbutmentPostPose";

const tooth = (v: number, u: number, w = 1): ArchStation => ({ v, u, w });

test("대칭 인접치는 접선이 곧고 포물선만큼만 협측으로 나온다", () => {
  const fit = localArchTangent([tooth(-8, 0), tooth(8, 0)]);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope) < 0.02);
  assert.ok(fit.offsetU > 0.15 && fit.offsetU < 0.5);
});

test("인접치 중심을 이은 접선으로 포스트를 돌린다", () => {
  const fit = localArchTangent([tooth(-8, 0), tooth(8, 1.6)]);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope - 0.1) < 0.02);
  assert.ok(fit.offsetU > 0.9 && fit.offsetU < 1.35);
});

test("부정교합 치아는 빼고 그 옆 치아 연장선을 쓴다", () => {
  const fit = localArchTangent([tooth(-16, 0.2), tooth(-8, 2.8), tooth(8, 0.1)]);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope) < 0.04);
  assert.ok(fit.offsetU < 1);
  assert.ok(fit.offsetU > -0.2);
});

test("상악은 악궁보다 약간 협측이고 대합이 설측이어도 따라가지 않는다", () => {
  const u = pickCompactFunctionalU({ jaw: "upper", archU: 0.8, contactU: -0.4 });
  assert.ok(u != null);
  assert.ok(u > 1.05 && u < 1.35);
});

test("2mm 간격으로 이어진 악궁도 접선과 협설 위치를 유지한다", () => {
  const stations: ArchStation[] = [];
  for (let v = -14; v <= 14; v += 2) {
    if (Math.abs(v) < 3.5) continue;
    stations.push(tooth(v, 0.08 * v + 1.1));
  }
  const fit = localArchTangent(stations);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope - 0.08) < 0.025);
  assert.ok(Math.abs(fit.offsetU - 1.1) < 0.25);
});

test("하악은 악궁과 대합 B보다 약간 설측이다", () => {
  const same = pickCompactFunctionalU({ jaw: "lower", archU: -0.5, contactU: -0.5 });
  assert.ok(same != null && same < -0.75 && same > -0.95);
  const oppBuccal = pickCompactFunctionalU({ jaw: "lower", archU: -0.5, contactU: 0.6 });
  assert.ok(oppBuccal != null && oppBuccal < -0.3 && oppBuccal > -0.6);
});

test("상악은 대합 B가 협측에 있으면 설측에 갇히지 않고 대합 쪽으로 따라간다", () => {
  const u = pickCompactFunctionalU({ jaw: "upper", archU: -0.3, contactU: 1.5, biasMm: 0.65 });
  assert.ok(u != null);
  assert.ok(u >= 1.4 && u <= 1.7);
});

test("대합치가 악궁에서 벗어나면 그 치아를 무시한다", () => {
  const u = pickCompactFunctionalU({ jaw: "upper", archU: 0.4, contactU: 3.2 });
  assert.ok(u != null);
  assert.ok(u >= 0.7 && u <= 0.9);
});

test("대합만 있으면 B에서 악에 맞게 조금 옮긴다", () => {
  const upper = pickCompactFunctionalU({ jaw: "upper", archU: null, contactU: 0.2 });
  const lower = pickCompactFunctionalU({ jaw: "lower", archU: null, contactU: 0.2 });
  assert.ok(upper != null && Math.abs(upper - 0.7) < 1e-9);
  assert.ok(lower != null && Math.abs(lower + 0.3) < 1e-9);
});

/** 마주 보는 인접면(접촉벽) 점군. wallTilt는 dv/du. */
function proximalWall(
  sign: 1 | -1,
  distMm: number,
  uCenter: number,
  wallTilt: number,
): ArchCrownPoint[] {
  const pts: ArchCrownPoint[] = [];
  for (let u = uCenter - 2.0; u <= uCenter + 2.01; u += 0.25) {
    for (let h = 3.0; h <= 7.51; h += 0.5) {
      const vSurface = sign * distMm + wallTilt * (u - uCenter);
      pts.push({ v: vSurface, u, h });
      pts.push({ v: vSurface + sign * 1.2, u, h });
    }
  }
  return pts;
}

/** 교두(높은 h)와 설측으로 늘어진 낮은 구개 점막. */
function crown(
  centerV: number,
  centerU: number,
  yawRad: number,
): ArchCrownPoint[] {
  const pts: ArchCrownPoint[] = [];
  const axisV = Math.sin(yawRad);
  const axisU = Math.cos(yawRad);
  const mdV = Math.cos(yawRad);
  const mdU = -Math.sin(yawRad);
  for (const side of [1, -1]) {
    for (let across = -1.2; across <= 1.21; across += 0.4) {
      for (let along = 0.6; along <= 2.61; along += 0.4) {
        pts.push({
          v: centerV + side * along * axisV + across * mdV,
          u: centerU + side * along * axisU + across * mdU,
          h: 8 - Math.abs(across) * 0.12 - (2.6 - along) * 0.35,
        });
      }
    }
  }
  for (let u = centerU - 4.5; u >= centerU - 8.1; u -= 0.7) {
    pts.push({ v: centerV, u, h: 2.4 });
  }
  return pts;
}

test("구개 점막이 있어도 교두 협설 중심을 쓰고 인접면이 곧으면 기울기가 없다", () => {
  const pts = [
    ...crown(-8, 1.1, 0),
    ...crown(8, 1.1, 0),
    ...proximalWall(-1, 4.5, 1.1, 0),
    ...proximalWall(1, 4.5, 1.1, 0),
  ];
  const fit = neighborCrownBlPose(pts);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope) < 0.04);
  assert.ok(Math.abs(fit.offsetU - 1.1) < 0.35);
});

test("인접면 기울기를 수직인 근원심 축 회전으로 바꾼다", () => {
  const wall = proximalWall(1, 4.5, 0.5, 0.14);
  const res = proximalWallSlope(wall, 1, 0.5);
  assert.ok(res);
  assert.ok(Math.abs(res.slope + 0.14) < 0.02);
});

test("악궁 접선과 인접면 기울기가 같으면 그 각도로 돌린다", () => {
  const s = 0.12;
  const pts = [
    ...crown(-8, -0.96, -s),
    ...crown(8, 0.96, -s),
    ...proximalWall(-1, 4.5, -0.5, -s),
    ...proximalWall(1, 4.5, 0.5, -s),
  ];
  const fit = neighborCrownBlPose(pts, s);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope - s) < 0.03);
  assert.ok(Math.abs(fit.offsetU) < 0.35);
});

test("돌아간 인접치(부정교합)의 인접면은 악궁과 어긋나면 빼고 나머지 인접면과 악궁을 쓴다", () => {
  const pts = [
    ...crown(-8, 0, 0),
    ...crown(8, 0, 0),
    ...proximalWall(-1, 4.5, 0, 0.02),
    ...proximalWall(1, 4.5, 0, -0.4), // ~22° 돌아간 치아
  ];
  const fit = neighborCrownBlPose(pts, 0);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope) < 0.04);
});

test("하악 임플란트가 악궁보다 설측에 있어도 악궁선 밖 설측으로 밀어내지 않는다", () => {
  const u = pickCompactFunctionalU({ jaw: "lower", archU: 0.8, contactU: 1.0, biasMm: 0.35 });
  assert.ok(u != null);
  assert.ok(u >= 0.4 && u <= 0.65);
});

test("상악 대구치는 악궁보다 약간 협측으로 둔다", () => {
  const u = pickCompactFunctionalU({ jaw: "upper", archU: 0.4, contactU: -0.4, biasMm: 0.65 });
  assert.ok(u != null);
  assert.ok(Math.abs(u - 1.05) < 1e-9);
});

test("직경이 커지는 이동은 목표 근처면 줄이고 멀면 그대로 둔다", () => {
  const near = clampLateralForCompactDiameter(1.4, 0, 1.15, 0.55);
  assert.ok(Math.abs(near.u - 1.15) < 1e-9);
  const far = clampLateralForCompactDiameter(2.2, 0, 1.15, 0.55);
  assert.equal(far.u, 2.2);
});

test("원심 단독 치아가 설측으로 크게 벗어난 부정교합이면 제외하고 근심 악궁 연장선을 따른다", () => {
  // #26 기준: 근심 #25(v=7), #24(v=14), #23(v=21)은 협측 아치에 정렬, 원심 #27/#28(v=-12)은 설측으로 크게 이탈
  const fit = localArchTangent(
    [tooth(-12, -2.1), tooth(7, 1.5), tooth(14, 1.3), tooth(21, 0.6)],
    { refSlope: -0.02, refOffsetU: 1.5 },
  );
  assert.ok(fit);
  assert.ok(fit.offsetU > 1.0 && fit.offsetU < 2.2, `expected ~1.6, got ${fit.offsetU}`);
});

test("치아 3개 중 원심 단독 치아가 대합 악궁 힌트와 어긋난 부정교합이면 제외한다", () => {
  const fit = localArchTangent([tooth(-10, -2.0), tooth(7, 1.4), tooth(14, 1.3)], {
    refSlope: 0,
    refOffsetU: 1.4,
  });
  assert.ok(fit);
  assert.ok(fit.offsetU > 1.0 && fit.offsetU < 2.0, `expected ~1.5, got ${fit.offsetU}`);
});

test("각도가 크게 돌아간 부정교합 인접치는 회전뿐 아니라 위치 추정에서도 제외한다", () => {
  const pts = [
    ...crown(-8, -1.8, 0), // 원심: 악궁과 어긋난 위치 + 회전
    ...crown(8, 1.2, 0), // 근심: 정상 위치 + 정상 각도
    ...proximalWall(-1, 4.5, -1.8, -0.45), // ~24° 돌아간 원심 치아
    ...proximalWall(1, 4.5, 1.2, 0.02),
  ];
  const fit = neighborCrownBlPose(pts, 0, 1.2);
  assert.ok(fit);
  assert.ok(Math.abs(fit.slope) < 0.05);
  assert.ok(fit.offsetU > 0.8 && fit.offsetU < 1.6, `expected ~1.2, got ${fit.offsetU}`);
});

test("상악 구치 중심은 대합 하악의 협측 교두 설측 경사면에 위치한다", () => {
  // 대합 하악 #36: uLo=-3.6, linU=-2.2, fossaU=0, bucU=+2.2, uHi=+3.6
  const res = opposingSlopeTargetU({
    jaw: "upper",
    uLo: -3.6,
    uHi: 3.6,
    bucU: 2.2,
    linU: -2.2,
  });
  assert.ok(Math.abs(res.fossaU) < 0.05);
  // 중심구(0)보다 협측이고, 협측 교두정(2.2)보다 설측인 협측 교두 설측 경사면
  assert.ok(res.u > 1.0 && res.u < 2.0, `expected upper target on buccal cusp lingual slope, got ${res.u}`);
});

test("하악 구치 중심은 대합 상악의 설측 교두 설측 경사면에 위치한다", () => {
  // 대합 상악 #26: uLo=-3.8, linU=-2.1, fossaU=0, bucU=+2.1, uHi=+3.8
  const res = opposingSlopeTargetU({
    jaw: "lower",
    uLo: -3.8,
    uHi: 3.8,
    bucU: 2.1,
    linU: -2.1,
  });
  assert.ok(Math.abs(res.fossaU) < 0.05);
  // 상악 설측 교두정(-2.1)보다 약간 설측인 설측 교두 설측 경사면(uLo 안쪽)
  assert.ok(res.u < -2.1 && res.u > -3.6, `expected lower target on lingual cusp lingual slope, got ${res.u}`);
});

test("악궁이 적절 벽 안에 있으면 벽을 깎지 않고 악궁을 따른다", () => {
  const placed = compromiseArchAgainstWall({ archMm: 0.4, idealLimitMm: 0.9, minLimitMm: 1.4 });
  assert.equal(placed, 0.4);
});

test("악궁과 적절 두께가 겹치면 최소 벽 앞에서 반씩 양보한다", () => {
  const ideal = 0.735;
  const minLim = ideal + (POSTERIOR_POST_WALL_IDEAL_MM - POSTERIOR_POST_WALL_MIN_MM);
  const placed = compromiseArchAgainstWall({ archMm: 2.2, idealLimitMm: ideal, minLimitMm: minLim });
  assert.ok(Math.abs(placed - (ideal + 0.25)) < 1e-9, `expected halfway, got ${placed}`);
  const wall = POSTERIOR_POST_WALL_IDEAL_MM - (placed - ideal);
  assert.ok(wall > POSTERIOR_POST_WALL_MIN_MM && wall < POSTERIOR_POST_WALL_IDEAL_MM);
});

test("최소 벽 밖으로는 악궁을 따라가지 않는다", () => {
  const placed = resolveAutoPlacementTradeoff({
    archOffsetMm: 3,
    idealLimitsMm: [0.4],
    minLimitsMm: [0.9],
  });
  assert.ok(Math.abs(placed - 0.65) < 1e-9);
});

test("크라운 최소를 맞추는 이동은 전부 하고 적절 두께만 양보한다", () => {
  const shift = compromiseWallShiftFromArch({ mustShiftMm: 0.7, idealShiftMm: 1.2 });
  assert.ok(Math.abs(shift - 0.95) < 1e-9);
  const already = compromiseWallShiftFromArch({ mustShiftMm: -0.2, idealShiftMm: -0.1 });
  assert.equal(already, 0);
});

test("악궁·대합 협측 위치가 스크류 설측 벽을 뚫으면 벽이 1mm 남는 곳까지만 옮긴다", () => {
  // 상악 제1대구치: 상단 설측 2.75, 마진 반폭 3.425, 포스트 5.5, 스크류 반경 1.225
  const half = lingualHalfAtScrewExitMm({
    topLingualHalfMm: 2.75,
    marginHalfBlMm: 3.425,
    postHeightMm: 5.5,
  });
  assert.ok(half > 2.85 && half < 3.05, `expected ~2.96, got ${half}`);
  const room = maxBuccalOffsetForLingualScrewWall({ lingualHalfMm: half, screwRadiusMm: 1.225 });
  const ideal = 2.2;
  const placed = clampBuccalOffsetForLingualScrewWall({
    buccalOffsetMm: ideal,
    lingualHalfMm: half,
    screwRadiusMm: 1.225,
  });
  assert.ok(placed < ideal - 0.8, `arch target should pull back, got ${placed}`);
  assert.ok(Math.abs(placed - room) < 1e-9);
  const wall = half - placed - 1.225;
  assert.ok(Math.abs(wall - 1) < 1e-6, `lingual wall should stay 1mm, got ${wall}`);
});

test("설측 벽이 이미 충분하면 악궁 협측 위치를 그대로 둔다", () => {
  const kept = clampBuccalOffsetForLingualScrewWall({
    buccalOffsetMm: 0.4,
    lingualHalfMm: 2.96,
    screwRadiusMm: 1.225,
  });
  assert.equal(kept, 0.4);
  const lingual = clampBuccalOffsetForLingualScrewWall({
    buccalOffsetMm: -1.4,
    lingualHalfMm: 2.96,
    screwRadiusMm: 1.225,
  });
  assert.equal(lingual, -1.4);
});

test("상단이 스크류보다 좁으면 협측으로 더 밀지 않는다", () => {
  const placed = clampBuccalOffsetForLingualScrewWall({
    buccalOffsetMm: 1.6,
    lingualHalfMm: 1.9,
    screwRadiusMm: 1.225,
  });
  assert.equal(placed, 0);
});

test("contactIsFunctionalTarget 모드에서 상악·하악이 교두 경사면과 악궁곡선을 함께 반영한다", () => {
  const upper = pickCompactFunctionalU({
    jaw: "upper",
    archU: 1.4,
    contactU: 1.8,
    contactIsFunctionalTarget: true,
  });
  assert.ok(upper != null && upper > 1.55 && upper < 1.85, `expected ~1.66, got ${upper}`);

  const lower = pickCompactFunctionalU({
    jaw: "lower",
    archU: -1.2,
    contactU: -1.8,
    contactIsFunctionalTarget: true,
  });
  assert.ok(lower != null && lower < -1.45 && lower > -1.85, `expected ~-1.59, got ${lower}`);
});

const DEG = Math.PI / 180;

test("편측 말단(#17)도 대합 악궁과 인접 어벗 연결선으로 아치 회전을 따른다", () => {
  const archTan = Math.tan(8 * DEG);
  const res = blendArchAndAdjacentYawSlope({
    jawArch: { slope: 0, hasBothSides: false, toothCount: 1, hasSlope: false },
    oppArch: { slope: archTan, hasBothSides: true, toothCount: 3 },
    adjacentAbutmentLineSlope: Math.tan(7 * DEG),
  });
  assert.ok(res);
  const deg = Math.atan(res.slope) / DEG;
  assert.ok(deg > 6.5 && deg < 8.5, `대합 악궁 8°·어벗 연결선 7°를 따라야 한다(${deg.toFixed(2)}°)`);
});

test("악궁 아치가 인접 접촉벽보다 우선하고, 14° 넘게 어긋난 인접벽은 뺀다", () => {
  const arch = { slope: Math.tan(5 * DEG), hasBothSides: true, toothCount: 4 };
  const near = blendArchAndAdjacentYawSlope({ jawArch: arch, adjacentWallSlope: Math.tan(9 * DEG) });
  assert.ok(near);
  const nearDeg = Math.atan(near.slope) / DEG;
  assert.ok(nearDeg > 5 && nearDeg < 7, `아치 쪽에 더 가깝다(${nearDeg.toFixed(2)}°)`);

  const twisted = blendArchAndAdjacentYawSlope({ jawArch: arch, adjacentWallSlope: Math.tan(-15 * DEG) });
  assert.ok(twisted);
  assert.ok(Math.abs(Math.atan(twisted.slope) / DEG - 5) < 0.01, "부정교합 인접벽은 무시한다");
});

test("#16·#17 인접 어벗 회전각은 대구치 악궁 곡률 안으로 모이고 신뢰도 낮은 쪽이 더 양보한다", () => {
  const deltas = harmonizeAdjacentAbutmentYaws([
    { toothNumber: "16", angleRad: 0, confidence: 0.9, fdiPos: 6, anterior: false },
    { toothNumber: "17", angleRad: 14 * DEG, confidence: 0.3, fdiPos: 7, anterior: false },
  ]);
  const a16 = deltas.get("16")!;
  const a17 = 14 * DEG + deltas.get("17")!;
  const gapDeg = Math.abs(a17 - a16) / DEG;
  assert.ok(gapDeg <= 6, `회전각 차이 ≤ 6°(${gapDeg.toFixed(2)}°)`);
  assert.ok(Math.abs(deltas.get("17")!) > Math.abs(a16), "신뢰도 낮은 #17이 더 많이 돈다");
});

test("수동 회전한 어벗은 조율에서 그대로 둔다", () => {
  const deltas = harmonizeAdjacentAbutmentYaws([
    { toothNumber: "16", angleRad: 0, confidence: 0.9, fdiPos: 6, anterior: false, locked: true },
    { toothNumber: "17", angleRad: 14 * DEG, confidence: 0.9, fdiPos: 7, anterior: false },
  ]);
  assert.equal(deltas.get("16"), 0);
  assert.ok(deltas.get("17")! < -5 * DEG);
});

test("대합·악궁 중심은 협측(+)과 설측(-) 모두 최소 벽 안에서 따라간다", () => {
  const buccal = resolveSignedPlacementTradeoff({
    targetOffsetMm: 1.2,
    posIdealLimitsMm: [0.6],
    posMinLimitsMm: [1.1],
    negIdealLimitsMm: [0.6],
    negMinLimitsMm: [1.1],
  });
  assert.ok(buccal > 0.6 && buccal <= 1.1, `협측은 적절 벽과 양보하고 최소 벽은 지킨다(${buccal})`);

  const lingual = resolveSignedPlacementTradeoff({
    targetOffsetMm: -0.4,
    posIdealLimitsMm: [0.6],
    posMinLimitsMm: [1.1],
    negIdealLimitsMm: [0.6],
    negMinLimitsMm: [1.1],
  });
  assert.equal(lingual, -0.4);

  const overMin = resolveSignedPlacementTradeoff({
    targetOffsetMm: -3,
    posIdealLimitsMm: [0.6],
    posMinLimitsMm: [1.1],
    negIdealLimitsMm: [0.3],
    negMinLimitsMm: [0.8],
  });
  assert.ok(overMin >= -0.8 - 1e-9, `설측도 최소 벽을 넘지 않는다(${overMin})`);
});

test("로컬 치관 크기는 표준을 앵커로 인접 자연치·대합치를 섞고 0.85~1.15로 묶는다", () => {
  assert.equal(blendLocalCrownSizeScale({}), 1);
  const big = blendLocalCrownSizeScale({ adjacentNaturalRatios: [1.12, 1.1], opposingRatio: 1.1 });
  assert.ok(big > 1.05 && big <= 1.15, `큰 환자 치아면 커진다(${big})`);
  const outlier = blendLocalCrownSizeScale({ adjacentNaturalRatios: [1.6], opposingRatio: 0.5 });
  assert.equal(outlier, 1, "비정상 폭 측정은 버린다");
});

test("같은 부위 인접 어벗 크기는 3% 안으로 모이고 물리 한도는 넘지 않는다", () => {
  const out = harmonizeAdjacentSameKindSizes([
    { toothNumber: "16", kind: "molar", fdiPos: 6, normScale: 1.12, minNormScale: 0.8, maxNormScale: 1.2 },
    { toothNumber: "17", kind: "molar", fdiPos: 7, normScale: 0.96, minNormScale: 0.8, maxNormScale: 1.0 },
    { toothNumber: "15", kind: "premolar", fdiPos: 5, normScale: 0.9, minNormScale: 0.8, maxNormScale: 1.2 },
  ]);
  const s16 = out.get("16")!;
  const s17 = out.get("17")!;
  assert.ok(s17 <= 1.0 + 1e-9, "#17 상한 유지");
  assert.ok(Math.abs(s16 - s17) <= 0.05, `대구치끼리 크기 차이가 줄어든다(${s16.toFixed(3)} vs ${s17.toFixed(3)})`);
  assert.equal(out.get("15"), 0.9, "다른 부위는 건드리지 않는다");
});
