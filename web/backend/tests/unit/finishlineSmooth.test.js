import { describe, expect, it } from "@jest/globals";
import { smoothFinishlineLoop } from "../../services/abutmentStl/finishline.js";

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
