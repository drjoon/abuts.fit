// related files:
// - web/backend/rules.md
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/models/creditLedger.model.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/bg/bg.controller.js
import { Types } from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";
import BusinessCreditBalance from "../models/businessCreditBalance.model.js";

function isShippingRefType(refType) {
  return refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE";
}

function resolveLedgerSplit(absAmount, spentPaidAmount, spentBonusAmount) {
  const abs = Math.max(0, Number(absAmount) || 0);
  const paidRaw = Number(spentPaidAmount);
  const bonusRaw = Number(spentBonusAmount);

  const hasPaid = Number.isFinite(paidRaw);
  const hasBonus = Number.isFinite(bonusRaw);
  if (!hasPaid && !hasBonus) return null;

  let paid = Math.max(0, hasPaid ? paidRaw : 0);
  let bonus = Math.max(0, hasBonus ? bonusRaw : 0);

  const splitSum = paid + bonus;
  if (splitSum <= 0) return null;

  if (splitSum > abs) {
    let overflow = splitSum - abs;
    const reducePaid = Math.min(paid, overflow);
    paid -= reducePaid;
    overflow -= reducePaid;
    if (overflow > 0) {
      bonus = Math.max(0, bonus - overflow);
    }
  } else if (splitSum < abs) {
    paid += abs - splitSum;
  }

  return { paid, bonus };
}

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
      bonusRequestCredit: 0,
      bonusShippingCredit: 0,
      balance: 0,
    };
  }

  const rows = await CreditLedger.find({ businessAnchorId: anchorObjectId })
    .sort({ createdAt: 1, _id: 1 })
    .select({
      type: 1,
      amount: 1,
      refType: 1,
      spentPaidAmount: 1,
      spentBonusAmount: 1,
    })
    .session(session || null)
    .lean();

  let paid = 0;
  let bonusRequest = 0;
  let bonusShipping = 0;

  for (const row of rows || []) {
    const type = String(row?.type || "");
    const amount = Number(row?.amount || 0);
    const refType = String(row?.refType || "");
    if (!Number.isFinite(amount)) continue;

    const absAmount = Math.abs(amount);
    if (type === "CHARGE") {
      paid += absAmount;
      continue;
    }
    if (type === "BONUS") {
      if (refType === "FREE_SHIPPING_CREDIT") {
        bonusShipping += absAmount;
      } else {
        bonusRequest += absAmount;
      }
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }

    if (type === "SPEND") {
      const split = resolveLedgerSplit(
        absAmount,
        row?.spentPaidAmount,
        row?.spentBonusAmount,
      );

      if (split) {
        if (isShippingRefType(refType)) {
          const fromBonusShipping = Math.min(bonusShipping, split.bonus);
          bonusShipping -= fromBonusShipping;
          paid -= split.paid + Math.max(0, split.bonus - fromBonusShipping);
        } else {
          const fromBonusRequest = Math.min(bonusRequest, split.bonus);
          bonusRequest -= fromBonusRequest;
          paid -= split.paid + Math.max(0, split.bonus - fromBonusRequest);
        }
        continue;
      }

      let spend = absAmount;
      if (isShippingRefType(refType)) {
        const fromBonusShipping = Math.min(bonusShipping, spend);
        bonusShipping -= fromBonusShipping;
        spend -= fromBonusShipping;
      } else {
        const fromBonusRequest = Math.min(bonusRequest, spend);
        bonusRequest -= fromBonusRequest;
        spend -= fromBonusRequest;
      }
      paid -= spend;
      continue;
    }

    if (type === "REFUND") {
      const split = resolveLedgerSplit(
        absAmount,
        row?.spentPaidAmount,
        row?.spentBonusAmount,
      );

      if (split) {
        if (isShippingRefType(refType)) {
          bonusShipping += split.bonus;
        } else {
          bonusRequest += split.bonus;
        }
        paid += split.paid;
      } else {
        paid += absAmount;
      }
    }
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const bonusRequestCredit = Math.max(0, Math.round(bonusRequest));
  const bonusShippingCredit = Math.max(0, Math.round(bonusShipping));

  return {
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
    balance: paidCredit + bonusRequestCredit + bonusShippingCredit,
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
      bonusRequestCredit: 0,
      bonusShippingCredit: 0,
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
    const bonusRequestCredit = Math.max(
      0,
      Math.round(Number(existing.bonusRequestCredit || 0)),
    );
    const bonusShippingCredit = Math.max(
      0,
      Math.round(Number(existing.bonusShippingCredit || 0)),
    );

    return {
      businessAnchorId: String(anchorObjectId),
      paidCredit,
      bonusRequestCredit,
      bonusShippingCredit,
      balance: paidCredit + bonusRequestCredit + bonusShippingCredit,
      source: "ssot",
    };
  }

  if (!upsertIfMissing) {
    return {
      businessAnchorId: String(anchorObjectId),
      paidCredit: 0,
      bonusRequestCredit: 0,
      bonusShippingCredit: 0,
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
        bonusRequestCredit: Number(snapshot.bonusRequestCredit || 0),
        bonusShippingCredit: Number(snapshot.bonusShippingCredit || 0),
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
  const spendKeyPrefix = `request:${requestIdStr}:machining_spend`;

  const spendRows = await CreditLedger.find({
    type: "SPEND",
    refType: "REQUEST",
    refId: request._id,
  })
    .select({
      _id: 1,
      uniqueKey: 1,
      amount: 1,
      hasFreeRequest: 1,
      createdAt: 1,
    })
    .sort({ createdAt: 1, _id: 1 })
    .session(session || null)
    .lean();

  const paidSpendRows = spendRows.filter((row) => Number(row?.amount || 0) < 0);
  const refundRows = await CreditLedger.find({
    type: "REFUND",
    refType: "REQUEST",
    refId: request._id,
  })
    .select({ amount: 1 })
    .session(session || null)
    .lean();

  const spendTotal = paidSpendRows.reduce(
    (acc, row) => acc + Math.abs(Number(row?.amount || 0)),
    0,
  );
  const refundTotal = refundRows.reduce(
    (acc, row) => acc + Math.abs(Number(row?.amount || 0)),
    0,
  );
  const outstanding = Math.max(0, Math.round(spendTotal - refundTotal));

  const latestNegativeSpend = paidSpendRows[paidSpendRows.length - 1] || null;
  if (outstanding > 0 && latestNegativeSpend?._id) {
    return {
      didSpend: false,
      reason: "already_spent",
      existingUniqueKey: latestNegativeSpend.uniqueKey,
      uniqueKey: String(latestNegativeSpend.uniqueKey || spendKeyPrefix),
    };
  }

  const spendAttempt = Math.max(1, paidSpendRows.length + 1);
  const uniqueKey =
    spendAttempt <= 1 ? spendKeyPrefix : `${spendKeyPrefix}:${spendAttempt}`;

  const existingFreeMarker = spendRows.find(
    (row) => Number(row?.amount || 0) === 0 && row?.hasFreeRequest === true,
  );

  const resolvedAmount = Number(computedPrice?.amount || 0);
  if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
    await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          businessAnchorId: anchorObjectId,
          userId: actorUserId || null,
          type: "SPEND",
          amount: 0,
          refType: "REQUEST",
          refId: request._id,
          uniqueKey,
          spentPaidAmount: 0,
          spentBonusAmount: 0,
          hasFreeRequest: true,
        },
      },
      { upsert: true, session },
    );
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
  const bonusRequestCredit = Number(balanceDoc?.bonusRequestCredit || 0);
  const availableForMachining = paidCredit + bonusRequestCredit;

  if (availableForMachining < resolvedAmount) {
    const err = new Error("의뢰자 잔액 부족으로 가공 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_machining",
      paidCredit,
      bonusRequestCredit,
      availableForMachining,
      required: resolvedAmount,
      requestId: request?._id ? String(request._id) : null,
    };
    throw err;
  }

  const fromBonusRequest = Math.min(bonusRequestCredit, resolvedAmount);
  const fromPaid = resolvedAmount - fromBonusRequest;

  let didLedgerMutate = false;

  if (existingFreeMarker?._id) {
    const corrected = await CreditLedger.updateOne(
      { _id: existingFreeMarker._id, amount: 0, hasFreeRequest: true },
      {
        $set: {
          userId: actorUserId || null,
          amount: -resolvedAmount,
          spentPaidAmount: fromPaid,
          spentBonusAmount: fromBonusRequest,
          hasFreeRequest: false,
        },
      },
      { session },
    );

    if (Number(corrected?.modifiedCount || 0) > 0) {
      didLedgerMutate = true;
    } else {
      const spendAfter = await CreditLedger.findOne({
        type: "SPEND",
        refType: "REQUEST",
        refId: request._id,
        amount: { $lt: 0 },
      })
        .select({ _id: 1 })
        .session(session || null)
        .lean();
      if (spendAfter?._id) {
        return {
          didSpend: false,
          reason: "already_spent",
          existingUniqueKey: existingFreeMarker.uniqueKey,
          uniqueKey,
        };
      }

      const err = new Error("요청 과금 free-marker 보정 경합 충돌");
      err.statusCode = 409;
      err.payload = {
        reason: "request_spend_correction_conflict",
        requestId: request?._id ? String(request._id) : null,
      };
      throw err;
    }
  } else {
    try {
      const inserted = await CreditLedger.updateOne(
        { uniqueKey },
        {
          $setOnInsert: {
            businessAnchorId: anchorObjectId,
            userId: actorUserId || null,
            type: "SPEND",
            amount: -resolvedAmount,
            refType: "REQUEST",
            refId: request._id,
            uniqueKey,
            spentPaidAmount: fromPaid,
            spentBonusAmount: fromBonusRequest,
          },
        },
        { upsert: true, session },
      );
      didLedgerMutate = Number(inserted?.upsertedCount || 0) > 0;
    } catch (error) {
      if (Number(error?.code || 0) !== 11000) {
        throw error;
      }

      return {
        didSpend: false,
        reason: "already_spent",
        uniqueKey,
      };
    }
  }

  if (!didLedgerMutate) {
    return { didSpend: false, reason: "already_spent", uniqueKey };
  }

  const balanceUpdated = await BusinessCreditBalance.updateOne(
    {
      businessAnchorId: anchorObjectId,
      paidCredit: { $gte: fromPaid },
      bonusRequestCredit: { $gte: fromBonusRequest },
    },
    {
      $inc: {
        paidCredit: -fromPaid,
        bonusRequestCredit: -fromBonusRequest,
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
      bonusRequestCredit: Number(latest?.bonusRequestCredit || 0),
      availableForMachining:
        Number(latest?.paidCredit || 0) + Number(latest?.bonusRequestCredit || 0),
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
  const existingSpendKeys = [
    uniqueKey,
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 24].map(
      (c) => `${uniqueKey}:${c}`,
    ),
  ];

  const existingSpend = await CreditLedger.findOne({
    uniqueKey: { $in: existingSpendKeys },
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    refId: packageObjectId,
  })
    .select({ _id: 1, uniqueKey: 1 })
    .session(session || null)
    .lean();

  if (existingSpend?._id) {
    return {
      didSpend: false,
      reason: "already_spent",
      existingUniqueKey: existingSpend.uniqueKey,
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
  const bonusShippingCredit = Number(balanceDoc?.bonusShippingCredit || 0);
  const availableForShipping = paidCredit + bonusShippingCredit;

  if (availableForShipping < amount) {
    const err = new Error("의뢰자 잔액 부족으로 포장.발송 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_shipping",
      paidCredit,
      bonusShippingCredit,
      required: amount,
      shippingPackageId: String(packageObjectId),
    };
    throw err;
  }

  const fromBonusShipping = Math.min(bonusShippingCredit, amount);
  const fromPaid = amount - fromBonusShipping;

  try {
    const inserted = await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          businessAnchorId: anchorObjectId,
          userId: actorUserId || null,
          type: "SPEND",
          amount: -amount,
          refType: "SHIPPING_PACKAGE",
          refId: packageObjectId,
          uniqueKey,
          spentPaidAmount: fromPaid,
          spentBonusAmount: fromBonusShipping,
        },
      },
      { upsert: true, session },
    );

    if (!Number(inserted?.upsertedCount || 0)) {
      return { didSpend: false, reason: "already_spent", uniqueKey };
    }
  } catch (error) {
    if (Number(error?.code || 0) !== 11000) {
      throw error;
    }
    return { didSpend: false, reason: "already_spent", uniqueKey };
  }

  const updated = await BusinessCreditBalance.updateOne(
    {
      businessAnchorId: anchorObjectId,
      paidCredit: { $gte: fromPaid },
      bonusShippingCredit: { $gte: fromBonusShipping },
    },
    {
      $inc: {
        paidCredit: -fromPaid,
        bonusShippingCredit: -fromBonusShipping,
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
      bonusShippingCredit: Number(latest?.bonusShippingCredit || 0),
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

export async function refundRequestCreditAtomic({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request?._id) return { didRefund: false, reason: "invalid_request" };

  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { didRefund: false, reason: "invalid_anchor" };

  const spendRows = await CreditLedger.find({
    type: "SPEND",
    refType: "REQUEST",
    refId: request._id,
  })
    .select({
      amount: 1,
      uniqueKey: 1,
      spentPaidAmount: 1,
      spentBonusAmount: 1,
      createdAt: 1,
    })
    .sort({ createdAt: 1, _id: 1 })
    .session(session || null)
    .lean();

  const paidSpendRows = spendRows.filter((row) => Number(row?.amount || 0) < 0);
  if (!paidSpendRows.length) return { didRefund: false, reason: "no_spend" };

  const refundRows = await CreditLedger.find({
    type: "REFUND",
    refType: "REQUEST",
    refId: request._id,
  })
    .select({ amount: 1 })
    .session(session || null)
    .lean();

  const spendTotal = paidSpendRows.reduce(
    (acc, row) => acc + Math.abs(Number(row?.amount || 0)),
    0,
  );
  const refundTotal = refundRows.reduce(
    (acc, row) => acc + Math.abs(Number(row?.amount || 0)),
    0,
  );
  const outstanding = Math.max(0, Math.round(spendTotal - refundTotal));
  if (outstanding <= 0) return { didRefund: false, reason: "already_refunded" };

  const latestSpendRow = paidSpendRows[paidSpendRows.length - 1] || null;
  if (!latestSpendRow?.uniqueKey) return { didRefund: false, reason: "no_spend_key" };

  const refundAmount = outstanding;
  const split = resolveLedgerSplit(
    refundAmount,
    latestSpendRow?.spentPaidAmount,
    latestSpendRow?.spentBonusAmount,
  );
  const refundSpentPaidAmount = split ? split.paid : null;
  const refundSpentBonusAmount = split ? split.bonus : null;

  const refundKeyPrefix = `request:${String(request._id)}:machining_refund`;
  const refundAttempt = Math.max(1, (refundRows || []).length + 1);
  const refundKey =
    refundAttempt <= 1 ? refundKeyPrefix : `${refundKeyPrefix}:${refundAttempt}`;
  let inserted = false;
  try {
    const result = await CreditLedger.updateOne(
      { uniqueKey: refundKey },
      {
        $setOnInsert: {
          businessAnchorId: anchorObjectId,
          userId: actorUserId || null,
          type: "REFUND",
          amount: refundAmount,
          refType: "REQUEST",
          refId: request._id,
          uniqueKey: refundKey,
          spentPaidAmount: refundSpentPaidAmount,
          spentBonusAmount: refundSpentBonusAmount,
        },
      },
      { upsert: true, session },
    );
    inserted = Number(result?.upsertedCount || 0) > 0;
  } catch (error) {
    if (Number(error?.code || 0) !== 11000) throw error;
    inserted = false;
  }

  if (!inserted) return { didRefund: false, reason: "already_refunded", refundKey };

  const incPaid = Number(refundSpentPaidAmount || 0);
  const incBonusRequest = Number(refundSpentBonusAmount || 0);
  const incFallback = !split ? refundAmount : 0;

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $inc: {
        paidCredit: incPaid + incFallback,
        bonusRequestCredit: incBonusRequest,
        version: 1,
      },
    },
    { session },
  );

  return {
    didRefund: true,
    refundAmount,
    refundKey,
  };
}

export async function refundShippingCreditAtomic({
  businessAnchorId,
  shippingPackageId,
  actorUserId,
  cycle,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  const packageIdRaw = String(shippingPackageId || "").trim();
  const packageObjectId = Types.ObjectId.isValid(packageIdRaw)
    ? new Types.ObjectId(packageIdRaw)
    : null;

  if (!anchorObjectId || !packageObjectId) {
    return { didRefund: false, reason: "invalid_input" };
  }

  const spendKeys = [
    `shippingPackage:${String(packageObjectId)}:shipping_fee`,
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 24].map(
      (c) => `shippingPackage:${String(packageObjectId)}:shipping_fee:${c}`,
    ),
  ];

  const spendRow = await CreditLedger.findOne({
    uniqueKey: { $in: spendKeys },
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    refId: packageObjectId,
  })
    .select({
      amount: 1,
      uniqueKey: 1,
      spentPaidAmount: 1,
      spentBonusAmount: 1,
    })
    .session(session || null)
    .lean();

  if (!spendRow?.uniqueKey) return { didRefund: false, reason: "no_spend" };

  const refundAmount = Math.abs(Number(spendRow.amount || 0));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { didRefund: false, reason: "invalid_refund_amount" };
  }

  const split = resolveLedgerSplit(
    refundAmount,
    spendRow?.spentPaidAmount,
    spendRow?.spentBonusAmount,
  );
  const refundSpentPaidAmount = split ? split.paid : null;
  const refundSpentBonusAmount = split ? split.bonus : null;

  const cycleNo = Math.max(0, Number(cycle || 0));
  const refundKey = `shippingPackage:${String(packageObjectId)}:shipping_fee_refund:${cycleNo}`;

  let inserted = false;
  try {
    const result = await CreditLedger.updateOne(
      { uniqueKey: refundKey },
      {
        $setOnInsert: {
          businessAnchorId: anchorObjectId,
          userId: actorUserId || null,
          type: "REFUND",
          amount: refundAmount,
          refType: "SHIPPING_PACKAGE",
          refId: packageObjectId,
          uniqueKey: refundKey,
          spentPaidAmount: refundSpentPaidAmount,
          spentBonusAmount: refundSpentBonusAmount,
        },
      },
      { upsert: true, session },
    );
    inserted = Number(result?.upsertedCount || 0) > 0;
  } catch (error) {
    if (Number(error?.code || 0) !== 11000) throw error;
    inserted = false;
  }

  if (!inserted) return { didRefund: false, reason: "already_refunded", refundKey };

  const incPaid = Number(refundSpentPaidAmount || 0);
  const incBonusShipping = Number(refundSpentBonusAmount || 0);
  const incFallback = !split ? refundAmount : 0;

  await BusinessCreditBalance.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $inc: {
        paidCredit: incPaid + incFallback,
        bonusShippingCredit: incBonusShipping,
        version: 1,
      },
    },
    { session },
  );

  return {
    didRefund: true,
    refundAmount,
    refundKey,
  };
}

export async function upsertBusinessCreditBalanceFromLedger({
  businessAnchorId,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) {
    return {
      businessAnchorId: null,
      paidCredit: 0,
      bonusRequestCredit: 0,
      bonusShippingCredit: 0,
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
        bonusRequestCredit: Number(snapshot.bonusRequestCredit || 0),
        bonusShippingCredit: Number(snapshot.bonusShippingCredit || 0),
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
