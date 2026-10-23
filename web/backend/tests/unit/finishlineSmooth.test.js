import { describe, expect, it } from "@jest/globals";
import { detectFinishLine, smoothFinishlineLoop } from "../../services/abutmentStl/finishline.js";
import { Mesh } from "../../services/abutmentStl/meshCore.js";

function ring(zAt) {
  const pts = [];
  for (let i = 0; i < 80; i += 1) {
    const a = (i / 80) * Math.PI * 2;
    pts.push([3 * Math.cos(a), 3 * Math.sin(a), zAt(a)]);
  }
  pts.push(pts[0].slice());
  return pts;
}

function zRange(pts) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    lo = Math.min(lo, p[2]);
    hi = Math.max(hi, p[2]);
  }
  return hi - lo;
}

describe("smoothFinishlineLoop", () => {
  it("한 점짜리 높이 돌기를 누르고, 맞은편 스캘럽은 그대로 둔다", () => {
    const raw = ring((a) => 0.8 * Math.sin(2 * a));
    const spike = 10;
    raw[spike][2] += 0.8;
    const out = smoothFinishlineLoop(raw);
    expect(out[spike][2]).toBeLessThan(raw[spike][2] - 0.45);
    expect(Math.abs(out[50][2] - raw[50][2])).toBeLessThan(0.08);
    expect(zRange(out)).toBeGreaterThan(1.3);
  });

  it("이미 매끈한 원은 거의 움직이지 않는다", () => {
    const raw = ring(() => 2);
    const out = smoothFinishlineLoop(raw);
    let max = 0;
    for (let i = 0; i < raw.length; i += 1) {
      max = Math.max(
        max,
        Math.hypot(out[i][0] - raw[i][0], out[i][1] - raw[i][1], out[i][2] - raw[i][2]),
      );
    }
    expect(max).toBeLessThan(0.04);
  });
});

/** 회전면. 각 변화는 용접각보다 작게 두어 단면 추적으로 가게 한다. */
function revolution(rAt, z0, z1, step, columns) {
  const zs = [];
  for (let z = z0; z <= z1 + 1e-9; z += step) zs.push(z);
  const positions = [];
  const at = (i, j) => {
    const a = (j / columns) * Math.PI * 2;
    const r = rAt(zs[i]);
    return [r * Math.cos(a), r * Math.sin(a), zs[i]];
  };
  const push = (p) => positions.push(p[0], p[1], p[2]);
  for (let i = 0; i < zs.length - 1; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      const j2 = (j + 1) % columns;
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j2);
      const d = at(i, j2);
      push(a);
      push(b);
      push(c);
      push(a);
      push(c);
      push(d);
    }
  }
  return Mesh.fromTriangleSoup(positions);
}

describe("detectFinishLine crown wider than margin", () => {
  it("목으로 좁아진 뒤 더 넓은 크라운 봉우리는 따라가지 않는다", () => {
    // 전 구간 기울기가 연속이라 모서리 고리는 위·아래 경계뿐이다. 위는 좁아 어깨로 안 잡힌다.
    const rAt = (z) => {
      const shoulder = 2.1 / (1 + Math.exp(-(z - 2.8) / 0.55));
      const neck = 0.2 * Math.exp(-((z - 5.25) ** 2) / 0.16);
      const crown = 0.5 * Math.exp(-((z - 7.7) ** 2) / 0.9);
      const close = 1 / (1 + Math.exp((z - 9.6) / 0.28));
      return 1.15 + (shoulder - neck + crown) * close;
    };
    const mesh = revolution(rAt, 0, 11.6, 0.1, 72);
    const fl = detectFinishLine(mesh.unweldedByAngle(), { axis: [0, 0, 1] });
    const core = fl.points.slice(0, -1);
    const zs = core.map((p) => p[2]);
    expect(String(fl.strategyUsed)).toContain("SECTION_");
    expect(Math.min(...zs)).toBeGreaterThan(4.05);
    expect(Math.max(...zs)).toBeLessThan(5.2);
  });
});
