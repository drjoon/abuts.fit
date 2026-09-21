// related files:
// - web/backend/services/referralOwnershipReset.service.js
// - web/backend/jobs/dailyReferralOwnershipResetWorker.js
/**
 * 영업 소개 귀속 90일 리셋 — 순수 헬퍼 (DB 무의존).
 */
import { getTodayMidnightUtcInKst } from "../utils/krBusinessDays.js";

export const REFERRAL_OWNERSHIP_INACTIVE_DAYS = 90;

export const SALES_REFERRER_BUSINESS_TYPES = Object.freeze([
  "salesman",
  "salesTeam",
]);

export function resolveReferralOwnershipCutoffAt(
  now = new Date(),
  inactiveDays = REFERRAL_OWNERSHIP_INACTIVE_DAYS,
) {
  const days = Math.max(1, Math.floor(Number(inactiveDays) || 90));
  const todayMidnight = getTodayMidnightUtcInKst(now);
  if (!todayMidnight) {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
  return new Date(todayMidnight.getTime() - days * 24 * 60 * 60 * 1000);
}

export function isSalesReferrerBusinessType(businessType) {
  return SALES_REFERRER_BUSINESS_TYPES.includes(
    String(businessType || "").trim(),
  );
}

export function resolveLastActivityAt({ createdAt, lastRequestAt }) {
  const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
  const requestMs = lastRequestAt ? new Date(lastRequestAt).getTime() : NaN;
  const candidates = [createdMs, requestMs].filter((n) => Number.isFinite(n));
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates));
}

export function shouldResetReferralOwnership({ lastActivityAt, cutoffAt }) {
  if (
    !(lastActivityAt instanceof Date) ||
    Number.isNaN(lastActivityAt.getTime())
  ) {
    return false;
  }
  if (!(cutoffAt instanceof Date) || Number.isNaN(cutoffAt.getTime())) {
    return false;
  }
  return lastActivityAt.getTime() < cutoffAt.getTime();
}
