import assert from "node:assert/strict";
import {
  abutmentEditTargets,
  gumballGroupTeeth,
  nextAbutmentSelection,
} from "./customAbutmentSelection";

assert.deepEqual(nextAbutmentSelection([], "11", false), ["11"]);
assert.deepEqual(nextAbutmentSelection(["11"], "12", false), ["12"]);
assert.deepEqual(nextAbutmentSelection(["11"], "12", true), ["11", "12"]);
assert.deepEqual(nextAbutmentSelection(["11", "12"], "11", true), ["12"]);
assert.deepEqual(nextAbutmentSelection(["11"], "11", true), ["11"]);
assert.deepEqual(nextAbutmentSelection(["11", "12"], "12", true), ["11"]);
assert.deepEqual(abutmentEditTargets(["11", "12"], "12"), ["11", "12"]);
assert.deepEqual(abutmentEditTargets(["11", "12"], "21"), ["21"]);
assert.deepEqual(gumballGroupTeeth(["11", "12"], "11"), ["11", "12"]);
assert.deepEqual(gumballGroupTeeth(["11"], "11"), ["11"]);
assert.deepEqual(gumballGroupTeeth(["11", "12"], "21"), ["21"]);
console.log("custom abutment selection ok");
