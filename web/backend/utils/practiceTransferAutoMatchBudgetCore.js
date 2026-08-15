// related files:
// - web/backend/utils/practiceTransferAutoMatchBudget.js
// - web/backend/utils/abutsLabFeeSchedule.js
// - web/frontend/src/shared/practice/autoMatchBudget.ts
//
// 자동매칭 기공비 예산 — 항목별 min/max (순수).
// 카탈로그(어벗츠 수가) 기준 ±40%, 1000원 단위 절사.

const MAX_UNIT_FEE = 50_000_000;
const DEFAULT_SPREAD = 0.4;
const FEE_STEP = 1000;

/** 1000원 단위 절사 (미만 버림) */
export function floorToFeeStep(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / FEE_STEP) * FEE_STEP;
}

/** 카탈로그 없을 때 fallback (어벗츠 기본 수가와 동기화) */
export const ADMIN_LAB_FEE_BASE = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  retainer: 40000,
  removableTemp3: 30000,
  removableTemp6: 50000,
};

export const AUTO_MATCH_BUDGET_KEYS = [
  "crown",
  "bridge",
  "inlay",
  "pontic",
  "retainer",
  "removableTemp3",
  "removableTemp6",
];

export const AUTO_MATCH_BUDGET_KEY_LABELS = {
  crown: "크라운",
  bridge: "브리지",
  inlay: "인레이",
  pontic: "Pontic",
  retainer: "유지장치",
  removableTemp3: "임시치아 (3치 이하)",
  removableTemp6: "임시치아 (6치 이하)",
};

/** @returns {{ id: string, name: string, price: number, unit?: string }[]} */
export function fallbackAbutsLabFeeCatalog() {
  return [
    { id: "crown", name: "크라운", unit: "perTooth", price: 60000, enabled: true },
    { id: "bridge", name: "브리지", unit: "perTooth", price: 60000, enabled: true },
    { id: "inlay", name: "인레이", unit: "perTooth", price: 50000, enabled: true },
    { id: "pontic", name: "Pontic", unit: "perTooth", price: 40000, enabled: true },
    { id: "retainer", name: "유지장치", unit: "perSet", price: 40000, enabled: true },
    {
      id: "removableTemp3",
      name: "임시치아",
      unit: "perNTeeth",
      price: 30000,
      enabled: true,
      tiers: [{ n: 3, price: 30000, remake: 0 }],
    },
    {
      id: "removableTemp6",
      name: "임시치아",
      unit: "perNTeeth",
      price: 50000,
      enabled: true,
      tiers: [{ n: 6, price: 50000, remake: 0 }],
    },
  ];
}

export function bandFromAdminBase(basePrice, spread = DEFAULT_SPREAD) {
  const base = Math.max(0, Math.round(Number(basePrice) || 0));
  const s = Number.isFinite(Number(spread)) ? Math.max(0, Number(spread)) : DEFAULT_SPREAD;
  const min = floorToFeeStep(base * (1 - s));
  const max = floorToFeeStep(base * (1 + s));
  return {
    min: Math.min(MAX_UNIT_FEE, Math.max(0, min)),
    max: Math.min(MAX_UNIT_FEE, Math.max(min, max)),
  };
}

export function normalizeCatalogItems(catalog) {
  const list = Array.isArray(catalog) && catalog.length
    ? catalog
    : fallbackAbutsLabFeeCatalog();
  return list
    .filter((item) => item && item.enabled !== false && String(item.name || "").trim())
    .map((item, index) => ({
      id: String(item.id || `item-${index + 1}`).trim() || `item-${index + 1}`,
      name: String(item.name || "").trim(),
      unit: String(item.unit || "perTooth").trim() || "perTooth",
      price: Math.max(0, Math.round(Number(item.price) || 0)),
      enabled: true,
      tiers: Array.isArray(item.tiers) ? item.tiers : [],
    }));
}

export function buildDefaultAutoMatchBudgetItems(catalog) {
  const items = {};
  for (const row of normalizeCatalogItems(catalog)) {
    items[row.id] = bandFromAdminBase(row.price);
  }
  return items;
}

export function normalizeAutoMatchBudgetBand(raw) {
  if (raw == null || typeof raw !== "object") return null;
  const minRaw = Number(raw.min ?? raw.minLabFee);
  const maxRaw = Number(raw.max ?? raw.maxLabFee);
  if (!Number.isFinite(maxRaw)) return null;
  const max = Math.min(MAX_UNIT_FEE, Math.max(0, floorToFeeStep(maxRaw)));
  if (max <= 0) return null;
  const min = Number.isFinite(minRaw)
    ? Math.min(max, Math.max(0, floorToFeeStep(minRaw)))
    : 0;
  return { min, max };
}

/**
 * @returns {{
 *   version: 2,
 *   items: Record<string, { min: number, max: number }>,
 *   minLabFee?: number,
 *   maxLabFee?: number,
 * } | null}
 */
export function normalizeAutoMatchBudget(raw, catalog) {
  if (raw == null || typeof raw !== "object") return null;

  const hasLegacyTotalOnly =
    (raw.minLabFee != null || raw.maxLabFee != null) &&
    raw.items == null &&
    !AUTO_MATCH_BUDGET_KEYS.some((key) => raw[key] != null);
  if (hasLegacyTotalOnly) return null;

  const srcItems =
    raw.items && typeof raw.items === "object" ? raw.items : raw;

  const catalogIds = new Set(normalizeCatalogItems(catalog).map((row) => row.id));
  const items = {};
  let any = false;

  for (const [key, value] of Object.entries(srcItems || {})) {
    if (key === "version" || key === "minLabFee" || key === "maxLabFee" || key === "items") {
      continue;
    }
    if (catalogIds.size && !catalogIds.has(key) && !AUTO_MATCH_BUDGET_KEYS.includes(key)) {
      // 카탈로그에 없는 저장값은 보존하되, 카탈로그 id만 필수로 봄
    }
    const band = normalizeAutoMatchBudgetBand(value);
    if (!band) continue;
    items[key] = band;
    any = true;
  }

  if (!any) return null;

  const out = { version: 2, items };
  const caseMin = Number(raw.minLabFee);
  const caseMax = Number(raw.maxLabFee);
  if (Number.isFinite(caseMax) && caseMax > 0) {
    out.maxLabFee = Math.max(0, Math.round(caseMax));
    out.minLabFee = Number.isFinite(caseMin)
      ? Math.min(out.maxLabFee, Math.max(0, Math.round(caseMin)))
      : 0;
  }
  return out;
}

export function isAutoMatchBudgetConfigured(budget, catalog) {
  const normalized = normalizeAutoMatchBudget(budget, catalog);
  if (!normalized) return false;
  const rows = normalizeCatalogItems(catalog);
  if (!rows.length) return false;
  return rows.every((row) => {
    const band = normalized.items[row.id];
    return band && band.max > 0;
  });
}

/** 설정/모달용 — 카탈로그 항목마다 저장값 또는 ±40% */
export function resolveAutoMatchBudgetOrDefaults(raw, catalog) {
  const rows = normalizeCatalogItems(catalog);
  const normalized = normalizeAutoMatchBudget(raw, catalog);
  const items = {};
  for (const row of rows) {
    const saved = normalized?.items?.[row.id];
    items[row.id] = saved && saved.max > 0 ? saved : bandFromAdminBase(row.price);
  }
  return { version: 2, items };
}

export function isLabUnitPricesWithinAutoMatchBudget(
  unitPricesById,
  budget,
  requiredIds,
  catalog,
) {
  const normalized = normalizeAutoMatchBudget(budget, catalog);
  if (!normalized) return false;
  const ids = Array.isArray(requiredIds) ? requiredIds : [];
  if (ids.length === 0) return true;

  for (const id of ids) {
    const band = normalized.items[id];
    if (!band) return false;
    const price = Math.max(0, Math.round(Number(unitPricesById?.[id] || 0)));
    if (price < band.min || price > band.max) return false;
  }
  return true;
}

/** 할증 배수 반영 단가(원 단위 반올림). 예산 비교 SSOT. */
export function scaleLabUnitPricesByMultiplier(unitPrices, labFeeMultiplier) {
  const n = Number(labFeeMultiplier);
  const m =
    !Number.isFinite(n) || n <= 1
      ? 1
      : Math.min(5, Math.round(n * 100) / 100);
  const src = unitPrices && typeof unitPrices === "object" ? unitPrices : {};
  if (m === 1) return { ...src };
  const out = {};
  for (const [id, price] of Object.entries(src)) {
    out[id] = Math.max(0, Math.round(Number(price || 0) * m));
  }
  return out;
}

/** 견적용 가상 스케줄 — 카탈로그 items의 min/max 단가 */
export function buildItemsScheduleFromAutoMatchBudget(budget, catalog, side = "max") {
  const rows = normalizeCatalogItems(catalog);
  const normalized = resolveAutoMatchBudgetOrDefaults(budget, catalog);
  return {
    active: true,
    items: rows.map((row) => {
      const band = normalized.items[row.id] || bandFromAdminBase(row.price);
      const price = side === "min" ? band.min : band.max;
      return {
        ...row,
        price,
        remake: 0,
        enabled: true,
        tiers:
          row.unit === "perNTeeth"
            ? (row.tiers?.length
                ? row.tiers.map((tier) => ({
                    ...tier,
                    price,
                    remake: 0,
                  }))
                : [{ n: 3, price, remake: 0 }])
            : [],
      };
    }),
  };
}

/** @deprecated 레거시 키 스케줄 — 카탈로그 id가 crown 등일 때만 */
export function buildScheduleFromAutoMatchBudget(budget, side = "max", catalog) {
  const itemsSchedule = buildItemsScheduleFromAutoMatchBudget(
    budget,
    catalog,
    side,
  );
  const schedule = {};
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    const item = itemsSchedule.items.find((row) => row.id === key);
    schedule[key] = item
      ? item.price
      : side === "min"
        ? 0
        : ADMIN_LAB_FEE_BASE[key] || 0;
  }
  return { ...schedule, ...itemsSchedule };
}

export function isLabFeeWithinAutoMatchBudget(_labFeeTotal, budget, catalog) {
  return isAutoMatchBudgetConfigured(budget, catalog);
}
