// related files:
// - web/backend/rules.md
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/models/creditBalanceGuard.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/controllers/admin/adminFreeCreditGrant.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.nc.controller.js
// - web/backend/controllers/bg/bg.controller.js
import mongoose, { Types } from "mongoose";
import BusinessCreditBalance from "../models/businessCreditBalance.model.js";
import CreditBalanceGuard from "../models/creditBalanceGuard.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import { deleteGeneralLedgerCommitJournal } from "./generalLedger.service.js";

function normalizeAnchorObjectId(businessAnchorId) {
  const raw = String(businessAnchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

/**
 * 의뢰자 소비 배분 SSOT:
 * - 버킷: 유료(paid) + 무료(freeRequest+freeShipping) + 기공(settlement, lab 전용·치과는 0).
 * - 소진 순서: 무료 → 기공(settlement 상계) → 유료(선입금).
 * - GL 계정은 FREE_REQUEST / FREE_SHIPPING / LAB_SETTLEMENT 분리 유지.
 * - freeOrder: 무료 하위계정 우선순위(기본 의뢰무료→배송무료).
 */
export function allocateSpendFromCreditBuckets({
  amount,
  paidCredit = 0,
  freeRequestCredit = 0,
  freeShippingCredit = 0,
  settlementCredit = 0,
  freeOrder = ["freeRequest", "freeShipping"],
} = {}) {
  const required = Math.max(0, Math.round(Number(amount || 0)));
  const paid = Math.max(0, Math.round(Number(paidCredit || 0)));
  const freeRequest = Math.max(0, Math.round(Number(freeRequestCredit || 0)));
  const freeShipping = Math.max(0, Math.round(Number(freeShippingCredit || 0)));
  const settlement = Math.max(0, Math.round(Number(settlementCredit || 0)));
  const freeCredit = freeRequest + freeShipping;
  const available = paid + freeCredit + settlement;

  let remaining = required;
  let fromFreeRequest = 0;
  let fromFreeShipping = 0;

  const order = Array.isArray(freeOrder) && freeOrder.length
    ? freeOrder
    : ["freeRequest", "freeShipping"];

  for (const key of order) {
    if (remaining <= 0) break;
    if (key === "freeRequest") {
      fromFreeRequest = Math.min(freeRequest, remaining);
      remaining -= fromFreeRequest;
    } else if (key === "freeShipping") {
      fromFreeShipping = Math.min(freeShipping, remaining);
      remaining -= fromFreeShipping;
    }
  }

  const fromSettlement = Math.min(settlement, remaining);
  remaining -= fromSettlement;

  const fromPaid = Math.min(paid, remaining);
  remaining -= fromPaid;

  return {
    required,
    paidCredit: paid,
    freeRequestCredit: freeRequest,
    freeShippingCredit: freeShipping,
    freeCredit,
    settlementCredit: settlement,
    available,
    fromFreeRequest,
    fromFreeShipping,
    fromSettlement,
    fromPaid,
    fromFree: fromFreeRequest + fromFreeShipping,
    shortfall: Math.max(0, remaining),
    ok: remaining <= 0,
  };
}

async function lockCreditBalanceGuardByAnchor({ businessAnchorId, session }) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { locked: false, reason: "invalid_anchor" };

  await CreditBalanceGuard.updateOne(
    { businessAnchorId: anchorObjectId },
    {
      $inc: { version: 1 },
      $setOnInsert: { businessAnchorId: anchorObjectId },
    },
    { upsert: true, session },
  );

  return { locked: true };
}

export async function computeBusinessCreditBalanceFromLedger({
  businessAnchorId,
  session,
}) {
  // 잔액 버킷:
  // - paidCredit: 유료(선입금). freeCredit: 무료(REQ_FREE_REQUEST + REQ_FREE_SHIPPING 합).
  // - freeRequestCredit/freeShippingCredit: GL 하위계정 잔액(하위호환·원장 추적).
  // - settlementCredit: 기공소 기공크레딧(LAB_SETTLEMENT_CREDIT). 치과는 0·UI 미노출.
  // - balance: paid+free(선입금·무료 지갑). spendableBalance: +settlement(주문 차감 가능액).
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) {
    return {
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      freeCredit: 0,
      settlementCredit: 0,
      balance: 0,
      spendableBalance: 0,
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
            "LAB_SETTLEMENT_CREDIT",
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
  let settlement = 0;

  for (const row of glRows || []) {
    const code = String(row?._id || "");
    const total = Number(row?.total || 0);
    if (!Number.isFinite(total)) continue;
    if (code === "REQ_PAID_CREDIT") paid += total;
    else if (code === "REQ_FREE_REQUEST_CREDIT") freeRequest += total;
    else if (code === "REQ_FREE_SHIPPING_CREDIT") freeShipping += total;
    else if (code === "LAB_SETTLEMENT_CREDIT") settlement += total;
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const freeRequestCredit = Math.max(0, Math.round(freeRequest));
  const freeShippingCredit = Math.max(0, Math.round(freeShipping));
  const freeCredit = freeRequestCredit + freeShippingCredit;
  const settlementCredit = Math.max(0, Math.round(settlement));
  const balance = paidCredit + freeCredit;

  return {
    paidCredit,
    freeRequestCredit,
    freeShippingCredit,
    freeCredit,
    settlementCredit,
    balance,
    spendableBalance: balance + settlementCredit,
  };
}

export async function getBusinessCreditBalanceSnapshot({
  businessAnchorId,
  session,
  upsertIfMissing = true,
}) {
  // NOTE:
  // - 함수명 호환성을 위해 "Snapshot" 네이밍은 유지한다.
  // - 실제 반환값 SSOT는 BusinessCreditBalance 스냅샷이 아니라 General Ledger 집계다.
  // - upsertIfMissing 파라미터는 하위호환용이며 GL 직집계 경로에서는 동작에 영향을 주지 않는다.
  void upsertIfMissing;

  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) {
    return {
      businessAnchorId: null,
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      freeCredit: 0,
      settlementCredit: 0,
      balance: 0,
      spendableBalance: 0,
      source: "invalid",
    };
  }

  const glBalance = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: anchorObjectId,
    session,
  });

  const paidCredit = Number(glBalance?.paidCredit || 0);
  const freeRequestCredit = Number(glBalance?.freeRequestCredit || 0);
  const freeShippingCredit = Number(glBalance?.freeShippingCredit || 0);
  const freeCredit = Number(glBalance?.freeCredit || 0);
  const settlementCredit = Number(glBalance?.settlementCredit || 0);
  const balance = Number(glBalance?.balance || 0);

  return {
    businessAnchorId: String(anchorObjectId),
    paidCredit,
    freeRequestCredit,
    freeShippingCredit,
    freeCredit,
    settlementCredit,
    balance,
    spendableBalance: Number(
      glBalance?.spendableBalance ?? balance + settlementCredit,
    ),
    source: "gl",
  };
}

const REQUEST_SPEND_COMMIT_EVENT_TYPE = "REQUEST_SPEND_COMMIT";

async function findCommitJournalBySpendKey({ spendUniqueKey, session }) {
  const idempotencyKey = `gl:${String(spendUniqueKey || "").trim()}`;
  if (!idempotencyKey || idempotencyKey === "gl:") return null;

  const journal = await LedgerJournal.findOne({
    idempotencyKey,
    eventType: { $in: [REQUEST_SPEND_COMMIT_EVENT_TYPE, "SHIPPING_SPEND_COMMIT"] },
  })
    .session(session || null)
    .lean();

  return journal || null;
}

async function filterRequestSpendCommitJournalIds({ journalIds, session }) {
  const ids = [
    ...new Set(
      (journalIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return [];

  const rows = await LedgerJournal.find({
    journalId: { $in: ids },
    eventType: REQUEST_SPEND_COMMIT_EVENT_TYPE,
  })
    .select({ journalId: 1 })
    .session(session || null)
    .lean();

  const allowed = new Set(
    (rows || []).map((row) => String(row?.journalId || "")).filter(Boolean),
  );
  return ids.filter((id) => allowed.has(id));
}

async function computeSpendRestoreBreakdownByJournalId({ journalId, session }) {
  const id = String(journalId || "").trim();
  if (!id) {
    return {
      restorePaid: 0,
      restoreBonusRequest: 0,
      restoreBonusShipping: 0,
      restoreSettlement: 0,
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
            "LAB_SETTLEMENT_CREDIT",
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
  let restoreSettlement = 0;

  for (const row of rows || []) {
    const code = String(row?._id || "");
    const total = Math.max(0, Number(row?.total || 0));
    if (!Number.isFinite(total) || total <= 0) continue;
    if (code === "REQ_PAID_CREDIT") restorePaid += total;
    else if (code === "REQ_FREE_REQUEST_CREDIT") restoreBonusRequest += total;
    else if (code === "REQ_FREE_SHIPPING_CREDIT") restoreBonusShipping += total;
    else if (code === "LAB_SETTLEMENT_CREDIT") restoreSettlement += total;
  }

  const rollbackAmount =
    restorePaid +
    restoreBonusRequest +
    restoreBonusShipping +
    restoreSettlement;

  return {
    restorePaid: Math.round(restorePaid),
    restoreBonusRequest: Math.round(restoreBonusRequest),
    restoreBonusShipping: Math.round(restoreBonusShipping),
    restoreSettlement: Math.round(restoreSettlement),
    rollbackAmount: Math.round(rollbackAmount),
  };
}

export async function spendRequestCreditAtomic({
  request,
  businessAnchorId,
  actorUserId,
  session,
  computedPrice,
  spendKeySuffix = "machining_spend",
}) {
  if (!request?._id) return { didSpend: false };

  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { didSpend: false };

  const requestIdStr = String(request?._id || "").trim();
  const suffix = String(spendKeySuffix || "machining_spend").trim() || "machining_spend";
  const uniqueKey = `request:${requestIdStr}:${suffix}`;

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

  // 동시 차감 경합 직렬화:
  // - 동일 businessAnchorId 기준으로 guard 문서를 갱신해 write-conflict를 유도한다.
  // - 트랜잭션 재시도 시 최신 GL 스냅샷으로 재평가되어 overspend를 방지한다.
  await lockCreditBalanceGuardByAnchor({
    businessAnchorId: anchorObjectId,
    session,
  });

  // SSOT 변경:
  // - 잔액 검증은 BusinessCreditBalance 스냅샷이 아니라 GL 직접 집계값으로 처리한다.
  // - 실제 차감은 GL COMMIT 저널 적재로 반영되므로, 여기서는 선차감 update를 수행하지 않는다.
  const glBalance = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: anchorObjectId,
    session,
  });

  const split = allocateSpendFromCreditBuckets({
    amount: resolvedAmount,
    paidCredit: Number(glBalance?.paidCredit || 0),
    freeRequestCredit: Number(glBalance?.freeRequestCredit || 0),
    freeShippingCredit: Number(glBalance?.freeShippingCredit || 0),
    settlementCredit: Number(glBalance?.settlementCredit || 0),
    freeOrder: ["freeRequest", "freeShipping"],
  });

  if (!split.ok) {
    const err = new Error("의뢰자 잔액 부족으로 가공 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_machining",
      paidCredit: split.paidCredit,
      freeRequestCredit: split.freeRequestCredit,
      freeShippingCredit: split.freeShippingCredit,
      freeCredit: split.freeCredit,
      settlementCredit: split.settlementCredit,
      availableForMachining: split.available,
      required: resolvedAmount,
      requestId: request?._id ? String(request._id) : null,
    };
    throw err;
  }

  return {
    didSpend: true,
    resolvedAmount,
    fromPaid: split.fromPaid,
    fromBonusRequest: split.fromFreeRequest,
    fromBonusShipping: split.fromFreeShipping,
    fromFreeRequest: split.fromFreeRequest,
    fromFreeShipping: split.fromFreeShipping,
    fromSettlement: split.fromSettlement,
    uniqueKey,
  };
}

export async function spendShippingCreditAtomic({
  businessAnchorId,
  shippingPackageId = null,
  spendUniqueKey = null,
  actorUserId,
  fee,
  session,
}) {
  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  const packageIdRaw = String(shippingPackageId || "").trim();
  const packageObjectId = Types.ObjectId.isValid(packageIdRaw)
    ? new Types.ObjectId(packageIdRaw)
    : null;
  const customKey = String(spendUniqueKey || "").trim();

  if (!anchorObjectId) {
    return { didSpend: false, reason: "invalid_input" };
  }
  if (!packageObjectId && !customKey) {
    return { didSpend: false, reason: "invalid_input" };
  }

  const amount = Number(fee || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { didSpend: false, reason: "invalid_fee" };
  }

  const uniqueKey =
    customKey ||
    `shippingPackage:${String(packageObjectId)}:shipping_fee`;
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

  // 동시 차감 경합 직렬화:
  // - 동일 businessAnchorId 기준으로 guard 문서를 갱신해 write-conflict를 유도한다.
  // - 트랜잭션 재시도 시 최신 GL 스냅샷으로 재평가되어 overspend를 방지한다.
  await lockCreditBalanceGuardByAnchor({
    businessAnchorId: anchorObjectId,
    session,
  });

  // SSOT 변경:
  // - 잔액 검증은 BusinessCreditBalance 스냅샷 대신 GL 집계값으로 계산한다.
  // - 차감 반영은 SHIPPING_SPEND_COMMIT 저널 적재 시점에 이루어진다.
  const glBalance = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: anchorObjectId,
    session,
  });

  const split = allocateSpendFromCreditBuckets({
    amount,
    paidCredit: Number(glBalance?.paidCredit || 0),
    freeRequestCredit: Number(glBalance?.freeRequestCredit || 0),
    freeShippingCredit: Number(glBalance?.freeShippingCredit || 0),
    settlementCredit: Number(glBalance?.settlementCredit || 0),
    freeOrder: ["freeShipping", "freeRequest"],
  });

  if (!split.ok) {
    const err = new Error("의뢰자 잔액 부족으로 배송비 차감 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_shipping",
      paidCredit: split.paidCredit,
      freeRequestCredit: split.freeRequestCredit,
      freeShippingCredit: split.freeShippingCredit,
      freeCredit: split.freeCredit,
      settlementCredit: split.settlementCredit,
      availableForShipping: split.available,
      required: amount,
      shippingPackageId: packageObjectId ? String(packageObjectId) : null,
      spendUniqueKey: uniqueKey,
    };
    throw err;
  }

  return {
    didSpend: true,
    amount,
    fromPaid: split.fromPaid,
    fromBonusShipping: split.fromFreeShipping,
    fromBonusRequest: split.fromFreeRequest,
    fromFreeRequest: split.fromFreeRequest,
    fromFreeShipping: split.fromFreeShipping,
    fromSettlement: split.fromSettlement,
    uniqueKey,
    shippingPackageId: packageObjectId ? String(packageObjectId) : null,
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

  const ownSession = !session;
  const txSession = session || (await mongoose.startSession());

  try {
    if (ownSession) txSession.startTransaction();

    const requestMongoId = String(request._id);
    const requestId = String(request?.requestId || "").trim();
    const uniqueKeys = [
      `request:${requestMongoId}:machining_spend`,
      `request:${requestMongoId}:express_surcharge`,
    ];
    const journalIds = [];
    const seen = new Set();

    const pushJournalId = (rawId) => {
      const id = String(rawId || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      journalIds.push(id);
    };

    console.log("[CREDIT_ROLLBACK][REQUEST][SERVICE] lookup start", {
      requestMongoId,
      requestId: requestId || null,
      businessAnchorId: String(anchorObjectId),
      uniqueKeys,
      hasSession: !!session,
    });

    // 1) canonical unique keys(idempotency) — 생산비 + 신속 추가비
    for (const uniqueKey of uniqueKeys) {
      const byUnique = await findCommitJournalBySpendKey({
        spendUniqueKey: uniqueKey,
        session: txSession,
      });
      if (byUnique?.journalId) {
        pushJournalId(byUnique.journalId);
      }
    }

    // 2) journal ref 매칭 (레거시 합산 차감 포함)
    if (!journalIds.length) {
      const byRef = await LedgerJournal.find({
        eventType: REQUEST_SPEND_COMMIT_EVENT_TYPE,
        refType: "REQUEST",
        refId: request._id,
      })
        .select({ journalId: 1 })
        .session(txSession)
        .lean();

      for (const row of byRef || []) pushJournalId(row?.journalId);
    }

    // 3) journal meta 매칭 (legacy/이관 데이터 호환)
    if (!journalIds.length) {
      const metaOr = [{ "meta.requestMongoId": requestMongoId }];
      if (requestId) metaOr.push({ "meta.requestId": requestId });

      const byMeta = await LedgerJournal.find({
        eventType: REQUEST_SPEND_COMMIT_EVENT_TYPE,
        $or: metaOr,
      })
        .select({ journalId: 1 })
        .session(txSession)
        .lean();

      for (const row of byMeta || []) pushJournalId(row?.journalId);
    }

    // 4) line 기준 역탐색 (journal ref/meta 누락 케이스 보완)
    // HOLD 차감 라인(제출 보류)은 소비 커밋이 아니므로 COMMIT만 채택한다.
    if (!journalIds.length) {
      const lineRows = await LedgerLine.find({
        businessAnchorId: anchorObjectId,
        ownerRole: "requestor",
        ownerId: anchorObjectId,
        refType: "REQUEST",
        refId: request._id,
        accountCode: { $in: ["REQ_PAID_CREDIT", "REQ_FREE_REQUEST_CREDIT"] },
        amount: { $lt: 0 },
      })
        .select({ journalId: 1 })
        .session(txSession)
        .lean();

      const lineJournalIds = [];
      for (const row of lineRows || []) {
        const id = String(row?.journalId || "").trim();
        if (id) lineJournalIds.push(id);
      }
      const commitIds = await filterRequestSpendCommitJournalIds({
        journalIds: lineJournalIds,
        session: txSession,
      });
      for (const id of commitIds) pushJournalId(id);
    }

    const commitJournalIds = await filterRequestSpendCommitJournalIds({
      journalIds,
      session: txSession,
    });

    console.log("[CREDIT_ROLLBACK][REQUEST][SERVICE] lookup result", {
      requestMongoId,
      requestId: requestId || null,
      uniqueKeys,
      matchedJournalIds: commitJournalIds,
    });

    if (!commitJournalIds.length) {
      console.warn("[CREDIT_ROLLBACK][REQUEST][SERVICE] no spend journals found", {
        requestMongoId,
        requestId: requestId || null,
        businessAnchorId: String(anchorObjectId),
        uniqueKeys,
        refType: "REQUEST",
        refId: requestMongoId,
      });
      if (ownSession) await txSession.commitTransaction();
      return { didRollback: false, reason: "no_spend" };
    }

    let restorePaidSum = 0;
    let restoreBonusRequestSum = 0;
    let rollbackAmountSum = 0;

    for (const journalId of commitJournalIds) {
      const { restorePaid, restoreBonusRequest, rollbackAmount } =
        await computeSpendRestoreBreakdownByJournalId({
          journalId,
          session: txSession,
        });

      console.log("[CREDIT_ROLLBACK][REQUEST][SERVICE] delete candidate", {
        requestMongoId: String(request._id),
        journalId,
        restorePaid: Number(restorePaid || 0),
        restoreBonusRequest: Number(restoreBonusRequest || 0),
        rollbackAmount: Number(rollbackAmount || 0),
      });

      const deleteResult = await deleteGeneralLedgerCommitJournal({
        journalId,
        expectedEventTypes: [REQUEST_SPEND_COMMIT_EVENT_TYPE],
        session: txSession,
      });

      if (!deleteResult?.deleted) {
        console.warn("[CREDIT_ROLLBACK][REQUEST][SERVICE] delete failed", {
          requestMongoId: String(request._id),
          journalId,
          reason: deleteResult?.reason || "journal_not_deleted",
          eventType: deleteResult?.eventType || null,
        });

        const err = new Error("request_spend_rollback_delete_failed");
        err.rollbackReason = deleteResult?.reason || "journal_not_deleted";
        throw err;
      }

      restorePaidSum += Number(restorePaid || 0);
      restoreBonusRequestSum += Number(restoreBonusRequest || 0);
      rollbackAmountSum += Number(rollbackAmount || 0);
    }

    const reconciledSnapshot = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: anchorObjectId,
      session: txSession,
    });

    if (ownSession) await txSession.commitTransaction();

    console.log("[CREDIT_ROLLBACK][REQUEST][SERVICE] balance restored", {
      requestMongoId: String(request._id),
      requestId: request?.requestId || null,
      businessAnchorId: String(anchorObjectId),
      restorePaidSum: Number(restorePaidSum || 0),
      restoreBonusRequestSum: Number(restoreBonusRequestSum || 0),
      rollbackAmountSum: Number(rollbackAmountSum || 0),
      reconciledSnapshot,
      deletedJournalIds: commitJournalIds,
    });

    return {
      didRollback: true,
      rollbackAmount: Math.round(Number(rollbackAmountSum || 0)),
      deletedSpendUniqueKeys: uniqueKeys,
      deletedJournalIds: commitJournalIds,
    };
  } catch (error) {
    if (ownSession) {
      await txSession.abortTransaction().catch(() => null);
    }

    if (String(error?.message || "") === "request_spend_rollback_delete_failed") {
      return {
        didRollback: false,
        reason: error?.rollbackReason || "journal_not_deleted",
      };
    }

    throw error;
  } finally {
    if (ownSession) {
      await txSession.endSession().catch(() => null);
    }
  }
}

/**
 * 신속 배송 추가 의뢰크레딧만 취소(물리 삭제).
 * - 생산 지연으로 약속 발송일을 지키지 못했거나
 * - 준비 단계에서 신속→묶음으로 변경한 경우 사용
 */
export async function deleteExpressSurchargeAtomic({
  request,
  businessAnchorId,
  session,
}) {
  if (!request?._id) return { didRollback: false, reason: "invalid_request" };

  const anchorObjectId = normalizeAnchorObjectId(businessAnchorId);
  if (!anchorObjectId) return { didRollback: false, reason: "invalid_anchor" };

  const ownSession = !session;
  const txSession = session || (await mongoose.startSession());

  try {
    if (ownSession) txSession.startTransaction();

    const requestMongoId = String(request._id);
    const uniqueKey = `request:${requestMongoId}:express_surcharge`;

    const byUnique = await findCommitJournalBySpendKey({
      spendUniqueKey: uniqueKey,
      session: txSession,
    });

    if (!byUnique?.journalId) {
      if (ownSession) await txSession.commitTransaction();
      return { didRollback: false, reason: "no_express_surcharge" };
    }

    const journalId = String(byUnique.journalId);
    const { restorePaid, restoreBonusRequest, rollbackAmount } =
      await computeSpendRestoreBreakdownByJournalId({
        journalId,
        session: txSession,
      });

    const deleteResult = await deleteGeneralLedgerCommitJournal({
      journalId,
      expectedEventTypes: ["REQUEST_SPEND_COMMIT"],
      session: txSession,
    });

    if (!deleteResult?.deleted) {
      const err = new Error("express_surcharge_rollback_delete_failed");
      err.rollbackReason = deleteResult?.reason || "journal_not_deleted";
      throw err;
    }

    if (ownSession) await txSession.commitTransaction();

    console.log("[CREDIT_ROLLBACK][EXPRESS] surcharge cancelled", {
      requestMongoId,
      requestId: request?.requestId || null,
      businessAnchorId: String(anchorObjectId),
      journalId,
      rollbackAmount: Number(rollbackAmount || 0),
      restorePaid: Number(restorePaid || 0),
      restoreBonusRequest: Number(restoreBonusRequest || 0),
    });

    return {
      didRollback: true,
      rollbackAmount: Math.round(Number(rollbackAmount || 0)),
      deletedSpendUniqueKeys: [uniqueKey],
      deletedJournalIds: [journalId],
    };
  } catch (error) {
    if (ownSession) {
      await txSession.abortTransaction().catch(() => null);
    }

    if (
      String(error?.message || "") === "express_surcharge_rollback_delete_failed"
    ) {
      return {
        didRollback: false,
        reason: error?.rollbackReason || "journal_not_deleted",
      };
    }

    throw error;
  } finally {
    if (ownSession) {
      await txSession.endSession().catch(() => null);
    }
  }
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

  const ownSession = !session;
  const txSession = session || (await mongoose.startSession());

  try {
    if (ownSession) txSession.startTransaction();

    const uniqueKey = `shippingPackage:${String(packageObjectId)}:shipping_fee`;
    const journalIds = [];
    const seen = new Set();

    const byUnique = await findCommitJournalBySpendKey({
      spendUniqueKey: uniqueKey,
      session: txSession,
    });
    if (byUnique?.journalId) {
      const id = String(byUnique.journalId);
      if (!seen.has(id)) {
        seen.add(id);
        journalIds.push(id);
      }
    }

    // 호환 보강: 과거 키 포맷 불일치/예외 데이터는 refType+refId 기준으로 보완 탐색한다.
    if (!journalIds.length) {
      const byRef = await LedgerJournal.find({
        eventType: "SHIPPING_SPEND_COMMIT",
        refType: "SHIPPING_PACKAGE",
        refId: packageObjectId,
      })
        .select({ journalId: 1 })
        .session(txSession)
        .lean();

      for (const row of byRef || []) {
        const id = String(row?.journalId || "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        journalIds.push(id);
      }
    }

    if (!journalIds.length) {
      if (ownSession) await txSession.commitTransaction();
      return { didRollback: false, reason: "no_spend" };
    }

    let restorePaidSum = 0;
    let restoreBonusShippingSum = 0;
    let rollbackAmountSum = 0;

    for (const journalId of journalIds) {
      const { restorePaid, restoreBonusShipping, rollbackAmount } =
        await computeSpendRestoreBreakdownByJournalId({
          journalId,
          session: txSession,
        });

      const deleteResult = await deleteGeneralLedgerCommitJournal({
        journalId,
        expectedEventTypes: ["SHIPPING_SPEND_COMMIT"],
        session: txSession,
      });

      if (!deleteResult?.deleted) {
        const err = new Error("shipping_spend_rollback_delete_failed");
        err.rollbackReason = deleteResult?.reason || "journal_not_deleted";
        throw err;
      }

      restorePaidSum += Number(restorePaid || 0);
      restoreBonusShippingSum += Number(restoreBonusShipping || 0);
      rollbackAmountSum += Number(rollbackAmount || 0);
    }

    const reconciledSnapshot = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: anchorObjectId,
      session: txSession,
    });

    if (ownSession) await txSession.commitTransaction();

    return {
      didRollback: true,
      rollbackAmount: Math.round(Number(rollbackAmountSum || 0)),
      deletedSpendUniqueKeys: [uniqueKey],
      deletedJournalIds: journalIds,
      reconciledSnapshot,
    };
  } catch (error) {
    if (ownSession) {
      await txSession.abortTransaction().catch(() => null);
    }

    if (
      String(error?.message || "") === "shipping_spend_rollback_delete_failed"
    ) {
      return {
        didRollback: false,
        reason: error?.rollbackReason || "journal_not_deleted",
      };
    }

    throw error;
  } finally {
    if (ownSession) {
      await txSession.endSession().catch(() => null);
    }
  }
}

// GL 직집계 모드에서는 선차감 스냅샷이 존재하지 않으므로 보정 로직은 no-op으로 유지한다.
// (호출부 하위호환을 위해 함수 시그니처/반환 형태만 유지)
export async function restoreRequestSpendDeductionAtomic({
  businessAnchorId,
  fromPaid,
  fromBonusRequest,
  session,
}) {
  void businessAnchorId;
  void fromPaid;
  void fromBonusRequest;
  void session;
  return { restored: false, reason: "gl_ssot_no_snapshot_deduction" };
}

export async function restoreShippingSpendDeductionAtomic({
  businessAnchorId,
  fromPaid,
  fromBonusShipping,
  session,
}) {
  void businessAnchorId;
  void fromPaid;
  void fromBonusShipping;
  void session;
  return { restored: false, reason: "gl_ssot_no_snapshot_deduction" };
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
      freeCredit: 0,
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
