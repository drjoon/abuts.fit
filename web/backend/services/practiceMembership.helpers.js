// related files:
// - web/backend/services/labAutoMatchParticipation.service.js
// change-log:
// - 2026-08-19: 치과 멤버십 폐지. 월 과금 헬퍼 삭제. KST 달력만 유지(자동매칭 참여 일정).

function toKstYmd(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function addCalendarMonthsKst(date, months) {
  const ymd = toKstYmd(date);
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return null;
  const total = year * 12 + (month - 1) + Number(months || 0);
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDay);
  const nextYmd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(
    nextDay,
  ).padStart(2, "0")}`;
  return new Date(`${nextYmd}T00:00:00+09:00`);
}

export function resolveNextBillingAt({ from, now = new Date() } = {}) {
  const start = toDate(from) || now;
  let next = addCalendarMonthsKst(start, 1);
  if (!next) return addCalendarMonthsKst(now, 1);
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 120) {
    next = addCalendarMonthsKst(next, 1);
    guard += 1;
  }
  return next;
}

export { toDate as toMembershipDate };
