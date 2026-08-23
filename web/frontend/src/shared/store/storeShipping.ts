// change-log:
// - 2026-08-23: 스토어 배송료 — 상품 10만원 이하 3,300원(부가세 포함), 초과 무료.
// related files:
// - web/backend/constants/storeShipping.js
// - web/frontend/src/pages/requestor/store/RequestorStoreCartPage.tsx
import { splitInclusiveVat } from "@/shared/tax/invoiceLabels";

/** 상품 합계(부가세 포함)가 이 값 이하일 때 배송료 부과. */
export const STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE = 100_000;

/** 부가세 포함 배송료(원). */
export const STORE_SHIPPING_FEE_INCLUSIVE = 3_300;

export function computeStoreShippingFeeInclusive(goodsTotalInclusive: number) {
  const goods = Math.max(0, Math.round(Number(goodsTotalInclusive || 0)));
  if (goods <= 0) return 0;
  if (goods > STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE) return 0;
  return STORE_SHIPPING_FEE_INCLUSIVE;
}

export function buildStoreOrderTotalsWithShipping(goodsTotalInclusive: number) {
  const goodsSplit = splitInclusiveVat(goodsTotalInclusive);
  const shippingFeeInclusive = computeStoreShippingFeeInclusive(
    goodsTotalInclusive,
  );
  if (shippingFeeInclusive <= 0) {
    return {
      itemsAmountTotal: goodsSplit.total,
      shippingFeeInclusive: 0,
      shippingSupplyAmount: 0,
      shippingVatAmount: 0,
      supply: goodsSplit.supply,
      vat: goodsSplit.vat,
      total: goodsSplit.total,
    };
  }
  const shippingSplit = splitInclusiveVat(shippingFeeInclusive);
  return {
    itemsAmountTotal: goodsSplit.total,
    shippingFeeInclusive,
    shippingSupplyAmount: shippingSplit.supply,
    shippingVatAmount: shippingSplit.vat,
    supply: goodsSplit.supply + shippingSplit.supply,
    vat: goodsSplit.vat + shippingSplit.vat,
    total: goodsSplit.total + shippingSplit.total,
  };
}

export function resolveStoreOrderShippingFee(order: {
  shippingFeeInclusive?: number;
  itemsAmountTotal?: number;
  amountTotal?: number;
  items?: Array<{ lineTotalInclusive?: number }>;
}) {
  const explicit = Number(order.shippingFeeInclusive);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.round(explicit);
  const itemsSum = (order.items || []).reduce(
    (sum, item) => sum + Number(item.lineTotalInclusive || 0),
    0,
  );
  const total = Number(order.amountTotal || 0);
  if (itemsSum > 0 && total > itemsSum) return Math.round(total - itemsSum);
  return 0;
}
