// related files:
// - web/backend/rules.md
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/scripts/db/migrate-request-spend-to-gl.js
// - web/backend/scripts/db/migrate-legacy-creditledger-to-gl.js
// - web/backend/scripts/db/rebalance-manufacturer-unit-price.js
// change-log:
// - 2026-08-19: 견적 표시용 수수료 — 원청(하청 후) 전액 수주 0, 하청은 subcontractFeeRate.
// - 2026-08-18: 제조사 하청 면세(기공소 등록) — vatRate 0, 공급가=지급액.
// - 2026-08-17: 제조사 하청은 어벗 1개당 고정단가(기본 9,000). %분배·타 역할 재분배는 별도.
// - 2026-08-15: 제조사 의뢰 공급가 기본 8,000 → 9,000.
// - 2026-08-15: 제조사 %분배 → 하청 고정단가(의뢰/배송). 잔여는 salesman/devops/admin 재분배.
// - 2026-08-14: DEFAULT_PLATFORM_FEE_RATE 0.25 → 0.1 (자동매칭 성공 수수료).
// - 2026-08-16: 지정 거래 directPlatformFeeRate 기본 5%(매칭 10%와 분리).
// - 2026-08-16: 지정 거래 수수료 적용 on/off(기본 off=별도 공지 시까지 무료).

export const WITH_SALESMAN_DEFAULT_RATES = {
  manufacturerRate: 0.6,
  devopsRate: 0.1,
  salesmanRate: 0.1,
  adminRate: 0.2,
};

/** 제조사 하청 공급가·부가세 SSOT 기본값 (creditSettings와 동기). */
export const DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE = 9000;
export const DEFAULT_MANUFACTURER_SHIPPING_UNIT_PRICE = 3500;
export const DEFAULT_AFFILIATE_VAT_RATE = 0.1;
export const MANUFACTURER_PRODUCTION_LEDGER_LABEL = "커스텀어벗 생산";

/** 제조사 정산 카드·일별 집계에서 의뢰(생산)로 보는 이벤트. */
export const MANUFACTURER_REQUEST_EARN_EVENT_TYPES = [
  "REQUEST_SPEND_COMMIT",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
  "PRACTICE_TRANSFER_ESCROW_RELEASE",
];
export const MANUFACTURER_SHIPPING_EARN_EVENT_TYPES = ["SHIPPING_SPEND_COMMIT"];

export function resolveConfiguredRevenueRates(devopsPayoutRates) {
  return {
    manufacturerRate: Number(
      devopsPayoutRates?.manufacturerRate ?? WITH_SALESMAN_DEFAULT_RATES.manufacturerRate,
    ),
    devopsRate: Number(devopsPayoutRates?.devopsRate ?? WITH_SALESMAN_DEFAULT_RATES.devopsRate),
    salesmanRate: Number(
      devopsPayoutRates?.salesmanRate ?? WITH_SALESMAN_DEFAULT_RATES.salesmanRate,
    ),
    adminRate: Number(devopsPayoutRates?.adminRate ?? WITH_SALESMAN_DEFAULT_RATES.adminRate),
  };
}

function roundRate4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

/**
 * 딜러사 소개가 없을 때: 딜러사 분배비의 절반 → 제조사, 나머지 절반 → 어벗츠.
 * 레거시 %분배용. 제조사 고정단가 경로에서는 salesman 몫만 admin에 가산한다.
 */
export function resolveRatesWithoutSalesman(configuredRates) {
  const rates = resolveConfiguredRevenueRates(configuredRates);
  const halfSalesman = Number(rates.salesmanRate || 0) / 2;
  return {
    manufacturerRate: roundRate4(Number(rates.manufacturerRate || 0) + halfSalesman),
    devopsRate: roundRate4(rates.devopsRate),
    salesmanRate: 0,
    adminRate: roundRate4(Number(rates.adminRate || 0) + halfSalesman),
  };
}

/** 잔여(비제조사) 분배율: 딜러사 없으면 salesman 몫 → admin. */
export function resolveResidualRatesWithoutSalesman(configuredRates) {
  const rates = resolveConfiguredRevenueRates(configuredRates);
  return {
    devopsRate: roundRate4(rates.devopsRate),
    salesmanRate: 0,
    adminRate: roundRate4(Number(rates.adminRate || 0) + Number(rates.salesmanRate || 0)),
  };
}

export const WITHOUT_SALESMAN_RATES = resolveRatesWithoutSalesman(WITH_SALESMAN_DEFAULT_RATES);

export const DEFAULT_PLATFORM_FEE_RATE = 0.1;
/** 어벗츠 원청을 타 기공소가 하청 수행할 때 공제율(기본 15%, 수행 기공소 85%). */
export const DEFAULT_SUBCONTRACT_FEE_RATE = 0.15;
/** 지정 기공소(direct) 성공 수수료 기본 5%(적용 on일 때만). */
export const DEFAULT_DIRECT_PLATFORM_FEE_RATE = 0.05;
/**
 * 지정 거래 수수료 적용 기본값.
 * false = 별도 공지가 있을 때까지 무료(실효 요율 0).
 */
export const DEFAULT_DIRECT_PLATFORM_FEE_ENABLED = false;
/** @deprecated 등록/미등록 2단계 폐지. 읽기 fallback 전용. */
export const DEFAULT_PARTNER_FEE_RATE = 0;
export const DEFAULT_NON_PARTNER_FEE_RATE = DEFAULT_PLATFORM_FEE_RATE;

export function resolvePlatformFeeRate(payoutRates) {
  const raw = payoutRates?.platformFeeRate;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.min(1, Math.max(0, Number(raw)));
  }
  const legacy = Number(
    payoutRates?.nonPartnerFeeRate ?? DEFAULT_PLATFORM_FEE_RATE,
  );
  return Number.isFinite(legacy)
    ? Math.min(1, Math.max(0, legacy))
    : DEFAULT_PLATFORM_FEE_RATE;
}

/** 지정 거래 수수료 적용 여부. 명시적 true만 on(미설정·false = 무료). */
export function isDirectPlatformFeeEnabled(payoutRates) {
  return payoutRates?.directPlatformFeeEnabled === true;
}

/** 지정 거래 설정 요율(적용 off여도 저장값 유지). */
export function resolveDirectPlatformFeeRateConfigured(payoutRates) {
  const raw = payoutRates?.directPlatformFeeRate;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.min(1, Math.max(0, Number(raw)));
  }
  return DEFAULT_DIRECT_PLATFORM_FEE_RATE;
}

/** 지정 거래(direct) 실효 수수료율. 적용 off면 0. */
export function resolveDirectPlatformFeeRate(payoutRates) {
  if (!isDirectPlatformFeeEnabled(payoutRates)) return 0;
  return resolveDirectPlatformFeeRateConfigured(payoutRates);
}

export function resolveSubcontractFeeRate(payoutRates) {
  const raw = payoutRates?.subcontractFeeRate;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.min(1, Math.max(0, Number(raw)));
  }
  return DEFAULT_SUBCONTRACT_FEE_RATE;
}

/**
 * 기공의뢰 플랫폼/하청 수수료율.
 * - 하청 수행(assignee ≠ 원청): subcontractFeeRate (기본 15%)
 * - 어벗츠 자체 수행·지정 거래: 지정 적용 on이면 directPlatformFeeRate, off면 0
 */
export function resolvePracticeTransferFeeRate({
  matchingMode,
  payoutRates,
  subcontracted = false,
} = {}) {
  if (subcontracted) return resolveSubcontractFeeRate(payoutRates);
  if (String(matchingMode || "").trim() === "auto") {
    return 0;
  }
  return resolveDirectPlatformFeeRate(payoutRates);
}

/**
 * 견적 표시용 수수료율.
 * 원청(어벗츠 기공사업부)이 하청을 준 뒤 자기 화면을 보면 전액 수주이므로 0.
 * 하청 수행 기공소는 subcontractFeeRate.
 */
export function resolvePracticeTransferFeeRateForViewer({
  matchingMode,
  payoutRates,
  subcontracted = false,
  viewerIsPrimeContractor = false,
} = {}) {
  if (subcontracted && viewerIsPrimeContractor) return 0;
  return resolvePracticeTransferFeeRate({
    matchingMode,
    payoutRates,
    subcontracted,
  });
}

export function isShippingSpendRevenueContext({ refType, freeAccountCode }) {
  return (
    String(refType || "") === "SHIPPING_PACKAGE" ||
    String(freeAccountCode || "") === "REQ_FREE_SHIPPING_CREDIT"
  );
}

export function resolveManufacturerUnitSettings(creditSettings = {}) {
  const requestSupply = Math.max(
    0,
    Math.round(
      Number(
        creditSettings?.manufacturerRequestUnitPrice ??
          DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
      ) || 0,
    ),
  );
  const shippingSupply = Math.max(
    0,
    Math.round(
      Number(
        creditSettings?.manufacturerShippingUnitPrice ??
          DEFAULT_MANUFACTURER_SHIPPING_UNIT_PRICE,
      ) || 0,
    ),
  );
  // 제조사는 기공소(면세)로 등록 — 하청 적립·지급에 부가세 없음.
  return { requestSupply, shippingSupply, vatRate: 0 };
}

export function resolveManufacturerUnitQty({
  abutmentQty,
  isShippingSpend = false,
} = {}) {
  if (isShippingSpend) return 1;
  const qty = Math.floor(Number(abutmentQty) || 0);
  return Math.max(1, qty);
}

/**
 * 제조사 하청 단가를 적립할지.
 * 플랫폼 수수료·기공소 배송·신속추가는 제외. 생산(어벗 개당)·어벗츠→제조사 배송만.
 */
export function resolveManufacturerUnitApply({
  usageKind = "",
  source = "",
  displayKind = "",
  abutmentQty = 0,
  abutmentRetailTotal = 0,
  isShippingSpend = false,
} = {}) {
  const usage = String(usageKind || "").trim();
  const src = String(source || "").trim();
  const kind = String(displayKind || "").trim();
  if (usage === "express_surcharge") return false;
  if (usage === "practice_transfer_lab_shipping") return false;
  if (kind === "platform_fee" || src === "lab_platform_fee") return false;
  if (isShippingSpend || usage === "practice_transfer_abuts_shipping") {
    return true;
  }
  if (src === "abutment_retail" || kind === "abuts_share") return true;
  if (
    (src === "non_partner_platform_fee" || src === "partner_platform_fee") &&
    !(Number(abutmentQty) > 0 || Number(abutmentRetailTotal) > 0)
  ) {
    return false;
  }
  return true;
}

/**
 * 제조사 하청 단가(공급가·VAT·합계).
 * applyManufacturerUnit=false(express_surcharge 등)이면 0.
 * 의뢰는 어벗 `qty`개당, 배송은 박스 1건.
 */
export function resolveManufacturerUnitEarn({
  isShippingSpend,
  creditSettings,
  applyManufacturerUnit = true,
  qty = 1,
} = {}) {
  if (!applyManufacturerUnit) {
    return { supply: 0, vat: 0, total: 0, vatRate: 0, qty: 0 };
  }
  const units = resolveManufacturerUnitQty({
    abutmentQty: qty,
    isShippingSpend,
  });
  const { requestSupply, shippingSupply, vatRate } =
    resolveManufacturerUnitSettings(creditSettings);
  const unitSupply = isShippingSpend ? shippingSupply : requestSupply;
  const supply = unitSupply * units;
  const vat = Math.round(supply * vatRate);
  return { supply, vat, total: supply + vat, vatRate, qty: units };
}

/**
 * @deprecated 레거시 %분배. 신규 커밋은 resolveRevenueOwnerBaseAllocation(고정단가) 사용.
 */
export function resolveRevenueBaseAllocation({ spendAmount, hasSalesmanReferrer, configuredRates }) {
  const effectiveRates = hasSalesmanReferrer
    ? resolveConfiguredRevenueRates(configuredRates)
    : resolveRatesWithoutSalesman(configuredRates);

  const plannedManufacturerBaseAmount = Math.round(
    spendAmount * Number(effectiveRates.manufacturerRate || 0),
  );
  const plannedDevopsBaseAmount = Math.round(spendAmount * Number(effectiveRates.devopsRate || 0));
  const plannedSalesmanBaseAmount = hasSalesmanReferrer
    ? Math.round(spendAmount * Number(effectiveRates.salesmanRate || 0))
    : 0;
  const plannedAdminBaseAmount = Math.max(
    spendAmount - plannedManufacturerBaseAmount - plannedDevopsBaseAmount - plannedSalesmanBaseAmount,
    0,
  );

  return {
    manufacturer: plannedManufacturerBaseAmount,
    devops: plannedDevopsBaseAmount,
    salesman: plannedSalesmanBaseAmount,
    admin: plannedAdminBaseAmount,
  };
}

function allocateResidualAmongAffiliates({
  residualAmount,
  hasSalesmanReferrer,
  configuredRates,
  owners,
}) {
  const residual = Math.max(0, Math.round(Number(residualAmount || 0)));
  const rates = resolveConfiguredRevenueRates(configuredRates);
  const devopsWeight = Math.max(0, Number(rates.devopsRate || 0));
  const salesmanWeight = hasSalesmanReferrer
    ? Math.max(0, Number(rates.salesmanRate || 0))
    : 0;
  const adminWeight = Math.max(0, Number(rates.adminRate || 0)) +
    (hasSalesmanReferrer ? 0 : Math.max(0, Number(rates.salesmanRate || 0)));
  const weightSum = devopsWeight + salesmanWeight + adminWeight;

  let plannedDevops = 0;
  let plannedSalesman = 0;
  let plannedAdmin = residual;
  if (weightSum > 0 && residual > 0) {
    plannedDevops = Math.round((residual * devopsWeight) / weightSum);
    plannedSalesman = Math.round((residual * salesmanWeight) / weightSum);
    plannedAdmin = Math.max(0, residual - plannedDevops - plannedSalesman);
  }

  const devops = owners?.devopsAnchorId ? plannedDevops : 0;
  const salesman = owners?.salesmanAnchorId ? plannedSalesman : 0;
  let admin =
    plannedAdmin +
    (plannedDevops - devops) +
    (plannedSalesman - salesman);

  const allocated = devops + salesman + admin;
  const gap = residual - allocated;
  if (gap !== 0) admin += gap;

  return { devops, salesman, admin };
}

export const REVENUE_OWNER_ORDER = ["manufacturer", "devops", "salesman", "admin"];

/**
 * 제조사 = 하청 고정 공급가. 잔여 = spend − 제조사 공급가 → salesman/devops/admin.
 * express 등 applyManufacturerUnit=false 이면 제조사 0·전액 잔여 분배.
 * 배송: 제조사 배송 공급가, 잔여 → admin(및 잔여 비율이 있으면 동일 로직).
 */
export function resolveRevenueOwnerBaseAllocation({
  spendAmount,
  hasSalesmanReferrer,
  configuredRates,
  owners,
  isShippingSpend,
  creditSettings,
  applyManufacturerUnit = true,
  qty = 1,
}) {
  const spend = Math.max(0, Math.round(Number(spendAmount || 0)));
  const unitEarn = resolveManufacturerUnitEarn({
    isShippingSpend,
    creditSettings,
    applyManufacturerUnit,
    qty,
  });

  // 저널 균형(의뢰자 소비 공급가 = REV 공급가 합): 단가는 소비액으로 캡.
  // VAT는 캡된 공급가×요율(어벗츠 추가 지급, 보존식 밖).
  const manufacturer =
    owners?.manufacturerAnchorId && applyManufacturerUnit
      ? Math.min(unitEarn.supply, spend)
      : 0;
  const manufacturerVat =
    manufacturer > 0 ? Math.round(manufacturer * Number(unitEarn.vatRate || 0)) : 0;

  const residual = Math.max(0, spend - manufacturer);

  if (isShippingSpend) {
    // 배송 잔여는 기본적으로 관리자. 타 role 앵커가 있어도 배송은 admin 귀속.
    return {
      manufacturer,
      devops: 0,
      salesman: 0,
      admin: residual,
      manufacturerVat,
      manufacturerVatRate: unitEarn.vatRate,
    };
  }

  const residualSplit = allocateResidualAmongAffiliates({
    residualAmount: residual,
    hasSalesmanReferrer,
    configuredRates,
    owners,
  });

  return {
    manufacturer,
    devops: residualSplit.devops,
    salesman: residualSplit.salesman,
    admin: residualSplit.admin,
    manufacturerVat,
    manufacturerVatRate: unitEarn.vatRate,
  };
}

function allocateIntegerByWeights({ total, weightByRole, roleOrder = REVENUE_OWNER_ORDER }) {
  const normalizedTotal = Math.max(0, Math.round(Number(total || 0)));
  const roles = roleOrder.filter((role) => Number(weightByRole?.[role] || 0) > 0);
  const allocated = Object.fromEntries(roleOrder.map((role) => [role, 0]));
  if (normalizedTotal <= 0 || roles.length <= 0) return allocated;

  const weightSum = roles.reduce(
    (sum, role) => sum + Math.max(0, Math.round(Number(weightByRole?.[role] || 0))),
    0,
  );
  if (weightSum <= 0) return allocated;

  const rawRows = roles.map((role) => {
    const weight = Math.max(0, Math.round(Number(weightByRole?.[role] || 0)));
    const raw = (normalizedTotal * weight) / weightSum;
    const floored = Math.floor(raw);
    return {
      role,
      weight,
      raw,
      floored,
      frac: raw - floored,
    };
  });

  let used = 0;
  for (const row of rawRows) {
    allocated[row.role] = row.floored;
    used += row.floored;
  }

  let remain = Math.max(0, normalizedTotal - used);
  rawRows.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });

  let idx = 0;
  while (remain > 0 && rawRows.length > 0) {
    allocated[rawRows[idx % rawRows.length].role] += 1;
    remain -= 1;
    idx += 1;
  }

  return allocated;
}

export function splitRevenueByCreditKindProRata({
  ownerBaseByRole,
  freeAmount,
  roleOrder = REVENUE_OWNER_ORDER,
}) {
  const result = {
    manufacturer: { paid: 0, free: 0 },
    devops: { paid: 0, free: 0 },
    salesman: { paid: 0, free: 0 },
    admin: { paid: 0, free: 0 },
  };

  const baseByRole = {
    manufacturer: Math.max(0, Math.round(Number(ownerBaseByRole?.manufacturer || 0))),
    devops: Math.max(0, Math.round(Number(ownerBaseByRole?.devops || 0))),
    salesman: Math.max(0, Math.round(Number(ownerBaseByRole?.salesman || 0))),
    admin: Math.max(0, Math.round(Number(ownerBaseByRole?.admin || 0))),
  };

  const totalBase = roleOrder.reduce((sum, role) => sum + Number(baseByRole[role] || 0), 0);
  const normalizedFree = Math.max(0, Math.min(totalBase, Math.round(Number(freeAmount || 0))));

  const freeByRole = allocateIntegerByWeights({
    total: normalizedFree,
    weightByRole: baseByRole,
    roleOrder,
  });

  let freeAllocatedTotal = 0;
  for (const role of roleOrder) {
    const base = Number(baseByRole[role] || 0);
    const free = Math.max(0, Math.min(base, Number(freeByRole[role] || 0)));
    const paid = Math.max(0, base - free);
    result[role] = { paid, free };
    freeAllocatedTotal += free;
  }

  return {
    ...result,
    freeAllocatedTotal,
    freeUnallocatedRemainder: Math.max(0, normalizedFree - freeAllocatedTotal),
  };
}
