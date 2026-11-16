// related files:
// - web/backend/services/abutmentDesignLogic.core.js
import {
  GENERATION_AXES,
  buildLogicProposals,
  clampRuleDelta,
  sanitizeGenerationDelta,
  toothKindOf,
} from "../../services/abutmentDesignLogic.core.js";

function obs(partial) {
  return {
    id: partial.id,
    transferId: partial.transferId,
    toothNumber: partial.toothNumber || "13",
    toothKind: partial.toothKind || "canine",
    axis: partial.axis || "tiltLabialDeg",
    delta: partial.delta,
    patientName: partial.patientName || "김OO",
    practiceName: partial.practiceName || "테스트치과",
    disposition: partial.disposition ?? null,
    updatedAt: partial.updatedAt || "2026-11-01T00:00:00.000Z",
  };
}

describe("abutment design logic patterns", () => {
  test("cuff and clearance are not generation axes", () => {
    expect(GENERATION_AXES.marginDepthMm).toBeUndefined();
    expect(GENERATION_AXES.occlusalClearanceMm).toBeUndefined();
    expect(GENERATION_AXES.postHeightOffsetMm).toBeUndefined();
    expect(sanitizeGenerationDelta("occlusalClearanceMm", 1.3, 1.8)).toBeNull();
  });

  test("tooth kind follows FDI position", () => {
    expect(toothKindOf("#13")).toBe("canine");
    expect(toothKindOf("23")).toBe("canine");
    expect(toothKindOf("11")).toBe("incisor");
    expect(toothKindOf("24")).toBe("premolar");
    expect(toothKindOf("36")).toBe("molar");
  });

  test("three lingual canine tilts become one proposal", () => {
    const drafts = buildLogicProposals([
      obs({ id: "a", transferId: "t1", delta: -4, toothNumber: "13" }),
      obs({ id: "b", transferId: "t2", delta: -5, toothNumber: "23" }),
      obs({ id: "c", transferId: "t3", delta: -3.2, toothNumber: "33" }),
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].toothKind).toBe("canine");
    expect(drafts[0].axis).toBe("tiltLabialDeg");
    expect(drafts[0].delta).toBe(-4);
    expect(drafts[0].summary).toContain("견치는 순측으로 기울어");
    expect(drafts[0].applyText).toContain("설측으로");
    expect(drafts[0].samples).toHaveLength(3);
    expect(drafts[0].observationIds).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  test("two cases are not enough", () => {
    expect(
      buildLogicProposals([
        obs({ id: "a", transferId: "t1", delta: -4 }),
        obs({ id: "b", transferId: "t2", delta: -4 }),
      ]),
    ).toEqual([]);
  });

  test("mixed directions below three quarters do not propose", () => {
    expect(
      buildLogicProposals([
        obs({ id: "a", transferId: "t1", delta: -4 }),
        obs({ id: "b", transferId: "t2", delta: -4 }),
        obs({ id: "c", transferId: "t3", delta: -4 }),
        obs({ id: "d", transferId: "t4", delta: 4 }),
        obs({ id: "e", transferId: "t5", delta: 4 }),
      ]),
    ).toEqual([]);
  });

  test("incisor edits do not join canine", () => {
    const drafts = buildLogicProposals([
      obs({ id: "a", transferId: "t1", delta: -4, toothKind: "canine" }),
      obs({ id: "b", transferId: "t2", delta: -4, toothKind: "canine" }),
      obs({ id: "c", transferId: "t3", delta: -4, toothKind: "incisor", toothNumber: "11" }),
    ]);
    expect(drafts).toEqual([]);
  });

  test("approved observations are not counted again", () => {
    expect(
      buildLogicProposals([
        obs({ id: "a", transferId: "t1", delta: -4, disposition: "approved" }),
        obs({ id: "b", transferId: "t2", delta: -4 }),
        obs({ id: "c", transferId: "t3", delta: -4 }),
      ]),
    ).toEqual([]);
  });

  test("approval accumulates and stays inside the cap", () => {
    expect(clampRuleDelta("tiltLabialDeg", -8, -6)).toBe(-12);
    expect(clampRuleDelta("tiltLabialDeg", 0, -3.2)).toBe(-3);
  });
});
