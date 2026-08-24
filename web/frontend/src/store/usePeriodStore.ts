// change-log:
// - 2026-08-23: periodToRangeQueryBounds — API용 KST YMD from/to (ISO + 타임존 URL 이슈 회피).
// - 2026-08-20: 저장된 90일·지난달 선택은 30일·이번달로 승격.
// - 2026-08-07: thisMonth 종료일을 월말이 아니라 오늘(KST)로 클램프
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { isPeriodFilterValue } from "@/shared/ui/periodFilterValues";
import { toKstYmd } from "@/shared/date/kst";

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
      partialize: (state) => ({
        period: state.period,
        customStartDate: state.customStartDate,
        customEndDate: state.customEndDate,
      }),
      merge: (persisted, current) => {
        const raw = (persisted || {}) as Partial<PeriodState>;
        const nextPeriod = isPeriodFilterValue(raw.period)
          ? raw.period === "90d"
            ? "30d"
            : raw.period === "lastMonth"
              ? "thisMonth"
              : raw.period
          : current.period;
        return {
          ...current,
          ...raw,
          period: nextPeriod,
          customStartDate:
            typeof raw.customStartDate === "string"
              ? raw.customStartDate
              : current.customStartDate,
          customEndDate:
            typeof raw.customEndDate === "string"
              ? raw.customEndDate
              : current.customEndDate,
        };
      },
    },
  ),
);

const KST_TIME_ZONE = "Asia/Seoul";

const getTodayYmdInKst = () => {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
};

const toCustomRangeIso = (
  customStartDate: string,
  customEndDate: string,
  fallbackEndYmd?: string,
) => {
  const startRaw = String(customStartDate || "").trim();
  const endRaw = String(customEndDate || "").trim() || String(fallbackEndYmd || "").trim();
  if (!startRaw || !endRaw) return null;
  const start = new Date(`${startRaw}T00:00:00.000+09:00`);
  const end = new Date(`${endRaw}T23:59:59.999+09:00`);
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
  const customRange = toCustomRangeIso(
    customStartDate,
    customEndDate,
    getTodayYmdInKst(),
  );
  if (customRange) return customRange;

  const now = new Date();
  const { year, month, day } = getKstDateParts(now);

  if (
    period === "7d" ||
    period === "30d" ||
    period === "90d" ||
    period === "180d"
  ) {
    const days =
      period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 180;
    const todayStart = makeUtcFromKst(year, month, day, 0, 0, 0, 0);
    const todayEnd = makeUtcFromKst(year, month, day, 23, 59, 59, 999);
    const start = new Date(
      todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    );
    return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
  }

  const thisMonthStart = makeUtcFromKst(year, month, 1, 0, 0, 0, 0);
  const todayEnd = makeUtcFromKst(year, month, day, 23, 59, 59, 999);

  if (period === "thisMonth") {
    // 미도래 일자(월말까지 빈 행)를 만들지 않도록 오늘은 포함·미래는 제외
    return {
      startDate: thisMonthStart.toISOString(),
      endDate: todayEnd.toISOString(),
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

/** 장부·집계 API — KST YMD `from`/`to` + `period` (ISO 타임존 `+` URL 파싱 이슈 회피). */
export const periodToRangeQueryBounds = (
  period: PeriodFilterValue,
  options?: { customStartDate?: string; customEndDate?: string },
) => {
  const range = periodToRange(period, options);
  if (!range) {
    return { fromYmd: "", toYmd: "", period };
  }
  return {
    fromYmd: toKstYmd(range.startDate) || "",
    toYmd: toKstYmd(range.endDate) || "",
    period,
  };
};

/** URLSearchParams에 from/to/period 추가 (PeriodFilter API SSOT). */
export const appendPeriodQueryParams = (
  params: URLSearchParams,
  period: PeriodFilterValue,
  options?: { customStartDate?: string; customEndDate?: string },
) => {
  const bounds = periodToRangeQueryBounds(period, options);
  if (bounds.fromYmd) params.set("from", bounds.fromYmd);
  if (bounds.toYmd) params.set("to", bounds.toYmd);
  params.set("period", bounds.period);
};
