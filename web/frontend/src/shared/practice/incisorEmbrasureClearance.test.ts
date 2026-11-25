// 절치 삽입축이 대합 이 사이(근원심)를 향할 때 옆 대합 교합면을 높이 상한으로 쓴다.
import assert from "node:assert/strict";

import * as THREE from "three";

import { designCustomAbutmentStl } from "./customAbutmentStlDesign";

function grid(zAt: (x: number, y: number) => number, x0: number, x1: number, y0: number, y1: number, n = 28) {
  const tris: number[] = [];
  for (let ix = 0; ix < n; ix += 1) {
    for (let iy = 0; iy < n; iy += 1) {
      const xa = x0 + ((x1 - x0) * ix) / n;
      const xb = x0 + ((x1 - x0) * (ix + 1)) / n;
      const ya = y0 + ((y1 - y0) * iy) / n;
      const yb = y0 + ((y1 - y0) * (iy + 1)) / n;
      const p00: [number, number, number] = [xa, ya, zAt(xa, ya)];
      const p10: [number, number, number] = [xb, ya, zAt(xb, ya)];
      const p11: [number, number, number] = [xb, yb, zAt(xb, yb)];
      const p01: [number, number, number] = [xa, yb, zAt(xa, yb)];
      tris.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const fixture = {
  toothNumber: "32",
  jaw: "lower" as const,
  fixturePose: {
    origin: [0, 0, 0] as [number, number, number],
    axis: [0, 0, 1] as [number, number, number],
    hexX: [1, 0, 0] as [number, number, number],
    hexY: [0, 1, 0] as [number, number, number],
  },
  scanbodyTop: [0, 0, 7] as [number, number, number],
  scanbodyRadiusMm: 2.25,
  scanbodyHeightMm: 7,
  gingivaFloorMm: 2.8,
  rmsMm: 0.02,
  topCoverage: 0.95,
  matchedLibraryLabel: "지오메디 Ø4.5×7mm",
  connectionSpec: {
    manufacturer: "MEGAGEN",
    brand: "ARi",
    family: "Regular",
    type: "헥스",
    originDiameterMm: 3.35,
    hexSizeMm: 2.5,
    l2Mm: 2.75,
    prcConeTopMm: 1,
    screwLowerDiameterMm: 2.1,
    screwUpperDiameterMm: 2.45,
  },
  archOcclusalDir: [0, 0, 1] as [number, number, number],
  labialDir: [1, 0, 0] as [number, number, number],
  mesialDir: [0, 1, 0] as [number, number, number],
};

const jaw = grid((x, y) => {
  const r = Math.hypot(x, y);
  if (r < 2.4) return 0.4;
  return 2.6 + 0.15 * Math.sin(x) * Math.cos(y);
}, -14, 14, -14, 14, 36);

// 삽입축 위는 비고, 근심 8mm 옆에만 대합 교합면이 있다.
const embrasureOpp = grid(() => 7.4, -3.2, 3.2, 6.2, 10.2, 16);

const works = [
  { toothNumber: "32", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["31"] },
  { toothNumber: "31", prosthesisType: "브리지", customAbutment: false, bridgeLinkedTeeth: ["32"] },
];

const [openDesign, cappedDesign] = await Promise.all([
  designCustomAbutmentStl({
    fixture,
    jawGeometry: jaw,
    opposingGeometry: null,
    toothWorks: works,
  }),
  designCustomAbutmentStl({
    fixture,
    jawGeometry: jaw,
    opposingGeometry: embrasureOpp,
    toothWorks: works,
  }),
]);

assert.equal(
  openDesign.metrics.occlusalClearanceMm,
  null,
  "대합이 없으면 대합 거리는 비운다",
);
assert.ok(
  cappedDesign.metrics.occlusalClearanceMm != null && cappedDesign.metrics.occlusalClearanceMm >= 0.7,
  `근심으로 빗난 대합도 대합 거리(${cappedDesign.metrics.occlusalClearanceMm})를 잰다`,
);
assert.ok(
  cappedDesign.metrics.postHeightMm < openDesign.metrics.postHeightMm - 0.8,
  `옆 대합 교합면보다 포스트를 올리지 않는다 (${cappedDesign.metrics.postHeightMm}mm < ${openDesign.metrics.postHeightMm}mm)`,
);

jaw.dispose();
embrasureOpp.dispose();
openDesign.worldGeometry.dispose();
openDesign.predictedCrownWorldGeometry.dispose();
cappedDesign.worldGeometry.dispose();
cappedDesign.predictedCrownWorldGeometry.dispose();
