// change-log:
// - 2026-08-23: 캘린더·숨길 요일 토글 공통 열 순서 일~토(통상 달력). 저장 dow는 0=일…6=토
// related files:
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/shared/practice/labReceiveCalendarHiddenWeekdays.ts

/** JS Date.getDay() / kstYmdWeekday 기준: 0=일 … 6=토 */
export const WEEKDAY_LABEL_BY_DOW: Record<number, string> = {
  0: "일",
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
  6: "토",
};

/** 캘린더·숨길 요일 토글 공통 열 순서(일~토). */
export const LAB_RECEIVE_CALENDAR_WEEK_GRID_COLUMNS = [
  { dow: 0, label: "일" },
  { dow: 1, label: "월" },
  { dow: 2, label: "화" },
  { dow: 3, label: "수" },
  { dow: 4, label: "목" },
  { dow: 5, label: "금" },
  { dow: 6, label: "토" },
] as const;

/** kstStartOfWeek weekStartsOn — 일요일 시작 */
export const LAB_RECEIVE_CALENDAR_WEEK_STARTS_ON = 0;

export const LAB_RECEIVE_CALENDAR_WEEK_GRID_COL_COUNT =
  LAB_RECEIVE_CALENDAR_WEEK_GRID_COLUMNS.length;

export const labReceiveCalendarWeekGridTemplate = () =>
  `repeat(${LAB_RECEIVE_CALENDAR_WEEK_GRID_COL_COUNT}, minmax(0, 1fr))`;

export const weekdayLabel = (dow: number): string =>
  WEEKDAY_LABEL_BY_DOW[dow] ?? "?";
