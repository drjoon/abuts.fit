import assert from "node:assert/strict";

import * as THREE from "three";

import { cuffProfile } from "../../practice/cuffProfile";
import { designCustomAbutmentStl } from "../../practice/customAbutmentStlDesign";
import { computeParamsFromInfoFieldEdit } from "./PracticeCustomAbutmentDesignTree";
import {
  AbutmentDirectEditSession,
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
const tiltedPair = many([2, 0, 6, -2, 0, 6, 2.5, 0, 3], edit({ tiltLabialDeg: tiltDeg }));
assert.ok(
  tiltedPair[0]! > 2.3 && tiltedPair[2]! < 6 - 0.3 && tiltedPair[8]! === 3,
  "파란 회전툴 기울기 시 순측 상단은 내려가고 설측 상단은 올라가며 마진은 고정된다",
);
assert.ok(tiltedPair[5]! > 6 + 0.3, "반대쪽(설측) 상단은 대칭으로 올라가 평평한 경사면을 유지한다");
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
  assert.ok(
    topRotY[0]! > 1.45 && Math.abs(topRotY[1]!) < 1e-4 && topRotY[2]! < 6.6 - 0.1,
    "+Y 축 오른손 회전은 상단을 +X로 기울이고 +X 모서리를 낮춘다",
  );

  // 오른손 법칙: worldAxis = +X 주위로 +10° 회전하면 +Z 정점(1, 0, h)은 +X × +Z = -Y 방향으로 이동해야 한다.
  const rotX = edit();
  applyWorldRotationToAbutmentEdit(rotX, new THREE.Vector3(1, 0, 0), 10, axes);
  const topRotX = one([1, 0, 6.6], rotX);
  assert.ok(topRotX[1]! < -0.45 && Math.abs(topRotX[0]! - 1) < 1e-4, "+X 축 오른손 회전은 상단을 -Y로 기울인다");

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

// #36 대구치에서 협측 대합치가 낮고 설측 대합치가 높은 경우:
// 1) 초기 생성부터 포스트 최상단은 평평한 면을 유지하면서 대합치와 협·설 거리가 비슷하도록 각도가 잡히고 최단 거리는 설정값(1.3 / 1.5mm)에 맞춰진다.
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

    // 협측(+X) 상단과 설측(-X) 상단에서 대합치까지의 거리가 고르게 형성되는지 검증
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
        Math.abs(minBuccalGap - minLingualGap) < 0.35,
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
    assert.ok(
      Math.abs(afterLinkedTaperEdit.metrics.postHeightMm - 5.0) <= 0.25 &&
        Math.abs(afterLinkedTaperEdit.metrics.postTaperDeg - 2.0) <= 0.3,
      `연결 상태에서 테이퍼를 2.0°로 맞추면 포스트 높이(${afterLinkedTaperEdit.metrics.postHeightMm}mm)가 기준 5mm 근처로 함께 조절되고 테이퍼(${afterLinkedTaperEdit.metrics.postTaperDeg}°)도 2°로 맞춰진다`,
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
      Math.abs(unlinkedHeightEdited.metrics.postTaperDeg - unlinked.metrics.postTaperDeg) <= 0.35 &&
        unlinkedHeightEdited.metrics.postHeightMm < unlinked.metrics.postHeightMm - 1.5,
      `연결 해제 상태에서는 높이를 줄여도(${unlinked.metrics.postHeightMm}mm → ${unlinkedHeightEdited.metrics.postHeightMm}mm) 테이퍼(${unlinked.metrics.postTaperDeg}° → ${unlinkedHeightEdited.metrics.postTaperDeg}°)는 그대로 유지된다`,
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
      bridgeTall.metrics.postTaperDeg > singleTall.metrics.postTaperDeg + 0.6,
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
      designed24.metrics.maxDiameterMm <= 9.2,
      `#24 마진 최대 직경(${designed24.metrics.maxDiameterMm}mm)이 과도하게 커지지 않는다`,
    );
    assert.ok(
      designed24.metrics.occlusalClearanceMm != null &&
        Math.abs(designed24.metrics.occlusalClearanceMm - 1.5) <= 0.1,
      `기본 대합 거리 설정 없이 생성해도 기본값 1.5mm(${designed24.metrics.occlusalClearanceMm}mm)에 맞춰진다`,
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
  }
}

console.log("abutment direct edit ok");
