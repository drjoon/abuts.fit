// change-log:
// - 2026-08-23: 스토어 매출 전액 어벗츠·장바구니 분리·풀필먼트 라벨 SSOT.
// - 2026-08-23: 겸영 — 면세(기공·커스텀어벗·크레딧) / 과세(스토어) 장부 골격 SSOT.
// related files:
// - rules.md §2.3
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js

/** 스토어 기성품 과세 매출 저널 이벤트. 입금 확정 시 기록. */
export const LEDGER_EVENT_STORE_SALE = "STORE_SALE";

/** 스토어 과세 매출 계정. */
export const LEDGER_ACCOUNT_REV_STORE_TAXABLE = "REV_STORE_TAXABLE";

/**
 * 스토어 매출 수익 소유자. 커스텀어벗과 달리 딜러/제조 분배 없이
 * 공급가 전액이 어벗츠(admin) REV_STORE_TAXABLE에만 귀속된다.
 */
export const STORE_REVENUE_OWNER_ROLE = "admin";

/**
 * 스토어 장바구니는 커스텀어벗 주문과 한 체크아웃에 합치지 않는다.
 * 같은 B2B 거래 선수금 잔액으로 각각 결제하는 것은 허용.
 */
export const STORE_CART_MERGE_WITH_CREDIT_OR_CUSTOM_ABUTMENT = false;

export const LEDGER_TAX_LANE = {
  EXEMPT_LAB: "EXEMPT_LAB",
  TAXABLE_STORE: "TAXABLE_STORE",
} as const;

export type LedgerTaxLane =
  (typeof LEDGER_TAX_LANE)[keyof typeof LEDGER_TAX_LANE];

export const LEDGER_TAX_LANE_LABEL: Record<LedgerTaxLane, string> = {
  EXEMPT_LAB: "면세 · 기공·커스텀어벗·크레딧",
  TAXABLE_STORE: "과세 · 스토어 기성품",
};

export const LEDGER_TAX_LANE_NOTICE =
  "어벗츠는 겸영사업자입니다. 면세(기공·커스텀어벗·크레딧)와 과세(스토어) 매출을 분리해 집계·(세금)계산서를 발행합니다.";

export const STORE_FULFILLMENT_STATUS_LABEL = {
  UNPAID: "입금 전",
  READY: "출고 대기",
  SHIPPED: "출고·배송중",
  DELIVERED: "배송 완료",
  CANCELED: "출고 취소",
} as const;

export type StoreFulfillmentStatus =
  keyof typeof STORE_FULFILLMENT_STATUS_LABEL;
