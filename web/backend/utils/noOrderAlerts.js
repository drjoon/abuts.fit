// related files:
// - web/backend/services/noOrderAlerts.service.js
// - web/backend/tests/unit/noOrderAlerts.test.js

export const NO_ORDER_TIER_3M = "3m";
export const NO_ORDER_TIER_6M = "6m";
export const NO_ORDER_DAYS_3M = 90;
export const NO_ORDER_DAYS_6M = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Date|string|null|undefined} lastCompletedAt
 * @param {Date} [now]
 * @returns {{ tier: "3m"|"6m", daysSinceCompletion: number } | null}
 */
export function classifyNoOrderTier(lastCompletedAt, now = new Date()) {
  if (!lastCompletedAt) return null;
  const completed =
    lastCompletedAt instanceof Date
      ? lastCompletedAt
      : new Date(lastCompletedAt);
  if (Number.isNaN(completed.getTime())) return null;

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return null;

  const daysSince = Math.floor((nowMs - completed.getTime()) / DAY_MS);
  if (daysSince < NO_ORDER_DAYS_3M) return null;
  if (daysSince >= NO_ORDER_DAYS_6M) {
    return { tier: NO_ORDER_TIER_6M, daysSinceCompletion: daysSince };
  }
  return { tier: NO_ORDER_TIER_3M, daysSinceCompletion: daysSince };
}
