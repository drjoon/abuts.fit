// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
// - web/frontend/src/features/commission/CommissionPaymentsPage.tsx
/** 딜러 영업 수수료·소개 귀속 카피 SSOT. */
export const REFERRAL_OWNERSHIP_INACTIVE_DAYS = 90;

/** 딜러 수수료 = 거래처 판매가(1.2~1.5만) − 1만원(부가세 포함). 누적 구간 폐지(2026-10-08). */
export const DEALERSHIP_BAND_RANGE_LABEL = "판매가 − 1만원";

export const DEALERSHIP_CUMULATIVE_BAND_LINE = "거래처 판매가 − 1만원(부가세 포함)";

/** 딜러 대시보드 계약 카드 */
export const DEALERSHIP_DASHBOARD_BAND_LINE = "거래처 판매가 − 1만원";

/** 정산 규칙 모달 부제. */
export const DEALERSHIP_SETTLEMENT_RULE_DIALOG_LEAD = "커스텀어벗 · 거래처별 판매가";

export const DEALERSHIP_SETTLEMENT_RULE_SUMMARY = `딜러 수수료는 ${DEALERSHIP_CUMULATIVE_BAND_LINE} · 딜리버리 월정액은 딜러 부담 · ${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개 코드 리셋`;

export const REFERRAL_OWNERSHIP_RESET_POLICY_LINE =
  `${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개 코드가 리셋됩니다.`;

export const REFERRAL_OWNERSHIP_RESET_ANYONE_LINE =
  "누구든 다시 영업할 수 있습니다.";

/** 딜러 대시보드 카드 */
export const REFERRAL_OWNERSHIP_RESET_POLICY_SHORT =
  `${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개 코드 리셋`;

export const REFERRAL_OWNERSHIP_RESET_ANYONE_SHORT = "누구든 다시 영업 가능";
