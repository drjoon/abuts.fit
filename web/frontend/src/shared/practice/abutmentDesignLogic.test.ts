import assert from "node:assert/strict";

import {
  applyAbutmentGenerationLogic,
  applyStoredDesignParams,
  generationAxisBias,
} from "./abutmentDesignLogic.ts";

const clearance = { occlusalClearanceMm: 1.3, postYawDeg: 0 };
applyStoredDesignParams(clearance, "13", [
  { toothKind: "canine", params: { occlusalClearanceMm: 0.5 } },
]);
assert.equal(clearance.occlusalClearanceMm, 1.8, "대합 거리 차이를 다음 생성에 더한다");
applyStoredDesignParams(clearance, "11", [
  { toothKind: "canine", params: { occlusalClearanceMm: 0.5 } },
]);
assert.equal(clearance.occlusalClearanceMm, 1.8, "견치 보정은 절치에 더하지 않는다");

const yaw = { postYawDeg: 0 };
applyAbutmentGenerationLogic(yaw, "13", [{ toothKind: "canine", axis: "yawDeg", delta: -6 }]);
assert.equal(yaw.postYawDeg, -6);

const bias = generationAxisBias("23", [
  { toothKind: "canine", axis: "tiltLabialDeg", delta: -2, pose: { tiltLabialDeg: -4 } },
]);
assert.equal(bias.tiltLabialDeg, -6);
assert.equal(bias.shiftLabialMm, 0);
