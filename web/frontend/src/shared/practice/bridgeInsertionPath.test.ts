import assert from "node:assert/strict";

import {
  bridgeInsertionMates,
  localDirToWorld,
  measureLocalPostAxis,
  normalizeInsertionAxis,
} from "./bridgeInsertionPath";

// 박광훈 2026-11-21. 33-43 브리지와 34-35 브리지는 연결이 없다.
const parkGwangHun = [
  { toothNumber: "43", prosthesisType: "브리지", bridgeLinkedTeeth: ["42"] },
  { toothNumber: "42", prosthesisType: "브리지", bridgeLinkedTeeth: ["43", "41"] },
  { toothNumber: "41", prosthesisType: "브리지", bridgeLinkedTeeth: ["42", "31"] },
  { toothNumber: "31", prosthesisType: "브리지", bridgeLinkedTeeth: ["41", "32"] },
  { toothNumber: "32", prosthesisType: "브리지", bridgeLinkedTeeth: ["31", "33"] },
  { toothNumber: "33", prosthesisType: "브리지", bridgeLinkedTeeth: ["32"] },
  { toothNumber: "34", prosthesisType: "브리지", bridgeLinkedTeeth: ["35"] },
  { toothNumber: "35", prosthesisType: "브리지", bridgeLinkedTeeth: ["34"] },
];
const abutments = ["43", "33", "34", "35"];

assert.deepEqual(bridgeInsertionMates("43", parkGwangHun, abutments), ["33"]);
assert.deepEqual(bridgeInsertionMates("33", parkGwangHun, abutments), ["43"]);
assert.deepEqual(bridgeInsertionMates("34", parkGwangHun, abutments), ["35"]);
assert.deepEqual(bridgeInsertionMates("35", parkGwangHun, abutments), ["34"]);
assert.deepEqual(
  bridgeInsertionMates("43", parkGwangHun, ["43"]),
  [],
  "지대치가 하나면 따라갈 형제가 없다",
);

const local = new Float32Array([
  0.45, 0, 2.2, 0, 0.45, 2.2, -0.4, 0.1, 2.2, 0.1, -0.4, 2.2,
  0.55, 0.1, 5.2, -0.1, 0.55, 5.2, 0.2, -0.45, 5.2, -0.4, -0.15, 5.2,
  1.4, 0.8, 8, -1.2, 0.6, 8, 0.2, -1.3, 8, -0.4, -0.9, 8,
]);
const axis = measureLocalPostAxis(local, 0.8);
assert.ok(axis, "포스트 상·하단으로 삽입축을 잰다");
assert.ok(Math.abs(axis![2]) > 0.95, "곧은 포스트의 로컬 축은 Z에 가깝다");

const world = localDirToWorld([0, 0, 1], {
  hexX: [1, 0, 0],
  hexY: [0, 1, 0],
  axis: [0, 0, -1],
});
assert.ok(world);
assert.ok(Math.abs(world![2] + 1) < 1e-6, "픽스처 축이 -Z이면 월드 삽입축도 -Z");
assert.deepEqual(normalizeInsertionAxis([0, 3, 0]), [0, 1, 0]);
assert.equal(normalizeInsertionAxis([1]), null);

console.log("bridge insertion path ok");
