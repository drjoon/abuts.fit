import assert from "node:assert/strict";

import { abutmentInfoPanelSortKey } from "./PracticeCustomAbutmentDesignTree";

const order = ["16", "22", "11", "38", "41", "17", "12", "48", "31", "28", "18", "21"].sort(
  (a, b) => abutmentInfoPanelSortKey(a) - abutmentInfoPanelSortKey(b),
);

assert.deepEqual(order, [
  "18",
  "17",
  "16",
  "12",
  "11",
  "21",
  "22",
  "28",
  "38",
  "31",
  "41",
  "48",
]);

const screenshot = ["17", "12", "11", "22", "16"].sort(
  (a, b) => abutmentInfoPanelSortKey(a) - abutmentInfoPanelSortKey(b),
);
assert.deepEqual(screenshot, ["17", "16", "12", "11", "22"]);

console.log("abutment info panel sort ok");
