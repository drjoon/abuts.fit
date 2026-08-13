// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import SystemSettings from "../models/systemSettings.model.js";

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
  };
})();

export async function loadCreditSettingsDefaults() {
  const doc = await SystemSettings.findOne({ key: "global" }).lean();
  const creditSettings = doc?.creditSettings || {};

  return {
    minCreditForRequest: Number(
      creditSettings.minCreditForRequest ?? SCHEMA_DEFAULTS.minCreditForRequest,
    ),
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
    designFee: Number(creditSettings.designFee ?? SCHEMA_DEFAULTS.designFee),
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
    defaultShippingFreeCredit: Number(
      creditSettings.defaultShippingFreeCredit ??
        SCHEMA_DEFAULTS.defaultShippingFreeCredit,
    ),
  };
}

export { SCHEMA_DEFAULTS as CREDIT_SETTINGS_SCHEMA_DEFAULTS };
