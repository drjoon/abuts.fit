// related files:
// - web/backend/utils/practiceTransferLabShipping.js
import { describe, expect, it } from "@jest/globals";
import {
  canOfferPracticeTransferSkipJig,
  resolvePracticeTransferSkipJig,
  shouldChargePracticeTransferLabShipping,
} from "../../utils/practiceTransferLabShipping.js";

describe("shouldChargePracticeTransferLabShipping", () => {
  it("always false — 기공소→치과 배송 무료", () => {
    expect(shouldChargePracticeTransferLabShipping()).toBe(false);
    expect(
      shouldChargePracticeTransferLabShipping({
        transfer: { production: { skipJig: false } },
        fees: { labFeeTotal: 30000 },
      }),
    ).toBe(false);
  });
});

describe("canOfferPracticeTransferSkipJig / resolvePracticeTransferSkipJig", () => {
  it("always false — skipJig 옵션 삭제(2026-08-22)", () => {
    expect(
      canOfferPracticeTransferSkipJig([
        {
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ]),
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
    ).toBe(false);
  });
});
