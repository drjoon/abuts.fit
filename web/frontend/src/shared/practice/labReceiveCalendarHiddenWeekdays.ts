// change-log:
// - 2026-08-22: 기공의뢰·기공의뢰수신 캘린더 숨길 요일 SSOT. 기본 일·토
// related files:
// - web/backend/utils/labReceiveCalendarHiddenWeekdays.util.js
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx

/** JS Date.getDay() 기준: 0=일 … 6=토 */
export const DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS = [0, 6] as const;

export const normalizeLabReceiveCalendarHiddenWeekdays = (
  raw: unknown,
): number[] => {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS];
  }
  const seen = new Set<number>();
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isInteger(n) || n < 0 || n > 6) continue;
    seen.add(n);
  }
  // 전 요일 숨김은 불가 — 무효면 기본값
  if (seen.size === 0 || seen.size >= 7) {
    return [...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS];
  }
  return [...seen].sort((a, b) => a - b);
};
