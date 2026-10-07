// related files:
// - web/backend/controllers/requests/utils.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// change-log:
// - 2026-10-07: 리메이크 SSOT — 어벗츠로부터(PTX)=무료, 어벗츠로(Request)=창 내 건당 1만원. 월 3건 무료 과금 퇴역.
// - 2026-10-07: (폐지) PTX·어벗츠 리메이크 KST 월 3건 무료·4건부터 1만원. freeRemakeYears 과금 퇴역.
// - 2026-09-21: 기공소 labFeeSchedule.freeRemakeYears — null=미설정·유료, 0=유료, 1+=N년 무료(레거시).
// - 2026-09-14: 리메이크 판정 창 90→180일(감지·수가 동일).
// - 2026-09-12: 리메이크 정책 SSOT — 치과로부터=무료, 어벗츠로=동일치식·창 내 1만원.

import { toKstYmd } from "./krBusinessDays.js";

/**
 * 레거시·어벗츠 Request(CA) 리메이크 매칭 창(일).
 * PTX 유사 케이스 감지는 FREE_REMAKE_YEARS_MAX 고정 상한.
 */
export const REMAKE_POLICY_WINDOW_DAYS = 180;

/** PTX 유사 케이스 감지 상한(년). 과금과 무관. */
export const FREE_REMAKE_YEARS_MAX = 30;

/**
 * @deprecated 과금 SSOT 아님. 레거시 문서·집계용.
 * 어벗츠로부터(PTX)=무료, 어벗츠로=건당 ABUTS_REMAKE_FIXED_AMOUNT.
 */
export const MONTHLY_REMAKE_FREE_LIMIT = 3;

/** 어벗츠로(Request) 리메이크 고객 단가(원). 배송비 별도. */
export const ABUTS_REMAKE_FIXED_AMOUNT = 10000;

export const ABUTS_REMAKE_PRICE_RULE = "remake_fixed_10000";
/** @deprecated 과금 SSOT 아님. 레거시 price.rule */
export const ABUTS_REMAKE_MONTHLY_FREE_RULE = "remake_monthly_free_3";

/** @deprecated 과금 SSOT 아님. 레거시 월 쿼터 집계용 */
export const REMAKE_PRICE_RULES_FOR_MONTHLY_COUNT = [
  ABUTS_REMAKE_MONTHLY_FREE_RULE,
  "remake_general_pricing",
  ABUTS_REMAKE_PRICE_RULE,
];

/**
 * @deprecated 과금 SSOT 아님. 스키마·레거시 읽기용만 유지.
 * null = 미설정. 0 = 유료. 1+ = N년.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeFreeRemakeYears(raw) {
  if (raw == null || raw === "") return null;
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(FREE_REMAKE_YEARS_MAX, n);
}

/**
 * @deprecated 과금 SSOT 아님. 스키마·레거시 읽기용만 유지.
 */
export function parseFreeRemakeYearsInput(raw, fallback = null) {
  if (raw === undefined) return normalizeFreeRemakeYears(fallback);
  if (raw === null || raw === "") return null;
  return normalizeFreeRemakeYears(raw);
}

/**
 * KST 달력 기준 이번 달 [start, nextMonthStart).
 * @param {Date} [now]
 * @returns {{ start: Date, nextStart: Date, year: number, month: number }}
 */
export function kstMonthBounds(now = new Date()) {
  const nowYmd = toKstYmd(now) || toKstYmd(new Date());
  const [year, month] = String(nowYmd)
    .split("-")
    .map((v) => Number(v || 0));
  const y = Number.isFinite(year) ? year : new Date().getFullYear();
  const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  const startYmd = `${y}-${String(m).padStart(2, "0")}-01`;
  const start = new Date(`${startYmd}T00:00:00+09:00`);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextStartYmd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const nextStart = new Date(`${nextStartYmd}T00:00:00+09:00`);
  return { start, nextStart, year: y, month: m };
}

/**
 * @deprecated 과금 SSOT 아님. 레거시 월 쿼터 계산용.
 * @param {{ used?: number, limit?: number }} input
 * @returns {{ free: boolean, amount: number, rule: string, monthlyRemakeFreeLimit: number, monthlyRemakeUsed: number, monthlyRemakeFreeRemaining: number }}
 */
export function resolveMonthlyRemakePricing({
  used = 0,
  limit = MONTHLY_REMAKE_FREE_LIMIT,
} = {}) {
  const freeLimit = Math.max(0, Math.trunc(Number(limit) || 0));
  const monthlyRemakeUsed = Math.max(0, Math.trunc(Number(used) || 0));
  const monthlyRemakeFreeRemaining = Math.max(
    0,
    freeLimit - monthlyRemakeUsed,
  );
  const free = monthlyRemakeUsed < freeLimit;
  return {
    free,
    amount: free ? 0 : ABUTS_REMAKE_FIXED_AMOUNT,
    rule: free ? ABUTS_REMAKE_MONTHLY_FREE_RULE : ABUTS_REMAKE_PRICE_RULE,
    monthlyRemakeFreeLimit: freeLimit,
    monthlyRemakeUsed,
    monthlyRemakeFreeRemaining,
  };
}

/**
 * @deprecated 과금 SSOT 아님. N년 전 컷오프(레거시).
 * @param {number} years
 * @param {Date} [now]
 * @returns {Date|null}
 */
export function remakeFreeCutoffDateFromYears(years, now = new Date()) {
  const y = Math.trunc(Number(years));
  if (!Number.isFinite(y) || y <= 0) return null;
  const nowYmd = toKstYmd(now) || toKstYmd(new Date());
  const [Y, M, D] = String(nowYmd)
    .split("-")
    .map((part) => Number(part));
  if (![Y, M, D].every((n) => Number.isFinite(n))) return null;
  const targetYear = Y - y;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, M, 0)).getUTCDate();
  const day = Math.min(D, lastDayOfMonth);
  const mm = String(M).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${targetYear}-${mm}-${dd}T00:00:00+09:00`);
}

/**
 * KST 달력 기준 리메이크 컷오프(지금−REMAKE_POLICY_WINDOW_DAYS 00:00+09:00).
 * 어벗츠 Request(CA) 경로용.
 * @param {Date} [now]
 * @returns {Date}
 */
export function remakePolicyCutoffDate(now = new Date()) {
  const nowYmd = toKstYmd(now) || toKstYmd(new Date());
  const cutoff = new Date(`${nowYmd}T00:00:00+09:00`);
  cutoff.setDate(cutoff.getDate() - REMAKE_POLICY_WINDOW_DAYS);
  return cutoff;
}

/**
 * 어벗츠 Request(CA) — 고정 180일 창.
 * @param {Date|string|number|null|undefined} at
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isWithinRemakePolicyWindow(at, now = new Date()) {
  if (at == null || at === "") return false;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= remakePolicyCutoffDate(now).getTime();
}

/**
 * @deprecated 과금 SSOT 아님. freeRemakeYears 창(레거시).
 */
export function isWithinLabFreeRemakeWindow(
  at,
  freeRemakeYears,
  now = new Date(),
) {
  const years = normalizeFreeRemakeYears(freeRemakeYears);
  if (years == null || years <= 0) return false;
  if (at == null || at === "") return false;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = remakeFreeCutoffDateFromYears(years, now);
  if (!cutoff) return false;
  return d.getTime() >= cutoff.getTime();
}

/**
 * PTX 유사 케이스 감지 일수(고정 상한). freeRemakeYears 무시.
 * @param {unknown} [_freeRemakeYears] 레거시 인자 — 무시
 * @returns {number}
 */
export function freeRemakeDetectWindowDays(_freeRemakeYears) {
  void _freeRemakeYears;
  return Math.min(365 * FREE_REMAKE_YEARS_MAX, FREE_REMAKE_YEARS_MAX * 365);
}

/**
 * @param {{ baseAmount: number, quotedAt?: Date, monthlyRemakeUsed?: number, monthlyRemakeFreeLimit?: number, monthlyRemakeFreeRemaining?: number }} input
 */
export function buildAbutsRemakeFixedPrice({
  baseAmount,
  quotedAt = new Date(),
  monthlyRemakeUsed,
  monthlyRemakeFreeLimit = MONTHLY_REMAKE_FREE_LIMIT,
  monthlyRemakeFreeRemaining,
}) {
  const base = Math.max(0, Math.round(Number(baseAmount) || 0));
  const used =
    monthlyRemakeUsed == null
      ? undefined
      : Math.max(0, Math.trunc(Number(monthlyRemakeUsed) || 0));
  const remaining =
    monthlyRemakeFreeRemaining == null
      ? undefined
      : Math.max(0, Math.trunc(Number(monthlyRemakeFreeRemaining) || 0));
  return {
    baseAmount: base,
    discountAmount: Math.max(0, base - ABUTS_REMAKE_FIXED_AMOUNT),
    amount: ABUTS_REMAKE_FIXED_AMOUNT,
    currency: "KRW",
    rule: ABUTS_REMAKE_PRICE_RULE,
    discountMeta: {
      ...(used != null
        ? {
            monthlyRemakeFreeLimit,
            monthlyRemakeUsed: used,
            monthlyRemakeFreeRemaining:
              remaining != null
                ? remaining
                : Math.max(0, monthlyRemakeFreeLimit - used),
          }
        : {}),
    },
    quotedAt,
  };
}

/**
 * @param {{ baseAmount: number, quotedAt?: Date, monthlyRemakeUsed?: number, monthlyRemakeFreeLimit?: number, monthlyRemakeFreeRemaining?: number }} input
 */
export function buildAbutsRemakeMonthlyFreePrice({
  baseAmount,
  quotedAt = new Date(),
  monthlyRemakeUsed = 0,
  monthlyRemakeFreeLimit = MONTHLY_REMAKE_FREE_LIMIT,
  monthlyRemakeFreeRemaining,
}) {
  const base = Math.max(0, Math.round(Number(baseAmount) || 0));
  const used = Math.max(0, Math.trunc(Number(monthlyRemakeUsed) || 0));
  const limit = Math.max(0, Math.trunc(Number(monthlyRemakeFreeLimit) || 0));
  const remaining =
    monthlyRemakeFreeRemaining == null
      ? Math.max(0, limit - used)
      : Math.max(0, Math.trunc(Number(monthlyRemakeFreeRemaining) || 0));
  return {
    baseAmount: base,
    discountAmount: base,
    amount: 0,
    currency: "KRW",
    rule: ABUTS_REMAKE_MONTHLY_FREE_RULE,
    discountMeta: {
      monthlyRemakeFreeLimit: limit,
      monthlyRemakeUsed: used,
      monthlyRemakeFreeRemaining: remaining,
    },
    quotedAt,
  };
}

/**
 * @deprecated 과금 SSOT 아님. 어벗츠로는 buildAbutsRemakeFixedPrice.
 * @param {{ baseAmount: number, used: number, quotedAt?: Date, limit?: number }} input
 */
export function buildAbutsRemakePriceFromMonthlyUsage({
  baseAmount,
  used,
  quotedAt = new Date(),
  limit = MONTHLY_REMAKE_FREE_LIMIT,
}) {
  void used;
  void limit;
  return buildAbutsRemakeFixedPrice({
    baseAmount,
    quotedAt,
  });
}

/**
 * PTX 유료 리메이크 고정 견적(레거시·수동 고정가). 어벗츠로부터 기본은 LAB_FEE_REMAKE_FREE.
 * @param {number} [amount]
 */
export function buildFixedRemakeRetailFees(
  amount = ABUTS_REMAKE_FIXED_AMOUNT,
) {
  const total = Math.max(0, Math.round(Number(amount) || 0));
  return {
    labFeeTotal: total,
    labAbutmentTotal: 0,
    labAbutmentPending: false,
    abutmentRetailTotal: 0,
    abutmentQuotePending: false,
    abutmentQty: 0,
    total,
    labShippingFee: 0,
    labFeeMultiplier: 1,
    rushFeeMultiplier: 1,
    lines:
      total > 0
        ? [
            {
              toothNumber: "",
              prosthesisType: "리메이크비",
              labFee: total,
              labAbutmentFee: 0,
              labAbutmentPending: false,
              abutmentRetail: 0,
            },
          ]
        : [],
  };
}

/** PTX 월 리메이크 집계용 Mongo 필터 조각 */
export function practiceMonthlyRemakeMatchFilter({
  practiceAnchorId,
  start,
  nextStart,
  excludeTransferId = null,
}) {
  const filter = {
    practiceBusinessAnchorId: practiceAnchorId,
    status: { $nin: ["deleted", "canceled"] },
    createdAt: { $gte: start, $lt: nextStart },
    $or: [
      { "billing.isRemake": true },
      { "remake.sourceTransferMongoId": { $ne: null } },
      {
        "remake.sourceTransferId": {
          $exists: true,
          $nin: ["", null],
        },
      },
    ],
  };
  if (excludeTransferId) {
    filter._id = { $ne: excludeTransferId };
  }
  return filter;
}
