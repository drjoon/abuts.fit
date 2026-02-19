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

export const periodToRange = (period: PeriodFilterValue) => {
  if (period === "all") return null;

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
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  if (period === "thisMonth") {
    return {
      startDate: thisMonthStart.toISOString(),
      endDate: thisMonthEnd.toISOString(),
    };
  }

  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: lastMonthStart.toISOString(),
    endDate: lastMonthEnd.toISOString(),
  };
};

export const periodToRangeQuery = (period: PeriodFilterValue): string => {
  const range = periodToRange(period);
  if (!range) return "";
  return `?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`;
};
