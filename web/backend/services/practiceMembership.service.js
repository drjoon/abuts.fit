// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/businesses/business.update.controller.js
// - web/backend/jobs/practiceMembershipBillingWorker.js
// - web/frontend/src/features/platform/PracticeMembershipJoinDialog.tsx
// change-log:
// - 2026-08-13: 치과 멤버십 해지=기간말 예약. 다음 결제일까지 유지, 그 다음 결제 없음.
import BusinessAnchor from "../models/businessAnchor.model.js";
import { toKstYmd } from "../utils/krBusinessDays.js";

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

async function persistMembership(anchorId, set) {
  await BusinessAnchor.updateOne({ _id: anchorId }, { $set: set });
  const { invalidateMyBusinessCache } = await import(
    "../controllers/businesses/business.controller.js"
  );
  invalidateMyBusinessCache(anchorId);
  return BusinessAnchor.findById(anchorId).lean();
}

export async function applyPracticeMembershipJoin(anchor, { now = new Date() } = {}) {
  if (anchor.practiceMembershipActive) {
    if (anchor.practiceMembershipCancelAtPeriodEnd) {
      return persistMembership(anchor._id, buildResumeSet());
    }
    return anchor;
  }
  return persistMembership(anchor._id, buildJoinSet(now));
}

export async function applyPracticeMembershipCancel(
  anchor,
  { now = new Date() } = {},
) {
  if (!anchor.practiceMembershipActive) {
    return { anchor, expiredNow: false };
  }
  const canceled = await persistMembership(
    anchor._id,
    buildCancelSet({
      nextBillingAt: anchor.practiceMembershipNextBillingAt,
      startedAt: anchor.practiceMembershipStartedAt,
      now,
    }),
  );
  const processed = await processDuePracticeMembership(canceled, { now });
  return {
    anchor: processed.anchor || canceled,
    expiredNow: Boolean(processed.expired),
  };
}

export async function applyPracticeMembershipForceOff(anchor) {
  if (!anchor?.practiceMembershipActive && !anchor?.practiceMembershipCancelAtPeriodEnd) {
    return anchor;
  }
  return persistMembership(anchor._id, {
    ...buildExpireSet(),
    practiceMembershipCanceledAt: new Date(),
  });
}

export async function processDuePracticeMembership(
  anchor,
  { now = new Date() } = {},
) {
  if (!anchor?.practiceMembershipActive) {
    return { anchor, expired: false, renewed: false };
  }
  const dueAt = toDate(anchor.practiceMembershipNextBillingAt);
  if (!dueAt || dueAt.getTime() > now.getTime()) {
    return { anchor, expired: false, renewed: false };
  }
  if (anchor.practiceMembershipCancelAtPeriodEnd) {
    const expired = await persistMembership(anchor._id, buildExpireSet());
    return { anchor: expired, expired: true, renewed: false, charged: false };
  }
  // 해지 예약이 없으면 다음 결제일만 연장. 실제 결제는 이 분기에서만 붙인다.
  let nextBillingAt = dueAt;
  let guard = 0;
  while (nextBillingAt.getTime() <= now.getTime() && guard < 120) {
    nextBillingAt = addCalendarMonthsKst(nextBillingAt, 1);
    guard += 1;
  }
  const renewed = await persistMembership(anchor._id, {
    practiceMembershipNextBillingAt: nextBillingAt,
  });
  return {
    anchor: renewed,
    expired: false,
    renewed: true,
    charged: false,
  };
}

export async function processDuePracticeMemberships({ now = new Date() } = {}) {
  const missing = await BusinessAnchor.find({
    practiceMembershipActive: true,
    $or: [
      { practiceMembershipNextBillingAt: null },
      { practiceMembershipNextBillingAt: { $exists: false } },
    ],
  })
    .select({
      practiceMembershipStartedAt: 1,
      createdAt: 1,
    })
    .lean();
  for (const row of missing) {
    await persistMembership(row._id, {
      practiceMembershipNextBillingAt: resolveNextBillingAt({
        from: row.practiceMembershipStartedAt || row.createdAt || now,
        now,
      }),
    });
  }

  const due = await BusinessAnchor.find({
    practiceMembershipActive: true,
    practiceMembershipNextBillingAt: { $ne: null, $lte: now },
  }).lean();

  let expired = 0;
  let renewed = 0;
  for (const row of due) {
    const result = await processDuePracticeMembership(row, { now });
    if (result.expired) expired += 1;
    if (result.renewed) renewed += 1;
  }
  return {
    backfilled: missing.length,
    due: due.length,
    expired,
    renewed,
  };
}
