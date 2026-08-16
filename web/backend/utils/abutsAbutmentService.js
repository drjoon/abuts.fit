// related files:
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/services/practiceTransferBilling.service.js
// change-log:
// - 2026-08-17: splitAbutmentRetailForRouteHolds — 신속처리 배수 시 디자인/생산 분해 정합.
// - 2026-08-14: 환봉 단가 필드 + resolveAbutsAbutmentUnitPrice(kind=round_bar).
// - 2026-08-13: creditSettings 멤버십/일반 생산·디자인+생산 단가를 우선 사용.
// - 2026-08-13: 치과 기공의뢰 커스텀어벗은 기공소 수가가 아니라 어벗츠 멤버십/일반 단가.

export const ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE = 15_000;
export const ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE = 20_000;
export const ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE = 25_000;
export const ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE = 40_000;

const toWon = (value, fallback) => {
  const n = Math.round(Number(value ?? fallback));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function normalizeAbutsAbutmentCreditPrices(creditSettings = {}) {
  return {
    membershipProductionPrice: toWon(
      creditSettings.membershipProductionPrice ??
        creditSettings.minCreditForRequest,
      ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
    ),
    regularProductionPrice: toWon(
      creditSettings.regularProductionPrice,
      ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
    ),
    membershipDesignAndProductionPrice: toWon(
      creditSettings.membershipDesignAndProductionPrice,
      ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
    ),
    regularDesignAndProductionPrice: toWon(
      creditSettings.regularDesignAndProductionPrice,
      ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
    ),
    membershipRoundBarProductionPrice: toWon(
      creditSettings.membershipRoundBarProductionPrice,
      0,
    ),
    regularRoundBarProductionPrice: toWon(
      creditSettings.regularRoundBarProductionPrice,
      0,
    ),
    membershipRoundBarDesignAndProductionPrice: toWon(
      creditSettings.membershipRoundBarDesignAndProductionPrice,
      0,
    ),
    regularRoundBarDesignAndProductionPrice: toWon(
      creditSettings.regularRoundBarDesignAndProductionPrice,
      0,
    ),
  };
}

export function pickAbutsAbutmentCreditPrices(
  creditSettings = {},
  pricingTier = "regular",
) {
  const prices = normalizeAbutsAbutmentCreditPrices(creditSettings);
  const membership = pricingTier === "membership";
  const productionPrice = membership
    ? prices.membershipProductionPrice
    : prices.regularProductionPrice;
  const designAndProductionPrice = membership
    ? prices.membershipDesignAndProductionPrice
    : prices.regularDesignAndProductionPrice;
  return {
    ...prices,
    productionPrice,
    designAndProductionPrice,
    designFeePerTooth: Math.max(0, designAndProductionPrice - productionPrice),
    pricingTier: membership ? "membership" : "regular",
  };
}

export function resolveAbutsAbutmentPricingTier({
  practiceMembershipActive = false,
} = {}) {
  return Boolean(practiceMembershipActive) ? "membership" : "regular";
}

export function resolveAbutsAbutmentUnitPrice({
  productMode,
  pricingTier,
  prices,
  kind,
} = {}) {
  const isDesign = String(productMode || "").trim() === "design_custom_abutment";
  const membership = String(pricingTier || "").trim() === "membership";
  const normalized = normalizeAbutsAbutmentCreditPrices(prices || {});
  if (String(kind || "").trim() === "round_bar") {
    return Math.max(
      0,
      isDesign
        ? membership
          ? normalized.membershipRoundBarDesignAndProductionPrice
          : normalized.regularRoundBarDesignAndProductionPrice
        : membership
          ? normalized.membershipRoundBarProductionPrice
          : normalized.regularRoundBarProductionPrice,
    );
  }
  const picked = pickAbutsAbutmentCreditPrices(normalized, pricingTier);
  return isDesign ? picked.designAndProductionPrice : picked.productionPrice;
}

/**
 * 치과 납부 어벗액(디자인+생산)을 보류 경로별로 분해.
 * - 어벗츠몫(치과→어벗츠) = 생산비
 * - 기공소몫(치과→기공소)에 합산 = 디자인비(+지그)
 * rushFeeMultiplier>1 이면 retail이 이미 배수된 금액이므로 디자인·생산 단가도 동일 배수.
 */
export function splitAbutmentRetailForRouteHolds({
  abutmentRetailTotal = 0,
  abutmentQty = 0,
  pricingTier = "regular",
  prices = null,
  designFeePerTooth = null,
  rushFeeMultiplier = 1,
} = {}) {
  const retail = Math.max(0, Math.round(Number(abutmentRetailTotal || 0)));
  const qty = Math.max(0, Math.round(Number(abutmentQty || 0)));
  if (retail <= 0) {
    return { productionTotal: 0, designFeeTotal: 0 };
  }
  if (qty <= 0) {
    return { productionTotal: retail, designFeeTotal: 0 };
  }

  const rushRaw = Number(rushFeeMultiplier);
  const rush =
    Number.isFinite(rushRaw) && rushRaw > 1
      ? Math.min(2, Math.round(rushRaw * 100) / 100)
      : 1;
  const scale = (n) =>
    rush > 1 ? Math.max(0, Math.round(Number(n || 0) * rush)) : Math.max(0, Math.round(Number(n || 0)));

  const picked = pickAbutsAbutmentCreditPrices(prices || {}, pricingTier);
  const designUnitBase = Math.max(
    0,
    Math.round(
      Number(
        designFeePerTooth != null
          ? designFeePerTooth
          : picked.designFeePerTooth || 0,
      ) || 0,
    ),
  );
  const productionUnitBase = Math.max(
    0,
    Math.round(Number(picked.productionPrice || 0)),
  );
  const designUnit = scale(designUnitBase);
  const productionUnit = scale(productionUnitBase);
  const unit = Math.round(retail / qty);

  // 생산가만 청구된 경우(디자인+생산 아님) — 전액 어벗츠몫
  if (designUnitBase <= 0 || unit <= productionUnit) {
    return { productionTotal: retail, designFeeTotal: 0 };
  }

  const designFeeTotal = Math.min(retail, designUnit * qty);
  return {
    productionTotal: Math.max(0, retail - designFeeTotal),
    designFeeTotal,
  };
}
