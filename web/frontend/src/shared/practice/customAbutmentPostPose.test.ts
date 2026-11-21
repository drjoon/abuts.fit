import assert from "node:assert/strict";
import test from "node:test";

import {
  clampLateralForCompactDiameter,
  localArchTangent,
  neighborCrownBlPose,
  opposingSlopeTargetU,
  pickCompactFunctionalU,
  proximalWallSlope,
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
