// related files:
// - web/backend/utils/screwHoleFill.js
import { describe, expect, it } from "@jest/globals";
import {
  HOLE_FILL_PATCH_ATTRIBUTE,
  fillUpperScrewHole,
  parseStl,
  writeBinaryStl,
} from "../../utils/screwHoleFill.js";
import { fillUpperScrewHoleInWorker } from "../../utils/screwHoleFill.service.js";

const SEG = 64;
const R_OUT = 3;
const R_IN = 1.28;
const Z_BOTTOM = 0;
const topZ = (x) => 8 + 0.2 * x;

/** 기울어진 윗면을 가진 관통 튜브(닫힌 메시) + 채널 안 z=1에 떠 있는 원판. */
function buildTubeWithDetachedDisk() {
  const tris = [];
  const ring = (r, i) => {
    const a = (i / SEG) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  for (let i = 0; i < SEG; i += 1) {
    const [ox0, oy0] = ring(R_OUT, i);
    const [ox1, oy1] = ring(R_OUT, i + 1);
    const [ix0, iy0] = ring(R_IN, i);
    const [ix1, iy1] = ring(R_IN, i + 1);
    const o0b = [ox0, oy0, Z_BOTTOM];
    const o1b = [ox1, oy1, Z_BOTTOM];
    const o0t = [ox0, oy0, topZ(ox0)];
    const o1t = [ox1, oy1, topZ(ox1)];
    const i0b = [ix0, iy0, Z_BOTTOM];
    const i1b = [ix1, iy1, Z_BOTTOM];
    const i0t = [ix0, iy0, topZ(ix0)];
    const i1t = [ix1, iy1, topZ(ix1)];
    tris.push([o0b, o1b, o1t], [o0b, o1t, o0t]);
    tris.push([i0b, i1t, i1b], [i0b, i0t, i1t]);
    tris.push([o0t, o1t, i1t], [o0t, i1t, i0t]);
    tris.push([o0b, i1b, o1b], [o0b, i0b, i1b]);
    tris.push([[0, 0, 1], [1.25 * Math.cos((i / SEG) * Math.PI * 2), 1.25 * Math.sin((i / SEG) * Math.PI * 2), 1], [1.25 * Math.cos(((i + 1) / SEG) * Math.PI * 2), 1.25 * Math.sin(((i + 1) / SEG) * Math.PI * 2), 1]]);
  }
  const positions = new Float64Array(tris.length * 9);
  tris.forEach((t, i) => positions.set(t.flat(), i * 9));
  return writeBinaryStl({ positions, attributes: new Uint16Array(tris.length) });
}

describe("fillUpperScrewHole", () => {
  it("replaces the detached disk with a cap on the tilted top rim", () => {
    const result = fillUpperScrewHole(buildTubeWithDetachedDisk());
    expect(result.ok).toBe(true);
    expect(result.stats.removedDetachedTriangles).toBe(SEG);
    expect(result.stats.patchTriangles).toBe(SEG);
    expect(result.stats.channelDiameter).toBeCloseTo(R_IN * 2, 2);
    expect(result.stats.rimZMin).toBeCloseTo(topZ(-R_IN), 2);
    expect(result.stats.rimZMax).toBeCloseTo(topZ(R_IN), 2);

    const { positions, attributes } = parseStl(result.buffer);
    let patchCount = 0;
    for (let t = 0; t < attributes.length; t += 1) {
      if (attributes[t] !== HOLE_FILL_PATCH_ATTRIBUTE) continue;
      patchCount += 1;
      const p = positions.subarray(t * 9, t * 9 + 9);
      const nz =
        (p[3] - p[0]) * (p[7] - p[1]) - (p[4] - p[1]) * (p[6] - p[0]);
      expect(nz).toBeGreaterThan(0);
    }
    expect(patchCount).toBe(SEG);
  });

  it("is idempotent when run on its own output", () => {
    const first = fillUpperScrewHole(buildTubeWithDetachedDisk());
    const second = fillUpperScrewHole(first.buffer);
    expect(second.ok).toBe(true);
    expect(second.stats.removedPatchTriangles).toBe(SEG);
    expect(Buffer.compare(first.buffer, second.buffer)).toBe(0);
  });

  it("gives the same bytes when run in a worker", async () => {
    const input = buildTubeWithDetachedDisk();
    const direct = fillUpperScrewHole(input);
    const viaWorker = await fillUpperScrewHoleInWorker(input);
    expect(viaWorker.ok).toBe(true);
    expect(viaWorker.stats).toEqual(direct.stats);
    expect(Buffer.compare(viaWorker.buffer, direct.buffer)).toBe(0);
    expect(input.length).toBeGreaterThan(0);
  });
});
