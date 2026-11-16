import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCustomAbutmentParams,
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
