// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// change-log:
// - 2026-09-23: 런칭 이벤트 on/off 변경 예약(내일 0시 KST).
// - 2026-09-23: 런칭 이벤트 1만 / 정상가 1.3만 · FM덴탈 월정액 배송 설정.
// - 2026-09-20: 의뢰자 BA 판매가 오버라이드. 없으면 플랫폼 판매가. 매입가=그 판매가의 50%.
// - 2026-09-20: 제조사 매입가(포함가) = 커스텀어벗 판매가의 50%.
// - 2026-08-22: 제조사 고정단가(8,800) 선차감 후 잔여 비중 분배(딜러 30:개발 10:어벗츠 40 / 없으면 20:80).
// - 2026-08-22: 치과 멤버십/일반 청구 이중가 제거. membership* 단일 고시. pricingTier 분기 삭제.
// - 2026-08-19: 기공소 오버레이 미설정 폴백을 고시(membership*)로.
// - 2026-08-17: practiceRushFeeMultiplier(기공의뢰 신속처리 할증) 추가.
// - 2026-08-18: CNC 분배 비율 멤버(60+20+5+15)·일반(60+10+30) 분리.
// - 2026-08-18: CNC 매출 분배 공통 비율(%) — 티어별 금액은 매출×비율로 산출.
// - 2026-08-18: CNC 티어별·특별공급가 항목별 건당 분배 필드.
// - 2026-08-18: salesmanRequestUnitPrice(영업자 건당) 추가.
// - 2026-08-15: 제조사 하청 단가·affiliateVatRate 설정 필드 추가.
// - 2026-08-15: 특별 공급가 CNC/환봉 × 생산만·디자인+생산 정규화. 의뢰자 로드 시 단가 오버라이드.
// - 2026-08-19: 치과 멤버십·90일 1만원 폐지. 의뢰단가=플랫폼 membership* 설정.
// - 2026-08-19: global SystemSettings 60초 캐시. requestorAnchor가 있으면 사업자 재조회 생략.
import { Types } from "mongoose";
import SystemSettings from "../models/systemSettings.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  pickAbutsAbutmentCreditPrices,
  normalizeAbutsAbutmentCreditPrices,
  resolveCustomAbutmentProductionPriceForAt,
  ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
} from "./abutsAbutmentService.js";
import {
  manufacturerPurchaseFromSale,
  buildDealershipRateChangeApplyPatch,
  buildDevopsShareChangeApplyPatch,
  buildManufacturerShareChangeApplyPatch,
  buildCustomAbutmentLaunchEventChangeApplyPatch,
  buildStoreManufacturerShareChangeApplyPatch,
  buildStoreDealerRateChangeApplyPatch,
  buildStoreDevopsShareChangeApplyPatch,
  buildLabShareChangeApplyPatch,
} from "../services/creditRevenuePolicy.service.js";

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

const MEMBERSHIP_RESIDUAL_SHARE_PERCENTS = {
  salesman: 20,
  devops: 5,
  abuts: 25,
};

const REGULAR_RESIDUAL_SHARE_PERCENTS = {
  salesman: 0,
  devops: 5,
  abuts: 95,
};

const DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE = 8800;
const DEFAULT_MANUFACTURER_REMAKE_UNIT_PRICE = 6600;

function readResidualSharePercents(
  creditSettings = {},
  schemaDefaults = SCHEMA_DEFAULTS,
  kind = "membership",
) {
  if (kind === "regular") {
    const salesman = clampSharePercent(
      creditSettings.regularSalesmanSharePercent ??
        schemaDefaults.regularSalesmanSharePercent ??
        REGULAR_RESIDUAL_SHARE_PERCENTS.salesman,
      REGULAR_RESIDUAL_SHARE_PERCENTS.salesman,
    );
    const devops = clampSharePercent(
      creditSettings.regularDevopsSharePercent ??
        schemaDefaults.regularDevopsSharePercent ??
        REGULAR_RESIDUAL_SHARE_PERCENTS.devops,
      REGULAR_RESIDUAL_SHARE_PERCENTS.devops,
    );
    const abutsFallback =
      creditSettings.regularAbutsSharePercent != null ||
      schemaDefaults.regularAbutsSharePercent != null
        ? (schemaDefaults.regularAbutsSharePercent ??
          REGULAR_RESIDUAL_SHARE_PERCENTS.abuts)
        : Math.max(0, 100 - salesman - devops);
    return {
      salesman,
      devops,
      abuts: clampSharePercent(
        creditSettings.regularAbutsSharePercent ??
          schemaDefaults.regularAbutsSharePercent ??
          abutsFallback,
        abutsFallback,
      ),
    };
  }
  const salesman = clampSharePercent(
    creditSettings.salesmanSharePercent ??
      schemaDefaults.salesmanSharePercent ??
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
  );
  const devops = clampSharePercent(
    creditSettings.devopsSharePercent ??
      schemaDefaults.devopsSharePercent ??
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
  );
  const abutsFallback =
    creditSettings.abutsSharePercent != null ||
    schemaDefaults.abutsSharePercent != null
      ? (schemaDefaults.abutsSharePercent ?? MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts)
      : Math.max(0, 100 - salesman - devops);
  return {
    salesman,
    devops,
    abuts: clampSharePercent(
      creditSettings.abutsSharePercent ??
        schemaDefaults.abutsSharePercent ??
        abutsFallback,
      abutsFallback,
    ),
  };
}

function readSharePercents(
  creditSettings = {},
  schemaDefaults = SCHEMA_DEFAULTS,
  kind = "membership",
) {
  const residual = readResidualSharePercents(
    creditSettings,
    schemaDefaults,
    kind,
  );
  return {
    manufacturer: 0,
    salesman: residual.salesman,
    devops: residual.devops,
    abuts: residual.abuts,
  };
}

function allocateRevenueByFixedManufacturerAndResidualShares(
  revenue,
  manufacturerUnitPrice,
  residualShares,
) {
  const rev = Math.max(0, Math.round(Number(revenue) || 0));
  const manufacturer = Math.min(
    Math.max(0, Math.round(Number(manufacturerUnitPrice) || 0)),
    rev,
  );
  const residual = Math.max(0, rev - manufacturer);
  const salesmanW = Math.max(0, Number(residualShares.salesman) || 0);
  const devopsW = Math.max(0, Number(residualShares.devops) || 0);
  const abutsW = Math.max(0, Number(residualShares.abuts) || 0);
  const weightSum = salesmanW + devopsW + abutsW;
  if (residual <= 0 || weightSum <= 0) {
    return { manufacturer, salesman: 0, devops: 0 };
  }
  return {
    manufacturer,
    salesman: Math.round((residual * salesmanW) / weightSum),
    devops: Math.round((residual * devopsW) / weightSum),
  };
}

function allocateRevenueByPercent(
  revenue,
  shares,
  manufacturerUnitPrice = DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
) {
  return allocateRevenueByFixedManufacturerAndResidualShares(
    revenue,
    manufacturerUnitPrice,
    {
      salesman: shares.salesman,
      devops: shares.devops,
      abuts: shares.abuts,
    },
  );
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
  const manufacturerUnit = Math.max(
    0,
    Math.round(
      Number(
        merged.manufacturerRequestUnitPrice ??
          DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
      ) || 0,
    ),
  );
  const out = {};
  for (const prefix of CNC_TIER_PARTY_PREFIXES) {
    const revenueKey = CNC_TIER_REVENUE_KEYS[prefix];
    const shares = readSharePercents(
      merged,
      schemaDefaults,
      CNC_TIER_SHARE_KIND[prefix],
    );
    const party = allocateRevenueByPercent(
      merged[revenueKey],
      shares,
      manufacturerUnit,
    );
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
    manufacturerRemakeUnitPrice: pickDefault(
      "creditSettings.manufacturerRemakeUnitPrice",
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
    customAbutmentLaunchEventEnabled: true,
    customAbutmentLaunchEventStartedAt: null,
    customAbutmentLaunchEventEndedAt: null,
    customAbutmentLaunchEventChangeScheduledAt: null,
    customAbutmentLaunchEventChangeScheduledEnabled: null,
    customAbutmentLaunchEventProductionPrice: pickDefault(
      "creditSettings.customAbutmentLaunchEventProductionPrice",
    ),
    fmDentalMonthlyShippingFee: pickDefault(
      "creditSettings.fmDentalMonthlyShippingFee",
    ),
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
    labProductionPrice: pickDefault("creditSettings.labProductionPrice"),
    labDesignAndProductionPrice: pickDefault(
      "creditSettings.labDesignAndProductionPrice",
    ),
    labRoundBarProductionPrice: pickDefault(
      "creditSettings.labRoundBarProductionPrice",
    ),
    labRoundBarDesignAndProductionPrice: pickDefault(
      "creditSettings.labRoundBarDesignAndProductionPrice",
    ),
    manufacturerSharePercent: pickDefault("creditSettings.manufacturerSharePercent"),
    salesmanSharePercent: pickDefault("creditSettings.salesmanSharePercent"),
    devopsSharePercent: pickDefault("creditSettings.devopsSharePercent"),
    abutsSharePercent: pickDefault("creditSettings.abutsSharePercent"),
    storeManufacturerSharePercent: pickDefault(
      "creditSettings.storeManufacturerSharePercent",
    ),
    storeSalesmanSharePercent: pickDefault(
      "creditSettings.storeSalesmanSharePercent",
    ),
    storeDevopsSharePercent: pickDefault("creditSettings.storeDevopsSharePercent"),
    storeAbutsSharePercent: pickDefault("creditSettings.storeAbutsSharePercent"),
    labBizSharePercent: pickDefault("creditSettings.labBizSharePercent"),
    labSalesTeamSharePercent: pickDefault(
      "creditSettings.labSalesTeamSharePercent",
    ),
    labDevopsSharePercent: pickDefault("creditSettings.labDevopsSharePercent"),
    labAbutsSharePercent: pickDefault("creditSettings.labAbutsSharePercent"),
    dealershipBaseCommissionRate:
      Number(
        SystemSettings.schema.path("creditSettings.dealershipBaseCommissionRate")
          ?.options?.default,
      ) || 0.1,
    dealershipEventCommissionRate:
      Number(
        SystemSettings.schema.path("creditSettings.dealershipEventCommissionRate")
          ?.options?.default,
      ) || 0.15,
    dealershipEventCommissionEnabled: true,
    dealershipEventStartedAt: null,
    dealershipEventEndedAt: null,
    dealershipRateChangeScheduledAt: null,
    dealershipRateChangeScheduledRate: null,
    devopsShareChangeScheduledAt: null,
    devopsShareChangeScheduledPercent: null,
    manufacturerShareChangeScheduledAt: null,
    manufacturerShareChangeScheduledPercent: null,
    storeManufacturerShareChangeScheduledAt: null,
    storeManufacturerShareChangeScheduledPercent: null,
    storeDealerRateChangeScheduledAt: null,
    storeDealerRateChangeScheduledRate: null,
    storeDevopsShareChangeScheduledAt: null,
    storeDevopsShareChangeScheduledPercent: null,
    labBizShareChangeScheduledAt: null,
    labBizShareChangeScheduledPercent: null,
    labSalesTeamShareChangeScheduledAt: null,
    labSalesTeamShareChangeScheduledPercent: null,
    labDevopsShareChangeScheduledAt: null,
    labDevopsShareChangeScheduledPercent: null,
    regularManufacturerSharePercent: pickDefault(
      "creditSettings.regularManufacturerSharePercent",
    ),
    regularSalesmanSharePercent: pickDefault(
      "creditSettings.regularSalesmanSharePercent",
    ),
    regularDevopsSharePercent: pickDefault(
      "creditSettings.regularDevopsSharePercent",
    ),
    regularAbutsSharePercent: pickDefault(
      "creditSettings.regularAbutsSharePercent",
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
  const manufacturerUnit = Math.max(
    0,
    Math.round(
      Number(
        fallback.manufacturerRequestUnitPrice ??
          SCHEMA_DEFAULTS.manufacturerRequestUnitPrice ??
          DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
      ) || 0,
    ),
  );
  const shares = readSharePercents(fallback, SCHEMA_DEFAULTS, "membership");
  const productionParty = allocateRevenueByPercent(
    productionPrice,
    shares,
    manufacturerUnit,
  );
  const designParty = allocateRevenueByPercent(
    designAndProductionPrice,
    shares,
    manufacturerUnit,
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

function readWon(value, fallback = 0) {
  if (value == null || value === "") {
    const fb = Number(fallback);
    return Number.isFinite(fb) && fb >= 0 ? Math.round(fb) : 0;
  }
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.round(n);
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb >= 0 ? Math.round(fb) : 0;
}

function readLabSupplyPrices(creditSettings = {}) {
  const labProductionPrice = readWon(
    creditSettings.labProductionPrice,
    creditSettings.membershipProductionPrice ?? SCHEMA_DEFAULTS.labProductionPrice,
  );
  const labDesignAndProductionPrice = readWon(
    creditSettings.labDesignAndProductionPrice,
    creditSettings.membershipDesignAndProductionPrice ??
      SCHEMA_DEFAULTS.labDesignAndProductionPrice,
  );
  const roundBarRaw = creditSettings.labRoundBarProductionPrice;
  const labRoundBarProductionPrice =
    roundBarRaw == null || Number(roundBarRaw) <= 0
      ? labProductionPrice
      : readWon(roundBarRaw, labProductionPrice);
  const roundBarDesignRaw = creditSettings.labRoundBarDesignAndProductionPrice;
  const labRoundBarDesignAndProductionPrice =
    roundBarDesignRaw == null || Number(roundBarDesignRaw) <= 0
      ? labDesignAndProductionPrice
      : readWon(roundBarDesignRaw, labDesignAndProductionPrice);
  return {
    labProductionPrice,
    labDesignAndProductionPrice,
    labRoundBarProductionPrice,
    labRoundBarDesignAndProductionPrice,
  };
}

/** 기공소 공급 어벗 전역 단가를 멤버십·일반 필드에 동일하게 덮어쓴다. */
export function applyLabSupplyPricesToCreditSettings(creditSettings) {
  const lab = readLabSupplyPrices(creditSettings);
  const overlaid = {
    ...creditSettings,
    ...lab,
    minCreditForRequest: lab.labProductionPrice,
    designFee: Math.max(
      0,
      lab.labDesignAndProductionPrice - lab.labProductionPrice,
    ),
    membershipProductionPrice: lab.labProductionPrice,
    regularProductionPrice: lab.labProductionPrice,
    membershipDesignAndProductionPrice: lab.labDesignAndProductionPrice,
    regularDesignAndProductionPrice: lab.labDesignAndProductionPrice,
    membershipRoundBarProductionPrice: lab.labRoundBarProductionPrice,
    regularRoundBarProductionPrice: lab.labRoundBarProductionPrice,
    membershipRoundBarDesignAndProductionPrice:
      lab.labRoundBarDesignAndProductionPrice,
    regularRoundBarDesignAndProductionPrice:
      lab.labRoundBarDesignAndProductionPrice,
  };
  return {
    ...overlaid,
    ...buildNormalizedTierPartyFields(overlaid, SCHEMA_DEFAULTS),
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

/** 특별 공급가가 있으면 CNC/환봉 고시·레거시 regular 키를 동일 금액으로 덮어쓴다. */
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

/**
 * 플랫폼 판매가를 한 금액으로 맞춘다. 관리자 가격 카드와 같은 필드.
 * 매입가(부가세 포함)는 판매가 × 제조사 비율(manufacturerSharePercent, 기본 50%).
 */
export function overlayCustomAbutmentSalePrice(creditSettings, saleAmount) {
  const sale = Math.max(0, Math.round(Number(saleAmount) || 0));
  const purchase = manufacturerPurchaseFromSale(sale, creditSettings);
  const overlaid = {
    ...creditSettings,
    labProductionPrice: sale,
    labRoundBarProductionPrice: sale,
    membershipProductionPrice: sale,
    regularProductionPrice: sale,
    membershipRoundBarProductionPrice: sale,
    regularRoundBarProductionPrice: sale,
    minCreditForRequest: sale,
    manufacturerRequestUnitPrice: purchase,
    /** 의뢰자 BA 오버라이드 — 런칭 이벤트 단가 리졸버를 건너뛴다. */
    customAbutmentSaleLocked: true,
  };
  const party = buildNormalizedTierPartyFields(overlaid, SCHEMA_DEFAULTS);
  return {
    ...overlaid,
    ...party,
    manufacturerRequestUnitPrice: purchase,
    salesmanRequestUnitPrice: Number(
      party.membershipProductionSalesmanUnitPrice || 0,
    ),
    devopsRequestUnitPrice: Number(
      party.membershipProductionDevopsUnitPrice || 0,
    ),
  };
}

/** 의뢰자 BA 목록에 있으면 그 판매가, 없으면 그대로. 0원도 오버라이드다. */
export function applyRequestorCustomAbutmentSaleOverride(
  creditSettings,
  requestorOrgId,
) {
  const special = findSpecialRequestorPrice(creditSettings, requestorOrgId);
  if (!special) return creditSettings;
  const raw = special.productionPrice ?? special.amount;
  const sale = Math.round(Number(raw));
  if (!Number.isFinite(sale) || sale < 0) return creditSettings;
  return overlayCustomAbutmentSalePrice(creditSettings, sale);
}

export function normalizeLoadedCreditSettings(creditSettings = {}) {
  const abutmentPrices = normalizeAbutsAbutmentCreditPrices({
    ...SCHEMA_DEFAULTS,
    ...creditSettings,
  });
  // 청구 단가: 항상 플랫폼 고시(membership*). regular* 분배는 딜러 유무용.
  const membership = pickAbutsAbutmentCreditPrices(abutmentPrices);
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
  const salePrice = (() => {
    const lab = Math.round(Number(creditSettings.labProductionPrice));
    if (Number.isFinite(lab) && lab > 0) return lab;
    const membership = Math.round(
      Number(abutmentPrices.membershipProductionPrice),
    );
    if (Number.isFinite(membership) && membership > 0) return membership;
    return 0;
  })();
  const derivedPurchase =
    salePrice > 0
      ? manufacturerPurchaseFromSale(salePrice, creditSettings)
      : null;
  const partySource =
    derivedPurchase == null
      ? creditSettings
      : { ...creditSettings, manufacturerRequestUnitPrice: derivedPurchase };
  const withRoundBar = {
    ...abutmentPrices,
    ...buildNormalizedTierPartyFields(partySource, SCHEMA_DEFAULTS),
    ...readLabSupplyPrices({
      ...creditSettings,
      // 환봉 0·미설정은 CNC 판매가로 승격된 abutmentPrices를 lab 폴백에 반영.
      membershipProductionPrice: abutmentPrices.membershipProductionPrice,
      membershipDesignAndProductionPrice:
        abutmentPrices.membershipDesignAndProductionPrice,
      membershipRoundBarProductionPrice:
        abutmentPrices.membershipRoundBarProductionPrice,
      membershipRoundBarDesignAndProductionPrice:
        abutmentPrices.membershipRoundBarDesignAndProductionPrice,
    }),
  };
  const launchResolved = resolveCustomAbutmentProductionPriceForAt(new Date(), {
    ...creditSettings,
    membershipProductionPrice: abutmentPrices.membershipProductionPrice,
    customAbutmentLaunchEventProductionPrice:
      creditSettings.customAbutmentLaunchEventProductionPrice ??
      SCHEMA_DEFAULTS.customAbutmentLaunchEventProductionPrice ??
      ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
    customAbutmentLaunchEventEnabled:
      creditSettings.customAbutmentLaunchEventEnabled,
    customAbutmentLaunchEventStartedAt:
      creditSettings.customAbutmentLaunchEventStartedAt,
    customAbutmentLaunchEventEndedAt:
      creditSettings.customAbutmentLaunchEventEndedAt,
  });
  const parseOptionalDate = (raw) => {
    if (!raw) return null;
    const d = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return {
    minCreditForRequest: launchResolved.price,
    effectiveProductionPrice: launchResolved.price,
    customAbutmentPricingTier: launchResolved.tier,
    customAbutmentLaunchEventEnabled:
      creditSettings.customAbutmentLaunchEventEnabled !== false,
    customAbutmentLaunchEventStartedAt: parseOptionalDate(
      creditSettings.customAbutmentLaunchEventStartedAt,
    ),
    customAbutmentLaunchEventEndedAt: parseOptionalDate(
      creditSettings.customAbutmentLaunchEventEndedAt,
    ),
    customAbutmentLaunchEventProductionPrice: Math.max(
      0,
      Number(
        creditSettings.customAbutmentLaunchEventProductionPrice ??
          SCHEMA_DEFAULTS.customAbutmentLaunchEventProductionPrice ??
          ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
      ) || 0,
    ),
    customAbutmentLaunchEventChangeScheduledAt: parseOptionalDate(
      creditSettings.customAbutmentLaunchEventChangeScheduledAt,
    ),
    customAbutmentLaunchEventChangeScheduledEnabled: (() => {
      const raw = creditSettings.customAbutmentLaunchEventChangeScheduledEnabled;
      if (typeof raw === "boolean") return raw;
      return null;
    })(),
    fmDentalMonthlyShippingFee: Math.max(
      0,
      Number(
        creditSettings.fmDentalMonthlyShippingFee ??
          SCHEMA_DEFAULTS.fmDentalMonthlyShippingFee,
      ) || 0,
    ),
    specialRequestorPrices: Array.isArray(creditSettings.specialRequestorPrices)
      ? creditSettings.specialRequestorPrices
          .map((item) => normalizeSpecialRequestorPrice(item, withRoundBar))
          .filter((item) => item.requestorAnchorId)
      : [],
    shippingFee: Number(creditSettings.shippingFee ?? SCHEMA_DEFAULTS.shippingFee),
    manufacturerRequestUnitPrice: Number(
      derivedPurchase ??
        withRoundBar.membershipProductionManufacturerUnitPrice ??
        SCHEMA_DEFAULTS.manufacturerRequestUnitPrice,
    ),
    manufacturerRemakeUnitPrice: Number(
      creditSettings.manufacturerRemakeUnitPrice ??
        SCHEMA_DEFAULTS.manufacturerRemakeUnitPrice ??
        DEFAULT_MANUFACTURER_REMAKE_UNIT_PRICE,
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
    // 제조사 % = 판매가 대비 매입 비율(기본 50). 잔여 분배 비중과 별개.
    manufacturerSharePercent: (() => {
      const raw = creditSettings.manufacturerSharePercent;
      if (raw == null || raw === "") {
        return SCHEMA_DEFAULTS.manufacturerSharePercent ?? 50;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return SCHEMA_DEFAULTS.manufacturerSharePercent ?? 50;
      }
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    salesmanSharePercent: membershipShares.salesman,
    devopsSharePercent: membershipShares.devops,
    abutsSharePercent: Math.max(
      0,
      100 -
        (() => {
          const raw = creditSettings.manufacturerSharePercent;
          if (raw == null || raw === "") return 50;
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return 50;
          return Math.min(100, Math.round(n * 100) / 100);
        })() -
        membershipShares.salesman -
        membershipShares.devops,
    ),
    storeManufacturerSharePercent: (() => {
      const raw =
        creditSettings.storeManufacturerSharePercent ??
        creditSettings.manufacturerSharePercent;
      if (raw == null || raw === "") {
        return (
          SCHEMA_DEFAULTS.storeManufacturerSharePercent ??
          SCHEMA_DEFAULTS.manufacturerSharePercent ??
          50
        );
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return (
          SCHEMA_DEFAULTS.storeManufacturerSharePercent ??
          SCHEMA_DEFAULTS.manufacturerSharePercent ??
          50
        );
      }
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    storeSalesmanSharePercent: clampSharePercent(
      creditSettings.storeSalesmanSharePercent ??
        creditSettings.salesmanSharePercent ??
        SCHEMA_DEFAULTS.storeSalesmanSharePercent ??
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
    ),
    storeDevopsSharePercent: clampSharePercent(
      creditSettings.storeDevopsSharePercent ??
        creditSettings.devopsSharePercent ??
        SCHEMA_DEFAULTS.storeDevopsSharePercent ??
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
    ),
    storeAbutsSharePercent: (() => {
      const mfrRaw =
        creditSettings.storeManufacturerSharePercent ??
        creditSettings.manufacturerSharePercent;
      let mfr = 50;
      if (mfrRaw != null && mfrRaw !== "") {
        const n = Number(mfrRaw);
        if (Number.isFinite(n) && n >= 0) {
          mfr = Math.min(100, Math.round(n * 100) / 100);
        }
      }
      const dealer = clampSharePercent(
        creditSettings.storeSalesmanSharePercent ??
          creditSettings.salesmanSharePercent ??
          SCHEMA_DEFAULTS.storeSalesmanSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
      );
      const devops = clampSharePercent(
        creditSettings.storeDevopsSharePercent ??
          creditSettings.devopsSharePercent ??
          SCHEMA_DEFAULTS.storeDevopsSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      );
      return Math.max(0, 100 - mfr - dealer - devops);
    })(),
    labBizSharePercent: (() => {
      const raw = creditSettings.labBizSharePercent;
      if (raw == null || raw === "") return 50;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 50;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    labSalesTeamSharePercent: (() => {
      const raw = creditSettings.labSalesTeamSharePercent;
      if (raw == null || raw === "") return 20;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 20;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    labDevopsSharePercent: (() => {
      const raw = creditSettings.labDevopsSharePercent;
      if (raw == null || raw === "") return 5;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 5;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    labAbutsSharePercent: (() => {
      const readPct = (raw, fallback) => {
        if (raw == null || raw === "") return fallback;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return fallback;
        return Math.min(100, Math.round(n * 100) / 100);
      };
      const biz = readPct(creditSettings.labBizSharePercent, 50);
      const salesTeam = readPct(creditSettings.labSalesTeamSharePercent, 20);
      const devops = readPct(creditSettings.labDevopsSharePercent, 5);
      return Math.max(0, 100 - biz - salesTeam - devops);
    })(),
    regularManufacturerSharePercent: regularShares.manufacturer,
    regularSalesmanSharePercent: regularShares.salesman,
    regularDevopsSharePercent: regularShares.devops,
    regularAbutsSharePercent: Math.max(
      0,
      100 - regularShares.salesman - regularShares.devops,
    ),
    dealershipBaseCommissionRate: (() => {
      const raw = Number(
        creditSettings.dealershipBaseCommissionRate ??
          SCHEMA_DEFAULTS.dealershipBaseCommissionRate,
      );
      if (!Number.isFinite(raw) || raw < 0) {
        return SCHEMA_DEFAULTS.dealershipBaseCommissionRate;
      }
      return Math.min(1, raw);
    })(),
    dealershipEventCommissionRate: (() => {
      const raw = Number(
        creditSettings.dealershipEventCommissionRate ??
          SCHEMA_DEFAULTS.dealershipEventCommissionRate,
      );
      if (!Number.isFinite(raw) || raw < 0) {
        return SCHEMA_DEFAULTS.dealershipEventCommissionRate;
      }
      return Math.min(1, raw);
    })(),
    dealershipEventCommissionEnabled:
      creditSettings.dealershipEventCommissionEnabled !== false,
    dealershipEventStartedAt: (() => {
      const raw = creditSettings.dealershipEventStartedAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    dealershipEventEndedAt: (() => {
      const raw = creditSettings.dealershipEventEndedAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    dealershipRateChangeScheduledAt: (() => {
      const raw = creditSettings.dealershipRateChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    dealershipRateChangeScheduledRate: (() => {
      const raw = creditSettings.dealershipRateChangeScheduledRate;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(1, n);
    })(),
    devopsShareChangeScheduledAt: (() => {
      const raw = creditSettings.devopsShareChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    devopsShareChangeScheduledPercent: (() => {
      const raw = creditSettings.devopsShareChangeScheduledPercent;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    manufacturerShareChangeScheduledAt: (() => {
      const raw = creditSettings.manufacturerShareChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    manufacturerShareChangeScheduledPercent: (() => {
      const raw = creditSettings.manufacturerShareChangeScheduledPercent;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    storeManufacturerShareChangeScheduledAt: (() => {
      const raw = creditSettings.storeManufacturerShareChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    storeManufacturerShareChangeScheduledPercent: (() => {
      const raw = creditSettings.storeManufacturerShareChangeScheduledPercent;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    storeDealerRateChangeScheduledAt: (() => {
      const raw = creditSettings.storeDealerRateChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    storeDealerRateChangeScheduledRate: (() => {
      const raw = creditSettings.storeDealerRateChangeScheduledRate;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(1, n);
    })(),
    storeDevopsShareChangeScheduledAt: (() => {
      const raw = creditSettings.storeDevopsShareChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    storeDevopsShareChangeScheduledPercent: (() => {
      const raw = creditSettings.storeDevopsShareChangeScheduledPercent;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    labBizShareChangeScheduledAt: (() => {
      const raw = creditSettings.labBizShareChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    labBizShareChangeScheduledPercent: (() => {
      const raw = creditSettings.labBizShareChangeScheduledPercent;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    labSalesTeamShareChangeScheduledAt: (() => {
      const raw = creditSettings.labSalesTeamShareChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    labSalesTeamShareChangeScheduledPercent: (() => {
      const raw = creditSettings.labSalesTeamShareChangeScheduledPercent;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    labDevopsShareChangeScheduledAt: (() => {
      const raw = creditSettings.labDevopsShareChangeScheduledAt;
      if (!raw) return null;
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
    labDevopsShareChangeScheduledPercent: (() => {
      const raw = creditSettings.labDevopsShareChangeScheduledPercent;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100, Math.round(n * 100) / 100);
    })(),
    ...withRoundBar,
  };
}

export async function resolveRequestorAbutmentPricingTier(_requestorOrgId) {
  return "membership";
}

const GLOBAL_SETTINGS_CACHE_TTL_MS = 60 * 1000;
let globalSettingsCache = { at: 0, value: null };

export function invalidateGlobalCreditSettingsCache() {
  globalSettingsCache = { at: 0, value: null };
}

async function loadCachedGlobalCreditSettingsDoc() {
  const now = Date.now();
  if (
    globalSettingsCache.value &&
    now - globalSettingsCache.at < GLOBAL_SETTINGS_CACHE_TTL_MS
  ) {
    return globalSettingsCache.value;
  }
  const doc = await SystemSettings.findOne({ key: "global" }).lean();
  globalSettingsCache = { at: now, value: doc };
  return doc;
}

/**
 * 요율 변경 예약이 도래하면 DB에 반영(해당일 0시 KST~).
 * 미도래·미설정이면 no-op.
 */
export async function ensureDealershipRateChangeApplied(now = new Date()) {
  const doc = await loadCachedGlobalCreditSettingsDoc();
  if (!doc) return null;
  let creditSettings = normalizeLoadedCreditSettings(doc.creditSettings || {});
  const manufacturerPatch = buildManufacturerShareChangeApplyPatch(
    creditSettings,
    now,
  );
  const mergedAfterMfr = { ...creditSettings, ...(manufacturerPatch || {}) };
  const launchEventPatch = buildCustomAbutmentLaunchEventChangeApplyPatch(
    mergedAfterMfr,
    now,
  );
  const mergedAfterLaunch = {
    ...mergedAfterMfr,
    ...(launchEventPatch || {}),
  };
  const dealerPatch = buildDealershipRateChangeApplyPatch(mergedAfterLaunch, now);
  const mergedAfterDealer = { ...mergedAfterLaunch, ...(dealerPatch || {}) };
  const devopsPatch = buildDevopsShareChangeApplyPatch(mergedAfterDealer, now);
  const mergedAfterCustom = {
    ...mergedAfterDealer,
    ...(devopsPatch || {}),
  };
  const storeManufacturerPatch = buildStoreManufacturerShareChangeApplyPatch(
    mergedAfterCustom,
    now,
  );
  const mergedAfterStoreMfr = {
    ...mergedAfterCustom,
    ...(storeManufacturerPatch || {}),
  };
  const storeDealerPatch = buildStoreDealerRateChangeApplyPatch(
    mergedAfterStoreMfr,
    now,
  );
  const mergedAfterStoreDealer = {
    ...mergedAfterStoreMfr,
    ...(storeDealerPatch || {}),
  };
  const storeDevopsPatch = buildStoreDevopsShareChangeApplyPatch(
    mergedAfterStoreDealer,
    now,
  );
  const mergedAfterStore = {
    ...mergedAfterStoreDealer,
    ...(storeDevopsPatch || {}),
  };
  const labPatch = buildLabShareChangeApplyPatch(mergedAfterStore, now);
  const patch = {
    ...(manufacturerPatch || {}),
    ...(launchEventPatch || {}),
    ...(dealerPatch || {}),
    ...(devopsPatch || {}),
    ...(storeManufacturerPatch || {}),
    ...(storeDealerPatch || {}),
    ...(storeDevopsPatch || {}),
    ...(labPatch || {}),
  };
  if (Object.keys(patch).length === 0) return creditSettings;

  const set = {};
  for (const [key, value] of Object.entries(patch)) {
    set[`creditSettings.${key}`] = value;
  }
  await SystemSettings.updateOne({ key: "global" }, { $set: set });
  invalidateGlobalCreditSettingsCache();
  return normalizeLoadedCreditSettings({ ...creditSettings, ...patch });
}

export async function loadCreditSettingsDefaults(options = {}) {
  if (
    options?.applyDealershipRateChange !== false &&
    options?.preloadedDoc === undefined
  ) {
    await ensureDealershipRateChangeApplied();
  }
  const doc =
    options?.preloadedDoc !== undefined
      ? options.preloadedDoc
      : await loadCachedGlobalCreditSettingsDoc();
  const base = normalizeLoadedCreditSettings(doc?.creditSettings || {});
  const requestorOrgId = options?.requestorOrgId;
  if (!requestorOrgId) return base;

  const id = String(requestorOrgId || "").trim();
  let requestorKind = null;
  const providedAnchor = options?.requestorAnchor;
  if (providedAnchor && typeof providedAnchor === "object") {
    requestorKind = String(providedAnchor?.requestorKind || "").trim();
  } else if (id && Types.ObjectId.isValid(id)) {
    const anchor = await BusinessAnchor.findById(id)
      .select({ requestorKind: 1 })
      .lean();
    requestorKind = String(anchor?.requestorKind || "").trim();
  }

  const applyLabSupply =
    requestorKind === "lab" && options?.applyLabSupplyPrices !== false;
  const priced = applyLabSupply
    ? applyLabSupplyPricesToCreditSettings(base)
    : base;
  const overridden = applyRequestorCustomAbutmentSaleOverride(priced, id);
  // 치과 멤버십 폐지 — 청구·의뢰비는 플랫폼 고시(membership*) 단일가.
  // 의뢰자 BA 오버라이드가 있으면 그 판매가. 매입가는 적용 판매가의 50%.
  const picked = pickAbutsAbutmentCreditPrices(overridden);
  return {
    ...overridden,
    minCreditForRequest: picked.productionPrice,
    designFee: picked.designFeePerTooth,
    abutmentPricingTier: "membership",
    requestorKind: requestorKind || null,
    manufacturerRequestUnitPrice: Number(
      overridden.manufacturerRequestUnitPrice,
    ),
    salesmanRequestUnitPrice: Number(
      overridden.membershipProductionSalesmanUnitPrice,
    ),
    devopsRequestUnitPrice: Number(
      overridden.membershipProductionDevopsUnitPrice,
    ),
  };
}

/** 어벗생산의뢰 1개당 기본 단가. loadCreditSettingsDefaults 이후 값을 쓴다.
 * 의뢰 생성·hold 시점(`at`)의 런칭 이벤트 창을 반영한다.
 * BA 판매가 오버라이드(`customAbutmentSaleLocked`)는 고정가.
 */
export function resolveCustomAbutmentRequestUnitPrice(
  creditSettings = {},
  at = new Date(),
) {
  if (creditSettings?.customAbutmentSaleLocked === true) {
    const locked = Math.round(
      Number(
        creditSettings?.minCreditForRequest ??
          creditSettings?.membershipProductionPrice ??
          SCHEMA_DEFAULTS.minCreditForRequest,
      ) || 0,
    );
    return locked >= 0 ? locked : SCHEMA_DEFAULTS.minCreditForRequest;
  }
  const resolved = resolveCustomAbutmentProductionPriceForAt(at, creditSettings);
  const n = Math.round(Number(resolved.price) || 0);
  return n >= 0
    ? n
    : SCHEMA_DEFAULTS.minCreditForRequest ||
        ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;
}

export { SCHEMA_DEFAULTS as CREDIT_SETTINGS_SCHEMA_DEFAULTS };
export { resolveCustomAbutmentProductionPriceForAt };
