// related files:
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/requestor/credits/components/CreditStatisticsTab.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx

/** 정산 충전 카드 — 요약 UI 공통 라벨(치과·기공소). */
export const CREDIT_LEDGER_CHARGE_LABEL = "충전";

export const CREDIT_LEDGER_CHARGE_DETAIL_TITLE = "충전 내역";

/** 기공소 PTX — 어벗 디자인/생산 시 충전 잔액 부족. */
export const PTX_CA_INSUFFICIENT_CREDIT_TITLE = "크레딧이 부족합니다";

export const PTX_CA_INSUFFICIENT_CREDIT_DESCRIPTION_LINES = [
  "커스텀어벗 비용을 정산할 수 없습니다.",
  "정산 · 자동정산에서 출금 계좌를 확인해 주세요.",
] as const;

export const PTX_CA_INSUFFICIENT_CREDIT_CONFIRM_LABEL = "자동정산";

export const PTX_CA_INSUFFICIENT_CREDIT_REASON = "insufficient_credit_for_ptx_ca";
