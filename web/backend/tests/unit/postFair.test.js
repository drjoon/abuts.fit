// related files:
// - web/backend/services/abutmentStl/postFair.js
import { describe, expect, it } from "@jest/globals";
import { parseStl, writeBinaryStl } from "../../utils/screwHoleFill.js";
import { fairPostAboveFinishLine, POST_FAIR_MAX_OUT_MM, POST_FAIR_PATCH_ATTRIBUTE } from "../../services/abutmentStl/postFair.js";

function soupOf(tris) {
  const out = new Float64Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((p, k) => out.set(p, i * 9 + k * 3)));
  return out;
}

/**
 * z<2 커프(r=2.6)와 z>=2 포스트(r=2). z=4 한 줄만 25µm 밖으로 튀어 있다.
 * 골은 z=5 한 줄이 25µm 안쪽이다. 위·아래는 열려 있다.
 */
function ridgedPostSoup() {
  const seg = 72;
  const rows = [];
  for (let z = 0; z <= 6.0001; z += 0.2) rows.push(+z.toFixed(4));
  const rAt = (z) => {
    if (z < 2) return 2.6;
    if (Math.abs(z - 4) < 1e-6) return 2.025;
    if (Math.abs(z - 5) < 1e-6) return 1.975;
    return 2;
  };
  const at = (z, i) => {
    const a = (i / seg) * Math.PI * 2;
    const r = rAt(z);
    return [r * Math.cos(a), r * Math.sin(a), z];
  };
  const tris = [];
  for (let s = 0; s < rows.length - 1; s += 1) {
    for (let i = 0; i < seg; i += 1) {
      const a = at(rows[s], i);
      const b = at(rows[s], i + 1);
      const c = at(rows[s + 1], i + 1);
      const d = at(rows[s + 1], i);
      tris.push([a, b, c], [a, c, d]);
    }
  }
  return soupOf(tris);
}

function finishLine() {
  const pts = [];
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    pts.push([2.3 * Math.cos(a), 2.3 * Math.sin(a), 2]);
  }
  return pts;
}

function weldedRadiiNearZ(buffer, z, tol = 0.02) {
  const { positions } = parseStl(buffer);
  const rs = [];
  const seen = new Set();
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 2] - z) > tol) continue;
    const key = `${Math.round(positions[i] * 1e4)},${Math.round(positions[i + 1] * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rs.push(Math.hypot(positions[i], positions[i + 1]));
  }
  return rs;
}

function coordKey(x, y, z) {
  return `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
}

describe("fairPostAboveFinishLine", () => {
  const input = writeBinaryStl({ positions: ridgedPostSoup(), attributes: null });
  const fl = finishLine();

  it("피니시라인 아래는 그대로 두고 포스트만 촘촘한 면으로 바꾼다", () => {
    const out = fairPostAboveFinishLine(input, { finishLinePoints: fl });
    expect(out.reason).toBe("");
    expect(out.patchTriangles).toBeGreaterThan(1000);
    const before = parseStl(input);
    const after = parseStl(out.buffer);
    expect(after.positions.length).toBeGreaterThan(before.positions.length);
    const beforeBelow = new Set();
    for (let i = 0; i < before.positions.length; i += 3) {
      if (before.positions[i + 2] >= 1.99) continue;
      beforeBelow.add(coordKey(before.positions[i], before.positions[i + 1], before.positions[i + 2]));
    }
    const afterBelow = new Set();
    for (let i = 0; i < after.positions.length; i += 3) {
      if (after.positions[i + 2] >= 1.99) continue;
      afterBelow.add(coordKey(after.positions[i], after.positions[i + 1], after.positions[i + 2]));
    }
    expect(afterBelow).toEqual(beforeBelow);
    const patch = [...after.attributes].filter((a) => a === POST_FAIR_PATCH_ATTRIBUTE).length;
    expect(patch).toBe(out.patchTriangles);
  });

  it("봉우리는 안쪽으로 누르고 골은 키우지 않으며 바깥으로는 나가지 않는다", () => {
    const out = fairPostAboveFinishLine(input, { finishLinePoints: fl });
    const ridge = weldedRadiiNearZ(out.buffer, 4);
    const valley = weldedRadiiNearZ(out.buffer, 5);
    const wall = weldedRadiiNearZ(out.buffer, 3);
    expect(ridge.length).toBeGreaterThan(10);
    expect(Math.max(...ridge)).toBeLessThan(2.01);
    expect(Math.min(...valley)).toBeGreaterThan(1.97);
    expect(Math.max(...valley)).toBeLessThanOrEqual(1.975 + POST_FAIR_MAX_OUT_MM + 0.004);
    expect(Math.min(...wall)).toBeGreaterThan(1.99);
    expect(Math.max(...wall)).toBeLessThanOrEqual(2 + POST_FAIR_MAX_OUT_MM + 1e-3);
    expect(out.maxOutwardMm).toBeLessThanOrEqual(POST_FAIR_MAX_OUT_MM + 1e-4);
    expect(out.movedCount).toBeGreaterThan(0);
  });

  it("피니시라인이 없으면 버퍼를 그대로 돌려준다", () => {
    const out = fairPostAboveFinishLine(input, { finishLinePoints: [] });
    expect(out.buffer).toBe(input);
    expect(out.movedCount).toBe(0);
  });
});
