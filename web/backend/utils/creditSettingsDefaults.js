import SystemSettings from "../models/systemSettings.model.js";

const SCHEMA_DEFAULTS = (() => {
  const pickDefault = (path) =>
    Number(SystemSettings.schema.path(path)?.options?.default ?? 0) || 0;
  return {
    minCreditForRequest: pickDefault("creditSettings.minCreditForRequest"),
    shippingFee: pickDefault("creditSettings.shippingFee"),
    defaultWelcomeBonusCredit: pickDefault(
      "creditSettings.defaultWelcomeBonusCredit",
    ),
    defaultFreeShippingCredit: pickDefault(
      "creditSettings.defaultFreeShippingCredit",
    ),
  };
})();

export async function loadCreditSettingsDefaults() {
  const doc = await SystemSettings.findOne({ key: "global" }).lean();
  return {
    ...SCHEMA_DEFAULTS,
    ...(doc?.creditSettings || {}),
  };
}

export { SCHEMA_DEFAULTS as CREDIT_SETTINGS_SCHEMA_DEFAULTS };
