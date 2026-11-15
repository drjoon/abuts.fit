import assert from "node:assert/strict";
import * as THREE from "three";

import {
  applyStamps,
  frameFromPositions,
  rigidMatrix,
  sculptFalloff,
  type DirectEditFixture,
} from "./abutmentDirectEdit";

const fixture: DirectEditFixture = {
  labialDir: [1, 0, 0],
  mesialDir: [0, 1, 0],
  fixturePose: {
    hexX: [1, 0, 0],
    hexY: [0, 1, 0],
    axis: [0, 0, 1],
    origin: [0, 0, 0],
  },
};

function boxPoints() {
  const pts: number[] = [];
  for (const x of [-2, 2]) {
    for (const y of [-1, 1]) {
      for (const z of [0, 10]) pts.push(x, y, z);
    }
  }
  return new Float32Array(pts);
}

const frame = frameFromPositions(boxPoints(), fixture);
assert.ok(frame.axes[2].dot(new THREE.Vector3(0, 0, 1)) > 0.99, "중심축은 위쪽");
assert.ok(frame.axes[0].dot(new THREE.Vector3(1, 0, 0)) > 0.99, "빨강은 순측");
assert.ok(Math.abs(frame.origin.z - 5) < 1e-6, "검볼은 가운데");

function apply(matrix: THREE.Matrix4, x: number, y: number, z: number) {
  const e = matrix.elements;
  return [
    e[0]! * x + e[4]! * y + e[8]! * z + e[12]!,
    e[1]! * x + e[5]! * y + e[9]! * z + e[13]!,
    e[2]! * x + e[6]! * y + e[10]! * z + e[14]!,
  ];
}

const scaled = apply(
  rigidMatrix(frame, {
    translate: new THREE.Vector3(0, 0, 2),
    quat: new THREE.Quaternion(),
    scale: [2, 1, 1],
  }),
  2,
  0,
  5,
);
assert.ok(Math.abs(scaled[0]! - 4) < 1e-4, "순측 스케일");
assert.ok(Math.abs(scaled[2]! - 7) < 1e-4, "축 이동");

const spun = apply(
  rigidMatrix(frame, {
    translate: new THREE.Vector3(),
    quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
    scale: [1, 1, 1],
  }),
  2,
  0,
  5,
);
assert.ok(Math.abs(spun[0]!) < 1e-4 && Math.abs(spun[1]! - 2) < 1e-4, "중심축 회전");
assert.ok(Math.abs(spun[2]! - 5) < 1e-4, "회전 중심은 가운데");

const base = new Float32Array([0, 0, 5, 4, 0, 5]);
const stamped = applyStamps(
  base,
  [{ center: [0, 0, 5], delta: [0, 0, 1], radius: 1 }],
  new Float32Array(base.length),
);
assert.ok(Math.abs(stamped[2]! - 6) < 1e-6, "잡은 점은 올라간다");
assert.ok(Math.abs(stamped[5]! - 5) < 1e-6, "반경 밖은 그대로");
assert.equal(sculptFalloff(0, 2), 1);
assert.equal(sculptFalloff(2, 2), 0);

console.log("abutment direct edit ok");
