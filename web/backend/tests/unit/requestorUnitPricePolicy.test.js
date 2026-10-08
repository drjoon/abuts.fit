// related files:
// - web/backend/utils/requestorUnitPricePolicy.js
import {
  resolveRequestorUnitPrice,
  validateDealerUnitPrice,
  computeDealerCommission,
  dealerCommissionFromQuotedPrice,
} from "../../utils/requestorUnitPricePolicy.js";

describe("requestorUnitPricePolicy", () => {
  test("딜러가 없으면 기본 1.5만 단일가", () => {
    expect(resolveRequestorUnitPrice({})).toMatchObject({ unitPrice: 15000, rule: "base_price" });
  });

  test("딜러 설정가는 1.2~1.5만만 허용", () => {
    expect(validateDealerUnitPrice(12000).ok).toBe(true);
    expect(validateDealerUnitPrice(15000).ok).toBe(true);
    expect(validateDealerUnitPrice(11999).ok).toBe(false);
    expect(validateDealerUnitPrice(15001).ok).toBe(false);
    expect(validateDealerUnitPrice(13000.5).ok).toBe(false);
    expect(validateDealerUnitPrice("abc").ok).toBe(false);
  });

  test("범위 밖 저장값은 무시하고 기본가", () => {
    expect(resolveRequestorUnitPrice({ dealerUnitPrice: 9000 }).unitPrice).toBe(15000);
    expect(resolveRequestorUnitPrice({ dealerUnitPrice: 13000 })).toMatchObject({
      unitPrice: 13000,
      rule: "dealer_price",
    });
  });

  test("딜러 수수료 = 판매가 − 1만원", () => {
    expect(computeDealerCommission(13000)).toBe(3000);
    expect(computeDealerCommission(15000)).toBe(5000);
  });

  test("견적 수수료는 생산 판매가와 수량으로 계산한다", () => {
    expect(dealerCommissionFromQuotedPrice({ amount: 13500 })).toBe(3500);
    expect(
      dealerCommissionFromQuotedPrice({ amount: 27000, abutmentQty: 2 }),
    ).toBe(7000);
    expect(
      dealerCommissionFromQuotedPrice({
        amount: 18500,
        designFee: 5000,
        expressFee: 0,
      }),
    ).toBe(3500);
    expect(
      dealerCommissionFromQuotedPrice({
        amount: 15500,
        expressFee: 2000,
        expressFeeStatus: "charged",
      }),
    ).toBe(3500);
    expect(dealerCommissionFromQuotedPrice({ amount: 10000 })).toBe(0);
    expect(
      dealerCommissionFromQuotedPrice({ paidAmount: null, amount: 12000 }),
    ).toBe(2000);
  });
});
