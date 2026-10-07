// related files:
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/frontend/src/pages/requestor/discountGroup/LabDiscountGroupPage.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/rules.md
// change-log:
// - 2026-10-08: 의뢰비 = 매일 자정 30일 주문량 스냅샷 단가(하루 고정). 가입 90일 1만원 고정.

/** 기본 건당 의뢰비(원). */
export const REQUESTOR_UNIT_PRICE_BASE = 15_000;
/** 지난 30일 합산 1건당 할인(원). */
export const REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT = 50;
/** 최대 할인(원). 100건 이상이면 건당 1만원. */
export const REQUESTOR_UNIT_PRICE_MAX_DISCOUNT = 5_000;
/** 가입 이벤트: 가입일 포함 90일 고정 단가(원). */
export const REQUESTOR_UNIT_PRICE_INTRO_DAYS = 90;
export const REQUESTOR_UNIT_PRICE_INTRO_PRICE = 10_000;

export const REQUESTOR_UNIT_PRICE_FLOOR =
  REQUESTOR_UNIT_PRICE_BASE - REQUESTOR_UNIT_PRICE_MAX_DISCOUNT;
/** 최대 할인에 필요한 지난 30일 합산 주문 수. */
export const REQUESTOR_UNIT_PRICE_MAX_DISCOUNT_ORDERS =
  REQUESTOR_UNIT_PRICE_MAX_DISCOUNT / REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT;

export type RequestorUnitPriceRule =
  | "intro_fixed"
  | "volume_discount"
  | "base_price"
  | "standard_price";

/** 주문량만으로 계산한 할인액(원). 단가 확정은 서버 스냅샷이 한다. */
export function requestorVolumeDiscountAmount(orders: number): number {
  return Math.min(
    Math.max(0, Math.floor(Number(orders) || 0)) *
      REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT,
    REQUESTOR_UNIT_PRICE_MAX_DISCOUNT,
  );
}

export function formatRequestorWon(n: number): string {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
}
