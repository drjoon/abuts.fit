import { getTodayMidnightUtcInKst } from "./krBusinessDays.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function parseDateInput(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function getDefaultLastNDaysRange({ days = 30, now = new Date() } = {}) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const kstMidnight = getTodayMidnightUtcInKst(safeNow);

  if (!kstMidnight) {
    const end = safeNow;
    const start = new Date(end.getTime() - Math.max(0, Number(days || 0)) * ONE_DAY_MS);
    return { start, end };
  }

  const normalizedDays = Math.max(0, Number(days || 0));
  const start = new Date(kstMidnight.getTime() - normalizedDays * ONE_DAY_MS);
  const end = safeNow;
  return { start, end };
}

export function getQueryDateRange(
  query,
  { fallbackDays = null, now = new Date() } = {},
) {
  const start = parseDateInput(query?.startDate);
  const end = parseDateInput(query?.endDate);

  if (start || end) {
    return { start, end, source: "query" };
  }

  if (typeof fallbackDays === "number") {
    const fallback = getDefaultLastNDaysRange({ days: fallbackDays, now });
    return { start: fallback.start, end: fallback.end, source: "default" };
  }

  return { start: null, end: null, source: "none" };
}

export function buildCreatedAtFilterFromRange({ start, end }) {
  const filter = {};
  if (start instanceof Date && !Number.isNaN(start.getTime())) {
    filter.$gte = start;
  }
  if (end instanceof Date && !Number.isNaN(end.getTime())) {
    filter.$lte = end;
  }
  return Object.keys(filter).length > 0 ? filter : null;
}

export function getDateRangeFromPeriod(periodRaw, { now = new Date() } = {}) {
  const period = String(periodRaw || "").trim();
  const safeNow = now instanceof Date ? now : new Date(now);

  if (!period || period === "all") {
    return { start: null, end: null, source: "period" };
  }

  if (period === "thisMonth" || period === "lastMonth") {
    const kstMidnight = getTodayMidnightUtcInKst(safeNow);
    const base = kstMidnight || safeNow;

    const utcYear = base.getUTCFullYear();
    const utcMonthIndex = base.getUTCMonth();

    const startOfThisMonth = new Date(
      Date.UTC(utcYear, utcMonthIndex, 1, -9, 0, 0, 0),
    );
    const startOfNextMonth = new Date(
      Date.UTC(utcYear, utcMonthIndex + 1, 1, -9, 0, 0, 0),
    );

    if (period === "thisMonth") {
      return {
        start: startOfThisMonth,
        end: new Date(startOfNextMonth.getTime() - 1),
        source: "period",
      };
    }

    const startOfLastMonth = new Date(
      Date.UTC(utcYear, utcMonthIndex - 1, 1, -9, 0, 0, 0),
    );
    return {
      start: startOfLastMonth,
      end: new Date(startOfThisMonth.getTime() - 1),
      source: "period",
    };
  }

  let days = 30;
  if (period === "7d") days = 7;
  else if (period === "90d") days = 90;

  const kstMidnight = getTodayMidnightUtcInKst(safeNow);
  if (!kstMidnight) {
    const start = new Date(safeNow.getTime() - days * ONE_DAY_MS);
    return { start, end: safeNow, source: "period" };
  }

  const start = new Date(kstMidnight.getTime() - days * ONE_DAY_MS);
  return { start, end: safeNow, source: "period" };
}

export function buildCreatedAtFilterFromQuery(query) {
  const { start, end } = getQueryDateRange(query);
  return buildCreatedAtFilterFromRange({ start, end });
}
