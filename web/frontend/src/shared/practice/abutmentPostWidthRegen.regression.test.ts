// 회귀: 포스트 수평 크기(postWidthScale) 조정 후 메시 재생성 시
// 1) 마진 숄더 폭이 1.1mm 선반으로 벌어지지 않고 설정된 등폭(~0.5mm)을 유지한다.
// 2) 인접 대구치(#16·#17)가 있어도 #17의 포스트 반경과 최대 직경이 역전 팽창 없이 단조 감소한다.
// 3) 검볼 수평 크기 연동(gumballPatchSetsRadial, clearBakedRadial, retainLiveGumballParams)이 일관되게 동작한다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/components/practice/abutmentDirectEdit.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx

import assert from "node:assert/strict";

import * as THREE from "three";

import {
  AbutmentDirectEditSession,
  gumballPatchSetsRadial,
  identityAbutmentEdit,
  retainLiveGumballParams,
} from "../components/practice/abutmentDirectEdit";
import { designCustomAbutmentStl } from "./customAbutmentStlDesign";

type V3 = [number, number, number];

function makeGridSurface(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  steps: number,
  zFn: (x: number, y: number) => number,
) {
  const tris: number[] = [];
  const dx = (xMax - xMin) / steps;
  const dy = (yMax - yMin) / steps;
  for (let ix = 0; ix < steps; ix += 1) {
    for (let iy = 0; iy < steps; iy += 1) {
      const x0 = xMin + ix * dx;
      const x1 = x0 + dx;
      const y0 = yMin + iy * dy;
      const y1 = y0 + dy;
      tris.push(x0, y0, zFn(x0, y0), x1, y0, zFn(x1, y0), x1, y1, zFn(x1, y1));
      tris.push(x0, y0, zFn(x0, y0), x1, y1, zFn(x1, y1), x0, y1, zFn(x0, y1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const jawGeo = makeGridSurface(-14, 14, -18, 18, 40, (x) => -3.3 + 0.2 * Math.exp(-((x * x) / 12)));
const oppGeo = makeGridSurface(-14, 14, -18, 18, 32, () => -9.2);

const conn = {
  manufacturer: "NEOBIOTECH",
  brand: "IS2",
  family: "IS",
  type: "Hex",
  originDiameterMm: 3.35,
  hexSizeMm: 2.5,
  l2Mm: 2.75,
  prcConeTopMm: 1.0,
  screwLowerDiameterMm: 2.0,
  screwUpperDiameterMm: 2.0,
};

function makeUpperMolarFixture(toothNumber: string, y: number, leanX = 0) {
  const axLen = Math.hypot(leanX, 0, -1);
  const axis: V3 = [leanX / axLen, 0, -1 / axLen];
  const hexXRaw: V3 = [1 - axis[0] * axis[0], 0, -axis[2] * axis[0]];
  const hxLen = Math.hypot(...hexXRaw);
  const hexX: V3 = [hexXRaw[0] / hxLen, 0, hexXRaw[2] / hxLen];
  return {
    toothNumber,
    jaw: "upper" as const,
    fixturePose: {
      origin: [0, y, 0] as V3,
      axis,
      hexX,
      hexY: [0, 1, 0] as V3,
    },
    scanbodyTop: [axis[0] * 9, y, axis[2] * 9] as V3,
    scanbodyRadiusMm: 2.25,
    scanbodyHeightMm: 9.0,
    gingivaFloorMm: 2.8,
    rmsMm: 0.02,
    topCoverage: 0.95,
    matchedLibraryLabel: "네오 Ø4.5×9mm",
    connectionSpec: conn,
    archOcclusalDir: [0, 0, -1] as V3,
    labialDir: [1, 0, 0] as V3,
    mesialDir: [0, 1, 0] as V3,
  };
}

const fx16 = makeUpperMolarFixture("16", 5.5, 0.02);
const fx17 = makeUpperMolarFixture("17", -5.5, 0.045);
const works = [
  { toothNumber: "16", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: ["17"] },
  { toothNumber: "17", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: ["16"] },
];

const scales = [1.2, 1.0, 0.85, 0.7, 0.65];
const measuredRows: Array<{
  scale: number;
  maxDiam: number;
  postWallR: number;
  estShelfMm: number;
}> = [];

for (const sc of scales) {
  const d17 = await designCustomAbutmentStl({
    fixture: fx17,
    jawGeometry: jawGeo,
    opposingGeometry: oppGeo,
    neighbors: [fx16, fx17],
    toothWorks: works,
    params: {
      postWidthScale: sc,
      marginFilletRadiusMm: 0.5,
      marginShoulderMm: 0.5,
      postTaperLink: 0,
      postTaperDeg: 2.6,
      axisSourceCode: 2,
    },
    explicitParams: {
      postWidthScale: sc,
      marginFilletRadiusMm: 0.5,
      postTaperLink: 0,
      postTaperDeg: 2.6,
      axisSourceCode: 2,
    },
  });

  const mLoop = d17.marginLoopLocal;
  const mCount = mLoop.length / 3;
  let meanMarginR = 0;
  let meanMarginZ = 0;
  for (let i = 0; i < mLoop.length; i += 3) {
    meanMarginR += Math.hypot(mLoop[i]!, mLoop[i + 1]!);
    meanMarginZ += mLoop[i + 2]!;
  }
  meanMarginR /= mCount;
  meanMarginZ /= mCount;

  const solid = d17.solidBodyLocalPositions!;
  let postBaseR = 0;
  let postBaseN = 0;
  for (let i = 0; i < solid.length; i += 3) {
    const z = solid[i + 2]!;
    if (z >= meanMarginZ + 0.55 && z <= meanMarginZ + 0.85) {
      const r = Math.hypot(solid[i]!, solid[i + 1]!);
      if (r > 1.5) {
        postBaseR += r;
        postBaseN += 1;
      }
    }
  }
  postBaseR = postBaseN > 0 ? postBaseR / postBaseN : 0;

  measuredRows.push({
    scale: sc,
    maxDiam: d17.metrics.maxDiameterMm,
    postWallR: d17.metrics.postWallRadiusMm,
    estShelfMm: meanMarginR - postBaseR,
  });

  d17.worldGeometry.dispose();
  d17.predictedCrownWorldGeometry.dispose();
  d17.enameloplastyWorldGeometry?.dispose();
}

jawGeo.dispose();
oppGeo.dispose();

for (let i = 1; i < measuredRows.length; i += 1) {
  const prev = measuredRows[i - 1]!;
  const cur = measuredRows[i]!;
  assert.ok(
    cur.maxDiam < prev.maxDiam,
    `postWidthScale 감소(${prev.scale}→${cur.scale}) 시 최대 직경이 단조 감소해야 한다(${prev.maxDiam}→${cur.maxDiam})`,
  );
  assert.ok(
    cur.postWallR < prev.postWallR,
    `postWidthScale 감소(${prev.scale}→${cur.scale}) 시 포스트 반경이 단조 감소해야 한다(${prev.postWallR}→${cur.postWallR})`,
  );
}
for (const row of measuredRows) {
  assert.ok(
    row.estShelfMm >= 0.35 && row.estShelfMm <= 0.68,
    `scale=${row.scale}에서 마진 선반 폭(${row.estShelfMm.toFixed(2)}mm)이 1.1mm로 벌어지지 않고 설정된 ~0.5mm를 유지한다`,
  );
}

assert.equal(gumballPatchSetsRadial({ marginSizeScale: 0.85 }), true);
assert.equal(gumballPatchSetsRadial({ postWidthScale: 0.8 }), true);
assert.equal(gumballPatchSetsRadial({ marginFilletRadiusMm: 0.5 }), false);

const keptOnFillet = retainLiveGumballParams(
  { postWidthScale: 1.25, marginFilletRadiusMm: 0.5 },
  { postWidthScale: 1.0 },
  { ...identityAbutmentEdit(), scale: [1.25, 1.25, 1] },
  { marginFilletRadiusMm: 0.5 },
);
assert.equal(keptOnFillet.postWidthScale, 1.0, "비-폭 패치는 라이브 검볼 배율을 중복 생성하지 않는다");

const keptOnRadial = retainLiveGumballParams(
  { postWidthScale: 1.25, marginSizeScale: 0.8 },
  { postWidthScale: 1.0 },
  { ...identityAbutmentEdit(), scale: [1.25, 1.25, 1] },
  { marginSizeScale: 0.8 },
);
assert.equal(keptOnRadial.postWidthScale, 1.25, "폭 패치는 clearBakedRadial 전에 현재 폭 배율을 함께 구워 넣는다");

const dummySession = new AbutmentDirectEditSession({
  getScene: () => null,
  getCamera: () => null,
  getRenderer: () => null,
  getHost: () => null,
  getDesigns: () => [],
  getAbutment: () => undefined,
  getCrown: () => undefined,
  getMargin: () => undefined,
  ui: {
    gumballOn: true,
    sculptOn: false,
    sculptGrow: 0.1,
    sculptReachMm: 1.5,
    selected: "17",
    readOnly: false,
  },
  onBadge: () => {},
  onCommit: () => {},
  onHistory: () => {},
});
dummySession.setEdit("17", {
  ...identityAbutmentEdit(),
  scale: [1.28, 1.22, 1.08],
  tiltLabialDeg: 5,
});
dummySession.clearBakedRadial(["17"]);
const afterClear = dummySession.editOf("17")!;
assert.deepEqual(afterClear.scale, [1, 1, 1.08], "가로 스케일만 [1,1]로 비우고 세로 스케일은 남긴다");
assert.equal(afterClear.tiltLabialDeg, 5);
dummySession.dispose();

console.log("abutment post width regen regression ok");
