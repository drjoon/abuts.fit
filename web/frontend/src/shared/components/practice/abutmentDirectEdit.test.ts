import assert from "node:assert/strict";

import * as THREE from "three";

import {
  buildAbutmentPreferenceUpdate,
  clampAbutmentEdit,
  identityAbutmentEdit,
  refitLocalPositions,
  screenGumballQuaternion,
  sculptFalloff,
  type AbutmentEdit,
} from "./abutmentDirectEdit";

const zone = {
  coneZ: 1,
  fixedZ: 1.6,
  marginZ: 3,
  screwR: 0.5,
  span: 8,
  labial: [1, 0] as [number, number],
  mesial: [0, 1] as [number, number],
};

function edit(patch: Partial<AbutmentEdit> = {}): AbutmentEdit {
  return { ...identityAbutmentEdit(), ...patch, scale: patch.scale ?? [1, 1, 1], partial: patch.partial ?? [] };
}

function one(src: number[], value: AbutmentEdit) {
  const proposal = new Float32Array(src);
  const out = new Float32Array(src.length);
  refitLocalPositions(proposal, value, zone, out);
  return out;
}

const connection = one([1, 0, 0.2], edit({ scale: [1.1, 1.1, 1.1], heightMm: 1 }));
assert.ok(Math.abs(connection[0]! - 1) < 1e-6 && Math.abs(connection[2]! - 0.2) < 1e-6, "커넥션은 그대로");

const taper = one([1.2, 0, 1.3], edit({ scale: [1.1, 1.1, 1.1], shiftLabialMm: 1, heightMm: 1 }));
assert.ok(Math.abs(taper[0]! - 1.2) < 1e-6 && Math.abs(taper[2]! - 1.3) < 1e-6, "2° 테이퍼는 그대로");

function many(src: number[], value: AbutmentEdit) {
  const proposal = new Float32Array(src);
  const out = new Float32Array(src.length);
  refitLocalPositions(proposal, value, zone, out);
  return out;
}

const hole = many(
  [0.3, 0, 3.2, 0.3, 0, 7.6, 2.4, 0, 7.6],
  edit({ heightMm: 1, shiftLabialMm: 0.8 }),
);
assert.ok(Math.abs(hole[0]! - 0.3) < 1e-6 && Math.abs(hole[2]! - 3.2) < 1e-6, "스크류 벽은 그대로");
assert.ok(Math.abs(hole[3]! - 0.3) < 1e-6 && Math.abs(hole[5]! - 8.6) < 1e-3, "스크류 입구는 높이만");
assert.ok(hole[6]! > 2.8 && Math.abs(hole[8]! - 8.6) < 1e-3, "포스트 윗면은 화살표 방향");

const wall = one([0.9, 0, 6], edit({ shiftLabialMm: -0.5 }));
assert.ok(Math.abs(wall[0]! - 0.58) < 1e-3, "스크류 벽 두께를 넘지 않음");

const linear = one([2, 1, 6], edit({ scale: [1.1, 1, 1] }));
assert.ok(Math.abs(linear[0]! - 2.2) < 1e-4, "선형은 순측만");
assert.ok(Math.abs(linear[1]! - 1) < 1e-4, "근심은 선형에서 그대로");

const planar = one([2, 1, 6], edit({ scale: [1.1, 1.2, 1] }));
assert.ok(Math.abs(planar[0]! - 2.2) < 1e-4 && Math.abs(planar[1]! - 1.2) < 1e-4, "평면은 두 축");

const solid = one([2, 0, 6], edit({ scale: [1, 1, 1], heightMm: 1 }));
assert.ok(Math.abs(solid[2]! - 7) < 1e-4, "높이 이동");

const tiltDeg = (Math.atan2(1, 6 - zone.fixedZ) * 180) / Math.PI;
const tilted = one([2, 0, 6], edit({ tiltLabialDeg: tiltDeg }));
assert.ok(Math.abs(tilted[0]! - 3) < 1e-3 && Math.abs(tilted[2]! - 6) < 1e-4, "기울이면 윗면이 순측으로");
const tiltConnection = one([1, 0, 0.2], edit({ tiltLabialDeg: tiltDeg }));
assert.ok(Math.abs(tiltConnection[0]! - 1) < 1e-6, "기울여도 커넥션은 그대로");

const grown = one(
  [2, 0, 6],
  edit({ partial: [{ z: 6, angle: 0, reach: 2, grow: 0.1 }] }),
);
assert.ok(Math.abs(grown[0]! - 2.2) < 1e-4, "포스트 부위가 커진다");

const far = one(
  [2, 0, 6],
  edit({ partial: [{ z: 3.2, angle: 0, reach: 1, grow: 0.1 }] }),
);
assert.ok(Math.abs(far[0]! - 2) < 1e-4, "범위 밖 포스트는 그대로");

const limited = edit({ scale: [2, 0.1, 3], heightMm: 9, shiftLabialMm: 8, yawDeg: 90 });
clampAbutmentEdit(limited, 8);
assert.equal(limited.scale[0], 1.15);
assert.equal(limited.scale[1], 0.8);
assert.ok(limited.heightMm <= 2 && limited.shiftLabialMm === 2 && limited.yawDeg === 30);
const steep = edit({ tiltLabialDeg: 80 });
clampAbutmentEdit(steep, 8);
assert.ok(Math.abs(Math.tan((steep.tiltLabialDeg * Math.PI) / 180) * 8) <= 2 + 1e-6, "기울기 윗면은 2mm 안");

assert.equal(sculptFalloff(0, 2), 1);
assert.equal(sculptFalloff(2, 2), 0);

const pref = buildAbutmentPreferenceUpdate({
  tooth: "38",
  baseWidth: 1,
  baseHeight: 0,
  widthRatio: 1.1,
  heightDeltaMm: 0.6,
});
assert.equal(pref?.scope, "posterior");
assert.equal(pref?.params.postWidthScale, 1.1);
assert.equal(pref?.params.postHeightOffsetMm, 0.6);
assert.equal(
  buildAbutmentPreferenceUpdate({ tooth: "11", baseWidth: 1, baseHeight: 0, widthRatio: 1, heightDeltaMm: 0 }),
  null,
);

const q = new THREE.Quaternion();
const right = new THREE.Vector3(0, 1, 0);
const up = new THREE.Vector3(0, 0, 1);
const outOfScreen = new THREE.Vector3(1, 0, 0);
screenGumballQuaternion(right, up, outOfScreen, q);
const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
assert.ok(localX.distanceTo(right) < 1e-6, "빨간 축은 화면 오른쪽");
assert.ok(localY.distanceTo(up) < 1e-6, "초록 축은 화면 위");
assert.ok(localZ.distanceTo(outOfScreen) < 1e-6, "파란 축은 화면 밖, 고리는 화면에 평행");

console.log("abutment direct edit ok");
