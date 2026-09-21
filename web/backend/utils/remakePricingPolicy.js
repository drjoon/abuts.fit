// related files:
// - web/backend/controllers/requests/utils.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// change-log:
// - 2026-09-21: 기공소 labFeeSchedule.freeRemakeYears — null=미설정·유료, 0=유료, 1+=N년 무료.
// - 2026-09-14: 리메이크 판정 창 90→180일(감지·수가 동일).
// - 2026-09-12: 리메이크 정책 SSOT — 치과로부터=무료, 어벗츠로=동일치식·창 내 1만원.

import { toKstYmd } from "./krBusinessDays.js";

/**
 * 레거시·어벗츠 Request(CA) 리메이크 매칭 창(일).
 * 치과→기공소 PTX 무료 창은 labFeeSchedule.freeRemakeYears.
 */
export const REMAKE_POLICY_WINDOW_DAYS = 180;

/** freeRemakeYears 상한(년) */
export const FREE_REMAKE_YEARS_MAX = 30;

/** 어벗츠로(Request) 리메이크 고객 단가(원). 배송비 별도. */
export const ABUTS_REMAKE_FIXED_AMOUNT = 10000;

export const ABUTS_REMAKE_PRICE_RULE = "remake_fixed_10000";

/**
 * null = 미설정(유료 + 설정 유도).
 * 0 = 항상 유료.
 * 1+ = 해당 년수 이내 무료.
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
 * 설정 UI·API용 — 미설정이면 null 유지.
 * body에 키가 없을 때 existing을 쓰려면 caller가 병합.
 */
export function parseFreeRemakeYearsInput(raw, fallback = null) {
  if (raw === undefined) return normalizeFreeRemakeYears(fallback);
  if (raw === null || raw === "") return null;
  return normalizeFreeRemakeYears(raw);
}

/**
 * KST 달력 기준 N년 전 00:00+09:00.
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
 * 치과→기공소 PTX 리메이크 무료 창.
 * freeRemakeYears null/0 → false(유료). 1+ → N년 이내면 true.
 * @param {Date|string|number|null|undefined} at
 * @param {unknown} freeRemakeYears
 * @param {Date} [now]
 * @returns {boolean}
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
 * 감지·후보 검색용 일수. 미설정이면 레거시 180일.
 * @param {unknown} freeRemakeYears
 * @returns {number}
 */
export function freeRemakeDetectWindowDays(freeRemakeYears) {
  const years = normalizeFreeRemakeYears(freeRemakeYears);
  if (years == null) return REMAKE_POLICY_WINDOW_DAYS;
  if (years <= 0) return REMAKE_POLICY_WINDOW_DAYS;
  return Math.min(365 * FREE_REMAKE_YEARS_MAX, years * 365);
}

/**
 * @param {{ baseAmount: number, quotedAt?: Date }} input
 */
export function buildAbutsRemakeFixedPrice({
  baseAmount,
  quotedAt = new Date(),
}) {
  const base = Math.max(0, Math.round(Number(baseAmount) || 0));
  return {
    baseAmount: base,
    discountAmount: Math.max(0, base - ABUTS_REMAKE_FIXED_AMOUNT),
    amount: ABUTS_REMAKE_FIXED_AMOUNT,
    currency: "KRW",
    rule: ABUTS_REMAKE_PRICE_RULE,
    discountMeta: {},
    quotedAt,
  };
}
