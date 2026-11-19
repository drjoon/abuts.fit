import assert from "node:assert/strict";

import * as THREE from "three";

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
  deep11.metrics.occlusalClearanceMm != null && deep11.metrics.occlusalClearanceMm >= 1.05,
  `딥바이트 #11 대합 거리(${deep11.metrics.occlusalClearanceMm}mm)는 포스트 면이 대합에 닿지 않는다`,
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

deep11.worldGeometry.dispose();
deep11.predictedCrownWorldGeometry.dispose();
close11.worldGeometry.dispose();
close11.predictedCrownWorldGeometry.dispose();
mid22.worldGeometry.dispose();
mid22.predictedCrownWorldGeometry.dispose();
open11.worldGeometry.dispose();
open11.predictedCrownWorldGeometry.dispose();
jaw.dispose();
jawLean.dispose();
deep.dispose();
flatClose.dispose();
flatMid.dispose();

console.log("incisor shovel design ok");
