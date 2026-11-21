// related files:
// - web/frontend/src/shared/practice/insertionAxisBlend.ts

import assert from "node:assert/strict";

import {
  angleDeg,
  axisTowardCrownCenter,
  blendAutoInsertionAxis,
  type Vec3,
} from "./insertionAxisBlend";

function tiltY(deg: number): Vec3 {
  const rad = (deg * Math.PI) / 180;
  return [0, Math.sin(rad), Math.cos(rad)];
}

{
  const w = axisTowardCrownCenter([0, 0, 1], [1, 0, 0], [0, 1, 0], 1.2, -0.4, 6);
  const h = 6 / w[2];
  assert.ok(Math.abs(w[0] * h - 1.2) < 1e-6 && Math.abs(w[1] * h + 0.4) < 1e-6, "크라운 중심 오프셋을 향한다");
}

{
  const occ: Vec3 = [0, 0, 1];
  const crown: Vec3 = [0.07, 0, 0.997];
  const adj: Vec3 = [0, 0.07, 0.997];
  const result = blendAutoInsertionAxis({
    occlusalVertical: occ,
    crownCenter: crown,
    adjacent: adj,
    fixtureAxis: occ,
  });
  assert.equal(result.mode, "balanced");
  assert.ok(Math.abs(result.weights.occlusal - 1) < 1e-6);
  assert.ok(Math.abs(result.weights.crown - 1) < 1e-6);
  assert.ok(Math.abs(result.weights.adjacent - 1) < 1e-6);
  assert.ok(result.axis[0] > 0.01 && result.axis[1] > 0.01, "세 방향이 모두 남는다");
}

{
  const occ: Vec3 = [0, 0, 1];
  const fixture = tiltY(20);
  const result = blendAutoInsertionAxis({
    occlusalVertical: occ,
    crownCenter: occ,
    adjacent: fixture,
    fixtureAxis: fixture,
  });
  assert.equal(result.mode, "fixture-tilt");
  assert.ok(result.weights.adjacent < result.weights.occlusal);
  assert.ok(result.weights.crown > 1 && result.weights.occlusal > 1);
  assert.ok(
    angleDeg(result.axis, occ) < angleDeg(result.axis, fixture),
    "기운 픽스쳐보다 교합면 수직에 가깝다",
  );
}

{
  const occ: Vec3 = [0, 0, 1];
  const adj = tiltY(24);
  const tipped = blendAutoInsertionAxis({
    occlusalVertical: occ,
    crownCenter: occ,
    adjacent: adj,
    fixtureAxis: occ,
  });
  const mild = blendAutoInsertionAxis({
    occlusalVertical: occ,
    crownCenter: occ,
    adjacent: tiltY(6),
    fixtureAxis: occ,
  });
  assert.equal(tipped.mode, "adjacent-malocclusion");
  assert.equal(mild.mode, "balanced");
  assert.ok(tipped.weights.adjacent < 0.7);
  assert.ok(Math.abs(mild.weights.adjacent - 1) < 1e-6);
  assert.ok(Math.abs(tipped.weights.occlusal - 1) < 1e-6 && Math.abs(tipped.weights.crown - 1) < 1e-6);
  assert.ok(angleDeg(tipped.axis, occ) < angleDeg(mild.axis, occ) + 8);
  assert.ok(angleDeg(tipped.axis, occ) < angleDeg(adj, occ) * 0.55, "부정교합 인접을 그대로 따라가지 않는다");
}

{
  const occ: Vec3 = [0, 0, 1];
  const adj = tiltY(6);
  const spread = blendAutoInsertionAxis({
    occlusalVertical: occ,
    crownCenter: occ,
    adjacent: adj,
    adjacentSpreadDeg: 22,
    fixtureAxis: occ,
  });
  const tight = blendAutoInsertionAxis({
    occlusalVertical: occ,
    crownCenter: occ,
    adjacent: adj,
    adjacentSpreadDeg: 4,
    fixtureAxis: occ,
  });
  assert.equal(spread.mode, "adjacent-malocclusion");
  assert.ok(spread.weights.adjacent < tight.weights.adjacent);
  assert.ok(Math.abs(spread.weights.occlusal - tight.weights.occlusal) < 1e-6);
}

{
  const result = blendAutoInsertionAxis({
    occlusalVertical: [0, 0, 1],
    crownCenter: [0.1, 0, 1],
    adjacent: null,
    fixtureAxis: [0, 0, 1],
  });
  assert.equal(result.weights.adjacent, 0);
  assert.equal(result.mode, "balanced");
  assert.ok(result.axis[0] > 0);
}

console.log("insertion axis blend ok");
