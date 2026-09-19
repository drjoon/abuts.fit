// related files:
// - web/backend/services/practiceTransferLabSettlementGate.js

import {
  awaitsAbutmentShareRelease,
  resolvePracticeToLabSettlementBlock,
} from "../../services/practiceTransferLabSettlementGate.js";

describe("practice to lab settlement gate", () => {
  test("prosthesis-only transfers are not blocked", () => {
    expect(
      resolvePracticeToLabSettlementBlock({ customAbutmentCount: 0 }),
    ).toBeNull();
  });

  test("custom abutment without design STL is excluded", () => {
    expect(
      resolvePracticeToLabSettlementBlock({
        customAbutmentCount: 2,
        needsMoreDesignStl: true,
      }),
    ).toBe("awaiting_abutment_design_stl");
  });

  test("prepaid non-partner waits for abutment share release", () => {
    expect(
      awaitsAbutmentShareRelease({
        billing: { heldAbutmentTotal: 15000, isTradingPartner: false },
      }),
    ).toBe(true);
    expect(
      resolvePracticeToLabSettlementBlock({
        customAbutmentCount: 1,
        awaitAbutmentShareRelease: true,
        abutmentProductionReleased: false,
      }),
    ).toBe("awaiting_abutment_production_payment");
    expect(
      resolvePracticeToLabSettlementBlock({
        customAbutmentCount: 1,
        awaitAbutmentShareRelease: true,
        abutmentProductionReleased: true,
      }),
    ).toBeNull();
  });

  test("lab-paid production waits until every active request is paid", () => {
    expect(
      awaitsAbutmentShareRelease({
        billing: { abutmentRetailTotal: 0, isTradingPartner: true },
      }),
    ).toBe(false);
    expect(
      resolvePracticeToLabSettlementBlock({
        customAbutmentCount: 2,
        activeProductionRequestIds: ["a", "b"],
        paidProductionRequestIds: ["a"],
      }),
    ).toBe("awaiting_abutment_production_payment");
    expect(
      resolvePracticeToLabSettlementBlock({
        customAbutmentCount: 2,
        activeProductionRequestIds: ["a", "b"],
        paidProductionRequestIds: ["b", "a"],
      }),
    ).toBeNull();
  });

  test("cancelled-only production does not block settlement", () => {
    expect(
      resolvePracticeToLabSettlementBlock({
        customAbutmentCount: 1,
        productionPaymentWaived: true,
      }),
    ).toBeNull();
  });
});
