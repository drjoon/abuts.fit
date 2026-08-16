// related files:
// - web/backend/utils/practiceTransferLabShipping.js
import { describe, expect, it } from "@jest/globals";
import {
  canOfferPracticeTransferSkipJig,
  resolvePracticeTransferSkipJig,
  shouldChargePracticeTransferLabShipping,
} from "../../utils/practiceTransferLabShipping.js";

describe("shouldChargePracticeTransferLabShipping", () => {
  it("charges when lab prosthesis fees exist", () => {
    expect(
      shouldChargePracticeTransferLabShipping({
        transfer: { production: { skipJig: true } },
        fees: { labFeeTotal: 30000, labAbutmentTotal: 0, abutmentQty: 0 },
      }),
    ).toBe(true);
  });

  it("charges CA design+jig when skipJig is false", () => {
    expect(
      shouldChargePracticeTransferLabShipping({
        transfer: { production: { skipJig: false } },
        fees: { labFeeTotal: 0, labAbutmentTotal: 0, abutmentQty: 1 },
      }),
    ).toBe(true);
  });

  it("waives lab ship when skipJig and no lab prosthesis", () => {
    expect(
      shouldChargePracticeTransferLabShipping({
        transfer: { production: { skipJig: true } },
        fees: { labFeeTotal: 0, labAbutmentTotal: 0, abutmentQty: 1 },
      }),
    ).toBe(false);
  });

  it("still charges when skipJig but crown/lab abutment ships", () => {
    expect(
      shouldChargePracticeTransferLabShipping({
        transfer: { production: { skipJig: true } },
        fees: { labFeeTotal: 0, labAbutmentTotal: 15000, abutmentQty: 1 },
      }),
    ).toBe(true);
  });

  it("does not charge when nothing ships from lab", () => {
    expect(
      shouldChargePracticeTransferLabShipping({
        transfer: { production: { skipJig: false } },
        fees: { labFeeTotal: 0, labAbutmentTotal: 0, abutmentQty: 0 },
      }),
    ).toBe(false);
  });
});

describe("canOfferPracticeTransferSkipJig / resolvePracticeTransferSkipJig", () => {
  it("offers only for design+production CA with no lab prosthesis", () => {
    expect(
      canOfferPracticeTransferSkipJig([
        {
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ]),
    ).toBe(true);
    expect(
      canOfferPracticeTransferSkipJig([
        {
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ]),
    ).toBe(false);
    expect(
      canOfferPracticeTransferSkipJig([
        {
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
        { prosthesisType: "크라운", customAbutment: false },
      ]),
    ).toBe(false);
  });

  it("forces skipJig false when prosthesis is mixed", () => {
    expect(
      resolvePracticeTransferSkipJig(
        [
          {
            prosthesisType: "크라운",
            customAbutment: true,
            abutmentProductMode: "design_custom_abutment",
          },
        ],
        true,
      ),
    ).toBe(false);
    expect(
      resolvePracticeTransferSkipJig(
        [
          {
            prosthesisType: "커스텀어벗",
            customAbutment: true,
            abutmentProductMode: "design_custom_abutment",
          },
        ],
        true,
      ),
    ).toBe(true);
  });
});
