// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/businesses/business.update.controller.js
// - web/backend/jobs/labAutoMatchParticipationBillingWorker.js
// - web/frontend/src/features/settings/tabs/LabAutoMatchParticipationTab.tsx
// change-log:
// - 2026-08-14: 기공소 자동 매칭 월 참여(구독). 활성 시 practiceTransferAutoMatchEnabled=true.
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  addCalendarMonthsKst,
  resolveNextBillingAt,
} from "./practiceMembership.service.js";

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function buildAutoMatchJoinSet(now = new Date()) {
  return {
    practiceTransferAutoMatchEnabled: true,
    autoMatchParticipationCancelAtPeriodEnd: false,
    autoMatchParticipationCanceledAt: null,
    autoMatchParticipationStartedAt: now,
    autoMatchParticipationNextBillingAt: addCalendarMonthsKst(now, 1),
  };
}

export function buildAutoMatchResumeSet() {
  return {
    autoMatchParticipationCancelAtPeriodEnd: false,
    autoMatchParticipationCanceledAt: null,
  };
}

export function buildAutoMatchCancelSet({
  nextBillingAt,
  startedAt,
  now = new Date(),
} = {}) {
  const existing = toDate(nextBillingAt);
  return {
    autoMatchParticipationCancelAtPeriodEnd: true,
    autoMatchParticipationCanceledAt: now,
    autoMatchParticipationNextBillingAt:
      existing || resolveNextBillingAt({ from: startedAt || now, now }),
  };
}

export function buildAutoMatchExpireSet() {
  return {
    practiceTransferAutoMatchEnabled: false,
    autoMatchParticipationCancelAtPeriodEnd: false,
    autoMatchParticipationNextBillingAt: null,
  };
}

export function autoMatchParticipationResponseFields(anchor) {
  const active = Boolean(anchor?.practiceTransferAutoMatchEnabled);
  return {
    practiceTransferAutoMatchEnabled: active,
    autoMatchParticipationActive: active,
    autoMatchParticipationCancelAtPeriodEnd: Boolean(
      anchor?.autoMatchParticipationCancelAtPeriodEnd,
    ),
    autoMatchParticipationNextBillingAt: anchor?.autoMatchParticipationNextBillingAt
      ? new Date(anchor.autoMatchParticipationNextBillingAt).toISOString()
      : null,
  };
}

async function persist(anchorId, set) {
  await BusinessAnchor.updateOne({ _id: anchorId }, { $set: set });
  const { invalidateMyBusinessCache } = await import(
    "../controllers/businesses/business.controller.js"
  );
  invalidateMyBusinessCache(anchorId);
  return BusinessAnchor.findById(anchorId).lean();
}

export async function applyAutoMatchParticipationJoin(
  anchor,
  { now = new Date() } = {},
) {
  if (anchor.practiceTransferAutoMatchEnabled) {
    if (anchor.autoMatchParticipationCancelAtPeriodEnd) {
      return persist(anchor._id, buildAutoMatchResumeSet());
    }
    return anchor;
  }
  return persist(anchor._id, buildAutoMatchJoinSet(now));
}

export async function applyAutoMatchParticipationCancel(
  anchor,
  { now = new Date() } = {},
) {
  if (!anchor.practiceTransferAutoMatchEnabled) {
    return { anchor, expiredNow: false };
  }
  const canceled = await persist(
    anchor._id,
    buildAutoMatchCancelSet({
      nextBillingAt: anchor.autoMatchParticipationNextBillingAt,
      startedAt: anchor.autoMatchParticipationStartedAt,
      now,
    }),
  );
  const processed = await processDueAutoMatchParticipation(canceled, { now });
  return {
    anchor: processed.anchor || canceled,
    expiredNow: Boolean(processed.expired),
  };
}

export async function applyAutoMatchParticipationForceOff(anchor) {
  if (
    !anchor?.practiceTransferAutoMatchEnabled &&
    !anchor?.autoMatchParticipationCancelAtPeriodEnd
  ) {
    return anchor;
  }
  return persist(anchor._id, {
    ...buildAutoMatchExpireSet(),
    autoMatchParticipationCanceledAt: new Date(),
  });
}

export async function applyAutoMatchParticipationForceOn(
  anchor,
  { now = new Date() } = {},
) {
  if (
    anchor?.practiceTransferAutoMatchEnabled &&
    !anchor?.autoMatchParticipationCancelAtPeriodEnd
  ) {
    return anchor;
  }
  if (anchor?.practiceTransferAutoMatchEnabled) {
    return persist(anchor._id, buildAutoMatchResumeSet());
  }
  return persist(anchor._id, buildAutoMatchJoinSet(now));
}

export async function processDueAutoMatchParticipation(
  anchor,
  { now = new Date() } = {},
) {
  if (!anchor?.practiceTransferAutoMatchEnabled) {
    return { anchor, expired: false, renewed: false };
  }
  const dueAt = toDate(anchor.autoMatchParticipationNextBillingAt);
  if (!dueAt || dueAt.getTime() > now.getTime()) {
    return { anchor, expired: false, renewed: false };
  }
  if (anchor.autoMatchParticipationCancelAtPeriodEnd) {
    const expired = await persist(anchor._id, buildAutoMatchExpireSet());
    return { anchor: expired, expired: true, renewed: false, charged: false };
  }
  let nextBillingAt = dueAt;
  let guard = 0;
  while (nextBillingAt.getTime() <= now.getTime() && guard < 120) {
    nextBillingAt = addCalendarMonthsKst(nextBillingAt, 1);
    guard += 1;
  }
  const renewed = await persist(anchor._id, {
    autoMatchParticipationNextBillingAt: nextBillingAt,
  });
  return {
    anchor: renewed,
    expired: false,
    renewed: true,
    charged: false,
  };
}

export async function processDueAutoMatchParticipations({
  now = new Date(),
} = {}) {
  const due = await BusinessAnchor.find({
    practiceTransferAutoMatchEnabled: true,
    autoMatchParticipationNextBillingAt: { $lte: now },
  })
    .select({
      practiceTransferAutoMatchEnabled: 1,
      autoMatchParticipationCancelAtPeriodEnd: 1,
      autoMatchParticipationNextBillingAt: 1,
      autoMatchParticipationStartedAt: 1,
    })
    .lean();

  let expired = 0;
  let renewed = 0;
  for (const row of due) {
    const result = await processDueAutoMatchParticipation(row, { now });
    if (result.expired) expired += 1;
    if (result.renewed) renewed += 1;
  }
  return { due: due.length, expired, renewed };
}
