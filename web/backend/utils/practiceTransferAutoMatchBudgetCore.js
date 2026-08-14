// related files:
// - web/backend/utils/practiceTransferAutoMatchBudget.js
// - web/backend/utils/labFeeSchedule.js (LAB_FEE_SCHEDULE_DEFAULTS와 동기화)
// - web/frontend/src/shared/practice/autoMatchBudget.ts
//
// 자동매칭 기공비 예산 — 항목별 min/max (순수, DB 의존 없음).
// 기본값: 어벗츠 관리자 기본 수가 ±20%, Math.ceil.

const MAX_UNIT_FEE = 50_000_000;
const DEFAULT_SPREAD = 0.2;

/** SSOT 동기화: web/backend/utils/labFeeSchedule.js LAB_FEE_SCHEDULE_DEFAULTS */
export const ADMIN_LAB_FEE_BASE = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  retainer: 40000,
  removableTemp3: 30000,
  removableTemp6: 50000,
};

/** 자동매칭 예산에 쓰는 기공 항목(어벗츠/기공소 어벗 단가 키 제외) */
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

/** @returns {{ min: number, max: number }} */
export function bandFromAdminBase(basePrice, spread = DEFAULT_SPREAD) {
  const base = Math.max(0, Math.round(Number(basePrice) || 0));
  const s = Number.isFinite(Number(spread)) ? Math.max(0, Number(spread)) : DEFAULT_SPREAD;
  const min = Math.ceil(base * (1 - s));
  const max = Math.ceil(base * (1 + s));
  return {
    min: Math.min(MAX_UNIT_FEE, Math.max(0, min)),
    max: Math.min(MAX_UNIT_FEE, Math.max(min, max)),
  };
}

export function buildDefaultAutoMatchBudgetItems(
  adminDefaults = ADMIN_LAB_FEE_BASE,
) {
  const items = {};
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    const base = Number(adminDefaults?.[key] ?? ADMIN_LAB_FEE_BASE[key] ?? 0);
    items[key] = bandFromAdminBase(base);
  }
  return items;
}

/** @returns {{ min: number, max: number } | null} */
export function normalizeAutoMatchBudgetBand(raw) {
  if (raw == null || typeof raw !== "object") return null;
  const minRaw = Number(raw.min ?? raw.minLabFee);
  const maxRaw = Number(raw.max ?? raw.maxLabFee);
  if (!Number.isFinite(maxRaw)) return null;
  const max = Math.min(MAX_UNIT_FEE, Math.max(0, Math.ceil(maxRaw)));
  if (max <= 0) return null;
  const min = Number.isFinite(minRaw)
    ? Math.min(max, Math.max(0, Math.ceil(minRaw)))
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
export function normalizeAutoMatchBudget(raw) {
  if (raw == null || typeof raw !== "object") return null;

  // 레거시 총액만 있으면 미설정(모달이 관리자 ±20%로 채움)
  const hasLegacyTotalOnly =
    (raw.minLabFee != null || raw.maxLabFee != null) &&
    raw.items == null &&
    !AUTO_MATCH_BUDGET_KEYS.some((key) => raw[key] != null);
  if (hasLegacyTotalOnly) return null;

  const srcItems =
    raw.items && typeof raw.items === "object" ? raw.items : raw;

  const items = {};
  let any = false;
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    const band = normalizeAutoMatchBudgetBand(srcItems?.[key]);
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

export function isAutoMatchBudgetConfigured(budget) {
  const normalized = normalizeAutoMatchBudget(budget);
  if (!normalized) return false;
  return AUTO_MATCH_BUDGET_KEYS.every((key) => {
    const band = normalized.items[key];
    return band && band.max > 0;
  });
}

/** 설정 응답/모달용 — 비어 있으면 관리자 ±20%로 채운다. */
export function resolveAutoMatchBudgetOrDefaults(raw) {
  const normalized = normalizeAutoMatchBudget(raw);
  if (normalized && isAutoMatchBudgetConfigured(normalized)) {
    return normalized;
  }
  return {
    version: 2,
    items: buildDefaultAutoMatchBudgetItems(),
  };
}

/**
 * 기공소 단가(스케줄 키)가 항목별 예산 안인지.
 * @param {Record<string, number>} unitPrices - key → 원
 * @param {string[]} requiredKeys - 이번 의뢰에 쓰인 키
 */
export function isLabUnitPricesWithinAutoMatchBudget(
  unitPrices,
  budget,
  requiredKeys,
) {
  const normalized = normalizeAutoMatchBudget(budget);
  if (!normalized) return false;
  const keys = Array.isArray(requiredKeys) ? requiredKeys : [];
  if (keys.length === 0) return true;

  for (const key of keys) {
    if (!AUTO_MATCH_BUDGET_KEYS.includes(key)) continue;
    const band = normalized.items[key];
    if (!band) return false;
    const price = Math.max(0, Math.round(Number(unitPrices?.[key] || 0)));
    if (price < band.min || price > band.max) return false;
  }
  return true;
}

/** 견적/잔액용 — 항목 예산으로 합성한 가상 스케줄(min 또는 max). */
export function buildScheduleFromAutoMatchBudget(budget, side = "max") {
  const normalized = resolveAutoMatchBudgetOrDefaults(budget);
  const schedule = {};
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    const band = normalized.items[key];
    schedule[key] = side === "min" ? band.min : band.max;
  }
  return schedule;
}

/** @deprecated 항목별 모델 — 총액만으로는 판정하지 않음 */
export function isLabFeeWithinAutoMatchBudget(_labFeeTotal, budget) {
  return isAutoMatchBudgetConfigured(budget);
}
