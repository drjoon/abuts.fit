// related files:
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/requests/utils.js
import {
  applyRequestorCustomAbutmentSaleOverride,
  resolveCustomAbutmentRequestUnitPrice,
} from "../../utils/creditSettingsDefaults.js";

describe("custom abutment request unit price", () => {
  test("플랫폼 설정 minCreditForRequest를 쓴다", () => {
    expect(
      resolveCustomAbutmentRequestUnitPrice({
        minCreditForRequest: 15000,
        membershipProductionPrice: 15000,
      }),
    ).toBe(15000);
  });

  test("minCredit가 없으면 멤버십 생산가(플랫폼 고시)를 쓴다", () => {
    expect(
      resolveCustomAbutmentRequestUnitPrice({
        membershipProductionPrice: 15000,
      }),
    ).toBe(15000);
  });

  test("의뢰자 BA 오버라이드 판매가가 기본 판매가보다 우선하고 매입가는 50%", () => {
    const next = applyRequestorCustomAbutmentSaleOverride(
      {
        labProductionPrice: 15000,
        membershipProductionPrice: 15000,
        minCreditForRequest: 15000,
        manufacturerRequestUnitPrice: 7500,
        specialRequestorPrices: [
          { requestorAnchorId: "ba-1", productionPrice: 12000, amount: 12000 },
        ],
      },
      "ba-1",
    );
    expect(next.labProductionPrice).toBe(12000);
    expect(next.membershipProductionPrice).toBe(12000);
    expect(next.minCreditForRequest).toBe(12000);
    expect(next.manufacturerRequestUnitPrice).toBe(6000);
    expect(resolveCustomAbutmentRequestUnitPrice(next)).toBe(12000);
  });

  test("목록에 없는 의뢰자는 기본 판매가를 유지한다", () => {
    const base = {
      labProductionPrice: 15000,
      membershipProductionPrice: 15000,
      minCreditForRequest: 15000,
      specialRequestorPrices: [
        { requestorAnchorId: "ba-1", productionPrice: 12000, amount: 12000 },
      ],
    };
    expect(applyRequestorCustomAbutmentSaleOverride(base, "ba-2")).toBe(base);
  });

  test("0원도 오버라이드로 적용한다", () => {
    const next = applyRequestorCustomAbutmentSaleOverride(
      {
        labProductionPrice: 15000,
        membershipProductionPrice: 15000,
        minCreditForRequest: 15000,
        specialRequestorPrices: [
          { requestorAnchorId: "ba-1", productionPrice: 0, amount: 0 },
        ],
      },
      "ba-1",
    );
    expect(next.labProductionPrice).toBe(0);
    expect(next.minCreditForRequest).toBe(0);
    expect(resolveCustomAbutmentRequestUnitPrice(next)).toBe(0);
    expect(next.manufacturerRequestUnitPrice).toBe(0);
  });
});
