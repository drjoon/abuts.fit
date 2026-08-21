// related files:
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/services/practiceTransferBilling.service.js
// change-log:
// - 2026-08-22: 치과 멤버십/일반 이중가 제거. 청구는 membership* 단일 고시. pricingTier 분기 삭제.
// - 2026-08-17: splitAbutmentRetailForRouteHolds — 신속처리 배수 시 디자인/생산 분해 정합.
// - 2026-08-14: 환봉 단가 필드 + resolveAbutsAbutmentUnitPrice(kind=round_bar).
// - 2026-08-13: creditSettings 멤버십/일반 생산·디자인+생산 단가를 우선 사용.
// - 2026-08-19: 치과 멤버십 폐지. 플랫폼 고시 단가(membership* 필드)만 사용.

/**
 * 커스텀어벗 청구 단가 SSOT (플랫폼 고시).
 * DB/설정 키는 레거시명 `membership*` 을 유지한다(마이그레이션 없음).
 * `regular*` 는 관리자「멤버/일반」딜러 유무 분배 키이며 치과 청구에 쓰지 않는다.
 */
export const ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE = 15_000;
export const ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE = 25_000;

/** @deprecated 청구 단일가. MEMBERSHIP_PRODUCTION 과 동일(레거시 일반가 2만 폐기). */
export const ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;
/** @deprecated 청구 단일가. MEMBERSHIP_DESIGN_AND_PRODUCTION 과 동일. */
export const ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE;

const toWon = (value, fallback) => {
  const n = Math.round(Number(value ?? fallback));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function normalizeAbutsAbutmentCreditPrices(creditSettings = {}) {
  const productionPrice = toWon(
    creditSettings.membershipProductionPrice ??
      creditSettings.minCreditForRequest,
    ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  );
  const designAndProductionPrice = toWon(
    creditSettings.membershipDesignAndProductionPrice,
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  );
  const roundBarProductionPrice = toWon(
    creditSettings.membershipRoundBarProductionPrice,
    0,
  );
  const roundBarDesignAndProductionPrice = toWon(
    creditSettings.membershipRoundBarDesignAndProductionPrice,
    0,
  );
  // regular*: 딜러분배(무딜러) 설정값 — 청구 fallback 으로는 membership* 와 동일하게 맞춤.
  return {
    membershipProductionPrice: productionPrice,
    regularProductionPrice: toWon(
      creditSettings.regularProductionPrice,
      productionPrice,
    ),
    membershipDesignAndProductionPrice: designAndProductionPrice,
    regularDesignAndProductionPrice: toWon(
      creditSettings.regularDesignAndProductionPrice,
      designAndProductionPrice,
    ),
    membershipRoundBarProductionPrice: roundBarProductionPrice,
    regularRoundBarProductionPrice: toWon(
      creditSettings.regularRoundBarProductionPrice,
      roundBarProductionPrice,
    ),
    membershipRoundBarDesignAndProductionPrice: roundBarDesignAndProductionPrice,
    regularRoundBarDesignAndProductionPrice: toWon(
      creditSettings.regularRoundBarDesignAndProductionPrice,
      roundBarDesignAndProductionPrice,
    ),
  };
}

/**
 * 청구용 단가. 치과 멤버십 폐지 후 항상 플랫폼 고시(membership*).
 * @param {object} [creditSettings]
 * @param {string} [_pricingTier] 무시(레거시 호출 호환).
 */
export function pickAbutsAbutmentCreditPrices(
  creditSettings = {},
  _pricingTier = "membership",
) {
  void _pricingTier;
  const prices = normalizeAbutsAbutmentCreditPrices(creditSettings);
  const productionPrice = prices.membershipProductionPrice;
  const designAndProductionPrice = prices.membershipDesignAndProductionPrice;
  return {
    ...prices,
    productionPrice,
    designAndProductionPrice,
    designFeePerTooth: Math.max(0, designAndProductionPrice - productionPrice),
    // 레거시 스냅샷/응답 호환. 신규 로직는 이 값으로 분기하지 말 것.
    pricingTier: "membership",
  };
}

/**
 * @deprecated 치과 멤버십 폐지. 항상 고시 단일가 — 호출·분기 제거 권장.
 */
export function resolveAbutsAbutmentPricingTier(_args = {}) {
  void _args;
  return "membership";
}

export function resolveAbutsAbutmentUnitPrice({
  productMode,
  pricingTier: _pricingTier,
  prices,
  kind,
} = {}) {
  void _pricingTier;
  const isDesign = String(productMode || "").trim() === "design_custom_abutment";
  const normalized = normalizeAbutsAbutmentCreditPrices(prices || {});
  if (String(kind || "").trim() === "round_bar") {
    return Math.max(
      0,
      isDesign
        ? normalized.membershipRoundBarDesignAndProductionPrice
        : normalized.membershipRoundBarProductionPrice,
    );
  }
  const picked = pickAbutsAbutmentCreditPrices(normalized);
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
  pricingTier: _pricingTier = "membership",
  prices = null,
  designFeePerTooth = null,
  rushFeeMultiplier = 1,
} = {}) {
  void _pricingTier;
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
    rush > 1
      ? Math.max(0, Math.round(Number(n || 0) * rush))
      : Math.max(0, Math.round(Number(n || 0)));

  const picked = pickAbutsAbutmentCreditPrices(prices || {});
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
