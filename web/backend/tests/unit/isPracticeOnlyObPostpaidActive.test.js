// related files:
// - web/backend/utils/practiceObPostpaid.util.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  isPracticeObPostpaidActive,
  isPracticeOnlyObPostpaidActive,
} from "../../utils/practiceObPostpaid.util.js";

describe("isPracticeOnlyObPostpaidActive", () => {
  test("OB active 기공소도 Request CA는 선충전 검사 유지", async () => {
    const prev = process.env.PRACTICE_OB_LAUNCH_BETA;
    process.env.PRACTICE_OB_LAUNCH_BETA = "false";
    try {
      const lab = await BusinessAnchor.create({
        businessNumberNormalized: "9999999102",
        businessType: "requestor",
        requestorKind: "lab",
        name: "향기로운기공소3",
        openBankingConsent: {
          status: "active",
          paymentHold: { isHeld: false },
        },
      });
      expect(await isPracticeObPostpaidActive(lab._id)).toBe(true);
      expect(await isPracticeOnlyObPostpaidActive(lab._id)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PRACTICE_OB_LAUNCH_BETA;
      else process.env.PRACTICE_OB_LAUNCH_BETA = prev;
    }
  });
});
