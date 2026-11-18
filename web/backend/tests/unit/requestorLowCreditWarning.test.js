// related files:
// - web/backend/services/requestorLowCreditWarning.service.js
import {
  evaluateLowCreditWarning,
  orderableCreditForLowWarning,
} from "../../services/requestorLowCreditWarning.service.js";

describe("requestorLowCreditWarning", () => {
  test("최근 충전의 1/4 이하이면 경고", () => {
    expect(
      evaluateLowCreditWarning({
        orderableCredit: 25000,
        lastChargeAmount: 100000,
      }).active,
    ).toBe(true);
    expect(
      evaluateLowCreditWarning({
        orderableCredit: 25001,
        lastChargeAmount: 100000,
      }).active,
    ).toBe(false);
  });

  test("충전 이력이 없으면 경고하지 않는다", () => {
    expect(
      evaluateLowCreditWarning({
        orderableCredit: 0,
        lastChargeAmount: 0,
      }).active,
    ).toBe(false);
  });

  test("무료크레딧만 쓰는 기공소는 유료·정산 적립을 남은 금액에 넣지 않는다", () => {
    expect(
      orderableCreditForLowWarning(
        {
          paidCredit: 80000,
          freeRequestCredit: 20000,
          freeShippingCredit: 3000,
          settlementCredit: 500000,
        },
        { freeCreditOnly: true },
      ),
    ).toBe(23000);
    expect(
      orderableCreditForLowWarning(
        {
          paidCredit: 80000,
          freeRequestCredit: 20000,
          freeShippingCredit: 3000,
          settlementCredit: 500000,
        },
        { freeCreditOnly: false },
      ),
    ).toBe(103000);
  });
});
