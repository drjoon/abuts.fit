// change-log:
// - 2026-10-08: 택배 묶음 출고·월 가입 폐지. 딜리버리 익일 도착만(거래처 배송비 없음, 월정액은 딜러/어벗츠 부담).
// - 2026-10-06: 묶음 출고→택배 묶음 출고(박스당 배송비). 신속 출고→딜리버리 익일 도착.
// related files:
// - web/frontend/src/shared/shipping/shippingMode.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestShippingSection.tsx

/** 표시 라벨 SSOT. 내부 모드는 계속 `normal` / `express`. */
/** @deprecated 묶음 출고 폐지. 레거시 기록 표시용. */
export const BULK_SHIPPING_LABEL = "택배 묶음 출고";
export const EXPRESS_SHIPPING_LABEL = "딜리버리 익일 도착";
/** @deprecated 묶음 출고 폐지. 레거시 기록 표시용. */
export const BULK_SHIPPING_LABEL_SHORT = "택배 묶음";
export const EXPRESS_SHIPPING_LABEL_SHORT = "딜리버리";

/** 딜리버리 월정액(원, VAT 포함). 거래처 1곳당. 딜러 부담, 딜러가 없으면 어벗츠 부담. */
export const DELIVERY_NEXT_DAY_MONTHLY_FEE_DEFAULT = 55_000;

export function resolveDeliveryNextDayMonthlyFee(raw?: number | null): number {
  const n = Math.round(Number(raw) || 0);
  return n > 0 ? n : DELIVERY_NEXT_DAY_MONTHLY_FEE_DEFAULT;
}

export const EXPRESS_SHIPPING_ARRIVAL_LINE =
  "오늘 주문하면 내일 도착합니다.";

/** 의뢰자 화면: 배송비 없음. */
export const DELIVERY_FREE_LINE = "배송비는 없습니다.";

/** 딜러·정책 화면: 월정액 부담 주체. */
export const DELIVERY_MONTHLY_PAYER_LINE =
  "거래처 1곳당 월정액은 딜러가 부담합니다. 딜러가 없으면 어벗츠가 부담합니다. 월 의뢰 2건 이하 거래처는 무료입니다.";

/** 건별 신속(express) 모드 선택 비활성. 묶음 폐지로 UI 선택지는 없고 내부 모드만 남는다. */
export const EXPRESS_MODE_PER_FILE_ENABLED = false;
