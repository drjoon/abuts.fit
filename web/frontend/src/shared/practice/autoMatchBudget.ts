// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/practice/practiceLabRating.ts
// change-log:
// - 2026-08-16: 모달은 min%/max%만. 기본 80%~120%. 카탈로그(인증 기공소 수가 평균)×%.
// - 2026-08-16: % 예산 normalize 시 견적 합산 minLabFee/maxLabFee 보존(툴팁 구간).
// - 2026-08-16: v4 고정가(평균×별점배수). 기공비 범위 UI 제거.

import {
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  feeMultiplierForStars,
  normalizeAutoMatchMinLabRating,
} from "@/shared/practice/practiceLabRating";

export const ADMIN_LAB_FEE_BASE = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  retainer: 40000,
  removableTemp3: 30000,
  removableTemp6: 50000,
} as const;

export const AUTO_MATCH_BUDGET_KEYS = [
  "crown",
  "bridge",
  "inlay",
  "pontic",
  "retainer",
  "removableTemp3",
  "removableTemp6",
] as const;

export type AutoMatchBudgetKey = (typeof AUTO_MATCH_BUDGET_KEYS)[number];

export const AUTO_MATCH_BUDGET_KEY_LABELS: Record<AutoMatchBudgetKey, string> = {
  crown: "크라운",
  bridge: "브리지",
  inlay: "인레이",
  pontic: "Pontic",
  retainer: "유지장치",
  removableTemp3: "임시치아 (3치 이하)",
  removableTemp6: "임시치아 (6치 이하)",
};

/** 어벗츠 수가 카탈로그 항목(자동매칭 모달 SSOT) */
export type AbutsLabFeeCatalogItem = {
  id: string;
  name: string;
  unit?: string;
  price: number;
  enabled?: boolean;
  tiers?: Array<{ n?: number; price?: number; remake?: number }>;
};

export type AutoMatchBudgetBand = { min: number; max: number };

export type AutoMatchBudgetPct = { minPct: number; maxPct: number };

export type PracticeTransferAutoMatchBudget = {
  version?: 2 | 3 | 4;
  /** v4: 선택 최소 별점(3~5) */
  stars?: number;
  /** v4: 평균 대비 배수 */
  feeMultiplier?: number;
  /** @deprecated 레거시 v3 */
  minPct?: number;
  /** @deprecated 레거시 v3 */
  maxPct?: number;
  items: Record<string, AutoMatchBudgetBand>;
  minLabFee?: number;
  maxLabFee?: number;
};

const MAX_UNIT_FEE = 50_000_000;
/** @deprecated 레거시 v3 */
export const DEFAULT_MIN_PCT = 80;
/** @deprecated 레거시 v3 */
export const DEFAULT_MAX_PCT = 120;
const FEE_STEP = 1000;
const MAX_PCT = 500;

/** 1000원 단위 절사 (미만 버림) — 레거시 */
export const floorToFeeStep = (value: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / FEE_STEP) * FEE_STEP;
};

/** 1000원 단위 올림 — v4 */
export const ceilToFeeStep = (value: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / FEE_STEP) * FEE_STEP;
};

export const normalizeAutoMatchBudgetPct = (
  raw: unknown,
): AutoMatchBudgetPct | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const minRaw = Number(r.minPct ?? r.minPercent);
  const maxRaw = Number(r.maxPct ?? r.maxPercent);
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null;
  const minPct = Math.min(MAX_PCT, Math.max(0, Math.round(minRaw)));
  const maxPct = Math.min(MAX_PCT, Math.max(minPct, Math.round(maxRaw)));
  if (maxPct <= 0) return null;
  return { minPct, maxPct };
};

/** 평균 수가(원) × min%/max% → 항목 밴드 — 레거시 */
export const bandFromAdminBase = (
  basePrice: number,
  minPct: number = DEFAULT_MIN_PCT,
  maxPct: number = DEFAULT_MAX_PCT,
): AutoMatchBudgetBand => {
  const base = Math.max(0, Math.round(Number(basePrice) || 0));
  const minP = Number.isFinite(minPct) ? Math.max(0, minPct) : DEFAULT_MIN_PCT;
  const maxP = Number.isFinite(maxPct)
    ? Math.max(minP, maxPct)
    : DEFAULT_MAX_PCT;
  const min = floorToFeeStep(base * (minP / 100));
  const max = floorToFeeStep(base * (maxP / 100));
  return {
    min: Math.min(MAX_UNIT_FEE, Math.max(0, min)),
    max: Math.min(MAX_UNIT_FEE, Math.max(min, max)),
  };
};

export const fallbackAbutsLabFeeCatalog = (): AbutsLabFeeCatalogItem[] => [
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
    tiers: [{ n: 3, price: 30000 }],
  },
  {
    id: "removableTemp6",
    name: "임시치아",
    unit: "perNTeeth",
    price: 50000,
    enabled: true,
    tiers: [{ n: 6, price: 50000 }],
  },
];

export const normalizeAbutsLabFeeCatalog = (
  catalog?: AbutsLabFeeCatalogItem[] | null,
): AbutsLabFeeCatalogItem[] => {
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
};

export const catalogItemLabel = (item: AbutsLabFeeCatalogItem): string => {
  if (item.unit === "perNTeeth") {
    const n = Number(item.tiers?.[0]?.n);
    if (Number.isFinite(n) && n > 0) return `${item.name} (${n}치 이하)`;
  }
  return item.name;
};

export const buildDefaultAutoMatchBudgetItems = (
  catalog?: AbutsLabFeeCatalogItem[] | null,
  minPct: number = DEFAULT_MIN_PCT,
  maxPct: number = DEFAULT_MAX_PCT,
): Record<string, AutoMatchBudgetBand> => {
  const items: Record<string, AutoMatchBudgetBand> = {};
  for (const row of normalizeAbutsLabFeeCatalog(catalog)) {
    items[row.id] = bandFromAdminBase(row.price, minPct, maxPct);
  }
  return items;
};

export const buildFixedAutoMatchBudgetItems = (
  catalog?: AbutsLabFeeCatalogItem[] | null,
  feeMultiplier: number = 1,
): Record<string, AutoMatchBudgetBand> => {
  const m =
    Number.isFinite(feeMultiplier) && feeMultiplier > 0 ? feeMultiplier : 1;
  const items: Record<string, AutoMatchBudgetBand> = {};
  for (const row of normalizeAbutsLabFeeCatalog(catalog)) {
    const fee = Math.min(
      MAX_UNIT_FEE,
      Math.max(0, ceilToFeeStep(row.price * m)),
    );
    items[row.id] = { min: fee, max: fee };
  }
  return items;
};

export const normalizeAutoMatchBudgetBand = (
  raw: unknown,
): AutoMatchBudgetBand | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const maxRaw = Number(r.max ?? r.maxLabFee);
  if (!Number.isFinite(maxRaw)) return null;
  const max = Math.min(MAX_UNIT_FEE, Math.max(0, floorToFeeStep(maxRaw)));
  if (max <= 0) return null;
  const minRaw = Number(r.min ?? r.minLabFee);
  const min = Number.isFinite(minRaw)
    ? Math.min(max, Math.max(0, floorToFeeStep(minRaw)))
    : 0;
  return { min, max };
};

/** 견적 합산 하한·상한(케이스별). */
const attachCaseLabFeeTotals = (
  out: PracticeTransferAutoMatchBudget,
  raw: Record<string, unknown>,
): PracticeTransferAutoMatchBudget => {
  const caseMax = Number(raw.maxLabFee);
  const caseMin = Number(raw.minLabFee);
  if (!Number.isFinite(caseMax) || caseMax <= 0) return out;
  out.maxLabFee = Math.max(0, Math.round(caseMax));
  out.minLabFee = Number.isFinite(caseMin)
    ? Math.min(out.maxLabFee, Math.max(0, Math.round(caseMin)))
    : 0;
  return out;
};

export const resolveAutoMatchBudgetFromStars = (
  stars: unknown,
  catalog?: AbutsLabFeeCatalogItem[] | null,
): PracticeTransferAutoMatchBudget => {
  const normalizedStars = normalizeAutoMatchMinLabRating(stars);
  const feeMultiplier = feeMultiplierForStars(normalizedStars);
  return {
    version: 4,
    stars: normalizedStars,
    feeMultiplier,
    items: buildFixedAutoMatchBudgetItems(catalog, feeMultiplier),
  };
};

export const normalizePracticeTransferAutoMatchBudget = (
  raw: unknown,
  catalog?: AbutsLabFeeCatalogItem[] | null,
): PracticeTransferAutoMatchBudget | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const version = Number(r.version);
  if (version === 4 || (r.stars != null && r.feeMultiplier != null)) {
    const stars = normalizeAutoMatchMinLabRating(
      r.stars ?? DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
    );
    const feeMultiplier =
      Number.isFinite(Number(r.feeMultiplier)) && Number(r.feeMultiplier) > 0
        ? Number(r.feeMultiplier)
        : feeMultiplierForStars(stars);
    return attachCaseLabFeeTotals(
      {
        version: 4,
        stars,
        feeMultiplier,
        items: buildFixedAutoMatchBudgetItems(catalog, feeMultiplier),
      },
      r,
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
      r,
    );
  }

  const hasLegacyTotalOnly =
    (r.minLabFee != null || r.maxLabFee != null) &&
    r.items == null &&
    !AUTO_MATCH_BUDGET_KEYS.some((key) => r[key] != null);
  if (hasLegacyTotalOnly) return null;

  const srcItems =
    r.items && typeof r.items === "object"
      ? (r.items as Record<string, unknown>)
      : r;

  const catalogIds = new Set(
    normalizeAbutsLabFeeCatalog(catalog).map((row) => row.id),
  );
  const items: Record<string, AutoMatchBudgetBand> = {};
  let any = false;
  for (const [key, value] of Object.entries(srcItems || {})) {
    if (
      key === "version" ||
      key === "minLabFee" ||
      key === "maxLabFee" ||
      key === "items" ||
      key === "minPct" ||
      key === "maxPct" ||
      key === "minPercent" ||
      key === "maxPercent" ||
      key === "stars" ||
      key === "feeMultiplier"
    ) {
      continue;
    }
    if (
      catalogIds.size &&
      !catalogIds.has(key) &&
      !(AUTO_MATCH_BUDGET_KEYS as readonly string[]).includes(key)
    ) {
      // skip extras
    }
    const band = normalizeAutoMatchBudgetBand(value);
    if (!band) continue;
    items[key] = band;
    any = true;
  }
  if (!any) return null;

  return attachCaseLabFeeTotals({ version: 2, items }, r);
};

export const resolveAutoMatchBudgetOrDefaults = (
  raw: unknown,
  catalog?: AbutsLabFeeCatalogItem[] | null,
  opts?: { minStars?: unknown },
): PracticeTransferAutoMatchBudget => {
  if (opts?.minStars != null) {
    return resolveAutoMatchBudgetFromStars(opts.minStars, catalog);
  }

  const normalized = normalizePracticeTransferAutoMatchBudget(raw, catalog);
  if (normalized?.version === 4) return normalized;
  if (normalized?.version === 3 || normalized?.version === 2) {
    return normalized;
  }

  return resolveAutoMatchBudgetFromStars(
    DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
    catalog,
  );
};

/** @deprecated 레거시 모달용 */
export const resolveAutoMatchBudgetPctOrDefaults = (
  raw: unknown,
): AutoMatchBudgetPct => {
  return (
    normalizeAutoMatchBudgetPct(raw) || {
      minPct: DEFAULT_MIN_PCT,
      maxPct: DEFAULT_MAX_PCT,
    }
  );
};
