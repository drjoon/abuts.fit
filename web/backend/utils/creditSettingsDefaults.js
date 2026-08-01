// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import SystemSettings from "../models/systemSettings.model.js";

const SCHEMA_DEFAULTS = (() => {
  const pickDefault = (path) =>
    Number(SystemSettings.schema.path(path)?.options?.default ?? 0) || 0;
  const defaultRequestFreeCredit = pickDefault(
    "creditSettings.defaultRequestFreeCredit",
  );
  const defaultShippingFreeCredit = pickDefault(
    "creditSettings.defaultShippingFreeCredit",
  );

  return {
    minCreditForRequest: pickDefault("creditSettings.minCreditForRequest"),
    shippingFee: pickDefault("creditSettings.shippingFee"),
    defaultRequestFreeCredit,
    defaultShippingFreeCredit,
    defaultWelcomeBonusCredit: defaultRequestFreeCredit, // legacy 호환 (앱 안정화 후 삭제 예정)
    defaultFreeShippingCredit: defaultShippingFreeCredit, // legacy 호환 (앱 안정화 후 삭제 예정)
  };
})();

export async function loadCreditSettingsDefaults() {
  const doc = await SystemSettings.findOne({ key: "global" }).lean();
  const creditSettings = doc?.creditSettings || {};

  const defaultRequestFreeCredit = Number(
    creditSettings.defaultRequestFreeCredit ??
      creditSettings.defaultWelcomeBonusCredit ??
      SCHEMA_DEFAULTS.defaultRequestFreeCredit,
  );
  const defaultShippingFreeCredit = Number(
    creditSettings.defaultShippingFreeCredit ??
      creditSettings.defaultFreeShippingCredit ??
      SCHEMA_DEFAULTS.defaultShippingFreeCredit,
  );

  return {
    minCreditForRequest: Number(
      creditSettings.minCreditForRequest ?? SCHEMA_DEFAULTS.minCreditForRequest,
    ),
    shippingFee: Number(creditSettings.shippingFee ?? SCHEMA_DEFAULTS.shippingFee),
    defaultRequestFreeCredit,
    defaultShippingFreeCredit,
    defaultWelcomeBonusCredit: defaultRequestFreeCredit, // legacy 호환 (앱 안정화 후 삭제 예정)
    defaultFreeShippingCredit: defaultShippingFreeCredit, // legacy 호환 (앱 안정화 후 삭제 예정)
  };
}

export { SCHEMA_DEFAULTS as CREDIT_SETTINGS_SCHEMA_DEFAULTS };
