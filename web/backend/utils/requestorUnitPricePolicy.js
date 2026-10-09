// related files:
// - web/frontend/src/shared/pricing/requestorUnitPricePolicy.ts
// - web/backend/services/requestorUnitPrice.service.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/rules.md
// change-log:
// - 2026-10-09: 배송비 판매자 부담 — 거래처 박스당 배송비 REQUESTOR_SHIPPING_FEE_PER_BOX=0.
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
/**
 * 거래처(치과·기공소)에게 받는 박스당 배송비(원). 배송비는 판매자(딜러, 없으면 어벗츠) 부담이라 0.
 * 의뢰 사전 잔액 검사·배송비 hold·포장.발송 commit 모두 이 값이 0이면 거래처 크레딧을 건드리지 않는다.
 */
export const REQUESTOR_SHIPPING_FEE_PER_BOX = 0;
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
 * 견적 한 건의 딜러 수수료(부가세 포함).
 * 생산 판매가 합계 = 청구액 − 신속비 − 디자인비. 수량은 abutmentQty(없으면 1).
 * 청구액은 paidAmount가 있으면 그 값, 없으면 amount.
 */
export function dealerCommissionFromQuotedPrice(price) {
  const src = price && typeof price === "object" ? price : {};
  const paid = src.paidAmount;
  const gross =
    paid == null || paid === ""
      ? Math.max(0, Math.round(Number(src.amount) || 0))
      : Math.max(0, Math.round(Number(paid) || 0));
  const express =
    String(src.expressFeeStatus || "") === "cancelled"
      ? 0
      : Math.max(0, Math.round(Number(src.expressFee) || 0));
  const design = Math.max(0, Math.round(Number(src.designFee) || 0));
  const production = Math.max(0, gross - express - design);
  const qtyRaw = Math.floor(Number(src.abutmentQty) || 0);
  const qty = qtyRaw > 0 ? qtyRaw : 1;
  const unitSale = production / qty;
  return (
    Math.max(0, Math.round(unitSale - REQUESTOR_UNIT_PRICE_DEALER_SUPPLY)) * qty
  );
}

/** 집계 파이프라인용. 문서의 price.* 와 dealerCommissionFromQuotedPrice 가 같다. */
export function dealerCommissionMongoExpr() {
  const gross = {
    $ifNull: ["$price.paidAmount", { $ifNull: ["$price.amount", 0] }],
  };
  const express = {
    $cond: [
      { $eq: ["$price.expressFeeStatus", "cancelled"] },
      0,
      { $max: [0, { $ifNull: ["$price.expressFee", 0] }] },
    ],
  };
  const design = { $max: [0, { $ifNull: ["$price.designFee", 0] }] };
  const qty = {
    $cond: [
      { $gt: [{ $ifNull: ["$price.abutmentQty", 0] }, 0] },
      { $ifNull: ["$price.abutmentQty", 1] },
      1,
    ],
  };
  const production = {
    $max: [0, { $subtract: [gross, { $add: [express, design] }] }],
  };
  const perUnit = {
    $max: [
      0,
      {
        $round: [
          { $subtract: [{ $divide: [production, qty] }, REQUESTOR_UNIT_PRICE_DEALER_SUPPLY] },
          0,
        ],
      },
    ],
  };
  return { $multiply: [perUnit, qty] };
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
