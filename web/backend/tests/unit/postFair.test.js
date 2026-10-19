// related files:
// - web/backend/services/abutmentStl/postFair.js
import { describe, expect, it } from "@jest/globals";
import { parseStl, writeBinaryStl } from "../../utils/screwHoleFill.js";
import { fairPostAboveFinishLine, POST_FAIR_MAX_OUT_MM } from "../../services/abutmentStl/postFair.js";

function soupOf(tris) {
  const out = new Float64Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((p, k) => out.set(p, i * 9 + k * 3)));
  return out;
}

/**
 * z<2 커프(r=2.6)와 z>=2 포스트(r=2). z=4 한 줄만 25µm 밖으로 튀어 있다.
 * 골은 z=5 한 줄이 25µm 안쪽이다.
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

function weldedRadiiAtZ(buffer, z) {
  const { positions } = parseStl(buffer);
  const rs = [];
  const seen = new Set();
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 2] - z) > 1e-4) continue;
    const key = `${Math.round(positions[i] * 1e4)},${Math.round(positions[i + 1] * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rs.push(Math.hypot(positions[i], positions[i + 1]));
  }
  return rs;
}

describe("fairPostAboveFinishLine", () => {
  const input = writeBinaryStl({ positions: ridgedPostSoup(), attributes: null });
  const fl = finishLine();

  it("삼각형 수와 피니시라인 아래 좌표는 그대로 둔다", () => {
    const out = fairPostAboveFinishLine(input, { finishLinePoints: fl });
    const before = parseStl(input);
    const after = parseStl(out.buffer);
    expect(after.positions.length).toBe(before.positions.length);
    expect(out.faceCount).toBe(before.positions.length / 9);
    for (let i = 0; i < before.positions.length; i += 3) {
      if (before.positions[i + 2] >= 1.99) continue;
      expect(after.positions[i]).toBeCloseTo(before.positions[i], 5);
      expect(after.positions[i + 1]).toBeCloseTo(before.positions[i + 1], 5);
      expect(after.positions[i + 2]).toBeCloseTo(before.positions[i + 2], 5);
    }
  });

  it("포스트 봉우리는 안쪽으로 누르고, 골과 바깥 이동은 남긴다", () => {
    const out = fairPostAboveFinishLine(input, { finishLinePoints: fl });
    const ridge = weldedRadiiAtZ(out.buffer, 4);
    const valley = weldedRadiiAtZ(out.buffer, 5);
    const wall = weldedRadiiAtZ(out.buffer, 3);
    expect(ridge.length).toBeGreaterThan(10);
    expect(Math.max(...ridge)).toBeLessThan(2.006);
    expect(Math.min(...valley)).toBeGreaterThan(1.97);
    expect(Math.max(...valley)).toBeLessThanOrEqual(1.975 + POST_FAIR_MAX_OUT_MM + 1e-4);
    expect(Math.min(...wall)).toBeGreaterThan(1.995);
    expect(Math.max(...wall)).toBeLessThanOrEqual(2 + POST_FAIR_MAX_OUT_MM + 1e-4);
    expect(out.maxOutwardMm).toBeLessThanOrEqual(POST_FAIR_MAX_OUT_MM + 1e-6);
    expect(out.movedCount).toBeGreaterThan(0);
  });

  it("피니시라인이 없으면 버퍼를 그대로 돌려준다", () => {
    const out = fairPostAboveFinishLine(input, { finishLinePoints: [] });
    expect(out.buffer).toBe(input);
    expect(out.movedCount).toBe(0);
  });
});
