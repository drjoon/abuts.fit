// change-log:
// - 2026-08-20: 기공의뢰수신 캘린더 날짜 뱃지(주문일/치과도착일). 기본 치과도착일
// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/frontend/src/shared/practice/labReceiveCalendarDateKey.ts

export const LAB_RECEIVE_CALENDAR_DATE_KEYS = Object.freeze([
  "orderDate",
  "arrivalDate",
]);

export const DEFAULT_LAB_RECEIVE_CALENDAR_DATE_KEY = "arrivalDate";

/**
 * @param {unknown} raw
 * @returns {"orderDate"|"arrivalDate"}
 */
export function normalizeLabReceiveCalendarDateKey(raw) {
  const value = String(raw || "").trim();
  if (value === "orderDate" || value === "arrivalDate") return value;
  return DEFAULT_LAB_RECEIVE_CALENDAR_DATE_KEY;
}
