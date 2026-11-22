// related files:
// - web/backend/services/abutmentDesignLogic.core.js
import {
  combineToothPatches,
  describeToothChange,
  mergeRulePatch,
  toothKindOf,
} from "../../services/abutmentDesignLogic.core.js";

describe("abutment design change record", () => {
  test("tooth kind follows FDI position", () => {
    expect(toothKindOf("#13")).toBe("canine");
    expect(toothKindOf("23")).toBe("canine");
    expect(toothKindOf("11")).toBe("incisor");
    expect(toothKindOf("24")).toBe("premolar");
    expect(toothKindOf("36")).toBe("molar");
  });

  test("clearance and gumball tilt are both recorded", () => {
    const described = describeToothChange({
      toothNumber: "13",
      baselineParams: { occlusalClearanceMm: 1.3 },
      finalParams: { occlusalClearanceMm: 1.8 },
      gumball: { tiltLabialDeg: -4 },
    });
    expect(described.lines).toEqual(
      expect.arrayContaining(["#13 대합 거리 1.3mm → 1.8mm", "#13 기울기 설측 4°"]),
    );
    expect(described.patch.params.occlusalClearanceMm).toBeCloseTo(0.5);
    expect(described.patch.pose.tiltLabialDeg).toBe(-4);
    expect(described.patch.params.tiltLabialDeg).toBeUndefined();
  });

  test("partial sculpt is visible and stays out of the generation patch", () => {
    const described = describeToothChange({
      toothNumber: "13",
      baselineParams: { occlusalClearanceMm: 1.3 },
      finalParams: { occlusalClearanceMm: 1.3 },
      gumball: { partial: [{ z: 1, angle: 0.4, reach: 1.2, grow: 0.2 }] },
    });
    expect(described.lines).toEqual(["#13 부분 변형 1곳"]);
    expect(described.patch.params).toEqual({});
    expect(described.patch.pose).toEqual({});
  });

  test("gumball height is not added again when the param already changed", () => {
    const described = describeToothChange({
      toothNumber: "13",
      baselineParams: { postHeightOffsetMm: 4 },
      finalParams: { postHeightOffsetMm: 5.5 },
      gumball: { heightMm: 1.5 },
    });
    expect(described.patch.params.postHeightOffsetMm).toBeCloseTo(1.5);
    expect(described.lines.some((line) => line.includes("포스트 높이"))).toBe(true);
    expect(described.lines.some((line) => line.includes("#13 높이 "))).toBe(false);
  });

  test("two canines in one case average once", () => {
    const left = describeToothChange({
      toothNumber: "13",
      baselineParams: {},
      finalParams: {},
      gumball: { tiltLabialDeg: -4 },
    });
    const right = describeToothChange({
      toothNumber: "23",
      baselineParams: {},
      finalParams: {},
      gumball: { tiltLabialDeg: -8 },
    });
    const combined = combineToothPatches([left, right]);
    expect(combined).toHaveLength(1);
    expect(combined[0].toothKind).toBe("canine");
    expect(combined[0].pose.tiltLabialDeg).toBeCloseTo(-6);
  });

  test("approval accumulates and stays inside the cap", () => {
    expect(mergeRulePatch({ pose: { tiltLabialDeg: -8 } }, { pose: { tiltLabialDeg: -6 } }).pose.tiltLabialDeg).toBe(
      -12,
    );
    expect(mergeRulePatch({ pose: {} }, { pose: { tiltLabialDeg: -3.2 } }).pose.tiltLabialDeg).toBeCloseTo(-3.2);
  });
});
