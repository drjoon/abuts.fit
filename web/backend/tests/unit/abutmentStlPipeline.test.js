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
import {
  analyzeMarginAtPoint,
  applyTightCornerCorrectionToMesh,
  detectTightCorners,
  gougeDepthForCorner,
  metalInteriorAngleRad,
  planTightCornerCorrection,
} from "../../services/abutmentStl/tightCorner.js";

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

/**
 * FL(r=3.6,z=2.0) 바로 위 마진(약 27°)이 코너(r=2.4,z=2.6)에서 수직 축면과 만나는 회전체.
 * filletR>0이면 그 코너를 공기 쪽 호(반경 filletR)로 메운다.
 */
function marginWallSoup(filletR, seg = 96) {
  const C = [2.4, 2.6];
  const fl = [3.6, 2.0];
  const lx = fl[0] - C[0];
  const lz = fl[1] - C[1];
  const ll = Math.hypot(lx, lz);
  const rayL = [lx / ll, lz / ll];
  const rayW = [0, 1];
  const ext = Math.acos(rayL[0] * rayW[0] + rayL[1] * rayW[1]);
  const mid = [];
  if (filletR > 0) {
    const trim = filletR / Math.tan(ext / 2);
    const bx = rayL[0] + rayW[0];
    const bz = rayL[1] + rayW[1];
    const bl = Math.hypot(bx, bz);
    const cd = filletR / Math.sin(ext / 2);
    const c = [C[0] + (bx / bl) * cd, C[1] + (bz / bl) * cd];
    const t1 = [C[0] + rayL[0] * trim, C[1] + rayL[1] * trim];
    const t2 = [C[0] + rayW[0] * trim, C[1] + rayW[1] * trim];
    const a1 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    let da = Math.atan2(t2[1] - c[1], t2[0] - c[0]) - a1;
    while (da <= -Math.PI) da += Math.PI * 2;
    while (da > Math.PI) da -= Math.PI * 2;
    for (let i = 0; i <= 24; i += 1) {
      const a = a1 + (da * i) / 24;
      mid.push([c[0] + filletR * Math.cos(a), c[1] + filletR * Math.sin(a)]);
    }
  } else {
    mid.push(C);
  }
  // [r, z] 프로파일(축에서 시작해 축으로 닫힘)
  const profile = [
    [0, -3], [1.4, -3], [1.4, -1], [1.6, -1], [1.7, 1], fl, ...mid, [2.4, 8], [0, 8],
  ];
  const tris = [];
  const at = (r, z, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a), z];
  };
  for (let s = 0; s < profile.length - 1; s += 1) {
    const [r0, z0] = profile[s];
    const [r1, z1] = profile[s + 1];
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

describe("abutmentStl tightCorner", () => {
  it("estimates gouge depth for a sharp margin-like corner", () => {
    const wallLine = { d: { u: 0, w: 1 } };
    const du = 1.05;
    const dw = 1.72;
    const len = Math.hypot(du, dw);
    const shoulderLine = { d: { u: du / len, w: dw / len } };
    const metal = metalInteriorAngleRad(wallLine, shoulderLine);
    const gouge = gougeDepthForCorner(metal, 0.6);
    expect(gouge).toBeGreaterThan(0.018);
  });

  it("피니시라인 위 마진↔축면 fillet R이 공구 R(0.6)보다 작을 때만 표시한다", () => {
    const fl = [3.6, 0, 2.0];
    const axis = [0, 0, 1];
    const analyze = (r) => {
      const mesh = Mesh.fromStlBuffer(
        writeBinaryStl({ positions: marginWallSoup(r), attributes: null }),
      );
      return analyzeMarginAtPoint(mesh, fl, 0.6, axis);
    };
    expect(analyze(0.9)?.tight).toBe(false);
    expect(analyze(0.7)?.tight).toBe(false);
    const small = analyze(0.25);
    expect(small?.tight).toBe(true);
    expect(small.filletRadiusMm).toBeLessThan(0.45);
    expect(small.reliefProfile.length).toBeGreaterThan(8);
    expect(analyze(0)?.tight).toBe(true);
  });

  it("곡선으로 휘어 들어간(움푹 패인) 마진도 R을 재고, 보정 적용 뒤에는 타이트가 풀린다", () => {
    // 실제 케이스(20261018-EVQULGSM): 단면 접선각이 20°→85°로 곡선 전이, R≈0.43.
    const flPts = [];
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      flPts.push([3.6 * Math.cos(a), 3.6 * Math.sin(a), 2.0]);
    }
    const meshOf = (soup) =>
      Mesh.fromStlBuffer(writeBinaryStl({ positions: soup, attributes: null }));
    const mesh = meshOf(marginWallSoup(0.43));
    const plan = planTightCornerCorrection(mesh, flPts, {});
    expect(plan.tightCorner.tightCount).toBeGreaterThan(20);
    expect(plan.tightCorner.correctionSolid?.positions?.length).toBeGreaterThan(100);
    expect(plan.tightCorner.averageFilletRadiusMm).toBeGreaterThan(0.25);
    expect(plan.tightCorner.averageFilletRadiusMm).toBeLessThan(0.58);
    expect(plan.tightCorner.samples[0].filletRadiusMm).toBeGreaterThan(0.25);
    expect(plan.tightCorner.samples[0].filletRadiusMm).toBeLessThan(0.58);
    expect(plan.triangles.length).toBeGreaterThan(100);
    expect(plan.band.length).toBeGreaterThan(20);

    const beforeNaked = mesh.nakedEdgeCount();
    const corrected = applyTightCornerCorrectionToMesh(mesh, flPts, {});
    expect(corrected).not.toBeNull();
    expect(corrected.faceCount).toBe(mesh.faceCount);
    expect(corrected.nakedEdgeCount()).toBe(beforeNaked);
    expect(detectTightCorners(corrected, flPts, {}).tightCount).toBe(0);
  });

  it("회전체 샘플(R>0.6)은 보정면 없음", async () => {
    const smoothBuffer = writeBinaryStl({ positions: revolvedAbutmentSoup(), attributes: null });
    const smoothPipe = await runAbutmentStlPipeline(smoothBuffer, { targetDiameter: 3.33 });
    expect(smoothPipe.tightCorner?.tightCount ?? 0).toBe(0);
    expect(smoothPipe.tightCorner?.reliefOverlay ?? null).toBeNull();
    expect(smoothPipe.tightCorner?.averageFilletRadiusMm ?? null).toBeNull();
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
      expect(out.tightCorner).toBeTruthy();
      expect(out.tightCorner.version).toBe(6);
    }
  });
});
