// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function kstCivilYmd(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCivilMonthsYmd(ymd, delta) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const months = Math.trunc(Number(delta) || 0);
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  const next = new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(d, lastDay),
      12,
    ),
  );
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive KST YMD range. Swaps when end is before start. */
export function resolveCustomYmdInclusiveRange(customStart, customEnd) {
  const startRaw = String(customStart || "").trim();
  const endRaw = String(customEnd || "").trim();
  if (!YMD_RE.test(startRaw) || !YMD_RE.test(endRaw)) return null;
  const startYmd = startRaw <= endRaw ? startRaw : endRaw;
  const endYmd = startRaw <= endRaw ? endRaw : startRaw;
  const start = new Date(`${startYmd}T00:00:00+09:00`);
  const end = new Date(`${endYmd}T23:59:59.999+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/**
 * Header period presets.
 * calendarMonth = KST 이번 달 1일 00:00 ~ 말일 24시 직전.
 * rollingMonth = 지난달 같은 날 00:00 ~ 오늘 24시 직전.
 */
export function resolveHeaderMonthPeriodRange(periodRaw, now = new Date()) {
  const period = String(periodRaw || "").trim();
  if (period !== "calendarMonth" && period !== "rollingMonth") return null;
  const safeNow = now instanceof Date ? now : new Date(now);
  const ymd = kstCivilYmd(safeNow);
  const [year, month] = ymd.split("-").map(Number);
  if (!year || !month) return null;

  if (period === "calendarMonth") {
    const start = new Date(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`,
    );
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextStart = new Date(
      `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`,
    );
    if (Number.isNaN(start.getTime()) || Number.isNaN(nextStart.getTime())) return null;
    return { start, end: new Date(nextStart.getTime() - 1) };
  }

  const startYmd = addCivilMonthsYmd(ymd, -1);
  if (!startYmd) return null;
  return {
    start: new Date(`${startYmd}T00:00:00+09:00`),
    end: new Date(`${ymd}T23:59:59.999+09:00`),
  };
}

/** Custom YMD wins. Otherwise calendarMonth / rollingMonth. Other periods return null. */
export function createdAtFilterFromHeaderPeriod(periodRaw, override, now) {
  const custom = resolveCustomYmdInclusiveRange(
    override?.customStart,
    override?.customEnd,
  );
  if (custom) {
    return { createdAt: { $gte: custom.start, $lte: custom.end } };
  }
  const header = resolveHeaderMonthPeriodRange(periodRaw, now);
  if (!header) return null;
  return { createdAt: { $gte: header.start, $lte: header.end } };
}

export function getDateRangeFromPeriod(periodRaw, { now = new Date() } = {}) {
  const period = String(periodRaw || "").trim();
  const safeNow = now instanceof Date ? now : new Date(now);

  if (!period || period === "all") {
    return { start: null, end: null, source: "period" };
  }

  const header = resolveHeaderMonthPeriodRange(period, safeNow);
  if (header) {
    return { start: header.start, end: header.end, source: "period" };
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
