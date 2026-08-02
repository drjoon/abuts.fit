// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";

interface PeriodState {
  period: PeriodFilterValue;
  customStartDate: string;
  customEndDate: string;
  setPeriod: (period: PeriodFilterValue) => void;
  setCustomDateRange: (range: { startDate: string; endDate: string }) => void;
  clearCustomDateRange: () => void;
}

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set) => ({
      period: "30d",
      customStartDate: "",
      customEndDate: "",
      setPeriod: (period) => set({ period }),
      setCustomDateRange: ({ startDate, endDate }) =>
        set({ customStartDate: startDate, customEndDate: endDate }),
      clearCustomDateRange: () => set({ customStartDate: "", customEndDate: "" }),
    }),
    {
      name: "abuts.period-filter",
      partialize: (state) => ({ period: state.period }),
    },
  ),
);

const KST_TIME_ZONE = "Asia/Seoul";

const toCustomRangeIso = (customStartDate: string, customEndDate: string) => {
  const startRaw = String(customStartDate || "").trim();
  const endRaw = String(customEndDate || "").trim();
  if (!startRaw || !endRaw) return null;
  const start = new Date(`${startRaw}T00:00:00`);
  const end = new Date(`${endRaw}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  return { startDate: start.toISOString(), endDate: end.toISOString() };
};

const getKstDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value || 0);
  const month = Number(parts.find((p) => p.type === "month")?.value || 0);
  const day = Number(parts.find((p) => p.type === "day")?.value || 0);
  return { year, month, day };
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

export const periodToRange = (
  period: PeriodFilterValue,
  options?: { customStartDate?: string; customEndDate?: string },
) => {
  const storeState = usePeriodStore.getState();
  const customStartDate =
    options?.customStartDate ?? storeState.customStartDate ?? "";
  const customEndDate = options?.customEndDate ?? storeState.customEndDate ?? "";
  const customRange = toCustomRangeIso(customStartDate, customEndDate);
  if (customRange) return customRange;

  const now = new Date();
  const { year, month, day } = getKstDateParts(now);

  if (period === "7d" || period === "30d" || period === "90d") {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const todayStart = makeUtcFromKst(year, month, day, 0, 0, 0, 0);
    const todayEnd = makeUtcFromKst(year, month, day, 23, 59, 59, 999);
    const start = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
  }

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

export const periodToRangeQuery = (
  period: PeriodFilterValue,
  options?: { customStartDate?: string; customEndDate?: string },
): string => {
  const range = periodToRange(period, options);
  if (!range) return "";
  return `?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`;
};
