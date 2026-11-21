import assert from "node:assert/strict";
import test from "node:test";

import {
  clampLateralForCompactDiameter,
  localArchTangent,
  neighborCrownBlPose,
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

test("하악은 악궁보다 약간 설측이다", () => {
  const u = pickCompactFunctionalU({ jaw: "lower", archU: -0.5, contactU: 0.6 });
  assert.equal(u, -0.9);
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
  assert.ok(Math.abs(u - 0.45) < 1e-9);
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
