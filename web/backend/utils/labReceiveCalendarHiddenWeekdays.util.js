// change-log:
// - 2026-08-22: 기공의뢰수신 캘린더 숨길 요일. 기본 일·토
// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/frontend/src/shared/practice/labReceiveCalendarHiddenWeekdays.ts

/** JS Date.getDay() 기준: 0=일 … 6=토 */
export const DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS = Object.freeze([
  0, 6,
]);

/**
 * @param {unknown} raw
 * @returns {number[]}
 */
export function normalizeLabReceiveCalendarHiddenWeekdays(raw) {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS];
  }
  const seen = new Set();
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isInteger(n) || n < 0 || n > 6) continue;
    seen.add(n);
  }
  if (seen.size === 0 || seen.size >= 7) {
    return [...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS];
  }
  return [...seen].sort((a, b) => a - b);
}
