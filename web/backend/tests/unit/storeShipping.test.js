// change-log:
// - 2026-09-23: 스토어 배송비 — 10만원↑무료 · 미만 3,500. lab_bundle 무시.
import {
  STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE,
  STORE_SHIPPING_FEE_INCLUSIVE,
  STORE_SHIPPING_MODE_DIRECT,
  STORE_SHIPPING_MODE_LAB_BUNDLE,
  applyStoreShippingToOrderTotals,
  computeStoreShippingFeeInclusive,
  resolveStoreShippingMode,
} from "../../constants/storeShipping.js";

describe("storeShipping", () => {
  test("fee is 0 at and above free threshold", () => {
    expect(
      computeStoreShippingFeeInclusive(STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE),
    ).toBe(0);
    expect(
      computeStoreShippingFeeInclusive(
        STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE + 1,
      ),
    ).toBe(0);
  });

  test("fee is configured amount below threshold", () => {
    expect(STORE_SHIPPING_FEE_INCLUSIVE).toBe(3_500);
    expect(
      computeStoreShippingFeeInclusive(
        STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE - 1,
      ),
    ).toBe(STORE_SHIPPING_FEE_INCLUSIVE);
    expect(computeStoreShippingFeeInclusive(16_500)).toBe(
      STORE_SHIPPING_FEE_INCLUSIVE,
    );
  });

  test("lab_bundle request is ignored — always direct", () => {
    expect(resolveStoreShippingMode(STORE_SHIPPING_MODE_LAB_BUNDLE)).toBe(
      STORE_SHIPPING_MODE_DIRECT,
    );
    expect(resolveStoreShippingMode(undefined)).toBe(
      STORE_SHIPPING_MODE_DIRECT,
    );
  });

  test("applyStoreShippingToOrderTotals adds fee below threshold", () => {
    const goods = 50_000;
    const totals = applyStoreShippingToOrderTotals({
      itemsAmountTotal: goods,
      supplyAmount: 45_455,
      vatAmount: 4_545,
      amountTotal: goods,
      shippingMode: STORE_SHIPPING_MODE_LAB_BUNDLE,
    });
    expect(totals.shippingMode).toBe(STORE_SHIPPING_MODE_DIRECT);
    expect(totals.shippingFeeInclusive).toBe(STORE_SHIPPING_FEE_INCLUSIVE);
    expect(totals.amountTotal).toBe(goods + STORE_SHIPPING_FEE_INCLUSIVE);
    expect(totals.itemsAmountTotal).toBe(goods);
  });

  test("applyStoreShippingToOrderTotals keeps free at threshold", () => {
    const goods = STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE;
    const totals = applyStoreShippingToOrderTotals({
      itemsAmountTotal: goods,
      supplyAmount: 90_910,
      vatAmount: 9_090,
      amountTotal: goods,
    });
    expect(totals.shippingFeeInclusive).toBe(0);
    expect(totals.amountTotal).toBe(goods);
  });
});
