// change-log:
// - 2026-09-23: FM덴탈 월정액 배송. 유료 크레딧 차감 · 활성 시 박스 배송비 면제.
// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/jobs/fmDentalShippingBillingWorker.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/services/requestCreditHold.service.js
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { toKstYmd } from "../utils/krBusinessDays.js";
import {
  loadCreditSettingsDefaults,
  resolveCustomAbutmentProductionPriceForAt,
} from "../utils/creditSettingsDefaults.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { computeBusinessCreditBalanceFromLedger } from "./creditBalance.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";
import {
  addCalendarMonthsKst,
  resolveNextBillingAt,
  toMembershipDate,
} from "./practiceMembership.helpers.js";

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function buildFmDentalShippingJoinSet(now = new Date()) {
  return {
    fmDentalShippingActive: true,
    fmDentalShippingCancelAtPeriodEnd: false,
    fmDentalShippingCanceledAt: null,
    fmDentalShippingStartedAt: now,
    fmDentalShippingNextBillingAt: addCalendarMonthsKst(now, 1),
  };
}

export function buildFmDentalShippingResumeSet() {
  return {
    fmDentalShippingCancelAtPeriodEnd: false,
    fmDentalShippingCanceledAt: null,
  };
}

export function buildFmDentalShippingCancelSet({
  nextBillingAt,
  startedAt,
  now = new Date(),
} = {}) {
  const existing = toDate(nextBillingAt);
  return {
    fmDentalShippingCancelAtPeriodEnd: true,
    fmDentalShippingCanceledAt: now,
    fmDentalShippingNextBillingAt:
      existing || resolveNextBillingAt({ from: startedAt || now, now }),
  };
}

export function buildFmDentalShippingExpireSet() {
  return {
    fmDentalShippingActive: false,
    fmDentalShippingCancelAtPeriodEnd: false,
    fmDentalShippingNextBillingAt: null,
  };
}

export function fmDentalShippingResponseFields(anchor) {
  const active = Boolean(anchor?.fmDentalShippingActive);
  return {
    fmDentalShippingActive: active,
    fmDentalShippingCancelAtPeriodEnd: Boolean(
      anchor?.fmDentalShippingCancelAtPeriodEnd,
    ),
    fmDentalShippingNextBillingAt: anchor?.fmDentalShippingNextBillingAt
      ? new Date(anchor.fmDentalShippingNextBillingAt).toISOString()
      : null,
    fmDentalShippingStartedAt: anchor?.fmDentalShippingStartedAt
      ? new Date(anchor.fmDentalShippingStartedAt).toISOString()
      : null,
  };
}

export function resolveFmDentalMonthlyShippingFee(creditSettings) {
  return Math.max(
    0,
    Math.round(Number(creditSettings?.fmDentalMonthlyShippingFee) || 0),
  );
}

export function buildFmDentalShippingChargeIdempotencyKey({
  businessAnchorId,
  dueAt,
}) {
  const ymd = toKstYmd(dueAt) || "unknown";
  return `ba:${String(businessAnchorId)}:fm_shipping:${ymd}`;
}

export function advanceFmDentalShippingNextBillingAt(dueAt, now = new Date()) {
  const from = toDate(dueAt) || now;
  return resolveNextBillingAt({ from, now });
}

/** 런칭 이벤트 중이면 FM 월정액 가입 불가. */
export function isFmDentalShippingJoinAllowed(creditSettings, at = new Date()) {
  const fee = resolveFmDentalMonthlyShippingFee(creditSettings);
  if (fee <= 0) return { ok: false, reason: "fee_unset" };
  const resolved = resolveCustomAbutmentProductionPriceForAt(at, creditSettings);
  if (resolved.tier === "event") {
    return { ok: false, reason: "launch_event_active" };
  }
  return { ok: true, fee };
}

async function persist(anchorId, set, { session } = {}) {
  await BusinessAnchor.updateOne({ _id: anchorId }, { $set: set }, { session });
  const { invalidateMyBusinessCache } = await import(
    "../controllers/businesses/business.controller.js"
  );
  invalidateMyBusinessCache(anchorId);
  const query = BusinessAnchor.findById(anchorId);
  if (session) query.session(session);
  return query.lean();
}

export async function isFmDentalShippingActiveForAnchor(
  businessAnchorId,
  { session = null } = {},
) {
  const id = String(businessAnchorId || "").trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return false;
  const query = BusinessAnchor.findById(id).select({
    fmDentalShippingActive: 1,
  });
  if (session) query.session(session);
  const row = await query.lean();
  return Boolean(row?.fmDentalShippingActive);
}

export async function applyFmDentalShippingJoin(anchor, { now = new Date() } = {}) {
  if (anchor.fmDentalShippingActive) {
    if (anchor.fmDentalShippingCancelAtPeriodEnd) {
      return persist(anchor._id, buildFmDentalShippingResumeSet());
    }
    return anchor;
  }
  return persist(anchor._id, buildFmDentalShippingJoinSet(now));
}

export async function applyFmDentalShippingCancel(
  anchor,
  { now = new Date() } = {},
) {
  if (!anchor.fmDentalShippingActive) {
    return { anchor, expiredNow: false };
  }
  const canceled = await persist(
    anchor._id,
    buildFmDentalShippingCancelSet({
      nextBillingAt: anchor.fmDentalShippingNextBillingAt,
      startedAt: anchor.fmDentalShippingStartedAt,
      now,
    }),
  );
  const processed = await processDueFmDentalShipping(canceled, { now });
  return {
    anchor: processed.anchor || canceled,
    expiredNow: Boolean(processed.expired),
  };
}

/**
 * 유료 크레딧만 차감(면세). fee=0이면 저널 없이 성공.
 */
export async function chargeFmDentalMonthlyShippingFee({
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

  const idempotencyKey = buildFmDentalShippingChargeIdempotencyKey({
    businessAnchorId: anchorId,
    dueAt,
  });
  const glResult = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType: "FM_DENTAL_SHIPPING_SPEND",
    businessAnchorId: anchorId,
    refType: "FM_DENTAL_SHIPPING",
    refId: anchorId,
    occurredAt: now,
    meta: {
      reason: "fm_dental_monthly_shipping",
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
        refType: "FM_DENTAL_SHIPPING",
        refId: anchorId,
        meta: {
          displayKind: "fm_dental_shipping",
          displayLabel: "FM덴탈 월정액 배송",
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

export async function processDueFmDentalShipping(
  anchor,
  { now = new Date(), monthlyFee } = {},
) {
  if (!anchor?.fmDentalShippingActive) {
    return { anchor, expired: false, renewed: false, charged: false };
  }
  const dueAt = toMembershipDate(anchor.fmDentalShippingNextBillingAt);
  if (!dueAt || dueAt.getTime() > now.getTime()) {
    return { anchor, expired: false, renewed: false, charged: false };
  }
  if (anchor.fmDentalShippingCancelAtPeriodEnd) {
    const expired = await persist(anchor._id, buildFmDentalShippingExpireSet());
    return { anchor: expired, expired: true, renewed: false, charged: false };
  }

  const fee =
    monthlyFee != null
      ? resolveFmDentalMonthlyShippingFee({
          fmDentalMonthlyShippingFee: monthlyFee,
        })
      : resolveFmDentalMonthlyShippingFee(await loadCreditSettingsDefaults());

  if (fee <= 0) {
    const expired = await persist(anchor._id, {
      ...buildFmDentalShippingExpireSet(),
      fmDentalShippingCanceledAt: now,
    });
    return {
      anchor: expired,
      expired: true,
      renewed: false,
      charged: false,
      reason: "fee_unset",
    };
  }

  const nextBillingAt = advanceFmDentalShippingNextBillingAt(dueAt, now);
  const session = await mongoose.startSession();
  let chargeResult = { ok: true, charged: false, fee };
  let renewedAnchor = null;

  try {
    session.startTransaction();

    chargeResult = await chargeFmDentalMonthlyShippingFee({
      businessAnchorId: anchor._id,
      dueAt,
      fee,
      now,
      session,
    });

    if (!chargeResult.ok) {
      renewedAnchor = await persist(
        anchor._id,
        {
          ...buildFmDentalShippingExpireSet(),
          fmDentalShippingCanceledAt: now,
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

    renewedAnchor = await persist(
      anchor._id,
      { fmDentalShippingNextBillingAt: nextBillingAt },
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
      reason: "fm_dental_monthly_shipping",
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

export async function processDueFmDentalShippings({ now = new Date() } = {}) {
  const missing = await BusinessAnchor.find({
    fmDentalShippingActive: true,
    $or: [
      { fmDentalShippingNextBillingAt: null },
      { fmDentalShippingNextBillingAt: { $exists: false } },
    ],
  })
    .select({
      fmDentalShippingStartedAt: 1,
      createdAt: 1,
    })
    .lean();
  for (const row of missing) {
    await persist(row._id, {
      fmDentalShippingNextBillingAt: resolveNextBillingAt({
        from: row.fmDentalShippingStartedAt || row.createdAt || now,
        now,
      }),
    });
  }

  const due = await BusinessAnchor.find({
    fmDentalShippingActive: true,
    fmDentalShippingNextBillingAt: { $ne: null, $lte: now },
  }).lean();

  const monthlyFee = resolveFmDentalMonthlyShippingFee(
    await loadCreditSettingsDefaults(),
  );

  let expired = 0;
  let renewed = 0;
  let charged = 0;
  for (const row of due) {
    const result = await processDueFmDentalShipping(row, {
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
