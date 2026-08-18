// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// change-log:
// - 2026-08-17: practiceRushFeeMultiplier(기공의뢰 신속처리 할증) 추가.
// - 2026-08-18: CNC 분배 비율 멤버(60+20+5+15)·일반(60+10+30) 분리.
// - 2026-08-18: CNC 매출 분배 공통 비율(%) — 티어별 금액은 매출×비율로 산출.
// - 2026-08-18: CNC 티어별·특별공급가 항목별 건당 분배 필드.
// - 2026-08-18: salesmanRequestUnitPrice(영업자 건당) 추가.
// - 2026-08-15: 제조사 하청 단가·affiliateVatRate 설정 필드 추가.
// - 2026-08-15: 특별 공급가 CNC/환봉 × 생산만·디자인+생산 정규화. 의뢰자 로드 시 단가 오버라이드.
import { Types } from "mongoose";
import SystemSettings from "../models/systemSettings.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  pickAbutsAbutmentCreditPrices,
  normalizeAbutsAbutmentCreditPrices,
  resolveAbutsAbutmentPricingTier,
} from "./abutsAbutmentService.js";

const clampPracticeRushFeeMultiplier = (value, fallback = 1.2) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) return fallback;
  return Math.min(2, Math.round(n * 100) / 100);
};

const CNC_TIER_PARTY_PREFIXES = [
  "membershipProduction",
  "regularProduction",
  "membershipDesignAndProduction",
  "regularDesignAndProduction",
];

const PARTY_KINDS = ["Manufacturer", "Salesman", "Devops"];

const CNC_TIER_REVENUE_KEYS = {
  membershipProduction: "membershipProductionPrice",
  regularProduction: "regularProductionPrice",
  membershipDesignAndProduction: "membershipDesignAndProductionPrice",
  regularDesignAndProduction: "regularDesignAndProductionPrice",
};

const CNC_TIER_SHARE_KIND = {
  membershipProduction: "membership",
  regularProduction: "regular",
  membershipDesignAndProduction: "membership",
  regularDesignAndProduction: "regular",
};

function clampSharePercent(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100, Math.round(n * 100) / 100);
}

function readSharePercents(
  creditSettings = {},
  schemaDefaults = SCHEMA_DEFAULTS,
  kind = "membership",
) {
  if (kind === "regular") {
    return {
      manufacturer: clampSharePercent(
        creditSettings.regularManufacturerSharePercent ??
          schemaDefaults.regularManufacturerSharePercent,
        schemaDefaults.regularManufacturerSharePercent,
      ),
      salesman: clampSharePercent(
        creditSettings.regularSalesmanSharePercent ??
          schemaDefaults.regularSalesmanSharePercent,
        schemaDefaults.regularSalesmanSharePercent,
      ),
      devops: clampSharePercent(
        creditSettings.regularDevopsSharePercent ??
          schemaDefaults.regularDevopsSharePercent,
        schemaDefaults.regularDevopsSharePercent,
      ),
    };
  }
  return {
    manufacturer: clampSharePercent(
      creditSettings.manufacturerSharePercent ??
        schemaDefaults.manufacturerSharePercent,
      schemaDefaults.manufacturerSharePercent,
    ),
    salesman: clampSharePercent(
      creditSettings.salesmanSharePercent ?? schemaDefaults.salesmanSharePercent,
      schemaDefaults.salesmanSharePercent,
    ),
    devops: clampSharePercent(
      creditSettings.devopsSharePercent ?? schemaDefaults.devopsSharePercent,
      schemaDefaults.devopsSharePercent,
    ),
  };
}

function allocateRevenueByPercent(revenue, shares) {
  const rev = Math.max(0, Math.round(Number(revenue) || 0));
  return {
    manufacturer: Math.round((rev * shares.manufacturer) / 100),
    salesman: Math.round((rev * shares.salesman) / 100),
    devops: Math.round((rev * shares.devops) / 100),
  };
}

function pickTierPartySchemaDefaults(pickDefault) {
  const out = {};
  for (const prefix of CNC_TIER_PARTY_PREFIXES) {
    for (const kind of PARTY_KINDS) {
      const key = `${prefix}${kind}UnitPrice`;
      out[key] = pickDefault(`creditSettings.${key}`);
    }
  }
  return out;
}

function buildNormalizedTierPartyFields(creditSettings = {}, schemaDefaults = {}) {
  const merged = { ...schemaDefaults, ...creditSettings };
  const out = {};
  for (const prefix of CNC_TIER_PARTY_PREFIXES) {
    const revenueKey = CNC_TIER_REVENUE_KEYS[prefix];
    const shares = readSharePercents(
      merged,
      schemaDefaults,
      CNC_TIER_SHARE_KIND[prefix],
    );
    const party = allocateRevenueByPercent(merged[revenueKey], shares);
    out[`${prefix}ManufacturerUnitPrice`] = party.manufacturer;
    out[`${prefix}SalesmanUnitPrice`] = party.salesman;
    out[`${prefix}DevopsUnitPrice`] = party.devops;
  }
  return out;
}

const SCHEMA_DEFAULTS = (() => {
  const pickDefault = (path) =>
    Number(SystemSettings.schema.path(path)?.options?.default ?? 0) || 0;

  return {
    minCreditForRequest: pickDefault("creditSettings.minCreditForRequest"),
    shippingFee: pickDefault("creditSettings.shippingFee"),
    manufacturerRequestUnitPrice: pickDefault(
      "creditSettings.manufacturerRequestUnitPrice",
    ),
    devopsRequestUnitPrice: pickDefault("creditSettings.devopsRequestUnitPrice"),
    salesmanRequestUnitPrice: pickDefault("creditSettings.salesmanRequestUnitPrice"),
    manufacturerShippingUnitPrice: pickDefault(
      "creditSettings.manufacturerShippingUnitPrice",
    ),
    affiliateVatRate:
      Number(SystemSettings.schema.path("creditSettings.affiliateVatRate")?.options?.default) ||
      0.1,
    expressFee: pickDefault("creditSettings.expressFee"),
    practiceRushFeeMultiplier:
      Number(
        SystemSettings.schema.path("creditSettings.practiceRushFeeMultiplier")
          ?.options?.default,
      ) || 1.2,
    designFee: pickDefault("creditSettings.designFee"),
    abutmentDesignLabFee: pickDefault("creditSettings.abutmentDesignLabFee"),
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
    manufacturerSharePercent: pickDefault("creditSettings.manufacturerSharePercent"),
    salesmanSharePercent: pickDefault("creditSettings.salesmanSharePercent"),
    devopsSharePercent: pickDefault("creditSettings.devopsSharePercent"),
    regularManufacturerSharePercent: pickDefault(
      "creditSettings.regularManufacturerSharePercent",
    ),
    regularSalesmanSharePercent: pickDefault(
      "creditSettings.regularSalesmanSharePercent",
    ),
    regularDevopsSharePercent: pickDefault(
      "creditSettings.regularDevopsSharePercent",
    ),
    ...pickTierPartySchemaDefaults(pickDefault),
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
  const shares = readSharePercents(fallback, SCHEMA_DEFAULTS, "membership");
  const productionParty = allocateRevenueByPercent(productionPrice, shares);
  const designParty = allocateRevenueByPercent(
    designAndProductionPrice,
    shares,
  );
  const productionManufacturerUnitPrice = productionParty.manufacturer;
  const productionSalesmanUnitPrice = productionParty.salesman;
  const productionDevopsUnitPrice = productionParty.devops;
  const designAndProductionManufacturerUnitPrice = designParty.manufacturer;
  const designAndProductionSalesmanUnitPrice = designParty.salesman;
  const designAndProductionDevopsUnitPrice = designParty.devops;
  return {
    requestorAnchorId,
    amount: productionPrice,
    productionPrice,
    designAndProductionPrice,
    roundBarProductionPrice,
    roundBarDesignAndProductionPrice,
    manufacturerRequestUnitPrice: productionManufacturerUnitPrice,
    devopsRequestUnitPrice: productionDevopsUnitPrice,
    salesmanRequestUnitPrice: productionSalesmanUnitPrice,
    productionManufacturerUnitPrice,
    productionSalesmanUnitPrice,
    productionDevopsUnitPrice,
    designAndProductionManufacturerUnitPrice,
    designAndProductionSalesmanUnitPrice,
    designAndProductionDevopsUnitPrice,
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
  const overlaid = {
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
  return {
    ...overlaid,
    ...buildNormalizedTierPartyFields(overlaid, SCHEMA_DEFAULTS),
  };
}

export function normalizeLoadedCreditSettings(creditSettings = {}) {
  const abutmentPrices = normalizeAbutsAbutmentCreditPrices({
    ...SCHEMA_DEFAULTS,
    ...creditSettings,
  });
  const membership = pickAbutsAbutmentCreditPrices(abutmentPrices, "membership");
  const membershipShares = readSharePercents(
    creditSettings,
    SCHEMA_DEFAULTS,
    "membership",
  );
  const regularShares = readSharePercents(
    creditSettings,
    SCHEMA_DEFAULTS,
    "regular",
  );
  const withRoundBar = {
    ...abutmentPrices,
    ...buildNormalizedTierPartyFields(creditSettings, SCHEMA_DEFAULTS),
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
    manufacturerRequestUnitPrice: Number(
      withRoundBar.membershipProductionManufacturerUnitPrice ??
        SCHEMA_DEFAULTS.manufacturerRequestUnitPrice,
    ),
    devopsRequestUnitPrice: Number(
      withRoundBar.membershipProductionDevopsUnitPrice ??
        SCHEMA_DEFAULTS.devopsRequestUnitPrice,
    ),
    salesmanRequestUnitPrice: Number(
      withRoundBar.membershipProductionSalesmanUnitPrice ??
        SCHEMA_DEFAULTS.salesmanRequestUnitPrice,
    ),
    manufacturerShippingUnitPrice: Number(
      creditSettings.manufacturerShippingUnitPrice ??
        SCHEMA_DEFAULTS.manufacturerShippingUnitPrice,
    ),
    affiliateVatRate: (() => {
      const raw = Number(
        creditSettings.affiliateVatRate ?? SCHEMA_DEFAULTS.affiliateVatRate,
      );
      if (!Number.isFinite(raw) || raw < 0) return SCHEMA_DEFAULTS.affiliateVatRate;
      return Math.min(1, raw);
    })(),
    expressFee: Number(
      creditSettings.expressFee ?? SCHEMA_DEFAULTS.expressFee,
    ),
    practiceRushFeeMultiplier: clampPracticeRushFeeMultiplier(
      creditSettings.practiceRushFeeMultiplier ??
        SCHEMA_DEFAULTS.practiceRushFeeMultiplier,
      SCHEMA_DEFAULTS.practiceRushFeeMultiplier,
    ),
    designFee: membership.designFeePerTooth,
    abutmentDesignLabFee: Math.max(
      0,
      Number(
        creditSettings.abutmentDesignLabFee ??
          SCHEMA_DEFAULTS.abutmentDesignLabFee,
      ) || 0,
    ),
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
    manufacturerSharePercent: membershipShares.manufacturer,
    salesmanSharePercent: membershipShares.salesman,
    devopsSharePercent: membershipShares.devops,
    regularManufacturerSharePercent: regularShares.manufacturer,
    regularSalesmanSharePercent: regularShares.salesman,
    regularDevopsSharePercent: regularShares.devops,
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
  const membership = pricingTier === "membership";
  return {
    ...withSpecial,
    minCreditForRequest: picked.productionPrice,
    designFee: picked.designFeePerTooth,
    abutmentPricingTier: picked.pricingTier,
    manufacturerRequestUnitPrice: Number(
      membership
        ? withSpecial.membershipProductionManufacturerUnitPrice
        : withSpecial.regularProductionManufacturerUnitPrice,
    ),
    salesmanRequestUnitPrice: Number(
      membership
        ? withSpecial.membershipProductionSalesmanUnitPrice
        : withSpecial.regularProductionSalesmanUnitPrice,
    ),
    devopsRequestUnitPrice: Number(
      membership
        ? withSpecial.membershipProductionDevopsUnitPrice
        : withSpecial.regularProductionDevopsUnitPrice,
    ),
  };
}

export { SCHEMA_DEFAULTS as CREDIT_SETTINGS_SCHEMA_DEFAULTS };
