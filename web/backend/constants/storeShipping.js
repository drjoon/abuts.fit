// change-log:
// - 2026-09-13: 기공물 동봉은 1주일 이내 치과 도착건이 있을 때만. 기본 직송은 유료.
// - 2026-09-13: 10만원 임계 제거. 항상 기공물 동봉(무료) / 빠른 직송(+3,300).
// - 2026-09-13: 10만원 이하 — 기공물 동봉(무료) / 빠른 직송(+3,300) 옵션.
// - 2026-08-23: 스토어 배송료 — 상품 10만원 이하 3,300원(부가세 포함), 초과 무료.
// related files:
// - web/backend/controllers/store/storeOrder.controller.js
// - web/frontend/src/shared/store/storeShipping.ts

import { splitInclusiveVat } from "../utils/storeVat.js";

/** 부가세 포함 배송료(원) — 빠른 직송(direct) 선택 시. */
export const STORE_SHIPPING_FEE_INCLUSIVE = 3_300;

/** 기공물 동봉(무료, 1주일 이내 도착건 있을 때만) */
export const STORE_SHIPPING_MODE_LAB_BUNDLE = "lab_bundle";

/** 치과 직송(유료 빠른 배송) */
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
 * 요청 모드·동봉 가능 여부로 확정 배송 방식.
 * - lab_bundle은 labBundleEligible일 때만
 * - 그 외·미지정은 direct(유료) 기본? No — when eligible default lab_bundle for UX when not specified
 * @param {unknown} requestedMode
 * @param {{ labBundleEligible?: boolean }} [opts]
 */
export function resolveStoreShippingMode(requestedMode, opts = {}) {
  const labBundleEligible = Boolean(opts.labBundleEligible);
  const normalized = normalizeStoreShippingModeInput(requestedMode);
  if (normalized === STORE_SHIPPING_MODE_LAB_BUNDLE) {
    return labBundleEligible
      ? STORE_SHIPPING_MODE_LAB_BUNDLE
      : STORE_SHIPPING_MODE_DIRECT;
  }
  if (normalized === STORE_SHIPPING_MODE_DIRECT) {
    return STORE_SHIPPING_MODE_DIRECT;
  }
  return labBundleEligible
    ? STORE_SHIPPING_MODE_LAB_BUNDLE
    : STORE_SHIPPING_MODE_DIRECT;
}

/**
 * @param {number} goodsTotalInclusive
 * @param {{ shippingMode?: unknown, labBundleEligible?: boolean }} [opts]
 */
export function computeStoreShippingFeeInclusive(
  goodsTotalInclusive,
  opts = {},
) {
  const goods = Math.max(0, Math.round(Number(goodsTotalInclusive || 0)));
  if (goods <= 0) return 0;
  const mode = resolveStoreShippingMode(opts.shippingMode, {
    labBundleEligible: opts.labBundleEligible,
  });
  if (mode === STORE_SHIPPING_MODE_DIRECT) return STORE_SHIPPING_FEE_INCLUSIVE;
  return 0;
}

/** 상품 합계에 배송료를 반영한 주문 금액. */
export function applyStoreShippingToOrderTotals({
  itemsAmountTotal,
  supplyAmount,
  vatAmount,
  amountTotal,
  shippingMode,
  labBundleEligible,
}) {
  const goodsTotal = Math.max(
    0,
    Math.round(Number(itemsAmountTotal || amountTotal || 0)),
  );
  const mode = resolveStoreShippingMode(shippingMode, { labBundleEligible });
  const shippingFeeInclusive = computeStoreShippingFeeInclusive(goodsTotal, {
    shippingMode: mode,
    labBundleEligible,
  });
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
