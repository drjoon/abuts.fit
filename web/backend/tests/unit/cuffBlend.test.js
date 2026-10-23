// related files:
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js
import { describe, expect, it } from "@jest/globals";
import {
  angularRow,
  blendCuffJunction,
  proposeCuffRedesign,
  redesignCuffBowl,
  CUFF_BLEND_PATCH_ATTRIBUTE,
  _prepare,
  _smoothProfilesAcrossColumns,
} from "../../services/abutmentStl/cuffBlend.js";
import { resolveCuffConnectionSpec, TAPER_SLOPE } from "../../services/abutmentStl/cuffConnectionSpecs.js";
import { parseStl, writeBinaryStl } from "../../utils/screwHoleFill.js";

const SEG = 180;
const R_CHANNEL = 1.0;
const R0 = 3.35 / 2;
const cone = (z) => R0 + TAPER_SLOPE * z;

/** 바깥 옆모습 [r, z](아래→위)를 축 둘레로 돌리고 스크류 채널로 닫은 메시. */
function revolve(outer) {
  const zBottom = outer[0][1];
  const zTop = outer[outer.length - 1][1];
  const loop = [...outer, [R_CHANNEL, zTop], [R_CHANNEL, zBottom]];
  const tris = [];
  const at = ([r, z], i) => {
    const a = (i / SEG) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a), z];
  };
  for (let k = 0; k < loop.length; k += 1) {
    const p = loop[k];
    const q = loop[(k + 1) % loop.length];
    for (let i = 0; i < SEG; i += 1) {
      const p0 = at(p, i);
      const p1 = at(p, i + 1);
      const q0 = at(q, i);
      const q1 = at(q, i + 1);
      tris.push([p0, p1, q1], [p0, q1, q0]);
    }
  }
  const positions = new Float64Array(tris.length * 9);
  tris.forEach((t, i) => positions.set(t.flat(), i * 9));
  return writeBinaryStl({ positions, attributes: new Uint16Array(tris.length) });
}

const coneRows = (z0, z1, step = 0.05) => {
  const rows = [];
  for (let z = z0; z < z1 - 1e-9; z += step) rows.push([cone(z), z]);
  rows.push([cone(z1), z1]);
  return rows;
};

/** 커넥션 원뿔(원점 3.35, 0.2mm) 위에 0.06mm 바깥 턱 + 꺾인 커프. */
function steppedAbutment() {
  return revolve([
    ...coneRows(-1.2, 0.2),
    [cone(0.2) + 0.06, 0.2],
    [2.0, 1.2],
    [2.3, 2.5],
    [2.3, 3.0],
    [2.1, 5.0],
  ]);
}

/** 원뿔이 스펙 Z_a(0.2)보다 먼저(0.15) 20°로 서서히 벌어지는 커프. 12µm 허용치로는 0.2 넘어서까지 원뿔로 보인다. */
function earlyFlareAbutment() {
  const flare = Math.tan((20 * Math.PI) / 180);
  return revolve([
    ...coneRows(-1.2, 0.15),
    ...[0.2, 0.25, 0.3].map((z) => [cone(0.15) + flare * (z - 0.15), z]),
    [2.0, 1.2],
    [2.3, 2.5],
    [2.3, 3.0],
    [2.1, 5.0],
  ]);
}

/** 마진 바로 아래가 거의 90°(약 86°)로 꺾여 나가는 커프. */
function steepMarginShelfAbutment() {
  return revolve([
    ...coneRows(-1.2, 0.33),
    [1.82, 0.5],
    [2.05, 0.72],
    [2.55, 0.77],
    [2.35, 3.0],
  ]);
}

/** 원뿔 끝(Z≈0.3) 수평 턱 위로 S자 어깨가 붙고, 0.45mm 위 낮은 마진 아래가 80°쯤 누운 커프. */
function lowMarginShoulderAbutment() {
  return revolve([
    ...coneRows(-1.2, 0.295),
    [1.85, 0.3],
    [1.95, 0.36],
    [2.02, 0.45],
    [2.1, 0.6],
    [2.2, 0.66],
    [2.6, 0.73],
    [2.3, 3.0],
  ]);
}

/** 하부는 오목하게 올라가고 마진 아래 상부(z=1.8~3.2)는 다각형 볼록으로 이어지는 커프. */
function convexUpperCuffAbutment() {
  return revolve([
    ...coneRows(-1.2, 0.2),
    [cone(0.2) + 0.05, 0.22],
    [2.1, 1.0],
    [2.38, 1.4],
    [3.04, 1.95],
    [3.42, 2.4],
    [3.73, 2.8],
    [4.04, 3.2],
    [3.7, 5.0],
  ]);
}

/** 원뿔 위 짧은 높이에서 반경이 크게 벌어지는 커프. 이음 끝이 70°를 넘는다. */
function wideStepAbutment() {
  return revolve([
    ...coneRows(-1.2, 0.2),
    [cone(0.2) + 0.02, 0.22],
    [4.2, 1.26],
    [3.9, 3.0],
  ]);
}

/** 마진이 높이 있고 하부 수직 벽 위에서 상부만 벌어져 전체 벌어짐이 11° 연장보다 작은 열이다. */
function tallModestFlareAbutment() {
  const rTop = cone(0.2) + 1.05;
  return revolve([
    ...coneRows(-1.2, 0.2),
    [cone(0.2) + 0.04, 0.22],
    [cone(0.2) + 0.04, 3.3],
    [rTop, 6.5],
    [rTop - 0.2, 8],
  ]);
}

/** 원뿔 위 접시(거의 수평)로 퍼졌다가 수직 커프로 피니시라인까지. */
function dishAbutment() {
  return revolve([
    ...coneRows(-1.2, 0.2),
    [cone(0.2) + 0.03, 0.22],
    [3.0, 0.45],
    [3.0, 2.6],
    [2.4, 2.8],
    [2.2, 5.0],
  ]);
}

const ringFinishLine = (r, z) => ({
  min_z: z,
  max_z: z,
  points: Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a), z];
  }),
});

function edgeStats(buffer) {
  const { positions } = parseStl(buffer);
  const vid = new Map();
  const key = (i) =>
    `${Math.round(positions[i] * 1e5)},${Math.round(positions[i + 1] * 1e5)},${Math.round(positions[i + 2] * 1e5)}`;
  const use = new Map();
  for (let t = 0; t < positions.length / 9; t += 1) {
    const ids = [0, 1, 2].map((k) => {
      const kk = key(t * 9 + k * 3);
      if (!vid.has(kk)) vid.set(kk, vid.size);
      return vid.get(kk);
    });
    for (const [a, b] of [
      [ids[0], ids[1]],
      [ids[1], ids[2]],
      [ids[2], ids[0]],
    ]) {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      use.set(k, (use.get(k) || 0) + 1);
    }
  }
  let naked = 0;
  let nonManifold = 0;
  for (const n of use.values()) {
    if (n === 1) naked += 1;
    if (n > 2) nonManifold += 1;
  }
  return { naked, nonManifold };
}

/** 정점 z가 [lo, hi] 밖인 삼각형은 원본에 그대로 있어야 한다. */
function untouchedOutside(before, after, lo, hi) {
  const tri = (p, t) =>
    [0, 1, 2]
      .map((k) => [p[t * 9 + k * 3], p[t * 9 + k * 3 + 1], p[t * 9 + k * 3 + 2]].map((v) => Math.round(v * 1e4)).join(","))
      .sort()
      .join("|");
  const a = parseStl(before).positions;
  const b = parseStl(after).positions;
  const kept = new Set();
  for (let t = 0; t < b.length / 9; t += 1) kept.add(tri(b, t));
  for (let t = 0; t < a.length / 9; t += 1) {
    const zs = [a[t * 9 + 2], a[t * 9 + 5], a[t * 9 + 8]];
    if (Math.max(...zs) < lo || Math.min(...zs) > hi) {
      if (!kept.has(tri(a, t))) return false;
    }
  }
  return true;
}

const osstem = resolveCuffConnectionSpec({
  implantManufacturer: "OSSTEM",
  implantBrand: "TS3",
  implantFamily: "Regular",
});
const megagen = resolveCuffConnectionSpec({
  implantManufacturer: "MEGAGEN",
  implantBrand: "AnyOne",
  implantFamily: "Regular",
});

describe("resolveCuffConnectionSpec", () => {
  it("matches aliases and leaves unconfirmed brands empty", () => {
    expect(osstem.spec?.taperHeightMm).toBe(0.2);
    expect(
      resolveCuffConnectionSpec({ implantManufacturer: "NEOBIOTECH", implantBrand: "IS2", implantFamily: "Regular" })
        .spec?.key,
    ).toBe("NEOBIOTECH|IS|REGULAR");
    expect(
      resolveCuffConnectionSpec({ implantManufacturer: "DENTIUM", implantBrand: "Implantium", implantFamily: "Regular" })
        .spec?.key,
    ).toBe("DENTIUM|SUPERLINE|REGULAR");
    expect(
      resolveCuffConnectionSpec({ implantManufacturer: "DIO", implantBrand: "UF", implantFamily: "Narrow" }).spec,
    ).toBeNull();
  });
});

describe("blendCuffJunction", () => {
  it("replaces the step above the connection with a closed band and keeps both protected zones", () => {
    const input = steppedAbutment();
    const res = blendCuffJunction(input, { ...osstem, specKey: osstem.key, finishLine: ringFinishLine(2.3, 3.0) });
    expect(res.ok).toBe(true);
    expect(res.detail.zA).toBeGreaterThanOrEqual(0.17);
    expect(res.detail.zA).toBeLessThanOrEqual(0.21);
    expect(res.detail.zB).toBeGreaterThan(res.detail.zA);

    expect(edgeStats(res.buffer)).toEqual({ naked: 0, nonManifold: 0 });
    expect(untouchedOutside(input, res.buffer, res.detail.zA, 3.001)).toBe(true);
    const { attributes } = parseStl(res.buffer);
    expect(attributes.some((a) => a === CUFF_BLEND_PATCH_ATTRIBUTE)).toBe(true);
  });

  it("keeps the blended cuff inside the original outline (no outward move below the margin)", () => {
    const input = steppedAbutment();
    const res = blendCuffJunction(input, { ...osstem, specKey: osstem.key, finishLine: ringFinishLine(2.3, 3.0) });
    expect(res.ok).toBe(true);
    const preProbe = _prepare(input).probe;
    const postProbe = _prepare(res.buffer).probe;
    for (const theta of [0.1, 2.0, 4.0]) {
      for (let z = res.detail.zA + 0.05; z <= 2.95; z += 0.05) {
        const before = preProbe.rayRadius(theta, z);
        const after = postProbe.rayRadius(theta, z);
        if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
        expect(after).toBeLessThanOrEqual(before + 0.002);
      }
    }
  });

  it("starts the blend where the cone actually departs so the side profile rises from 11° without a shoulder", () => {
    const input = earlyFlareAbutment();
    const res = blendCuffJunction(input, { ...osstem, specKey: osstem.key, finishLine: ringFinishLine(2.3, 3.0) });
    expect(res.ok).toBe(true);
    expect(res.detail.zA).toBeLessThanOrEqual(0.15);
    const probe = _prepare(res.buffer).probe;
    const step = 0.02;
    const degs = [];
    for (let z = 0.1; z <= 0.6; z += step) {
      degs.push((Math.atan((probe.rayRadius(0.1, z + step) - probe.rayRadius(0.1, z)) / step) * 180) / Math.PI);
    }
    expect(degs[0]).toBeCloseTo(11, 0);
    for (let i = 1; i < degs.length; i += 1) expect(degs[i]).toBeGreaterThan(degs[i - 1] - 0.3);
  });

  it("keeps a concave blend when the finish line is above 1mm even on a steep shelf", () => {
    const input = steepMarginShelfAbutment();
    const low = blendCuffJunction(input, {
      ...megagen,
      specKey: megagen.key,
      finishLine: ringFinishLine(2.55, 0.77),
    });
    const high = blendCuffJunction(input, {
      ...megagen,
      specKey: megagen.key,
      finishLine: ringFinishLine(2.51, 1.2),
    });
    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
    const lowProbe = _prepare(low.buffer).probe;
    const highProbe = _prepare(high.buffer).probe;
    expect(lowProbe.rayRadius(0.1, 0.65)).toBeGreaterThan(highProbe.rayRadius(0.1, 0.65));
  });

  it("deforms a nearly 90° gingival cuff outward (more convex) to stay <= 70° without deforming below z=0.3mm", () => {
    const input = steepMarginShelfAbutment();
    const res = blendCuffJunction(input, {
      ...megagen,
      specKey: megagen.key,
      finishLine: ringFinishLine(2.55, 0.77),
    });
    expect(res.ok).toBe(true);
    expect(res.detail.maxAngleDeg).toBeLessThanOrEqual(70);
    // z < 0.3mm below connection top is untouched
    expect(untouchedOutside(input, res.buffer, 0.3, 0.771)).toBe(true);
    // Surface below the finish line becomes fuller (more convex) and stays <= 70°
    const preProbe = _prepare(input).probe;
    const postProbe = _prepare(res.buffer).probe;
    expect(postProbe.rayRadius(0.1, 0.65)).toBeGreaterThan(preProbe.rayRadius(0.1, 0.65));
    for (let z = 0.35; z <= 0.74; z += 0.03) {
      const deg = (Math.atan2(postProbe.rayRadius(0.1, z + 0.02) - postProbe.rayRadius(0.1, z), 0.02) * 180) / Math.PI;
      expect(deg).toBeLessThanOrEqual(70);
    }
    // 원뿔 끝(Z_a)에서 11° 접선으로 출발하고, 바닥 보호(Z_a+0.02mm)에서도 곡률이 급격히 꺾이지 않는다.
    const startDeg =
      (Math.atan((postProbe.rayRadius(0.1, res.detail.zA + 0.01) - postProbe.rayRadius(0.1, res.detail.zA)) / 0.01) *
        180) /
      Math.PI;
    expect(Math.abs(startDeg - 11)).toBeLessThan(2);
    const dz = 0.02;
    for (let z = res.detail.zA + dz; z <= 0.77 - dz; z += dz) {
      const r0 = postProbe.rayRadius(0.1, z - dz);
      const r1 = postProbe.rayRadius(0.1, z);
      const r2 = postProbe.rayRadius(0.1, z + dz);
      const dr = (r2 - r0) / (2 * dz);
      const d2r = (r2 - 2 * r1 + r0) / (dz * dz);
      if (d2r > 1e-6) {
        const concaveR = Math.pow(1 + dr * dr, 1.5) / d2r;
        expect(concaveR).toBeGreaterThan(0.12);
      }
    }
  });

  it("replaces a shoulder above a low connection top with one smooth flare even when the margin underside is past 70°", () => {
    const input = lowMarginShoulderAbutment();
    const dentisSq = resolveCuffConnectionSpec({
      implantManufacturer: "DENTIS",
      implantBrand: "SQ",
      implantFamily: "Regular",
    });
    const res = blendCuffJunction(input, {
      ...dentisSq,
      specKey: dentisSq.key,
      finishLine: ringFinishLine(2.6, 0.73),
    });
    expect(res).toMatchObject({ ok: true, status: "applied" });
    expect(res.detail.zA).toBeLessThan(0.3);
    expect(res.detail.maxAngleDeg).toBeGreaterThan(70);
    const probe = _prepare(res.buffer).probe;
    const dz = 0.01;
    const degs = [];
    for (let z = res.detail.zA; z <= 0.68; z += dz) {
      degs.push((Math.atan((probe.rayRadius(0.1, z + dz) - probe.rayRadius(0.1, z)) / dz) * 180) / Math.PI);
    }
    expect(Math.abs(degs[0] - 11)).toBeLessThan(2);
    // 어깨(기울기가 섰다가 크게 다시 눕는 곳) 없이 마진까지 벌어진다.
    let peak = 0;
    for (const d of degs) {
      peak = Math.max(peak, d);
      expect(peak - d).toBeLessThan(5);
    }
    // 원뿔 바로 위가 꺾이지 않는다(Z=0.3 바닥 보호에서 곡률이 튀지 않음).
    for (let z = res.detail.zA + 0.02; z <= 0.45; z += 0.01) {
      const r0 = probe.rayRadius(0.1, z - 0.02);
      const r1 = probe.rayRadius(0.1, z);
      const r2 = probe.rayRadius(0.1, z + 0.02);
      const dr = (r2 - r0) / 0.04;
      const d2r = (r2 - 2 * r1 + r0) / 0.0004;
      if (d2r > 1e-6) expect(Math.pow(1 + dr * dr, 1.5) / d2r).toBeGreaterThan(0.12);
    }
  });

  it("keeps a convex upper cuff smoothly convex without creating a concave groove below the finish line", () => {
    const input = convexUpperCuffAbutment();
    const res = blendCuffJunction(input, {
      ...osstem,
      specKey: osstem.key,
      finishLine: ringFinishLine(4.04, 3.2),
    });
    expect(res.ok).toBe(true);
    expect(edgeStats(res.buffer)).toEqual({ naked: 0, nonManifold: 0 });
    const postProbe = _prepare(res.buffer).probe;
    const step = 0.08;
    const slopes = [];
    for (let z = 2.2; z <= 3.04; z += step) {
      slopes.push((postProbe.rayRadius(0.1, z + step) - postProbe.rayRadius(0.1, z)) / step);
    }
    // Base concave profile is kept; only the last stretch near the finish line turns slightly convex without any slope kink
    const peak = Math.max(...slopes);
    const last = slopes[slopes.length - 1];
    expect(slopes[0]).toBeLessThan(peak);
    expect(last).toBeLessThan(slopes[slopes.length - 2]);
    expect(peak - last).toBeGreaterThan(0.03);
    expect(peak - last).toBeLessThan(0.3);
      for (let i = 1; i + 1 < slopes.length; i += 1) {
        expect(Math.abs(slopes[i] - slopes[i - 1])).toBeLessThan(0.06);
      }
  });

  it("still replaces a wide step whose blend ends steeper than 70°", () => {
    const input = wideStepAbutment();
    const res = blendCuffJunction(input, {
      ...osstem,
      specKey: osstem.key,
      finishLine: ringFinishLine(4.2, 1.26),
    });
    expect(res).toMatchObject({ ok: true, status: "applied" });
    expect(res.detail.maxAngleDeg).toBeGreaterThan(70);
    expect(res.detail.patchTriangles).toBeGreaterThan(0);
    expect(edgeStats(res.buffer)).toEqual({ naked: 0, nonManifold: 0 });
  });

  it("builds the seam on a tall modest flare without a step below the finish line", () => {
    const rTop = cone(0.2) + 1.05;
    const input = tallModestFlareAbutment();
    const res = blendCuffJunction(input, {
      ...osstem,
      specKey: osstem.key,
      finishLine: ringFinishLine(rTop, 6.5),
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("applied");
    const probe = _prepare(res.buffer).probe;
    const ra = probe.rayRadius(0.1, res.detail.zA);
    for (let z = res.detail.zA; z <= 6.4; z += 0.4) {
      expect(probe.rayRadius(0.1, z)).toBeGreaterThan(ra - 0.05);
    }
    const step = 0.08;
    const slopes = [];
    for (let z = 5.9; z <= 6.42; z += step) {
      slopes.push((probe.rayRadius(0.1, z + step) - probe.rayRadius(0.1, z)) / step);
    }
    for (let i = 1; i < slopes.length; i += 1) {
      expect(Math.abs(slopes[i] - slopes[i - 1])).toBeLessThan(0.03);
    }
  });

  it("marks unregistered connections as spec-pending without touching the mesh", () => {
    const res = blendCuffJunction(steppedAbutment(), {
      spec: null,
      specKey: "DIO|UF|NARROW",
      finishLine: ringFinishLine(2.3, 3.0),
    });
    expect(res).toMatchObject({ ok: false, status: "spec-pending" });
  });

  it("sends files without a finish line to manual review", () => {
    const res = blendCuffJunction(steppedAbutment(), { ...osstem, specKey: osstem.key, finishLine: null });
    expect(res).toMatchObject({ ok: false, status: "manual-review" });
  });

  it("smooths column profiles around the axis without moving the cone start or the top radius", () => {
    const n = 360;
    const ra = 1.7;
    // 열 사이에서 프로파일 분기가 바뀌는 곳: 중간 반경이 각도에 대해 꺾인다(세로 꺾임선).
    const profiles = Array.from({ length: n }, (_, j) => {
      const theta = (j / n) * 2 * Math.PI;
      const r1 = 3.5 + 0.2 * Math.cos(theta);
      const bump = 0.08 * Math.abs(theta - Math.PI);
      return (t) => ra + 0.4 * t + (r1 - ra - 0.4) * t ** 3 + bump * t ** 3 * (1 - t);
    });
    const smooth = _smoothProfilesAcrossColumns(profiles);
    const kinkAt = (fns, j, t) => Math.abs(fns[j + 1](t) - 2 * fns[j](t) + fns[j - 1](t));
    expect(kinkAt(profiles, n / 2, 0.6)).toBeGreaterThan(5e-5);
    expect(kinkAt(smooth, n / 2, 0.6)).toBeLessThan(kinkAt(profiles, n / 2, 0.6) / 3);
    for (const j of [0, n / 4, n / 2, (3 * n) / 4]) {
      expect(smooth[j](0)).toBeCloseTo(profiles[j](0), 9);
      expect(smooth[j](1)).toBeCloseTo(profiles[j](1), 9);
      expect((smooth[j](1e-3) - smooth[j](0)) / 1e-3).toBeCloseTo((profiles[j](1e-3) - profiles[j](0)) / 1e-3, 4);
    }
  });

  it("subdivides coarse 46-gon connection edges at zA so the cuff start has no steep fan facets", () => {
    const seg = 46;
    const outer = [
      ...coneRows(-1.2, 0.2),
      [cone(0.2) + 0.06, 0.2],
      [2.0, 1.2],
      [2.3, 2.5],
      [2.3, 3.0],
      [2.1, 5.0],
    ];
    const zBottom = outer[0][1];
    const zTop = outer[outer.length - 1][1];
    const loop = [...outer, [R_CHANNEL, zTop], [R_CHANNEL, zBottom]];
    const tris = [];
    const at = ([r, z], i) => {
      const a = (i / seg) * Math.PI * 2;
      return [r * Math.cos(a), r * Math.sin(a), z];
    };
    for (let k = 0; k < loop.length; k += 1) {
      const p = loop[k];
      const q = loop[(k + 1) % loop.length];
      for (let i = 0; i < seg; i += 1) {
        tris.push([at(p, i), at(p, i + 1), at(q, i + 1)], [at(p, i), at(q, i + 1), at(q, i)]);
      }
    }
    const positions = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => positions.set(t.flat(), i * 9));
    const input = writeBinaryStl({ positions, attributes: new Uint16Array(tris.length) });
    const res = blendCuffJunction(input, { ...osstem, specKey: osstem.key, finishLine: ringFinishLine(2.3, 3.0) });
    expect(res.ok).toBe(true);
    expect(edgeStats(res.buffer)).toEqual({ naked: 0, nonManifold: 0 });
    const outPos = parseStl(res.buffer).positions;
    let worstNz = 0;
    for (let t = 0; t < outPos.length / 9; t += 1) {
      const o = t * 9;
      const cz = (outPos[o + 2] + outPos[o + 5] + outPos[o + 8]) / 3;
      const cr = Math.hypot((outPos[o] + outPos[o + 3] + outPos[o + 6]) / 3, (outPos[o + 1] + outPos[o + 4] + outPos[o + 7]) / 3);
      if (cr < 1.5 || cz < res.detail.zA || cz > res.detail.zA + 0.03) continue;
      const ux = outPos[o + 3] - outPos[o], uy = outPos[o + 4] - outPos[o + 1], uz = outPos[o + 5] - outPos[o + 2];
      const vx = outPos[o + 6] - outPos[o], vy = outPos[o + 7] - outPos[o + 1], vz = outPos[o + 8] - outPos[o + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      worstNz = Math.min(worstNz, nz / len);
    }
    expect(worstNz).toBeGreaterThan(-0.35);
  });
});

describe("angularRow", () => {
  const ring = (degrees) => {
    const verts = [];
    degrees.forEach((deg) => {
      const a = (deg * Math.PI) / 180;
      verts.push(Math.cos(a), Math.sin(a), 1);
    });
    return { loop: degrees.map((_, i) => i), verts };
  };

  it("keeps a one-step zigzag under 15° and a monotonic angle key", () => {
    const degrees = Array.from({ length: 36 }, (_, i) => i * 10);
    degrees[3] = 18;
    const { loop, verts } = ring(degrees);
    const row = angularRow(loop, verts);
    expect(row).not.toBeNull();
    expect(row.map((p) => p.v)).toContain(3);
    for (let i = 1; i < row.length; i += 1) expect(row[i].a).toBeGreaterThan(row[i - 1].a);
  });

  it("rejects a fold that turns back more than 15°", () => {
    const degrees = Array.from({ length: 36 }, (_, i) => i * 10);
    degrees[3] = 0;
    const { loop, verts } = ring(degrees);
    expect(angularRow(loop, verts)).toBeNull();
  });
});

describe("redesignCuffBowl", () => {
  it("replaces a cuff flatter than 70° with a G2 curve that stays within 70°", () => {
    const input = dishAbutment();
    const finishLine = ringFinishLine(3.0, 2.6);
    const res = redesignCuffBowl(input, { ...osstem, specKey: osstem.key, finishLine });
    expect(res.ok).toBe(true);
    expect(res.detail.maxCuffAngleDegBefore).toBeGreaterThan(70);
    expect(res.detail.maxAngleDeg).toBeLessThanOrEqual(70.5);
    expect(edgeStats(res.buffer)).toEqual({ naked: 0, nonManifold: 0 });
    expect(untouchedOutside(input, res.buffer, res.detail.zA, 2.6 - 0.2)).toBe(true);
  });

  it("proposes the same curve without touching the mesh", () => {
    const input = dishAbutment();
    const finishLine = ringFinishLine(3.0, 2.6);
    const proposal = proposeCuffRedesign(input, { ...osstem, specKey: osstem.key, finishLine });
    expect(proposal).toMatchObject({ ok: true, status: "proposed" });
    expect(proposal.buffer).toBeUndefined();
    const { before, after, zA, zTop } = proposal.curve;
    expect(before.length).toBe(after.length);
    const changed = after.filter(([r], i) => Math.abs(r - before[i][0]) > 1e-3);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(([, z]) => z > zA && z < zTop)).toBe(true);
  });

  it("leaves cuffs that are already steep enough alone", () => {
    const res = redesignCuffBowl(steppedAbutment(), {
      ...osstem,
      specKey: osstem.key,
      finishLine: ringFinishLine(2.3, 3.0),
    });
    expect(res).toMatchObject({ ok: false, status: "not-flat" });
  });
});
