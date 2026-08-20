// related files:
// - web/backend/utils/practiceTransferAutoMatchBudget.js
// - web/backend/utils/abutsLabFeeSchedule.js
// - web/backend/utils/practiceLabRating.js
// - web/frontend/src/shared/practice/autoMatchBudget.ts
//
// 자동매칭 기공비 — v4 플랫폼 고정가(카탈로그 평균, 별점 배수 없음). 별점은 적격 게이트만.
// 레거시 v2/v3(항목 밴드·min%/max%)는 읽기 호환만.
// - 2026-08-16: 모달은 min%/max%만 설정. 기본 80%~120%.
// - 2026-08-16: % 예산 normalize 시 견적 합산 minLabFee/maxLabFee 보존.
// - 2026-08-16: v4 고정가. 1→×0.8 / 2→×0.9 / 3→×1 / 4→×1.1 / 5→×1.2. 1천원 올림.
// - 2026-08-16: v4 별점 하한~상한 → 항목 min/max(수락 전 견적 구간).
// - 2026-08-16: buildScheduleFromAutoMatchBudgetAtStars — 기공소 유효 별점 확정 스케줄.

import {
  DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  clampLabStarsToAutoMatchBand,
  feeMultiplierForStars,
  resolveAutoMatchEligibleStarBand,
} from "./practiceLabRating.js";

const MAX_UNIT_FEE = 50_000_000;
/** @deprecated 레거시 v3 */
export const DEFAULT_MIN_PCT = 80;
/** @deprecated 레거시 v3 */
export const DEFAULT_MAX_PCT = 120;
const FEE_STEP = 1000;
const MAX_PCT = 500;

/** 1000원 단위 절사 (미만 버림) — 레거시 */
export function floorToFeeStep(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / FEE_STEP) * FEE_STEP;
}

/** 1000원 단위 올림 — v4 고정가 */
export function ceilToFeeStep(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / FEE_STEP) * FEE_STEP;
}

/** 카탈로그 없을 때 fallback (어벗츠 기본 수가와 동기화) */
export const ADMIN_LAB_FEE_BASE = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  retainer: 40000,
  removableTemp3: 30000,
  removableTemp6: 50000,
};

export const AUTO_MATCH_BUDGET_KEYS = [
  "crown",
  "bridge",
  "inlay",
  "retainer",
  "removableTemp3",
  "removableTemp6",
];

export const AUTO_MATCH_BUDGET_KEY_LABELS = {
  crown: "크라운",
  bridge: "브리지",
  inlay: "인레이",
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

/**
 * @returns {{ minPct: number, maxPct: number } | null}
 */
export function normalizeAutoMatchBudgetPct(raw) {
  if (raw == null || typeof raw !== "object") return null;
  const minRaw = Number(raw.minPct ?? raw.minPercent);
  const maxRaw = Number(raw.maxPct ?? raw.maxPercent);
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null;
  const minPct = Math.min(MAX_PCT, Math.max(0, Math.round(minRaw)));
  const maxPct = Math.min(MAX_PCT, Math.max(minPct, Math.round(maxRaw)));
  if (maxPct <= 0) return null;
  return { minPct, maxPct };
}

/** 평균 수가(원) × min%/max% → 항목 밴드 (1000원 절사) */
export function bandFromAdminBase(
  basePrice,
  minPct = DEFAULT_MIN_PCT,
  maxPct = DEFAULT_MAX_PCT,
) {
  const base = Math.max(0, Math.round(Number(basePrice) || 0));
  const minP = Number.isFinite(Number(minPct))
    ? Math.max(0, Number(minPct))
    : DEFAULT_MIN_PCT;
  const maxP = Number.isFinite(Number(maxPct))
    ? Math.max(minP, Number(maxPct))
    : DEFAULT_MAX_PCT;
  const min = floorToFeeStep(base * (minP / 100));
  const max = floorToFeeStep(base * (maxP / 100));
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
    .filter((item) => {
      const id = String(item.id || "").trim().toLowerCase();
      const name = String(item.name || "").trim();
      return id !== "pontic" && !/^pontic$/i.test(name);
    })
    .map((item, index) => ({
      id: String(item.id || `item-${index + 1}`).trim() || `item-${index + 1}`,
      name: String(item.name || "").trim(),
      unit: String(item.unit || "perTooth").trim() || "perTooth",
      price: Math.max(0, Math.round(Number(item.price) || 0)),
      enabled: true,
      tiers: Array.isArray(item.tiers) ? item.tiers : [],
    }));
}

export function buildDefaultAutoMatchBudgetItems(
  catalog,
  minPct = DEFAULT_MIN_PCT,
  maxPct = DEFAULT_MAX_PCT,
) {
  const items = {};
  for (const row of normalizeCatalogItems(catalog)) {
    items[row.id] = bandFromAdminBase(row.price, minPct, maxPct);
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
 *   version: 2 | 3 | 4,
 *   stars?: number,
 *   feeMultiplier?: number,
 *   minPct?: number,
 *   maxPct?: number,
 *   items: Record<string, { min: number, max: number }>,
 *   minLabFee?: number,
 *   maxLabFee?: number,
 * } | null}
 */
/** 견적 합산 하한·상한(케이스별). % 예산에도 보존해야 툴팁 구간 표시가 유지된다. */
function attachCaseLabFeeTotals(out, raw) {
  const caseMax = Number(raw?.maxLabFee);
  const caseMin = Number(raw?.minLabFee);
  if (!Number.isFinite(caseMax) || caseMax <= 0) return out;
  out.maxLabFee = Math.max(0, Math.round(caseMax));
  out.minLabFee = Number.isFinite(caseMin)
    ? Math.min(out.maxLabFee, Math.max(0, Math.round(caseMin)))
    : 0;
  return out;
}

/** 카탈로그 평균 × 별점 배수 → 항목별 고정가(min=max, 1천원 올림) */
export function buildFixedAutoMatchBudgetItems(catalog, feeMultiplier = 1) {
  const m =
    Number.isFinite(Number(feeMultiplier)) && Number(feeMultiplier) > 0
      ? Number(feeMultiplier)
      : 1;
  const items = {};
  for (const row of normalizeCatalogItems(catalog)) {
    const fee = Math.min(
      MAX_UNIT_FEE,
      Math.max(0, ceilToFeeStep(row.price * m)),
    );
    items[row.id] = { min: fee, max: fee };
  }
  return items;
}

/** 하한·상한 별점 배수 → 항목별 min/max 기공비 */
export function buildStarBandAutoMatchBudgetItems(catalog, minStars, maxStars) {
  const band = resolveAutoMatchEligibleStarBand({ minStars, maxStars });
  const minM = feeMultiplierForStars(band.minStars);
  const maxM = feeMultiplierForStars(band.maxStars);
  const items = {};
  for (const row of normalizeCatalogItems(catalog)) {
    const lo = Math.min(
      MAX_UNIT_FEE,
      Math.max(0, ceilToFeeStep(row.price * minM)),
    );
    const hi = Math.min(
      MAX_UNIT_FEE,
      Math.max(0, ceilToFeeStep(row.price * maxM)),
    );
    items[row.id] = { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  return items;
}

/** v4 SSOT — 별점 하한~상한 → 기공비 구간 */
export function resolveAutoMatchBudgetFromStarBand(
  { minStars, maxStars } = {},
  catalog,
) {
  const band = resolveAutoMatchEligibleStarBand({ minStars, maxStars });
  return {
    version: 4,
    stars: band.minStars,
    maxStars: band.maxStars,
    feeMultiplier: feeMultiplierForStars(band.minStars),
    items: buildStarBandAutoMatchBudgetItems(
      catalog,
      band.minStars,
      band.maxStars,
    ),
  };
}

/** @deprecated 단일 별점 — resolveAutoMatchBudgetFromStarBand 사용 */
export function resolveAutoMatchBudgetFromStars(stars, catalog) {
  return resolveAutoMatchBudgetFromStarBand(
    { minStars: stars, maxStars: stars },
    catalog,
  );
}

export function normalizeAutoMatchBudget(raw, catalog) {
  if (raw == null || typeof raw !== "object") return null;

  const version = Number(raw.version);
  if (version === 4 || (raw.stars != null && raw.feeMultiplier != null)) {
    const starBand = resolveAutoMatchEligibleStarBand({
      minStars: raw.stars ?? DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
      maxStars:
        raw.maxStars != null
          ? raw.maxStars
          : raw.stars ?? DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
    });
    return attachCaseLabFeeTotals(
      {
        version: 4,
        stars: starBand.minStars,
        maxStars: starBand.maxStars,
        feeMultiplier: feeMultiplierForStars(starBand.minStars),
        items: buildStarBandAutoMatchBudgetItems(
          catalog,
          starBand.minStars,
          starBand.maxStars,
        ),
      },
      raw,
    );
  }

  const pct = normalizeAutoMatchBudgetPct(raw);
  if (pct) {
    return attachCaseLabFeeTotals(
      {
        version: 3,
        minPct: pct.minPct,
        maxPct: pct.maxPct,
        items: buildDefaultAutoMatchBudgetItems(catalog, pct.minPct, pct.maxPct),
      },
      raw,
    );
  }

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
    if (key === "minPct" || key === "maxPct" || key === "minPercent" || key === "maxPercent") {
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

  return attachCaseLabFeeTotals({ version: 2, items }, raw);
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

/**
 * 설정/견적용.
 * - opts.minStars/maxStars → 별점 대역 v4
 * - v4(stars[/maxStars]) → 고정가 구간
 * - 레거시 raw → 읽기 호환
 * - 미설정 → 기본 3~4점
 */
export function resolveAutoMatchBudgetOrDefaults(raw, catalog, opts = {}) {
  if (opts.minStars != null || opts.maxStars != null) {
    return resolveAutoMatchBudgetFromStarBand(
      {
        minStars: opts.minStars ?? DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
        maxStars: opts.maxStars ?? DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
      },
      catalog,
    );
  }

  const normalized = normalizeAutoMatchBudget(raw, catalog);
  if (normalized?.version === 4) return normalized;

  if (normalized?.version === 3 || normalized?.version === 2) {
    return normalized;
  }

  return resolveAutoMatchBudgetFromStarBand(
    {
      minStars: DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
      maxStars: DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
    },
    catalog,
  );
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

/**
 * 자동매칭 가상 스케줄(수신 견적·수락 청구). 별점 배수 없이 카탈로그 평균(1천원 올림).
 */
export function buildScheduleFromAutoMatchBudgetAtStars(
  budget,
  labStars,
  catalog,
) {
  const normalized = resolveAutoMatchBudgetOrDefaults(budget, catalog);
  const band = resolveAutoMatchEligibleStarBand({
    minStars: normalized.stars,
    maxStars: normalized.maxStars ?? normalized.stars,
  });
  const labEff = clampLabStarsToAutoMatchBand(labStars, band);
  const m = feeMultiplierForStars(labEff);
  const rows = normalizeCatalogItems(catalog);
  const itemsSchedule = {
    active: true,
    items: rows.map((row) => {
      const price = Math.min(
        MAX_UNIT_FEE,
        Math.max(0, ceilToFeeStep(Number(row.price || 0) * m)),
      );
      return {
        ...row,
        price,
        remake: 0,
        enabled: true,
        tiers:
          row.unit === "perNTeeth"
            ? row.tiers?.length
              ? row.tiers.map((tier) => ({
                  ...tier,
                  price,
                  remake: 0,
                }))
              : [{ n: 3, price, remake: 0 }]
            : [],
      };
    }),
  };
  const schedule = {};
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    const item = itemsSchedule.items.find((row) => row.id === key);
    schedule[key] = item ? item.price : ADMIN_LAB_FEE_BASE[key] || 0;
  }
  return { ...schedule, ...itemsSchedule };
}

export function isLabFeeWithinAutoMatchBudget(_labFeeTotal, budget, catalog) {
  return isAutoMatchBudgetConfigured(budget, catalog);
}
