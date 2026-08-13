// related files:
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/backend/utils/labFeeSchedule.js
// - web/backend/services/practiceTransferBilling.service.js
// change-log:
// - 2026-08-13: 치과 기공의뢰 커스텀어벗은 기공소 수가가 아니라 어벗츠 멤버십/일반 단가.

export const ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE = 15_000;
export const ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE = 20_000;
export const ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE = 25_000;
export const ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE = 40_000;

export function resolveAbutsAbutmentPricingTier({
  practiceMembershipActive = false,
} = {}) {
  return Boolean(practiceMembershipActive) ? "membership" : "regular";
}

export function resolveAbutsAbutmentUnitPrice({
  productMode,
  pricingTier,
} = {}) {
  const isDesign = String(productMode || "").trim() === "design_custom_abutment";
  const membership = pricingTier === "membership";
  if (isDesign) {
    return membership
      ? ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE
      : ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE;
  }
  return membership
    ? ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
    : ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE;
}
