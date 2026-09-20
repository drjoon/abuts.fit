export type PeriodFilterValue =
  | "7d"
  | "30d"
  | "90d"
  | "180d"
  | "thisMonth"
  | "lastMonth";

export const PERIOD_FILTER_VALUES: PeriodFilterValue[] = [
  "7d",
  "30d",
  "90d",
  "180d",
  "thisMonth",
  "lastMonth",
];

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
