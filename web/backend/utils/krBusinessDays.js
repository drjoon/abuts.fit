import HolidayCache from "../models/holidayCache.model.js";

const KST_TZ = "Asia/Seoul";

const holidaysCache = new Map();

function formatYmdInTimeZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

export async function normalizeKoreanBusinessDay({ ymd }) {
  const start = ymdToUtcDate(ymd);
  if (!start) {
    throw new Error("Invalid ymd");
  }

  if (await isKoreanBusinessDayYmd(ymd)) {
    return ymd;
  }

  // 주말/공휴일이면 다음 영업일
  let current = new Date(start.getTime());
  while (true) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    const next = utcDateToYmd(current);
    if (await isKoreanBusinessDayYmd(next)) {
      return next;
    }
  }
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd)
    .split("-")
    .map((v) => Number(v));
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function ymdToUtcDate(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function utcDateToYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekendUtc(date) {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

async function fetchKrHolidaySet(year) {
  const cached = holidaysCache.get(year);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < 24 * 60 * 60 * 1000) {
    return cached.set;
  }

  const isDbReady = HolidayCache?.db?.readyState === 1;

  if (isDbReady) {
    try {
      const doc = await HolidayCache.findOne({
        countryCode: "KR",
        year,
      }).lean();
      if (doc?.dates?.length && doc?.expiresAt) {
        const expiresAtMs = new Date(doc.expiresAt).getTime();
        if (!Number.isNaN(expiresAtMs) && expiresAtMs > now) {
          const setFromDb = new Set(doc.dates);
          holidaysCache.set(year, {
            set: setFromDb,
            fetchedAt: new Date(doc.fetchedAt || now).getTime(),
          });
          return setFromDb;
        }
      }
    } catch {
      // ignore
    }
  }

  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/KR`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    throw new Error(`Holiday API failed: ${resp.status}`);
  }
  const data = await resp.json();
  const set = new Set(
    Array.isArray(data)
      ? data
          .map((row) => (typeof row?.date === "string" ? row.date : null))
          .filter(Boolean)
      : []
  );

  holidaysCache.set(year, { set, fetchedAt: now });

  if (isDbReady) {
    try {
      const expiresAt = new Date(now + 90 * 24 * 60 * 60 * 1000);
      await HolidayCache.findOneAndUpdate(
        { countryCode: "KR", year },
        {
          $set: {
            dates: Array.from(set),
            fetchedAt: new Date(now),
            expiresAt,
          },
        },
        { upsert: true, new: true }
      ).lean();
    } catch {
      // ignore
    }
  }

  return set;
}

async function isKoreanHolidayYmd(ymd) {
  const p = parseYmd(ymd);
  if (!p) return false;
  const set = await fetchKrHolidaySet(p.y);
  return set.has(ymd);
}

async function isKoreanBusinessDayYmd(ymd) {
  const date = ymdToUtcDate(ymd);
  if (!date) return false;
  if (isWeekendUtc(date)) return false;
  if (await isKoreanHolidayYmd(ymd)) return false;
  return true;
}

export async function isKoreanBusinessDay(ymd) {
  return isKoreanBusinessDayYmd(ymd);
}

export async function addKoreanBusinessDays({ startYmd, days }) {
  const start = ymdToUtcDate(startYmd);
  if (!start) {
    throw new Error("Invalid startYmd");
  }
  const targetDays = typeof days === "number" && days > 0 ? days : 0;

  let current = new Date(start.getTime());
  let count = 0;

  while (count < targetDays) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    const ymd = utcDateToYmd(current);
    if (await isKoreanBusinessDayYmd(ymd)) {
      count += 1;
    }
  }

  return utcDateToYmd(current);
}

export async function nextKoreanBusinessDay({ fromYmd }) {
  const start = ymdToUtcDate(fromYmd);
  if (!start) {
    throw new Error("Invalid fromYmd");
  }

  let current = new Date(start.getTime());
  while (true) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    const ymd = utcDateToYmd(current);
    if (await isKoreanBusinessDayYmd(ymd)) {
      return ymd;
    }
  }
}

export function getTodayYmdInKst() {
  return formatYmdInTimeZone(new Date(), KST_TZ);
}

export function ymdToMmDd(ymd) {
  const p = parseYmd(ymd);
  if (!p) return "-";
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  return `${mm}/${dd}`;
}
