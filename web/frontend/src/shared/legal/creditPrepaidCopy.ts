// change-log:
// - 2026-08-23: B2B 거래 선수금. 충전 시 계산서 없음 → 사용분 월말 면세/과세 분리 발행.
// - 2026-08-19: 치과 멤버십 폐지. 유료 크레딧 사용처를 기공물·어벗 주문 대금만으로 안내.
// - 2026-08-15: 유료 크레딧 사용처에 치과 멤버십 월 구독 포함(면세).
// - 2026-08-15: 기공크레딧=주문 상계 가능(무료→기공→유료). 충전·적립 경로 표시는 분리 유지.
// - 2026-08-15: 내역 잔액 카드 무료·기공 툴팁 문구 추가.
// - 2026-08-14: 내역 탭용 선입금(선납) 안내 문구 추가.
// - 2026-08-12: 충전 안내 본문 2줄 분리(선납 정의 / 면세·사용처).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/settings/tabs/CreditPaymentTab.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/public/HelpPage.tsx
// - web/frontend/src/pages/public/TermsPage.tsx
// - web/frontend/src/pages/public/ServicePage.tsx
// - web/frontend/src/features/support/InquiriesPage.tsx

/** 화면 제목·탭 주변. 선불전자지급수단이 아닌 B2B 거래 선수금임을 명시. */
export const CREDIT_CHARGE_NOTICE_TITLE = "크레딧(거래 선수금) 충전";

export const CREDIT_CHARGE_NOTICE_BODY =
  "본 충전은 플랫폼 내 계약 물품·용역(기공·커스텀어벗·스토어 기성품) 대금용 B2B 거래 선수금(예치금)입니다. 선불페이가 아닙니다.\n입금 시에는 (세금)계산서를 발행하지 않으며, 사용분 기준으로 매월 말 면세(기공·어벗)와 과세(스토어)를 각각 합산 발행합니다.\n기공크레딧(치과 수취·정산) 적립 경로와는 별도로 관리됩니다.";

/** 내역 탭 — 유료 카드「거래 선수금」툴팁. */
export const CREDIT_LEDGER_PREPAID_NOTICE_BODY =
  "유료 크레딧은 플랫폼 계약 물품·용역용 B2B 거래 선수금입니다. 선불페이가 아니며, 미사용 잔액은 요청 시 환불됩니다. (세금)계산서는 사용분 기준 월말 발행입니다.";

/** 내역 탭 — 무료 카드 툴팁. */
export const CREDIT_LEDGER_FREE_NOTICE_BODY =
  "환영·이벤트 등으로 지급된 무료 크레딧입니다. 기공의뢰·어벗 생산·배송 등에 다른 크레딧보다 먼저 사용되며, 환불 대상이 아닙니다.";

/** 내역 탭 — 기공 카드 툴팁(기공소). */
export const CREDIT_LEDGER_SETTLEMENT_NOTICE_BODY =
  "치과 기공의뢰 작업완료 시 적립되는 정산 대기금입니다. 앱 내 주문 대금에 쓰면 해당 금액만큼 월 정산에서 차감(상계)되며, 남으면 등록 계좌로 지급됩니다.";

export const CREDIT_PREPAID_BALANCE_LABEL = "보유 크레딧(거래 선수금)";

export const CREDIT_PAID_BUCKET_HINT = "거래 선수금";
export const CREDIT_FREE_BUCKET_HINT = "이벤트·환영";
export const CREDIT_SETTLEMENT_BUCKET_HINT = "정산·주문 상계";

export type CreditPrepaidFaq = { q: string; a: string };

export const CREDIT_PREPAID_FAQS: CreditPrepaidFaq[] = [
  {
    q: "어벗츠 크레딧은 네이버페이나 카카오페이 같은 선불 충전금인가요?",
    a: "아닙니다. 어벗츠 크레딧은 플랫폼 내 계약 물품·용역 대금용 B2B 거래 선수금(예치금)입니다. 금융 유통 마진이나 환전의 개념이 아니며, 기공·커스텀어벗(면세)과 스토어 기성품(과세) 대금으로만 차감됩니다.",
  },
  {
    q: "충전할 때 (세금)계산서가 나오나요?",
    a: "아니요. 입금(충전) 시점에는 발행하지 않습니다. 사용한 금액만 매월 말 기준으로 면세 계산서(기공·어벗)와 과세 세금계산서(스토어)를 각각 합산 발행합니다.",
  },
  {
    q: "충전 후 남은 크레딧은 환불이 가능한가요?",
    a: "네, 가능합니다. 거래 계약이 중도 해지되거나 미사용된 선수금 잔액에 대해서는 요청 시 전액 환불해 드립니다. 이미 월말 발행된 (세금)계산서가 있으면 필요 시 마이너스 수정으로 처리합니다. 무료·이벤트로 지급된 크레딧은 환불 대상에서 제외됩니다.",
  },
  {
    q: "기공소 기공크레딧으로도 주문을 결제할 수 있나요?",
    a: "기공·어벗 주문에는 가능합니다. 기공크레딧은 치과 기공의뢰 완료로 적립된 정산 대기금이며, 쓰면 월 정산 지급액에서 상계됩니다. 스토어 기성품은 유료 선수금만 사용할 수 있습니다. 주문 차감 순서는 무료 → 기공 → 유료입니다.",
  },
];
