// change-log:
// - 2026-08-23: 겸영 — 스토어 과세 매출 장부 이벤트/계정 SSOT (실결제 전 골격).
// related files:
// - rules.md §2.3
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js

/** 스토어 기성품 과세 매출 저널 이벤트(실결제 연동 전 자리). */
export const LEDGER_EVENT_STORE_SALE = "STORE_SALE";

/** 스토어 과세 매출 계정. */
export const LEDGER_ACCOUNT_REV_STORE_TAXABLE = "REV_STORE_TAXABLE";

export const LEDGER_TAX_LANE = Object.freeze({
  EXEMPT_LAB: "EXEMPT_LAB",
  TAXABLE_STORE: "TAXABLE_STORE",
});

export const LEDGER_TAX_LANE_LABEL = Object.freeze({
  EXEMPT_LAB: "면세 · 기공·커스텀어벗·크레딧",
  TAXABLE_STORE: "과세 · 스토어 기성품",
});

export const LEDGER_TAX_LANE_NOTICE =
  "어벗츠는 겸영사업자입니다. 면세(기공·커스텀어벗·크레딧)와 과세(스토어) 매출을 분리해 집계·(세금)계산서를 발행합니다.";
