// related files:
// - web/backend/controllers/credits/creditLedger.utils.js
import { resolvePrimePayoutLabForLedger } from "../../controllers/credits/creditLedger.utils.js";

describe("resolvePrimePayoutLabForLedger", () => {
  const primeId = "64a000000000000000000001";
  const partnerId = "64a000000000000000000099";

  test("prime viewer sees cooperation and subcontract payees", () => {
    expect(
      resolvePrimePayoutLabForLedger(
        {
          targetLabAnchorId: primeId,
          assigneeLabAnchorId: partnerId,
          assigneeKind: "cooperation",
          assigneeLabName: "통영 Zahn-Art 치과기공소",
        },
        primeId,
      ),
    ).toEqual({
      kind: "cooperation",
      anchorId: partnerId,
      name: "통영 Zahn-Art 치과기공소",
    });

    expect(
      resolvePrimePayoutLabForLedger(
        {
          targetLabAnchorId: primeId,
          assigneeLabAnchorId: partnerId,
          assigneeKind: "subcontract",
          assigneeLabName: "하향기공소",
        },
        primeId,
      ),
    ).toEqual({
      kind: "subcontract",
      anchorId: partnerId,
      name: "하향기공소",
    });
  });

  test("self-performed, performer ledger, and practice ledger omit the payee", () => {
    const self = {
      targetLabAnchorId: primeId,
      assigneeLabAnchorId: primeId,
      assigneeKind: "cooperation",
      assigneeLabName: "어벗츠기공소",
    };
    expect(resolvePrimePayoutLabForLedger(self, primeId)).toBeNull();
    expect(resolvePrimePayoutLabForLedger(self, "")).toBeNull();

    const forwarded = {
      targetLabAnchorId: primeId,
      assigneeLabAnchorId: partnerId,
      assigneeKind: "subcontract",
      assigneeLabName: "하향기공소",
    };
    expect(resolvePrimePayoutLabForLedger(forwarded, partnerId)).toBeNull();
    expect(resolvePrimePayoutLabForLedger(forwarded, null)).toBeNull();
  });
});
