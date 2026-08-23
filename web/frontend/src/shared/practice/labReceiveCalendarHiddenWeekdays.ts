// change-log:
// - 2026-08-23: []는 전 요일 표시(숨김 없음). 빈 배열을 기본 일·토로 되돌리던 버그 수정.
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
  // 명시적 [] = 전 요일 표시(숨김 없음). 토글로 주말 모두 표시할 때 필요.
  if (raw.length === 0) {
    return [];
  }
  const seen = new Set<number>();
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isInteger(n) || n < 0 || n > 6) continue;
    seen.add(n);
  }
  // 전 요일 숨김·전부 무효 값은 불가 — 기본값
  if (seen.size === 0 || seen.size >= 7) {
    return [...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS];
  }
  return [...seen].sort((a, b) => a - b);
};
