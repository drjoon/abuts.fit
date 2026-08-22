// related files:
// - web/backend/controllers/requests/utils.js
import { describe, expect, it } from "@jest/globals";
import {
  seqToLotLetters,
  shouldAssignLotNumberOnReady,
} from "../../controllers/requests/utils.js";

describe("seqToLotLetters", () => {
  it("maps 0 to AAA and increments in base-26", () => {
    expect(seqToLotLetters(0)).toBe("AAA");
    expect(seqToLotLetters(1)).toBe("AAB");
    expect(seqToLotLetters(25)).toBe("AAZ");
    expect(seqToLotLetters(26)).toBe("ABA");
  });

  it("wraps after ZZZ", () => {
    const cycle = 26 * 26 * 26;
    expect(seqToLotLetters(cycle - 1)).toBe("ZZZ");
    expect(seqToLotLetters(cycle)).toBe("AAA");
  });
});

describe("shouldAssignLotNumberOnReady", () => {
  it("assigns for production custom_abutment and missing productMode", () => {
    expect(
      shouldAssignLotNumberOnReady({
        caseInfos: { productMode: "custom_abutment" },
      }),
    ).toBe(true);
    expect(shouldAssignLotNumberOnReady({ caseInfos: {} })).toBe(true);
  });

  it("skips legacy design_custom_abutment until designCompletedAt", () => {
    expect(
      shouldAssignLotNumberOnReady({
        caseInfos: { productMode: "design_custom_abutment" },
      }),
    ).toBe(false);
    expect(
      shouldAssignLotNumberOnReady({
        caseInfos: { productMode: "design_custom_abutment" },
        designCompletedAt: new Date(),
      }),
    ).toBe(true);
    expect(shouldAssignLotNumberOnReady(null)).toBe(false);
  });

  it("skips PTX lab-designed custom_abutment until designCompletedAt", () => {
    expect(
      shouldAssignLotNumberOnReady({
        caseInfos: { productMode: "custom_abutment" },
        partnerBilling: {
          relatedPracticeTransferId: "6a88f24c4fbdaeb194911256",
          labDesignedAbutment: true,
        },
      }),
    ).toBe(false);
    expect(
      shouldAssignLotNumberOnReady({
        caseInfos: { productMode: "custom_abutment" },
        partnerBilling: {
          relatedPracticeTransferId: "6a88f24c4fbdaeb194911256",
          labDesignedAbutment: true,
        },
        designCompletedAt: new Date(),
      }),
    ).toBe(true);
  });
});
