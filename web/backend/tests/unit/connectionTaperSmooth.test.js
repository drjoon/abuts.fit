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
  const out = [[-1.0, 0, false], [-1.0, 1.4, false]];
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
    // 같은 높이 원뿔 꼭짓점 반경이 하나로 모여야 한다(잡음 ±6µm 제거). 헥스·단차는 빠진다.
    const byZ = new Map();
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      const r = Math.hypot(positions[i], positions[i + 1]);
      if (z < -0.62 || z > 0.195 || Math.abs(r - cone(z)) > 0.03) continue;
      const key = z.toFixed(4);
      const m = byZ.get(key) || { lo: Infinity, hi: -Infinity, z };
      m.lo = Math.min(m.lo, r);
      m.hi = Math.max(m.hi, r);
      byZ.set(key, m);
    }
    const slices = [...byZ.values()];
    expect(slices.some((m) => m.z > 0.15)).toBe(true);
    expect(slices.some((m) => m.z < -0.4)).toBe(true);
    const maxDev = Math.max(...slices.map((m) => m.hi - m.lo));
    expect(maxDev).toBeLessThan(1e-4);
    // 단차 위 커프(z=0.3)는 원뿔로 끌어오지 않는다.
    let cuffR = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 2] - 0.3) > 1e-6) continue;
      cuffR = Math.max(cuffR, Math.hypot(positions[i], positions[i + 1]));
    }
    expect(cuffR).toBeGreaterThan(2);
  });

  it("원뿔 전체를 커프와 같은 1° 간격으로 다시 만들고 닫힌 메시를 유지한다", () => {
    const input = buildStl();
    const res = smoothConnectionTaper(input);
    expect(res.detail.bandRebuilt).toBe(true);
    const { positions } = parseStl(res.buffer);
    const tc = positions.length / 9;
    // 1° 원뿔은 72각 원본보다 둘레 점이 늘 수 있다. 커프 띠처럼 한 바퀴를 덮는 정도에서 멈춘다.
    expect(tc).toBeLessThan(parseStl(input).positions.length / 9 + 800);
    const densestGapDeg = (z0, z1) => {
      const byZ = new Map();
      for (let i = 0; i < positions.length; i += 3) {
        const z = positions[i + 2];
        if (z < z0 || z > z1) continue;
        const key = z.toFixed(3);
        const list = byZ.get(key);
        if (list) list.push(Math.atan2(positions[i + 1], positions[i]));
        else byZ.set(key, [Math.atan2(positions[i + 1], positions[i])]);
      }
      let best = null;
      for (const ang of byZ.values()) {
        if (!best || ang.length > best.length) best = ang;
      }
      if (!best || best.length < 180) return 360;
      best.sort((a, b) => a - b);
      let gap = 0;
      for (let i = 0; i < best.length; i += 1) {
        const d = (i + 1 === best.length ? best[0] + Math.PI * 2 : best[i + 1]) - best[i];
        if (d > gap) gap = d;
      }
      return (gap * 180) / Math.PI;
    };
    // 예전에는 윗단 0.05mm를 다각형으로 남겼다. 원뿔 위·아래 모두 1°를 넘지 않아야 한다.
    expect(densestGapDeg(-0.7, -0.3)).toBeLessThan(2);
    expect(densestGapDeg(0.02, 0.2)).toBeLessThan(2);
    // 새 꼭짓점도 원뿔 면 위에 있어야 한다(측정 원뿔과 실제 원뿔 차이는 잡음 크기 안).
    let off = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      const r = Math.hypot(positions[i], positions[i + 1]);
      if (z < -0.62 || z > 0.195 || Math.abs(r - cone(z)) > 0.03) continue;
      off = Math.max(off, Math.abs(r - cone(z)));
    }
    expect(off).toBeLessThan(0.0125);
    // 모든 변이 정확히 두 삼각형(반대 방향)에 쓰여야 한다.
    const key = (i) => `${Math.round(positions[i] * 1e5)},${Math.round(positions[i + 1] * 1e5)},${Math.round(positions[i + 2] * 1e5)}`;
    const edges = new Map();
    for (let t = 0; t < tc; t += 1) {
      const k = [key(t * 9), key(t * 9 + 3), key(t * 9 + 6)];
      for (let e = 0; e < 3; e += 1) {
        const id = `${k[e]}|${k[(e + 1) % 3]}`;
        edges.set(id, (edges.get(id) || 0) + 1);
      }
    }
    let open = 0;
    for (const [id, n] of edges) {
      const [a, b] = id.split("|");
      if (n !== 1 || edges.get(`${b}|${a}`) !== 1) open += 1;
    }
    expect(open).toBe(0);
  });
});
