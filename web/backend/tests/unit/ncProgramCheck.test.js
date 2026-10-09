import { describe, it, expect } from "@jest/globals";
import { buildNcAnalysis } from "../../utils/ncProgramCheck.js";

const nc = (xs) =>
  ["%", "O4000", "(T08:Rough[Ball D4.0]WX-0.3/GX5.0/GZ10.9)", ...xs, "M30", "%"].join("\n");

describe("ncProgramCheck", () => {
  it("정상 범위는 통과, 주석 속 값은 무시", () => {
    const a = buildNcAnalysis(nc(["G01 X-8.4 Y-7.2 Z-17.5", "G00 X60. Z40."]));
    expect(a.flags).toEqual([]);
    expect(a.bbox.X.min).toBeCloseTo(-8.4);
    expect(a.bbox.X.max).toBe(60);
  });
  it("오버트래블 건(X -11.3)은 플래그", () => {
    expect(buildNcAnalysis(nc(["G01 X-11.347 Z-10"])).flags).toContain("nc_x_below_limit");
  });
  it("원점 이탈로 먼 좌표는 플래그", () => {
    const f = buildNcAnalysis(nc(["G01 X-250.0 Y300.0 Z-900.0"])).flags;
    expect(f).toEqual(
      expect.arrayContaining(["nc_x_below_limit", "nc_y_above_limit", "nc_z_below_limit"]),
    );
  });
  it("좌표가 없으면 플래그", () => {
    expect(buildNcAnalysis("%\nM30\n").flags).toEqual(["nc_no_coordinates"]);
  });
});
