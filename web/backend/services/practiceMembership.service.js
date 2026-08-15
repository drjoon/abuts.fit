// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/businesses/business.update.controller.js
// - web/backend/jobs/practiceMembershipBillingWorker.js
// - web/frontend/src/features/platform/PracticeMembershipJoinDialog.tsx
// - web/backend/services/generalLedger.service.js
// - web/backend/services/practiceMembership.helpers.js
// - web/backend/utils/creditSettingsDefaults.js
// change-log:
// - 2026-08-15: 결제일 도래 시 유료 크레딧 실차감(면세). 부족 시 멤버십 OFF.
// - 2026-08-13: 치과 멤버십 해지=기간말 예약. 다음 결제일까지 유지, 그 다음 결제 없음.
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { toKstYmd } from "../utils/krBusinessDays.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { computeBusinessCreditBalanceFromLedger } from "./creditBalance.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";
import {
  addCalendarMonthsKst,
  advanceMembershipNextBillingAt,
  buildCancelSet,
  buildExpireSet,
  buildJoinSet,
  buildPracticeMembershipChargeIdempotencyKey,
  buildResumeSet,
  practiceMembershipResponseFields,
  resolveNextBillingAt,
  resolvePracticeMembershipMonthlyFee,
  toMembershipDate,
} from "./practiceMembership.helpers.js";

export {
  addCalendarMonthsKst,
  buildCancelSet,
  buildExpireSet,
  buildJoinSet,
  buildPracticeMembershipChargeIdempotencyKey,
  buildResumeSet,
  practiceMembershipResponseFields,
  resolveNextBillingAt,
  resolvePracticeMembershipMonthlyFee,
};

async function persistMembership(anchorId, set, { session } = {}) {
  await BusinessAnchor.updateOne({ _id: anchorId }, { $set: set }, { session });
  const { invalidateMyBusinessCache } = await import(
    "../controllers/businesses/business.controller.js"
  );
  invalidateMyBusinessCache(anchorId);
  const query = BusinessAnchor.findById(anchorId);
  if (session) query.session(session);
  return query.lean();
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

/**
 * 유료 크레딧만 차감(면세). fee=0이면 저널 없이 성공.
 * @returns {{ ok: boolean, charged: boolean, fee: number, journalId?: string, reason?: string }}
 */
export async function chargePracticeMembershipMonthlyFee({
  businessAnchorId,
  dueAt,
  fee,
  now = new Date(),
  session = null,
} = {}) {
  const anchorId = String(businessAnchorId || "").trim();
  const amount = Math.max(0, Math.round(Number(fee) || 0));
  if (!anchorId) {
    return { ok: false, charged: false, fee: amount, reason: "missing_anchor" };
  }
  if (amount <= 0) {
    return { ok: true, charged: false, fee: 0 };
  }

  const balance = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: anchorId,
    session,
  });
  const paidCredit = Math.max(0, Math.round(Number(balance?.paidCredit) || 0));
  if (paidCredit < amount) {
    return {
      ok: false,
      charged: false,
      fee: amount,
      reason: "insufficient_paid_credit",
      paidCredit,
    };
  }

  const idempotencyKey = buildPracticeMembershipChargeIdempotencyKey({
    businessAnchorId: anchorId,
    dueAt,
  });
  const glResult = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType: "PRACTICE_MEMBERSHIP_SPEND",
    businessAnchorId: anchorId,
    refType: "PRACTICE_MEMBERSHIP",
    refId: anchorId,
    occurredAt: now,
    meta: {
      reason: "practice_membership_monthly_fee",
      fee: amount,
      vatAmount: 0,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      billingYmd: toKstYmd(dueAt) || null,
    },
    lines: [
      {
        accountCode: "REQ_PAID_CREDIT",
        ownerRole: "requestor",
        ownerId: anchorId,
        amount: -amount,
        amountExcludingVat: -amount,
        vatAmount: 0,
        amountIncludingVat: -amount,
        creditKind: "PAID",
        refType: "PRACTICE_MEMBERSHIP",
        refId: anchorId,
        meta: {
          displayKind: "practice_membership",
          displayLabel: "치과 멤버십",
        },
      },
    ],
    session,
  });

  return {
    ok: true,
    charged: Boolean(glResult?.posted),
    fee: amount,
    journalId: glResult?.journalId || null,
    idempotent: Boolean(glResult?.idempotent),
  };
}

export async function processDuePracticeMembership(
  anchor,
  { now = new Date(), monthlyFee } = {},
) {
  if (!anchor?.practiceMembershipActive) {
    return { anchor, expired: false, renewed: false, charged: false };
  }
  const dueAt = toMembershipDate(anchor.practiceMembershipNextBillingAt);
  if (!dueAt || dueAt.getTime() > now.getTime()) {
    return { anchor, expired: false, renewed: false, charged: false };
  }
  if (anchor.practiceMembershipCancelAtPeriodEnd) {
    const expired = await persistMembership(anchor._id, buildExpireSet());
    return { anchor: expired, expired: true, renewed: false, charged: false };
  }

  const fee =
    monthlyFee != null
      ? resolvePracticeMembershipMonthlyFee({
          practiceMembershipMonthlyFee: monthlyFee,
        })
      : resolvePracticeMembershipMonthlyFee(await loadCreditSettingsDefaults());

  const nextBillingAt = advanceMembershipNextBillingAt(dueAt, now);
  const session = await mongoose.startSession();
  let chargeResult = { ok: true, charged: false, fee };
  let renewedAnchor = null;

  try {
    session.startTransaction();

    chargeResult = await chargePracticeMembershipMonthlyFee({
      businessAnchorId: anchor._id,
      dueAt,
      fee,
      now,
      session,
    });

    if (!chargeResult.ok) {
      renewedAnchor = await persistMembership(
        anchor._id,
        {
          ...buildExpireSet(),
          practiceMembershipCanceledAt: now,
        },
        { session },
      );
      await session.commitTransaction();
      return {
        anchor: renewedAnchor,
        expired: true,
        renewed: false,
        charged: false,
        fee,
        reason: chargeResult.reason || "charge_failed",
      };
    }

    renewedAnchor = await persistMembership(
      anchor._id,
      { practiceMembershipNextBillingAt: nextBillingAt },
      { session },
    );
    await session.commitTransaction();
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {
      // ignore
    }
    throw error;
  } finally {
    session.endSession();
  }

  if (chargeResult.charged && chargeResult.fee > 0) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId: anchor._id,
      balanceDelta: -chargeResult.fee,
      reason: "practice_membership_monthly_fee",
      refId: chargeResult.journalId || anchor._id,
    });
  }

  return {
    anchor: renewedAnchor,
    expired: false,
    renewed: true,
    charged: Boolean(chargeResult.charged),
    fee: chargeResult.fee,
    journalId: chargeResult.journalId || null,
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

  const monthlyFee = resolvePracticeMembershipMonthlyFee(
    await loadCreditSettingsDefaults(),
  );

  let expired = 0;
  let renewed = 0;
  let charged = 0;
  for (const row of due) {
    const result = await processDuePracticeMembership(row, {
      now,
      monthlyFee,
    });
    if (result.expired) expired += 1;
    if (result.renewed) renewed += 1;
    if (result.charged) charged += 1;
  }
  return {
    backfilled: missing.length,
    due: due.length,
    expired,
    renewed,
    charged,
    monthlyFee,
  };
}
