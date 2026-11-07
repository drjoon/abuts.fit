import assert from "node:assert/strict";
import {
  isDummySampleExcludedFromDiameterRetrigger,
  shouldRetriggerEspritForMaterialDiameter,
} from "../../controllers/requests/espritDiameterRetrigger.utils.js";

test("dummy sample is excluded from diameter NC retrigger", () => {
  assert.equal(
    isDummySampleExcludedFromDiameterRetrigger({ source: "dummy_sample" }),
    true,
  );
  assert.equal(
    isDummySampleExcludedFromDiameterRetrigger({
      requestCategory: "dummy_sample",
    }),
    true,
  );
  assert.equal(
    isDummySampleExcludedFromDiameterRetrigger({ source: "practice" }),
    false,
  );
});

test("real request still retriggers when NC diameter differs", () => {
  const doc = { source: "practice", requestCategory: "abutment" };
  assert.equal(isDummySampleExcludedFromDiameterRetrigger(doc), false);
  assert.equal(
    shouldRetriggerEspritForMaterialDiameter({
      nextDiameter: 12,
      hasNc: true,
      ncMaterialDiameter: 10,
    }),
    true,
  );
});
