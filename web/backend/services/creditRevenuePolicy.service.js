// related files:
// - web/backend/rules.md
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/scripts/db/migrate-request-spend-to-gl.js
// - web/backend/scripts/db/migrate-legacy-creditledger-to-gl.js

export const WITH_SALESMAN_DEFAULT_RATES = {
  manufacturerRate: 0.6,
  devopsRate: 0.1,
  salesmanRate: 0.1,
  adminRate: 0.2,
};

export const WITHOUT_SALESMAN_RATES = {
  manufacturerRate: 0.65,
  devopsRate: 0.1,
  salesmanRate: 0,
  adminRate: 0.25,
};

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

export function isShippingSpendRevenueContext({ refType, freeAccountCode }) {
  return (
    String(refType || "") === "SHIPPING_PACKAGE" ||
    String(freeAccountCode || "") === "REQ_FREE_SHIPPING_CREDIT"
  );
}

export function resolveRevenueBaseAllocation({ spendAmount, hasSalesmanReferrer, configuredRates }) {
  const effectiveRates = hasSalesmanReferrer ? configuredRates : WITHOUT_SALESMAN_RATES;

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

export const REVENUE_OWNER_ORDER = ["manufacturer", "devops", "salesman", "admin"];

export function resolveRevenueOwnerBaseAllocation({
  spendAmount,
  hasSalesmanReferrer,
  configuredRates,
  owners,
  isShippingSpend,
}) {
  if (isShippingSpend) {
    const manufacturer = owners?.manufacturerAnchorId ? spendAmount : 0;
    return {
      manufacturer,
      devops: 0,
      salesman: 0,
      admin: Math.max(0, spendAmount - manufacturer),
    };
  }

  const planned = resolveRevenueBaseAllocation({
    spendAmount,
    hasSalesmanReferrer,
    configuredRates,
  });

  const manufacturer = owners?.manufacturerAnchorId ? planned.manufacturer : 0;
  const devops = owners?.devopsAnchorId ? planned.devops : 0;
  const salesman = owners?.salesmanAnchorId ? planned.salesman : 0;

  let admin =
    planned.admin +
    (planned.manufacturer - manufacturer) +
    (planned.devops - devops) +
    (planned.salesman - salesman);

  const allocatedTotal = manufacturer + devops + salesman + admin;
  const allocationGap = spendAmount - allocatedTotal;
  if (allocationGap !== 0) admin += allocationGap;

  return {
    manufacturer,
    devops,
    salesman,
    admin,
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
