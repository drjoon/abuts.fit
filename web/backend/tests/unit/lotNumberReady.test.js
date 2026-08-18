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

  it("skips design-only requests until production handoff", () => {
    expect(
      shouldAssignLotNumberOnReady({
        caseInfos: { productMode: "design_custom_abutment" },
      }),
    ).toBe(false);
    expect(shouldAssignLotNumberOnReady(null)).toBe(false);
  });
});
