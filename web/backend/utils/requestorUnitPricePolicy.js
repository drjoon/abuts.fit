// related files:
// - web/frontend/src/shared/pricing/requestorUnitPricePolicy.ts
// - web/backend/services/requestorUnitPrice.service.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/rules.md
// change-log:
// - 2026-10-08: 단일가 1.5만 + 딜러/영업팀 거래처별 가격(1.2~1.5만, 비공개). 그룹할인·90일 이벤트·주문량 할인 폐지.

/**
 * 건당 의뢰비 정책 (SSOT). 치과·기공소 공통.
 * - 기본(공시) 15,000원.
 * - 딜러/영업팀이 거래처(BusinessAnchor)별로 12,000~15,000원을 정할 수 있다. 거래처별 가격은 외부에 노출하지 않는다.
 * - 어벗츠는 제조사에서 5,500원에 매입하고 딜러에게 10,000원에 공급한다.
 *   거래처에는 어벗츠가 직접 공급(부가세 면제)하고, 딜러에게는 (판매가 − 10,000원)을 부가세 포함으로 지급한다.
 * - 딜리버리 월정액(55,000원)은 딜러가 부담. 딜러가 없는 직판은 어벗츠가 부담.
 */
export const REQUESTOR_UNIT_PRICE_BASE = 15_000;
export const REQUESTOR_UNIT_PRICE_MIN = 12_000;
export const REQUESTOR_UNIT_PRICE_FLOOR = REQUESTOR_UNIT_PRICE_MIN;
/** 제조사 매입가(원, 부가세 포함). */
export const REQUESTOR_UNIT_PRICE_MANUFACTURER_COST = 5_500;
/** 어벗츠 → 딜러 공급가(원, 부가세 포함). */
export const REQUESTOR_UNIT_PRICE_DEALER_SUPPLY = 10_000;
/** 딜리버리 월정액(원, 부가세 포함). 딜러 부담, 직판은 어벗츠 부담. */
export const DELIVERY_MONTHLY_FEE = 55_000;
/** 월 의뢰가 이 건수 이하인 거래처는 배송업체가 무료로 처리한다(월정액 원가 0). */
export const DELIVERY_FREE_MAX_MONTHLY_REQUESTS = 2;


/**
 * 딜러 설정가 검증. 원 단위 정수, 12,000~15,000.
 * @returns {{ ok: true, price: number } | { ok: false, message: string }}
 */
export function validateDealerUnitPrice(input) {
  const n = Number(input);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, message: "가격은 원 단위 정수여야 합니다." };
  }
  if (n < REQUESTOR_UNIT_PRICE_MIN || n > REQUESTOR_UNIT_PRICE_BASE) {
    return {
      ok: false,
      message: `가격은 ${REQUESTOR_UNIT_PRICE_MIN.toLocaleString("ko-KR")}원 이상 ${REQUESTOR_UNIT_PRICE_BASE.toLocaleString("ko-KR")}원 이하여야 합니다.`,
    };
  }
  return { ok: true, price: n };
}

/** 딜러 수수료(부가세 포함) = 판매가 − 딜러 공급가. 직판은 해당 없음. */
export function computeDealerCommission(salePrice) {
  const sale = Math.round(Number(salePrice) || 0);
  return Math.max(0, sale - REQUESTOR_UNIT_PRICE_DEALER_SUPPLY);
}

/**
 * @param {{ dealerUnitPrice?: number|null }} [input]
 * @returns {{ unitPrice: number, discountAmount: number, rule: "dealer_price"|"base_price", introEndsYmd: null }}
 */
export function resolveRequestorUnitPrice({ dealerUnitPrice } = {}) {
  const checked =
    dealerUnitPrice == null ? null : validateDealerUnitPrice(dealerUnitPrice);
  if (checked?.ok) {
    return {
      unitPrice: checked.price,
      discountAmount: REQUESTOR_UNIT_PRICE_BASE - checked.price,
      rule: "dealer_price",
      introEndsYmd: null,
    };
  }
  return {
    unitPrice: REQUESTOR_UNIT_PRICE_BASE,
    discountAmount: 0,
    rule: "base_price",
    introEndsYmd: null,
  };
}
