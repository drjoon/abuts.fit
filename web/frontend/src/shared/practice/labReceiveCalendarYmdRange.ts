// change-log:
// - 2026-08-27: DB 조회는 화면 3주(전주~이번주~다음주). 미확인은 서버에서 창 밖도 OR 포함.
// - 2026-08-27: 캘린더 그리드 첫·마지막 YMD SSOT — 주문일/치과도착일 범위 DB 조회용
// related files:
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/backend/utils/practiceTransferCalendarRange.util.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js

import { kstAddCivilDays, kstStartOfWeek, toKstYmd } from "@/shared/date/kst";
import type { LabReceiveCalendarDateKey } from "@/shared/practice/labReceiveCalendarDateKey";
import {
  LAB_RECEIVE_CALENDAR_WEEK_STARTS_ON,
} from "@/shared/practice/labReceiveCalendarWeekGrid";

/** UI 스크롤 그리드(월 점프용). DB 조회와 분리. */
export const LAB_RECEIVE_CALENDAR_WEEKS_BEFORE = 78;
export const LAB_RECEIVE_CALENDAR_WEEKS_AFTER = 26;

/**
 * 한 화면에 보이는 3주 — 기준주 전주 + 기준주 + 다음주.
 * DB fromYmd~toYmd 조회에만 사용. (미확인은 서버가 이 창과 OR로 합침)
 */
export const LAB_RECEIVE_CALENDAR_FETCH_WEEKS_BEFORE = 1;
export const LAB_RECEIVE_CALENDAR_FETCH_WEEKS_AFTER = 1;

export type LabReceiveCalendarYmdRange = {
  fromYmd: string;
  toYmd: string;
};

export const buildLabReceiveCalendarWeeks = (originYmd: string): string[][] => {
  const originWeekStart =
    kstStartOfWeek(originYmd, LAB_RECEIVE_CALENDAR_WEEK_STARTS_ON) || originYmd;
  const firstWeekStart =
    kstAddCivilDays(originWeekStart, -LAB_RECEIVE_CALENDAR_WEEKS_BEFORE * 7) ||
    originWeekStart;
  const weekCount = LAB_RECEIVE_CALENDAR_WEEKS_BEFORE + LAB_RECEIVE_CALENDAR_WEEKS_AFTER + 1;
  const weeks: string[][] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const weekStart = kstAddCivilDays(firstWeekStart, w * 7);
    if (!weekStart) continue;
    const days: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      const ymd = kstAddCivilDays(weekStart, d);
      if (ymd) days.push(ymd);
    }
    if (days.length === 7) weeks.push(days);
  }
  return weeks;
};

/**
 * 기준일(커서/오늘)이 속한 주의 전주 일요일 ~ 다음주 토요일 (KST).
 * 화면에 보이는 3주치만 DB에서 한 번에 읽는다.
 */
export const buildLabReceiveCalendarYmdRange = (
  originYmd = toKstYmd(new Date()) || "",
): LabReceiveCalendarYmdRange => {
  const weekStart =
    kstStartOfWeek(originYmd, LAB_RECEIVE_CALENDAR_WEEK_STARTS_ON) || originYmd;
  const fromYmd =
    kstAddCivilDays(weekStart, -LAB_RECEIVE_CALENDAR_FETCH_WEEKS_BEFORE * 7) ||
    weekStart;
  const toYmd =
    kstAddCivilDays(
      weekStart,
      (LAB_RECEIVE_CALENDAR_FETCH_WEEKS_AFTER + 1) * 7 - 1,
    ) || weekStart;
  return { fromYmd, toYmd };
};

export const buildPracticeTransferCalendarApiQuery = (
  range: LabReceiveCalendarYmdRange,
  dateKey: LabReceiveCalendarDateKey,
) => {
  const params = new URLSearchParams();
  params.set("fromYmd", range.fromYmd);
  params.set("toYmd", range.toYmd);
  params.set("dateKey", dateKey);
  return params.toString();
};
