import assert from "node:assert/strict";

import { shortestPostTopClearanceMm } from "./occlusalClearanceRay";

const up = [0, 0, 1] as const;

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

console.log("occlusalClearanceRay ok", hit);
