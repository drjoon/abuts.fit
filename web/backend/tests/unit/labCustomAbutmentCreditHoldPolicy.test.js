// related files:
// - web/backend/utils/practiceObBeta.util.js
import {
  buildCustomAbutmentSpendBuckets,
  resolveLabCustomAbutmentCreditHoldPolicy,
} from "../../utils/practiceObBeta.util.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

describe("lab custom abutment credit hold policy", () => {
  test("buildCustomAbutmentSpendBuckets — 기공소는 settlement를 가용에서 제외", () => {
    const buckets = buildCustomAbutmentSpendBuckets(
      {
        paidCredit: 10_000,
        freeRequestCredit: 2_000,
        freeShippingCredit: 500,
        settlementCredit: 50_000,
      },
      {
        applies: true,
        freeCreditOnly: false,
        excludeSettlementCredit: true,
      },
    );
    expect(buckets.settlementCredit).toBe(0);
    expect(buckets.paidCredit).toBe(10_000);
    expect(buckets.freeRequestCredit).toBe(2_000);
  });

  test("buildCustomAbutmentSpendBuckets — 치과는 settlement 그대로", () => {
    const buckets = buildCustomAbutmentSpendBuckets(
      {
        paidCredit: 1_000,
        freeRequestCredit: 0,
        freeShippingCredit: 0,
        settlementCredit: 99_000,
      },
      { applies: false },
    );
    expect(buckets.settlementCredit).toBe(99_000);
  });

  test("resolveLabCustomAbutmentCreditHoldPolicy — 일반 기공소는 settlement·overdraft 차단", async () => {
    const lab = await BusinessAnchor.create({
      businessNumberNormalized: "9999999101",
      businessType: "requestor",
      requestorKind: "lab",
      name: "향기로운기공소",
      openBankingConsent: {
        status: "active",
        paymentHold: { isHeld: false },
      },
    });
    const prev = process.env.PRACTICE_OB_LAUNCH_BETA;
    process.env.PRACTICE_OB_LAUNCH_BETA = "false";
    try {
      const policy = await resolveLabCustomAbutmentCreditHoldPolicy(lab._id);
      expect(policy.applies).toBe(true);
      expect(policy.excludeSettlementCredit).toBe(true);
      expect(policy.allowPostpaidOverdraft).toBe(false);
      expect(policy.freeCreditOnly).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PRACTICE_OB_LAUNCH_BETA;
      else process.env.PRACTICE_OB_LAUNCH_BETA = prev;
    }
  });
});
