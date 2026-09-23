// related files:
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/controllers/requests/utils.js
import {
  applyRequestorCustomAbutmentSaleOverride,
  resolveCustomAbutmentRequestUnitPrice,
  resolveCustomAbutmentProductionPriceForAt,
} from "../../utils/creditSettingsDefaults.js";

describe("custom abutment request unit price", () => {
  test("런칭 이벤트 on·창 없으면 이벤트가", () => {
    expect(
      resolveCustomAbutmentRequestUnitPrice({
        membershipProductionPrice: 13000,
        customAbutmentLaunchEventEnabled: true,
        customAbutmentLaunchEventProductionPrice: 10000,
      }),
    ).toBe(10000);
  });

  test("런칭 이벤트 off면 정상가", () => {
    expect(
      resolveCustomAbutmentRequestUnitPrice({
        membershipProductionPrice: 13000,
        customAbutmentLaunchEventEnabled: false,
        customAbutmentLaunchEventProductionPrice: 10000,
      }),
    ).toBe(13000);
  });

  test("이벤트 창 [start, end) 경계를 따른다", () => {
    const settings = {
      membershipProductionPrice: 13000,
      customAbutmentLaunchEventEnabled: true,
      customAbutmentLaunchEventProductionPrice: 10000,
      customAbutmentLaunchEventStartedAt: new Date(
        "2026-09-01T00:00:00+09:00",
      ),
      customAbutmentLaunchEventEndedAt: new Date("2026-10-01T00:00:00+09:00"),
    };
    expect(
      resolveCustomAbutmentProductionPriceForAt(
        new Date("2026-09-01T00:00:00+09:00"),
        settings,
      ),
    ).toEqual({ tier: "event", price: 10000 });
    expect(
      resolveCustomAbutmentProductionPriceForAt(
        new Date("2026-09-30T23:59:59+09:00"),
        settings,
      ),
    ).toEqual({ tier: "event", price: 10000 });
    expect(
      resolveCustomAbutmentProductionPriceForAt(
        new Date("2026-10-01T00:00:00+09:00"),
        settings,
      ),
    ).toEqual({ tier: "regular", price: 13000 });
  });

  test("의뢰자 BA 오버라이드 판매가가 기본 판매가보다 우선하고 매입가는 50%", () => {
    const next = applyRequestorCustomAbutmentSaleOverride(
      {
        labProductionPrice: 13000,
        membershipProductionPrice: 13000,
        minCreditForRequest: 13000,
        manufacturerRequestUnitPrice: 6500,
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
    expect(next.customAbutmentSaleLocked).toBe(true);
    expect(resolveCustomAbutmentRequestUnitPrice(next)).toBe(12000);
  });

  test("목록에 없는 의뢰자는 기본 판매가를 유지한다", () => {
    const base = {
      labProductionPrice: 13000,
      membershipProductionPrice: 13000,
      minCreditForRequest: 13000,
      customAbutmentLaunchEventEnabled: false,
      specialRequestorPrices: [
        { requestorAnchorId: "ba-1", productionPrice: 12000, amount: 12000 },
      ],
    };
    expect(applyRequestorCustomAbutmentSaleOverride(base, "ba-2")).toBe(base);
  });

  test("0원도 오버라이드로 적용한다", () => {
    const next = applyRequestorCustomAbutmentSaleOverride(
      {
        labProductionPrice: 13000,
        membershipProductionPrice: 13000,
        minCreditForRequest: 13000,
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
