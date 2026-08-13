// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/hooks/useSystemSettings.ts
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - .cursor/rules/design-fee.mdc
// change-log:
// - 2026-08-13: 멤버십/일반 단가 + 치과 월 구독료(기본 55,000) SSOT.

export const ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE = 15_000;
export const ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE = 25_000;
export const ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE = 20_000;
export const ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE = 35_000;

/** @deprecated 멤버십 생산 단가. MEMBERSHIP_PRODUCTION 사용 */
export const ABUTS_ABUTMENT_PRODUCTION_LIST_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;
/** @deprecated 멤버십 디자인+생산 단가. MEMBERSHIP_DESIGN_AND_PRODUCTION 사용 */
export const ABUTS_ABUTMENT_DESIGN_AND_PRODUCTION_LIST_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE;
export const ABUTS_ABUTMENT_DESIGN_LIST_FEE =
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE -
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;

export const ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT = 55_000;

export const ABUTS_ABUTMENT_SERVICE_SHIPPING_NOTE = "배송비 별도, 박스당 과금";
export const ABUTS_ABUTMENT_SERVICE_TAX_NOTE = "부가세 없음";
export const ABUTS_PRACTICE_MEMBERSHIP_SCOPE_NOTE = "멤버십은 치과만 적용";

export const formatAbutsAbutmentServiceWon = (value: number) =>
  `${Math.max(0, Math.round(Number(value || 0))).toLocaleString("ko-KR")}원`;

export const formatAbutsManwon = (value: number) => {
  const man = Math.max(0, Number(value || 0)) / 10_000;
  const text = Number.isInteger(man)
    ? String(man)
    : man.toFixed(1).replace(/\.0$/, "");
  return `${text}만원`;
};
