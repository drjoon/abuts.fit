// change-log:
// - 2026-09-13: 기공물 동봉은 1주일 이내 치과 도착건이 있을 때만. 기본 직송은 유료.
// - 2026-09-13: 10만원 임계 제거. 항상 기공물 동봉(무료) / 빠른 직송(+3,300).
// - 2026-09-13: 10만원 이하 — 기공물 동봉(무료) / 빠른 직송(+3,300) 옵션.
// - 2026-08-23: 스토어 배송료 — 상품 10만원 이하 3,300원(부가세 포함), 초과 무료.
// related files:
// - web/backend/constants/storeShipping.js
// - web/frontend/src/pages/requestor/store/RequestorStoreCartPage.tsx
import { splitInclusiveVat } from "@/shared/tax/invoiceLabels";

/** 부가세 포함 배송료(원) — 빠른 직송(direct) 선택 시. */
export const STORE_SHIPPING_FEE_INCLUSIVE = 3_300;

/** 기공물 동봉(무료, 1주일 이내 도착건 있을 때만) */
export const STORE_SHIPPING_MODE_LAB_BUNDLE = "lab_bundle" as const;

/** 치과 직송(유료 빠른 배송) */
export const STORE_SHIPPING_MODE_DIRECT = "direct" as const;

export const STORE_LAB_BUNDLE_WITHIN_CIVIL_DAYS = 7;

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

/** 요청 모드·동봉 가능 여부로 확정 배송 방식. */
export function resolveStoreShippingMode(
  requestedMode?: unknown,
  opts: { labBundleEligible?: boolean } = {},
): StoreShippingMode {
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

export function computeStoreShippingFeeInclusive(
  goodsTotalInclusive: number,
  opts: { shippingMode?: unknown; labBundleEligible?: boolean } = {},
) {
  const goods = Math.max(0, Math.round(Number(goodsTotalInclusive || 0)));
  if (goods <= 0) return 0;
  const mode = resolveStoreShippingMode(opts.shippingMode, {
    labBundleEligible: opts.labBundleEligible,
  });
  if (mode === STORE_SHIPPING_MODE_DIRECT) return STORE_SHIPPING_FEE_INCLUSIVE;
  return 0;
}

export function buildStoreOrderTotalsWithShipping(
  goodsTotalInclusive: number,
  opts: { shippingMode?: unknown; labBundleEligible?: boolean } = {},
) {
  const goodsSplit = splitInclusiveVat(goodsTotalInclusive);
  const shippingMode = resolveStoreShippingMode(opts.shippingMode, {
    labBundleEligible: opts.labBundleEligible,
  });
  const shippingFeeInclusive = computeStoreShippingFeeInclusive(
    goodsTotalInclusive,
    {
      shippingMode,
      labBundleEligible: opts.labBundleEligible,
    },
  );
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
  if (m === STORE_SHIPPING_MODE_LAB_BUNDLE) return "기공물 동봉";
  if (m === STORE_SHIPPING_MODE_DIRECT) return "치과 직송";
  return "";
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
