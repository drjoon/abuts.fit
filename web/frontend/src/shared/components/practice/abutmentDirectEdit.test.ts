import assert from "node:assert/strict";

import * as THREE from "three";

import { cuffProfile } from "../../practice/cuffProfile";
import { resolveCustomAbutmentConnectionSpec } from "../../practice/customAbutmentScanbodyMatch";
import {
  designCustomAbutmentCandidates,
  designCustomAbutmentStl,
  resolveScrewChannelProfile,
} from "../../practice/customAbutmentStlDesign";
import {
  computeOptimalPostHeightMmFromTaper,
  postRetentionSurface,
} from "../../practice/customAbutmentDesignParams";
import { getToothAnatomy } from "../../practice/toothAnatomy";
import { computeParamsFromInfoFieldEdit } from "./PracticeCustomAbutmentDesignTree";
import {
  AbutmentDirectEditSession,
  GUMBALL_SIZE_PX,
  applyWorldDeltaToAbutmentEdit,
  applyWorldRotationToAbutmentEdit,
  buildAbutmentPreferenceUpdate,
  clampAbutmentEdit,
  identityAbutmentEdit,
  gumballPatchSetsPostHeight,
  makeGumball,
  normalizeAbutmentEdit,
  retainLiveGumballParams,
  measureEditedAbutment,
  refitLocalPositions,
  regenerateCuffToMargin,
  orientGumballScreenAxes,
  screenGumballQuaternion,
  sculptFalloff,
  writeAttribute,
  type AbutmentEdit,
  type AbutmentEditSummary,
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
assert.ok(Math.abs(wall[0]! - 0.64) < 1e-3, "스크류 벽 최소 두께(0.3mm 이상)를 넘지 않음");

const linear = one([2, 1, 6], edit({ scale: [1.1, 1, 1] }));
assert.ok(Math.abs(linear[0]! - 2.2) < 1e-4, "선형은 순측만");
assert.ok(Math.abs(linear[1]! - 1) < 1e-4, "근심은 선형에서 그대로");

const planar = one([2, 1, 6], edit({ scale: [1.1, 1.2, 1] }));
assert.ok(Math.abs(planar[0]! - 2.2) < 1e-4 && Math.abs(planar[1]! - 1.2) < 1e-4, "평면은 두 축");

const solid = one([2, 0, 6], edit({ scale: [1, 1, 1], heightMm: 1 }));
assert.ok(Math.abs(solid[2]! - 7) < 1e-4, "높이 이동");

const tiltDeg = 12;
const tiltedPair = many([2, 0, 6, -2, 0, 6, 2.5, 0, 3, 0, 0, 3], edit({ tiltLabialDeg: tiltDeg }));
assert.ok(
  tiltedPair[0]! > 2.3 && tiltedPair[2]! < 6 - 0.3,
  "피니시라인 중앙 기준 기울기에서 순측 상단은 내려간다",
);
assert.ok(tiltedPair[5]! > 6 + 0.3, "반대쪽(설측) 상단은 올라간다");
assert.ok(
  Math.abs(tiltedPair[9]!) < 1e-4 &&
    Math.abs(tiltedPair[10]!) < 1e-4 &&
    Math.abs(tiltedPair[11]! - 3) < 1e-4,
  "피니시라인 중앙은 회전 힌지로 고정된다",
);
assert.ok(Math.abs(tiltedPair[8]! - 3) > 0.05, "중앙이 아닌 마진 링은 강체 회전으로 함께 움직인다");
{
  const before = [
    [2, 0, 6],
    [-2, 0, 6],
    [2.5, 0, 3],
  ];
  const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  for (let i = 0; i < before.length; i += 1) {
    for (let j = i + 1; j < before.length; j += 1) {
      const afterI = [tiltedPair[i * 3]!, tiltedPair[i * 3 + 1]!, tiltedPair[i * 3 + 2]!];
      const afterJ = [tiltedPair[j * 3]!, tiltedPair[j * 3 + 1]!, tiltedPair[j * 3 + 2]!];
      assert.ok(
        Math.abs(dist(before[i]!, before[j]!) - dist(afterI, afterJ)) < 1e-3,
        "기울인 포스트 점 사이 거리가 유지되어 표면이 꼬이지 않는다",
      );
    }
  }
}
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

const widened = edit({ scale: [1.18, 1.12, 1.04], heightMm: 0.4 });
const clearancePatch = { occlusalClearanceMm: 1.2, postHeightOffsetMm: 0 };
const clearanceMerged = {
  postWidthScale: 1.2,
  postHeightOffsetMm: 0.4,
  occlusalClearanceMm: 1.05,
  marginFilletRadiusMm: 0.8,
  ...clearancePatch,
};
const widthKept = retainLiveGumballParams(
  clearanceMerged,
  { postWidthScale: 1, postHeightOffsetMm: 0 },
  widened,
  clearancePatch,
);
assert.equal(widthKept.postWidthScale, 1, "대합 거리를 고쳐도 검볼 굵기 배율은 생성값에 다시 넣지 않는다");
assert.equal(widthKept.postHeightOffsetMm, 0, "대합 거리 패치의 높이 보정은 유지한다");
assert.equal(widthKept.marginFilletRadiusMm, 0.8, "다른 항목은 그대로다");
assert.equal(widthKept.occlusalClearanceMm, 1.2);
assert.equal(gumballPatchSetsPostHeight(clearancePatch), true);
const marginPatch = { marginFilletRadiusMm: 0.9 };
const marginMerged = {
  postWidthScale: 1.2,
  postHeightOffsetMm: 0.4,
  marginFilletRadiusMm: 0.7,
  ...marginPatch,
};
const marginKept = retainLiveGumballParams(
  marginMerged,
  { postWidthScale: 1, postHeightOffsetMm: 0 },
  widened,
  marginPatch,
);
assert.equal(marginKept.postWidthScale, 1);
assert.equal(marginKept.postHeightOffsetMm, 0, "높이를 안 바꾸는 수정은 검볼 높이 보정을 생성에 중복하지 않는다");
assert.equal(marginKept.marginFilletRadiusMm, 0.9);
assert.equal(gumballPatchSetsPostHeight(marginPatch), false);
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

{
  const oR = new THREE.Vector3();
  const oU = new THREE.Vector3();
  const oF = new THREE.Vector3();
  const postDown = new THREE.Vector3(0, 0, -1);
  assert.equal(
    orientGumballScreenAxes(right, up, outOfScreen, postDown, oR, oU, oF),
    true,
    "포스트가 화면 아래로 길어지면 검볼을 180° 돌린다",
  );
  screenGumballQuaternion(oR, oU, oF, q);
  const downY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const stillZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  assert.ok(downY.distanceTo(up.clone().negate()) < 1e-6, "초록 점은 포스트가 길어지는 화면 아래");
  assert.ok(stillZ.distanceTo(outOfScreen) < 1e-6, "180° 뒤에도 파란 축은 화면 밖");
  const postUp = new THREE.Vector3(0, 0, 1);
  assert.equal(orientGumballScreenAxes(right, up, outOfScreen, postUp, oR, oU, oF), false);
  assert.ok(oU.distanceTo(up) < 1e-6, "포스트가 화면 위면 초록 점은 위에 둔다");
  const almostLevel = new THREE.Vector3(0, 0.98, -0.1).normalize();
  assert.equal(
    orientGumballScreenAxes(right, up, outOfScreen, almostLevel, oR, oU, oF),
    false,
    "화면과 거의 나란한 포스트는 뒤집지 않는다",
  );
}

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
  assert.ok(
    topRotY[0]! > 1.45 && Math.abs(topRotY[1]!) < 1e-4 && topRotY[2]! < 6.6 - 0.1,
    "+Y 축 오른손 회전은 상단을 +X로 기울이고 +X 모서리를 낮춘다",
  );

  // 오른손 법칙: worldAxis = +X 주위로 +10° 회전하면 +Z 정점(1, 0, h)은 +X × +Z = -Y 방향으로 이동해야 한다.
  const rotX = edit();
  applyWorldRotationToAbutmentEdit(rotX, new THREE.Vector3(1, 0, 0), 10, axes);
  const topRotX = one([1, 0, 6.6], rotX);
  const pivot = [0, 0, 3];
  const beforeX = [1, 0, 6.6];
  const afterX = [topRotX[0]!, topRotX[1]!, topRotX[2]!];
  const distPivot = (p: number[]) => Math.hypot(p[0]! - pivot[0]!, p[1]! - pivot[1]!, p[2]! - pivot[2]!);
  assert.ok(
    topRotX[1]! < -0.45 && Math.abs(distPivot(beforeX) - distPivot(afterX)) < 1e-3,
    "+X 축 오른손 회전은 상단을 -Y로 기울이고 피니시라인 중앙까지의 거리를 유지한다",
  );

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
  assert.ok(out38[1]! < -0.45 && Math.abs(out38[0]! - 1.5) < 1e-4, "#38 좌수계 협측 뷰에서도 반시계 회전이 화면 왼쪽(근심)으로 기울인다");
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

// 검볼 스케일(+축 점·노란 2D 점)·이동(1사분면 코너) 핸들이 다른 핸들에 가리지 않고 정면 광선에 잡히는지 검증
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
  checkRay(0.42, 0, "scale");
  checkRay(0, 0.42, "scale");
  checkRay(0.36, 0.36, "scale2");
  checkRay(0.66, 0.66, "move2");
  checkRay(-0.51, -0.51, "rot");
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

// #36 대구치에서 협측 대합치가 낮고 설측 대합치가 높은 경우:
// 1) 초기 생성부터 포스트 최상단은 평평한 면(교합 방향 2° 이내)이고 최단 거리는 설정값(1.3 / 1.5mm)에 맞춰진다.
// 2) 파란 회전 툴로 각도를 돌릴 때도 마진 왜곡·음수 테이퍼 없이 평평한 상단 각도가 회전하며 최단 대합 거리가 유지된다.
{
  const makeGridSurface = (
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    steps: number,
    zFn: (x: number, y: number) => number,
  ) => {
    const tris: number[] = [];
    const dx = (xMax - xMin) / steps;
    const dy = (yMax - yMin) / steps;
    for (let ix = 0; ix < steps; ix += 1) {
      for (let iy = 0; iy < steps; iy += 1) {
        const x0 = xMin + ix * dx;
        const x1 = x0 + dx;
        const y0 = yMin + iy * dy;
        const y1 = y0 + dy;
        const z00 = zFn(x0, y0);
        const z10 = zFn(x1, y0);
        const z11 = zFn(x1, y1);
        const z01 = zFn(x0, y1);
        tris.push(x0, y0, z00, x1, y0, z10, x1, y1, z11);
        tris.push(x0, y0, z00, x1, y1, z11, x0, y1, z01);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
    geo.computeVertexNormals();
    return geo;
  };

  // 하악 치은 스캔 (평균 치은 높이 z ≈ 3.2mm)
  const jawGeo = makeGridSurface(-12, 12, -12, 12, 32, (x, y) => {
    const r = Math.hypot(x, y);
    return 3.2 - 0.4 * Math.exp(-(r * r) / 8);
  });

  // 대합치(#26): 협측(+X)은 낮고(z ≈ 9.2mm) 설측(-X)으로 갈수록 높아지는(기울기 ~16°) 교합면
  const oppSlope = -Math.tan((16 * Math.PI) / 180);
  const oppZAt = (x: number, y: number) => 10.2 + oppSlope * x + 0.03 * y * y;
  const oppGeo = makeGridSurface(-8, 8, -8, 8, 28, oppZAt);

  const fixture36 = {
    toothNumber: "36",
    jaw: "lower" as const,
    fixturePose: {
      origin: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      hexX: [1, 0, 0] as [number, number, number],
      hexY: [0, 1, 0] as [number, number, number],
    },
    scanbodyTop: [0, 0, 7] as [number, number, number],
    scanbodyRadiusMm: 2.25,
    scanbodyHeightMm: 7.0,
    gingivaFloorMm: 2.8,
    rmsMm: 0.02,
    topCoverage: 0.95,
    matchedLibraryLabel: "지오메디 Ø4.5×7mm",
    connectionSpec: {
      manufacturer: "NEOBIOTECH",
      brand: "IS2",
      family: "IS",
      type: "Hex",
      originDiameterMm: 3.5,
      hexSizeMm: 2.5,
      l2Mm: 2.75,
      prcConeTopMm: 1.0,
      screwLowerDiameterMm: 2.0,
      screwUpperDiameterMm: 2.4,
    },
    archOcclusalDir: [0, 0, 1] as [number, number, number],
    labialDir: [1, 0, 0] as [number, number, number],
    mesialDir: [0, 1, 0] as [number, number, number],
  };

  for (const targetClear of [1.3, 1.5]) {
    const designed = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: oppGeo,
      params: { occlusalClearanceMm: targetClear },
    });
    assert.ok(designed.metrics.occlusalClearanceMm != null, "대합 거리가 측정된다");
    assert.ok(
      Math.abs(designed.metrics.occlusalClearanceMm! - targetClear) <= 0.08,
      `최단 대합 거리(${designed.metrics.occlusalClearanceMm}mm)가 설정값(${targetClear}mm)에 맞춰진다`,
    );

    // 교합면은 2° 안에서 대합 경사를 따른다. 홈처럼 눕히지 않으므로 협·설 거리는 약 0.7mm까지 벌어진다.
    const solid = designed.solidBodyLocalPositions!;
    let topZMax = -Infinity;
    for (let i = 2; i < solid.length; i += 3) topZMax = Math.max(topZMax, solid[i]!);
    let topCx = 0;
    let topCn = 0;
    for (let i = 0; i < solid.length; i += 3) {
      if (solid[i + 2]! < topZMax - 2.0) continue;
      topCx += solid[i]!;
      topCn += 1;
    }
    topCx = topCn > 0 ? topCx / topCn : 0;
    let minBuccalGap = Infinity;
    let minLingualGap = Infinity;
    for (let i = 0; i < solid.length; i += 3) {
      const x = solid[i]!;
      const y = solid[i + 1]!;
      const z = solid[i + 2]!;
      if (z < topZMax - 2.4 || Math.abs(y) > 0.8) continue;
      const dx = x - topCx;
      if (dx > 1.2 && dx < 2.8) minBuccalGap = Math.min(minBuccalGap, oppZAt(x, y) - z);
      if (dx < -1.2 && dx > -2.8) minLingualGap = Math.min(minLingualGap, oppZAt(x, y) - z);
    }
    assert.ok(
      Number.isFinite(minBuccalGap) &&
        Number.isFinite(minLingualGap) &&
        Math.abs(minBuccalGap - minLingualGap) < 0.75,
      `초기 생성 포스트 상단의 협측(${minBuccalGap.toFixed(2)}mm)·설측(${minLingualGap.toFixed(2)}mm) 대합 거리가 비슷하다`,
    );

    if (targetClear === 1.5) {
      // 파란 회전 툴 세션 검증: 회전 후에도 테이퍼 양수, 직경 폭증 없음, 최단 대합 거리 ~1.5mm 유지
      const scene = new THREE.Scene();
      const mesh = new THREE.Mesh(designed.worldGeometry.clone(), new THREE.MeshBasicMaterial());
      scene.add(mesh);
      let lastSummary: AbutmentEditSummary | null = null;
      const session = new AbutmentDirectEditSession({
        getScene: () => scene,
        getCamera: () => null,
        getRenderer: () => null,
        getHost: () => null,
        getDesigns: () => [designed],
        getAbutment: () => mesh,
        getCrown: () => undefined,
        getMargin: () => undefined,
        getOpposingGeometry: () => oppGeo,
        ui: {
          gumballOn: true,
          sculptOn: false,
          radiusMm: 2.4,
          readOnly: false,
          selected: "36",
          visible: { "36": true },
          expanded: { "36": true },
        },
        onBadge: () => {},
        onCommit: (s) => {
          lastSummary = s;
        },
        onShape: (s) => {
          lastSummary = s;
        },
        onHistory: () => {},
      });
      session.sync();
      // 세션 내부 edit에 직접 회전(양방향 -12°, +12°)을 걸어 show 검증
      const internalEdits = session as unknown as {
        edits: Map<string, AbutmentEdit>;
        show: (t: string, b: boolean, s?: boolean) => void;
      };
      for (const deg of [-12, 12]) {
        internalEdits.edits.set("36", edit({ tiltLabialDeg: deg }));
        internalEdits.show("36", false);
        assert.ok(lastSummary?.measured != null, "회전 중 측정값이 계산된다");
        const mRot = lastSummary!.measured!;
        assert.ok(
          mRot.postTaperDeg > 0.3,
          `${deg}° 회전 후에도 음수 언더컷 없이 양수 테이퍼(${mRot.postTaperDeg.toFixed(1)}°) 유지`,
        );
        assert.ok(
          mRot.maxDiameterMm < designed.metrics.maxDiameterMm + 1.2,
          `${deg}° 회전 후에도 최대 직경(${mRot.maxDiameterMm.toFixed(2)}mm)이 마진 바깥으로 폭증하지 않는다`,
        );
        assert.ok(
          mRot.occlusalClearanceMm != null && Math.abs(mRot.occlusalClearanceMm - 1.5) <= 0.12,
          `${deg}° 회전 후에도 최단 대합 거리(${mRot.occlusalClearanceMm}mm)가 설정값(1.5mm)에 맞춰 유지된다`,
        );
      }
      session.dispose();
    }
  }

  // 대합치(#26)가 협측으로 치우쳐 설측 끝(x < -1.2mm)에 대합 스캔이 비어 있는 경우(첨1 케이스)에도
  // 빈 열 때문에 상단이 반대로 기울지 않고 협측·중央·설측 경사를 따라 평평하게 정렬되는지 검증
  const partialOppGeo = makeGridSurface(-1.2, 7.5, -8, 8, 24, oppZAt);
  const partialDesigned = await designCustomAbutmentStl({
    fixture: fixture36,
    jawGeometry: jawGeo,
    opposingGeometry: partialOppGeo,
    params: { occlusalClearanceMm: 1.3 },
  });
  assert.ok(
    partialDesigned.metrics.occlusalClearanceMm != null &&
      Math.abs(partialDesigned.metrics.occlusalClearanceMm - 1.3) <= 0.08,
    `부분 대합 스캔에서도 최단 대합 거리(${partialDesigned.metrics.occlusalClearanceMm}mm)가 1.3mm에 맞춰진다`,
  );
  {
    const solid = partialDesigned.solidBodyLocalPositions!;
    let topZMax = -Infinity;
    for (let i = 2; i < solid.length; i += 3) topZMax = Math.max(topZMax, solid[i]!);
    let buccalTopZ = -Infinity;
    let lingualTopZ = -Infinity;
    for (let i = 0; i < solid.length; i += 3) {
      const x = solid[i]!;
      const y = solid[i + 1]!;
      const z = solid[i + 2]!;
      if (Math.abs(y) > 0.8 || z < topZMax - 2.6) continue;
      if (x > 1.8 && x < 2.8) buccalTopZ = Math.max(buccalTopZ, z);
      if (x < -0.6 && x > -1.5) lingualTopZ = Math.max(lingualTopZ, z);
    }
    assert.ok(
      lingualTopZ > buccalTopZ + 0.35,
      `설측 대합 스캔 일부가 비어 있어도 설측 상단(${lingualTopZ.toFixed(2)}mm)이 협측 상단(${buccalTopZ.toFixed(2)}mm)보다 높게 기울어 대합치 경사를 따른다`,
    );
  }

  // 3) 넓은 악간 거리 + 기존 postHeightOffsetMm(-2.49 / +3.0)이 남아 있는 상태에서도
  // 어벗 정보의 대합 거리를 1 → 3 → 0.5 → 2.0mm로 바꾸면 포스트 높이와 최단 대합 거리가 즉시 함께 변한다.
  {
    const tallOppGeo = makeGridSurface(-8, 8, -8, 8, 28, (x, y) => 13.4 + oppSlope * x + 0.03 * y * y);
    const basePref = { postHeightOffsetMm: -2.49, postWidthScale: 1.08 };
    const initial = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: tallOppGeo,
      params: basePref,
    });
    const patch1 = computeParamsFromInfoFieldEdit(initial, "occlusalClearanceMm", 1);
    const at1 = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: tallOppGeo,
      params: { ...basePref, ...patch1 },
    });
    const patch3 = computeParamsFromInfoFieldEdit(at1, "occlusalClearanceMm", 3);
    const at3 = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: tallOppGeo,
      params: { ...basePref, ...patch1, ...patch3 },
    });
    assert.ok(
      at1.metrics.occlusalClearanceMm != null && Math.abs(at1.metrics.occlusalClearanceMm - 1.0) <= 0.08,
      `대합 거리 1mm 입력 시 최단 대합 거리(${at1.metrics.occlusalClearanceMm}mm)가 1.0mm에 맞춰진다`,
    );
    assert.ok(
      at3.metrics.occlusalClearanceMm != null && Math.abs(at3.metrics.occlusalClearanceMm - 3.0) <= 0.08,
      `대합 거리 3mm 입력 시 최단 대합 거리(${at3.metrics.occlusalClearanceMm}mm)가 3.0mm에 맞춰진다`,
    );
    assert.ok(
      at1.metrics.postHeightMm - at3.metrics.postHeightMm > 1.75,
      `대합 거리 1mm(${at1.metrics.postHeightMm}mm) → 3mm(${at3.metrics.postHeightMm}mm) 변경 시 포스트 길이가 실제로 줄어든다`,
    );

    // postHeightOffsetMm=+3, occlusalClearanceMm=3.5로 0.7mm에 걸려 있던 상태에서:
    // 0.5mm 입력 시 최소 하한 0.7mm로 보호되고, 7.5mm(기존 상한 6mm 초과) 입력도 제한 없이 적용된다.
    const hiOppGeo = makeGridSurface(-8, 8, -8, 8, 28, () => 14.5);
    const stuckAt07 = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: hiOppGeo,
      params: { occlusalClearanceMm: 3.5, postHeightOffsetMm: 9 },
    });
    const patch05 = computeParamsFromInfoFieldEdit(stuckAt07, "occlusalClearanceMm", 0.5);
    assert.equal(patch05.occlusalClearanceMm, 0.7, "대합 거리는 최소 0.7mm 아래로 내려가지 않는다");
    const at07 = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: hiOppGeo,
      params: { occlusalClearanceMm: 3.5, postHeightOffsetMm: 9, ...patch05 },
    });
    const patch75 = computeParamsFromInfoFieldEdit(stuckAt07, "occlusalClearanceMm", 7.5);
    assert.equal(patch75.occlusalClearanceMm, 7.5, "대합 거리는 상한 없이 7.5mm도 그대로 반영된다");
    const at75 = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: hiOppGeo,
      params: { occlusalClearanceMm: 3.5, postHeightOffsetMm: 9, ...patch75 },
    });
    assert.ok(
      at07.metrics.occlusalClearanceMm != null && Math.abs(at07.metrics.occlusalClearanceMm - 0.7) <= 0.08,
      `0.5mm 입력 시 최소값 0.7mm로 클램프되어 최단 대합 거리(${at07.metrics.occlusalClearanceMm}mm)가 0.7mm로 맞춰진다`,
    );
    assert.ok(
      at75.metrics.occlusalClearanceMm != null && Math.abs(at75.metrics.occlusalClearanceMm - 7.5) <= 0.12,
      `상한 없이 7.5mm로 올리면 최단 대합 거리(${at75.metrics.occlusalClearanceMm}mm)가 7.5mm로 맞춰진다`,
    );
  }

  // 4) 중앙 와는 높고 협·설 교두가 상단 라운드 테두리 위로 낮게 내려온 대합치에서도
  // 설정한 대합 거리(0.7mm)가 상단 테두리까지 실제 3D 거리로 확보된다(0.7mm보다 짧게 파고들지 않는다).
  {
    const cuspZAt = (x: number, y: number) => {
      // 중앙 와(x=0)는 z=11.0으로 높고, |x|≈2.4mm 협·설 교두가 z=9.7로 내려오는 형태
      const cuspDrop = 1.3 * Math.exp(-((Math.abs(x) - 2.35) ** 2) / 0.55);
      return 11.0 - cuspDrop + 0.03 * y * y;
    };
    const cuspOppGeo = makeGridSurface(-7, 7, -7, 7, 48, cuspZAt);
    const cuspDesigned = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: cuspOppGeo,
      params: { occlusalClearanceMm: 0.7 },
    });
    assert.ok(
      cuspDesigned.metrics.occlusalClearanceMm != null &&
        Math.abs(cuspDesigned.metrics.occlusalClearanceMm - 0.7) <= 0.08,
      `협·설 돌출 교두 대합치에서도 최단 대합 거리(${cuspDesigned.metrics.occlusalClearanceMm}mm)가 0.7mm에 맞춰진다`,
    );
    const solid = cuspDesigned.solidBodyLocalPositions!;
    let zMax = -Infinity;
    for (let i = 2; i < solid.length; i += 3) zMax = Math.max(zMax, solid[i]!);
    let minTrue3DGap = Infinity;
    for (let i = 0; i < solid.length; i += 3) {
      const px = solid[i]!;
      const py = solid[i + 1]!;
      const pz = solid[i + 2]!;
      if (pz < zMax - 0.8) continue;
      for (let dx = -0.8; dx <= 0.8001; dx += 0.1) {
        for (let dy = -0.8; dy <= 0.8001; dy += 0.1) {
          const oz = cuspZAt(px + dx, py + dy);
          const dz = oz > pz ? oz - pz : 0;
          const d3 = oz < pz && dx === 0 && dy === 0 ? oz - pz : Math.hypot(dx, dy, dz);
          if (d3 < minTrue3DGap) minTrue3DGap = d3;
        }
      }
    }
    assert.ok(
      minTrue3DGap >= 0.62,
      `포스트 상단 라운드 테두리의 실제 3D 최단 대합 거리(${minTrue3DGap.toFixed(2)}mm)도 0.7mm 근처로 확보된다`,
    );
  }

  // 5) 포스트 높이·테이퍼 연결 링크(최적 접착력 자동 조절) 및 싱글/브리지 메타데이터 반영 검증
  {
    const flatOppTall = makeGridSurface(-8, 8, -8, 8, 28, () => 11.4);
    const flatOppShort = makeGridSurface(-8, 8, -8, 8, 28, () => 6.4);

    const singleWorks = [
      {
        toothNumber: "36",
        prosthesisType: "크라운",
        customAbutment: true,
        bridgeLinkedTeeth: [] as string[],
      },
    ];
    const bridgeWorks = [
      {
        toothNumber: "35",
        prosthesisType: "브리지",
        customAbutment: true,
        bridgeLinkedTeeth: ["35", "36", "37"],
      },
      {
        toothNumber: "36",
        prosthesisType: "브리지",
        customAbutment: true,
        bridgeLinkedTeeth: ["35", "36", "37"],
      },
      {
        toothNumber: "37",
        prosthesisType: "결손",
        customAbutment: false,
        bridgeLinkedTeeth: ["35", "36", "37"],
      },
    ];

    const singleTall = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppTall,
      toothWorks: singleWorks,
    });
    const singleShort = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppShort,
      toothWorks: singleWorks,
    });
    assert.equal(singleTall.metrics.isBridge, false, "크라운 메타데이터는 싱글로 판별된다");
    assert.ok(
      singleShort.metrics.postTaperDeg >= 2.0,
      `짧은 포스트(${singleShort.metrics.postHeightMm}mm)에서도 테이퍼(${singleShort.metrics.postTaperDeg}°)는 최소 2° 이상이다`,
    );
    assert.ok(
      singleTall.metrics.postHeightMm > singleShort.metrics.postHeightMm + 2.0 &&
        singleTall.metrics.postTaperDeg > singleShort.metrics.postTaperDeg + 0.4,
      `포스트 높이가 높아지면(${singleShort.metrics.postHeightMm}mm → ${singleTall.metrics.postHeightMm}mm) 최적 접착력을 맞추기 위해 테이퍼(${singleShort.metrics.postTaperDeg}° → ${singleTall.metrics.postTaperDeg}°)도 커진다`,
    );

    // 링크 연결 상태에서 테이퍼를 낮추면 포스트 높이도 함께 낮아진다.
    const linkedTaperPatch = computeParamsFromInfoFieldEdit(singleTall, "postTaperDeg", 2.0);
    const afterLinkedTaperEdit = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppTall,
      toothWorks: singleWorks,
      params: linkedTaperPatch,
    });
    const linkedWall = postRetentionSurface(
      singleTall.metrics.postWallRadiusMm ?? afterLinkedTaperEdit.metrics.postWallRadiusMm,
    );
    const linkedTargetH = computeOptimalPostHeightMmFromTaper(2.0, false, linkedWall);
    assert.ok(
      Math.abs(afterLinkedTaperEdit.metrics.postHeightMm - linkedTargetH) <= 0.45 &&
        Math.abs(afterLinkedTaperEdit.metrics.postTaperDeg - 2.0) <= 0.3 &&
        afterLinkedTaperEdit.metrics.postHeightMm < singleTall.metrics.postHeightMm - 1,
      `연결 상태에서 테이퍼를 2.0°로 맞추면 포스트 높이(${afterLinkedTaperEdit.metrics.postHeightMm}mm)가 같은 축벽의 등접착 높이(${linkedTargetH}mm)로 줄고 테이퍼(${afterLinkedTaperEdit.metrics.postTaperDeg}°)도 2°로 맞춰진다`,
    );

    // 링크를 끊으면(postTaperLink=0) 높이와 테이퍼가 각각 독립적으로 조절된다.
    const unlinkPatch = computeParamsFromInfoFieldEdit(singleTall, "postTaperLink", 0);
    const unlinked = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppTall,
      toothWorks: singleWorks,
      params: unlinkPatch,
    });
    const unlinkedHeightPatch = computeParamsFromInfoFieldEdit(unlinked, "postHeightMm", 5.0);
    const unlinkedHeightEdited = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppTall,
      toothWorks: singleWorks,
      params: { ...unlinkPatch, ...unlinkedHeightPatch },
    });
    assert.ok(
      Math.abs(unlinkedHeightEdited.metrics.postTaperDeg - unlinked.metrics.postTaperDeg) <= 0.05 &&
        unlinkedHeightEdited.metrics.postHeightMm < unlinked.metrics.postHeightMm - 1.5,
      `연결 해제 상태에서는 높이를 줄여도(${unlinked.metrics.postHeightMm}mm → ${unlinkedHeightEdited.metrics.postHeightMm}mm) 테이퍼(${unlinked.metrics.postTaperDeg}° → ${unlinkedHeightEdited.metrics.postTaperDeg}°)는 그대로 유지된다`,
    );
    const unlinkedTaperPatch = computeParamsFromInfoFieldEdit(unlinked, "postTaperDeg", 2.0);
    const unlinkedTaperEdited = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppTall,
      toothWorks: singleWorks,
      params: { ...unlinkPatch, ...unlinkedTaperPatch },
    });
    assert.ok(
      Math.abs(unlinkedTaperEdited.metrics.postHeightMm - unlinked.metrics.postHeightMm) <= 0.05 &&
        Math.abs(unlinkedTaperEdited.metrics.postTaperDeg - 2.0) <= 0.05,
      `연결 해제 상태에서는 테이퍼를 2°로 바꿔도 높이(${unlinked.metrics.postHeightMm}mm → ${unlinkedTaperEdited.metrics.postHeightMm}mm)는 그대로이고 테이퍼만 ${unlinkedTaperEdited.metrics.postTaperDeg}°가 된다`,
    );

    // 브리지 케이스는 같은 높이에서도 싱글보다 테이퍼가 더 크고, 짧아도 최소 2° 이상을 유지한다.
    const bridgeTall = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppTall,
      toothWorks: bridgeWorks,
    });
    const bridgeShort = await designCustomAbutmentStl({
      fixture: fixture36,
      jawGeometry: jawGeo,
      opposingGeometry: flatOppShort,
      toothWorks: bridgeWorks,
    });
    assert.equal(bridgeTall.metrics.isBridge, true, "브리지 메타데이터는 브리지로 판별된다");
    assert.ok(
      bridgeTall.metrics.postTaperDeg > singleTall.metrics.postTaperDeg + 0.15,
      `같은 조건에서 브리지 테이퍼(${bridgeTall.metrics.postTaperDeg}°)가 싱글 테이퍼(${singleTall.metrics.postTaperDeg}°)보다 크게 조절된다`,
    );
    assert.ok(
      bridgeShort.metrics.postTaperDeg >= 2.0,
      `짧은 브리지 포스트(${bridgeShort.metrics.postHeightMm}mm)에서도 테이퍼(${bridgeShort.metrics.postTaperDeg}°)는 최소 2° 이상이다`,
    );

    // 6) #24·#25처럼 바짝 붙어 있고 픽스쳐 장축이 서로 어긋난 소구치 공통 삽입축 케이스에서도
    // 측면 벽 천공 없이 모든 포스트 외벽이 ≥ 0.3mm이고 편측 테이퍼도 ≥ 2.0°로 생성된다.
    const tilt24Rad = (13 * Math.PI) / 180;
    const axis24: [number, number, number] = [0, Math.sin(tilt24Rad), -Math.cos(tilt24Rad)];
    const hexY24: [number, number, number] = [0, -Math.cos(tilt24Rad), -Math.sin(tilt24Rad)];
    const tilt25Rad = (-5 * Math.PI) / 180;
    const axis25: [number, number, number] = [0, Math.sin(tilt25Rad), -Math.cos(tilt25Rad)];
    const hexY25: [number, number, number] = [0, -Math.cos(tilt25Rad), -Math.sin(tilt25Rad)];
    const upperJawGeo = makeGridSurface(-12, 12, -12, 12, 32, (x, y) => -3.1 + 0.25 * Math.exp(-(x * x + y * y) / 9));
    const upperOppGeo = makeGridSurface(-10, 10, -10, 10, 28, () => -10.2);
    const fixture24 = {
      ...fixture36,
      toothNumber: "24",
      jaw: "upper" as const,
      fixturePose: {
        origin: [0, 0, 0] as [number, number, number],
        axis: axis24,
        hexX: [1, 0, 0] as [number, number, number],
        hexY: hexY24,
      },
      scanbodyTop: [0, 7 * axis24[1], 7 * axis24[2]] as [number, number, number],
      archOcclusalDir: [0, 0, -1] as [number, number, number],
      labialDir: [1, 0, 0] as [number, number, number],
      mesialDir: [0, -1, 0] as [number, number, number],
      connectionSpec: {
        ...fixture36.connectionSpec,
        screwUpperDiameterMm: 2.45,
      },
    };
    const fixture25 = {
      ...fixture24,
      toothNumber: "25",
      fixturePose: {
        origin: [0, 4.9, 0] as [number, number, number],
        axis: axis25,
        hexX: [1, 0, 0] as [number, number, number],
        hexY: hexY25,
      },
      scanbodyTop: [0, 4.9 + 7 * axis25[1], 7 * axis25[2]] as [number, number, number],
    };
    const designed24 = await designCustomAbutmentStl({
      fixture: fixture24,
      neighbors: [fixture25],
      jawGeometry: upperJawGeo,
      opposingGeometry: upperOppGeo,
      toothWorks: [
        { toothNumber: "24", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
        { toothNumber: "25", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
      ],
    });
    assert.ok(
      designed24.metrics.postTaperDeg >= 2.0,
      `#24 편측 테이퍼(${designed24.metrics.postTaperDeg}°)는 최소 2.0° 이상이다`,
    );
    assert.ok(
      designed24.metrics.maxDiameterMm <= 9.5,
      `#24 마진 최대 직경(${designed24.metrics.maxDiameterMm}mm)이 과도하게 커지지 않는다(구치 권장 대합 1.2mm·기울기 반영)`,
    );
    assert.ok(
      designed24.metrics.occlusalClearanceMm != null &&
        Math.abs(designed24.metrics.occlusalClearanceMm - 1.2) <= 0.1,
      `기본 대합 거리 설정 없이 생성해도 구치 권장 1.2mm(${designed24.metrics.occlusalClearanceMm}mm)에 맞춰진다`,
    );
    const localGeo24 = new THREE.BufferGeometry();
    localGeo24.setAttribute("position", new THREE.BufferAttribute(designed24.solidBodyLocalPositions!, 3));
    localGeo24.computeVertexNormals();
    const pos24 = localGeo24.getAttribute("position")!.array as Float32Array;
    const nrm24 = localGeo24.getAttribute("normal")!.array as Float32Array;
    const boreTopR24 = fixture24.connectionSpec.screwUpperDiameterMm / 2;
    let minPostWallMm = Infinity;
    for (let i = 0; i < pos24.length; i += 3) {
      const x = pos24[i]!;
      const y = pos24[i + 1]!;
      const z = pos24[i + 2]!;
      const nz = nrm24[i + 2]!;
      // 마진 위 모든 외측 벽면(축벽 + 상단 라운드 코너, 윗면 평탄부 nz > 0.68 제외)의 스크류 채널 벽 두께 검사
      if (z < 2.6 || nz > 0.68) continue;
      minPostWallMm = Math.min(minPostWallMm, Math.hypot(x, y) - boreTopR24);
    }
    assert.ok(
      minPostWallMm >= 0.3,
      `인접 어벗(#25)과 바짝 붙은 기울어진 #24 포스트에서도 모든 측면 벽 두께(최소 ${minPostWallMm.toFixed(3)}mm)가 0.3mm 이상 유지되어 뚫리지 않는다`,
    );

    // 7) 소구치(#14·#24·#25) 단면은 협설로 약간 길고(BL > MD), 협측이 볼록하게 넓고 설측이 덜 돌출된 계란-사각형이며,
    //    근심에 #24가 붙고 원심이 열린 #25도 원심 볼록 없이 균형 잡힌 계란형·대합거리 1.2mm 우선순위를 지킨다.
    const baseUpperPremolar = {
      ...fixture36,
      toothNumber: "24",
      jaw: "upper" as const,
      fixturePose: {
        origin: [0, 0, 0] as [number, number, number],
        axis: [0, 0, -1] as [number, number, number],
        hexX: [1, 0, 0] as [number, number, number],
        hexY: [0, -1, 0] as [number, number, number],
      },
      scanbodyTop: [0, 0, -7] as [number, number, number],
      archOcclusalDir: [0, 0, -1] as [number, number, number],
      labialDir: [1, 0, 0] as [number, number, number],
      mesialDir: [0, 1, 0] as [number, number, number],
    };
    const nb24 = { ...baseUpperPremolar, toothNumber: "24" };
    const nb25 = {
      ...baseUpperPremolar,
      toothNumber: "25",
      fixturePose: {
        ...baseUpperPremolar.fixturePose,
        origin: [0, -5.1, 0] as [number, number, number],
      },
      scanbodyTop: [0, -5.1, -7] as [number, number, number],
    };
    // 원심(#26, y ≈ -10.2)에 먼 자연치가 있고 대합치도 여유 있는 소구치(#24·#25) 실측 조건
    const jawWith26 = makeGridSurface(-18, 18, -16, 14, 44, (x, y) => {
      const ging = -3.1 + 0.2 * Math.exp(-(x * x) / 12);
      const molar26 = -4.8 * Math.exp(-((x * x) / 14 + ((y + 11.2) * (y + 11.2)) / 9));
      const canine23 = -4.5 * Math.exp(-((x * x) / 11 + ((y - 6.8) * (y - 6.8)) / 7));
      return ging + molar26 + canine23;
    });
    const premolarOpp = makeGridSurface(-12, 12, -14, 12, 32, () => -9.9);
    const veryTallOpp = makeGridSurface(-12, 12, -14, 12, 32, () => -13.2);
    const designedTallClear25 = await designCustomAbutmentStl({
      fixture: nb25,
      neighbors: [nb24],
      jawGeometry: jawWith26,
      opposingGeometry: veryTallOpp,
      toothWorks: [
        { toothNumber: "24", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
        { toothNumber: "25", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
      ],
    });
    assert.ok(
      designedTallClear25.metrics.occlusalClearanceMm != null &&
        Math.abs(designedTallClear25.metrics.occlusalClearanceMm - 1.2) <= 0.1,
      `대합치가 멀어도 초기 생성·재생성에서 구치 권장 대합 거리 1.2mm가 1순위로 유지된다(실측 ${designedTallClear25.metrics.occlusalClearanceMm}mm)`,
    );
    const designedPair24 = await designCustomAbutmentStl({
      fixture: nb24,
      neighbors: [nb25],
      jawGeometry: jawWith26,
      opposingGeometry: premolarOpp,
      toothWorks: [
        { toothNumber: "24", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
        { toothNumber: "25", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
      ],
    });
    const designedPair25 = await designCustomAbutmentStl({
      fixture: nb25,
      neighbors: [nb24],
      jawGeometry: jawWith26,
      opposingGeometry: premolarOpp,
      toothWorks: [
        { toothNumber: "24", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
        { toothNumber: "25", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
      ],
    });
    for (const [label, d] of [
      ["#24", designedPair24],
      ["#25", designedPair25],
    ] as const) {
      assert.ok(
        d.metrics.occlusalClearanceMm != null && Math.abs(d.metrics.occlusalClearanceMm - 1.2) <= 0.1,
        `${label} 재생성/초기 생성에서 구치 권장 대합 거리 1.2mm가 1순위로 맞춰진다(실측 ${d.metrics.occlusalClearanceMm}mm)`,
      );
      const { hexX, hexY, axis, origin } = d.fixture.fixturePose;
      const lab = d.fixture.labialDir;
      const mes = d.fixture.mesialDir;
      const mLoop = d.marginLoopLocal;
      const uvPts: Array<[number, number]> = [];
      let uMin = Infinity;
      let uMax = -Infinity;
      let vMin = Infinity;
      let vMax = -Infinity;
      for (let i = 0; i < mLoop.length; i += 3) {
        const lx = mLoop[i]!;
        const ly = mLoop[i + 1]!;
        const lz = mLoop[i + 2]!;
        const wx = lx * hexX[0]! + ly * hexY[0]! + lz * axis[0]!;
        const wy = lx * hexX[1]! + ly * hexY[1]! + lz * axis[1]!;
        const wz = lx * hexX[2]! + ly * hexY[2]! + lz * axis[2]!;
        const u = wx * lab[0]! + wy * lab[1]! + wz * lab[2]!;
        const v = wx * mes[0]! + wy * mes[1]! + wz * mes[2]!;
        uvPts.push([u, v]);
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      const blSpan = uMax - uMin;
      const mdSpan = vMax - vMin;
      assert.ok(
        blSpan > mdSpan * 1.08,
        `${label} 소구치 마진은 협설(${blSpan.toFixed(2)}mm)이 근원심(${mdSpan.toFixed(2)}mm)보다 약간 길다(원점=${origin.join(",")})`,
      );
      assert.ok(
        Math.abs(vMax + vMin) <= 0.55,
        `${label} 소구치는 원심/근심 한쪽으로 과도하게 볼록해지지 않는다(vMin=${vMin.toFixed(2)}, vMax=${vMax.toFixed(2)})`,
      );
      const uMid = (uMin + uMax) * 0.5;
      const halfBl = blSpan * 0.5;
      const widthAtSlice = (uTarget: number) => {
        const hits: number[] = [];
        for (let i = 0; i < uvPts.length; i += 1) {
          const [u0, v0] = uvPts[i]!;
          const [u1, v1] = uvPts[(i + 1) % uvPts.length]!;
          if ((u0 - uTarget) * (u1 - uTarget) <= 0 && Math.abs(u1 - u0) > 1e-6) {
            const t = (uTarget - u0) / (u1 - u0);
            hits.push(v0 + (v1 - v0) * t);
          }
        }
        return hits.length >= 2 ? Math.max(...hits) - Math.min(...hits) : 0;
      };
      const buccalW = widthAtSlice(uMid + halfBl * 0.45);
      const lingualW = widthAtSlice(uMid - halfBl * 0.45);
      const ratio = lingualW / Math.max(buccalW, 1e-6);
      assert.ok(
        ratio >= 0.8 && ratio <= 0.96,
        `${label} 소구치는 설측 폭(${lingualW.toFixed(2)}mm)이 협측 폭(${buccalW.toFixed(2)}mm)보다 살짝 좁은 사각-계란형(비율 ${ratio.toFixed(2)})이다`,
      );
    }
    {
      // #24·#25 마진이 서로 겹치지 않고, 양쪽 크라운 최소 측면 두께(0.5mm×2) 이상을 남긴다.
      const worldYExtent = (d: Awaited<ReturnType<typeof designCustomAbutmentStl>>, pick: "min" | "max") => {
        const { hexX, hexY, axis, origin } = d.fixture.fixturePose;
        const mLoop = d.marginLoopLocal;
        let best = pick === "min" ? Infinity : -Infinity;
        for (let i = 0; i < mLoop.length; i += 3) {
          const wy =
            origin[1]! +
            mLoop[i]! * hexX[1]! +
            mLoop[i + 1]! * hexY[1]! +
            mLoop[i + 2]! * axis[1]!;
          best = pick === "min" ? Math.min(best, wy) : Math.max(best, wy);
        }
        return best;
      };
      // #25가 y=-5.1에 있으므로 분리 간격 = #24 원심(minY) − #25 근심(maxY).
      // 픽스쳐가 바짝 붙으면 커프 하한 때문에 권장 1.0mm는 못 남겨도, 마진이 서로 교차(≤0)하면 안 된다.
      const gap24to25 = worldYExtent(designedPair24, "min") - worldYExtent(designedPair25, "max");
      assert.ok(
        gap24to25 > 0,
        `#24·#25 인접 마진이 겹치지 않아야 한다(간격 ${gap24to25.toFixed(2)}mm)`,
      );
    }
    assert.ok(
      singleShort.metrics.occlusalClearanceMm != null &&
        Math.abs(singleShort.metrics.occlusalClearanceMm - 1.2) <= 0.1 &&
        singleShort.metrics.postTaperDeg === 2.0 &&
        singleShort.metrics.idealPostTaperDeg != null &&
        singleShort.metrics.idealPostTaperDeg < 2.0,
      `적정 테이퍼(${singleShort.metrics.idealPostTaperDeg}°)가 2.0° 미만이어도 대합거리(${singleShort.metrics.occlusalClearanceMm}mm)·포스트 높이는 유지하고 테이퍼만 2.0°로 맞추며 적정값을 기록한다`,
    );
    assert.ok(
      designedTallClear25.metrics.idealPostTaperDeg != null &&
        designedTallClear25.metrics.idealPostTaperDeg < 2.0 &&
        designedTallClear25.metrics.postTaperDeg >= 2.0,
      `포스트 높이가 길어 상단 여유 기준 적정 테이퍼(${designedTallClear25.metrics.idealPostTaperDeg}°)가 2.0° 미만인 경우에도 포스트 높이는 유지하고 적정값을 기록한다`,
    );

    // 8) ToothAnatomy 카탈로그(32개 FDI 영구치) 및 순측 경사 하악 견치(#33) 형상 검증:
    // - 정상 크라운 크기보다 편측 ~1mm 작게 형성되어 경사 식립에서도 순설 과팽창(8~10mm)이 없다.
    // - 인접치(#32·#34)와 피니시라인·포스트 모두 충분한 보철 두께 유격을 지킨다.
    // - 교합면 단면은 땅콩형 오목이 없는 엄밀 볼록 역삼각형/마름모(순측 반쪽이 넓고 설측이 좁음)이고,
    // - 설측은 보철 싱귤럼 형성을 위해 치경부 칼라 위부터 사선으로 충분히 깎인다.
    for (const q of [1, 2, 3, 4] as const) {
      for (let p = 1; p <= 8; p += 1) {
        const spec = getToothAnatomy(`${q}${p}`);
        assert.equal(spec.toothNumber, `${q}${p}`);
        assert.ok(
          spec.abutmentCutback.marginBlMm <= spec.crown.equator.blMm - 1.5 &&
            spec.abutmentCutback.marginMdMm <= spec.crown.equator.mdMm - 1.3,
          `#${q}${p} 커스텀어벗 마진 기준치는 정상 크라운보다 편측 ~1mm 작다`,
        );
      }
    }
    assert.equal(
      getToothAnatomy("33").morphology.sectionShape,
      "rounded_inverted_triangle_diamond",
      "견치 단면 형태는 모서리가 둥근 역삼각형/마름모로 정의된다",
    );

    const tilt33Rad = (19 * Math.PI) / 180;
    // +Z 임플란트 축이 순측(+X)으로 19° 경사지게 식립된 하악 좌측 견치(#33)
    const axis33: [number, number, number] = [Math.sin(tilt33Rad), 0, Math.cos(tilt33Rad)];
    const hexX33: [number, number, number] = [Math.cos(tilt33Rad), 0, -Math.sin(tilt33Rad)];
    const jawCanine33 = makeGridSurface(-14, 14, -14, 14, 52, (x, y) => {
      const ging = 3.2 - 0.18 * Math.exp(-(x * x) / 10);
      // 근심 #32(y ≈ +5.2)와 원심 #34(y ≈ -5.0) 자연치 치관
      const incisor32 = 6.8 * Math.exp(-((x * x) / 7.5 + ((y - 5.2) * (y - 5.2)) / 4.2));
      const premolar34 = 6.9 * Math.exp(-((x * x) / 9.5 + ((y + 5.0) * (y + 5.0)) / 4.4));
      return ging + incisor32 + premolar34;
    });
    const oppCanine33 = makeGridSurface(-12, 12, -12, 12, 32, () => 14.2);
    const fixture33 = {
      ...fixture36,
      toothNumber: "33",
      jaw: "lower" as const,
      fixturePose: {
        origin: [0, 0, 0] as [number, number, number],
        axis: axis33,
        hexX: hexX33,
        hexY: [0, 1, 0] as [number, number, number],
      },
      scanbodyTop: [7 * axis33[0], 0, 7 * axis33[2]] as [number, number, number],
      archOcclusalDir: [0, 0, 1] as [number, number, number],
      labialDir: [1, 0, 0] as [number, number, number],
      mesialDir: [0, 1, 0] as [number, number, number],
    };
    const designed33 = await designCustomAbutmentStl({
      fixture: fixture33,
      jawGeometry: jawCanine33,
      opposingGeometry: oppCanine33,
      toothWorks: [
        {
          toothNumber: "33",
          prosthesisType: "크라운",
          customAbutment: true,
          bridgeLinkedTeeth: [],
        },
      ],
      params: { marginDepthMm: 0.8, marginSubgMinMm: 0.8, marginSubgMaxMm: 0.8 },
    });
    assert.ok(
      designed33.metrics.maxDiameterMm >= 4.2 && designed33.metrics.maxDiameterMm <= 6.9,
      `순측 19° 경사 #33 커스텀어벗 최대 직경(${designed33.metrics.maxDiameterMm}mm)은 하악 견치 폭보다 작은 범위(4.2~6.9mm) 안이다`,
    );
    // 교합면 시점(월드 Z=교합, X=순측, Y=근심)에서 마진 루프 엄밀 볼록성·역삼각/마름모 비율 검사
    const mWorld33 = designed33.marginLoopWorld;
    const mRing33: Array<[number, number]> = [];
    for (let i = 0; i < mWorld33.length; i += 3) {
      mRing33.push([mWorld33[i]!, mWorld33[i + 1]!]);
    }
    let minCross33 = Infinity;
    let uMin33 = Infinity;
    let uMax33 = -Infinity;
    for (let i = 0; i < mRing33.length; i += 1) {
      const p0 = mRing33[(i - 1 + mRing33.length) % mRing33.length]!;
      const p1 = mRing33[i]!;
      const p2 = mRing33[(i + 1) % mRing33.length]!;
      const cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
      minCross33 = Math.min(minCross33, cr);
      uMin33 = Math.min(uMin33, p1[0]);
      uMax33 = Math.max(uMax33, p1[0]);
    }
    assert.ok(
      minCross33 >= -1e-5,
      `#33 견치 마진 단면에 땅콩형 오목이 없다(minCross=${minCross33.toFixed(6)})`,
    );
    const sliceWidth33 = (uTarget: number) => {
      const ys: number[] = [];
      for (let i = 0; i < mRing33.length; i += 1) {
        const [x0, y0] = mRing33[i]!;
        const [x1, y1] = mRing33[(i + 1) % mRing33.length]!;
        if ((x0 - uTarget) * (x1 - uTarget) <= 0 && Math.abs(x1 - x0) > 1e-6) {
          ys.push(y0 + ((y1 - y0) * (uTarget - x0)) / (x1 - x0));
        }
      }
      return ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : 0;
    };
    const uMid33 = (uMin33 + uMax33) * 0.5;
    const uSpan33 = uMax33 - uMin33;
    const labThirdW33 = sliceWidth33(uMid33 + uSpan33 * 0.25);
    const linThirdW33 = sliceWidth33(uMid33 - uSpan33 * 0.28);
    assert.ok(
      linThirdW33 < labThirdW33 * 0.94,
      `#33 견치는 설측 1/3 폭(${linThirdW33.toFixed(2)}mm)이 순측 1/3 폭(${labThirdW33.toFixed(2)}mm)보다 좁은 역삼각형/마름모 형상이다`,
    );

    // 설측 싱귤럼 사선 삭제 검증: 하단 칼라(zWorld=4.2mm) 대비 상단(zWorld=8.0mm)에서 설측 외벽 후퇴량이 뚜렷하다.
    const worldPos33 = designed33.worldGeometry.getAttribute("position")!;
    const worldXBoundsAtZ = (z0: number) => {
      let xLo = Infinity;
      let xHi = -Infinity;
      for (let i = 0; i < worldPos33.count; i += 1) {
        if (Math.abs(worldPos33.getZ(i) - z0) <= 0.25 && Math.abs(worldPos33.getY(i)) <= 0.9) {
          xLo = Math.min(xLo, worldPos33.getX(i));
          xHi = Math.max(xHi, worldPos33.getX(i));
        }
      }
      return { xLo, xHi };
    };
    const lowBand33 = worldXBoundsAtZ(4.0);
    const highBand33 = worldXBoundsAtZ(7.8);
    const lingualBevelInwardMm = highBand33.xLo - lowBand33.xLo;
    assert.ok(
      lingualBevelInwardMm >= 0.4,
      `#33 견치 설측은 보철 싱귤럼 형성을 위해 치경부 대비 상단으로 사선 삭제(${lingualBevelInwardMm.toFixed(2)}mm)된다`,
    );

    // 9) 좁은 인접 공간으로 인해 치은연하에서 포스트 벽 두께(< 0.3mm)가 무너질 위험이 있는 케이스:
    // - 치은 연상(-2.0 ~ -1.5mm)으로 마진을 자동 상승시키고(치은 연하 직접 편집도 -2.5mm까지 허용),
    // - 스크류 홀을 뚫어도 모든 외벽 두께 ≥ 0.30mm를 확보하며,
    // - 부족한 크라운 두께를 메우기 위해 인접치 인접면을 편측 ≤ 0.20mm 갈아낼 부위를 3D 패치와 치아번호로 표시한다.
    const supraRangePatch = computeParamsFromInfoFieldEdit(designed33, "marginSubgMm", {
      min: -1.5,
      max: -2.0,
    });
    assert.equal(supraRangePatch.marginSubgMinMm, -2);
    assert.equal(supraRangePatch.marginSubgMaxMm, -1.5);

    const tightTiltRad = (11 * Math.PI) / 180;
    const tightAxis33: [number, number, number] = [
      Math.sin(tightTiltRad) * 0.86,
      Math.sin(tightTiltRad) * 0.5,
      Math.cos(tightTiltRad),
    ];
    const tightHexY33: [number, number, number] = (() => {
      const rx = -tightAxis33[1];
      const ry = tightAxis33[0];
      const l = Math.hypot(rx, ry) || 1;
      return [rx / l, ry / l, 0];
    })();
    const tightHexX33: [number, number, number] = [
      tightHexY33[1] * tightAxis33[2] - tightHexY33[2] * tightAxis33[1],
      tightHexY33[2] * tightAxis33[0] - tightHexY33[0] * tightAxis33[2],
      tightHexY33[0] * tightAxis33[1] - tightHexY33[1] * tightAxis33[0],
    ];
    // 근심 #32(y ≈ +3.65, 인접면이 y ≈ +2.02mm까지 접근)가 스크류 채널(boreTopR=1.225mm) 가까이에 바짝 서 있는 협소 케이스
    const tightJawCanine33 = makeGridSurface(-12, 12, -12, 12, 64, (x, y) => {
      const ging = 3.4 - 0.15 * Math.exp(-(x * x) / 10);
      const tightMesial32 = 8.4 * Math.exp(-((x * x) / 7.2 + ((y - 3.65) * (y - 3.65)) / 2.65));
      const distal34 = 8.0 * Math.exp(-((x * x) / 9.0 + ((y + 4.9) * (y + 4.9)) / 3.8));
      return ging + tightMesial32 + distal34;
    });
    const tightFixture33 = {
      ...fixture33,
      fixturePose: {
        origin: [0, 0, 0] as [number, number, number],
        axis: tightAxis33,
        hexX: tightHexX33,
        hexY: tightHexY33,
      },
      scanbodyTop: [7 * tightAxis33[0], 7 * tightAxis33[1], 7 * tightAxis33[2]] as [
        number,
        number,
        number,
      ],
      connectionSpec: {
        ...fixture33.connectionSpec,
        screwUpperDiameterMm: 2.45,
      },
    };
    const tightDesigned33 = await designCustomAbutmentStl({
      fixture: tightFixture33,
      jawGeometry: tightJawCanine33,
      opposingGeometry: oppCanine33,
      toothWorks: [
        {
          toothNumber: "33",
          prosthesisType: "크라운",
          customAbutment: true,
          bridgeLinkedTeeth: [],
        },
      ],
      params: { marginDepthMm: 0.8, marginSubgMinMm: 0.8, marginSubgMaxMm: 0.8 },
      explicitParams: {},
    });
    assert.equal(
      tightDesigned33.metrics.supragingivalRaisedForStrength,
      true,
      "좁은 인접 공간에서 포스트 파절 위험이 있으면 치과 기본 취향(0.8mm)이 있어도 치은 연상으로 자동 전환된다",
    );
    assert.ok(
      (tightDesigned33.metrics.marginSubgMinMm ?? 0) <= -1.5 &&
        (tightDesigned33.metrics.marginSubgMaxMm ?? 0) <= -1.4,
      `치은 연상 마진 구간(${tightDesigned33.metrics.marginSubgMinMm}~${tightDesigned33.metrics.marginSubgMaxMm}mm)이 -2.0~-1.5mm에 맞춰진다`,
    );
    const boreR33 = tightFixture33.connectionSpec.screwUpperDiameterMm / 2;
    const tightSolidGeo33 = new THREE.BufferGeometry();
    tightSolidGeo33.setAttribute(
      "position",
      new THREE.BufferAttribute(tightDesigned33.solidBodyLocalPositions!, 3),
    );
    tightSolidGeo33.computeVertexNormals();
    const tightPos33 = tightSolidGeo33.getAttribute("position")!.array as Float32Array;
    const tightNrm33 = tightSolidGeo33.getAttribute("normal")!.array as Float32Array;
    let minDrilledPostWall33 = Infinity;
    for (let i = 0; i < tightPos33.length; i += 3) {
      const px = tightPos33[i]!;
      const py = tightPos33[i + 1]!;
      const pz = tightPos33[i + 2]!;
      const nz = tightNrm33[i + 2]!;
      if (pz < tightDesigned33.metrics.cuffHeightMinMm + 0.15 || nz > 0.68) continue;
      minDrilledPostWall33 = Math.min(minDrilledPostWall33, Math.hypot(px, py) - boreR33);
    }
    assert.ok(
      minDrilledPostWall33 >= 0.3 && (tightDesigned33.metrics.minPostWallThicknessMm ?? 0) >= 0.3,
      `스크류 홀을 뚫은 뒤에도 포스트 외벽 최소 두께(${minDrilledPostWall33.toFixed(2)}mm)가 0.3mm 이상 확보된다`,
    );
    const guides33 = tightDesigned33.metrics.adjacentEnameloplasty ?? [];
    const mesialGuide32 = guides33.find((g) => g.adjacentToothNumber === "32");
    assert.ok(
      mesialGuide32 != null &&
        mesialGuide32.maxDepthMm > 0 &&
        mesialGuide32.maxDepthMm <= 0.2 &&
        tightDesigned33.enameloplastyWorldGeometry != null &&
        (tightDesigned33.enameloplastyWorldGeometry.getAttribute("position")?.count ?? 0) >= 9,
      `좁은 근심 인접치(#32)의 편측 ≤0.2mm 삭제량(${mesialGuide32?.maxDepthMm}mm)과 3D 표시 메시가 생성된다`,
    );

    // 10) CNC 가공성 및 마진 안착 불변식 검증:
    // - 피니시라인 수평 단면과 커프 전 높이 수평 단면(Z=const)은 내측으로 꺾인 오목이 전혀 없는 볼록(convex) 단면이어야 한다.
    // - 근심·원심이 협소한 케이스에서도 360° 모든 열에서 마진이 역전(상방 볼록 오버행)되지 않고 양수 보철 안착 마진 폭을 유지해야 한다.
    // - 스크류 홀 스펙은 우리치과기공소 실측 샘플 및 FaceHole 센터드릴 입구(~2.50mm) → 상부 채널 → 45° 시트 턱 → 하부 관통홀 단차를 따른다.
    const neoSpec = resolveCustomAbutmentConnectionSpec({
      implantManufacturer: "NEOBIOTECH",
      implantBrand: "IS2",
      implantFamily: "Regular",
      implantType: "Hex",
    });
    const ossSpec = resolveCustomAbutmentConnectionSpec({
      implantManufacturer: "OSSTEM",
      implantBrand: "TS3",
      implantFamily: "Regular",
      implantType: "Hex",
    });
    const boreNeo = resolveScrewChannelProfile(neoSpec, 8.6);
    assert.equal(neoSpec.screwLowerDiameterMm, 2.1);
    assert.equal(neoSpec.screwUpperDiameterMm, 2.45);
    assert.equal(neoSpec.screwTopMouthDiameterMm, 2.5);
    assert.equal(ossSpec.screwLowerDiameterMm, 2.05);
    assert.equal(ossSpec.screwUpperDiameterMm, 2.4);
    assert.ok(
      Math.abs(boreNeo.radiusAtZ(8.6) * 2 - 2.5) < 1e-6 &&
        Math.abs(boreNeo.radiusAtZ(4.0) * 2 - 2.45) < 1e-6 &&
        Math.abs(boreNeo.radiusAtZ(0.2) * 2 - 2.1) < 1e-6,
      "스크류 홀 프로파일이 최상단 입구 2.50mm → 상부 채널 2.45mm → 시트 아래 2.10mm 단차를 정확히 따른다",
    );

    for (const [caseLabel, d] of [
      ["#24 경사 인접", designed24],
      ["#24 계란형", designedPair24],
      ["#25 계란형", designedPair25],
      ["#33 순측 경사 견치", designed33],
      ["#33 근심 협소 치은연상 견치", tightDesigned33],
    ] as const) {
      const ml = d.marginLoopLocal;
      const nCols = ml.length / 3;
      let worstMarginCr = Infinity;
      for (let c = 0; c < nCols; c += 1) {
        const pr = (c - 1 + nCols) % nCols;
        const nx = (c + 1) % nCols;
        const cr =
          (ml[c * 3]! - ml[pr * 3]!) * (ml[nx * 3 + 1]! - ml[c * 3 + 1]!) -
          (ml[c * 3 + 1]! - ml[pr * 3 + 1]!) * (ml[nx * 3]! - ml[c * 3]!);
        worstMarginCr = Math.min(worstMarginCr, cr);
      }
      assert.ok(
        worstMarginCr >= -1e-3,
        `${caseLabel}: 피니시라인 수평 단면에 내측으로 꺾인 오목 구간이 없다(minCross=${worstMarginCr.toFixed(6)})`,
      );

      const soup = d.solidBodyLocalPositions!;
      const trisPerCol = soup.length / 9 / nCols;
      const ringCount = (trisPerCol + 2) / 2 + 1;
      const columns: Array<Array<[number, number, number]>> = [];
      for (let col = 0; col < nCols; col += 1) {
        const base = col * trisPerCol * 9;
        const pts: Array<[number, number, number]> = [
          [soup[base]!, soup[base + 1]!, soup[base + 2]!],
          [soup[base + 6]!, soup[base + 7]!, soup[base + 8]!],
        ];
        let off = base + 9;
        for (let r = 1; r < ringCount - 2; r += 1) {
          pts.push([soup[off + 15]!, soup[off + 16]!, soup[off + 17]!]);
          off += 18;
        }
        pts.push([soup[off + 6]!, soup[off + 7]!, soup[off + 8]!]);
        columns.push(pts);
      }
      const sampleAtZ = (pts: ReadonlyArray<[number, number, number]>, z0: number): [number, number] | null => {
        for (let r = 0; r < pts.length - 1; r += 1) {
          const a = pts[r]!;
          const b = pts[r + 1]!;
          if ((a[2] <= z0 && z0 <= b[2]) || (b[2] <= z0 && z0 <= a[2])) {
            const dz = b[2] - a[2];
            const t = Math.abs(dz) > 1e-9 ? (z0 - a[2]) / dz : 0;
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          }
        }
        return null;
      };
      const coneZ = d.fixture.connectionSpec.prcConeTopMm;
      for (let z = coneZ + 0.12; z <= d.metrics.cuffHeightMinMm - 0.1; z += 0.3) {
        const poly = columns.map((pts) => sampleAtZ(pts, z));
        if (poly.some((p) => !p)) continue;
        for (let i = 0; i < nCols; i += 1) {
          const p0 = poly[(i - 1 + nCols) % nCols]!;
          const p1 = poly[i]!;
          const p2 = poly[(i + 1) % nCols]!;
          const cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
          assert.ok(
            cr >= -1e-3,
            `${caseLabel}: 커프 수평 단면(z=${z.toFixed(2)})이 내측으로 꺾이지 않고 볼록하다(cr=${cr.toFixed(6)})`,
          );
        }
      }

      // 삽입축 기준 360° 모든 열에서 양수 마진 폭 확보 및 마진 역전(오버행) 0건 확인
      const centroidRing = (rIdx: number): [number, number, number] => {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (let col = 0; col < nCols; col += 1) {
          sx += columns[col]![rIdx]![0] / nCols;
          sy += columns[col]![rIdx]![1] / nCols;
          sz += columns[col]![rIdx]![2] / nCols;
        }
        return [sx, sy, sz];
      };
      const cLo = centroidRing(38);
      const cHi = centroidRing(52);
      const wDx = cHi[0] - cLo[0];
      const wDy = cHi[1] - cLo[1];
      const wDz = cHi[2] - cLo[2];
      const wLen = Math.hypot(wDx, wDy, wDz) || 1;
      const wx = wDx / wLen;
      const wy = wDy / wLen;
      const wz = wDz / wLen;
      let minShoulderMm = Infinity;
      for (let col = 0; col < nCols; col += 1) {
        const pts = columns[col]!;
        const mPt = pts[28]!;
        const pBase = pts[36]!;
        const outX = mPt[0] - cLo[0];
        const outY = mPt[1] - cLo[1];
        const outL = Math.hypot(outX, outY) || 1;
        const ox = outX / outL;
        const oy = outY / outL;
        const dxB = pBase[0] - mPt[0];
        const dyB = pBase[1] - mPt[1];
        const dzB = pBase[2] - mPt[2];
        const dotWB = dxB * wx + dyB * wy + dzB * wz;
        const sh = -((dxB - dotWB * wx) * ox + (dyB - dotWB * wy) * oy);
        minShoulderMm = Math.min(minShoulderMm, sh);
        const checkMaxRing = d === designed24 ? 37 : 56;
        for (let r = 29; r <= checkMaxRing; r += 1) {
          const q = pts[r]!;
          const dx = q[0] - mPt[0];
          const dy = q[1] - mPt[1];
          const dz = q[2] - mPt[2];
          const dotW = dx * wx + dy * wy + dz * wz;
          const over = (dx - dotW * wx) * ox + (dy - dotW * wy) * oy;
          assert.ok(
            over <= 0.01,
            `${caseLabel}: 열 ${col} 링 ${r}에서 마진 상방 볼록 역전(overhang=${over.toFixed(3)}mm)이 없다`,
          );
        }
      }
      assert.ok(
        minShoulderMm >= 0.18,
        `${caseLabel}: 전 둘레 최소 마진 챔퍼 폭(${minShoulderMm.toFixed(2)}mm)이 확보된다`,
      );
    }

    // 11) 검볼 76px 크기, 비등방 협설 스케일 복원·유지, 개별 요소 변경 시 무관 치수 불변 및 원심 먼 치은 대구치(#37) 매끈함 검증
    assert.equal(GUMBALL_SIZE_PX, 76, "검볼 기준 크기는 76px이다");
    assert.equal(normalizeAbutmentEdit(identityAbutmentEdit()), null, "항등 검볼 편집은 null로 정규화된다");
    const savedAnisoEdit = normalizeAbutmentEdit({
      heightMm: 0.25,
      shiftLabialMm: 0.15,
      shiftMesialMm: -0.1,
      yawDeg: 0,
      tiltLabialDeg: 0,
      tiltMesialDeg: 0,
      scale: [1.34, 1.0, 1.08],
      partial: [],
    });
    assert.ok(savedAnisoEdit != null && Math.abs(savedAnisoEdit.scale[0] - 1.34) < 1e-6);

    // 대합 거리·포스트 높이·테이퍼·마진 필레 R 개별 수정 시 피니시라인·협설/근원심 폭·최대 직경 불변 검증
    const distalOpenJaw37 = makeGridSurface(-12, 12, -12, 12, 56, (x, y) => {
      const mesial36 = 7.8 * Math.exp(-((x * x) / 8.5 + ((y - 6.2) * (y - 6.2)) / 1.8));
      // 원심(y < 0)은 스캔바디 근처가 낮고 멀리(y ≈ -5.2)서야 치은 둔덕이 올라오는 지형
      const farDistalPad = 2.6 * Math.exp(-((x * x) / 14 + ((y + 5.2) * (y + 5.2)) / 3.0));
      return 2.7 + mesial36 + farDistalPad;
    });
    const tilt37 = (12 * Math.PI) / 180;
    const fixture37 = {
      ...fixture36,
      toothNumber: "37",
      jaw: "lower" as const,
      fixturePose: {
        origin: [0, 0, 0] as [number, number, number],
        axis: [0, Math.sin(tilt37), Math.cos(tilt37)] as [number, number, number],
        hexX: [1, 0, 0] as [number, number, number],
        hexY: [0, Math.cos(tilt37), -Math.sin(tilt37)] as [number, number, number],
      },
      scanbodyTop: [0, 5 * Math.sin(tilt37), 5 * Math.cos(tilt37)] as [number, number, number],
      archOcclusalDir: [0, 0, 1] as [number, number, number],
      labialDir: [1, 0, 0] as [number, number, number],
      mesialDir: [0, 1, 0] as [number, number, number],
    };
    const opp37 = makeGridSurface(-10, 10, -10, 10, 28, () => 7.4);
    const base37 = await designCustomAbutmentStl({
      fixture: fixture37,
      jawGeometry: distalOpenJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: { occlusalClearanceMm: 1.0, marginFilletRadiusMm: 0.7 },
    });
    const clearChanged37 = await designCustomAbutmentStl({
      fixture: fixture37,
      jawGeometry: distalOpenJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: { occlusalClearanceMm: 1.6, marginFilletRadiusMm: 0.7 },
    });
    const filletChanged37 = await designCustomAbutmentStl({
      fixture: fixture37,
      jawGeometry: distalOpenJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: { occlusalClearanceMm: 1.0, marginFilletRadiusMm: 0.5 },
    });
    const taperChanged37 = await designCustomAbutmentStl({
      fixture: fixture37,
      jawGeometry: distalOpenJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: { occlusalClearanceMm: 1.0, marginFilletRadiusMm: 0.7, postTaperLink: 0, postTaperDeg: 4.0 },
    });
    assert.ok(
      Math.abs(base37.metrics.maxDiameterMm - clearChanged37.metrics.maxDiameterMm) < 0.08,
      `대합 거리 변경 시 최대 직경이 거의 변하지 않는다(${base37.metrics.maxDiameterMm}→${clearChanged37.metrics.maxDiameterMm})`,
    );
    assert.ok(
      Math.abs(base37.metrics.maxDiameterMm - filletChanged37.metrics.maxDiameterMm) < 0.08,
      `마진 필레 R 변경 시 최대 직경이 거의 변하지 않는다(${base37.metrics.maxDiameterMm}→${filletChanged37.metrics.maxDiameterMm})`,
    );
    assert.ok(
      Math.abs(base37.metrics.maxDiameterMm - taperChanged37.metrics.maxDiameterMm) < 0.08,
      `테이퍼 변경 시 최대 직경이 거의 변하지 않는다(${base37.metrics.maxDiameterMm}→${taperChanged37.metrics.maxDiameterMm})`,
    );
    for (let i = 0; i < base37.marginLoopLocal.length; i += 1) {
      assert.ok(
        Math.abs(base37.marginLoopLocal[i]! - clearChanged37.marginLoopLocal[i]!) < 0.08 &&
          Math.abs(base37.marginLoopLocal[i]! - filletChanged37.marginLoopLocal[i]!) < 0.08 &&
          Math.abs(base37.marginLoopLocal[i]! - taperChanged37.marginLoopLocal[i]!) < 0.08,
        "대합 거리·챔퍼 R·테이퍼 변경 시 피니시라인과 협설·근원심 외경이 거의 그대로 유지된다",
      );
    }

    // 원심 먼 치은 #37 케이스의 포스트 축벽 Z-단면 엄밀 볼록성 및 마진 폭 균일도 검증
    const soup37 = base37.solidBodyLocalPositions!;
    const nCols37 = base37.marginLoopLocal.length / 3;
    const trisPerCol37 = soup37.length / 9 / nCols37;
    const ringCount37 = (trisPerCol37 + 2) / 2 + 1;
    const cols37: Array<Array<[number, number, number]>> = [];
    for (let col = 0; col < nCols37; col += 1) {
      const b = col * trisPerCol37 * 9;
      const pts: Array<[number, number, number]> = [
        [soup37[b]!, soup37[b + 1]!, soup37[b + 2]!],
        [soup37[b + 6]!, soup37[b + 7]!, soup37[b + 8]!],
      ];
      let off = b + 9;
      for (let r = 1; r < ringCount37 - 2; r += 1) {
        pts.push([soup37[off + 15]!, soup37[off + 16]!, soup37[off + 17]!]);
        off += 18;
      }
      pts.push([soup37[off + 6]!, soup37[off + 7]!, soup37[off + 8]!]);
      cols37.push(pts);
    }
    let cLo37X = 0, cLo37Y = 0, cLo37Z = 0;
    let cHi37X = 0, cHi37Y = 0, cHi37Z = 0;
    for (let col = 0; col < nCols37; col += 1) {
      cLo37X += cols37[col]![38]![0] / nCols37;
      cLo37Y += cols37[col]![38]![1] / nCols37;
      cLo37Z += cols37[col]![38]![2] / nCols37;
      cHi37X += cols37[col]![52]![0] / nCols37;
      cHi37Y += cols37[col]![52]![1] / nCols37;
      cHi37Z += cols37[col]![52]![2] / nCols37;
    }
    const w37Dx = cHi37X - cLo37X;
    const w37Dy = cHi37Y - cLo37Y;
    const w37Dz = cHi37Z - cLo37Z;
    const w37Len = Math.hypot(w37Dx, w37Dy, w37Dz) || 1;
    const wx37 = w37Dx / w37Len;
    const wy37 = w37Dy / w37Len;
    const wz37 = w37Dz / w37Len;
    const proj37 = (p: readonly [number, number, number]): [number, number, number] => {
      const dw = p[0] * wx37 + p[1] * wy37 + p[2] * wz37;
      return [p[0] - dw * wx37, p[1] - dw * wy37, p[2] - dw * wz37];
    };
    const mPoly37 = cols37.map((c) => proj37(c[28]!));
    const pPoly37 = cols37.map((c) => proj37(c[36]!));
    let minSh37 = Infinity;
    let maxSh37 = 0;
    for (let col = 0; col < nCols37; col += 1) {
      const mp = mPoly37[col]!;
      let sh = Infinity;
      for (let j = 0; j < nCols37; j += 1) {
        const a = pPoly37[j]!;
        const b = pPoly37[(j + 1) % nCols37]!;
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const abz = b[2] - a[2];
        const l2 = abx * abx + aby * aby + abz * abz || 1;
        const t = Math.max(
          0,
          Math.min(1, ((mp[0] - a[0]) * abx + (mp[1] - a[1]) * aby + (mp[2] - a[2]) * abz) / l2),
        );
        const d3 = Math.hypot(mp[0] - (a[0] + abx * t), mp[1] - (a[1] + aby * t), mp[2] - (a[2] + abz * t));
        if (d3 < sh) sh = d3;
      }
      minSh37 = Math.min(minSh37, sh);
      maxSh37 = Math.max(maxSh37, sh);
    }
    assert.ok(
      maxSh37 - minSh37 <= 0.08,
      `원심 먼 치은 #37 케이스에서도 둘레 법선 마진 폭 편차(${(maxSh37 - minSh37).toFixed(3)}mm)가 고르게 유지된다`,
    );
    for (let r = 36; r < ringCount37 - 2; r += 1) {
      for (let c = 0; c < nCols37; c += 1) {
        const p0 = cols37[(c - 1 + nCols37) % nCols37]![r]!;
        const p1 = cols37[c]![r]!;
        const p2 = cols37[(c + 1) % nCols37]![r]!;
        const cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
        assert.ok(
          cr >= -1e-3,
          `#37 포스트 링 ${r} 열 ${c}에 오목 패임이 없다(cr=${cr.toFixed(6)})`,
        );
      }
    }

    // 12) 싱글 짧은 포스트(3.5mm, 굵기 배율 적용 포함)는 테이퍼가 최소 2.0°로 맞춰지고,
    //     근심 공간이 넓고 치조제 잇몸 능선이 있는 충돌 지형에서는 우선순위 후보가 최대 3개까지 생성된다.
    const widePostShort37 = await designCustomAbutmentStl({
      fixture: fixture37,
      jawGeometry: distalOpenJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: { occlusalClearanceMm: 1.5, postWidthScale: 1.2 },
    });
    assert.equal(
      widePostShort37.metrics.postTaperDeg,
      2.0,
      `포스트 높이 ${widePostShort37.metrics.postHeightMm}mm(<5mm)에서 굵기 배율이 커도 싱글 테이퍼는 2.0°로 맞춰진다`,
    );

    const conflictJaw37 = makeGridSurface(-12, 12, -12, 12, 56, (x, y) => {
      // 근심 #36 자연치는 y ≈ +7.5mm에 멀리 서 있고, 중간 y ≈ +3.2mm에는 치조제 잇몸 능선이 올라온 충돌 지형
      const farMesial36 = 7.8 * Math.exp(-((x * x) / 8.5 + ((y - 7.6) * (y - 7.6)) / 1.5));
      const ridgeCrest = 1.15 * Math.exp(-((x * x) / 12 + ((y - 3.3) * (y - 3.3)) / 1.4));
      return 2.7 + farMesial36 + ridgeCrest;
    });
    const cands37 = await designCustomAbutmentCandidates({
      fixture: fixture37,
      jawGeometry: conflictJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: { occlusalClearanceMm: 1.0, marginFilletRadiusMm: 0.7 },
    });
    assert.ok(
      cands37.length >= 2 && cands37.length <= 3,
      `조건 충돌 시 우선순위 높은 후보가 2~3개 생성된다(count=${cands37.length})`,
    );
    assert.ok(
      cands37[0]!.design.metrics.maxDiameterMm > cands37[1]!.design.metrics.maxDiameterMm + 0.35,
      `(1) 인접 공간 균형 후보(Ø${cands37[0]!.design.metrics.maxDiameterMm}mm)가 (2) 치은 연하 우선 후보(Ø${cands37[1]!.design.metrics.maxDiameterMm}mm)보다 빈 공간을 더 채운다`,
    );
    // 13) 원심에 픽스쳐가 치우쳐 포스트·마진이 근심으로 크게 이동한 #37 케이스 및 충돌 후보 전원에서
    //     원심측 원호 배불뚝이·직선 다각형 절단(flatSegs)·교합면 오목 홈이 0건이고 마진 폭이 균등한지 검증
    const eccentricTilt37 = (6.4 * Math.PI) / 180;
    const eccentricFixture37 = {
      ...fixture37,
      fixturePose: {
        origin: [0, 0, 0] as [number, number, number],
        axis: [0, -Math.sin(eccentricTilt37), Math.cos(eccentricTilt37)] as [number, number, number],
        hexX: [1, 0, 0] as [number, number, number],
        hexY: [0, Math.cos(eccentricTilt37), Math.sin(eccentricTilt37)] as [number, number, number],
      },
      scanbodyTop: [0, -5 * Math.sin(eccentricTilt37), 5 * Math.cos(eccentricTilt37)] as [
        number,
        number,
        number,
      ],
      connectionSpec: {
        ...fixture37.connectionSpec,
        originDiameterMm: 3.35,
        prcConeTopMm: 0.3,
        screwLowerDiameterMm: 2.08,
        screwUpperDiameterMm: 2.45,
        screwTopMouthDiameterMm: 2.5,
      },
    };
    const eccentricJaw37 = makeGridSurface(-12, 12, -10, 14, 56, (x, y) => {
      const mesial36 = 6.0 * Math.exp(-((x * x) / 10 + ((y - 9.2) * (y - 9.2)) / 1.8));
      const distalGingiva = 3.8 * Math.exp(-((x * x) / 12 + ((y + 3.5) * (y + 3.5)) / 1.5));
      return 3.25 + mesial36 + distalGingiva;
    });
    const eccentricOpp37 = makeGridSurface(-8, 8, -2, 10, 28, () => 7.2);
    const eccentric37 = await designCustomAbutmentStl({
      fixture: eccentricFixture37,
      jawGeometry: eccentricJaw37,
      opposingGeometry: eccentricOpp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: {
        occlusalClearanceMm: 1.0,
        marginFilletRadiusMm: 0.7,
        marginDepthMm: 0.3,
        marginSubgMinMm: 0.3,
        marginSubgMaxMm: 0.3,
        postWidthScale: 1.08,
        marginSizeScale: 0.967,
        axisSourceCode: 1,
      },
    });
    for (const [label, d] of [
      ["원심 편심 #37", eccentric37] as const,
      ...cands37.map((c, idx) => [`충돌 후보 #${idx + 1} (${c.id})`, c.design] as const),
    ]) {
      const ml = d.marginLoopLocal;
      const n = ml.length / 3;
      const { hexX, hexY, axis } = d.fixture.fixturePose;
      const lab = d.fixture.labialDir;
      const mes = d.fixture.mesialDir;
      const xy: Array<[number, number]> = [];
      const occUV: Array<[number, number]> = [];
      for (let i = 0; i < n; i += 1) {
        const lx = ml[i * 3]!;
        const ly = ml[i * 3 + 1]!;
        const lz = ml[i * 3 + 2]!;
        xy.push([lx, ly]);
        const wx = hexX[0]! * lx + hexY[0]! * ly + axis[0]! * lz;
        const wy = hexX[1]! * lx + hexY[1]! * ly + axis[1]! * lz;
        const wz = hexX[2]! * lx + hexY[2]! * ly + axis[2]! * lz;
        occUV.push([
          wx * lab[0]! + wy * lab[1]! + wz * lab[2]!,
          wx * mes[0]! + wy * mes[1]! + wz * mes[2]!,
        ]);
      }
      let area2Occ = 0;
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        area2Occ += occUV[i]![0] * occUV[j]![1] - occUV[i]![1] * occUV[j]![0];
      }
      const occSign = area2Occ >= 0 ? 1 : -1;
      let flatSegsXY = 0;
      let minCrXY = Infinity;
      let minCrOcc = Infinity;
      for (let i = 0; i < n; i += 1) {
        const p0 = xy[(i - 1 + n) % n]!;
        const p1 = xy[i]!;
        const p2 = xy[(i + 1) % n]!;
        const crXY = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
        minCrXY = Math.min(minCrXY, crXY);
        if (Math.abs(crXY) < 1e-5) flatSegsXY += 1;
        const q0 = occUV[(i - 1 + n) % n]!;
        const q1 = occUV[i]!;
        const q2 = occUV[(i + 1) % n]!;
        const crOcc =
          ((q1[0] - q0[0]) * (q2[1] - q1[1]) - (q1[1] - q0[1]) * (q2[0] - q1[0])) * occSign;
        minCrOcc = Math.min(minCrOcc, crOcc);
      }
      assert.equal(
        flatSegsXY,
        0,
        `${label}: 피니시라인에 원호 클램프나 볼록껍질 직선 현(flatSegs=${flatSegsXY})이 없다`,
      );
      assert.ok(
        minCrXY > 1e-5 && minCrOcc > 1e-6,
        `${label}: 픽스쳐 수평면(minCrXY=${minCrXY.toFixed(6)})과 교합면 시점(minCrOcc=${minCrOcc.toFixed(6)}) 모두 전 구간 매끈한 엄밀 볼록 곡선이다`,
      );
    }
    eccentric37.worldGeometry.dispose();
    eccentric37.predictedCrownWorldGeometry.dispose();
    eccentric37.enameloplastyWorldGeometry?.dispose();
    for (const c of cands37) {
      c.design.worldGeometry.dispose();
      c.design.predictedCrownWorldGeometry.dispose();
      c.design.enameloplastyWorldGeometry?.dispose();
    }

    // 14) 전형적인 치은 스캘럽(근·원심 치은선 높고 협·설 중앙은 낮은 #37 지형)에서:
    //     - 생성 시 피니시라인이 평면으로 눌리지 않고 치은 굴곡을 따라 스캘럽 패턴을 유지한다.
    //     - 치은 연하 수치(0.1~0.4mm ↔ 0.7~1.1mm)를 바꾸면 스캘럽을 유지한 채 마진 높이가 설정에 맞게 이동한다.
    //     - 검볼로 외경을 넓히거나 이동·높이 조절을 해도 피니시라인이 평면 고정·공중 부양되지 않고 치은 연하 굴곡을 따라 재적합된다.
    const scallopedJaw37 = makeGridSurface(-12, 12, -12, 12, 60, (x, y) => {
      const r = Math.hypot(x, y);
      const socketFunnel = -0.85 * Math.exp(-(r * r) / 5.2);
      // 근·원심(y 방향)은 바깥으로 갈수록 치간유두가 솟고(+1.45mm), 협·설 중앙(x 방향)은 바깥으로 갈수록 낮아지는 전형적인 굴곡
      const papillaRise =
        1.45 *
        (1 - Math.exp(-(y * y) / 4.8)) *
        Math.exp(-(x * x) / 14.0) *
        Math.exp(-((Math.abs(y) - 4.4) ** 2) / 9.5);
      const flDip = -0.35 * (1 - Math.exp(-(x * x) / 5.5)) * Math.exp(-(y * y) / 8.0);
      const mesial36Crown = 6.2 * Math.exp(-((x * x) / 9.0 + ((y - 8.6) * (y - 8.6)) / 1.9));
      return 3.15 + socketFunnel + papillaRise + flDip + mesial36Crown;
    });
    const measureScallopStats = (ml: Float32Array) => {
      const mCount = ml.length / 3;
      let proxSum = 0;
      let proxN = 0;
      let flSum = 0;
      let flN = 0;
      let meanZ = 0;
      for (let c = 0; c < mCount; c += 1) {
        const mx = ml[c * 3]!;
        const my = ml[c * 3 + 1]!;
        const mz = ml[c * 3 + 2]!;
        meanZ += mz / mCount;
        const r = Math.hypot(mx, my) || 1;
        if (Math.abs(my / r) >= 0.85) {
          proxSum += mz;
          proxN += 1;
        } else if (Math.abs(mx / r) >= 0.85) {
          flSum += mz;
          flN += 1;
        }
      }
      return {
        proxMeanZ: proxSum / Math.max(proxN, 1),
        flMeanZ: flSum / Math.max(flN, 1),
        scallopDeltaMm: proxSum / Math.max(proxN, 1) - flSum / Math.max(flN, 1),
        meanZ,
      };
    };

    const shallow37 = await designCustomAbutmentStl({
      fixture: fixture37,
      jawGeometry: scallopedJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: {
        marginDepthMm: 0.1,
        marginSubgMinMm: 0.1,
        marginSubgMaxMm: 0.4,
        occlusalClearanceMm: 1.06,
        marginFilletRadiusMm: 0.5,
      },
      explicitParams: {
        marginSubgMinMm: 0.1,
        marginSubgMaxMm: 0.4,
      },
    });
    const deep37 = await designCustomAbutmentStl({
      fixture: fixture37,
      jawGeometry: scallopedJaw37,
      opposingGeometry: opp37,
      toothWorks: [{ toothNumber: "37", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
      params: {
        marginDepthMm: 0.7,
        marginSubgMinMm: 0.7,
        marginSubgMaxMm: 1.1,
        occlusalClearanceMm: 1.06,
        marginFilletRadiusMm: 0.5,
      },
      explicitParams: {
        marginSubgMinMm: 0.7,
        marginSubgMaxMm: 1.1,
      },
    });
    const stShallow = measureScallopStats(shallow37.marginLoopLocal);
    const stDeep = measureScallopStats(deep37.marginLoopLocal);
    assert.ok(
      stShallow.scallopDeltaMm >= 0.55,
      `#37 피니시라인이 평면으로 눌리지 않고 근·원심이 협·설 중앙보다 뚜렷이 높은 스캘럽(${stShallow.scallopDeltaMm.toFixed(2)}mm)을 유지한다`,
    );
    assert.ok(
      stDeep.scallopDeltaMm >= 0.5 && stShallow.meanZ - stDeep.meanZ >= 0.3,
      `치은 연하(0.1~0.4mm → 0.7~1.1mm) 변경 시 스캘럽(${stDeep.scallopDeltaMm.toFixed(2)}mm)을 유지한 채 마진 깊이(${(stShallow.meanZ - stDeep.meanZ).toFixed(2)}mm)가 내려간다`,
    );

    // 검볼 직접 편집 세션에서 외경을 넓히고(+스케일) 수직 높이를 당겨도 피니시라인이 치은 연하 굴곡을 따라 재적합되는지 검증
    const scene37 = new THREE.Scene();
    const abutMesh37 = new THREE.Mesh(shallow37.worldGeometry.clone(), new THREE.MeshBasicMaterial());
    scene37.add(abutMesh37);
    let lastMarginPositions37: Float32Array | null = null;
    const marginLine37 = Object.assign(new THREE.Object3D(), {
      geometry: {
        setPositions: (positions: Float32Array | number[]) => {
          lastMarginPositions37 =
            positions instanceof Float32Array ? new Float32Array(positions) : new Float32Array(positions);
        },
      },
      computeLineDistances: () => {},
    });
    const sessionDesign37 = {
      toothNumber: "37",
      jaw: "lower" as const,
      fixture: shallow37.fixture,
      localPositions: new Float32Array(shallow37.localPositions),
      solidBodyLocalPositions: shallow37.solidBodyLocalPositions
        ? new Float32Array(shallow37.solidBodyLocalPositions)
        : undefined,
      crownLocalPositions: new Float32Array(shallow37.crownLocalPositions),
      marginLoopLocal: new Float32Array(shallow37.marginLoopLocal),
      stlBlob: shallow37.stlBlob,
      params: { ...shallow37.params },
      metrics: { ...shallow37.metrics },
    };
    const editSession37 = new AbutmentDirectEditSession({
      getScene: () => scene37,
      getCamera: () => null,
      getRenderer: () => null,
      getHost: () => null,
      getDesigns: () => [sessionDesign37],
      getAbutment: (t) => (t === "37" ? abutMesh37 : undefined),
      getCrown: () => undefined,
      getMargin: (t) => (t === "37" ? marginLine37 : undefined),
      getJawGeometry: () => scallopedJaw37,
      getOpposingGeometry: () => opp37,
      ui: {
        gumballOn: true,
        sculptOn: false,
        radiusMm: 2.0,
        readOnly: false,
        selected: "37",
        visible: { "37": true },
        expanded: { "37": true },
      },
      onBadge: () => {},
      onCommit: () => {},
      onHistory: () => {},
    });
    editSession37.setEdit("37", {
      ...identityAbutmentEdit(),
      scale: [1.26, 1.26, 1],
      shiftMesialMm: 0.35,
      heightMm: 0.9,
    });
    editSession37.sync();
    assert.ok(lastMarginPositions37 != null, "검볼 편집 동기화 시 피니시라인 월드 좌표가 갱신된다");
    const stGumball = measureScallopStats(sessionDesign37.marginLoopLocal);
    assert.ok(
      stGumball.scallopDeltaMm >= 0.7 && stGumball.flMeanZ < stShallow.flMeanZ + 0.15,
      `검볼 확장·수직 드래그 후에도 피니시라인이 공중으로 뜨지 않고(협설Z=${stGumball.flMeanZ.toFixed(2)}mm) 더 높은 근원심 유두를 따라 스캘럽(${stGumball.scallopDeltaMm.toFixed(2)}mm)을 키운다`,
    );

    // 15) 검볼 편집(이동·비등방 스케일·높이·기울기·요 및 저장된 디자인 위 2차 편집) 후에도
    //     메시 마진 링이 피니시라인(marginLoopLocal)과 정확히 일치하고,
    //     커프~마진 구간에 뒤집힌 삼각형이나 급격한 계단/찢어짐 없이 매끈한 페이스를 유지하는지 검증
    const assertSmoothCuffAndMargin = (
      label: string,
      solidSoup: Float32Array,
      marginLoop: Float32Array,
    ) => {
      const nCols = Math.floor(marginLoop.length / 3);
      const trisPerCol = solidSoup.length / 9 / nCols;
      const ringCount = (trisPerCol + 2) / 2 + 1;
      const cols: Array<Array<[number, number, number]>> = [];
      for (let col = 0; col < nCols; col += 1) {
        const b = col * trisPerCol * 9;
        const pts: Array<[number, number, number]> = [
          [solidSoup[b]!, solidSoup[b + 1]!, solidSoup[b + 2]!],
          [solidSoup[b + 6]!, solidSoup[b + 7]!, solidSoup[b + 8]!],
        ];
        let off = b + 9;
        for (let r = 1; r < ringCount - 2; r += 1) {
          pts.push([solidSoup[off + 15]!, solidSoup[off + 16]!, solidSoup[off + 17]!]);
          off += 18;
        }
        pts.push([solidSoup[off + 6]!, solidSoup[off + 7]!, solidSoup[off + 8]!]);
        cols.push(pts);
      }
      // 1) 마진 링(ring 28) 정점과 marginLoopLocal 일치도 검증
      let maxMarginGapMm = 0;
      for (let col = 0; col < nCols; col += 1) {
        const mp = cols[col]![28]!;
        const dx = mp[0] - marginLoop[col * 3]!;
        const dy = mp[1] - marginLoop[col * 3 + 1]!;
        const dz = mp[2] - marginLoop[col * 3 + 2]!;
        maxMarginGapMm = Math.max(maxMarginGapMm, Math.hypot(dx, dy, dz));
      }
      assert.ok(
        maxMarginGapMm <= 0.02,
        `${label}: 메시 마진 링과 피니시라인의 최대 오차(${maxMarginGapMm.toFixed(4)}mm)가 0.02mm 이내다`,
      );
      // 2) 커프 구간(ring 6..28)에서 각 열의 Z 단조 증가 및 뒤집힌 삼각형 0건 검증
      let flippedCuffTris = 0;
      let maxAdjacentDihedralDeg = 0;
      const triNormal = (
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number],
      ): [number, number, number] => {
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const abz = b[2] - a[2];
        const acx = c[0] - a[0];
        const acy = c[1] - a[1];
        const acz = c[2] - a[2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const l = Math.hypot(nx, ny, nz) || 1;
        return [nx / l, ny / l, nz / l];
      };
      for (let col = 0; col < nCols; col += 1) {
        const nxt = (col + 1) % nCols;
        const cA = cols[col]!;
        const cB = cols[nxt]!;
        for (let r = 6; r < 28; r += 1) {
          assert.ok(
            cA[r + 1]![2] > cA[r]![2] - 1e-4,
            `${label}: 커프 열 ${col} 링 ${r}→${r + 1}의 Z가 역전되지 않는다`,
          );
          const n1 = triNormal(cA[r]!, cB[r]!, cB[r + 1]!);
          const n2 = triNormal(cA[r]!, cB[r + 1]!, cA[r + 1]!);
          // 외향 법선은 반경 방향(radial)으로 바깥을 향해야 한다
          const midX = (cA[r]![0] + cB[r]![0] + cA[r + 1]![0] + cB[r + 1]![0]) * 0.25;
          const midY = (cA[r]![1] + cB[r]![1] + cA[r + 1]![1] + cB[r + 1]![1]) * 0.25;
          const dotOut1 = n1[0] * midX + n1[1] * midY;
          const dotOut2 = n2[0] * midX + n2[1] * midY;
          if (dotOut1 <= 0 || dotOut2 <= 0) flippedCuffTris += 1;
          const pairDot = Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]));
          const pairDeg = (Math.acos(pairDot) * 180) / Math.PI;
          if (pairDeg > maxAdjacentDihedralDeg) maxAdjacentDihedralDeg = pairDeg;
          if (r > 6) {
            const prevN = triNormal(cA[r - 1]!, cB[r]!, cA[r]!);
            const stepDot = Math.max(-1, Math.min(1, prevN[0] * n2[0] + prevN[1] * n2[1] + prevN[2] * n2[2]));
            const stepDeg = (Math.acos(stepDot) * 180) / Math.PI;
            if (stepDeg > maxAdjacentDihedralDeg) maxAdjacentDihedralDeg = stepDeg;
          }
        }
      }
      assert.equal(flippedCuffTris, 0, `${label}: 커프 구간에 뒤집힌 삼각형이 0개다`);
      assert.ok(
        maxAdjacentDihedralDeg < 35,
        `${label}: 커프~마진 인접 삼각형 최대 법선 꺾임(${maxAdjacentDihedralDeg.toFixed(1)}°)이 매끈한 범위(<35°) 안이다`,
      );
    };

    const invFixture37 = (() => {
      const p = shallow37.fixture.fixturePose;
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...p.hexX),
        new THREE.Vector3(...p.hexY),
        new THREE.Vector3(...p.axis),
      );
      m.setPosition(...p.origin);
      return m.invert();
    })();
    const worldMarginToLocal = (closedWorld: Float32Array): Float32Array => {
      const n = Math.floor(closedWorld.length / 3) - 1;
      const out = new Float32Array(n * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i += 1) {
        v.set(closedWorld[i * 3]!, closedWorld[i * 3 + 1]!, closedWorld[i * 3 + 2]!).applyMatrix4(invFixture37);
        out[i * 3] = v.x;
        out[i * 3 + 1] = v.y;
        out[i * 3 + 2] = v.z;
      }
      return out;
    };

    const gumballCases: Array<[string, Partial<AbutmentEdit>]> = [
      ["확장+이동+높이", { scale: [1.26, 1.12, 1.08], shiftLabialMm: 0.7, shiftMesialMm: -0.5, heightMm: 0.6 }],
      ["기울기 회전(±10°)", { tiltLabialDeg: 10, tiltMesialDeg: -7, shiftLabialMm: 0.4 }],
      ["축소+요 회전+기울기", { scale: [0.85, 1.18, 0.94], yawDeg: 14, tiltLabialDeg: -8, shiftMesialMm: 0.6 }],
    ];
    for (const [caseName, patch] of gumballCases) {
      const nextEdit = edit(patch);
      editSession37.setEdit("37", nextEdit);
      const internal = editSession37 as unknown as {
        show: (t: string, b: boolean, s?: boolean) => void;
        localBuf: Float32Array;
      };
      internal.show("37", false, true);
      const solidLen = sessionDesign37.solidBodyLocalPositions!.length;
      const liveMarginLocal = worldMarginToLocal(lastMarginPositions37!);
      assertSmoothCuffAndMargin(
        `1차 검볼(${caseName})`,
        internal.localBuf.subarray(0, solidLen),
        liveMarginLocal,
      );
    }

    // 저장된 디자인(1차 검볼 편집이 bake된 상태)을 다시 열어 2차 검볼 편집을 해도 마진·커프가 깨지지 않는다
    const internal1 = editSession37 as unknown as {
      show: (t: string, b: boolean, s?: boolean) => void;
      localBuf: Float32Array;
    };
    editSession37.setEdit("37", edit({ shiftLabialMm: 0.9, shiftMesialMm: 0.5, scale: [1.22, 0.92, 1], yawDeg: 12 }));
    internal1.show("37", false, true);
    const bakedSolid1 = new Float32Array(
      internal1.localBuf.subarray(0, sessionDesign37.solidBodyLocalPositions!.length),
    );
    const bakedMargin1 = worldMarginToLocal(lastMarginPositions37!);
    const savedDesign37 = {
      ...sessionDesign37,
      localPositions: new Float32Array(bakedSolid1),
      solidBodyLocalPositions: new Float32Array(bakedSolid1),
      marginLoopLocal: new Float32Array(bakedMargin1),
    };
    const abutMeshSaved = new THREE.Mesh(shallow37.worldGeometry.clone(), new THREE.MeshBasicMaterial());
    scene37.add(abutMeshSaved);
    const savedSession37 = new AbutmentDirectEditSession({
      getScene: () => scene37,
      getCamera: () => null,
      getRenderer: () => null,
      getHost: () => null,
      getDesigns: () => [savedDesign37],
      getAbutment: (t) => (t === "37" ? abutMeshSaved : undefined),
      getCrown: () => undefined,
      getMargin: (t) => (t === "37" ? marginLine37 : undefined),
      getJawGeometry: () => scallopedJaw37,
      getOpposingGeometry: () => opp37,
      ui: {
        gumballOn: true,
        sculptOn: false,
        radiusMm: 2.0,
        readOnly: false,
        selected: "37",
        visible: { "37": true },
        expanded: { "37": true },
      },
      onBadge: () => {},
      onCommit: () => {},
      onHistory: () => {},
    });
    savedSession37.sync();
    savedSession37.setEdit("37", edit({ shiftLabialMm: -0.6, tiltMesialDeg: 9, scale: [0.92, 1.15, 1.05] }));
    const internal2 = savedSession37 as unknown as {
      show: (t: string, b: boolean, s?: boolean) => void;
      localBuf: Float32Array;
    };
    internal2.show("37", false, true);
    assertSmoothCuffAndMargin(
      "저장된 디자인 2차 검볼",
      internal2.localBuf.subarray(0, bakedSolid1.length),
      worldMarginToLocal(lastMarginPositions37!),
    );
    savedSession37.dispose();
    abutMeshSaved.geometry.dispose();
    (abutMeshSaved.material as THREE.Material).dispose();
    editSession37.dispose();
    abutMesh37.geometry.dispose();
    (abutMesh37.material as THREE.Material).dispose();
    shallow37.worldGeometry.dispose();
    shallow37.predictedCrownWorldGeometry.dispose();
    deep37.worldGeometry.dispose();
    deep37.predictedCrownWorldGeometry.dispose();
    scallopedJaw37.dispose();
  }
}

// 구치: 협측 벽과 설측 악궁 중심선이 부딪혀 BL이 설측으로 길어지면
// (1) 협측 상단 1/3 개방, (2) 협측 이동이 앞에 오고, 기존 후보는 최대 1개다.
{
  const makeGrid = (
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    steps: number,
    zFn: (x: number, y: number) => number,
  ) => {
    const tris: number[] = [];
    const dx = (xMax - xMin) / steps;
    const dy = (yMax - yMin) / steps;
    for (let ix = 0; ix < steps; ix += 1) {
      for (let iy = 0; iy < steps; iy += 1) {
        const x0 = xMin + ix * dx;
        const x1 = x0 + dx;
        const y0 = yMin + iy * dy;
        const y1 = y0 + dy;
        const z00 = zFn(x0, y0);
        const z10 = zFn(x1, y0);
        const z11 = zFn(x1, y1);
        const z01 = zFn(x0, y1);
        tris.push(x0, y0, z00, x1, y0, z10, x1, y1, z11);
        tris.push(x0, y0, z00, x1, y1, z11, x0, y1, z01);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
    geo.computeVertexNormals();
    return geo;
  };
  const tilt = (18 * Math.PI) / 180;
  const buccalFixture = {
    toothNumber: "36",
    jaw: "lower" as const,
    fixturePose: {
      origin: [0, 0, 0] as [number, number, number],
      axis: [Math.sin(tilt), 0, Math.cos(tilt)] as [number, number, number],
      hexX: [Math.cos(tilt), 0, -Math.sin(tilt)] as [number, number, number],
      hexY: [0, 1, 0] as [number, number, number],
    },
    scanbodyTop: [5 * Math.sin(tilt), 0, 5 * Math.cos(tilt)] as [number, number, number],
    scanbodyRadiusMm: 2.25,
    scanbodyHeightMm: 7,
    gingivaFloorMm: 2.8,
    rmsMm: 0.02,
    topCoverage: 0.95,
    matchedLibraryLabel: "지오메디 Ø4.5×7mm",
    connectionSpec: {
      manufacturer: "NEOBIOTECH",
      brand: "IS2",
      family: "IS",
      type: "Hex",
      originDiameterMm: 3.5,
      hexSizeMm: 2.5,
      l2Mm: 2.75,
      prcConeTopMm: 1.0,
      screwLowerDiameterMm: 2.0,
      screwUpperDiameterMm: 2.4,
    },
    archOcclusalDir: [0, 0, 1] as [number, number, number],
    labialDir: [1, 0, 0] as [number, number, number],
    mesialDir: [0, 1, 0] as [number, number, number],
  };
  const neighborTooth = (x: number, y: number, cy: number) => {
    const dy = Math.abs(y - cy);
    const dx = x + 2.3;
    if (dy > 2.6 || Math.abs(dx) > 3.6) return 0;
    const yf = dy < 1.5 ? 1 : Math.cos(((dy - 1.5) / 1.1) * Math.PI * 0.5);
    const xf = Math.abs(dx) < 2.7 ? 1 : Math.cos(((Math.abs(dx) - 2.7) / 0.9) * Math.PI * 0.5);
    return 7.2 * yf * Math.max(0, xf);
  };
  const archJaw = makeGrid(-14, 12, -14, 14, 64, (x, y) => {
    return 3.05 + neighborTooth(x, y, 8.1) + neighborTooth(x, y, -8.1);
  });
  const archOpp = makeGrid(-10, 10, -10, 10, 28, () => 12.4);
  const cands = await designCustomAbutmentCandidates({
    fixture: buccalFixture,
    jawGeometry: archJaw,
    opposingGeometry: archOpp,
    toothWorks: [{ toothNumber: "36", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
    params: { occlusalClearanceMm: 1.2 },
  });
  const labels = cands.map((c) => `${c.id}:${c.label}`).join(" | ");
  assert.ok(cands.length >= 2 && cands.length <= 3, `설측 BL 과신장 후보는 2~3개다 (${labels})`);
  assert.equal(cands[0]!.id, "buccal_top_open", `(1)은 협측 상단 1/3 개방이다 (${labels})`);
  assert.equal(cands[0]!.label, "협측 상단 1/3 개방");
  assert.equal(cands[1]!.id, "buccal_shift", `(2)는 협측 이동이다 (${labels})`);
  assert.equal(cands[1]!.label, "협측으로 이동");
  const marginX = (loop: Float32Array) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < loop.length; i += 3) {
      const x = loop[i]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      sum += x;
      n += 1;
    }
    return { minX, maxX, span: maxX - minX, mean: n > 0 ? sum / n : 0 };
  };
  const openMargin = marginX(cands[0]!.design.marginLoopLocal);
  const shiftMargin = marginX(cands[1]!.design.marginLoopLocal);
  const kept = cands.find((c) => c.id === "space_fill");
  if (kept) {
    const keptMargin = marginX(kept.design.marginLoopLocal);
    assert.ok(
      openMargin.span < keptMargin.span - 0.6,
      `개방 안 BL(${openMargin.span.toFixed(2)})이 설측으로 늘린 기존 안(${keptMargin.span.toFixed(2)})보다 짧다`,
    );
    assert.ok(
      openMargin.mean < keptMargin.mean - 0.2,
      `개방 안 중심(${openMargin.mean.toFixed(2)})이 악궁(설측) 쪽에 남는다`,
    );
    assert.ok(
      keptMargin.minX < shiftMargin.minX - 0.2,
      `기존 안 설측 끝(${keptMargin.minX.toFixed(2)})이 협측 이동(${shiftMargin.minX.toFixed(2)})보다 설측으로 길다`,
    );
  }
  assert.ok(
    shiftMargin.mean > openMargin.mean + 0.15,
    `협측 이동 마진 중심(${shiftMargin.mean.toFixed(2)})이 개방 안(${openMargin.mean.toFixed(2)})보다 협측이다`,
  );
  const bandMaxX = (pos: Float32Array, zLo: number, zHi: number) => {
    let maxX = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!;
      const y = pos[i + 1]!;
      const z = pos[i + 2]!;
      if (z < zLo || z >= zHi || Math.abs(y) > 1.15) continue;
      if (x > maxX) maxX = x;
    }
    return maxX;
  };
  const openPos = cands[0]!.design.localPositions;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 2; i < openPos.length; i += 3) {
    zMin = Math.min(zMin, openPos[i]!);
    zMax = Math.max(zMax, openPos[i]!);
  }
  const zSpan = Math.max(0.5, zMax - zMin);
  const midX = bandMaxX(openPos, zMin + zSpan * 0.4, zMin + zSpan * 0.62);
  const topX = bandMaxX(openPos, zMin + zSpan * 0.82, zMax + 0.01);
  assert.ok(
    Number.isFinite(midX) && Number.isFinite(topX) && topX < midX - 0.3,
    `협측 상단(${topX.toFixed(2)})이 중간 벽(${midX.toFixed(2)})보다 안쪽으로 열린다`,
  );
  let minMidBuccalR = Infinity;
  for (let i = 0; i < openPos.length; i += 3) {
    const x = openPos[i]!;
    const y = openPos[i + 1]!;
    const z = openPos[i + 2]!;
    if (z < zMin + zSpan * 0.4 || z >= zMin + zSpan * 0.62 || Math.abs(y) > 1.15 || x <= 0.4) continue;
    minMidBuccalR = Math.min(minMidBuccalR, Math.hypot(x, y));
  }
  assert.ok(
    minMidBuccalR > 1.45,
    `개방 안의 치은측 협측 벽(${minMidBuccalR.toFixed(2)}mm)은 스크류를 감싼다`,
  );
  const flatJaw = makeGrid(-12, 12, -12, 12, 28, () => 3.1);
  const flatOpp = makeGrid(-8, 8, -8, 8, 20, () => 12.2);
  const plain = await designCustomAbutmentCandidates({
    fixture: {
      ...buccalFixture,
      fixturePose: {
        origin: [0, 0, 0] as [number, number, number],
        axis: [0, 0, 1] as [number, number, number],
        hexX: [1, 0, 0] as [number, number, number],
        hexY: [0, 1, 0] as [number, number, number],
      },
      scanbodyTop: [0, 0, 5] as [number, number, number],
    },
    jawGeometry: flatJaw,
    opposingGeometry: flatOpp,
    toothWorks: [{ toothNumber: "36", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
    params: { occlusalClearanceMm: 1.2 },
  });
  assert.ok(
    plain.every((c) => c.id !== "buccal_top_open" && c.id !== "buccal_shift"),
    `BL이 정상이면 협측 벽 후보를 띄우지 않는다 (${plain.map((c) => c.id).join(",")})`,
  );

  // 인접 어벗만 있고 원심 자연치가 없어도(#24↔#25) 같은 규칙으로 후보가 뜬다.
  const mesialOnlyTooth = (x: number, y: number) => {
    const dy = Math.abs(y - 8.1);
    const dx = x + 2.3;
    if (dy > 2.6 || Math.abs(dx) > 3.6) return 0;
    const yf = dy < 1.5 ? 1 : Math.cos(((dy - 1.5) / 1.1) * Math.PI * 0.5);
    const xf = Math.abs(dx) < 2.7 ? 1 : Math.cos(((Math.abs(dx) - 2.7) / 0.9) * Math.PI * 0.5);
    return 7.2 * yf * Math.max(0, xf);
  };
  const mesialOnlyJaw = makeGrid(-14, 12, -14, 14, 64, (x, y) => 3.05 + mesialOnlyTooth(x, y));
  const neighbor25 = {
    ...buccalFixture,
    toothNumber: "25",
    fixturePose: {
      origin: [0, -7.2, 0] as [number, number, number],
      axis: [Math.sin(tilt), 0, Math.cos(tilt)] as [number, number, number],
      hexX: [Math.cos(tilt), 0, -Math.sin(tilt)] as [number, number, number],
      hexY: [0, 1, 0] as [number, number, number],
    },
    scanbodyTop: [5 * Math.sin(tilt), -7.2, 5 * Math.cos(tilt)] as [number, number, number],
  };
  const premolar24 = {
    ...buccalFixture,
    toothNumber: "24",
    jaw: "upper" as const,
  };
  const pairCands = await designCustomAbutmentCandidates({
    fixture: premolar24,
    jawGeometry: mesialOnlyJaw,
    opposingGeometry: archOpp,
    neighbors: [neighbor25],
    toothWorks: [
      { toothNumber: "24", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
      { toothNumber: "25", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
    ],
    params: { occlusalClearanceMm: 1.2 },
  });
  const pairLabels = pairCands.map((c) => `${c.id}:${c.label}`).join(" | ");
  assert.equal(pairCands[0]?.id, "buccal_top_open", `인접 어벗만 있어도 (1)이 뜬다 (${pairLabels})`);
  assert.equal(pairCands[1]?.id, "buccal_shift", `인접 어벗만 있어도 (2)가 뜬다 (${pairLabels})`);

  for (const cand of [...cands, ...plain, ...pairCands]) {
    cand.design.worldGeometry.dispose();
    cand.design.predictedCrownWorldGeometry.dispose();
    cand.design.enameloplastyWorldGeometry?.dispose();
  }
  archJaw.dispose();
  archOpp.dispose();
  flatJaw.dispose();
  flatOpp.dispose();
  mesialOnlyJaw.dispose();
}

console.log("abutment direct edit ok");
