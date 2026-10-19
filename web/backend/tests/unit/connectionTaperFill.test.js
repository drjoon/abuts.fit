// related files:
// - web/backend/services/abutmentStl/connectionTaperFill.js
import { describe, expect, it } from "@jest/globals";
import { Mesh, meshZSection, writeBinaryStl } from "../../services/abutmentStl/meshCore.js";
import { addMissingConnectionTaper } from "../../services/abutmentStl/connectionTaperFill.js";
import { TAPER_SLOPE } from "../../services/abutmentStl/cuffConnectionSpecs.js";
import { runAbutmentStlPipeline } from "../../services/abutmentStl/pipeline.js";

const N = 64;
const FLAT = 2.5;
const APOTHEM = FLAT / 2;
const PROFILE = {
  implantManufacturer: "OSSTEM",
  implantBrand: "TS3",
  implantFamily: "Regular",
  implantType: "Hex",
};

function hexRadius(angle) {
  const sector = Math.PI / 3;
  const fromVertex = ((angle % sector) + sector) % sector;
  const fromFlat = Math.abs(fromVertex - sector / 2);
  return APOTHEM / Math.cos(fromFlat);
}

function ring(z, radiusOf) {
  const pts = [];
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const r = typeof radiusOf === "function" ? radiusOf(a) : radiusOf;
    pts.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return pts;
}

function loft(tris, a, b) {
  for (let i = 0; i < N; i += 1) {
    const j = (i + 1) % N;
    tris.push([a[i], a[j], b[j]], [a[i], b[j], b[i]]);
  }
}

function cap(tris, loop, down) {
  const c = [0, 0, loop[0][2]];
  for (let i = 0; i < N; i += 1) {
    const j = (i + 1) % N;
    tris.push(down ? [c, loop[j], loop[i]] : [c, loop[i], loop[j]]);
  }
}

function solidOf(levels) {
  const tris = [];
  const rings = levels.map(([z, r]) => ring(z, r));
  cap(tris, rings[0], true);
  for (let i = 0; i < rings.length - 1; i += 1) loft(tris, rings[i], rings[i + 1]);
  cap(tris, rings[rings.length - 1], false);
  const out = new Float64Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((p, k) => out.set(p, i * 9 + k * 3)));
  return out;
}

/** 11° 없이 헥스만 길게 올린 어벗. 커프는 헥스 끝에서 바로 벌어진다. */
function longHexSoup() {
  return solidOf([
    [-4, hexRadius],
    [-0.5, hexRadius],
    [-0.5, 2.2],
    [1.6, 2.8],
    [6, 3.2],
  ]);
}

/** 스펙 길이 헥스 + 11° 원뿔 + 커프. */
function designedSoup() {
  const corner = FLAT / Math.sqrt(3);
  const origin = 1.675;
  return solidOf([
    [-2.4, hexRadius],
    [-1.192, hexRadius],
    [-1.192, corner],
    [0, origin],
    [0.2, origin + TAPER_SLOPE * 0.2],
    [3, 3.2],
    [7, 3.2],
  ]);
}

function outerMetrics(mesh, z) {
  let best = null;
  for (const pl of meshZSection(mesh, z)) {
    const closed =
      Math.hypot(pl[0][0] - pl[pl.length - 1][0], pl[0][1] - pl[pl.length - 1][1]) < 1e-5;
    const pts = closed ? pl.slice(0, -1) : pl;
    if (pts.length < 6) continue;
    const radii = pts.map((p) => Math.hypot(p[0], p[1]));
    const rMax = Math.max(...radii);
    const outer = radii.filter((r) => r >= rMax * 0.8);
    const rMin = Math.min(...outer);
    const rMean = outer.reduce((s, r) => s + r, 0) / outer.length;
    const row = { rMean, hexRatio: rMax / rMin };
    if (!best || rMax > best.rMax) best = { ...row, rMax };
  }
  return best;
}

function edgeUse(mesh) {
  const f = mesh.faces;
  const count = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < mesh.faceCount; i += 1) {
    const ids = [f[i * 3], f[i * 3 + 1], f[i * 3 + 2]];
    for (let k = 0; k < 3; k += 1) {
      const kEdge = key(ids[k], ids[(k + 1) % 3]);
      count.set(kEdge, (count.get(kEdge) || 0) + 1);
    }
  }
  let naked = 0;
  let nonManifold = 0;
  for (const n of count.values()) {
    if (n === 1) naked += 1;
    else if (n > 2) nonManifold += 1;
  }
  return { naked, nonManifold };
}

describe("connectionTaperFill", () => {
  it("긴 헥스에 11° 커넥션 원뿔을 붙인다", () => {
    const mesh = Mesh.fromTriangleSoup(longHexSoup());
    const before = edgeUse(mesh);
    const result = addMissingConnectionTaper(mesh, { implantProfile: PROFILE });
    expect(result.applied).toBe(true);
    expect(before.naked).toBe(0);
    expect(edgeUse(mesh)).toEqual({ naked: 0, nonManifold: 0 });
    const atOrigin = outerMetrics(mesh, 0);
    expect(atOrigin.rMean * 2).toBeCloseTo(3.35, 2);
    expect(atOrigin.hexRatio).toBeLessThan(1.04);
    const below = outerMetrics(mesh, -0.4);
    const expected = 3.35 / 2 + TAPER_SLOPE * -0.4;
    expect(below.rMean).toBeCloseTo(expected, 2);
    expect(below.hexRatio).toBeLessThan(1.04);
    const hex = outerMetrics(mesh, -2);
    expect(hex.hexRatio).toBeGreaterThan(1.1);
    const cuff = outerMetrics(mesh, 2);
    expect(cuff.rMean).toBeGreaterThan(2.4);
  });

  it("꼭짓점이 성긴 헥스도 이음 모서리가 한 면에만 붙지 않는다", () => {
    const corner = FLAT / Math.sqrt(3);
    const ringAt = (z) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = -Math.PI + (i * Math.PI) / 3;
        return [corner * Math.cos(a), corner * Math.sin(a), z];
      });
    const cuff = (z, r) =>
      Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return [r * Math.cos(a), r * Math.sin(a), z];
      });
    const bands = [ringAt(-4), ringAt(-0.4), cuff(0.4, 2.3), cuff(6, 3.2)];
    const tris = [];
    const addCap = (loop, down) => {
      const c = [0, 0, loop[0][2]];
      for (let i = 0; i < loop.length; i += 1) {
        const j = (i + 1) % loop.length;
        tris.push(down ? [c, loop[j], loop[i]] : [c, loop[i], loop[j]]);
      }
    };
    const addLoft = (a, b) => {
      const n = a.length;
      const m = b.length;
      let i = 0;
      let j = 0;
      while (i < n || j < m) {
        if (i < n && (j >= m || i / n <= j / m)) {
          tris.push([a[i % n], a[(i + 1) % n], b[j % m]]);
          i += 1;
        } else {
          tris.push([a[Math.min(i, n) % n], b[(j + 1) % m], b[j % m]]);
          j += 1;
        }
      }
    };
    addCap(bands[0], true);
    for (let i = 0; i < bands.length - 1; i += 1) addLoft(bands[i], bands[i + 1]);
    addCap(bands[bands.length - 1], false);
    const soup = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => t.forEach((p, k) => soup.set(p, i * 9 + k * 3)));
    const mesh = Mesh.fromTriangleSoup(soup);
    const result = addMissingConnectionTaper(mesh, { implantProfile: PROFILE });
    expect(result.applied).toBe(true);
    expect(edgeUse(mesh)).toEqual({ naked: 0, nonManifold: 0 });
    const atOrigin = outerMetrics(mesh, 0);
    expect(atOrigin.rMean * 2).toBeCloseTo(3.35, 2);
    const hex = outerMetrics(mesh, -2);
    expect(hex.hexRatio).toBeGreaterThan(1.1);
  });

  it("헥스 끝이 같은 반경의 원기둥이어도 11°로 보지 않고 원뿔을 붙인다", () => {
    const corner = FLAT / Math.sqrt(3);
    const mesh = Mesh.fromTriangleSoup(
      solidOf([
        [-4, hexRadius],
        [-0.4, hexRadius],
        [-0.4, corner],
        [0.3, corner],
        [0.3, 2.4],
        [6, 3.2],
      ]),
    );
    const result = addMissingConnectionTaper(mesh, { implantProfile: PROFILE });
    expect(result.applied).toBe(true);
    const atOrigin = outerMetrics(mesh, 0);
    expect(atOrigin.rMean * 2).toBeCloseTo(3.35, 2);
    expect(atOrigin.hexRatio).toBeLessThan(1.04);
  });

  it("11° 원뿔이 이미 있으면 메시를 바꾸지 않는다", () => {
    const mesh = Mesh.fromTriangleSoup(designedSoup());
    const faces = mesh.faceCount;
    const result = addMissingConnectionTaper(mesh, { implantProfile: PROFILE });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("hex-length-ok");
    expect(mesh.faceCount).toBe(faces);
  });

  it("제조사 준비 파이프라인이 긴 헥스에 원뿔을 넣고, 접수 검사는 넣지 않는다", async () => {
    const buffer = writeBinaryStl({ positions: longHexSoup(), attributes: null });
    const out = await runAbutmentStlPipeline(buffer, {
      targetDiameter: 3.35,
      implantProfile: PROFILE,
    });
    expect(out.connectionTaper?.applied).toBe(true);
    expect(out.diameter.connection).toBeCloseTo(3.35, 1);

    const preflight = await runAbutmentStlPipeline(buffer, {
      targetDiameter: 3.35,
      implantProfile: PROFILE,
      preflight: true,
    });
    expect(preflight.preflight).toBe(true);
    expect(preflight.logs.join("\n")).not.toContain("11° 원뿔");
  }, 30000);
});
