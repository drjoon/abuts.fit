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

export const isPeriodFilterValue = (value: unknown): value is PeriodFilterValue =>
  typeof value === "string" &&
  PERIOD_FILTER_VALUES.includes(value as PeriodFilterValue);
