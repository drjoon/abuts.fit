// change-log:
// - 2026-09-08: 기공의뢰·기공의뢰수신 캘린더/목록 보기 SSOT. 기본=목록, localStorage 유지
// related files:
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/labReceiveCalendarYmdRange.ts

export type LabReceiveCalendarViewMode = "calendar" | "list";

export const DEFAULT_LAB_RECEIVE_CALENDAR_VIEW_MODE: LabReceiveCalendarViewMode =
  "list";

const STORAGE_KEY = "abuts.labReceiveCalendarViewMode.v1";

export const normalizeLabReceiveCalendarViewMode = (
  raw: unknown,
): LabReceiveCalendarViewMode => {
  const value = String(raw || "").trim();
  if (value === "calendar" || value === "list") return value;
  return DEFAULT_LAB_RECEIVE_CALENDAR_VIEW_MODE;
};

export function readStoredLabReceiveCalendarViewMode(
  fallback: LabReceiveCalendarViewMode = DEFAULT_LAB_RECEIVE_CALENDAR_VIEW_MODE,
): LabReceiveCalendarViewMode {
  try {
    return normalizeLabReceiveCalendarViewMode(
      localStorage.getItem(STORAGE_KEY) ?? fallback,
    );
  } catch {
    return normalizeLabReceiveCalendarViewMode(fallback);
  }
}

export function writeStoredLabReceiveCalendarViewMode(
  mode: LabReceiveCalendarViewMode,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      normalizeLabReceiveCalendarViewMode(mode),
    );
  } catch {
    // quota / private mode — ignore
  }
}
