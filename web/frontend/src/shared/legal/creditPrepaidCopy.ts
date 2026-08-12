// change-log:
// - 2026-08-12: 충전 안내 본문 2줄 분리(선납 정의 / 면세·사용처).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/settings/tabs/CreditPaymentTab.tsx
// - web/frontend/src/pages/public/HelpPage.tsx
// - web/frontend/src/pages/public/TermsPage.tsx
// - web/frontend/src/pages/public/ServicePage.tsx
// - web/frontend/src/features/support/InquiriesPage.tsx

/** 화면 제목·탭 주변. 선불전자지급수단이 아닌 B2B 물품대금 선납임을 명시. */
export const CREDIT_CHARGE_NOTICE_TITLE = "크레딧(기공료 선입금) 충전";

export const CREDIT_CHARGE_NOTICE_BODY =
  "본 충전은 플랫폼 내 기공물 발주를 위한 기공료 선납(선입금)입니다.\n입금 즉시 부가가치세법에 따른 면세 계산서 발행 대상이 되며, 충전된 크레딧은 앱 내 기공물 주문 대금 결제용으로만 사용됩니다.";

export const CREDIT_PREPAID_BALANCE_LABEL = "보유 크레딧(선납 예치금)";

export type CreditPrepaidFaq = { q: string; a: string };

export const CREDIT_PREPAID_FAQS: CreditPrepaidFaq[] = [
  {
    q: "어벗츠 크레딧은 네이버페이나 카카오페이 같은 선불 충전금인가요?",
    a: "아닙니다. 어벗츠 크레딧은 치과 보철물 유통 계약에 따른 기공료 선입금(선납 대금)입니다. 금융 유통 마진이나 환전의 개념이 아니며, 오직 기공물 제작 및 커스텀 어벗먼트 구매 대금으로만 차감 처리가 가능합니다.",
  },
  {
    q: "충전 후 남은 크레딧은 환불이 가능한가요?",
    a: "네, 가능합니다. 거래 계약이 중도 해지되거나 미사용된 기공료 선입금 잔액에 대해서는 요청 시 전액 환불해 드리며, 이 경우 기발행된 면세 계산서는 마이너스(-) 수정 계산서로 처리됩니다. 무료·이벤트로 지급된 크레딧은 환불 대상에서 제외됩니다.",
  },
];
