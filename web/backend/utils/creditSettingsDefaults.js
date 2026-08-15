// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// change-log:
// - 2026-08-15: 특별 공급가 CNC/환봉 × 생산만·디자인+생산 정규화. 의뢰자 로드 시 단가 오버라이드.
import { Types } from "mongoose";
import SystemSettings from "../models/systemSettings.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  pickAbutsAbutmentCreditPrices,
  normalizeAbutsAbutmentCreditPrices,
  resolveAbutsAbutmentPricingTier,
} from "./abutsAbutmentService.js";

const SCHEMA_DEFAULTS = (() => {
  const pickDefault = (path) =>
    Number(SystemSettings.schema.path(path)?.options?.default ?? 0) || 0;

  return {
    minCreditForRequest: pickDefault("creditSettings.minCreditForRequest"),
    shippingFee: pickDefault("creditSettings.shippingFee"),
    expressFee: pickDefault("creditSettings.expressFee"),
    designFee: pickDefault("creditSettings.designFee"),
    abutmentRetailPrice: pickDefault("creditSettings.abutmentRetailPrice"),
    practiceMembershipMonthlyFee: pickDefault(
      "creditSettings.practiceMembershipMonthlyFee",
    ),
    defaultRequestFreeCredit: pickDefault(
      "creditSettings.defaultRequestFreeCredit",
    ),
    defaultShippingFreeCredit: pickDefault(
      "creditSettings.defaultShippingFreeCredit",
    ),
    membershipProductionPrice: pickDefault(
      "creditSettings.membershipProductionPrice",
    ),
    regularProductionPrice: pickDefault("creditSettings.regularProductionPrice"),
    membershipDesignAndProductionPrice: pickDefault(
      "creditSettings.membershipDesignAndProductionPrice",
    ),
    regularDesignAndProductionPrice: pickDefault(
      "creditSettings.regularDesignAndProductionPrice",
    ),
    membershipRoundBarProductionPrice: pickDefault(
      "creditSettings.membershipRoundBarProductionPrice",
    ),
    regularRoundBarProductionPrice: pickDefault(
      "creditSettings.regularRoundBarProductionPrice",
    ),
    membershipRoundBarDesignAndProductionPrice: pickDefault(
      "creditSettings.membershipRoundBarDesignAndProductionPrice",
    ),
    regularRoundBarDesignAndProductionPrice: pickDefault(
      "creditSettings.regularRoundBarDesignAndProductionPrice",
    ),
  };
})();

export function normalizeSpecialRequestorPrice(item = {}, fallback = {}) {
  const requestorAnchorId = String(item?.requestorAnchorId || "").trim();
  const productionPrice = Math.max(
    0,
    Number(item?.productionPrice ?? item?.amount) || 0,
  );
  const legacyDesignFee = Math.max(
    0,
    Number(fallback.designFee) ||
      (Number(fallback.membershipDesignAndProductionPrice) || 0) -
        (Number(fallback.membershipProductionPrice) || 0),
  );
  const hasExplicitDesign = item?.designAndProductionPrice != null;
  const designAndProductionPrice = Math.max(
    0,
    Number(
      hasExplicitDesign
        ? item.designAndProductionPrice
        : productionPrice + legacyDesignFee,
    ) || 0,
  );
  const hasExplicitRoundProduction = item?.roundBarProductionPrice != null;
  const hasExplicitRoundDesign =
    item?.roundBarDesignAndProductionPrice != null;
  const roundBarProductionPrice = Math.max(
    0,
    Number(
      hasExplicitRoundProduction
        ? item.roundBarProductionPrice
        : (fallback.membershipRoundBarProductionPrice ?? 0),
    ) || 0,
  );
  const roundBarDesignAndProductionPrice = Math.max(
    0,
    Number(
      hasExplicitRoundDesign
        ? item.roundBarDesignAndProductionPrice
        : (fallback.membershipRoundBarDesignAndProductionPrice ?? 0),
    ) || 0,
  );
  return {
    requestorAnchorId,
    amount: productionPrice,
    productionPrice,
    designAndProductionPrice,
    roundBarProductionPrice,
    roundBarDesignAndProductionPrice,
  };
}

export function findSpecialRequestorPrice(creditSettings, requestorOrgId) {
  const id = String(requestorOrgId || "").trim();
  if (!id) return null;
  const list = Array.isArray(creditSettings?.specialRequestorPrices)
    ? creditSettings.specialRequestorPrices
    : [];
  return (
    list.find((item) => String(item?.requestorAnchorId || "") === id) || null
  );
}

/** 특별 공급가가 있으면 CNC/환봉 단가를 멤버십·일반 모두 동일 금액으로 덮어쓴다. */
export function applySpecialRequestorPricesToCreditSettings(
  creditSettings,
  requestorOrgId,
) {
  const special = findSpecialRequestorPrice(creditSettings, requestorOrgId);
  if (!special) return creditSettings;
  const productionPrice = Math.max(0, Number(special.productionPrice) || 0);
  const designAndProductionPrice = Math.max(
    0,
    Number(special.designAndProductionPrice) || 0,
  );
  const roundBarProductionPrice = Math.max(
    0,
    Number(special.roundBarProductionPrice) || 0,
  );
  const roundBarDesignAndProductionPrice = Math.max(
    0,
    Number(special.roundBarDesignAndProductionPrice) || 0,
  );
  return {
    ...creditSettings,
    minCreditForRequest: productionPrice,
    designFee: Math.max(0, designAndProductionPrice - productionPrice),
    membershipProductionPrice: productionPrice,
    regularProductionPrice: productionPrice,
    membershipDesignAndProductionPrice: designAndProductionPrice,
    regularDesignAndProductionPrice: designAndProductionPrice,
    membershipRoundBarProductionPrice: roundBarProductionPrice,
    regularRoundBarProductionPrice: roundBarProductionPrice,
    membershipRoundBarDesignAndProductionPrice:
      roundBarDesignAndProductionPrice,
    regularRoundBarDesignAndProductionPrice:
      roundBarDesignAndProductionPrice,
  };
}

export function normalizeLoadedCreditSettings(creditSettings = {}) {
  const abutmentPrices = normalizeAbutsAbutmentCreditPrices({
    ...SCHEMA_DEFAULTS,
    ...creditSettings,
  });
  const membership = pickAbutsAbutmentCreditPrices(abutmentPrices, "membership");
  const withRoundBar = {
    ...abutmentPrices,
    membershipRoundBarProductionPrice: Number(
      creditSettings.membershipRoundBarProductionPrice ??
        SCHEMA_DEFAULTS.membershipRoundBarProductionPrice,
    ),
    regularRoundBarProductionPrice: Number(
      creditSettings.regularRoundBarProductionPrice ??
        SCHEMA_DEFAULTS.regularRoundBarProductionPrice,
    ),
    membershipRoundBarDesignAndProductionPrice: Number(
      creditSettings.membershipRoundBarDesignAndProductionPrice ??
        SCHEMA_DEFAULTS.membershipRoundBarDesignAndProductionPrice,
    ),
    regularRoundBarDesignAndProductionPrice: Number(
      creditSettings.regularRoundBarDesignAndProductionPrice ??
        SCHEMA_DEFAULTS.regularRoundBarDesignAndProductionPrice,
    ),
  };
  return {
    minCreditForRequest: membership.productionPrice,
    specialRequestorPrices: Array.isArray(creditSettings.specialRequestorPrices)
      ? creditSettings.specialRequestorPrices
          .map((item) => normalizeSpecialRequestorPrice(item, withRoundBar))
          .filter((item) => item.requestorAnchorId)
      : [],
    shippingFee: Number(creditSettings.shippingFee ?? SCHEMA_DEFAULTS.shippingFee),
    expressFee: Number(
      creditSettings.expressFee ?? SCHEMA_DEFAULTS.expressFee,
    ),
    designFee: membership.designFeePerTooth,
    abutmentRetailPrice: Number(
      creditSettings.abutmentRetailPrice ?? SCHEMA_DEFAULTS.abutmentRetailPrice,
    ),
    practiceMembershipMonthlyFee: Number(
      creditSettings.practiceMembershipMonthlyFee ??
        SCHEMA_DEFAULTS.practiceMembershipMonthlyFee,
    ),
    defaultRequestFreeCredit: Number(
      creditSettings.defaultRequestFreeCredit ??
        SCHEMA_DEFAULTS.defaultRequestFreeCredit,
    ),
    // 환영 배송 분리 지급 폐기. 로드 시에도 0으로 정규화.
    defaultShippingFreeCredit: 0,
    ...withRoundBar,
  };
}

export async function resolveRequestorAbutmentPricingTier(requestorOrgId) {
  const id = String(requestorOrgId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return "regular";
  const anchor = await BusinessAnchor.findById(id)
    .select({ requestorKind: 1, practiceMembershipActive: 1 })
    .lean();
  if (String(anchor?.requestorKind || "").trim() !== "practice") {
    return "regular";
  }
  return resolveAbutsAbutmentPricingTier({
    practiceMembershipActive: Boolean(anchor?.practiceMembershipActive),
  });
}

export async function loadCreditSettingsDefaults(options = {}) {
  const doc = await SystemSettings.findOne({ key: "global" }).lean();
  const base = normalizeLoadedCreditSettings(doc?.creditSettings || {});
  const requestorOrgId = options?.requestorOrgId;
  if (!requestorOrgId) return base;

  const withSpecial = applySpecialRequestorPricesToCreditSettings(
    base,
    requestorOrgId,
  );
  const pricingTier =
    await resolveRequestorAbutmentPricingTier(requestorOrgId);
  const picked = pickAbutsAbutmentCreditPrices(withSpecial, pricingTier);
  return {
    ...withSpecial,
    minCreditForRequest: picked.productionPrice,
    designFee: picked.designFeePerTooth,
    abutmentPricingTier: picked.pricingTier,
  };
}

export { SCHEMA_DEFAULTS as CREDIT_SETTINGS_SCHEMA_DEFAULTS };
