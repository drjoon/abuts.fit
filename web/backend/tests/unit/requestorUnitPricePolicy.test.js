// related files:
// - web/backend/utils/requestorUnitPricePolicy.js
import {
  resolveRequestorUnitPrice,
  resolveRequestorIntroWindow,
} from "../../utils/requestorUnitPricePolicy.js";

describe("requestorUnitPricePolicy", () => {
  const startedAt = new Date("2026-07-01T03:00:00+09:00");

  test("가입 90일(가입일 포함)은 1만원 고정", () => {
    expect(
      resolveRequestorUnitPrice({ groupOrders30d: 0, startedAt, ymd: "2026-07-01" }),
    ).toMatchObject({ unitPrice: 10000, rule: "intro_fixed" });
    const last = resolveRequestorIntroWindow(startedAt, "2026-09-28");
    expect(last).toEqual({ inIntro: true, introEndsYmd: "2026-09-28" });
  });

  test("91일째부터 30일 주문량으로 결정", () => {
    const r = resolveRequestorUnitPrice({ groupOrders30d: 0, startedAt, ymd: "2026-09-29" });
    expect(r).toMatchObject({ unitPrice: 15000, rule: "base_price" });
    expect(
      resolveRequestorUnitPrice({ groupOrders30d: 40, startedAt, ymd: "2026-09-29" }),
    ).toMatchObject({ unitPrice: 13000, discountAmount: 2000, rule: "volume_discount" });
  });

  test("100건 이상이면 최대 할인 1만원", () => {
    for (const n of [100, 101, 5000]) {
      expect(
        resolveRequestorUnitPrice({ groupOrders30d: n, startedAt, ymd: "2026-10-08" })
          .unitPrice,
      ).toBe(10000);
    }
  });
});
