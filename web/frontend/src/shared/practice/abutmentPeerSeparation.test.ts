// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

import assert from "node:assert/strict";

import * as THREE from "three";

import { designCustomAbutmentStl } from "./customAbutmentStlDesign";

type V3 = [number, number, number];

function flatStrip(z: number, half = 26) {
  const steps = 52;
  const tris: number[] = [];
  const at = (i: number, j: number): V3 => [-half + (2 * half * i) / steps, -half + (2 * half * j) / steps, z];
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      tris.push(...at(i, j), ...at(i + 1, j), ...at(i + 1, j + 1), ...at(i, j), ...at(i + 1, j + 1), ...at(i, j + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

function tiltedAxis(towardY: number, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  return [0, Math.sin(r) * towardY, -Math.cos(r)];
}

function makeFixture(toothNumber: string, y: number, axis: V3) {
  const yDotAxis = axis[1];
  const hexYRaw: V3 = [-axis[0] * yDotAxis, 1 - axis[1] * yDotAxis, -axis[2] * yDotAxis];
  const hexYLen = Math.hypot(...hexYRaw);
  const hexY: V3 = [hexYRaw[0] / hexYLen, hexYRaw[1] / hexYLen, hexYRaw[2] / hexYLen];
  return {
    toothNumber,
    jaw: "upper" as const,
    fixturePose: {
      origin: [0, y, 0] as V3,
      axis,
      hexX: [1, 0, 0] as V3,
      hexY,
    },
    scanbodyTop: [axis[0] * 7, y + axis[1] * 7, axis[2] * 7] as V3,
    scanbodyRadiusMm: 2.25,
    scanbodyHeightMm: 7,
    gingivaFloorMm: 2.8,
    rmsMm: 0.02,
    topCoverage: 0.95,
    matchedLibraryLabel: "네오 Ø4.5×9mm",
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
    archOcclusalDir: [0, 0, -1] as V3,
    labialDir: [1, 0, 0] as V3,
    mesialDir: [0, -1, 0] as V3,
  };
}

/** 두 메시 꼭짓점 사이 최단 거리(겹치면 0 근처). */
function minVertexGap(a: Float32Array, b: Float32Array) {
  const cell = 0.5;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < b.length; i += 3) {
    const k = `${Math.floor(b[i]! / cell)},${Math.floor(b[i + 1]! / cell)},${Math.floor(b[i + 2]! / cell)}`;
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  let best = Infinity;
  const reach = 6;
  for (let i = 0; i < a.length; i += 3) {
    const cx = Math.floor(a[i]! / cell), cy = Math.floor(a[i + 1]! / cell), cz = Math.floor(a[i + 2]! / cell);
    for (let dx = -reach; dx <= reach; dx += 1)
      for (let dy = -reach; dy <= reach; dy += 1)
        for (let dz = -reach; dz <= reach; dz += 1) {
          const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const j of list) {
            const d = Math.hypot(a[i]! - b[j]!, a[i + 1]! - b[j + 1]!, a[i + 2]! - b[j + 2]!);
            if (d < best) best = d;
          }
        }
  }
  return best;
}

/** 두 픽스쳐 원점을 잇는 수평 방향으로 A 최대·B 최소 투영 차. 양수면 그만큼 떨어져 있다. */
function slabGap(a: Float32Array, b: Float32Array, dir: V3) {
  let maxA = -Infinity;
  let minB = Infinity;
  for (let i = 0; i < a.length; i += 3) maxA = Math.max(maxA, a[i]! * dir[0] + a[i + 1]! * dir[1] + a[i + 2]! * dir[2]);
  for (let i = 0; i < b.length; i += 3) minB = Math.min(minB, b[i]! * dir[0] + b[i + 1]! * dir[1] + b[i + 2]! * dir[2]);
  return minB - maxA;
}

/** 피니시라인 수평 연속 꺾임각 최댓값(평면 절단 시 ~35° 이상 급격히 꺾임). */
function maxMarginLoopTurnDeg(loopLocal: Float32Array) {
  const n = Math.floor(loopLocal.length / 3);
  let maxDeg = 0;
  for (let i = 0; i < n; i += 1) {
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const dx1 = loopLocal[i * 3]! - loopLocal[i0 * 3]!;
    const dy1 = loopLocal[i * 3 + 1]! - loopLocal[i0 * 3 + 1]!;
    const dx2 = loopLocal[i2 * 3]! - loopLocal[i * 3]!;
    const dy2 = loopLocal[i2 * 3 + 1]! - loopLocal[i * 3 + 1]!;
    const l1 = Math.hypot(dx1, dy1);
    const l2 = Math.hypot(dx2, dy2);
    if (l1 > 1e-5 && l2 > 1e-5) {
      const c = Math.max(-1, Math.min(1, (dx1 * dx2 + dy1 * dy2) / (l1 * l2)));
      maxDeg = Math.max(maxDeg, (Math.acos(c) * 180) / Math.PI);
    }
  }
  return maxDeg;
}

const jaw = flatStrip(-2.8);
const opp = flatStrip(-12.5);
const works = [
  { toothNumber: "24", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] as string[] },
  { toothNumber: "25", prosthesisType: "크라운", customAbutment: true, bridgeLinkedTeeth: [] as string[] },
];

/** 소·대구치·전치 공통 근원심 크라운 최소 두께(toothAnatomy proximalMinMm). */
const PROXIMAL_CROWN_MIN_MM = 0.5;
const failures: string[] = [];

const cases = [
  { name: "parallel 7.0mm", spacing: 7.0, tilt: 0 },
  { name: "parallel 6.2mm", spacing: 6.2, tilt: 0 },
  { name: "parallel 5.6mm", spacing: 5.6, tilt: 0 },
  { name: "converge 7.0mm 4°+4°", spacing: 7.0, tilt: 4 },
  { name: "converge 6.6mm 6°+6°", spacing: 6.6, tilt: 6 },
  { name: "converge 7.0mm 8°+8°", spacing: 7.0, tilt: 8 },
  { name: "converge 6.6mm 12°+12°", spacing: 6.6, tilt: 12 },
  { name: "diverge 6.2mm 10°+10°", spacing: 6.2, tilt: -10 },
];

for (const c of cases) {
  const f24 = makeFixture("24", 0, tiltedAxis(1, c.tilt));
  const f25 = makeFixture("25", c.spacing, tiltedAxis(-1, c.tilt));
  const [d24, d25] = await Promise.all([
    designCustomAbutmentStl({ fixture: f24, jawGeometry: jaw, opposingGeometry: opp, neighbors: [f25], toothWorks: works }),
    designCustomAbutmentStl({ fixture: f25, jawGeometry: jaw, opposingGeometry: opp, neighbors: [f24], toothWorks: works }),
  ]);
  const a = d24.worldGeometry.getAttribute("position").array as Float32Array;
  const b = d25.worldGeometry.getAttribute("position").array as Float32Array;
  const gap = minVertexGap(a, b);
  const slab = slabGap(a, b, [0, 1, 0]);
  const minCrown = PROXIMAL_CROWN_MIN_MM;
  console.log(
    JSON.stringify({
      case: c.name,
      minVertexGapMm: +gap.toFixed(3),
      slabGapMm: +slab.toFixed(3),
      need: +(minCrown * 2).toFixed(2),
      d24: d24.metrics.maxDiameterMm,
      d25: d25.metrics.maxDiameterMm,
      short: d24.metrics.peerGapShortMm ?? 0,
    }),
  );
  const shortSum = (d24.metrics.peerGapShortMm ?? 0) + (d25.metrics.peerGapShortMm ?? 0);
  const need = minCrown * 2;
  if (slab < need - 0.05 || gap < need - 0.05 || slab < 0) {
    failures.push(
      `${c.name}: 인접 어벗 사이(${slab.toFixed(2)}mm)는 크라운 편측 최소 ${minCrown}mm × 양쪽(${need.toFixed(2)}mm) 이상이고 겹치지 않는다`,
    );
  }
  if (shortSum > 0.02) {
    failures.push(`${c.name}: 크라운 최소 두께를 양보하지 않는다(${shortSum.toFixed(2)}mm)`);
  }
  for (const [label, d] of [["#24", d24], ["#25", d25]] as const) {
    const turnDeg = maxMarginLoopTurnDeg(d.marginLoopLocal);
    if (turnDeg > 9.5) {
      failures.push(`${c.name} ${label}: 평면 절단 없이 매끈한 마진 곡선을 유지해야 한다(최대 꺾임각 ${turnDeg.toFixed(2)}°)`);
    }
  }
  for (const d of [d24, d25]) {
    d.worldGeometry.dispose();
    d.predictedCrownWorldGeometry.dispose();
  }
}
function splitStrip(splitY: number, nearZ: number, farZ: number, half = 26) {
  const steps = 52;
  const tris: number[] = [];
  const at = (i: number, j: number): V3 => {
    const y = -half + (2 * half * j) / steps;
    return [-half + (2 * half * i) / steps, y, y < splitY ? nearZ : farZ];
  };
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      tris.push(...at(i, j), ...at(i + 1, j), ...at(i + 1, j + 1), ...at(i, j), ...at(i + 1, j + 1), ...at(i, j + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  return geo;
}

{
  const splitOpp = splitStrip(3.2, -8.2, -14.5);
  const f24 = makeFixture("24", 0, tiltedAxis(1, 0));
  const f25 = makeFixture("25", 7, tiltedAxis(-1, 0));
  const [d24, d25] = await Promise.all([
    designCustomAbutmentStl({ fixture: f24, jawGeometry: jaw, opposingGeometry: splitOpp, neighbors: [f25], toothWorks: works }),
    designCustomAbutmentStl({ fixture: f25, jawGeometry: jaw, opposingGeometry: splitOpp, neighbors: [f24], toothWorks: works }),
  ]);
  console.log(
    JSON.stringify({
      adjacentHeight: {
        h24: d24.metrics.postHeightMm,
        h25: d25.metrics.postHeightMm,
        c24: d24.metrics.occlusalClearanceMm,
        c25: d25.metrics.occlusalClearanceMm,
      },
    }),
  );
  if (Math.abs(d24.metrics.postHeightMm - d25.metrics.postHeightMm) > 0.45) {
    failures.push(
      `#24(${d24.metrics.postHeightMm}mm)·#25(${d25.metrics.postHeightMm}mm) 바로 인접 포스트 높이는 짧은 쪽에 맞춘다`,
    );
  }
  const tallerClear = Math.max(d24.metrics.occlusalClearanceMm ?? 0, d25.metrics.occlusalClearanceMm ?? 0);
  const shorterClear = Math.min(d24.metrics.occlusalClearanceMm ?? 0, d25.metrics.occlusalClearanceMm ?? 0);
  if (shorterClear < 0.65) {
    failures.push(`짧은 쪽 대합 거리(${shorterClear.toFixed(2)}mm)는 구치 교합면 최소 두께 이상이다`);
  }
  if (tallerClear < shorterClear + 0.6) {
    failures.push(`먼 대합 치아의 대합 거리(${tallerClear.toFixed(2)}mm)는 짧은 쪽보다 더 벌어진다`);
  }
  const locked25 = await designCustomAbutmentStl({
    fixture: f25,
    jawGeometry: jaw,
    opposingGeometry: splitOpp,
    neighbors: [f24],
    toothWorks: works,
    params: { postHeightOffsetMm: 1.2 },
    explicitParams: { postHeightOffsetMm: 1.2 },
  });
  if (locked25.metrics.postHeightMm < d25.metrics.postHeightMm + 0.6) {
    failures.push(
      `수동 높이 보정은 인접 동기화로 덮지 않는다(${locked25.metrics.postHeightMm}mm vs ${d25.metrics.postHeightMm}mm)`,
    );
  }
  for (const d of [d24, d25, locked25]) {
    d.worldGeometry.dispose();
    d.predictedCrownWorldGeometry.dispose();
  }
  splitOpp.dispose();
}

{
  const gapOpp = splitStrip(6, -8.2, -14.5);
  const f25 = makeFixture("25", 0, tiltedAxis(1, 0));
  const f27 = makeFixture("27", 14, tiltedAxis(-1, 0));
  const gapWorks = [
    { toothNumber: "25", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["25", "26", "27"] },
    { toothNumber: "26", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["25", "26", "27"] },
    { toothNumber: "27", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["25", "26", "27"] },
  ];
  const [d25, d27] = await Promise.all([
    designCustomAbutmentStl({ fixture: f25, jawGeometry: jaw, opposingGeometry: gapOpp, neighbors: [f27], toothWorks: gapWorks }),
    designCustomAbutmentStl({ fixture: f27, jawGeometry: jaw, opposingGeometry: gapOpp, neighbors: [f25], toothWorks: gapWorks }),
  ]);
  console.log(
    JSON.stringify({
      gappedBridge: { h25: d25.metrics.postHeightMm, h27: d27.metrics.postHeightMm },
    }),
  );
  if (Math.abs(d25.metrics.postHeightMm - d27.metrics.postHeightMm) < 1.2) {
    failures.push(
      `#25(${d25.metrics.postHeightMm}mm)·#27(${d27.metrics.postHeightMm}mm)처럼 사이가 빈 브리지 지대는 높이를 강제하지 않는다`,
    );
  }
  for (const d of [d25, d27]) {
    d.worldGeometry.dispose();
    d.predictedCrownWorldGeometry.dispose();
  }
  gapOpp.dispose();
}

jaw.dispose();
opp.dispose();
assert.deepEqual(failures, []);
