import { describe, it, expect } from "@jest/globals";
import { evaluateAutoMachiningGate } from "../../services/autoMachiningGate.service.js";

function ring(n = 60, r = 4, z = 2) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a), z + 0.05 * Math.sin(a * 2)];
  });
}
function okRequest(over = {}) {
  return {
    caseInfos: {
      maxDiameter: 8.2,
      stlFile: { s3Key: "x/2-filled/a.stl" },
      finishLine: { points: ring(), min_z: 1.9 },
      ...over,
    },
    productionSchedule: { diameterGroup: "10" },
  };
}

describe("evaluateAutoMachiningGate", () => {
  it("정상 건은 통과", () => {
    const r = evaluateAutoMachiningGate(okRequest());
    expect(r.reasons).toEqual([]);
    expect(r.verdict).toBe("approved");
  });
  it("10mm 초과·측정오류 직경은 보류", () => {
    expect(
      evaluateAutoMachiningGate(okRequest({ maxDiameter: 10.31 })).reasons,
    ).toContain("diameter_over_limit");
    expect(
      evaluateAutoMachiningGate(okRequest({ maxDiameter: 47.6 })).reasons,
    ).toContain("absurd_diameter");
    expect(
      evaluateAutoMachiningGate(okRequest({ maxDiameter: null })).reasons,
    ).toContain("missing_diameter");
  });
  it("피니시라인 min_z가 낮으면 보류", () => {
    const r = evaluateAutoMachiningGate(
      okRequest({ finishLine: { points: ring(), min_z: 0.29 } }),
    );
    expect(r.reasons).toContain("finishline_low_z");
  });
  it("벽면 등반 피니시라인은 보류", () => {
    const pts = ring();
    pts[10][2] = 5;
    const r = evaluateAutoMachiningGate(
      okRequest({ finishLine: { points: pts, min_z: 1.9 } }),
    );
    expect(r.verdict).toBe("hold");
    expect(r.reasons.some((x) => x.startsWith("finishline_"))).toBe(true);
  });
  it("테스트치과·테스트기공소는 정상이어도 보류", () => {
    expect(
      evaluateAutoMachiningGate(okRequest({ clinicName: "테스트치과" })).reasons,
    ).toContain("test_account");
    expect(
      evaluateAutoMachiningGate({
        ...okRequest(),
        requestorBusinessName: "테스트기공소",
      }).verdict,
    ).toBe("hold");
    expect(
      evaluateAutoMachiningGate(okRequest({ clinicName: "향기로운치과" })).reasons,
    ).not.toContain("test_account");
  });
  it("커프 manual-review·NC 좌표 이탈·STL 누락은 보류", () => {
    expect(
      evaluateAutoMachiningGate(okRequest({ cuffBlend: { status: "manual-review" } }))
        .reasons,
    ).toContain("cuff_manual-review");
    expect(
      evaluateAutoMachiningGate(
        okRequest({ ncFile: { analysis: { flags: ["nc_x_below_limit"] } } }),
      ).reasons,
    ).toContain("nc_x_below_limit");
    expect(
      evaluateAutoMachiningGate(okRequest({ stlFile: undefined })).reasons,
    ).toContain("missing_filled_stl");
  });
});
