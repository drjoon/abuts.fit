// related files:
// - web/backend/controllers/requests/utils.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// change-log:
// - 2026-09-12: 리메이크 정책 SSOT — 치과로부터=무료, 어벗츠로=90일·동일치식 시 1만원.

import { toKstYmd } from "./krBusinessDays.js";

/** 동일 치과·환자·치식 리메이크 판정 창(일). */
export const REMAKE_POLICY_WINDOW_DAYS = 90;

/** 어벗츠로(Request) 리메이크 고객 단가(원). 배송비 별도. */
export const ABUTS_REMAKE_FIXED_AMOUNT = 10000;

export const ABUTS_REMAKE_PRICE_RULE = "remake_fixed_10000";

/**
 * KST 달력 기준 리메이크 컷오프(지금−90일 00:00+09:00).
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
