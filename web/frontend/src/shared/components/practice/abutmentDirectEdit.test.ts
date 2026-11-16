import assert from "node:assert/strict";

import * as THREE from "three";

import { cuffProfile } from "../../practice/cuffProfile";
import {
  applyWorldDeltaToAbutmentEdit,
  applyWorldRotationToAbutmentEdit,
  buildAbutmentPreferenceUpdate,
  clampAbutmentEdit,
  identityAbutmentEdit,
  makeGumball,
  measureEditedAbutment,
  refitLocalPositions,
  regenerateCuffToMargin,
  screenGumballQuaternion,
  sculptFalloff,
  writeAttribute,
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
  centerL: 0,
  centerM: 0,
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
assert.equal(limited.scale[0], 1.45);
assert.equal(limited.scale[1], 0.65);
assert.ok(limited.heightMm <= 2.5 && limited.shiftLabialMm === 2.5 && limited.yawDeg === 30);
const steep = edit({ tiltLabialDeg: 80 });
clampAbutmentEdit(steep, 8);
assert.ok(Math.abs(steep.tiltLabialDeg) <= 25 + 1e-6, "기울기는 허용 각도(25°) 안");

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

// 회전(yaw)이 이미 적용된 상태에서도 화살표 이동과 축 회전 기울기 부호가 화면 드래그 방향과 정확히 일치하는지 검증
{
  const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const movedAfterYaw = edit({ yawDeg: 90 });
  applyWorldDeltaToAbutmentEdit(movedAfterYaw, new THREE.Vector3(1, 0, 0), axes);
  const beforePt = one([2, 0, 6], edit({ yawDeg: 90 }));
  const afterPt = one([2, 0, 6], movedAfterYaw);
  assert.ok(Math.abs(afterPt[0]! - beforePt[0]! - 1) < 1e-4, "회전 후에도 +X 화살표 이동은 +X로 이동");
  assert.ok(Math.abs(afterPt[1]! - beforePt[1]!) < 1e-4, "회전 후에도 +X 화살표 이동이 Y로 틀어지지 않음");

  // 화면 밖(+Z_cam = +axes[1] 가정: 협측 정면 뷰에서 파란 고리 반시계 회전 = 상단이 왼쪽(-X)으로 기울어짐)
  // 오른손 법칙: worldAxis = +Y 주위로 +10° 회전하면 +Z 정점(0, 0, h)은 +Y × +Z = +X 방향으로 이동해야 한다.
  const rotY = edit();
  applyWorldRotationToAbutmentEdit(rotY, new THREE.Vector3(0, 1, 0), 10, axes);
  const topRotY = one([1, 0, 6.6], rotY);
  assert.ok(topRotY[0]! > 1.7 && Math.abs(topRotY[1]!) < 1e-4, "+Y 축 오른손 회전은 상단을 +X로 기울인다");

  // 오른손 법칙: worldAxis = +X 주위로 +10° 회전하면 +Z 정점(1, 0, h)은 +X × +Z = -Y 방향으로 이동해야 한다.
  const rotX = edit();
  applyWorldRotationToAbutmentEdit(rotX, new THREE.Vector3(1, 0, 0), 10, axes);
  const topRotX = one([1, 0, 6.6], rotX);
  assert.ok(topRotX[1]! < -0.7 && Math.abs(topRotX[0]! - 1) < 1e-4, "+X 축 오른손 회전은 상단을 -Y로 기울인다");

  // 좌수계 사분면(#38 하악 좌측: labial = +X, mesial = -Y, axis = +Z → labial × mesial = -Z)에서도
  // 화면 밖(협측 +X) 주위로 반시계(+10°) 회전하면 상단(+Z)이 화면 왼쪽(근심, -Y)으로 정확히 기울어야 한다.
  const leftHandAxes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const leftHandZone = { ...zone, screwR: 0, labial: [1, 0] as [number, number], mesial: [0, -1] as [number, number] };
  const rot38 = edit();
  applyWorldRotationToAbutmentEdit(rot38, new THREE.Vector3(1, 0, 0), 10, leftHandAxes);
  const out38 = new Float32Array(3);
  refitLocalPositions(new Float32Array([1.5, 0, 6.6]), rot38, leftHandZone, out38);
  assert.ok(out38[1]! < -0.7 && Math.abs(out38[0]! - 1.5) < 1e-4, "#38 좌수계 협측 뷰에서도 반시계 회전이 화면 왼쪽(근심)으로 기울인다");
}

// 정점 배열 크기가 솔리드 ↔ 스크류 홀 부울 메시로 바뀔 때 normal 버퍼 크기가 어긋나지 않는지 검증
{
  const geo = new THREE.BufferGeometry();
  writeAttribute(geo, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  assert.equal(geo.getAttribute("normal")?.count, 3);
  writeAttribute(
    geo,
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]),
  );
  assert.equal(geo.getAttribute("position")?.count, 6);
  assert.equal(geo.getAttribute("normal")?.count, 6, "정점 개수 변경 시 normal 버퍼도 새 크기로 재생성된다");
}

// 검볼 스케일 핸들(빨간 X 상자, 초록 Y 상자, 노란 XY 평면)이 다른 핸들에 가리지 않고 정면 광선에 잡히는지 검증
{
  const gb = makeGumball("38");
  gb.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const checkRay = (x: number, y: number, expectedOp: string) => {
    rc.set(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1));
    const hits = rc.intersectObject(gb, true);
    assert.ok(hits.length > 0, `(${x}, ${y}) 광선이 검볼에 맞는다`);
    const found = hits.some((h) => h.object.userData.editHandle?.op === expectedOp);
    assert.ok(found, `(${x}, ${y})에서 ${expectedOp} 핸들이 잡힌다`);
  };
  checkRay(0.47, 0, "scale");
  checkRay(0, 0.47, "scale");
  checkRay(0.41, 0.41, "scale2");
}

// 검볼이 마진을 옮기면 커프는 그 마진까지 오목하게 다시 깔리고, 콘·포스트·스크류 벽은 그대로다.
{
  const count = 8;
  const proposalMargin = new Float32Array(count * 3);
  const fittedMargin = new Float32Array(count * 3);
  for (let col = 0; col < count; col += 1) {
    const angle = (col / count) * Math.PI * 2;
    const shifted = col === 0;
    proposalMargin[col * 3] = Math.cos(angle) * 3;
    proposalMargin[col * 3 + 1] = Math.sin(angle) * 3;
    proposalMargin[col * 3 + 2] = 3;
    fittedMargin[col * 3] = Math.cos(angle) * (shifted ? 4 : 3);
    fittedMargin[col * 3 + 1] = Math.sin(angle) * (shifted ? 4 : 3);
    fittedMargin[col * 3 + 2] = shifted ? 3.6 : 3;
  }
  const proposal = new Float32Array([
    2, 0, 1,
    cuffProfile(2, 1, 3, 3)(2), 0, 2,
    3, 0, 3,
    2.5, 0, 5,
    0.2, 0, 2,
  ]);
  const fitted = new Float32Array(proposal);
  regenerateCuffToMargin(proposal, fitted, proposalMargin, fittedMargin, {
    ...zone,
    screwR: 0.5,
    coneTopR: 2,
  });
  assert.ok(Math.abs(fitted[0]! - 2) < 1e-6 && Math.abs(fitted[2]! - 1) < 1e-6, "콘 링은 그대로");
  assert.ok(Math.abs(fitted[6]! - 3) < 1e-6 && Math.abs(fitted[8]! - 3) < 1e-6, "마진 정점은 커프 재생성이 그대로 둔다");
  assert.ok(Math.abs(fitted[9]! - 2.5) < 1e-6 && Math.abs(fitted[11]! - 5) < 1e-6, "포스트는 그대로");
  assert.ok(Math.abs(fitted[12]! - 0.2) < 1e-6 && Math.abs(fitted[14]! - 2) < 1e-6, "스크류 벽은 그대로");
  const z2 = 1 + 0.5 * (3.6 - 1);
  const radius = cuffProfile(2, 1, 4, 3.6)(z2);
  const chord = 2 + (4 - 2) * ((z2 - 1) / (3.6 - 1));
  assert.ok(radius < chord - 0.02, "커프는 직선보다 오목하다");
  assert.ok(Math.abs(fitted[3]! - radius) < 1e-4, "커프 반지름은 마진까지 단면을 따른다");
  assert.ok(Math.abs(fitted[4]!) < 1e-4, "순측 마진으로 커프가 따라간다");
  assert.ok(Math.abs(fitted[5]! - z2) < 1e-4, "커프 높이는 지금 마진 높이에 맞춘다");
}

{
  const margin = new Float32Array([3, 0, 2, 0, 3, 2, -3, 0, 2]);
  const solid = new Float32Array([0, 0, 0, 3, 0, 6, 1, 0, 3]);
  const measured = measureEditedAbutment(solid, margin, null);
  assert.ok(measured);
  assert.ok(Math.abs(measured.maxDiameterMm - 6) < 1e-6, "최대 직경");
  assert.ok(Math.abs(measured.cuffHeightMinMm - 2) < 1e-6 && Math.abs(measured.cuffHeightMaxMm - 2) < 1e-6, "커프 높이");
  assert.ok(Math.abs(measured.postHeightMm - 4) < 1e-6, "포스트 높이");
  assert.equal(measured.crownOverPostMm, null);
}

// 비색인 삼각형 수프에서 매끄러운 축벽은 정점 법선이 일치하고, 90° 날카로운 모서리(스크류 홀 테두리 등)는 법선이 분리되는지 검증
{
  // 완만하게 꺾인 두 사각 패치(사잇각 ~10°) + 90° 윗면 캡
  const rad10 = (10 * Math.PI) / 180;
  const x2 = 1 + Math.cos(rad10);
  const y2 = Math.sin(rad10);
  const geo = new THREE.BufferGeometry();
  writeAttribute(
    geo,
    new Float32Array([
      // 왼쪽 축벽 삼각형 (x=0..1, y=0, z=0..2) -> 법선 (0, -1, 0)
      0, 0, 0, 1, 0, 0, 1, 0, 2,
      // 오른쪽 축벽 삼각형 (x=1..x2, y=0..y2, z=0..2), 정점 (1,0,0)·(1,0,2) 공유
      1, 0, 0, x2, y2, 0, 1, 0, 2,
      // 90° 꺾인 윗면 캡 삼각형 (z=2), 정점 (1,0,2) 공유 -> 법선 (0, 0, 1)
      0, 0, 2, 1, 0, 2, 0, 1, 2,
    ]),
  );
  const n = geo.getAttribute("normal")!.array as Float32Array;
  // 축벽 공유 정점 (1,0,2): tri0 corner2 (idx 6..8) vs tri1 corner2 (idx 15..17) -> 완전히 일치해야 함
  const dotSmooth = n[6]! * n[15]! + n[7]! * n[16]! + n[8]! * n[17]!;
  assert.ok(dotSmooth > 0.9999, "축벽 공유 정점은 매끄럽게 병합된 법선을 갖는다");
  // 90° 캡 정점 (1,0,2): tri2 corner1 (idx 21..23) -> 윗면 법선 (0,0,1)을 유지해 모서리가 뭉개지지 않음
  assert.ok(n[23]! > 0.99, "날카로운 윗면 모서리는 축벽 법선과 섞이지 않는다");
}

// 높이 이동 + 수직 스케일 동시 편집 시에도 포스트 상단이 평탄하게 잘리지 않고 선형 비례를 유지하는지 검증
{
  const src = new Float32Array([
    2.2, 0, 3.0,
    2.1, 0, 5.0,
    2.0, 0, 7.0,
    1.9, 0, 9.0,
  ]);
  const out = new Float32Array(src.length);
  refitLocalPositions(src, edit({ heightMm: 1.8, scale: [1, 1, 1.35] }), { ...zone, screwR: 0 }, out);
  const dz1 = out[5]! - out[2]!;
  const dz2 = out[8]! - out[5]!;
  const dz3 = out[11]! - out[8]!;
  assert.ok(dz3 > 0.5 && Math.abs(dz1 - dz2) < 1e-4 && Math.abs(dz2 - dz3) < 1e-4, "상단 링 간격이 0으로 찌그러지지 않고 등간격을 유지한다");
}

console.log("abutment direct edit ok");
