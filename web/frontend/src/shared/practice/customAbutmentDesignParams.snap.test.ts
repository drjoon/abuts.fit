import assert from "node:assert/strict";
import test from "node:test";

import {
  computeOptimalPostHeightMmFromTaper,
  computeOptimalPostTaperDeg,
  evaluatePostTaperRetention,
  resolveCustomAbutmentParams,
  resolveToothBridgeRetentionContext,
  snapMaxDiameterMm,
} from "./customAbutmentDesignParams";

test("최대 직경은 정수에서 0.1mm 이내이면 0.01mm 아래로 내린다", () => {
  assert.equal(snapMaxDiameterMm(8.05), 7.99);
  assert.equal(snapMaxDiameterMm(8.1), 7.99);
  assert.equal(snapMaxDiameterMm(8), 7.99);
  assert.equal(snapMaxDiameterMm(8.11), 8.11);
  assert.equal(snapMaxDiameterMm(7.99), 7.99);
  assert.equal(snapMaxDiameterMm(7.9), 7.9);
  assert.equal(snapMaxDiameterMm(9.02), 8.99);
});

test("마진 챔퍼는 0.1mm 단위이고 기본값은 0.6mm, 최소는 0.5mm", () => {
  assert.equal(resolveCustomAbutmentParams("36").marginFilletRadiusMm, 0.6);
  assert.equal(resolveCustomAbutmentParams("36", { marginFilletRadiusMm: 0.59 }).marginFilletRadiusMm, 0.6);
  assert.equal(resolveCustomAbutmentParams("36", { marginFilletRadiusMm: 0.64 }).marginFilletRadiusMm, 0.6);
  assert.equal(resolveCustomAbutmentParams("36", { marginFilletRadiusMm: 0.66 }).marginFilletRadiusMm, 0.7);
  assert.equal(resolveCustomAbutmentParams("36", { marginFilletRadiusMm: 0.4 }).marginFilletRadiusMm, 0.5);
  assert.equal(resolveCustomAbutmentParams("36", { marginFilletRadiusMm: 0.3 }).marginFilletRadiusMm, 0.5);
});

test("포스트 높이·테이퍼 등유지력 연동은 기본 5mm · 2° 기준, 최소 2°, 브리지 가중을 따른다", () => {
  const def = resolveCustomAbutmentParams("36");
  assert.equal(def.occlusalClearanceMm, 1.5);
  assert.equal(def.postTaperDeg, 2);
  assert.equal(def.postTaperLink, 1);
  assert.equal(resolveCustomAbutmentParams("36", { postTaperDeg: 0.8 }).postTaperDeg, 2);
  assert.equal(resolveCustomAbutmentParams("36", { occlusalClearanceMm: 0.4 }).occlusalClearanceMm, 0.7);
  assert.equal(resolveCustomAbutmentParams("36", { occlusalClearanceMm: 9.5 }).occlusalClearanceMm, 9.5);

  // 포스트 길이가 낮아 적정 테이퍼가 2.0° 미만인 경우 최소 2.0°로 맞추고 한계 이탈 여부·적정값을 알려준다
  const shortCheck = evaluatePostTaperRetention(3.5, false);
  assert.equal(shortCheck.appliedTaperDeg, 2.0);
  assert.equal(shortCheck.minTaperDeg, 2.0);
  assert.equal(shortCheck.idealTaperDeg, 1.4);
  assert.equal(shortCheck.isBelowMinLimit, true);
  const normalCheck = evaluatePostTaperRetention(5.5, false);
  assert.equal(normalCheck.appliedTaperDeg, 2.2);
  assert.equal(normalCheck.isBelowMinLimit, false);

  // 싱글: 5mm -> 2.0°, 그보다 짧으면 최소 2.0°, 높으면 tanθ ∝ H
  assert.equal(computeOptimalPostTaperDeg(5.0, false), 2.0);
  assert.equal(computeOptimalPostTaperDeg(2.2, false), 2.0);
  assert.equal(computeOptimalPostTaperDeg(2.5, false), 2.0);
  assert.equal(computeOptimalPostTaperDeg(6.0, false), 2.4);
  assert.equal(computeOptimalPostTaperDeg(7.73, false), 3.1);
  assert.equal(computeOptimalPostHeightMmFromTaper(2.0, false), 5.0);

  // 의뢰자 메타데이터 싱글/브리지 판별
  assert.deepEqual(
    resolveToothBridgeRetentionContext("36", [
      { toothNumber: "36", prosthesisType: "크라운", bridgeLinkedTeeth: [] },
    ]),
    { isBridge: false, retainerCount: 1 },
  );
  const twoUnitBridge = resolveToothBridgeRetentionContext("35", [
    { toothNumber: "35", prosthesisType: "브리지", bridgeLinkedTeeth: ["35", "36", "37"] },
    { toothNumber: "36", prosthesisType: "결손", bridgeLinkedTeeth: ["35", "36", "37"] },
    { toothNumber: "37", prosthesisType: "브리지", bridgeLinkedTeeth: ["35", "36", "37"] },
  ]);
  assert.deepEqual(twoUnitBridge, { isBridge: true, retainerCount: 2 });

  const threeRetainerBridge = resolveToothBridgeRetentionContext("36", [
    { toothNumber: "35", prosthesisType: "브리지", bridgeLinkedTeeth: ["35", "36", "37"] },
    { toothNumber: "36", prosthesisType: "브리지", bridgeLinkedTeeth: ["35", "36", "37"] },
    { toothNumber: "37", prosthesisType: "브리지", bridgeLinkedTeeth: ["35", "36", "37"] },
  ]);
  assert.deepEqual(threeRetainerBridge, { isBridge: true, retainerCount: 3 });

  // 브리지: 5mm 기준 3.0°(3지대주 3.3°). 짧으면 최소 2.0°
  assert.equal(computeOptimalPostTaperDeg(2.5, twoUnitBridge), 2.0);
  assert.equal(computeOptimalPostTaperDeg(5.0, twoUnitBridge), 3.0);
  assert.equal(computeOptimalPostTaperDeg(6.0, twoUnitBridge), 3.6);
  assert.equal(computeOptimalPostTaperDeg(5.0, threeRetainerBridge), 3.3);
  assert.equal(computeOptimalPostHeightMmFromTaper(3.0, twoUnitBridge), 5.0);
});
