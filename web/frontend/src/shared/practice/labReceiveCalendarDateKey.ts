// change-log:
// - 2026-08-20: 기공의뢰·기공의뢰수신 캘린더 날짜 뱃지 SSOT. 기본값 치과도착일
// related files:
// - web/backend/utils/labReceiveCalendarDateKey.util.js
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx

export type LabReceiveCalendarDateKey = "orderDate" | "arrivalDate";

export const DEFAULT_LAB_RECEIVE_CALENDAR_DATE_KEY: LabReceiveCalendarDateKey =
  "arrivalDate";

export const normalizeLabReceiveCalendarDateKey = (
  raw: unknown,
): LabReceiveCalendarDateKey => {
  const value = String(raw || "").trim();
  if (value === "orderDate" || value === "arrivalDate") return value;
  return DEFAULT_LAB_RECEIVE_CALENDAR_DATE_KEY;
};
