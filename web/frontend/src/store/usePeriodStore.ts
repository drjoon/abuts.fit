import { create } from "zustand";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";

interface PeriodState {
  period: PeriodFilterValue;
  setPeriod: (period: PeriodFilterValue) => void;
}

export const usePeriodStore = create<PeriodState>((set) => ({
  period: "30d",
  setPeriod: (period) => set({ period }),
}));

const KST_TIME_ZONE = "Asia/Seoul";

const getKstYearMonth = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value || 0);
  const month = Number(parts.find((p) => p.type === "month")?.value || 0);
  return { year, month };
};

const makeUtcFromKst = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
) => new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second, ms));

export const periodToRange = (period: PeriodFilterValue) => {
  const end = new Date();
  const start = new Date(end);

  if (period === "7d") {
    start.setDate(start.getDate() - 7);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (period === "30d") {
    start.setDate(start.getDate() - 30);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (period === "90d") {
    start.setDate(start.getDate() - 90);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  const now = new Date();
  const { year, month } = getKstYearMonth(now);

  const thisMonthStart = makeUtcFromKst(year, month, 1, 0, 0, 0, 0);
  const nextMonthStart =
    month === 12
      ? makeUtcFromKst(year + 1, 1, 1, 0, 0, 0, 0)
      : makeUtcFromKst(year, month + 1, 1, 0, 0, 0, 0);

  if (period === "thisMonth") {
    return {
      startDate: thisMonthStart.toISOString(),
      endDate: new Date(nextMonthStart.getTime() - 1).toISOString(),
    };
  }

  const lastMonthStart =
    month === 1
      ? makeUtcFromKst(year - 1, 12, 1, 0, 0, 0, 0)
      : makeUtcFromKst(year, month - 1, 1, 0, 0, 0, 0);

  return {
    startDate: lastMonthStart.toISOString(),
    endDate: new Date(thisMonthStart.getTime() - 1).toISOString(),
  };
};

export const periodToRangeQuery = (period: PeriodFilterValue): string => {
  const range = periodToRange(period);
  if (!range) return "";
  return `?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`;
};
