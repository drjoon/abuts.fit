import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

import { removeGingivaCoveringAboveMargin } from "./crownExportScanMerge";
import type { DesignedCustomAbutment } from "./customAbutmentStlDesign";
import type { MatchedScanbodyFixture } from "./customAbutmentScanbodyMatch";

function makeFixture(): MatchedScanbodyFixture {
  return {
    toothNumber: "16",
    jaw: "upper",
    fixturePose: {
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      hexX: [1, 0, 0],
      hexY: [0, 1, 0],
    },
    scanbodyTop: [0, 0, 8],
    scanbodyRadiusMm: 2.5,
    scanbodyHeightMm: 8,
    gingivaFloorMm: 3.2,
    rmsMm: 0.05,
    topCoverage: 1,
    matchedLibraryLabel: "test",
    connectionSpec: {
      manufacturer: "OSSTEM",
      brand: "TS3",
      family: "REGULAR",
      type: "Hex",
      originDiameterMm: 3.35,
      hexSizeMm: 2.5,
      l2Mm: 2.4,
      prcConeTopMm: 0.3,
      screwLowerDiameterMm: 2.0,
      screwUpperDiameterMm: 2.2,
    },
    archOcclusalDir: [0, 0, 1],
    labialDir: [1, 0, 0],
    mesialDir: [0, 1, 0],
  };
}

function makeDesign(marginZ = 2): DesignedCustomAbutment {
  const sectors = 36;
  const marginLoopLocal = new Float32Array(sectors * 3);
  for (let i = 0; i < sectors; i += 1) {
    const phi = (i / sectors) * Math.PI * 2;
    marginLoopLocal[i * 3] = Math.cos(phi) * 3;
    marginLoopLocal[i * 3 + 1] = Math.sin(phi) * 3;
    marginLoopLocal[i * 3 + 2] = marginZ;
  }
  const localPositions = new Float32Array([
    3.2, 0, marginZ + 0.2, 0, 3.2, marginZ + 0.2, -3.2, 0, marginZ + 0.2,
    3.2, 0, marginZ + 2, 0, 3.2, marginZ + 2, -3.2, 0, marginZ + 2,
  ]);
  return {
    toothNumber: "16",
    jaw: "upper",
    fileName: "t.stl",
    localPositions,
    crownLocalPositions: new Float32Array(0),
    marginLoopLocal,
    stlBlob: new Blob(),
    worldGeometry: new THREE.BufferGeometry(),
    predictedCrownWorldGeometry: new THREE.BufferGeometry(),
    marginLoopWorld: marginLoopLocal.slice(),
    fixture: makeFixture(),
    params: {} as DesignedCustomAbutment["params"],
    metrics: {} as DesignedCustomAbutment["metrics"],
  };
}

describe("removeGingivaCoveringAboveMargin", () => {
  it("마진 위·어벗 반경 안 치은 삼각형만 제거한다", () => {
    const design = makeDesign(2);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([
      1, 0, 3, 0, 1, 3, -1, 0, 3,
      8, 0, 3, 8, 1, 3, 7, 0, 3,
      1, 0, 0.5, 0, 1, 0.5, -1, 0, 0.5,
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    const out = removeGingivaCoveringAboveMargin(geo, [design]);
    assert.notEqual(out, geo);
    const idx = out.getIndex();
    assert.ok(idx);
    assert.equal(idx!.count, 6);
  });

  it("덮을 치은이 없으면 원본을 반환한다", () => {
    const design = makeDesign(2);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([8, 0, 3, 8, 1, 3, 7, 1, 3, 7, 0, 3]);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    assert.equal(removeGingivaCoveringAboveMargin(geo, [design]), geo);
  });
});
