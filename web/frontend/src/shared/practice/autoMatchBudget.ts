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

export type AutoMatchBudgetBand = { min: number; max: number };

export type PracticeTransferAutoMatchBudget = {
  version?: 2;
  items: Record<AutoMatchBudgetKey, AutoMatchBudgetBand>;
  minLabFee?: number;
  maxLabFee?: number;
};

const MAX_UNIT_FEE = 50_000_000;
const DEFAULT_SPREAD = 0.2;

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

export const buildDefaultAutoMatchBudgetItems = (): Record<
  AutoMatchBudgetKey,
  AutoMatchBudgetBand
> => {
  const items = {} as Record<AutoMatchBudgetKey, AutoMatchBudgetBand>;
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    items[key] = bandFromAdminBase(ADMIN_LAB_FEE_BASE[key]);
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

  const items = {} as Record<AutoMatchBudgetKey, AutoMatchBudgetBand>;
  let any = false;
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    const band = normalizeAutoMatchBudgetBand(srcItems[key]);
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
): PracticeTransferAutoMatchBudget => {
  const normalized = normalizePracticeTransferAutoMatchBudget(raw);
  if (
    normalized &&
    AUTO_MATCH_BUDGET_KEYS.every((key) => normalized.items[key]?.max > 0)
  ) {
    return normalized;
  }
  return { version: 2, items: buildDefaultAutoMatchBudgetItems() };
};
