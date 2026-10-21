import { parseStl } from "../../utils/screwHoleFill.js";
import { writeBinaryStl } from "../../utils/screwHoleFill.js";
import { TAPER_SLOPE } from "../../services/abutmentStl/cuffConnectionSpecs.js";
import { smoothConnectionTaper } from "../../services/abutmentStl/connectionTaperSmooth.js";

const SEGMENTS = 72;
const R0 = 1.675;
const NOISE = 0.006;
const cone = (z) => R0 + TAPER_SLOPE * z;

/** 원점 아래~위 원뿔(잡음 있음) → 단차 → 커프. [z, r, noisy] */
function rows() {
  const out = [[-1.0, 1.4, false]];
  for (let z = -0.6; z <= 0.2001; z += 0.05) out.push([z, cone(z), true]);
  out.push([0.2, 2.2, false]);
  for (let z = 0.25; z <= 0.8; z += 0.05) out.push([z, 2.2 + (z - 0.2) * 0.5, false]);
  out.push([0.9, 0, false]);
  return out;
}

function buildStl() {
  const rs = rows();
  const at = (i, j) => {
    const [z, r, noisy] = rs[i];
    const t = (2 * Math.PI * (j % SEGMENTS)) / SEGMENTS;
    const rr = noisy ? r + (j % 2 ? NOISE : -NOISE) : r;
    return [rr * Math.cos(t), rr * Math.sin(t), z];
  };
  const positions = [];
  for (let i = 0; i + 1 < rs.length; i += 1) {
    for (let j = 0; j < SEGMENTS; j += 1) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const c = at(i + 1, j);
      const d = at(i + 1, j + 1);
      positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  return writeBinaryStl({ positions: Float64Array.from(positions), attributes: new Uint16Array(positions.length / 9) });
}

describe("smoothConnectionTaper", () => {
  it("원뿔 잡음을 없애고 Z·원뿔 밖 꼭짓점은 그대로 둔다", () => {
    const res = smoothConnectionTaper(buildStl());
    expect(res.status).toBe("applied");
    const { positions } = parseStl(res.buffer);
    // 같은 높이 꼭짓점 반경이 하나로 모여야 한다(잡음 ±6µm 제거).
    const byZ = new Map();
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      if (z < -0.5 || z > 0.1) continue;
      const key = z.toFixed(4);
      const r = Math.hypot(positions[i], positions[i + 1]);
      const m = byZ.get(key) || { lo: Infinity, hi: -Infinity };
      m.lo = Math.min(m.lo, r);
      m.hi = Math.max(m.hi, r);
      byZ.set(key, m);
    }
    const maxDev = Math.max(...[...byZ.values()].map((m) => m.hi - m.lo));
    expect(maxDev).toBeLessThan(1e-4);
  });

  it("원뿔 위 다각형 변을 쪼개 둘레 간격을 1.5° 안으로 줄인다", () => {
    const input = buildStl();
    const res = smoothConnectionTaper(input);
    expect(res.detail.splitRounds).toBeGreaterThan(0);
    const { positions } = parseStl(res.buffer);
    expect(positions.length).toBeGreaterThan(parseStl(input).positions.length);
    // 쪼갠 새 꼭짓점도 원뿔 면 위에 있어야 한다.
    let off = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      if (z < -0.5 || z > 0.1) continue;
      off = Math.max(off, Math.abs(Math.hypot(positions[i], positions[i + 1]) - cone(z)));
    }
    expect(off).toBeLessThan(0.0125);
  });
});
