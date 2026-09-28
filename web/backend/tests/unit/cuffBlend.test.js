// related files:
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js
import { describe, expect, it } from "@jest/globals";
import {
  blendCuffJunction,
  proposeCuffRedesign,
  redesignCuffBowl,
  CUFF_BLEND_PATCH_ATTRIBUTE,
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
    [2.3, 5.0],
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
  const key = (i) => `${Math.round(positions[i] * 1e5)},${Math.round(positions[i + 1] * 1e5)},${Math.round(positions[i + 2] * 1e5)}`;
  const use = new Map();
  for (let t = 0; t < positions.length / 9; t += 1) {
    const ids = [0, 1, 2].map((k) => {
      const kk = key(t * 9 + k * 3);
      if (!vid.has(kk)) vid.set(kk, vid.size);
      return vid.get(kk);
    });
    for (const [a, b] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]]) {
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

const osstem = resolveCuffConnectionSpec({ implantManufacturer: "OSSTEM", implantBrand: "TS3", implantFamily: "Regular" });

describe("resolveCuffConnectionSpec", () => {
  it("matches aliases and leaves unconfirmed brands empty", () => {
    expect(osstem.spec?.taperHeightMm).toBe(0.2);
    expect(resolveCuffConnectionSpec({ implantManufacturer: "NEOBIOTECH", implantBrand: "IS2", implantFamily: "Regular" }).spec?.key).toBe(
      "NEOBIOTECH|IS|REGULAR",
    );
    expect(resolveCuffConnectionSpec({ implantManufacturer: "DENTIUM", implantBrand: "Implantium", implantFamily: "Regular" }).spec?.key).toBe(
      "DENTIUM|SUPERLINE|REGULAR",
    );
    expect(resolveCuffConnectionSpec({ implantManufacturer: "DENTIS", implantBrand: "SQ", implantFamily: "Regular" }).spec).toBeNull();
  });
});

describe("blendCuffJunction", () => {
  it("replaces the step above the connection with a closed G2 band and keeps both protected zones", () => {
    const input = steppedAbutment();
    const res = blendCuffJunction(input, { ...osstem, specKey: osstem.key, finishLine: ringFinishLine(2.3, 3.0) });
    expect(res.ok).toBe(true);
    expect(res.detail.zA).toBeGreaterThanOrEqual(0.17);
    expect(res.detail.zA).toBeLessThanOrEqual(0.2);
    expect(res.detail.zB).toBeGreaterThan(res.detail.zA);
    expect(res.detail.zB).toBeLessThanOrEqual(3.0 - 0.2 + 1e-9);

    expect(edgeStats(res.buffer)).toEqual({ naked: 0, nonManifold: 0 });
    expect(untouchedOutside(input, res.buffer, res.detail.zA, res.detail.zB)).toBe(true);
    const { attributes } = parseStl(res.buffer);
    expect(attributes.some((a) => a === CUFF_BLEND_PATCH_ATTRIBUTE)).toBe(true);
  });

  it("marks unregistered connections as spec-pending without touching the mesh", () => {
    const res = blendCuffJunction(steppedAbutment(), { spec: null, specKey: "DENTIUM|IMPLANTIUM|REGULAR", finishLine: ringFinishLine(2.3, 3.0) });
    expect(res).toMatchObject({ ok: false, status: "spec-pending" });
  });

  it("sends files without a finish line to manual review", () => {
    const res = blendCuffJunction(steppedAbutment(), { ...osstem, specKey: osstem.key, finishLine: null });
    expect(res).toMatchObject({ ok: false, status: "manual-review" });
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
    const changed = after.filter(([r, z], i) => Math.abs(r - before[i][0]) > 1e-3);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(([, z]) => z > zA && z < zTop)).toBe(true);
  });

  it("leaves cuffs that are already steep enough alone", () => {
    const res = redesignCuffBowl(steppedAbutment(), { ...osstem, specKey: osstem.key, finishLine: ringFinishLine(2.3, 3.0) });
    expect(res).toMatchObject({ ok: false, status: "not-flat" });
  });
});
