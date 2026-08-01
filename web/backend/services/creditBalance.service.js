// related files:
// - web/backend/rules.md
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/controllers/admin/adminFreeCreditGrant.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/bg/bg.controller.js
import { Types } from "mongoose";
import BusinessCreditBalance from "../models/businessCreditBalance.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import { deleteGeneralLedgerCommitJournal } from "./generalLedger.service.js";

function normalizeAnchorObjectId(businessAnchorId) {
  const raw = String(businessAnchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

export async function computeBusinessCreditBalanceFromLedger({
  businessAnchorId,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) {
    return {
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      balance: 0,
    };
  }

  // 1) SSOT General Ledger 우선
  const glRows = await LedgerLine.aggregate([
    {
      $match: {
        ownerRole: "requestor",
        ownerId: anchorObjectId,
        accountCode: {
          $in: [
            "REQ_PAID_CREDIT",
            "REQ_FREE_REQUEST_CREDIT",
            "REQ_FREE_SHIPPING_CREDIT",
          ],
        },
      },
    },
    {
      $group: {
        _id: "$accountCode",
        total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
      },
    },
  ]).session(session || null);

  let paid = 0;
  let freeRequest = 0;
  let freeShipping = 0;

  for (const row of glRows || []) {
    const code = String(row?._id || "");
    const total = Number(row?.total || 0);
    if (!Number.isFinite(total)) continue;
    if (code === "REQ_PAID_CREDIT") paid += total;
    else if (code === "REQ_FREE_REQUEST_CREDIT") freeRequest += total;
    else if (code === "REQ_FREE_SHIPPING_CREDIT") freeShipping += total;
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const freeRequestCredit = Math.max(0, Math.round(freeRequest));
  const freeShippingCredit = Math.max(0, Math.round(freeShipping));

  return {
    paidCredit,
    freeRequestCredit,
    freeShippingCredit,
    balance: paidCredit + freeRequestCredit + freeShippingCredit,
  };
}

export async function getBusinessCreditBalanceSnapshot({
  businessAnchorId,
  session,
  upsertIfMissing = true,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) {
    return {
      businessAnchorId: null,
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      balance: 0,
      source: "invalid",
    };
  }

  const existing = await BusinessCreditBalance.findOne({
    businessAnchorId: anchorObjectId,
  })
    .session(session || null)
    .lean();

  if (existing) {
    const paidCredit = Math.max(0, Math.round(Number(existing.paidCredit || 0)));
    const freeRequestCredit = Math.max(
      0,
      Math.round(Number(existing.freeRequestCredit || 0)),
    );
    const freeShippingCredit = Math.max(
      0,
      Math.round(Number(existing.freeShippingCredit || 0)),
    );

    return {
      businessAnchorId: String(anchorObjectId),
      paidCredit,
      freeRequestCredit,
      freeShippingCredit,
      balance: paidCredit + freeRequestCredit + freeShippingCredit,
      source: "ssot",
    };
  }

  if (!upsertIfMissing) {
    return {
      businessAnchorId: String(anchorObjectId),
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      balance: 0,
      source: "missing",
    };
  }

  const snapshot = await upsertBusinessCreditBalanceFromLedger({
    businessAnchorId: anchorObjectId,
    session,
  });

  return {
    ...snapshot,
    source: "ledger-backfill",
  };
}

async function getOrCreateBalanceDoc({ businessAnchorId, session }) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return null;

  let doc = await BusinessCreditBalance.findOne({
    businessAnchorId: anchorObjectId,
  })
    .session(session || null)
    .lean();
  if (doc) return doc;

  const snapshot = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: anchorObjectId,
    session,
  });

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $setOnInsert: {
        businessAnchorId: anchorObjectId,
        paidCredit: Number(snapshot.paidCredit || 0),
        freeRequestCredit: Number(snapshot.freeRequestCredit || 0),
        freeShippingCredit: Number(snapshot.freeShippingCredit || 0),
        version: 0,
      },
    },
    { upsert: true, session },
  ).catch(() => null);

  doc = await BusinessCreditBalance.findOne({
    businessAnchorId: anchorObjectId,
  })
    .session(session || null)
    .lean();
  return doc || null;
}

async function findCommitJournalBySpendKey({ spendUniqueKey, session }) {
  const idempotencyKey = `gl:${String(spendUniqueKey || "").trim()}`;
  if (!idempotencyKey || idempotencyKey === "gl:") return null;

  const journal = await LedgerJournal.findOne({
    idempotencyKey,
    eventType: { $in: ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"] },
  })
    .session(session || null)
    .lean();

  return journal || null;
}

async function computeSpendRestoreBreakdownByJournalId({ journalId, session }) {
  const id = String(journalId || "").trim();
  if (!id) {
    return {
      restorePaid: 0,
      restoreBonusRequest: 0,
      restoreBonusShipping: 0,
      rollbackAmount: 0,
    };
  }

  const rows = await LedgerLine.aggregate([
    {
      $match: {
        journalId: id,
        ownerRole: "requestor",
        accountCode: {
          $in: [
            "REQ_PAID_CREDIT",
            "REQ_FREE_REQUEST_CREDIT",
            "REQ_FREE_SHIPPING_CREDIT",
          ],
        },
      },
    },
    {
      $project: {
        accountCode: 1,
        amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
      },
    },
    {
      $group: {
        _id: "$accountCode",
        total: {
          $sum: {
            $cond: [{ $lt: ["$amountBase", 0] }, { $abs: "$amountBase" }, 0],
          },
        },
      },
    },
  ]).session(session || null);

  let restorePaid = 0;
  let restoreBonusRequest = 0;
  let restoreBonusShipping = 0;

  for (const row of rows || []) {
    const code = String(row?._id || "");
    const total = Math.max(0, Number(row?.total || 0));
    if (!Number.isFinite(total) || total <= 0) continue;
    if (code === "REQ_PAID_CREDIT") restorePaid += total;
    else if (code === "REQ_FREE_REQUEST_CREDIT") restoreBonusRequest += total;
    else if (code === "REQ_FREE_SHIPPING_CREDIT") restoreBonusShipping += total;
  }

  const rollbackAmount = restorePaid + restoreBonusRequest + restoreBonusShipping;

  return {
    restorePaid: Math.round(restorePaid),
    restoreBonusRequest: Math.round(restoreBonusRequest),
    restoreBonusShipping: Math.round(restoreBonusShipping),
    rollbackAmount: Math.round(rollbackAmount),
  };
}

export async function spendRequestCreditAtomic({
  request,
  businessAnchorId,
  actorUserId,
  session,
  computedPrice,
}) {
  if (!request?._id) return { didSpend: false };

  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { didSpend: false };

  const requestIdStr = String(request?._id || "").trim();
  const uniqueKey = `request:${requestIdStr}:machining_spend`;

  const existingJournal = await findCommitJournalBySpendKey({
    spendUniqueKey: uniqueKey,
    session,
  });
  if (existingJournal?.journalId) {
    return {
      didSpend: false,
      reason: "already_spent",
      existingUniqueKey: uniqueKey,
      uniqueKey,
    };
  }

  const resolvedAmount = Number(computedPrice?.amount || 0);
  if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
    return { didSpend: false, reason: "free_request", uniqueKey };
  }

  const balanceDoc = await getOrCreateBalanceDoc({
    businessAnchorId: anchorObjectId,
    session,
  });
  if (!balanceDoc) {
    throw new Error("Business credit balance document not found");
  }

  const paidCredit = Number(balanceDoc?.paidCredit || 0);
  const freeRequestCredit = Number(balanceDoc?.freeRequestCredit || 0);
  const availableForMachining = paidCredit + freeRequestCredit;

  if (availableForMachining < resolvedAmount) {
    const err = new Error("의뢰자 잔액 부족으로 가공 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_machining",
      paidCredit,
      freeRequestCredit,
      availableForMachining,
      required: resolvedAmount,
      requestId: request?._id ? String(request._id) : null,
    };
    throw err;
  }

  const fromBonusRequest = Math.min(freeRequestCredit, resolvedAmount);
  const fromPaid = resolvedAmount - fromBonusRequest;

  const balanceUpdated = await BusinessCreditBalance.updateOne(
    {
      businessAnchorId: anchorObjectId,
      paidCredit: { $gte: fromPaid },
      freeRequestCredit: { $gte: fromBonusRequest },
    },
    {
      $inc: {
        paidCredit: -fromPaid,
        freeRequestCredit: -fromBonusRequest,
        version: 1,
      },
    },
    { session },
  );

  if (Number(balanceUpdated?.modifiedCount || 0) <= 0) {
    const latest = await BusinessCreditBalance.findOne({
      businessAnchorId: anchorObjectId,
    })
      .session(session || null)
      .lean();

    const err = new Error("의뢰자 잔액 부족으로 가공 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_machining",
      paidCredit: Number(latest?.paidCredit || 0),
      freeRequestCredit: Number(latest?.freeRequestCredit || 0),
      availableForMachining:
        Number(latest?.paidCredit || 0) + Number(latest?.freeRequestCredit || 0),
      required: resolvedAmount,
      requestId: request?._id ? String(request._id) : null,
    };
    throw err;
  }

  return {
    didSpend: true,
    resolvedAmount,
    fromPaid,
    fromBonusRequest,
    uniqueKey,
  };
}

export async function spendShippingCreditAtomic({
  businessAnchorId,
  shippingPackageId,
  actorUserId,
  fee,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  const packageIdRaw = String(shippingPackageId || "").trim();
  const packageObjectId = Types.ObjectId.isValid(packageIdRaw)
    ? new Types.ObjectId(packageIdRaw)
    : null;

  if (!anchorObjectId || !packageObjectId) {
    return { didSpend: false, reason: "invalid_input" };
  }

  const amount = Number(fee || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { didSpend: false, reason: "invalid_fee" };
  }

  const uniqueKey = `shippingPackage:${String(packageObjectId)}:shipping_fee`;
  const existingJournal = await findCommitJournalBySpendKey({
    spendUniqueKey: uniqueKey,
    session,
  });
  if (existingJournal?.journalId) {
    return {
      didSpend: false,
      reason: "already_spent",
      existingUniqueKey: uniqueKey,
      uniqueKey,
    };
  }

  const balanceDoc = await getOrCreateBalanceDoc({
    businessAnchorId: anchorObjectId,
    session,
  });
  if (!balanceDoc) {
    throw new Error("Business credit balance document not found");
  }

  const paidCredit = Number(balanceDoc?.paidCredit || 0);
  const freeShippingCredit = Number(balanceDoc?.freeShippingCredit || 0);
  const availableForShipping = paidCredit + freeShippingCredit;

  if (availableForShipping < amount) {
    const err = new Error("의뢰자 잔액 부족으로 포장.발송 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_shipping",
      paidCredit,
      freeShippingCredit,
      required: amount,
      shippingPackageId: String(packageObjectId),
    };
    throw err;
  }

  const fromBonusShipping = Math.min(freeShippingCredit, amount);
  const fromPaid = amount - fromBonusShipping;

  const updated = await BusinessCreditBalance.updateOne(
    {
      businessAnchorId: anchorObjectId,
      paidCredit: { $gte: fromPaid },
      freeShippingCredit: { $gte: fromBonusShipping },
    },
    {
      $inc: {
        paidCredit: -fromPaid,
        freeShippingCredit: -fromBonusShipping,
        version: 1,
      },
    },
    { session },
  );

  if (Number(updated?.modifiedCount || 0) <= 0) {
    const latest = await BusinessCreditBalance.findOne({
      businessAnchorId: anchorObjectId,
    })
      .session(session || null)
      .lean();

    const err = new Error("의뢰자 잔액 부족으로 포장.발송 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_shipping",
      paidCredit: Number(latest?.paidCredit || 0),
      freeShippingCredit: Number(latest?.freeShippingCredit || 0),
      required: amount,
      shippingPackageId: String(packageObjectId),
    };
    throw err;
  }

  return {
    didSpend: true,
    amount,
    fromPaid,
    fromBonusShipping,
    uniqueKey,
    shippingPackageId: String(packageObjectId),
  };
}

export async function deleteRequestSpendAtomicOnRollback({
  request,
  businessAnchorId,
  session,
}) {
  if (!request?._id) return { didRollback: false, reason: "invalid_request" };

  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { didRollback: false, reason: "invalid_anchor" };

  const uniqueKey = `request:${String(request._id)}:machining_spend`;
  const journal = await findCommitJournalBySpendKey({
    spendUniqueKey: uniqueKey,
    session,
  });

  if (!journal?.journalId) {
    return { didRollback: false, reason: "no_spend" };
  }

  const { restorePaid, restoreBonusRequest, rollbackAmount } =
    await computeSpendRestoreBreakdownByJournalId({
      journalId: journal.journalId,
      session,
    });

  const deleteResult = await deleteGeneralLedgerCommitJournal({
    journalId: journal.journalId,
    expectedEventTypes: ["REQUEST_SPEND_COMMIT"],
    session,
  });

  if (!deleteResult?.deleted) {
    return {
      didRollback: false,
      reason: deleteResult?.reason || "journal_not_deleted",
    };
  }

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $inc: {
        paidCredit: Number(restorePaid || 0),
        freeRequestCredit: Number(restoreBonusRequest || 0),
        version: 1,
      },
      $setOnInsert: {
        businessAnchorId: anchorObjectId,
        paidCredit: 0,
        freeRequestCredit: 0,
        freeShippingCredit: 0,
      },
    },
    { session, upsert: true },
  );

  return {
    didRollback: true,
    rollbackAmount: Math.round(Number(rollbackAmount || 0)),
    deletedSpendUniqueKeys: [uniqueKey],
  };
}

export async function deleteShippingSpendAtomicOnRollback({
  businessAnchorId,
  shippingPackageId,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  const packageIdRaw = String(shippingPackageId || "").trim();
  const packageObjectId = Types.ObjectId.isValid(packageIdRaw)
    ? new Types.ObjectId(packageIdRaw)
    : null;

  if (!anchorObjectId || !packageObjectId) {
    return { didRollback: false, reason: "invalid_input" };
  }

  const uniqueKey = `shippingPackage:${String(packageObjectId)}:shipping_fee`;
  const journal = await findCommitJournalBySpendKey({
    spendUniqueKey: uniqueKey,
    session,
  });

  if (!journal?.journalId) {
    return { didRollback: false, reason: "no_spend" };
  }

  const { restorePaid, restoreBonusShipping, rollbackAmount } =
    await computeSpendRestoreBreakdownByJournalId({
      journalId: journal.journalId,
      session,
    });

  const deleteResult = await deleteGeneralLedgerCommitJournal({
    journalId: journal.journalId,
    expectedEventTypes: ["SHIPPING_SPEND_COMMIT"],
    session,
  });

  if (!deleteResult?.deleted) {
    return {
      didRollback: false,
      reason: deleteResult?.reason || "journal_not_deleted",
    };
  }

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $inc: {
        paidCredit: Number(restorePaid || 0),
        freeShippingCredit: Number(restoreBonusShipping || 0),
        version: 1,
      },
      $setOnInsert: {
        businessAnchorId: anchorObjectId,
        paidCredit: 0,
        freeRequestCredit: 0,
        freeShippingCredit: 0,
      },
    },
    { session, upsert: true },
  );

  return {
    didRollback: true,
    rollbackAmount: Math.round(Number(rollbackAmount || 0)),
    deletedSpendUniqueKeys: [uniqueKey],
  };
}

// 승인 경합으로 잔액만 선차감되고 GL 커밋이 idempotent 처리되는 경우를 보정한다.
export async function restoreRequestSpendDeductionAtomic({
  businessAnchorId,
  fromPaid,
  fromBonusRequest,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { restored: false, reason: "invalid_anchor" };

  const paid = Math.max(0, Number(fromPaid || 0));
  const free = Math.max(0, Number(fromBonusRequest || 0));
  if (!paid && !free) return { restored: false, reason: "zero_delta" };

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $inc: {
        paidCredit: paid,
        freeRequestCredit: free,
        version: 1,
      },
      $setOnInsert: {
        businessAnchorId: anchorObjectId,
        paidCredit: 0,
        freeRequestCredit: 0,
        freeShippingCredit: 0,
      },
    },
    { session, upsert: true },
  );

  return { restored: true, paid, free };
}

export async function restoreShippingSpendDeductionAtomic({
  businessAnchorId,
  fromPaid,
  fromBonusShipping,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { restored: false, reason: "invalid_anchor" };

  const paid = Math.max(0, Number(fromPaid || 0));
  const free = Math.max(0, Number(fromBonusShipping || 0));
  if (!paid && !free) return { restored: false, reason: "zero_delta" };

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $inc: {
        paidCredit: paid,
        freeShippingCredit: free,
        version: 1,
      },
      $setOnInsert: {
        businessAnchorId: anchorObjectId,
        paidCredit: 0,
        freeRequestCredit: 0,
        freeShippingCredit: 0,
      },
    },
    { session, upsert: true },
  );

  return { restored: true, paid, free };
}

// LEGACY_REMOVED: REFUND 기반 롤백 함수(refundRequestCreditAtomic/refundShippingCreditAtomic)
// 정책 변경에 따라 롤백은 소비 내역 물리 삭제(deleteRequestSpendAtomicOnRollback/deleteShippingSpendAtomicOnRollback)로 통일.

export async function upsertBusinessCreditBalanceFromLedger({
  businessAnchorId,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) {
    return {
      businessAnchorId: null,
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      balance: 0,
      upserted: false,
    };
  }

  const snapshot = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: anchorObjectId,
    session,
  });

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $set: {
        paidCredit: Number(snapshot.paidCredit || 0),
        freeRequestCredit: Number(snapshot.freeRequestCredit || 0),
        freeShippingCredit: Number(snapshot.freeShippingCredit || 0),
      },
      $setOnInsert: {
        businessAnchorId: anchorObjectId,
        version: 0,
      },
    },
    { upsert: true, session },
  );

  return {
    businessAnchorId: String(anchorObjectId),
    ...snapshot,
    upserted: true,
  };
}
