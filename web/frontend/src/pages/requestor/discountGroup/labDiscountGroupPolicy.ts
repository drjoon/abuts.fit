// related files:
// - web/frontend/src/pages/requestor/discountGroup/LabDiscountGroupPage.tsx
// - web/frontend/src/shared/pricing/requestorUnitPricePolicy.ts
// - web/frontend/rules.md
// change-log:
// - 2026-10-08: 정책 수치 SSOT를 shared/pricing/requestorUnitPricePolicy.ts로 이동. 오늘 단가는 서버 스냅샷.
// - 2026-10-07: 가입이벤트 90일 고정 · 91일부터 지난 30일 주문량으로 오늘 가격.
export {
  REQUESTOR_UNIT_PRICE_BASE as LAB_DISCOUNT_BASE_UNIT_PRICE,
  REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT as LAB_DISCOUNT_PER_ORDER,
  REQUESTOR_UNIT_PRICE_MAX_DISCOUNT as LAB_DISCOUNT_MAX_AMOUNT,
  REQUESTOR_UNIT_PRICE_INTRO_DAYS as LAB_DISCOUNT_INTRO_DAYS,
  REQUESTOR_UNIT_PRICE_INTRO_PRICE as LAB_DISCOUNT_INTRO_UNIT_PRICE,
  REQUESTOR_UNIT_PRICE_FLOOR as LAB_DISCOUNT_MIN_UNIT_PRICE,
  requestorVolumeDiscountAmount as labVolumeDiscountAmount,
  formatRequestorWon as formatLabDiscountWon,
} from "@/shared/pricing/requestorUnitPricePolicy";
