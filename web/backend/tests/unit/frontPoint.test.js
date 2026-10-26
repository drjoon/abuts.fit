// related files:
// - web/backend/services/abutmentStl/stlMetadata.js
import { describe, expect, it } from "@jest/globals";
import { writeBinaryStl } from "../../utils/screwHoleFill.js";
import { calculateStlMetadataFromBuffer } from "../../services/abutmentStl/stlMetadata.js";

function finishLine(z = 2, r = 2.3) {
  const pts = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    pts.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return pts;
}

/** 직선·테이퍼 포스트와 기울어진 교합면. gap>0 이면 교합 림과 축면 림을 떼어 둔다. */
function buildAbutment({
  seg = 48,
  zFl = 2,
  zTop = 8,
  rPost = 2.4,
  taperPerMm = 0,
  slant = 0.7,
  coarse = false,
  gap = 0,
  holeR = 0,
}) {
  const tris = [];
  const topZ = (x) => zTop + slant * x;
  const rAt = (z) => rPost + taperPerMm * (z - zFl);
  const pushQuad = (a, b, c, d) => {
    tris.push([a, b, c], [a, c, d]);
  };
  const steps = coarse ? 1 : 6;
  for (let s = 0; s < steps; s += 1) {
    const z0 = zFl + ((zTop - zFl) * s) / steps;
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const at = (z, ang) => {
        const r = rAt(z);
        return [r * Math.cos(ang), r * Math.sin(ang), z];
      };
      const rim = (ang) => {
        const r = rAt(zTop);
        const x = r * Math.cos(ang);
        const y = r * Math.sin(ang);
        return [x, y, topZ(x)];
      };
      const a = at(z0, a0);
      const b = at(z0, a1);
      const c = s === steps - 1 ? rim(a1) : at(zFl + ((zTop - zFl) * (s + 1)) / steps, a1);
      const d = s === steps - 1 ? rim(a0) : at(zFl + ((zTop - zFl) * (s + 1)) / steps, a0);
      pushQuad(a, b, c, d);
    }
  }
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const outer = (ang) => {
      const wallR = rAt(zTop);
      const r = wallR + gap;
      const x = r * Math.cos(ang);
      const y = r * Math.sin(ang);
      return [x, y, topZ(wallR * Math.cos(ang))];
    };
    if (holeR > 0) {
      const inner = (ang) => {
        const x = holeR * Math.cos(ang);
        const y = holeR * Math.sin(ang);
        return [x, y, topZ(x)];
      };
      pushQuad(outer(a0), outer(a1), inner(a1), inner(a0));
    } else {
      tris.push([outer(a0), outer(a1), [0, 0, topZ(0)]]);
    }
  }
  const positions = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((p, k) => positions.set(p, i * 9 + k * 3)));
  return writeBinaryStl({ positions });
}

async function frontOf(opts) {
  const meta = await calculateStlMetadataFromBuffer(buildAbutment(opts), finishLine());
  const fp = meta?.frontPoint;
  const radius = fp ? Math.hypot(fp.x, fp.y) : null;
  return { fp, radius };
}

describe("front point on the low occlusal rim", () => {
  it("finds the low rim of a straight post", async () => {
    const { fp, radius } = await frontOf({ taperPerMm: 0, slant: 0.7 });
    expect(fp).toEqual({ x: -2.4, y: 0, z: 6.32 });
    expect(radius).toBeGreaterThan(2);
  });

  it("finds the low rim when the side wall is one tall triangle", async () => {
    const { fp, radius } = await frontOf({
      taperPerMm: 0.05,
      slant: 0.7,
      coarse: true,
    });
    expect(fp).toEqual({ x: -2.7, y: 0, z: 6.11 });
    expect(radius).toBeGreaterThan(2);
  });

  it("keeps the outer rim when the top has a screw opening", async () => {
    const { fp, radius } = await frontOf({
      taperPerMm: 0,
      slant: 0.7,
      holeR: 1.15,
    });
    expect(fp.x).toBeCloseTo(-2.4, 2);
    expect(fp.z).toBeCloseTo(6.32, 2);
    expect(radius).toBeGreaterThan(2);
  });

  it("finds the low rim when the occlusal cap does not share vertices with the wall", async () => {
    const { fp, radius } = await frontOf({ taperPerMm: 0, slant: 0.7, gap: 0.08 });
    expect(fp.x).toBeLessThan(-2);
    expect(fp.z).toBeCloseTo(6.32, 2);
    expect(radius).toBeGreaterThan(2);
  });
});
