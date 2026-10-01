export type PeriodFilterValue =
  | "7d"
  | "30d"
  | "90d"
  | "180d"
  | "thisMonth"
  | "lastMonth"
  | "calendarMonth"
  | "rollingMonth";

export const PERIOD_FILTER_VALUES: PeriodFilterValue[] = [
  "7d",
  "30d",
  "90d",
  "180d",
  "thisMonth",
  "lastMonth",
  "calendarMonth",
  "rollingMonth",
];

/** 헤더(모든 role) 기본 프리셋. 정산·가공통계 등 별도 프리셋은 쓰지 않는다. */
export const HEADER_PERIOD_PRESETS: PeriodFilterValue[] = [
  "calendarMonth",
  "rollingMonth",
];

export const HEADER_DEFAULT_PERIOD: PeriodFilterValue = "calendarMonth";

export const isHeaderPeriodValue = (
  value: unknown,
): value is "calendarMonth" | "rollingMonth" =>
  value === "calendarMonth" || value === "rollingMonth";

/** 정산(모든 role) PeriodFilter 프리셋 — 30일 롤링 대신 월 단위. */
export const SETTLEMENT_PERIOD_PRESETS: PeriodFilterValue[] = [
  "thisMonth",
  "lastMonth",
];

export const SETTLEMENT_DEFAULT_PERIOD: PeriodFilterValue = "thisMonth";

export const isSettlementPeriodValue = (
  value: unknown,
): value is "thisMonth" | "lastMonth" =>
  value === "thisMonth" || value === "lastMonth";

/** 롤링(7d/30d/…)을 정산 기본(이번달)로 승격. */
export const toSettlementPeriod = (
  value: unknown,
): PeriodFilterValue =>
  isSettlementPeriodValue(value) ? value : SETTLEMENT_DEFAULT_PERIOD;

export const isPeriodFilterValue = (value: unknown): value is PeriodFilterValue =>
  typeof value === "string" &&
  PERIOD_FILTER_VALUES.includes(value as PeriodFilterValue);
