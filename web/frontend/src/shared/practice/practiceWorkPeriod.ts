// related files:
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeWorkPeriodText.tsx
// - 2026-08-15: 기공기간(주문→도착) 5일 미만 경고 SSOT.

import { kstYmdDiffDays } from "@/shared/date/kst";

/** 권장 기공기간(달력일). 미만이면 경고. */
export const PRACTICE_WORK_PERIOD_MIN_DAYS = 5;

export const PRACTICE_WORK_PERIOD_SHORT_TOOLTIP =
  "기공기간이 부족하면 기공소에서 작업을 거부할 수 있습니다";

export function getPracticeWorkPeriodDays(
  orderYmd?: string | null,
  arrivalYmd?: string | null,
): number | null {
  return kstYmdDiffDays(orderYmd, arrivalYmd);
}

export function isPracticeWorkPeriodShort(days: number | null | undefined): boolean {
  return typeof days === "number" && Number.isFinite(days) && days >= 0 && days < PRACTICE_WORK_PERIOD_MIN_DAYS;
}

/** 날짜 필드 옆: 당일 / +N일 */
export function formatPracticeWorkPeriodLeadLabel(days: number | null): string {
  if (days == null || days < 0) return "";
  if (days === 0) return "당일";
  return `+${days}일`;
}

/** 목록·상세: N일 / 당일 */
export function formatPracticeWorkPeriodDaysLabel(days: number | null): string {
  if (days == null || days < 0) return "";
  if (days === 0) return "당일";
  return `${days}일`;
}

export function buildPracticeWorkPeriodSummaryItem(
  orderYmd?: string | null,
  arrivalYmd?: string | null,
): {
  label: string;
  value: string;
  valueClassName?: string;
  tooltip?: string;
} | null {
  const days = getPracticeWorkPeriodDays(orderYmd, arrivalYmd);
  const value = formatPracticeWorkPeriodDaysLabel(days);
  if (!value) return null;
  const short = isPracticeWorkPeriodShort(days);
  return {
    label: "기공기간",
    value,
    ...(short
      ? {
          valueClassName: "text-destructive",
          tooltip: PRACTICE_WORK_PERIOD_SHORT_TOOLTIP,
        }
      : {}),
  };
}
