// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
// - web/frontend/src/pages/salesTeam/SalesPerformancePage.tsx
/** 딜러·영업본부 소개 귀속 정책 카피 SSOT. 90일 무주문이면 소개 리셋. */
export const REFERRAL_OWNERSHIP_INACTIVE_DAYS = 90;

export const REFERRAL_OWNERSHIP_RESET_POLICY_LINE =
  `${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개가 리셋됩니다.`;

/** 딜러 대시보드 상단 카드용 — 1줄 */
export const REFERRAL_OWNERSHIP_RESET_POLICY_SHORT =
  `${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개 리셋`;
