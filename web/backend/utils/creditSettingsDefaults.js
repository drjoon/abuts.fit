// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/controllers/admin/admin.settings.controller.js
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

export function normalizeLoadedCreditSettings(creditSettings = {}) {
  const abutmentPrices = normalizeAbutsAbutmentCreditPrices({
    ...SCHEMA_DEFAULTS,
    ...creditSettings,
  });
  const membership = pickAbutsAbutmentCreditPrices(abutmentPrices, "membership");
  return {
    minCreditForRequest: membership.productionPrice,
    specialRequestorPrices: Array.isArray(creditSettings.specialRequestorPrices)
      ? creditSettings.specialRequestorPrices
          .map((item) => ({
            requestorAnchorId: String(item?.requestorAnchorId || "").trim(),
            amount: Math.max(0, Number(item?.amount) || 0),
          }))
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

  const pricingTier =
    await resolveRequestorAbutmentPricingTier(requestorOrgId);
  const picked = pickAbutsAbutmentCreditPrices(base, pricingTier);
  return {
    ...base,
    minCreditForRequest: picked.productionPrice,
    designFee: picked.designFeePerTooth,
    abutmentPricingTier: picked.pricingTier,
  };
}

export { SCHEMA_DEFAULTS as CREDIT_SETTINGS_SCHEMA_DEFAULTS };
