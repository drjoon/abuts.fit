// change-log:
// - 2026-10-06: 딜리버리 월 가입(1개월·크레딧). 미계약이라 추후 서비스 안내.
// - 2026-10-06: 묶음 출고→택배 묶음 출고(박스당 배송비). 신속 출고→딜리버리 익일 도착(월 정액 VAT 포함).
// related files:
// - web/frontend/src/shared/shipping/shippingMode.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestShippingSection.tsx

/** 표시 라벨 SSOT. 내부 모드는 계속 `normal` / `express`. */
export const BULK_SHIPPING_LABEL = "택배 묶음 출고";
export const EXPRESS_SHIPPING_LABEL = "딜리버리 익일 도착";
export const BULK_SHIPPING_LABEL_SHORT = "택배 묶음";
export const EXPRESS_SHIPPING_LABEL_SHORT = "딜리버리";

/** 딜리버리 익일 도착 월정액 기본(원, VAT 포함). */
export const DELIVERY_NEXT_DAY_MONTHLY_FEE_DEFAULT = 55_000;

export function resolveDeliveryNextDayMonthlyFee(raw?: number | null): number {
  const n = Math.round(Number(raw) || 0);
  return n > 0 ? n : DELIVERY_NEXT_DAY_MONTHLY_FEE_DEFAULT;
}

export const BULK_SHIPPING_POLICY_LINE =
  "1박스당 배송비를 별도로 부과합니다.";

export const EXPRESS_SHIPPING_ARRIVAL_LINE =
  "오늘 주문하면 내일 도착합니다.";

export const EXPRESS_SHIPPING_FEE_LINE = "월 정액(VAT 포함)입니다.";

/** 딜리버리 월 가입. 지금은 미계약이라 신청만 안내하고 크레딧은 쓰지 않는다. */
export const DELIVERY_SUBSCRIBE_AVAILABLE = false;

export const DELIVERY_SUBSCRIBE_PERIOD_LINE = "1개월 단위로 가입합니다.";

export const DELIVERY_SUBSCRIBE_CREDIT_LINE =
  "월 정액은 크레딧에서 지출됩니다.";

export const DELIVERY_SUBSCRIBE_COMING_SOON_LINE =
  "지금은 서비스 준비중입니다.";
