// change-log:
// - 2026-09-23: 상품 10만원 이상 무료 · 미만 3,500(부가세 포함). 기공물 동봉(lab_bundle) 폐지.
// - 2026-09-13: 기공물 동봉은 어벗츠 CA 제작 포함 + 1주일 이내(발송·도착)만. 기본 직송은 유료.
// - 2026-09-13: 기공물 동봉은 1주일 이내 치과 도착건이 있을 때만. 기본 직송은 유료.
// - 2026-09-13: 10만원 임계 제거. 항상 기공물 동봉(무료) / 빠른 직송(+3,300).
// - 2026-09-13: 10만원 이하 — 기공물 동봉(무료) / 빠른 직송(+3,300) 옵션.
// - 2026-08-23: 스토어 배송료 — 상품 10만원 이하 3,300원(부가세 포함), 초과 무료.
// related files:
// - web/backend/controllers/store/storeOrder.controller.js
// - web/frontend/src/shared/store/storeShipping.ts

import { splitInclusiveVat } from "../utils/storeVat.js";

/** 부가세 포함 배송료(원) — 상품 합계가 무료 임계 미만일 때. `creditSettings.shippingFee`와 동일 금액. */
export const STORE_SHIPPING_FEE_INCLUSIVE = 3_500;

/** 상품(부가세 포함) 합계가 이 금액 이상이면 배송비 무료. */
export const STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE = 100_000;

/**
 * @deprecated 레거시 주문 표시용. 신규 주문은 동봉 모드를 쓰지 않음.
 * lab_bundle=기공물 동봉(폐지된 치과 기공소 우회 무료 배송)
 */
export const STORE_SHIPPING_MODE_LAB_BUNDLE = "lab_bundle";

/** 치과·기공소 직송(유료, 임계 이상 시 무료) */
export const STORE_SHIPPING_MODE_DIRECT = "direct";

export const STORE_SHIPPING_MODES = [
  STORE_SHIPPING_MODE_LAB_BUNDLE,
  STORE_SHIPPING_MODE_DIRECT,
];

/**
 * @param {unknown} raw
 * @returns {"lab_bundle"|"direct"|""}
 */
export function normalizeStoreShippingModeInput(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === STORE_SHIPPING_MODE_LAB_BUNDLE || s === "bundle" || s === "동봉") {
    return STORE_SHIPPING_MODE_LAB_BUNDLE;
  }
  if (s === STORE_SHIPPING_MODE_DIRECT || s === "express" || s === "직송") {
    return STORE_SHIPPING_MODE_DIRECT;
  }
  return "";
}

/**
 * 신규 주문은 항상 direct. lab_bundle 요청은 무시(폐지).
 * @param {unknown} [_requestedMode]
 */
export function resolveStoreShippingMode(_requestedMode) {
  return STORE_SHIPPING_MODE_DIRECT;
}

/**
 * 상품 합계 ≥ 10만원 → 0, 그 외 → STORE_SHIPPING_FEE_INCLUSIVE.
 * @param {number} goodsTotalInclusive
 */
export function computeStoreShippingFeeInclusive(goodsTotalInclusive) {
  const goods = Math.max(0, Math.round(Number(goodsTotalInclusive || 0)));
  if (goods <= 0) return 0;
  if (goods >= STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE) return 0;
  return STORE_SHIPPING_FEE_INCLUSIVE;
}

/** 상품 합계에 배송료를 반영한 주문 금액. */
export function applyStoreShippingToOrderTotals({
  itemsAmountTotal,
  supplyAmount,
  vatAmount,
  amountTotal,
  shippingMode: _shippingMode,
}) {
  const goodsTotal = Math.max(
    0,
    Math.round(Number(itemsAmountTotal || amountTotal || 0)),
  );
  const mode = STORE_SHIPPING_MODE_DIRECT;
  const shippingFeeInclusive = computeStoreShippingFeeInclusive(goodsTotal);
  if (shippingFeeInclusive <= 0) {
    return {
      itemsAmountTotal: goodsTotal,
      shippingMode: mode,
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
    shippingMode: mode,
    shippingFeeInclusive,
    shippingSupplyAmount: split.supply,
    shippingVatAmount: split.vat,
    supplyAmount: baseSupply + split.supply,
    vatAmount: baseVat + split.vat,
    amountTotal: baseTotal + split.total,
  };
}
