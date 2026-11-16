import assert from "node:assert/strict";

import {
  applyAbutmentGenerationLogic,
  collectGenerationEditRows,
  generationAxisBias,
} from "./abutmentDesignLogic.ts";

const clearance = collectGenerationEditRows({
  teeth: [
    {
      toothNumber: "13",
      params: { occlusalClearanceMm: 1.8, marginDepthMm: 0.9, axisShiftLabialMm: 0, postYawDeg: 0 },
    },
  ],
  baselineParams: {
    "13": { occlusalClearanceMm: 1.3, marginDepthMm: 0.5, axisShiftLabialMm: 0, postYawDeg: 0 },
  },
  gumball: [],
});
assert.deepEqual(clearance, [], "커프·대합 거리는 생성 패턴으로 올리지 않는다");

const tilt = collectGenerationEditRows({
  teeth: [{ toothNumber: "13", params: { axisShiftLabialMm: 0, postYawDeg: 0 } }],
  baselineParams: { "13": { axisShiftLabialMm: 0, postYawDeg: 0 } },
  gumball: [
    {
      tooth: "13",
      edit: {
        tiltLabialDeg: -4,
        tiltMesialDeg: 0.2,
        shiftLabialMm: 0,
        shiftMesialMm: 0,
        yawDeg: 1,
      },
    },
  ],
});
assert.equal(tilt.length, 1);
assert.deepEqual(tilt[0]?.deltas, [{ axis: "tiltLabialDeg", before: 0, after: -4 }]);

const params = { postYawDeg: 0 };
applyAbutmentGenerationLogic(params, "13", [{ toothKind: "canine", axis: "yawDeg", delta: -6 }]);
assert.equal(params.postYawDeg, -6);
applyAbutmentGenerationLogic(params, "11", [{ toothKind: "canine", axis: "yawDeg", delta: -6 }]);
assert.equal(params.postYawDeg, -6, "견치 보정은 절치에 더하지 않는다");

const bias = generationAxisBias("23", [{ toothKind: "canine", axis: "tiltLabialDeg", delta: -4 }]);
assert.equal(bias.tiltLabialDeg, -4);
assert.equal(bias.shiftLabialMm, 0);
