// related files:
// - web/backend/services/practiceMembership.service.js
// - web/backend/jobs/practiceMembershipBillingWorker.js
// change-log:
// - 2026-08-15: 치과 멤버십 과금·일정 순수 헬퍼 분리(단위 테스트·서비스 공용).

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

export function buildJoinSet(now = new Date()) {
  return {
    practiceMembershipActive: true,
    practiceMembershipCancelAtPeriodEnd: false,
    practiceMembershipCanceledAt: null,
    practiceMembershipStartedAt: now,
    practiceMembershipNextBillingAt: addCalendarMonthsKst(now, 1),
  };
}

export function buildResumeSet() {
  return {
    practiceMembershipCancelAtPeriodEnd: false,
    practiceMembershipCanceledAt: null,
  };
}

export function buildCancelSet({
  nextBillingAt,
  startedAt,
  now = new Date(),
} = {}) {
  const existing = toDate(nextBillingAt);
  return {
    practiceMembershipCancelAtPeriodEnd: true,
    practiceMembershipCanceledAt: now,
    practiceMembershipNextBillingAt:
      existing || resolveNextBillingAt({ from: startedAt || now, now }),
  };
}

export function buildExpireSet() {
  return {
    practiceMembershipActive: false,
    practiceMembershipCancelAtPeriodEnd: false,
    practiceMembershipNextBillingAt: null,
  };
}

export function practiceMembershipResponseFields(anchor, { kind } = {}) {
  if (kind && kind !== "practice") {
    return {
      practiceMembershipActive: false,
      practiceMembershipCancelAtPeriodEnd: false,
      practiceMembershipNextBillingAt: null,
    };
  }
  return {
    practiceMembershipActive: Boolean(anchor?.practiceMembershipActive),
    practiceMembershipCancelAtPeriodEnd: Boolean(
      anchor?.practiceMembershipCancelAtPeriodEnd,
    ),
    practiceMembershipNextBillingAt: anchor?.practiceMembershipNextBillingAt
      ? new Date(anchor.practiceMembershipNextBillingAt).toISOString()
      : null,
  };
}

/** 공급가(원). VAT 0. */
export function resolvePracticeMembershipMonthlyFee(creditSettings) {
  return Math.max(
    0,
    Math.round(Number(creditSettings?.practiceMembershipMonthlyFee) || 0),
  );
}

export function buildPracticeMembershipChargeIdempotencyKey({
  businessAnchorId,
  dueAt,
}) {
  const ymd = toKstYmd(dueAt) || "unknown";
  return `gl:practice_membership:${String(businessAnchorId)}:${ymd}`;
}

export function advanceMembershipNextBillingAt(dueAt, now) {
  let nextBillingAt = toDate(dueAt);
  if (!nextBillingAt) return addCalendarMonthsKst(now, 1);
  let guard = 0;
  while (nextBillingAt.getTime() <= now.getTime() && guard < 120) {
    nextBillingAt = addCalendarMonthsKst(nextBillingAt, 1);
    guard += 1;
  }
  return nextBillingAt;
}

export { toDate as toMembershipDate };
