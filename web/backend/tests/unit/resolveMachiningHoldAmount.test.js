// related files:
// - web/backend/controllers/requests/designPrice.utils.js
// - web/backend/services/requestCreditHold.service.js
import { resolveMachiningHoldAmountFromPrice } from "../../controllers/requests/designPrice.utils.js";

describe("resolveMachiningHoldAmountFromPrice", () => {
  test("PTX CA: designFee null → 생산 견적만(1.5만). 기본 디자인비 재가산 없음", () => {
    expect(
      resolveMachiningHoldAmountFromPrice({
        amount: 15000,
        baseAmount: 15000,
        designFee: null,
        expressFee: null,
        rule: "ptx_abuts_production_membership",
        abutmentQty: 1,
      }),
    ).toBe(15000);
  });

  test("디자인+생산 견적 amount(디자인비 포함)를 그대로 쓴다", () => {
    expect(
      resolveMachiningHoldAmountFromPrice({
        amount: 25000,
        designFee: 10000,
        expressFee: null,
      }),
    ).toBe(25000);
  });

  test("신속비는 별도 hold이므로 제외한다", () => {
    expect(
      resolveMachiningHoldAmountFromPrice({
        amount: 17000,
        expressFee: 2000,
      }),
    ).toBe(15000);
  });
});
