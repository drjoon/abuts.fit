// related files:
// - web/backend/controllers/businesses/business.freeCredit.util.js
// - web/backend/controllers/credits/creditLedger.utils.js
import { describe, expect, test } from "@jest/globals";
import {
  LAB_WELCOME_FREE_CREDIT_MEMO,
  LAB_WELCOME_FREE_CREDIT_WON,
} from "../../controllers/businesses/business.freeCredit.util.js";
import { buildFreeCreditGrantReason } from "../../controllers/credits/creditLedger.utils.js";

describe("lab welcome free credit", () => {
  test("signup amount is 70,000 won", () => {
    expect(LAB_WELCOME_FREE_CREDIT_WON).toBe(70000);
    expect(LAB_WELCOME_FREE_CREDIT_MEMO).toBe("가입환영 크레딧 지급");
  });

  test("auto grant reason is 가입환영 크레딧 지급", () => {
    expect(
      buildFreeCreditGrantReason({
        source: "auto",
        type: "REQUEST_FREE_CREDIT",
      }),
    ).toBe("가입환영 크레딧 지급");
  });

  test("admin override keeps its own reason", () => {
    expect(
      buildFreeCreditGrantReason({
        source: "admin",
        type: "REQUEST_FREE_CREDIT",
        overrideReason: "이벤트",
      }),
    ).toBe("관리자 지급 · 이벤트");
  });
});
