// change-log:
// - 2026-09-18: Nager.Date KR 공휴일 정적 폴백(2025–2027). 추석 등 API/캐시 실패·동기 영업일 경로용.
// related files:
// - web/backend/utils/krBusinessDays.js
// - web/backend/utils/practiceTransferArrivalDates.js
// - web/frontend/src/shared/date/krHolidays.ts
//
// Source: https://date.nager.at/api/v3/PublicHolidays/{year}/KR
// Cross-check: 한국천문연구원 월력요항 · 관공서의 공휴일에 관한 규정
// 2026 추석: 2026-09-24 ~ 2026-09-26

/** @type {ReadonlyArray<string>} */
export const KR_PUBLIC_HOLIDAY_YMDS = Object.freeze([
  // 2025
  "2025-01-01",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-03-03",
  "2025-05-05",
  "2025-06-06",
  "2025-07-17",
  "2025-08-15",
  "2025-10-03",
  "2025-10-06",
  "2025-10-07",
  "2025-10-08",
  "2025-10-09",
  "2025-12-25",
  // 2026
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-02",
  "2026-05-01",
  "2026-05-05",
  "2026-05-25",
  "2026-06-03",
  "2026-06-06",
  "2026-07-17",
  "2026-08-17",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-02-06",
  "2027-02-08",
  "2027-02-09",
  "2027-03-01",
  "2027-05-03",
  "2027-05-05",
  "2027-05-13",
  "2027-06-06",
  "2027-07-19",
  "2027-08-16",
  "2027-09-14",
  "2027-09-15",
  "2027-09-16",
  "2027-10-04",
  "2027-10-11",
  "2027-12-25",
]);

const byYear = new Map();
for (const ymd of KR_PUBLIC_HOLIDAY_YMDS) {
  const year = Number(String(ymd).slice(0, 4));
  if (!Number.isFinite(year)) continue;
  let set = byYear.get(year);
  if (!set) {
    set = new Set();
    byYear.set(year, set);
  }
  set.add(ymd);
}

/** @param {number} year @returns {Set<string>} */
export function getStaticKrHolidaySet(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return new Set();
  const set = byYear.get(y);
  return set ? new Set(set) : new Set();
}

/** @param {string} ymd @returns {boolean} */
export function isStaticKrHolidayYmd(ymd) {
  const raw = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const year = Number(raw.slice(0, 4));
  return getStaticKrHolidaySet(year).has(raw);
}
