// change-log:
// - 2026-10-13: 안내 문구 — 택배(기본·적립에서 차감)·딜리버리(월 100건·직접 입금) 두 방식.
// - 2026-10-13: 택배 배송(기본)·딜리버리 배송(월 100건 이상) 두 방식. 거래처별 지정은 딜러·영업팀·관리자.
// - 2026-10-13: 딜러 거래처 월정액은 적립에서 빼지 않는다. 딜러사가 딜리버리 회사에 직접 입금.
// - 2026-10-09: 안내 문구는 「배송비 판매자 부담」. 「배송비 별도」「배송비 없음」은 쓰지 않음.
// - 2026-10-08: 택배 묶음 출고·월 가입 폐지. 딜리버리 익일 도착만(거래처 배송비 없음, 월정액은 딜러/어벗츠 부담).
// - 2026-10-06: 묶음 출고→택배 묶음 출고(박스당 배송비). 신속 출고→딜리버리 익일 도착.
// related files:
// - web/frontend/src/shared/shipping/shippingMode.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestShippingSection.tsx

/** 표시 라벨 SSOT. 내부 모드는 계속 `normal`(택배) / `express`(딜리버리). */
export const BULK_SHIPPING_LABEL = "택배 배송";
export const EXPRESS_SHIPPING_LABEL = "딜리버리 배송";
export const BULK_SHIPPING_LABEL_SHORT = "택배";
export const EXPRESS_SHIPPING_LABEL_SHORT = "딜리버리";

/** 택배 배송 카드 안내. 요일 선택 없음, 기본 적용. */
export const PARCEL_SHIPPING_LINE = "오늘 의뢰시 내일 16시 출고합니다.";
export const PARCEL_SHIPPING_DEFAULT_LINE = "기본 적용";

/** 딜리버리 카드 안내. */
export const DELIVERY_ARRIVAL_LINE = "오늘 의뢰시 내일 도착합니다.";

/** 딜리버리 배송 적용 기준(월 의뢰 건수). 지정 화면 안내용. */
export const DELIVERY_MIN_MONTHLY_REQUESTS = 100;
export const DELIVERY_CONDITION_LINE = `월 ${DELIVERY_MIN_MONTHLY_REQUESTS}건 이상 의뢰시 적용`;

/** 딜리버리 월정액(원, VAT 포함). 거래처 1곳당. 딜러사는 직접 입금, 없으면 어벗츠 부담. */
export const DELIVERY_NEXT_DAY_MONTHLY_FEE_DEFAULT = 55_000;

export function resolveDeliveryNextDayMonthlyFee(raw?: number | null): number {
  const n = Math.round(Number(raw) || 0);
  return n > 0 ? n : DELIVERY_NEXT_DAY_MONTHLY_FEE_DEFAULT;
}

export const EXPRESS_SHIPPING_ARRIVAL_LINE =
  "오늘 주문하면 내일 도착합니다.";

/** 정책·의뢰 안내. 거래처에게 배송비를 따로 받지 않고 판매자(딜러)가 부담한다. */
export const DELIVERY_FREE_LINE = "배송비 판매자 부담.";

/** 거래처·공개 안내. 두 방식 중 하나. */
export const SHIPPING_TWO_MODES_LINE = "택배와 딜리버리 중 하나입니다.";

/** 택배는 기본. 카드 제목이 이미 택배일 때는 PARCEL_SHIPPING_LINE만 쓴다. */
export const PARCEL_IS_DEFAULT_LINE = "택배는 기본입니다.";

/** 딜리버리 적용 조건. 카드 제목이 이미 딜리버리일 때는 DELIVERY_CONDITION_LINE만 쓴다. */
export const DELIVERY_APPLY_LINE = `딜리버리는 월 ${DELIVERY_MIN_MONTHLY_REQUESTS}건 이상이면 적용합니다.`;

/** 판매자 정산. 제조사(애크로덴트)가 택배를 대납하고, 월 정산 때 판매자 몫에서 상계한다. */
export const PARCEL_DEALER_DEDUCT_LINE =
  "택배는 제조사가 대납한 뒤, 월 정산 때 판매자 몫에서 상계합니다.";

/** 딜리버리는 적립을 깎지 않는다. */
export const DELIVERY_DEALER_FULL_PAYOUT_LINE = "딜리버리는 적립을 전액 지급합니다.";

/** 딜러·정책 화면. 판매자와 딜리버리사가 직접 계약한다. 어벗츠는 관여하지 않는다. */
export const DELIVERY_MONTHLY_PAYER_LINE =
  "딜리버리는 판매자와 딜리버리사가 직접 계약합니다. 어벗츠는 관여하지 않습니다.";

/** 건별 신속(express) 모드 선택 비활성. 묶음 폐지로 UI 선택지는 없고 내부 모드만 남는다. */
export const EXPRESS_MODE_PER_FILE_ENABLED = false;
