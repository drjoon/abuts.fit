// change-log:
// - 2026-09-23: 상품 10만원 이상 무료 · 미만 3,500(부가세 포함). 기공물 동봉(lab_bundle) 폐지.
// - 2026-09-13: 기공물 동봉은 어벗츠 CA 제작 포함 + 1주일 이내(발송·도착)만. 기본 직송은 유료.
// - 2026-09-13: 기공물 동봉은 1주일 이내 치과 도착건이 있을 때만. 기본 직송은 유료.
// - 2026-09-13: 10만원 임계 제거. 항상 기공물 동봉(무료) / 빠른 직송(+3,300).
// - 2026-09-13: 10만원 이하 — 기공물 동봉(무료) / 빠른 직송(+3,300) 옵션.
// - 2026-08-23: 스토어 배송료 — 상품 10만원 이하 3,300원(부가세 포함), 초과 무료.
// related files:
// - web/backend/constants/storeShipping.js
// - web/frontend/src/pages/requestor/store/RequestorStoreCartPage.tsx
import { splitInclusiveVat } from "@/shared/tax/invoiceLabels";

/** 부가세 포함 배송료(원) — 상품 합계가 무료 임계 미만일 때. */
export const STORE_SHIPPING_FEE_INCLUSIVE = 3_500;

/** 상품(부가세 포함) 합계가 이 금액 이상이면 배송비 무료. */
export const STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE = 100_000;

/**
 * @deprecated 레거시 주문 표시용. 신규 주문은 동봉 모드를 쓰지 않음.
 */
export const STORE_SHIPPING_MODE_LAB_BUNDLE = "lab_bundle" as const;

/** 치과·기공소 직송(유료, 임계 이상 시 무료) */
export const STORE_SHIPPING_MODE_DIRECT = "direct" as const;

export type StoreShippingMode =
  | typeof STORE_SHIPPING_MODE_LAB_BUNDLE
  | typeof STORE_SHIPPING_MODE_DIRECT;

export function normalizeStoreShippingModeInput(
  raw: unknown,
): StoreShippingMode | "" {
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

/** 신규 주문은 항상 direct. lab_bundle 요청은 무시(폐지). */
export function resolveStoreShippingMode(
  _requestedMode?: unknown,
): StoreShippingMode {
  return STORE_SHIPPING_MODE_DIRECT;
}

/** 상품 합계 ≥ 10만원 → 0, 그 외 → STORE_SHIPPING_FEE_INCLUSIVE. */
export function computeStoreShippingFeeInclusive(goodsTotalInclusive: number) {
  const goods = Math.max(0, Math.round(Number(goodsTotalInclusive || 0)));
  if (goods <= 0) return 0;
  if (goods >= STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE) return 0;
  return STORE_SHIPPING_FEE_INCLUSIVE;
}

export function buildStoreOrderTotalsWithShipping(goodsTotalInclusive: number) {
  const goodsSplit = splitInclusiveVat(goodsTotalInclusive);
  const shippingMode = STORE_SHIPPING_MODE_DIRECT;
  const shippingFeeInclusive =
    computeStoreShippingFeeInclusive(goodsTotalInclusive);
  if (shippingFeeInclusive <= 0) {
    return {
      itemsAmountTotal: goodsSplit.total,
      shippingMode,
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
    shippingMode,
    shippingFeeInclusive,
    shippingSupplyAmount: shippingSplit.supply,
    shippingVatAmount: shippingSplit.vat,
    supply: goodsSplit.supply + shippingSplit.supply,
    vat: goodsSplit.vat + shippingSplit.vat,
    total: goodsSplit.total + shippingSplit.total,
  };
}

export function storeShippingModeLabel(mode?: unknown): string {
  const m = normalizeStoreShippingModeInput(mode);
  if (m === STORE_SHIPPING_MODE_LAB_BUNDLE) return "기공물 동봉(레거시)";
  if (m === STORE_SHIPPING_MODE_DIRECT) return "직송";
  return "";
}

export function storeShippingPolicyHint(goodsTotalInclusive = 0): string {
  const goods = Math.max(0, Math.round(Number(goodsTotalInclusive || 0)));
  if (goods > 0 && goods < STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE) {
    const remain = STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE - goods;
    return `상품 ${STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE.toLocaleString("ko-KR")}원 이상 배송비 무료 · ${remain.toLocaleString("ko-KR")}원 더 담으면 무료`;
  }
  if (goods >= STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE) {
    return `상품 ${STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE.toLocaleString("ko-KR")}원 이상 · 배송비 무료`;
  }
  return `상품 ${STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE.toLocaleString("ko-KR")}원 이상 배송비 무료 · 미만 ${STORE_SHIPPING_FEE_INCLUSIVE.toLocaleString("ko-KR")}원(부가세 포함)`;
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
