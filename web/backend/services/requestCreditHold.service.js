// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/requests/mailbox.utils.js
// change-log:
// - 2026-08-19: 같은 제출에서 원장 잔액 집계·가드 락을 앵커당 1회로 재사용.
import mongoose, { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import CreditBalanceGuard from "../models/creditBalanceGuard.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import Request from "../models/request.model.js";
import {
  allocateSpendFromCreditBuckets,
  computeBusinessCreditBalanceFromLedger,
} from "./creditBalance.service.js";
import {
  deleteGeneralLedgerCommitJournal,
  getJournalByIdempotencyKey,
  postGeneralLedgerJournal,
} from "./generalLedger.service.js";
import {
  isManufacturerSampleRequest,
  normalizeBusinessAnchorId,
  normalizeMailboxReceiverFingerprint,
  resolveShippingMailboxOrgId,
} from "../controllers/requests/mailbox.utils.js";
import { resolveEffectiveShippingMode } from "../controllers/requests/shippingPriority.utils.js";
import {
  countDesignAbutmentQty,
  resolveMachiningSpendAmount,
} from "../controllers/requests/designPrice.utils.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";

const SHIPPING_FEE_FALLBACK = 3500;

export const REQUEST_HOLD_EVENT_TYPES = [
  "REQUEST_SPEND_HOLD",
  "SHIPPING_SPEND_HOLD",
];

const REQUEST_HOLD_LABELS = {
  machining_spend: "의뢰비 보류",
  express_surcharge: "신속배송 보류",
  shipping_fee: "배송비 보류",
};

function requestHoldKey(requestMongoId, suffix) {
  return `request:${String(requestMongoId || "").trim()}:hold:${suffix}`;
}

export function requestMachiningHoldKey(requestMongoId) {
  return requestHoldKey(requestMongoId, "machining_spend");
}

export function requestExpressHoldKey(requestMongoId) {
  return requestHoldKey(requestMongoId, "express_surcharge");
}

export function requestShippingHoldKey(requestMongoId) {
  return requestHoldKey(requestMongoId, "shipping_fee");
}

export function buildShippingReceiverGroupKey(request) {
  const org =
    normalizeBusinessAnchorId(resolveShippingMailboxOrgId(request)) ||
    normalizeBusinessAnchorId(request?.businessAnchorId) ||
    "_";
  const fp = normalizeMailboxReceiverFingerprint(request) || "_";
  return `${org}:${fp}`;
}

function isPtxCaWithTransferHold(request) {
  const relatedPtxId = String(
    request?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  return Boolean(relatedPtxId && Types.ObjectId.isValid(relatedPtxId));
}

function isPracticePrepaidNonPartner(request) {
  const pb =
    request?.partnerBilling && typeof request.partnerBilling === "object"
      ? request.partnerBilling
      : {};
  return Boolean(pb.practicePrepaidAbutment) && !Boolean(pb.isTradingPartner);
}

export function resolveRequestCreditHoldAnchorId(request) {
  const pb =
    request?.partnerBilling && typeof request.partnerBilling === "object"
      ? request.partnerBilling
      : {};
  if (pb.practicePrepaidAbutment && pb.isTradingPartner) {
    const forced = normalizeBusinessAnchorId(pb.billingOwnerAnchorId);
    if (forced) return forced;
  }
  return (
    normalizeBusinessAnchorId(request?.businessAnchorId) ||
    normalizeBusinessAnchorId(request?.requestor?.businessAnchorId) ||
    ""
  );
}

export function shouldSkipMachiningHold(request) {
  if (isManufacturerSampleRequest(request)) return true;
  if (isPracticePrepaidNonPartner(request)) return true;
  return false;
}

export function shouldSkipShippingHold(request) {
  if (isManufacturerSampleRequest(request)) return true;
  if (isPtxCaWithTransferHold(request)) return true;
  return false;
}

async function lockCreditBalanceGuardByAnchor({ businessAnchorId, session }) {
  const raw = String(businessAnchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) {
    return { locked: false, reason: "invalid_anchor" };
  }
  const anchorObjectId = new Types.ObjectId(raw);
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

async function resolveDevopsEscrowOwnerId(session = null) {
  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ _id: 1 })
    .sort({ createdAt: 1 })
    .session(session || null)
    .lean();
  return devops?._id ? String(devops._id) : null;
}

async function resolveShippingFeePerBox() {
  try {
    const creditSettings = await loadCreditSettingsDefaults();
    const fee = Math.max(
      0,
      Math.round(Number(creditSettings?.shippingFee ?? SHIPPING_FEE_FALLBACK) || 0),
    );
    return fee > 0 ? fee : SHIPPING_FEE_FALLBACK;
  } catch {
    return SHIPPING_FEE_FALLBACK;
  }
}

function buildRequestorHoldDebitLines({
  split,
  requestorAnchorId,
  requestId,
  meta,
}) {
  const lines = [];
  if (split.fromFreeRequest > 0) {
    lines.push({
      accountCode: "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: String(requestorAnchorId),
      amount: -split.fromFreeRequest,
      amountExcludingVat: -split.fromFreeRequest,
      vatAmount: 0,
      creditKind: "FREE_REQUEST",
      refType: "REQUEST",
      refId: requestId,
      meta,
    });
  }
  if (split.fromFreeShipping > 0) {
    lines.push({
      accountCode: "REQ_FREE_SHIPPING_CREDIT",
      ownerRole: "requestor",
      ownerId: String(requestorAnchorId),
      amount: -split.fromFreeShipping,
      amountExcludingVat: -split.fromFreeShipping,
      vatAmount: 0,
      creditKind: "FREE_SHIPPING",
      refType: "REQUEST",
      refId: requestId,
      meta,
    });
  }
  if (split.fromSettlement > 0) {
    lines.push({
      accountCode: "LAB_SETTLEMENT_CREDIT",
      ownerRole: "requestor",
      ownerId: String(requestorAnchorId),
      amount: -split.fromSettlement,
      amountExcludingVat: -split.fromSettlement,
      vatAmount: 0,
      creditKind: "SETTLEMENT",
      refType: "REQUEST",
      refId: requestId,
      meta,
    });
  }
  if (split.fromPaid > 0) {
    lines.push({
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: String(requestorAnchorId),
      amount: -split.fromPaid,
      amountExcludingVat: -split.fromPaid,
      vatAmount: 0,
      creditKind: "PAID",
      refType: "REQUEST",
      refId: requestId,
      meta,
    });
  }
  return lines;
}

async function computeHoldRestoreDeltaByJournalId({ journalId, session }) {
  const id = String(journalId || "").trim();
  if (!id) return 0;

  const journal = await LedgerJournal.findOne({ journalId: id })
    .select({ meta: 1 })
    .session(session || null)
    .lean();
  const meta = journal?.meta || {};
  const fromPaid = Math.max(0, Math.round(Number(meta.fromPaid || 0)));
  const fromFreeRequest = Math.max(
    0,
    Math.round(Number(meta.fromFreeRequest || 0)),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(Number(meta.fromFreeShipping || 0)),
  );
  const fromSettlement = Math.max(
    0,
    Math.round(Number(meta.fromSettlement || 0)),
  );
  return fromPaid + fromFreeRequest + fromFreeShipping + fromSettlement;
}

function normalizeHoldBalanceBuckets(balance) {
  const paidCredit = Math.max(0, Math.round(Number(balance?.paidCredit || 0)));
  const freeRequestCredit = Math.max(
    0,
    Math.round(Number(balance?.freeRequestCredit || 0)),
  );
  const freeShippingCredit = Math.max(
    0,
    Math.round(Number(balance?.freeShippingCredit || 0)),
  );
  const settlementCredit = Math.max(
    0,
    Math.round(Number(balance?.settlementCredit || 0)),
  );
  const freeCredit = freeRequestCredit + freeShippingCredit;
  return {
    paidCredit,
    freeRequestCredit,
    freeShippingCredit,
    freeCredit,
    settlementCredit,
    balance: paidCredit + freeCredit,
    spendableBalance: paidCredit + freeCredit + settlementCredit,
  };
}

function applyHoldSplitToBalance(balance, split) {
  return normalizeHoldBalanceBuckets({
    paidCredit: Number(balance?.paidCredit || 0) - Number(split?.fromPaid || 0),
    freeRequestCredit:
      Number(balance?.freeRequestCredit || 0) -
      Number(split?.fromFreeRequest || 0),
    freeShippingCredit:
      Number(balance?.freeShippingCredit || 0) -
      Number(split?.fromFreeShipping || 0),
    settlementCredit:
      Number(balance?.settlementCredit || 0) - Number(split?.fromSettlement || 0),
  });
}

async function postOneRequestHold({
  request,
  requestorAnchorId,
  devopsAnchorId,
  amount,
  holdKind,
  eventType,
  idempotencyKey,
  freeOrder = ["freeRequest", "freeShipping"],
  actorUserId = null,
  session = null,
  cachedBalance = null,
  skipLock = false,
}) {
  const amt = Math.max(0, Math.round(Number(amount || 0)));
  const requestId = request?._id;
  if (!requestId || !requestorAnchorId || !devopsAnchorId || amt <= 0) {
    return { held: false, reason: "invalid_input" };
  }

  const existing = await getJournalByIdempotencyKey({
    idempotencyKey,
    session,
  });
  if (existing?.journalId) {
    return {
      held: false,
      reason: "already_held",
      journalId: existing.journalId,
      amount: amt,
    };
  }

  if (!skipLock) {
    await lockCreditBalanceGuardByAnchor({
      businessAnchorId: requestorAnchorId,
      session,
    });
  }

  const balance = cachedBalance
    ? normalizeHoldBalanceBuckets(cachedBalance)
    : await computeBusinessCreditBalanceFromLedger({
        businessAnchorId: requestorAnchorId,
        session,
      });

  const split = allocateSpendFromCreditBuckets({
    amount: amt,
    paidCredit: Number(balance?.paidCredit || 0),
    freeRequestCredit: Number(balance?.freeRequestCredit || 0),
    freeShippingCredit: Number(balance?.freeShippingCredit || 0),
    settlementCredit: Number(balance?.settlementCredit || 0),
    freeOrder,
  });

  if (!split.ok) {
    const err = new Error("의뢰자 크레딧이 부족합니다.");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_hold",
      holdKind,
      required: amt,
      available: split.available,
      requestId: String(requestId),
    };
    throw err;
  }

  const isShippingHold = holdKind === "shipping_fee";
  const displayLabel = REQUEST_HOLD_LABELS[holdKind] || "크레딧 보류";
  const spendMeta = {
    displayKind: isShippingHold ? "shipping_hold" : "request_fee_hold",
    displayLabel,
    usageKind: holdKind,
    escrow: true,
    holdKind,
    fromPaid: split.fromPaid,
    fromFreeRequest: split.fromFreeRequest,
    fromFreeShipping: split.fromFreeShipping,
    fromSettlement: split.fromSettlement,
    devopsAnchorId,
  };

  const journal = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType,
    businessAnchorId: requestorAnchorId,
    refType: "REQUEST",
    refId: requestId,
    createdBy: actorUserId,
    meta: {
      heldTotal: amt,
      holdKind,
      requestId: request?.requestId || null,
      requestMongoId: String(requestId),
      ...spendMeta,
    },
    lines: [
      ...buildRequestorHoldDebitLines({
        split,
        requestorAnchorId,
        requestId,
        meta: spendMeta,
      }),
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: amt,
        amountExcludingVat: amt,
        vatAmount: 0,
        creditKind: null,
        refType: "REQUEST",
        refId: requestId,
        meta: {
          ...spendMeta,
          source: "request_escrow_hold",
        },
      },
    ],
    session,
    skipIdempotencyLookup: true,
  });

  const posted = Boolean(journal?.posted);
  return {
    held: posted,
    reason: posted ? "posted" : journal?.idempotent ? "already_held" : "not_posted",
    journalId: journal?.journalId || existing?.journalId || null,
    amount: amt,
    fromPaid: split.fromPaid,
    fromFreeRequest: split.fromFreeRequest,
    fromFreeShipping: split.fromFreeShipping,
    fromSettlement: split.fromSettlement,
    balanceAfter: posted ? applyHoldSplitToBalance(balance, split) : null,
  };
}

function resolveMachiningHoldAmount(request) {
  const caseInfos = request?.caseInfos || {};
  const designFeePerTooth = Math.max(
    0,
    Number(request?.price?.designFee?.perTooth ?? request?.price?.designFee ?? 0) ||
      0,
  );
  const base = resolveMachiningSpendAmount({
    price: request?.price,
    caseInfos,
    designFeePerTooth: designFeePerTooth || undefined,
  });
  return Math.max(0, Math.round(Number(base || 0)));
}

function resolveExpressHoldAmount(request) {
  const shippingMode = resolveEffectiveShippingMode(request);
  if (shippingMode !== "express") return 0;
  if (String(request?.price?.expressFeeStatus || "") === "cancelled") return 0;
  const expressFee = Math.max(
    0,
    Math.round(Number(request?.price?.expressFee || 0)),
  );
  if (expressFee > 0) return expressFee;

  const caseInfos = request?.caseInfos || {};
  const expressQty =
    String(caseInfos?.productMode || "").trim() === "design_custom_abutment"
      ? Math.max(1, countDesignAbutmentQty(caseInfos))
      : 1;
  return expressQty * 2000;
}

/**
 * 의뢰 제출 시 기공비·신속·배송비(수신자별 1회)를 에스크로로 보류한다.
 */
export async function holdRequestCreditsOnSubmit({
  requests = [],
  actorUserId = null,
  session = null,
  devopsAnchorId: devopsAnchorIdArg = null,
  shippingFee: shippingFeeArg = null,
}) {
  const list = (Array.isArray(requests) ? requests : []).filter(Boolean);
  if (!list.length) return { held: false, reason: "empty" };

  const devopsAnchorId =
    String(devopsAnchorIdArg || "").trim() ||
    (await resolveDevopsEscrowOwnerId(session));
  if (!devopsAnchorId) {
    const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
    err.statusCode = 500;
    throw err;
  }

  const shippingFeeFromArg = Math.round(Number(shippingFeeArg));
  const shippingFee =
    Number.isFinite(shippingFeeFromArg) && shippingFeeFromArg > 0
      ? shippingFeeFromArg
      : await resolveShippingFeePerBox();
  const shippingGroupHeld = new Set();
  const lockedAnchors = new Set();
  const balanceByAnchor = new Map();
  let totalHeld = 0;
  const results = [];

  const takeCachedBalance = async (requestorAnchorId) => {
    if (!lockedAnchors.has(requestorAnchorId)) {
      await lockCreditBalanceGuardByAnchor({
        businessAnchorId: requestorAnchorId,
        session,
      });
      lockedAnchors.add(requestorAnchorId);
    }
    const cached = balanceByAnchor.get(requestorAnchorId);
    if (cached) return cached;
    const computed = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: requestorAnchorId,
      session,
    });
    balanceByAnchor.set(requestorAnchorId, computed);
    return computed;
  };

  const rememberBalance = (requestorAnchorId, holdResult) => {
    if (holdResult?.balanceAfter) {
      balanceByAnchor.set(requestorAnchorId, holdResult.balanceAfter);
    }
  };

  for (const request of list) {
    const requestorAnchorId = resolveRequestCreditHoldAnchorId(request);
    if (!requestorAnchorId) continue;

    if (!shouldSkipMachiningHold(request)) {
      const machiningAmount = resolveMachiningHoldAmount(request);
      if (machiningAmount > 0) {
        const holdResult = await postOneRequestHold({
          request,
          requestorAnchorId,
          devopsAnchorId,
          amount: machiningAmount,
          holdKind: "machining_spend",
          eventType: "REQUEST_SPEND_HOLD",
          idempotencyKey: requestMachiningHoldKey(request._id),
          actorUserId,
          session,
          cachedBalance: await takeCachedBalance(requestorAnchorId),
          skipLock: true,
        });
        if (holdResult.held) totalHeld += machiningAmount;
        rememberBalance(requestorAnchorId, holdResult);
        results.push({ kind: "machining_spend", ...holdResult });
      }

      const expressAmount = resolveExpressHoldAmount(request);
      if (expressAmount > 0) {
        const holdResult = await postOneRequestHold({
          request,
          requestorAnchorId,
          devopsAnchorId,
          amount: expressAmount,
          holdKind: "express_surcharge",
          eventType: "REQUEST_SPEND_HOLD",
          idempotencyKey: requestExpressHoldKey(request._id),
          actorUserId,
          session,
          cachedBalance: await takeCachedBalance(requestorAnchorId),
          skipLock: true,
        });
        if (holdResult.held) totalHeld += expressAmount;
        rememberBalance(requestorAnchorId, holdResult);
        results.push({ kind: "express_surcharge", ...holdResult });
      }
    }

    if (!shouldSkipShippingHold(request)) {
      const groupKey = buildShippingReceiverGroupKey(request);
      if (!shippingGroupHeld.has(groupKey)) {
        shippingGroupHeld.add(groupKey);
        const holdResult = await postOneRequestHold({
          request,
          requestorAnchorId,
          devopsAnchorId,
          amount: shippingFee,
          holdKind: "shipping_fee",
          eventType: "SHIPPING_SPEND_HOLD",
          idempotencyKey: requestShippingHoldKey(request._id),
          freeOrder: ["freeShipping", "freeRequest"],
          actorUserId,
          session,
          cachedBalance: await takeCachedBalance(requestorAnchorId),
          skipLock: true,
        });
        if (holdResult.held) totalHeld += shippingFee;
        rememberBalance(requestorAnchorId, holdResult);
        results.push({ kind: "shipping_fee", groupKey, ...holdResult });
      }
    }
  }

  return {
    held: totalHeld > 0,
    totalHeld,
    results,
  };
}

export async function getRequestHoldJournal({ idempotencyKey, session = null }) {
  return getJournalByIdempotencyKey({
    idempotencyKey: String(idempotencyKey || "").trim(),
    session,
  });
}

export async function releaseRequestHoldByKey({
  idempotencyKey,
  businessAnchorId = null,
  session = null,
  emitBalanceUpdate = true,
}) {
  const key = String(idempotencyKey || "").trim();
  if (!key) return { released: false, reason: "invalid_key" };

  const existing = await getJournalByIdempotencyKey({ idempotencyKey: key, session });
  if (!existing?.journalId) {
    return { released: false, reason: "not_found" };
  }

  const eventType = String(existing.eventType || "");
  const restoreDelta = await computeHoldRestoreDeltaByJournalId({
    journalId: existing.journalId,
    session,
  });

  const deleted = await deleteGeneralLedgerCommitJournal({
    journalId: existing.journalId,
    expectedEventTypes: REQUEST_HOLD_EVENT_TYPES.includes(eventType)
      ? [eventType]
      : REQUEST_HOLD_EVENT_TYPES,
    session,
  });

  if (!deleted?.deleted) {
    return {
      released: false,
      reason: deleted?.reason || "delete_failed",
      journalId: existing.journalId,
    };
  }

  const anchorId =
    normalizeBusinessAnchorId(businessAnchorId) ||
    normalizeBusinessAnchorId(existing.businessAnchorId);
  if (emitBalanceUpdate && anchorId && restoreDelta > 0) {
    try {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: anchorId,
        balanceDelta: restoreDelta,
        reason: "request_hold_release",
        refId: existing.journalId,
        forceEmit: true,
      });
    } catch {
      // best-effort
    }
  }

  return {
    released: true,
    journalId: existing.journalId,
    restoreDelta,
  };
}

/**
 * 준비 단계 취소 시 미전환 보류를 해제한다.
 */
export async function releaseRequestCreditHoldsOnCancel({
  request,
  actorUserId = null,
  session = null,
  deferredCreditEvents = null,
}) {
  if (!request?._id) return { released: false, reason: "invalid_request" };
  if (isManufacturerSampleRequest(request)) {
    return { released: false, reason: "sample" };
  }

  const requestMongoId = String(request._id);
  const anchorId = resolveRequestCreditHoldAnchorId(request);
  const keys = [
    requestMachiningHoldKey(requestMongoId),
    requestExpressHoldKey(requestMongoId),
    requestShippingHoldKey(requestMongoId),
  ];

  let totalRestore = 0;
  const released = [];

  for (const key of keys) {
    const result = await releaseRequestHoldByKey({
      idempotencyKey: key,
      businessAnchorId: anchorId,
      session,
      emitBalanceUpdate: false,
    });
    if (result.released) {
      totalRestore += Number(result.restoreDelta || 0);
      released.push(result.journalId);
    }
  }

  if (totalRestore > 0 && anchorId) {
    const payload = {
      businessAnchorId: anchorId,
      balanceDelta: totalRestore,
      reason: "request_cancel_hold_release",
      refId: request._id,
    };
    if (Array.isArray(deferredCreditEvents)) {
      deferredCreditEvents.push(payload);
    } else {
      try {
        await emitCreditBalanceUpdatedToBusiness({
          ...payload,
          forceEmit: true,
        });
      } catch {
        // best-effort
      }
    }
  }

  return {
    released: released.length > 0,
    releasedJournalIds: released,
    restoreDelta: totalRestore,
  };
}

/**
 * 우편함 합류 시 합류 의뢰의 중복 배송비 보류를 해제한다.
 * 칸에 보류가 없으면 유지(슬롯 홀더).
 */
export async function reconcileShippingHoldOnMailboxAssign({
  request,
  assignedMailboxAddress,
  joinedExistingSlot = false,
  session = null,
  actorUserId = null,
}) {
  if (!request?._id || !joinedExistingSlot) {
    return { reconciled: false, reason: "not_join" };
  }
  if (shouldSkipShippingHold(request)) {
    return { reconciled: false, reason: "skip" };
  }

  const mailbox = String(assignedMailboxAddress || "").trim();
  const payerAnchorId = resolveRequestCreditHoldAnchorId(request);
  if (!mailbox || !payerAnchorId) {
    return { reconciled: false, reason: "missing_context" };
  }

  const slotHold = await findMailboxSlotShippingHold({
    mailboxAddress: mailbox,
    payerAnchorId,
    receiverFingerprint: normalizeMailboxReceiverFingerprint(request),
    session,
    excludeRequestId: request._id,
  });

  if (!slotHold?.journalId) {
    return { reconciled: false, reason: "no_slot_holder" };
  }

  const ownKey = requestShippingHoldKey(request._id);
  const ownHold = await getRequestHoldJournal({ idempotencyKey: ownKey, session });
  if (!ownHold?.journalId) {
    return { reconciled: false, reason: "no_own_hold" };
  }
  if (String(ownHold.journalId) === String(slotHold.journalId)) {
    return { reconciled: false, reason: "already_slot_holder" };
  }

  const released = await releaseRequestHoldByKey({
    idempotencyKey: ownKey,
    businessAnchorId: payerAnchorId,
    session,
  });

  console.log("[SHIPPING_HOLD] released duplicate on mailbox join", {
    requestId: request?.requestId || null,
    mailboxAddress: mailbox,
    slotHolderRequestId: slotHold.requestId || null,
    released: released.released,
  });

  return {
    reconciled: released.released,
    released,
    slotHolderRequestId: slotHold.requestId || null,
  };
}

/**
 * 가공→준비 롤백으로 우편함이 해제될 때, 합류로 풀린 배송비 보류를 복원한다.
 */
export async function ensureRequestShippingHoldAfterMailboxRelease({
  request,
  actorUserId = null,
  session = null,
}) {
  if (!request?._id) return { held: false, reason: "invalid_request" };
  if (shouldSkipShippingHold(request)) return { held: false, reason: "skip" };
  if (normalizeMailboxAddress(request?.mailboxAddress)) {
    return { held: false, reason: "still_assigned" };
  }

  const existing = await getRequestHoldJournal({
    idempotencyKey: requestShippingHoldKey(request._id),
    session,
  });
  if (existing?.journalId) {
    return { held: false, reason: "already_held" };
  }

  const devopsAnchorId = await resolveDevopsEscrowOwnerId(session);
  if (!devopsAnchorId) return { held: false, reason: "no_devops" };

  const requestorAnchorId = resolveRequestCreditHoldAnchorId(request);
  const shippingFee = await resolveShippingFeePerBox();

  const holdResult = await postOneRequestHold({
    request,
    requestorAnchorId,
    devopsAnchorId,
    amount: shippingFee,
    holdKind: "shipping_fee",
    eventType: "SHIPPING_SPEND_HOLD",
    idempotencyKey: requestShippingHoldKey(request._id),
    freeOrder: ["freeShipping", "freeRequest"],
    actorUserId,
    session,
  });

  if (holdResult.held) {
    try {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: requestorAnchorId,
        balanceDelta: -shippingFee,
        reason: "shipping_hold_restore",
        refId: request._id,
      });
    } catch {
      // best-effort
    }
  }

  return holdResult;
}

function normalizeMailboxAddress(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

/**
 * 우편함 칸에 남아 있는 배송비 보류 1건을 찾는다(집하 전환 SSOT).
 */
export async function findMailboxSlotShippingHold({
  mailboxAddress,
  payerAnchorId,
  receiverFingerprint = "",
  session = null,
  excludeRequestId = null,
  requestIds = null,
}) {
  const mailbox = normalizeMailboxAddress(mailboxAddress);
  const anchor = normalizeBusinessAnchorId(payerAnchorId);
  if (!mailbox || !anchor) return null;

  let candidateIds = [];
  if (Array.isArray(requestIds) && requestIds.length) {
    candidateIds = requestIds.filter(Boolean);
  } else {
    const fp = String(receiverFingerprint || "").trim();
    const rows = await Request.find({
      mailboxAddress: mailbox,
      manufacturerStage: {
        $in: ["세척.패킹", "포장.발송", "가공", "추적관리"],
      },
    })
      .select({
        _id: 1,
        requestId: 1,
        businessAnchorId: 1,
        partnerBilling: 1,
        shippingReceiver: 1,
        requestor: 1,
      })
      .populate("requestor", "businessAnchorId")
      .session(session || null)
      .lean();

    for (const row of rows || []) {
      if (
        excludeRequestId &&
        String(row._id) === String(excludeRequestId)
      ) {
        continue;
      }
      if (resolveRequestCreditHoldAnchorId(row) !== anchor) continue;
      if (
        fp &&
        normalizeMailboxReceiverFingerprint(row) &&
        normalizeMailboxReceiverFingerprint(row) !== fp
      ) {
        continue;
      }
      candidateIds.push(row._id);
    }
  }

  for (const requestMongoId of candidateIds) {
    const hold = await getRequestHoldJournal({
      idempotencyKey: requestShippingHoldKey(requestMongoId),
      session,
    });
    if (hold?.journalId) {
      const reqRow = await Request.findById(requestMongoId)
        .select({ requestId: 1 })
        .session(session || null)
        .lean();
      return {
        journalId: hold.journalId,
        journal: hold,
        requestMongoId: String(requestMongoId),
        requestId: reqRow?.requestId || null,
        idempotencyKey: requestShippingHoldKey(requestMongoId),
      };
    }
  }

  return null;
}

/**
 * 보류 저널 메타(에스크로→매출 전환용).
 */
export async function readRequestHoldMeta({
  idempotencyKey,
  session = null,
}) {
  const hold = await getRequestHoldJournal({ idempotencyKey, session });
  if (!hold?.journalId) return null;
  const meta = hold.meta || {};
  return {
    journalId: hold.journalId,
    journal: hold,
    devopsAnchorId: String(meta.devopsAnchorId || "").trim() || null,
    fromPaid: Math.max(0, Math.round(Number(meta.fromPaid || 0))),
    fromFreeRequest: Math.max(0, Math.round(Number(meta.fromFreeRequest || 0))),
    fromFreeShipping: Math.max(
      0,
      Math.round(Number(meta.fromFreeShipping || 0)),
    ),
    fromSettlement: Math.max(0, Math.round(Number(meta.fromSettlement || 0))),
    heldTotal: Math.max(0, Math.round(Number(meta.heldTotal || 0))),
    holdKind: String(meta.holdKind || "").trim() || null,
  };
}
