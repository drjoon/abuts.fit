// related files:
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeWorkPeriodText.tsx
// - 2026-08-15: 작업기간(주문→도착) 5일 미만 경고 SSOT.
// - 2026-08-15: 치과·기공소 툴팁 문구 분리. 표기 기공기간→작업기간.
// - 2026-08-15: 작업기간을 영업일(월~금) 기준으로 계산·표시.

import { kstYmdDiffBusinessDays } from "@/shared/date/kst";

/** 권장 작업기간(영업일). 미만이면 경고. */
export const PRACTICE_WORK_PERIOD_MIN_DAYS = 5;

export type PracticeWorkPeriodViewer = "practice" | "lab";

/** 치과(발신): 짧은 기간이면 수락 기공소가 없을 수 있음 */
export const PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_PRACTICE =
  "작업 기간이 충분하지 않아 수락하는 기공소가 없을 수도 있습니다.";

/** 기공소(수신): 짧은 기간이면 수락하지 않아도 됨 */
export const PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_LAB =
  "작업기간이 짧으니 수락하지 않으셔도 됩니다.";

export function getPracticeWorkPeriodShortTooltip(
  viewer: PracticeWorkPeriodViewer = "practice",
): string {
  return viewer === "lab"
    ? PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_LAB
    : PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_PRACTICE;
}

/** 주문일→치과도착일 영업일 수(같은 날=0). */
export function getPracticeWorkPeriodDays(
  orderYmd?: string | null,
  arrivalYmd?: string | null,
): number | null {
  return kstYmdDiffBusinessDays(orderYmd, arrivalYmd);
}

export function isPracticeWorkPeriodShort(days: number | null | undefined): boolean {
  return typeof days === "number" && Number.isFinite(days) && days >= 0 && days < PRACTICE_WORK_PERIOD_MIN_DAYS;
}

function isSameCalendarYmd(a?: string | null, b?: string | null): boolean {
  return String(a || "").trim() === String(b || "").trim() && Boolean(String(a || "").trim());
}

/** 날짜 필드 옆: 당일 / +N영업일 */
export function formatPracticeWorkPeriodLeadLabel(
  days: number | null,
  orderYmd?: string | null,
  arrivalYmd?: string | null,
): string {
  if (days == null || days < 0) return "";
  if (days === 0) {
    return isSameCalendarYmd(orderYmd, arrivalYmd) ? "당일" : "0영업일";
  }
  return `+${days}영업일`;
}

/** 목록·상세: N영업일 / 당일 */
export function formatPracticeWorkPeriodDaysLabel(
  days: number | null,
  orderYmd?: string | null,
  arrivalYmd?: string | null,
): string {
  if (days == null || days < 0) return "";
  if (days === 0) {
    return isSameCalendarYmd(orderYmd, arrivalYmd) ? "당일" : "0영업일";
  }
  return `${days}영업일`;
}

export function buildPracticeWorkPeriodSummaryItem(
  orderYmd?: string | null,
  arrivalYmd?: string | null,
  viewer: PracticeWorkPeriodViewer = "practice",
): {
  label: string;
  value: string;
  valueClassName?: string;
  tooltip?: string;
} | null {
  const days = getPracticeWorkPeriodDays(orderYmd, arrivalYmd);
  const value = formatPracticeWorkPeriodDaysLabel(days, orderYmd, arrivalYmd);
  if (!value) return null;
  const short = isPracticeWorkPeriodShort(days);
  return {
    label: "작업기간",
    value,
    ...(short
      ? {
          valueClassName: "text-destructive",
          tooltip: getPracticeWorkPeriodShortTooltip(viewer),
        }
      : {}),
  };
}
