export type PeriodFilterValue =
  | "7d"
  | "30d"
  | "lastMonth"
  | "thisMonth"
  | "90d";

export const PERIOD_FILTER_VALUES: PeriodFilterValue[] = [
  "7d",
  "30d",
  "lastMonth",
  "thisMonth",
  "90d",
];

export const isPeriodFilterValue = (value: unknown): value is PeriodFilterValue =>
  typeof value === "string" &&
  PERIOD_FILTER_VALUES.includes(value as PeriodFilterValue);
