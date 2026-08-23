// change-log:
// - 2026-08-23: 스토어 배송료 — 상품 10만원 이하 3,300원(부가세 포함), 초과 무료.
// related files:
// - web/backend/controllers/store/storeOrder.controller.js
// - web/frontend/src/shared/store/storeShipping.ts

import { splitInclusiveVat } from "../utils/storeVat.js";

/** 상품 합계(부가세 포함)가 이 값 이하일 때 배송료 부과. */
export const STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE = 100_000;

/** 부가세 포함 배송료(원). */
export const STORE_SHIPPING_FEE_INCLUSIVE = 3_300;

export function computeStoreShippingFeeInclusive(goodsTotalInclusive) {
  const goods = Math.max(0, Math.round(Number(goodsTotalInclusive || 0)));
  if (goods <= 0) return 0;
  if (goods > STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE) return 0;
  return STORE_SHIPPING_FEE_INCLUSIVE;
}

/** 상품 합계에 배송료를 반영한 주문 금액. */
export function applyStoreShippingToOrderTotals({
  itemsAmountTotal,
  supplyAmount,
  vatAmount,
  amountTotal,
}) {
  const goodsTotal = Math.max(0, Math.round(Number(itemsAmountTotal || amountTotal || 0)));
  const shippingFeeInclusive = computeStoreShippingFeeInclusive(goodsTotal);
  if (shippingFeeInclusive <= 0) {
    return {
      itemsAmountTotal: goodsTotal,
      shippingFeeInclusive: 0,
      shippingSupplyAmount: 0,
      shippingVatAmount: 0,
      supplyAmount: Math.max(0, Math.round(Number(supplyAmount || 0))),
      vatAmount: Math.max(0, Math.round(Number(vatAmount || 0))),
      amountTotal: Math.max(0, Math.round(Number(amountTotal || 0))),
    };
  }
  const split = splitInclusiveVat(shippingFeeInclusive);
  const baseSupply = Math.max(0, Math.round(Number(supplyAmount || 0)));
  const baseVat = Math.max(0, Math.round(Number(vatAmount || 0)));
  const baseTotal = Math.max(0, Math.round(Number(amountTotal || 0)));
  return {
    itemsAmountTotal: goodsTotal,
    shippingFeeInclusive,
    shippingSupplyAmount: split.supply,
    shippingVatAmount: split.vat,
    supplyAmount: baseSupply + split.supply,
    vatAmount: baseVat + split.vat,
    amountTotal: baseTotal + split.total,
  };
}
