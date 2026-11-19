import assert from "node:assert/strict";

import { closestSurfaceClearanceMm, shortestPostTopClearanceMm } from "./occlusalClearanceRay";

const up = [0, 0, 1] as const;
const labial = [1, 0, 0] as const;

const columns: [number, number, number][][] = [
  [[-1, -1, 4], [-1, -1, 5]],
  [[1, -1, 4], [1, -1, 5]],
  [[1, 1, 4], [1, 1, 5]],
  [[-1, 1, 4], [-1, 1, 5]],
];
const apex = [0, 0, 5] as const;

function slab(z: number, x0: number, x1: number, y0: number, y1: number) {
  return [x0, y0, z, x1, y0, z, x0, y1, z, x1, y0, z, x1, y1, z, x0, y1, z];
}

const hit = shortestPostTopClearanceMm({
  columns,
  apex,
  roundSteps: 1,
  opposingTris: new Float32Array([
    ...slab(7, -2, 2, -2, 2),
    ...slab(5.8, 0.2, 1.4, 0.2, 1.4),
  ]),
  up,
});
assert.ok(hit != null && Math.abs(hit - 0.8) < 0.06, `가까운 면이 최단 ${hit}`);

const sideOnly = shortestPostTopClearanceMm({
  columns,
  apex,
  roundSteps: 1,
  opposingTris: new Float32Array([3, 0, 5.1, 3.4, 0.2, 5.1, 3.2, 0.4, 5.2]),
  up,
});
assert.equal(sideOnly, null, "옆 정점은 수직 레이에 안 걸린다");

// 전치 악궁·수평피개: 대합 교합면이 순측(+X)으로 3mm 빗나가 있어도 찾는다.
const archOffset = shortestPostTopClearanceMm({
  columns,
  apex,
  roundSteps: 1,
  opposingTris: new Float32Array(slab(6.5, 2.4, 4.2, -1.2, 1.2)),
  up,
  labialHint: labial,
  archBiasU: 3.2,
  archHalfVMm: 2.8,
  lateralMm: 3.5,
});
assert.ok(
  archOffset != null && archOffset > 0.5 && archOffset < 3.5,
  `악궁 순설로 빗나간 대합 거리(${archOffset})를 잰다`,
);

const archMissWithoutBias = shortestPostTopClearanceMm({
  columns,
  apex,
  roundSteps: 1,
  opposingTris: new Float32Array(slab(6.5, 2.4, 4.2, -1.2, 1.2)),
  up,
});
assert.equal(archMissWithoutBias, null, "바이어스 없이 순설 빗나간 대합은 수직 레이에 안 걸린다");

const sideWall = new Float32Array([
  1.22, -0.35, 3.7,
  1.22, 0.35, 3.7,
  1.22, 0.35, 4.35,
  1.22, -0.35, 3.7,
  1.22, 0.35, 4.35,
  1.22, -0.35, 4.35,
]);
const aboveAndSide = new Float32Array([...slab(7, -2, 2, -2, 2), ...sideWall]);
const surfacePts = new Float32Array([0, 0, 5, 1, 0, 4]);
const closest = closestSurfaceClearanceMm({ points: surfacePts, opposingTris: aboveAndSide });
assert.ok(closest != null && closest < 0.35, `축벽 최근접(${closest})이 윗면 수직 간격보다 가깝다`);
const planeOnly = closestSurfaceClearanceMm({
  points: new Float32Array([0, 0, 5]),
  opposingTris: new Float32Array(slab(6.4, -2, 2, -2, 2)),
});
assert.ok(planeOnly != null && Math.abs(planeOnly - 1.4) < 0.06, `평면까지 최근접 ${planeOnly}`);

console.log("occlusalClearanceRay ok", hit, archOffset, closest, planeOnly);
