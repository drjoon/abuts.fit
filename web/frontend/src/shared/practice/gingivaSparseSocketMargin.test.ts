import assert from "node:assert/strict";
import * as THREE from "three";

import { buildJawGingivaMarginProbe } from "./customAbutmentStlDesign";

/** 스캔바디 대삭제 소켓: 마진 직상방은 구멍, 원심 치은은 바깥에서만 잡힌다 → 연하 클램프가 살아 있어야 한다. */
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
      const z00 = zFn(x0, y0);
      const z10 = zFn(x1, y0);
      const z11 = zFn(x1, y1);
      const z01 = zFn(x0, y1);
      if (![z00, z10, z11, z01].every(Number.isFinite)) continue;
      if ([x0, x1].some((x) => [y0, y1].some((y) => Math.hypot(x, y) < 5.05))) continue;
      tris.push(x0, y0, z00, x1, y0, z10, x1, y1, z11);
      tris.push(x0, y0, z00, x1, y1, z11, x0, y1, z01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const holeR = 5.1;
const gingivaZ = 3.15;
const jaw = makeGridSurface(-12, 12, -12, 12, 64, (x, y) => {
  const r = Math.hypot(x, y);
  if (r < holeR) return Number.NaN;
  const mesialPad = 1.1 * Math.exp(-((x * x) / 10 + ((y - 6.0) * (y - 6.0)) / 2.2));
  return gingivaZ + mesialPad - 0.15 * Math.exp(-((r - holeR) * (r - holeR)) / 1.8);
});

const fixture = {
  toothNumber: "34",
  labialDir: [1, 0, 0] as const,
  mesialDir: [0, 1, 0] as const,
  scanbodyRadiusMm: 2.25,
  scanbodyHeightMm: 7.0,
  gingivaFloorMm: 2.8,
  fixturePose: {
    origin: [0, 0, 0] as const,
    axis: [0, 0, 1] as const,
    hexX: [1, 0, 0] as const,
    hexY: [0, 1, 0] as const,
  },
  connectionSpec: {
    prcConeTopMm: 1.0,
    originDiameterMm: 3.5,
  },
};

const probe = buildJawGingivaMarginProbe(jaw, fixture, "34");
assert.ok(probe, "대삭제 소켓에서도 치은 프로브가 만들어진다");

const marginR = 3.05;
const nLoop = 48;
const marginLoop = new Float32Array(nLoop * 3);
for (let i = 0; i < nLoop; i += 1) {
  const th = (i / nLoop) * Math.PI * 2;
  marginLoop[i * 3] = marginR * Math.cos(th);
  marginLoop[i * 3 + 1] = marginR * Math.sin(th);
  marginLoop[i * 3 + 2] = gingivaZ + 1.6;
}

const draped = probe!.drapeMarginLoopZ(marginLoop, {
  subgMinMm: 0.6,
  subgMaxMm: 1.4,
  scallopMm: 0.55,
});
assert.ok(draped && draped.length === nLoop, "대삭제 소켓 마진 Z 재투영이 성공한다");

let distalMaxZ = -Infinity;
let distalN = 0;
for (let i = 0; i < nLoop; i += 1) {
  const th = (i / nLoop) * Math.PI * 2;
  if (Math.sin(th) > -0.75) continue;
  distalMaxZ = Math.max(distalMaxZ, draped![i]!);
  distalN += 1;
}
assert.ok(distalN >= 6, "원심 섹터 샘플이 충분하다");
assert.ok(
  distalMaxZ <= gingivaZ - 0.45,
  `스캔바디 대삭제 소켓에서도 원심 마진(${distalMaxZ.toFixed(2)}mm)이 치은(${gingivaZ}mm) 연하 0.6mm 안으로 내려간다`,
);

jaw.dispose();
console.log("ok: sparse socket distal margin subgingival");
