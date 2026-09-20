// related files:
// - web/backend/services/practiceTransferLabSettlementGate.js
// - web/backend/services/practiceTransferBilling.service.js

import {
  awaitsAbutmentShareRelease,
  resolvePracticeToLabSettlementBlock,
} from "../../services/practiceTransferLabSettlementGate.js";
import { selectPracticeTransferIdsBlockedFromSettlement } from "../../services/practiceTransferBilling.service.js";
import { shouldHideBlockedPracticeTransferLedgerRow } from "../../controllers/credits/creditLedger.utils.js";

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

  test("already lab-settled transfers are not blocked from settlement stats", async () => {
    const settledId = "6aa8f5b4036bb75124a2e6c8";
    const blocked = await selectPracticeTransferIdsBlockedFromSettlement([
      {
        _id: settledId,
        billing: { labSettledAt: new Date("2026-09-18T07:10:59.423Z") },
        toothWorks: [
          {
            prosthesisType: "커스텀어벗먼트",
            abutment: { enabled: true },
          },
        ],
        production: { designFileCount: 0, relatedRequestIds: ["req1"] },
      },
    ]);
    expect(blocked.has(settledId)).toBe(false);
    expect(blocked.size).toBe(0);
  });

  test("blocked CA keeps practice payment hold visible, hides lab earn", () => {
    const blockedId = "6aafda82fd1972681c88c344";
    const blocked = new Set([blockedId]);
    expect(
      shouldHideBlockedPracticeTransferLedgerRow({
        row: {
          refType: "PRACTICE_TRANSFER",
          refId: blockedId,
          type: "SPEND_HOLD",
          eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
          amount: -100000,
        },
        requestorKind: "practice",
        blockedSettlementIds: blocked,
      }),
    ).toBe(false);
    expect(
      shouldHideBlockedPracticeTransferLedgerRow({
        row: {
          refType: "PRACTICE_TRANSFER",
          refId: blockedId,
          eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
          accountCode: "LAB_SETTLEMENT_CREDIT",
          amount: 98000,
        },
        requestorKind: "lab",
        blockedSettlementIds: blocked,
      }),
    ).toBe(true);
    expect(
      shouldHideBlockedPracticeTransferLedgerRow({
        row: {
          refType: "PRACTICE_TRANSFER",
          refId: blockedId,
          type: "SPEND_HOLD",
        },
        requestorKind: "lab",
        blockedSettlementIds: blocked,
      }),
    ).toBe(true);
  });
});
