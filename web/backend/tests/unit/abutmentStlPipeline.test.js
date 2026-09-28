// related files:
// - web/backend/services/abutmentStl/meshCore.js
// - web/backend/services/abutmentStl/align.js
// - web/backend/services/abutmentStl/pipeline.js
import { describe, expect, it } from "@jest/globals";
import {
  Mesh,
  meshPlaneSection,
  rotationAxisAngle,
  writeBinaryStl,
} from "../../services/abutmentStl/meshCore.js";
import { alignMeshToOrigin } from "../../services/abutmentStl/align.js";
import { connectionDiameterAtOrigin } from "../../services/abutmentStl/qualityMetrics.js";
import { runAbutmentStlPipeline } from "../../services/abutmentStl/pipeline.js";

function soupOf(tris) {
  const out = new Float64Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((p, k) => out.set(p, i * 9 + k * 3)));
  return out;
}

function cubeSoup() {
  const c = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const quads = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
  ];
  const tris = [];
  for (const [a, b, cc, d] of quads) tris.push([c[a], c[b], c[cc]], [c[a], c[cc], c[d]]);
  return soupOf(tris);
}

/** 회전체 어벗: 포스트 r=1.4 → 커넥션 원뿔(r 1.6→1.7) → 에머전스(→3.0) → 크라운 r=3.0. */
function revolvedAbutmentSoup(seg = 96) {
  const profile = [
    [-3, 0],
    [-3, 1.4],
    [-1, 1.4],
    [-1, 1.6],
    [1, 1.7],
    [3, 3.0],
    [8, 3.0],
    [8, 0],
  ];
  const tris = [];
  const at = (r, z, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a), z];
  };
  for (let s = 0; s < profile.length - 1; s += 1) {
    const [z0, r0] = profile[s];
    const [z1, r1] = profile[s + 1];
    for (let i = 0; i < seg; i += 1) {
      const a = at(r0, z0, i);
      const b = at(r0, z0, i + 1);
      const c = at(r1, z1, i + 1);
      const d = at(r1, z1, i);
      if (r0 > 0) tris.push([a, b, c]);
      if (r1 > 0) tris.push([a, c, d]);
    }
  }
  return soupOf(tris);
}

describe("abutmentStl meshCore", () => {
  it("meshPlaneSection returns one closed loop through a cube", () => {
    const mesh = Mesh.fromTriangleSoup(cubeSoup());
    const loops = meshPlaneSection(mesh, [0, 0, 0.5], [0, 0, 1]);
    expect(loops).toHaveLength(1);
    const loop = loops[0];
    // 옆면 4개 × (모서리 2 + 대각선 1) 교차 중 모서리 공유분을 합치면 8점 + 닫힘 점
    expect(loop).toHaveLength(9);
    expect(loop[0]).toEqual(loop[8]);
  });

  it("unweldedByAngle splits a cube into 6 faces at 22.5°", () => {
    const mesh = Mesh.fromTriangleSoup(cubeSoup());
    expect(mesh.nakedEdgeCount()).toBe(0);
    const unwelded = mesh.unweldedByAngle();
    expect(unwelded.faceComponents()).toHaveLength(6);
  });
});

describe("abutmentStl align", () => {
  it("puts the connection diameter section at z=0 on the +Z axis", () => {
    const mesh = Mesh.fromTriangleSoup(revolvedAbutmentSoup());
    mesh.transform(rotationAxisAngle([1, 0, 0], Math.PI));
    mesh.translate(1.5, -2, 4);
    const res = alignMeshToOrigin(mesh, { targetDiameter: 3.33 });
    expect(res.ok).toBe(true);
    const { min, max } = mesh.bbox();
    expect(max[2]).toBeGreaterThan(-min[2]);
    const conn = connectionDiameterAtOrigin(mesh);
    expect(conn.diameter).toBeCloseTo(3.33, 1);
    expect(Math.abs(conn.diameter - 3.33)).toBeLessThan(0.02);
  });
});

describe("abutmentStl pipeline", () => {
  it("produces a filled STL with metadata-ready outputs", async () => {
    const buffer = writeBinaryStl({ positions: revolvedAbutmentSoup(), attributes: null });
    const out = await runAbutmentStlPipeline(buffer, { targetDiameter: 3.33 });
    const mesh = Mesh.fromStlBuffer(out.outputBuffer);
    expect(mesh.faceCount).toBeGreaterThanOrEqual(out.bodyTriangleCount);
    expect(out.hexRotation).not.toBeNull();
    expect(out.diameter.max).toBeCloseTo(6.0, 1);
    if (out.finishLine) {
      expect(out.finishLine.points.length).toBeGreaterThanOrEqual(8);
      expect(out.stlMetadata?.connectionDiameter).toBe(3.33);
    }
  });
});
