// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
// - web/frontend/src/pages/salesTeam/SalesPerformancePage.tsx
/** 딜러·영업본부 소개 귀속 정책 카피 SSOT (90일 비활성 리셋). */
export const REFERRAL_OWNERSHIP_INACTIVE_DAYS = 90;

export const REFERRAL_OWNERSHIP_RESET_POLICY_LINE =
  `의뢰자가 ${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일간 주문(커스텀 어벗 의뢰)이 없으면 소개 귀속이 리셋되어, 누구든 다시 영업할 수 있습니다.`;

/** 딜러 대시보드 상단 카드용 — 1줄 */
export const REFERRAL_OWNERSHIP_RESET_POLICY_SHORT =
  `${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문 시 리셋 · 재영업 가능`;
