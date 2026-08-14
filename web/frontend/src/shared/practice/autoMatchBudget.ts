// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/AutoMatchLabFeeBudgetDialog.tsx

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

export type PracticeTransferAutoMatchBudget = {
  version?: 2;
  items: Record<string, AutoMatchBudgetBand>;
  minLabFee?: number;
  maxLabFee?: number;
};

const MAX_UNIT_FEE = 50_000_000;
const DEFAULT_SPREAD = 0.1;

export const bandFromAdminBase = (
  basePrice: number,
  spread = DEFAULT_SPREAD,
): AutoMatchBudgetBand => {
  const base = Math.max(0, Math.round(Number(basePrice) || 0));
  const s = Number.isFinite(spread) ? Math.max(0, spread) : DEFAULT_SPREAD;
  const min = Math.ceil(base * (1 - s));
  const max = Math.ceil(base * (1 + s));
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
): Record<string, AutoMatchBudgetBand> => {
  const items: Record<string, AutoMatchBudgetBand> = {};
  for (const row of normalizeAbutsLabFeeCatalog(catalog)) {
    items[row.id] = bandFromAdminBase(row.price);
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
  const max = Math.min(MAX_UNIT_FEE, Math.max(0, Math.ceil(maxRaw)));
  if (max <= 0) return null;
  const minRaw = Number(r.min ?? r.minLabFee);
  const min = Number.isFinite(minRaw)
    ? Math.min(max, Math.max(0, Math.ceil(minRaw)))
    : 0;
  return { min, max };
};

export const normalizePracticeTransferAutoMatchBudget = (
  raw: unknown,
  catalog?: AbutsLabFeeCatalogItem[] | null,
): PracticeTransferAutoMatchBudget | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
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
      key === "items"
    ) {
      continue;
    }
    if (
      catalogIds.size &&
      !catalogIds.has(key) &&
      !(AUTO_MATCH_BUDGET_KEYS as readonly string[]).includes(key)
    ) {
      // keep unknown keys only if no catalog filter needed — skip extras
    }
    const band = normalizeAutoMatchBudgetBand(value);
    if (!band) continue;
    items[key] = band;
    any = true;
  }
  if (!any) return null;

  const out: PracticeTransferAutoMatchBudget = { version: 2, items };
  const caseMax = Number(r.maxLabFee);
  const caseMin = Number(r.minLabFee);
  if (Number.isFinite(caseMax) && caseMax > 0) {
    out.maxLabFee = Math.max(0, Math.round(caseMax));
    out.minLabFee = Number.isFinite(caseMin)
      ? Math.min(out.maxLabFee, Math.max(0, Math.round(caseMin)))
      : 0;
  }
  return out;
};

export const resolveAutoMatchBudgetOrDefaults = (
  raw: unknown,
  catalog?: AbutsLabFeeCatalogItem[] | null,
): PracticeTransferAutoMatchBudget => {
  const rows = normalizeAbutsLabFeeCatalog(catalog);
  const normalized = normalizePracticeTransferAutoMatchBudget(raw, catalog);
  const items: Record<string, AutoMatchBudgetBand> = {};
  for (const row of rows) {
    const saved = normalized?.items?.[row.id];
    items[row.id] =
      saved && saved.max > 0 ? saved : bandFromAdminBase(row.price);
  }
  return { version: 2, items };
};
