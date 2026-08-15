// related files:
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeWorkPeriodText.tsx
// - 2026-08-15: 작업기간(주문→도착) 5일 미만 경고 SSOT.
// - 2026-08-15: 치과·기공소 툴팁 문구 분리. 표기 기공기간→작업기간.
// - 2026-08-15: 작업기간을 영업일(월~금) 기준으로 계산·표시.
// - 2026-08-15: 작업=도착-2영업일·배송=2일. 라벨 작업+배송기간, 표기 3+2영업일.
// - 2026-08-15: 카드/필드 라벨 주문-치과도착. lead 앞 + 제거.
// - 2026-08-15: N+2영업일 의미 툴팁(N일=기공작업, 2일=배송) 상시 표시.

import { kstYmdDiffBusinessDays } from "@/shared/date/kst";

/** 배송기간(영업일). 작업기간 = (주문→치과도착 영업일) − 이 값. */
export const PRACTICE_SHIPPING_BUSINESS_DAYS = 2;

/** 권장 작업+배송 합계(영업일). 미만이면 경고. */
export const PRACTICE_WORK_PERIOD_MIN_DAYS = 5;

export type PracticeWorkPeriodViewer = "practice" | "lab";

/** N+2영업일: N일=기공작업시간, 2일=배송시간 */
export function formatPracticeWorkPlusShipMeaningTooltip(
  totalBusinessDays: number | null | undefined,
): string {
  const workDays = getPracticeWorkOnlyBusinessDays(totalBusinessDays);
  if (workDays == null) {
    return `${PRACTICE_SHIPPING_BUSINESS_DAYS}일은 배송시간입니다.`;
  }
  return `${workDays}일은 기공작업시간, ${PRACTICE_SHIPPING_BUSINESS_DAYS}일은 배송시간입니다.`;
}

/** 치과(발신): 짧은 기간이면 수락 기공소가 없을 수 있음 */
export const PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_PRACTICE =
  "작업+배송 기간이 충분하지 않아 수락하는 기공소가 없을 수도 있습니다.";

/** 기공소(수신): 짧은 기간이면 수락하지 않아도 됨 */
export const PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_LAB =
  "작업+배송기간이 짧으니 수락하지 않으셔도 됩니다.";

export function getPracticeWorkPeriodShortTooltip(
  viewer: PracticeWorkPeriodViewer = "practice",
): string {
  return viewer === "lab"
    ? PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_LAB
    : PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_PRACTICE;
}

/** N+2 의미 + (짧은 기간이면) 경고 문구 */
export function getPracticeWorkPeriodTooltip(
  viewer: PracticeWorkPeriodViewer = "practice",
  days?: number | null,
): string {
  const meaning = formatPracticeWorkPlusShipMeaningTooltip(days);
  if (isPracticeWorkPeriodShort(days)) {
    return `${meaning} ${getPracticeWorkPeriodShortTooltip(viewer)}`;
  }
  return meaning;
}

/** 주문일→치과도착일 영업일 합계(작업+배송). 같은 날=0. */
export function getPracticeWorkPeriodDays(
  orderYmd?: string | null,
  arrivalYmd?: string | null,
): number | null {
  return kstYmdDiffBusinessDays(orderYmd, arrivalYmd);
}

/** 작업 영업일 = 합계 − 배송(2). 합계가 배송보다 짧으면 0. */
export function getPracticeWorkOnlyBusinessDays(
  totalBusinessDays: number | null | undefined,
): number | null {
  if (typeof totalBusinessDays !== "number" || !Number.isFinite(totalBusinessDays)) {
    return null;
  }
  if (totalBusinessDays < 0) return null;
  return Math.max(0, totalBusinessDays - PRACTICE_SHIPPING_BUSINESS_DAYS);
}

export function isPracticeWorkPeriodShort(days: number | null | undefined): boolean {
  return (
    typeof days === "number" &&
    Number.isFinite(days) &&
    days >= 0 &&
    days < PRACTICE_WORK_PERIOD_MIN_DAYS
  );
}

/** `3+2영업일` (작업+배송). lead/days 공통 — 앞에 +를 붙이지 않음. */
export function formatPracticeWorkPlusShipLabel(totalBusinessDays: number | null): string {
  const workDays = getPracticeWorkOnlyBusinessDays(totalBusinessDays);
  if (workDays == null || totalBusinessDays == null || totalBusinessDays < 0) return "";
  return `${workDays}+${PRACTICE_SHIPPING_BUSINESS_DAYS}영업일`;
}

/** 날짜 필드 옆·카드: 1+2영업일 */
export function formatPracticeWorkPeriodLeadLabel(totalBusinessDays: number | null): string {
  return formatPracticeWorkPlusShipLabel(totalBusinessDays);
}

/** 목록·상세: 1+2영업일 */
export function formatPracticeWorkPeriodDaysLabel(totalBusinessDays: number | null): string {
  return formatPracticeWorkPlusShipLabel(totalBusinessDays);
}

/** 카드/필드 공통 라벨: 주문-치과도착 */
export const PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL = "주문-치과도착";

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
  const value = formatPracticeWorkPeriodDaysLabel(days);
  if (!value) return null;
  const short = isPracticeWorkPeriodShort(days);
  return {
    label: "작업+배송기간",
    value,
    tooltip: getPracticeWorkPeriodTooltip(viewer, days),
    ...(short ? { valueClassName: "text-destructive" } : {}),
  };
}
