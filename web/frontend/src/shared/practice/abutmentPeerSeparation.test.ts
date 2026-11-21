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
  const need = minCrown * 2 - shortSum;
  if (slab < need - 0.02 || gap < need - 0.02 || slab < 0) {
    failures.push(
      `${c.name}: 인접 어벗 사이(${slab.toFixed(2)}mm)는 크라운 최소 두께 양쪽에서 픽스쳐 간격 부족분을 뺀 ${need.toFixed(2)}mm 이상이고 절대 겹치지 않는다`,
    );
  }
  const allowShort = Math.abs(c.tilt) <= 4 ? 0 : Math.abs(c.tilt) <= 6 ? 0.1 : Infinity;
  if (shortSum > allowShort + 1e-6) {
    failures.push(`${c.name}: 흔한 간격·경사에서는 크라운 최소 두께를 양보하지 않는다(${shortSum.toFixed(2)}mm)`);
  }
  for (const d of [d24, d25]) {
    d.worldGeometry.dispose();
    d.predictedCrownWorldGeometry.dispose();
  }
}
jaw.dispose();
opp.dispose();
assert.deepEqual(failures, []);
