// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts

import assert from "node:assert/strict";

import * as THREE from "three";

import {
  buildOpposingClearanceProbe,
  identityAbutmentEdit,
  refitLocalPositions,
} from "../components/practice/abutmentDirectEdit";
import { designCustomAbutmentStl } from "./customAbutmentStlDesign";

const ARCH_ANG = 1.35;
const IMPLANT_I = -1;

function archCenter(i: number): [number, number] {
  const a = (i / 6) * ARCH_ANG;
  return [40 * Math.cos(a) - 6, 22 * Math.sin(a)];
}

const [originX, originY] = archCenter(IMPLANT_I);

const TOOTH_I: number[] = [];
for (let i = -6; i <= 6; i += 1) if (i !== IMPLANT_I) TOOTH_I.push(i);

function makeArchStrip(zAt: (x: number, y: number) => number) {
  const sSteps = 96;
  const uSteps = 20;
  const sMin = -6.15;
  const sMax = 6.15;
  const uMin = -8;
  const uMax = 7;
  const tris: number[] = [];
  const at = (is: number, iu: number) => {
    const s = sMin + ((sMax - sMin) * is) / sSteps;
    const u = uMin + ((uMax - uMin) * iu) / uSteps;
    const a = (s / 6) * ARCH_ANG;
    const x = 40 * Math.cos(a) - 6 - originX + Math.cos(a) * u;
    const y = 22 * Math.sin(a) - originY + Math.sin(a) * u;
    return [x, y, zAt(x, y)] as const;
  };
  for (let is = 0; is < sSteps; is += 1) {
    for (let iu = 0; iu < uSteps; iu += 1) {
      const p00 = at(is, iu);
      const p10 = at(is + 1, iu);
      const p11 = at(is + 1, iu + 1);
      const p01 = at(is, iu + 1);
      tris.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

function makeJawZ(leanMm: number) {
  return (x: number, y: number) => {
    const px = x + originX;
    const py = y + originY;
    let bestD = 1e9;
    let bestI = 0;
    for (const i of TOOTH_I) {
      const [tx, ty] = archCenter(i);
      const d = (px - tx) ** 2 + (py - ty) ** 2;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const a = (bestI / 6) * ARCH_ANG;
    const [tx, ty] = archCenter(bestI);
    const dx = px - tx;
    const dy = py - ty;
    const u = dx * Math.cos(a) + dy * Math.sin(a);
    const v = -dx * Math.sin(a) + dy * Math.cos(a);
    const anterior = Math.abs(bestI) <= 2;
    const bl = anterior ? 3.35 : 4.5;
    const md = anterior ? 3.7 : 4.8;
    const ging = -3.2 - 0.12 * Math.exp(-bestD / 40);
    const crownH = anterior ? 7.5 : 5.8;
    // 절단연 중심이 치경보다 leanMm만큼 순측. lean 0이면 곧은 타원과 같다.
    const shear = anterior ? leanMm : 0;
    const invBl2 = 1 / (bl * bl);
    const c = (v * v) / (md * md);
    const qa = invBl2 * shear * shear;
    const qb = 1 - 2 * invBl2 * u * shear;
    const qc = invBl2 * u * u + c - 1;
    let s = 0;
    if (qa < 1e-8) {
      s = qb > 1e-8 ? -qc / qb : 0;
    } else {
      const disc = qb * qb - 4 * qa * qc;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        s = Math.max((-qb + root) / (2 * qa), (-qb - root) / (2 * qa));
      }
    }
    if (!(s > 0)) return ging;
    s = Math.min(1, s);
    const uAxis = u - shear * s;
    const hNorm = s;
    const crown = crownH * hNorm;
    const lingualCut = uAxis < -0.2 ? Math.max(0, -uAxis - 0.2) * 0.45 * hNorm : 0;
    return ging - Math.max(0.15, crown - lingualCut);
  };
}

function deepZ(x: number, y: number) {
  if (x < -1.25 && x > -7.5 && Math.abs(y) < 4.2) return -6.35;
  if (x < 0.25 && Math.abs(y) < 4.2) {
    const t = (x + 1.25) / 1.5;
    return -6.35 + (-13.4 + 6.35) * Math.min(1, Math.max(0, t));
  }
  return -13.4;
}

function sectionMetrics(positions: Float32Array) {
  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zMax = Math.max(zMax, positions[i]!);
  const collect = (z0: number, z1: number) => {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    let n = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      if (z < z0 || z > z1 || Math.hypot(x, y) < 1.2) continue;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      n += 1;
    }
    return { n, xMin, xMax, yMin, yMax, bl: xMax - xMin, md: yMax - yMin };
  };
  const high = collect(zMax - 1.05, zMax - 0.25);
  const low = collect(zMax - 3.1, zMax - 2.15);
  const retreatNeg = high.n > 8 && low.n > 8 ? high.xMin - low.xMin : Number.NaN;
  const retreatPos = high.n > 8 && low.n > 8 ? low.xMax - high.xMax : Number.NaN;
  const meanX = (z0: number, z1: number) => {
    let sx = 0;
    let n = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      if (z < z0 || z > z1 || Math.hypot(x, y) < 1.2) continue;
      sx += x;
      n += 1;
    }
    return n > 12 ? sx / n : Number.NaN;
  };
  const highX = meanX(zMax - 0.9, zMax - 0.2);
  const lowX = meanX(zMax - 3.6, zMax - 2.6);
  return {
    zMax,
    nHigh: high.n,
    bl: high.bl,
    md: high.md,
    lingualInset: Math.max(retreatNeg, retreatPos),
    labialRise: highX - lowX,
  };
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

const jaw = makeArchStrip(makeJawZ(0));
const jawLean = makeArchStrip(makeJawZ(5.4));
const deep = makeArchStrip(deepZ);
const flatClose = makeArchStrip(() => -6.35);
const flatMid = makeArchStrip(() => -9.2);
const works11 = [{ toothNumber: "11", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }];
const works22 = [{ toothNumber: "22", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }];

const [deep11, close11, mid22, open11] = await Promise.all([
  designCustomAbutmentStl({ fixture: fixture11, jawGeometry: jaw, opposingGeometry: deep, toothWorks: works11 }),
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: flatClose,
    toothWorks: works11,
  }),
  designCustomAbutmentStl({
    fixture: { ...fixture11, toothNumber: "22" },
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works22,
  }),
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jawLean,
    opposingGeometry: null,
    toothWorks: works11,
  }),
]);

const deepShape = sectionMetrics(deep11.solidBodyLocalPositions!);
const closeShape = sectionMetrics(close11.solidBodyLocalPositions!);
const midShape = sectionMetrics(mid22.solidBodyLocalPositions!);
const openShape = sectionMetrics(open11.solidBodyLocalPositions!);

console.log(
  JSON.stringify(
    {
      deep: { h: deep11.metrics.postHeightMm, clear: deep11.metrics.occlusalClearanceMm, ...deepShape },
      close: { h: close11.metrics.postHeightMm, clear: close11.metrics.occlusalClearanceMm, ...closeShape },
      mid: { h: mid22.metrics.postHeightMm, clear: mid22.metrics.occlusalClearanceMm, ...midShape },
      open: { h: open11.metrics.postHeightMm, clear: open11.metrics.occlusalClearanceMm, ...openShape },
    },
    null,
    2,
  ),
);

assert.ok(
  deep11.metrics.postHeightMm > close11.metrics.postHeightMm + 1.3,
  `딥바이트 #11 포스트(${deep11.metrics.postHeightMm}mm)는 설측 대합만으로 자른 높이(${close11.metrics.postHeightMm}mm)보다 길다`,
);
assert.ok(
  deep11.metrics.occlusalClearanceMm != null && deep11.metrics.occlusalClearanceMm >= 0.45,
  `딥바이트 #11 최근접 대합 거리(${deep11.metrics.occlusalClearanceMm}mm)는 설측 면이 대합에 파고들지 않는다`,
);
assert.ok(
  deepShape.bl < deepShape.md * 0.85 && deepShape.bl < 3.6 && deepShape.bl > 1.25,
  `#11 상단은 순설(${deepShape.bl.toFixed(2)}mm)이 근원심(${deepShape.md.toFixed(2)}mm)보다 좁은 삽형이다`,
);
assert.ok(
  deepShape.lingualInset >= 0.55,
  `#11 설측은 치경부 대비 상단으로 사선 삭제(${deepShape.lingualInset.toFixed(2)}mm)된다`,
);
assert.ok(
  mid22.metrics.postHeightMm < deep11.metrics.postHeightMm - 0.8,
  `#22 균일 대합 높이(${mid22.metrics.postHeightMm}mm)는 딥바이트로 늘린 #11(${deep11.metrics.postHeightMm}mm)까지 따라 올라가지 않는다`,
);
assert.ok(
  mid22.metrics.occlusalClearanceMm != null && mid22.metrics.occlusalClearanceMm >= 1.15,
  `#22 대합 거리(${mid22.metrics.occlusalClearanceMm}mm)는 유지된다`,
);
assert.ok(
  midShape.lingualInset >= 0.55,
  `#22 설측도 같은 사선 삭제(${midShape.lingualInset.toFixed(2)}mm)를 한다`,
);
assert.ok(
  midShape.bl < midShape.md * 0.9 && midShape.bl > 1.5,
  `#22 상단도 순설(${midShape.bl.toFixed(2)}mm)이 근원심(${midShape.md.toFixed(2)}mm)보다 좁다`,
);
assert.ok(
  open11.metrics.postHeightMm > 5.8 && open11.metrics.postHeightMm < 11,
  `대합이 없고 인접 절단연이 순측으로 빠져도 포스트(${open11.metrics.postHeightMm}mm)는 인접치 길이를 따른다`,
);
assert.ok(
  openShape.labialRise > 0.55,
  `순측으로 기운 인접치의 각도를 포스트가 따른다(상단-치경 순측 이동 ${openShape.labialRise.toFixed(2)}mm)`,
);

// 삽입축 옆의 수직 대합 벽은 교합면이 아니다. 그 최하단으로 포스트를 2mm대로 내리지 않는다.
function makeVerticalWallOpp() {
  const x = 1.05;
  const y0 = -1.8;
  const y1 = 1.8;
  const z0 = -2.5;
  const z1 = -6.4;
  const tris = [
    x, y0, z0, x, y1, z0, x, y1, z1,
    x, y0, z0, x, y1, z1, x, y0, z1,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const verticalWallOpp = makeVerticalWallOpp();
const wall22 = await designCustomAbutmentStl({
  fixture: { ...fixture11, toothNumber: "22" },
  jawGeometry: jaw,
  opposingGeometry: verticalWallOpp,
  toothWorks: works22,
});
assert.ok(
  wall22.metrics.postHeightMm > 5.5,
  `수직 대합 벽만 있을 때 #22 포스트(${wall22.metrics.postHeightMm}mm)는 인접 절단연을 따른다`,
);
assert.ok(
  wall22.metrics.occlusalClearanceMm != null && wall22.metrics.occlusalClearanceMm < 3,
  `수직 벽과의 최근접(${wall22.metrics.occlusalClearanceMm}mm)은 윗면 축 간격이 아니라 표면 거리다`,
);
verticalWallOpp.dispose();
wall22.worldGeometry.dispose();
wall22.predictedCrownWorldGeometry.dispose();

// 악궁·수평피개: 대합 교합면이 삽입축(+Z) 바로 위가 아니라 순측(+u)으로 빗나간 경우.
function makeArchOffsetOpposing() {
  const sSteps = 64;
  const uSteps = 14;
  const sMin = -5.5;
  const sMax = 5.5;
  const uMin = 2.6;
  const uMax = 7.2;
  const tris: number[] = [];
  const at = (is: number, iu: number) => {
    const s = sMin + ((sMax - sMin) * is) / sSteps;
    const u = uMin + ((uMax - uMin) * iu) / uSteps;
    const a = (s / 6) * ARCH_ANG;
    const x = 40 * Math.cos(a) - 6 - originX + Math.cos(a) * u;
    const y = 22 * Math.sin(a) - originY + Math.sin(a) * u;
    return [x, y, -7.1] as const;
  };
  for (let is = 0; is < sSteps; is += 1) {
    for (let iu = 0; iu < uSteps; iu += 1) {
      const p00 = at(is, iu);
      const p10 = at(is + 1, iu);
      const p11 = at(is + 1, iu + 1);
      const p01 = at(is, iu + 1);
      tris.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const archOffsetOpp = makeArchOffsetOpposing();
const archOffset12 = await designCustomAbutmentStl({
  fixture: { ...fixture11, toothNumber: "12" },
  jawGeometry: jaw,
  opposingGeometry: archOffsetOpp,
  toothWorks: [{ toothNumber: "12", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }],
});
assert.ok(
  archOffset12.metrics.occlusalClearanceMm != null && archOffset12.metrics.occlusalClearanceMm >= 0.7,
  `악궁 순설로 빗나간 대합(#12)도 대합 거리(${archOffset12.metrics.occlusalClearanceMm})를 잰다`,
);
assert.ok(
  archOffset12.metrics.postHeightMm < open11.metrics.postHeightMm - 0.4,
  `순설 빗나간 대합이 있으면 포스트(${archOffset12.metrics.postHeightMm}mm)가 대합 없음(${open11.metrics.postHeightMm}mm)보다 짧다`,
);
archOffsetOpp.dispose();
archOffset12.worldGeometry.dispose();
archOffset12.predictedCrownWorldGeometry.dispose();

function makePalatalOnlyOpposing() {
  const sSteps = 64;
  const uSteps = 12;
  const sMin = -5.5;
  const sMax = 5.5;
  const uMin = -8.5;
  const uMax = -0.85;
  const tris: number[] = [];
  const at = (is: number, iu: number) => {
    const s = sMin + ((sMax - sMin) * is) / sSteps;
    const u = uMin + ((uMax - uMin) * iu) / uSteps;
    const a = (s / 6) * ARCH_ANG;
    const x = 40 * Math.cos(a) - 6 - originX + Math.cos(a) * u;
    const y = 22 * Math.sin(a) - originY + Math.sin(a) * u;
    return [x, y, -5.8] as const;
  };
  for (let is = 0; is < sSteps; is += 1) {
    for (let iu = 0; iu < uSteps; iu += 1) {
      const p00 = at(is, iu);
      const p10 = at(is + 1, iu);
      const p11 = at(is + 1, iu + 1);
      const p01 = at(is, iu + 1);
      tris.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

const palatalOnlyOpp = makePalatalOnlyOpposing();
const asymJaw22 = makeArchStrip((x, y) => {
  const base = makeJawZ(0)(x, y);
  // 원심 쪽(#23 위치)은 절단연이 2.4mm 더 짧은 비대칭 인접치
  return y < -2.2 ? Math.max(base, -8.3) : base;
});
const [palatalOpen11, asym22] = await Promise.all([
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: palatalOnlyOpp,
    toothWorks: works11,
  }),
  designCustomAbutmentStl({
    fixture: { ...fixture11, toothNumber: "22" },
    jawGeometry: asymJaw22,
    opposingGeometry: null,
    toothWorks: works22,
  }),
]);
assert.ok(
  palatalOpen11.metrics.postHeightMm > close11.metrics.postHeightMm + 2.2,
  `설측에만 대합치가 있고 순측이 비어 있는 수평피개·딥바이트 #11(${palatalOpen11.metrics.postHeightMm}mm)도 인접치 길이까지 올라간다`,
);
assert.ok(
  asym22.metrics.postHeightMm < palatalOpen11.metrics.postHeightMm - 0.5 &&
    !asym22.metrics.supragingivalRaisedForStrength,
  `측절치 #22(${asym22.metrics.postHeightMm}mm)는 짧은 쪽 인접치와 측절치 단차를 따라 과도하게 길어지거나 치은연상으로 튀지 않는다`,
);
palatalOnlyOpp.dispose();
asymJaw22.dispose();
palatalOpen11.worldGeometry.dispose();
palatalOpen11.predictedCrownWorldGeometry.dispose();
asym22.worldGeometry.dispose();
asym22.predictedCrownWorldGeometry.dispose();

const bridgeOpp = makeArchStrip((x, y) => (Math.hypot(x, y) < 4.2 ? -6.2 : -16));
const fixture34 = { ...fixture11, toothNumber: "34", jaw: "lower" as const };
const fixture35 = {
  ...fixture34,
  toothNumber: "35",
  fixturePose: { ...fixture34.fixturePose, origin: [0, 9, 0] as [number, number, number] },
  scanbodyTop: [0, 9, -7] as [number, number, number],
};
const bridgeWorks = [
  { toothNumber: "34", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["34", "35"] },
  { toothNumber: "35", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["34", "35"] },
];
const singleWorks35 = [
  { toothNumber: "35", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] as string[] },
];
const [bridge34, bridge35, single35] = await Promise.all([
  designCustomAbutmentStl({
    fixture: fixture34,
    jawGeometry: jaw,
    opposingGeometry: bridgeOpp,
    neighbors: [fixture35],
    toothWorks: bridgeWorks,
  }),
  designCustomAbutmentStl({
    fixture: fixture35,
    jawGeometry: jaw,
    opposingGeometry: bridgeOpp,
    neighbors: [fixture34],
    toothWorks: bridgeWorks,
  }),
  designCustomAbutmentStl({
    fixture: fixture35,
    jawGeometry: jaw,
    opposingGeometry: bridgeOpp,
    neighbors: [fixture34],
    toothWorks: singleWorks35,
  }),
]);
console.log(
  JSON.stringify({
    bridge34: bridge34.metrics.postHeightMm,
    bridge35: bridge35.metrics.postHeightMm,
    single35: single35.metrics.postHeightMm,
  }),
);
assert.ok(
  Math.abs(bridge34.metrics.postHeightMm - bridge35.metrics.postHeightMm) < 0.65,
  `#34(${bridge34.metrics.postHeightMm}mm)와 #35(${bridge35.metrics.postHeightMm}mm) 브리지 포스트 높이가 비슷하다`,
);
assert.ok(
  bridge35.metrics.postHeightMm < single35.metrics.postHeightMm - 1.2 &&
    bridge35.metrics.postHeightMm < bridge34.metrics.postHeightMm + 0.65,
  `#35 브리지 높이(${bridge35.metrics.postHeightMm}mm)는 대합이 먼 단독(${single35.metrics.postHeightMm}mm)이 아니라 짧은 #34 쪽으로 맞춘다`,
);
bridge34.worldGeometry.dispose();
bridge34.predictedCrownWorldGeometry.dispose();
bridge35.worldGeometry.dispose();
bridge35.predictedCrownWorldGeometry.dispose();
single35.worldGeometry.dispose();
single35.predictedCrownWorldGeometry.dispose();
bridgeOpp.dispose();

function measureMdSilhouetteTaperDeg(
  positions: Float32Array,
  fixture: {
    fixturePose: { hexX: readonly number[]; hexY: readonly number[]; axis: readonly number[] };
    mesialDir?: readonly number[];
  },
  cuffMaxMm: number,
) {
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const pose = fixture.fixturePose;
  const mesW = fixture.mesialDir ?? pose.hexY;
  const mesLocalRaw = [dot(mesW, pose.hexX), dot(mesW, pose.hexY), dot(mesW, pose.axis)];
  const mesLen = Math.hypot(mesLocalRaw[0]!, mesLocalRaw[1]!) || 1;
  const mvx = mesLocalRaw[0]! / mesLen;
  const mvy = mesLocalRaw[1]! / mesLen;

  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zMax = Math.max(zMax, positions[i]!);
  const zBase = cuffMaxMm + 0.7;
  const zTop = Math.min(zMax - 1.4, zBase + 2.6);
  const slices: Array<{ z: number; vMin: number; vMax: number }> = [];
  for (let s = 0; s <= 8; s += 1) {
    const z = zBase + ((zTop - zBase) * s) / 8;
    let vMin = Infinity;
    let vMax = -Infinity;
    let n = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 2]! - z) > 0.14) continue;
      const v = positions[i]! * mvx + positions[i + 1]! * mvy;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
      n += 1;
    }
    if (n > 15) slices.push({ z, vMin, vMax });
  }
  const linSlope = (xs: number[], ys: number[]) => {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i += 1) {
      num += (xs[i]! - mx) * (ys[i]! - my);
      den += (xs[i]! - mx) ** 2;
    }
    return num / Math.max(den, 1e-8);
  };
  const zs = slices.map((s) => s.z);
  const cvSl = linSlope(zs, slices.map((s) => (s.vMax + s.vMin) * 0.5));
  const mesDeg = (Math.atan(-linSlope(zs, slices.map((s) => s.vMax)) + cvSl) * 180) / Math.PI;
  const disDeg = (Math.atan(linSlope(zs, slices.map((s) => s.vMin)) - cvSl) * 180) / Math.PI;
  const mdHalfDeg =
    (Math.atan(-linSlope(zs, slices.map((s) => (s.vMax - s.vMin) * 0.5))) * 180) / Math.PI;
  return { mesDeg, disDeg, mdHalfDeg };
}

const [taper2Deg11, taper35Deg11] = await Promise.all([
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: deep,
    toothWorks: works11,
    params: { postTaperLink: 0, postTaperDeg: 2.0 },
    explicitParams: { postTaperLink: 0, postTaperDeg: 2.0 },
  }),
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: deep,
    toothWorks: works11,
    params: { postTaperLink: 0, postTaperDeg: 3.5 },
    explicitParams: { postTaperLink: 0, postTaperDeg: 3.5 },
  }),
]);
const deepTaper = measureMdSilhouetteTaperDeg(
  deep11.solidBodyLocalPositions!,
  deep11.fixture,
  deep11.metrics.cuffHeightMaxMm,
);
const taper2Meas = measureMdSilhouetteTaperDeg(
  taper2Deg11.solidBodyLocalPositions!,
  taper2Deg11.fixture,
  taper2Deg11.metrics.cuffHeightMaxMm,
);
const taper35Meas = measureMdSilhouetteTaperDeg(
  taper35Deg11.solidBodyLocalPositions!,
  taper35Deg11.fixture,
  taper35Deg11.metrics.cuffHeightMaxMm,
);
console.log(
  JSON.stringify({
    linked11: { panel: deep11.metrics.postTaperDeg, ...deepTaper },
    unlinked2: { panel: taper2Deg11.metrics.postTaperDeg, ...taper2Meas },
    unlinked35: { panel: taper35Deg11.metrics.postTaperDeg, ...taper35Meas },
  }),
);
assert.ok(
  taper2Deg11.metrics.postTaperDeg === 2.0 &&
    Math.abs(taper2Meas.mdHalfDeg - 2.0) <= 0.4 &&
    taper2Meas.mesDeg >= 1.75 &&
    taper2Meas.disDeg >= 1.75 &&
    Math.abs(taper2Meas.mesDeg - taper2Meas.disDeg) <= 0.5,
  `전치 2° 설정 시 실제 근원심 양쪽 벽(${taper2Meas.mesDeg.toFixed(2)}°/${taper2Meas.disDeg.toFixed(2)}°, 평균 ${taper2Meas.mdHalfDeg.toFixed(2)}°)이 패널값(2.0°)과 대칭 일치한다`,
);
assert.ok(
  taper35Deg11.metrics.postTaperDeg === 3.5 &&
    Math.abs(taper35Meas.mdHalfDeg - 3.5) <= 0.45 &&
    taper35Meas.mdHalfDeg > taper2Meas.mdHalfDeg + 1.1,
  `전치 3.5° 설정 시 실제 근원심 테이퍼(${taper35Meas.mdHalfDeg.toFixed(2)}°)가 패널값(3.5°)을 따라 커진다`,
);
assert.ok(
  Math.abs(deepTaper.mdHalfDeg - deep11.metrics.postTaperDeg) <= 0.45 &&
    Math.abs(deepTaper.mesDeg - deepTaper.disDeg) <= 0.5,
  `전치 기본 연동 상태에서도 실제 근원심 테이퍼(${deepTaper.mdHalfDeg.toFixed(2)}°)가 패널값(${deep11.metrics.postTaperDeg}°)과 대칭 일치한다`,
);
taper2Deg11.worldGeometry.dispose();
taper2Deg11.predictedCrownWorldGeometry.dispose();
taper35Deg11.worldGeometry.dispose();
taper35Deg11.predictedCrownWorldGeometry.dispose();

// 전치부(절치·견치) 설측 사면은 마진에서 사면이 시작되는 높이. 단일 평면 검증.
function measureLingualPlaneFlatnessMm(
  positions: Float32Array,
  fixture: {
    fixturePose: { hexX: readonly number[]; hexY: readonly number[]; axis: readonly number[] };
    labialDir?: readonly number[];
    mesialDir?: readonly number[];
  },
  zSlice: number,
): { span: number; grooveDepth: number } {
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const pose = fixture.fixturePose;
  const labW = fixture.labialDir ?? pose.hexX;
  const mesW = fixture.mesialDir ?? pose.hexY;
  const labRaw = [dot(labW, pose.hexX), dot(labW, pose.hexY)];
  const labLen = Math.hypot(labRaw[0]!, labRaw[1]!) || 1;
  const lux = labRaw[0]! / labLen;
  const luy = labRaw[1]! / labLen;
  const mesRaw = [dot(mesW, pose.hexX), dot(mesW, pose.hexY)];
  const mesLen = Math.hypot(mesRaw[0]!, mesRaw[1]!) || 1;
  const mvx = mesRaw[0]! / mesLen;
  const mvy = mesRaw[1]! / mesLen;

  // 삼각형 변과 z = zSlice 평면의 교점들을 모아 실제 표면 수평 단면을 측정한다.
  const crossUV: Array<[number, number]> = [];
  for (let i = 0; i < positions.length; i += 9) {
    const verts: Array<[number, number, number]> = [
      [positions[i]!, positions[i + 1]!, positions[i + 2]!],
      [positions[i + 3]!, positions[i + 4]!, positions[i + 5]!],
      [positions[i + 6]!, positions[i + 7]!, positions[i + 8]!],
    ];
    for (let e = 0; e < 3; e += 1) {
      const a = verts[e]!;
      const b = verts[(e + 1) % 3]!;
      if ((a[2] - zSlice) * (b[2] - zSlice) > 0) continue;
      const dz = b[2] - a[2];
      const t = Math.abs(dz) < 1e-8 ? 0.5 : (zSlice - a[2]) / dz;
      if (t < 0 || t > 1) continue;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      crossUV.push([x * lux + y * luy, x * mvx + y * mvy]);
    }
  }

  const bands = [-0.6, -0.3, 0, 0.3, 0.6];
  const minUByBand: number[] = [];
  for (const vb of bands) {
    let minU = Infinity;
    let n = 0;
    for (const [u, v] of crossUV) {
      if (Math.abs(v - vb) > 0.12) continue;
      if (u < minU) minU = u;
      n += 1;
    }
    if (n >= 2 && Number.isFinite(minU)) minUByBand.push(minU);
  }
  if (minUByBand.length < 5) return { span: Number.NaN, grooveDepth: Number.NaN };
  const mid = minUByBand[2]!;
  const ends = 0.5 * (minUByBand[0]! + minUByBand[4]!);
  return {
    span: Math.max(...minUByBand) - Math.min(...minUByBand),
    grooveDepth: Math.max(0, mid - ends),
  };
}

function minLingualXAtZ(positions: Float32Array, zSlice: number): number {
  let minX = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 2]! - zSlice) > 0.12) continue;
    if (Math.abs(positions[i + 1]!) > 0.25) continue;
    if (positions[i]! < minX) minX = positions[i]!;
  }
  return minX;
}

function maxLabialXAtZ(positions: Float32Array, zSlice: number): number {
  let maxX = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 2]! - zSlice) > 0.12) continue;
    if (Math.abs(positions[i + 1]!) > 0.25) continue;
    if (positions[i]! > maxX) maxX = positions[i]!;
  }
  return maxX;
}

const works13 = [{ toothNumber: "13", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] }];
const fixture13 = { ...fixture11, toothNumber: "13" };
const [bevelShortInc, bevelLongInc, bevelOverInc, bevelShortCan, bevelLongCan] = await Promise.all([
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works11,
    params: { postLingualBevelMm: 1.5 },
    explicitParams: { postLingualBevelMm: 1.5 },
  }),
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works11,
    params: { postLingualBevelMm: 4.0 },
    explicitParams: { postLingualBevelMm: 4.0 },
  }),
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works11,
    params: { postLingualBevelMm: 11.0 },
    explicitParams: { postLingualBevelMm: 11.0 },
  }),
  designCustomAbutmentStl({
    fixture: fixture13,
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works13,
    params: { postLingualBevelMm: 1.5 },
    explicitParams: { postLingualBevelMm: 1.5 },
  }),
  designCustomAbutmentStl({
    fixture: fixture13,
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works13,
    params: { postLingualBevelMm: 3.6 },
    explicitParams: { postLingualBevelMm: 3.6 },
  }),
]);
let zMaxShortInc = -Infinity;
for (let i = 2; i < bevelShortInc.solidBodyLocalPositions!.length; i += 3) {
  zMaxShortInc = Math.max(zMaxShortInc, bevelShortInc.solidBodyLocalPositions![i]!);
}
const zCheckMid = zMaxShortInc - 2.3;
const shortLinMidX = minLingualXAtZ(bevelShortInc.solidBodyLocalPositions!, zCheckMid);
const longLinMidX = minLingualXAtZ(bevelLongInc.solidBodyLocalPositions!, zCheckMid);
let zMaxLongCan = -Infinity;
for (let i = 2; i < bevelLongCan.solidBodyLocalPositions!.length; i += 3) {
  zMaxLongCan = Math.max(zMaxLongCan, bevelLongCan.solidBodyLocalPositions![i]!);
}
const incPlane = measureLingualPlaneFlatnessMm(
  bevelLongInc.solidBodyLocalPositions!,
  bevelLongInc.fixture,
  zMaxShortInc - 1.4,
);
const canPlane = measureLingualPlaneFlatnessMm(
  bevelLongCan.solidBodyLocalPositions!,
  bevelLongCan.fixture,
  zMaxLongCan - 1.4,
);
console.log(
  JSON.stringify({
    bevelMm: {
      shortInc: bevelShortInc.metrics.postLingualBevelMm,
      longInc: bevelLongInc.metrics.postLingualBevelMm,
      overInc: bevelOverInc.metrics.postLingualBevelMm,
      overIncPostH: bevelOverInc.metrics.postHeightMm,
      shortLinMidX: +shortLinMidX.toFixed(2),
      longLinMidX: +longLinMidX.toFixed(2),
      incPlane,
      canPlane,
      posterior35: single35.metrics.postLingualBevelMm ?? null,
    },
  }),
);
assert.equal(bevelShortInc.metrics.postLingualBevelMm, 1.5, "절치 설측 사면은 마진에서 1.5mm에 시작된다");
assert.equal(bevelLongInc.metrics.postLingualBevelMm, 4.0, "절치 설측 사면은 마진에서 4.0mm에 시작된다");
assert.ok(
  bevelOverInc.metrics.postLingualBevelMm! < bevelOverInc.metrics.postHeightMm,
  `설측 사면 시작 높이(${bevelOverInc.metrics.postLingualBevelMm}mm)는 항상 포스트 높이(${bevelOverInc.metrics.postHeightMm}mm)보다 작다`,
);
assert.ok(
  shortLinMidX > longLinMidX + 0.3,
  `마진에서 설측 사면 시작을 1.5mm→4.0mm로 올리면 절단 아래 2.3mm는 아직 축벽이라 설측이 덜 깎인다(${shortLinMidX.toFixed(2)} → ${longLinMidX.toFixed(2)})`,
);
assert.ok(
  incPlane.grooveDepth <= 0.03 &&
    canPlane.grooveDepth <= 0.03 &&
    incPlane.span <= 0.15 &&
    canPlane.span <= 0.15,
  `절치(span ${incPlane.span.toFixed(3)}mm, groove ${incPlane.grooveDepth.toFixed(3)}mm)·견치(span ${canPlane.span.toFixed(3)}mm, groove ${canPlane.grooveDepth.toFixed(3)}mm) 설측 사면은 로브·중심 홈 없이 하나의 매끈한 평면을 이룬다`,
);
const maxLoopR = (loop: Float32Array) => {
  let r = 0;
  for (let i = 0; i < loop.length; i += 3) r = Math.max(r, Math.hypot(loop[i]!, loop[i + 1]!));
  return Math.round(r * 200) / 100;
};
assert.equal(
  maxLoopR(bevelShortInc.marginLoopLocal),
  maxLoopR(bevelLongInc.marginLoopLocal),
  "설측 사면 시작 높이를 바꿔도 피니시라인 외경은 유지된다",
);
assert.equal(bevelShortCan.metrics.postLingualBevelMm, 1.5, "견치 설측 사면은 마진에서 1.5mm에 시작된다");
assert.equal(bevelLongCan.metrics.postLingualBevelMm, 3.6, "견치 설측 사면은 마진에서 3.6mm에 시작된다");
assert.equal(single35.metrics.postLingualBevelMm ?? null, null, "삽입축이 작은 구치에는 설측 사면이 없다");
assert.equal(single35.metrics.postLabialBevelMm ?? null, null, "삽입축이 작은 구치에는 협측 사면이 없다");
const tilt35 = 20 * Math.PI / 180;
const tiltedPose = {
  ...fixture35.fixturePose,
  axis: [Math.sin(tilt35), 0, -Math.cos(tilt35)] as [number, number, number],
};
const [tilted35, tiltedCut, tiltedFlat] = await Promise.all([
  designCustomAbutmentStl({
    fixture: { ...fixture35, fixturePose: tiltedPose },
    jawGeometry: jaw,
    opposingGeometry: bridgeOpp,
    neighbors: [fixture34],
    toothWorks: singleWorks35,
  }),
  designCustomAbutmentStl({
    fixture: { ...fixture35, fixturePose: tiltedPose },
    jawGeometry: jaw,
    opposingGeometry: bridgeOpp,
    neighbors: [fixture34],
    toothWorks: singleWorks35,
    params: { postLingualBevelMm: 1.5, postLabialBevelMm: 1.5 },
    explicitParams: { postLingualBevelMm: 1.5, postLabialBevelMm: 1.5 },
  }),
  designCustomAbutmentStl({
    fixture: { ...fixture35, fixturePose: tiltedPose },
    jawGeometry: jaw,
    opposingGeometry: bridgeOpp,
    neighbors: [fixture34],
    toothWorks: singleWorks35,
    params: { postLingualBevelMm: 11 },
    explicitParams: { postLingualBevelMm: 11, postLabialBevelMm: 0 },
  }),
]);
console.log(
  JSON.stringify({
    tilt35: {
      ang: tilted35.metrics.angulationDeg,
      lin: tilted35.metrics.postLingualBevelMm ?? null,
      buc: tilted35.metrics.postLabialBevelMm ?? null,
      cutLin: tiltedCut.metrics.postLingualBevelMm ?? null,
      cutBuc: tiltedCut.metrics.postLabialBevelMm ?? null,
      flatLin: tiltedFlat.metrics.postLingualBevelMm ?? null,
      flatBuc: tiltedFlat.metrics.postLabialBevelMm ?? null,
    },
  }),
);
assert.ok(
  tilted35.metrics.angulationDeg >= 6,
  `기울인 #35 삽입축(${tilted35.metrics.angulationDeg}°)은 사면 기준 이상이다`,
);
assert.equal(tilted35.metrics.postLingualBevelMm ?? null, null, "기울인 구치도 설측 사면은 기본으로 깎지 않는다");
assert.equal(tilted35.metrics.postLabialBevelMm ?? null, null, "기울인 구치도 협측 사면은 기본으로 깎지 않는다");
assert.ok(
  (tilted35.metrics.suggestedPostLingualBevelMm ?? 0) > 0 &&
    (tilted35.metrics.suggestedPostLabialBevelMm ?? 0) > 0,
  "기울인 구치는 체크 전에도 사면 시작 높이를 제안한다",
);
assert.ok(
  (tiltedCut.metrics.postLingualBevelMm ?? 0) > 0 &&
    (tiltedCut.metrics.postLabialBevelMm ?? 0) > 0 &&
    tiltedCut.metrics.postLingualBevelMm! < tiltedCut.metrics.postHeightMm &&
    tiltedCut.metrics.postLabialBevelMm! < tiltedCut.metrics.postHeightMm,
  "체크한 구치 협·설 사면은 마진 높이로 잡히고 포스트 높이보다 작다",
);
assert.equal(tiltedFlat.metrics.postLabialBevelMm ?? null, null, "협측 사면 0은 사면을 만들지 않는다");
const blWidthAt = (positions: Float32Array, z0: number) => {
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 2]! - z0) > 0.15) continue;
    if (Math.abs(positions[i + 1]!) > 0.35) continue;
    minX = Math.min(minX, positions[i]!);
    maxX = Math.max(maxX, positions[i]!);
  }
  return maxX - minX;
};
const widthNearTop = (positions: Float32Array) => {
  let zTop = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zTop = Math.max(zTop, positions[i]!);
  return blWidthAt(positions, zTop - 0.9);
};
const bevelBl = widthNearTop(tiltedCut.solidBodyLocalPositions!);
const flatBl = widthNearTop(tilted35.solidBodyLocalPositions!);
assert.ok(
  bevelBl < flatBl - 0.15,
  `같은 기울기에서 협·설 사면(${bevelBl.toFixed(2)}mm)은 사면 없는 상단(${flatBl.toFixed(2)}mm)보다 좁다`,
);
tilted35.worldGeometry.dispose();
tilted35.predictedCrownWorldGeometry.dispose();
tiltedCut.worldGeometry.dispose();
tiltedCut.predictedCrownWorldGeometry.dispose();
tiltedFlat.worldGeometry.dispose();
tiltedFlat.predictedCrownWorldGeometry.dispose();
const [labialOff, labialOn] = await Promise.all([
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works11,
    params: { postLabialBevelMm: 0 },
    explicitParams: { postLabialBevelMm: 0 },
  }),
  designCustomAbutmentStl({
    fixture: fixture11,
    jawGeometry: jaw,
    opposingGeometry: flatMid,
    toothWorks: works11,
    params: { postLabialBevelMm: 3.2 },
    explicitParams: { postLabialBevelMm: 3.2 },
  }),
]);
assert.equal(labialOff.metrics.postLabialBevelMm, 0, "순측 사면을 0으로 지정하면 사면이 없다");
assert.equal(labialOn.metrics.postLabialBevelMm, 3.2, "순측 사면은 마진에서 3.2mm에 시작된다");
assert.ok(
  labialOn.metrics.postLabialBevelMm! < labialOn.metrics.postHeightMm,
  "순측 사면 시작 높이는 포스트 높이보다 작다",
);
let zMaxLabial = -Infinity;
for (let i = 2; i < labialOff.solidBodyLocalPositions!.length; i += 3) {
  zMaxLabial = Math.max(zMaxLabial, labialOff.solidBodyLocalPositions![i]!);
}
const zLabial = zMaxLabial - 0.8;
const offLabX = maxLabialXAtZ(labialOff.solidBodyLocalPositions!, zLabial);
const onLabX = maxLabialXAtZ(labialOn.solidBodyLocalPositions!, zLabial);
assert.ok(
  onLabX < offLabX - 0.15,
  `마진에서 3.2mm에 순측 사면을 두면 절단 아래 0.8mm 순측이 안으로 들어간다(${offLabX.toFixed(2)} → ${onLabX.toFixed(2)})`,
);
const labialShallow = await designCustomAbutmentStl({
  fixture: fixture11,
  jawGeometry: jaw,
  opposingGeometry: flatMid,
  toothWorks: works11,
  params: { postLabialBevelMm: 0.7 },
  explicitParams: { postLabialBevelMm: 0.7 },
});
assert.equal(labialShallow.metrics.postLabialBevelMm, 0.7, "순측 사면 0.7mm가 메트릭에 남는다");
const shallowLabX = maxLabialXAtZ(labialShallow.solidBodyLocalPositions!, zLabial);
assert.ok(
  shallowLabX < offLabX - 0.12,
  `순측 사면 0.7mm도 상단 순측을 깎는다(${offLabX.toFixed(2)} → ${shallowLabX.toFixed(2)})`,
);
assert.ok(
  Math.abs(onLabX - shallowLabX) > 0.08,
  `순측 사면 시작 높이(0.7↔3.2)에 따라 상단 깎임이 달라진다(${shallowLabX.toFixed(2)} ↔ ${onLabX.toFixed(2)})`,
);
const topRimSpike = (positions: Float32Array) => {
  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zMax = Math.max(zMax, positions[i]!);
  const bins = new Array(48).fill(0);
  const counts = new Array(48).fill(0);
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2]!;
    if (z < zMax - 0.55 || z > zMax - 0.05) continue;
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const r = Math.hypot(x, y);
    const b = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 48) % 48;
    bins[b] = Math.max(bins[b]!, r);
    counts[b]! += 1;
  }
  let maxJump = 0;
  for (let i = 0; i < 48; i += 1) {
    const j = (i + 1) % 48;
    if (!counts[i] || !counts[j]) continue;
    maxJump = Math.max(maxJump, Math.abs(bins[i]! - bins[j]!));
  }
  return maxJump;
};
assert.ok(
  topRimSpike(labialOn.solidBodyLocalPositions!) < 0.4,
  `전치 라인 앵글 필레가 삐죽하지 않는다(spike ${topRimSpike(labialOn.solidBodyLocalPositions!).toFixed(2)}mm)`,
);
labialShallow.worldGeometry.dispose();
labialShallow.predictedCrownWorldGeometry.dispose();
labialOff.worldGeometry.dispose();
labialOff.predictedCrownWorldGeometry.dispose();
labialOn.worldGeometry.dispose();
labialOn.predictedCrownWorldGeometry.dispose();
for (const d of [bevelShortInc, bevelLongInc, bevelOverInc, bevelShortCan, bevelLongCan]) {
  d.worldGeometry.dispose();
  d.predictedCrownWorldGeometry.dispose();
}

deep11.worldGeometry.dispose();
deep11.predictedCrownWorldGeometry.dispose();
close11.worldGeometry.dispose();
close11.predictedCrownWorldGeometry.dispose();
mid22.worldGeometry.dispose();
mid22.predictedCrownWorldGeometry.dispose();
open11.worldGeometry.dispose();
open11.predictedCrownWorldGeometry.dispose();
// 순측 경사 식립된 #22 단독 크라운과 #21 건너편 #11-#12 브리지가 함께 있을 때:
// 1) #22는 #21 자연치를 건너 #11-#12 평행 그룹에 묶이지 않고,
// 2) 기공소 스타일로 순면·설면 양쪽 사면 경사가 모두 잡히며,
// 3) 솔리드 포스트 외면은 비메니폴드·꼬인 면 없이 모든 에지가 C¹ 필레로 매끈하게 이어진다.
{
  const labTilt22 = 16.5 * (Math.PI / 180);
  const fixture22LabTilt = {
    ...fixture11,
    toothNumber: "22",
    fixturePose: {
      origin: [0, 0, 0] as [number, number, number],
      axis: [Math.sin(labTilt22), 0, -Math.cos(labTilt22)] as [number, number, number],
      hexX: [Math.cos(labTilt22), 0, Math.sin(labTilt22)] as [number, number, number],
      hexY: [0, 1, 0] as [number, number, number],
    },
    scanbodyTop: [7 * Math.sin(labTilt22), 0, -7 * Math.cos(labTilt22)] as [number, number, number],
  };
  const fixture11Bridge = {
    ...fixture11,
    toothNumber: "11",
    fixturePose: {
      ...fixture11.fixturePose,
      origin: [0, 11.8, 0] as [number, number, number],
    },
    scanbodyTop: [0, 11.8, -7] as [number, number, number],
  };
  const fixture12Bridge = {
    ...fixture11,
    toothNumber: "12",
    fixturePose: {
      ...fixture11.fixturePose,
      origin: [0, 17.6, 0] as [number, number, number],
    },
    scanbodyTop: [0, 17.6, -7] as [number, number, number],
  };
  const mixedWorks = [
    { toothNumber: "11", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["12"] },
    { toothNumber: "12", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["11"] },
    { toothNumber: "22", prosthesisType: "커스텀어벗", customAbutment: true, bridgeLinkedTeeth: [] as string[] },
  ];
  const [br11, single22] = await Promise.all([
    designCustomAbutmentStl({
      fixture: fixture11Bridge,
      neighbors: [fixture12Bridge, fixture22LabTilt],
      jawGeometry: jawLean,
      opposingGeometry: null,
      toothWorks: mixedWorks,
    }),
    designCustomAbutmentStl({
      fixture: fixture22LabTilt,
      neighbors: [fixture11Bridge, fixture12Bridge],
      jawGeometry: jawLean,
      opposingGeometry: null,
      toothWorks: mixedWorks,
    }),
  ]);
  assert.equal(br11.metrics.axisSource, "parallel", "#11-#12 브리지는 평행 그룹을 유지한다");
  assert.notEqual(single22.metrics.axisSource, "parallel", "#21 자연치를 건넌 #22 단독은 #11-#12 평행 그룹에 묶이지 않는다");
  assert.ok(
    (single22.metrics.postLabialBevelMm ?? 0) >= 1.2 && (single22.metrics.postLingualBevelMm ?? 0) >= 1.2,
    `순측 경사 #22는 치경 유지칼라 위 순면(${single22.metrics.postLabialBevelMm}mm)·설면(${single22.metrics.postLingualBevelMm}mm) 사면이 함께 잡힌다`,
  );
  const solid22 = single22.solidBodyLocalPositions!;
  let zTop22 = -Infinity;
  for (let i = 2; i < solid22.length; i += 3) zTop22 = Math.max(zTop22, solid22[i]!);
  const labLow22 = maxLabialXAtZ(solid22, zTop22 - 3.0);
  const labHigh22 = maxLabialXAtZ(solid22, zTop22 - 0.55);
  const linLow22 = minLingualXAtZ(solid22, zTop22 - 3.0);
  const linHigh22 = minLingualXAtZ(solid22, zTop22 - 0.55);
  assert.ok(
    labLow22 - labHigh22 >= 0.45 && linHigh22 - linLow22 >= 0.45,
    `#22 상단은 순면(${(labLow22 - labHigh22).toFixed(2)}mm)과 설면(${(linHigh22 - linLow22).toFixed(2)}mm) 모두 안쪽으로 경사져 수렴한다`,
  );
  // 2-메니폴드 무결성 및 포스트 상부 꼬인 면(접힘 각도) 부재 검증
  const qKey = (x: number, y: number, z: number) =>
    `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  const eMap = new Map<string, Array<[number, number, number]>>();
  const zMinPost = single22.metrics.cuffHeightMaxMm + 0.6;
  for (let i = 0; i < solid22.length; i += 9) {
    const p0: [number, number, number] = [solid22[i]!, solid22[i + 1]!, solid22[i + 2]!];
    const p1: [number, number, number] = [solid22[i + 3]!, solid22[i + 4]!, solid22[i + 5]!];
    const p2: [number, number, number] = [solid22[i + 6]!, solid22[i + 7]!, solid22[i + 8]!];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) continue;
    const n: [number, number, number] = [nx / nl, ny / nl, nz / nl];
    const ks = [qKey(...p0), qKey(...p1), qKey(...p2)];
    const zs = [p0[2], p1[2], p2[2]];
    for (let e = 0; e < 3; e += 1) {
      if ((zs[e]! + zs[(e + 1) % 3]!) * 0.5 < zMinPost) continue;
      const a = ks[e]!, b = ks[(e + 1) % 3]!;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      const list = eMap.get(k);
      if (list) list.push(n);
      else eMap.set(k, [n]);
    }
  }
  let maxPostDihedral = 0;
  let nonManifoldPost = 0;
  for (const list of eMap.values()) {
    if (list.length !== 2) {
      nonManifoldPost += 1;
      continue;
    }
    const dotN = Math.max(-1, Math.min(1, list[0]![0] * list[1]![0] + list[0]![1] * list[1]![1] + list[0]![2] * list[1]![2]));
    maxPostDihedral = Math.max(maxPostDihedral, (Math.acos(dotN) * 180) / Math.PI);
  }
  assert.equal(nonManifoldPost, 0, "포스트 외면 메시는 비메니폴드 에지가 없다");
  assert.ok(
    maxPostDihedral < 52,
    `포스트 외면 모든 에지가 필레로 매끈하며 꼬인 면이 없다(max dihedral ${maxPostDihedral.toFixed(1)}°)`,
  );
  br11.worldGeometry.dispose();
  br11.predictedCrownWorldGeometry.dispose();
  single22.worldGeometry.dispose();
  single22.predictedCrownWorldGeometry.dispose();
}

// 설측에만 대합이 있는 수평피개 #22에서 검볼로 높이·위치를 바꿀 때 실제 3D 대합거리가 실시간 갱신된다.
{
  const palatal22Opp = makeArchStrip(() => -5.8);
  // 순측(u > -3.2) 삼각형은 비우고 설측(u <= -3.2)에만 대합을 남긴다.
  const posAttr = palatal22Opp.getAttribute("position") as THREE.BufferAttribute;
  const keptTris: number[] = [];
  for (let i = 0; i < posAttr.count; i += 3) {
    const x0 = posAttr.getX(i), y0 = posAttr.getY(i), z0 = posAttr.getZ(i);
    const x1 = posAttr.getX(i + 1), y1 = posAttr.getY(i + 1), z1 = posAttr.getZ(i + 1);
    const x2 = posAttr.getX(i + 2), y2 = posAttr.getY(i + 2), z2 = posAttr.getZ(i + 2);
    if (Math.max(x0, x1, x2) > -3.2) continue;
    keptTris.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
  }
  const overjetOppGeo = new THREE.BufferGeometry();
  overjetOppGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(keptTris), 3));
  overjetOppGeo.computeVertexNormals();

  const d22Overjet = await designCustomAbutmentStl({
    fixture: { ...fixture11, toothNumber: "22" },
    jawGeometry: jaw,
    opposingGeometry: overjetOppGeo,
    toothWorks: works22,
  });
  const solid = d22Overjet.solidBodyLocalPositions!;
  const mLoop = d22Overjet.marginLoopLocal;
  let minMz = Infinity;
  let sumMz = 0;
  for (let i = 2; i < mLoop.length; i += 3) {
    minMz = Math.min(minMz, mLoop[i]!);
    sumMz += mLoop[i]!;
  }
  const meanMz = sumMz / (mLoop.length / 3);
  const zone22 = {
    coneZ: 1.0,
    fixedZ: 1.4,
    marginZ: minMz,
    meanMarginZ: meanMz,
    screwR: 0,
    boreTopR: 1.225,
    span: 6.0,
    labial: [1, 0] as [number, number],
    mesial: [0, 1] as [number, number],
  };
  const probe22 = buildOpposingClearanceProbe(overjetOppGeo, d22Overjet.fixture, zone22)!;
  assert.ok(probe22 != null, "수평피개 설측 대합 프로브가 생성된다");
  const outSolid = new Float32Array(solid.length);
  const outMargin = new Float32Array(mLoop.length);
  const evalGumballClear = (patch: Partial<ReturnType<typeof identityAbutmentEdit>>) => {
    const ed = { ...identityAbutmentEdit(), ...patch };
    refitLocalPositions(solid, ed, zone22, outSolid, 0);
    refitLocalPositions(mLoop, ed, zone22, outMargin, 0);
    return probe22.measureSurfaceClearance(outSolid, outMargin);
  };
  const baseClear = evalGumballClear({});
  const liftedClear = evalGumballClear({ heightMm: 1.55 });
  const movedPalatalClear = evalGumballClear({ heightMm: 1.55, shiftLabialMm: -0.9 });
  const movedLabialClear = evalGumballClear({ heightMm: 1.55, shiftLabialMm: 0.9 });
  assert.ok(
    baseClear != null && liftedClear != null && liftedClear > baseClear - 0.85,
    `검볼로 높이를 1.55mm 올려도 열린 순측 절단 공간에서는 대합거리가 단순 차감(${(baseClear! - 1.55).toFixed(2)}mm)되지 않는다(${baseClear} → ${liftedClear}mm)`,
  );
  assert.ok(
    movedPalatalClear != null && movedLabialClear != null && movedPalatalClear + 0.8 < movedLabialClear,
    `검볼로 순·설 위치를 옮기면 대합거리가 실시간 반영된다(설측 ${movedPalatalClear}mm < 순측 ${movedLabialClear}mm)`,
  );
  palatal22Opp.dispose();
  overjetOppGeo.dispose();
  d22Overjet.worldGeometry.dispose();
  d22Overjet.predictedCrownWorldGeometry.dispose();
}

jaw.dispose();
jawLean.dispose();
deep.dispose();
flatClose.dispose();
flatMid.dispose();

console.log("incisor shovel design ok");
