// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
// - web/frontend/src/features/commission/CommissionPaymentsPage.tsx
/** 딜러 영업 수수료·소개 귀속 카피 SSOT. */
export const REFERRAL_OWNERSHIP_INACTIVE_DAYS = 90;

export const DEALERSHIP_BAND_MIN_PCT = 10;
export const DEALERSHIP_BAND_MAX_PCT = 20;
export const DEALERSHIP_BAND_RANGE_LABEL = `${DEALERSHIP_BAND_MIN_PCT}~${DEALERSHIP_BAND_MAX_PCT}%`;

/** 커스텀어벗만. 스토어(심플웨이) 지급 없음. */
export const DEALERSHIP_CUMULATIVE_BAND_LINE = `${DEALERSHIP_BAND_RANGE_LABEL} 누적 구간`;

/** 딜러 대시보드 계약 카드 */
export const DEALERSHIP_DASHBOARD_BAND_LINE = `${DEALERSHIP_BAND_RANGE_LABEL} 누적 구간 차등 분배`;

/** 정산 규칙 모달 부제. 본문 표와 겹치지 않게 짧게. */
export const DEALERSHIP_SETTLEMENT_RULE_DIALOG_LEAD = "커스텀어벗";

export const DEALERSHIP_SETTLEMENT_RULE_SUMMARY = `커스텀어벗 ${DEALERSHIP_CUMULATIVE_BAND_LINE} · ${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개 코드 리셋 · 부가세 포함·세금계산서`;

export const REFERRAL_OWNERSHIP_RESET_POLICY_LINE =
  `${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개 코드가 리셋됩니다.`;

export const REFERRAL_OWNERSHIP_RESET_ANYONE_LINE =
  "누구든 다시 영업할 수 있습니다.";

/** 딜러 대시보드 카드 */
export const REFERRAL_OWNERSHIP_RESET_POLICY_SHORT =
  `${REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 소개 코드 리셋`;

export const REFERRAL_OWNERSHIP_RESET_ANYONE_SHORT = "누구든 다시 영업 가능";
