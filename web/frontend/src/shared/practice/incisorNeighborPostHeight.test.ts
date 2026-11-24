// #11의 원심이 #12 어벗이면, 그 쪽 짧은 둔덕이 아니라 근심 자연치 절단연으로 포스트 높이를 잡는다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

import assert from "node:assert/strict";

import * as THREE from "three";

import { designCustomAbutmentStl } from "./customAbutmentStlDesign";

function makeFlatJaw() {
  const ging = -3.2;
  const bump = (x: number, y: number, cx: number, cy: number, crownH: number, bl: number, md: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const c = (dx * dx) / (bl * bl) + (dy * dy) / (md * md);
    if (c >= 1) return ging;
    return ging - crownH * Math.sqrt(1 - c);
  };
  const zAt = (x: number, y: number) =>
    Math.min(ging, bump(x, y, 0, 7.2, 11.2, 3.3, 3.6), bump(x, y, 0, -6.2, 7.6, 3.1, 3.4));
  const nx = 48;
  const ny = 80;
  const x0 = -8;
  const x1 = 8;
  const y0 = -14;
  const y1 = 14;
  const tris: number[] = [];
  const at = (ix: number, iy: number) => {
    const x = x0 + ((x1 - x0) * ix) / nx;
    const y = y0 + ((y1 - y0) * iy) / ny;
    return [x, y, zAt(x, y)] as const;
  };
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      const p00 = at(ix, iy);
      const p10 = at(ix + 1, iy);
      const p11 = at(ix + 1, iy + 1);
      const p01 = at(ix, iy + 1);
      tris.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const fixture11 = {
  toothNumber: "11",
  jaw: "upper" as const,
  fixturePose: {
    origin: [0, 0, 0] as [number, number, number],
    axis: [0, 0, -1] as [number, number, number],
    hexX: [1, 0, 0] as [number, number, number],
    hexY: [0, 1, 0] as [number, number, number],
  },
  scanbodyTop: [0, 0, -7] as [number, number, number],
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
    prcConeTopMm: 1,
    screwLowerDiameterMm: 2.1,
    screwUpperDiameterMm: 2.45,
  },
  archOcclusalDir: [0, 0, -1] as [number, number, number],
  labialDir: [1, 0, 0] as [number, number, number],
  mesialDir: [0, 1, 0] as [number, number, number],
};

const fixture12 = {
  ...fixture11,
  toothNumber: "12",
  fixturePose: { ...fixture11.fixturePose, origin: [0, -12, 0] as [number, number, number] },
  scanbodyTop: [0, -12, -7] as [number, number, number],
};

const jaw = makeFlatJaw();
const works = [
  { toothNumber: "11", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] as string[] },
  { toothNumber: "12", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] as string[] },
];

const [alone, withNeighbor] = await Promise.all([
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: null,
    toothWorks: works,
  }),
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: null,
    neighbors: [fixture12],
    toothWorks: works,
  }),
]);

const aloneH = alone.metrics.postHeightMm;
const neighborH = withNeighbor.metrics.postHeightMm;

assert.ok(
  neighborH > aloneH - 0.45 && neighborH > 8,
  `#11 원심 #12가 매칭된 어벗이어도 그 쪽 짧은 둔덕으로 포스트를 낮추지 않는다(치아만 ${aloneH}mm, 스캔바디 이웃 ${neighborH}mm)`,
);

jaw.dispose();
alone.worldGeometry.dispose();
alone.predictedCrownWorldGeometry.dispose();
withNeighbor.worldGeometry.dispose();
withNeighbor.predictedCrownWorldGeometry.dispose();

// 바로 옆 자연치가 없고 대합은 가까울 때, 멀리 있는 치아 교합면 높이로 포스트를 잡는다.
function grid(zAt: (x: number, y: number) => number, x0: number, x1: number, y0: number, y1: number, nx: number, ny: number) {
  const tris: number[] = [];
  const at = (ix: number, iy: number) => {
    const x = x0 + ((x1 - x0) * ix) / nx;
    const y = y0 + ((y1 - y0) * iy) / ny;
    return [x, y, zAt(x, y)] as const;
  };
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      const p00 = at(ix, iy);
      const p10 = at(ix + 1, iy);
      const p11 = at(ix + 1, iy + 1);
      const p01 = at(ix, iy + 1);
      tris.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const ging = -3.2;
// 전치 절단연: 순측으로 좁고 높게. 여러 근원심 위치에 Spee처럼 둔다.
const incisal = (x: number, y: number, cy: number, crownH: number) => {
  const dx = x - 1.1;
  const dy = y - cy;
  const c = (dx * dx) / (2.6 * 2.6) + (dy * dy) / (3.2 * 3.2);
  if (c >= 1) return ging;
  return ging - crownH * Math.sqrt(1 - c);
};
const archJaw = grid(
  (x, y) =>
    Math.min(
      ging,
      incisal(x, y, 20, 10.4),
      incisal(x, y, 26, 10.1),
      incisal(x, y, -20, 10.2),
      incisal(x, y, -26, 9.9),
    ),
  -8,
  8,
  -34,
  34,
  40,
  140,
);
const closeOpp = grid(() => -6.1, -7, 7, -7, 7, 16, 16);
const planePost = await designCustomAbutmentStl({
  fixture: fixture11,
  jawGeometry: archJaw,
  opposingGeometry: closeOpp,
  neighbors: [fixture12],
  toothWorks: [
    { toothNumber: "11", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
    { toothNumber: "12", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] },
  ],
});
assert.ok(
  planePost.metrics.postHeightMm > 5.8,
  `전치 절단연으로 그린 악궁 교합 곡면으로 포스트를 올린다(${planePost.metrics.postHeightMm}mm). 가까운 대합만으로 2mm대에 두지 않는다`,
);
archJaw.dispose();
closeOpp.dispose();
planePost.worldGeometry.dispose();
planePost.predictedCrownWorldGeometry.dispose();
