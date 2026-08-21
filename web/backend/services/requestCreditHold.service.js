// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/requests/mailbox.utils.js
// change-log:
// - 2026-08-22: 제출/수락 재진입 시 이미 있는 machining·express·shipping hold 키는 queue 전 skip(insertMany 중복 방지).
// - 2026-08-21: PTX CA도 기공소 부담 의뢰비는 Request hold. 롤백 시 hold 복원·전환 플래그.
// - 2026-08-21: 우편함 해제 배송 hold는 형제 박스 hold 있으면 재보류 금지. 레거시 PTX 배송 hold 해제.
// - 2026-08-21: PTX CA 배송비는 Request 박스(BA+출고일) hold — PTX 건당 skip 폐지.
// - 2026-08-21: 신규 배송비 hold만 올린 그룹은 reconcile 재조회 skip. hold 구간 dt 로그.
// - 2026-08-19: 같은 출고일 배송비 보류는 형제 목록+저널을 그룹당 1회 배치 조회.
// - 2026-08-19: 일괄 취소 시 같은 박스에서 함께 취소되는 형제의 배송비 재보류를 생략.
// - 2026-08-19: 어벗디자인·어벗생산 배송비는 의뢰 사업자+예정출고일 1회(치과명 무관).
// - 2026-08-19: 같은 제출에서 원장 잔액 집계·가드 락을 앵커당 1회로 재사용.
// - 2026-08-19: 신규 제출 보류는 선행 저널 조회 생략 + insertMany 1회로 기록.
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
  getJournalsByIdempotencyKeys,
  postGeneralLedgerJournal,
  postGeneralLedgerJournals,
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

function requestEstimatedShipYmd(request) {
  return String(request?.timeline?.estimatedShipYmd || "").trim();
}

/** 치과 어벗디자인·기공소 어벗생산: 의뢰 사업자 + 예정 출고일 = 1박스. */
export function buildRequesterShipBoxKey(request) {
  const ba =
    resolveRequestCreditHoldAnchorId(request) ||
    normalizeBusinessAnchorId(request?.businessAnchorId) ||
    "_";
  const ymd = requestEstimatedShipYmd(request) || "_";
  return `${ba}:${ymd}`;
}

export function buildShippingReceiverGroupKey(request) {
  const org =
    normalizeBusinessAnchorId(resolveShippingMailboxOrgId(request)) ||
    normalizeBusinessAnchorId(request?.businessAnchorId) ||
    "_";
  const fp = normalizeMailboxReceiverFingerprint(request) || "_";
  return `${org}:${fp}`;
}

function isPtxCaLinkedRequest(request) {
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
  // 비거래처 선불: 치과 PTX 어벗 보류만. 기공소 Request 의뢰비 hold/차감 없음.
  if (isPracticePrepaidNonPartner(request)) return true;
  // PTX CA라도 기공소가 생산비를 내는 경우(거래처·lab-designed)는 Request hold 필요.
  // 제출/수락 시 보류 → 가공 진입 시 에스크로 전환 → 준비 롤백 시 보류 유지.
  return false;
}

/**
 * 배송비는 (의뢰 BA + 예정 출고일) 박스당 1회.
 * PTX CA도 Request 경로로 보류(구: PTX 건당 hold — 폐지).
 */
export function shouldSkipShippingHold(request) {
  if (isManufacturerSampleRequest(request)) return true;
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

let cachedDevopsAnchorId = "";

export async function resolveDevopsEscrowOwnerId(session = null) {
  if (cachedDevopsAnchorId) return cachedDevopsAnchorId;
  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ _id: 1 })
    .sort({ createdAt: 1 })
    .session(session || null)
    .lean();
  const id = devops?._id ? String(devops._id) : "";
  if (id) cachedDevopsAnchorId = id;
  return id || null;
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

function prepareOneRequestHold({
  request,
  requestorAnchorId,
  devopsAnchorId,
  amount,
  holdKind,
  eventType,
  idempotencyKey,
  freeOrder = ["freeRequest", "freeShipping"],
  actorUserId = null,
  cachedBalance = null,
}) {
  const amt = Math.max(0, Math.round(Number(amount || 0)));
  const requestId = request?._id;
  if (!requestId || !requestorAnchorId || !devopsAnchorId || amt <= 0) {
    return { held: false, reason: "invalid_input" };
  }

  const balance = normalizeHoldBalanceBuckets(cachedBalance);
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
  const relatedPtxId = String(
    request?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  const displayLabel = isShippingHold
    ? relatedPtxId
      ? "배송비 보류(기공소→어벗츠)"
      : REQUEST_HOLD_LABELS[holdKind] || "크레딧 보류"
    : REQUEST_HOLD_LABELS[holdKind] || "크레딧 보류";
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
    ...(relatedPtxId && Types.ObjectId.isValid(relatedPtxId)
      ? { relatedPracticeTransferId: relatedPtxId }
      : {}),
  };

  return {
    held: true,
    reason: "prepared",
    amount: amt,
    fromPaid: split.fromPaid,
    fromFreeRequest: split.fromFreeRequest,
    fromFreeShipping: split.fromFreeShipping,
    fromSettlement: split.fromSettlement,
    balanceAfter: applyHoldSplitToBalance(balance, split),
    journal: {
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
        ...(isShippingHold
          ? {
              estimatedShipYmd: requestEstimatedShipYmd(request) || null,
              shipBoxKey: buildRequesterShipBoxKey(request),
            }
          : {}),
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
    },
  };
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
  skipExistingLookup = false,
}) {
  const amt = Math.max(0, Math.round(Number(amount || 0)));
  const requestId = request?._id;
  if (!requestId || !requestorAnchorId || !devopsAnchorId || amt <= 0) {
    return { held: false, reason: "invalid_input" };
  }

  if (!skipExistingLookup) {
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

  const prepared = prepareOneRequestHold({
    request,
    requestorAnchorId,
    devopsAnchorId,
    amount: amt,
    holdKind,
    eventType,
    idempotencyKey,
    freeOrder,
    actorUserId,
    cachedBalance: balance,
  });
  if (!prepared?.held || !prepared.journal) {
    return prepared;
  }

  const journal = await postGeneralLedgerJournal({
    ...prepared.journal,
    session,
    skipIdempotencyLookup: true,
  });

  const posted = Boolean(journal?.posted);
  return {
    held: posted,
    reason: posted ? "posted" : journal?.idempotent ? "already_held" : "not_posted",
    journalId: journal?.journalId || null,
    amount: amt,
    fromPaid: prepared.fromPaid,
    fromFreeRequest: prepared.fromFreeRequest,
    fromFreeShipping: prepared.fromFreeShipping,
    fromSettlement: prepared.fromSettlement,
    balanceAfter: posted ? prepared.balanceAfter : null,
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

async function listRequesterShipBoxSiblings({
  request,
  requestorAnchorId,
  session = null,
  includeSelf = false,
}) {
  const shipYmd = requestEstimatedShipYmd(request);
  const ba = String(requestorAnchorId || "").trim();
  if (!shipYmd || !ba || !Types.ObjectId.isValid(ba)) return [];

  const baObjectId = new Types.ObjectId(ba);
  const filter = {
    manufacturerStage: { $ne: "취소" },
    "timeline.estimatedShipYmd": shipYmd,
    $or: [
      { businessAnchorId: baObjectId },
      { "partnerBilling.billingOwnerAnchorId": baObjectId },
    ],
  };
  if (!includeSelf && request?._id) {
    filter._id = { $ne: request._id };
  }

  const rows = await Request.find(filter)
    .select({
      _id: 1,
      requestId: 1,
      businessAnchorId: 1,
      partnerBilling: 1,
      requestor: 1,
      requestCategory: 1,
      timeline: 1,
    })
    .session(session || null)
    .lean();

  return (rows || []).filter((row) => {
    if (shouldSkipShippingHold(row)) return false;
    return resolveRequestCreditHoldAnchorId(row) === ba;
  });
}

async function loadRequesterShipBoxHoldState({
  request,
  requestorAnchorId,
  session = null,
  includeSelf = true,
}) {
  const siblings = await listRequesterShipBoxSiblings({
    request,
    requestorAnchorId,
    session,
    includeSelf,
  });
  const journalsByKey = await getJournalsByIdempotencyKeys({
    idempotencyKeys: siblings.map((sib) => requestShippingHoldKey(sib._id)),
    session,
  });
  return { siblings, journalsByKey };
}

function findHoldInShipBoxState(state, { excludeRequestId = null } = {}) {
  const siblings = state?.siblings || [];
  const journalsByKey = state?.journalsByKey || new Map();
  for (const sib of siblings) {
    if (excludeRequestId && String(sib._id) === String(excludeRequestId)) {
      continue;
    }
    const idempotencyKey = requestShippingHoldKey(sib._id);
    const hold = journalsByKey.get(idempotencyKey);
    if (hold?.journalId) {
      return {
        journalId: hold.journalId,
        journal: hold,
        requestMongoId: String(sib._id),
        idempotencyKey,
      };
    }
  }
  return null;
}

async function findExistingRequesterShipBoxShippingHold({
  request,
  requestorAnchorId,
  session = null,
  excludeRequestId = null,
  preloadedState = null,
}) {
  const state =
    preloadedState ||
    (await loadRequesterShipBoxHoldState({
      request,
      requestorAnchorId,
      session,
      includeSelf: true,
    }));
  return findHoldInShipBoxState(state, { excludeRequestId });
}

export async function reconcileRequesterShipBoxShippingHolds({
  request,
  requestorAnchorId,
  session = null,
  preloadedState = null,
}) {
  const state =
    preloadedState ||
    (await loadRequesterShipBoxHoldState({
      request,
      requestorAnchorId,
      session,
      includeSelf: true,
    }));
  const holds = [];
  for (const sib of state.siblings || []) {
    const idempotencyKey = requestShippingHoldKey(sib._id);
    const hold = state.journalsByKey?.get(idempotencyKey);
    if (!hold?.journalId) continue;
    holds.push({
      requestMongoId: String(sib._id),
      idempotencyKey,
      occurredAt: hold.occurredAt || hold.createdAt || 0,
    });
  }
  if (holds.length <= 1) {
    return { reconciled: false, released: 0 };
  }
  holds.sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  let released = 0;
  for (const extra of holds.slice(1)) {
    const result = await releaseRequestHoldByKey({
      idempotencyKey: extra.idempotencyKey,
      businessAnchorId: requestorAnchorId,
      session,
      emitBalanceUpdate: true,
    });
    if (result.released) released += 1;
  }
  return {
    reconciled: released > 0,
    released,
    keptRequestMongoId: holds[0].requestMongoId,
  };
}

/**
 * 의뢰 제출 시 기공비·신속·배송비(의뢰 사업자+출고일 1회)를 에스크로로 보류한다.
 */
export async function holdRequestCreditsOnSubmit({
  requests = [],
  actorUserId = null,
  session = null,
  devopsAnchorId: devopsAnchorIdArg = null,
  shippingFee: shippingFeeArg = null,
  seedBalance = null,
}) {
  const list = (Array.isArray(requests) ? requests : [])
    .filter(Boolean)
    .filter((request) => String(request?.manufacturerStage || "").trim() !== "취소");
  if (!list.length) return { held: false, reason: "empty" };

  const holdT0 = Date.now();
  const timing = {
    lockMs: 0,
    shipBoxLoadMs: 0,
    postJournalsMs: 0,
    reconcileMs: 0,
    reconcileSkipped: 0,
  };

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
  const shipBoxRequests = [];
  const shipBoxStateByKey = new Map();
  // 기존 형제 보류 없이 이번 제출에서 배송비 hold를 새로 올린 그룹 → reconcile no-op 확정
  const shippingGroupsNewHoldOnly = new Set();
  const lockedAnchors = new Set();
  const balanceByAnchor = new Map();
  let totalHeld = 0;
  const results = [];

  const takeCachedBalance = async (requestorAnchorId) => {
    if (!lockedAnchors.has(requestorAnchorId)) {
      const lockT0 = Date.now();
      await lockCreditBalanceGuardByAnchor({
        businessAnchorId: requestorAnchorId,
        session,
      });
      timing.lockMs += Date.now() - lockT0;
      lockedAnchors.add(requestorAnchorId);
    }
    const cached = balanceByAnchor.get(requestorAnchorId);
    if (cached) return cached;
    if (seedBalance && typeof seedBalance === "object") {
      const seeded = normalizeHoldBalanceBuckets(seedBalance);
      balanceByAnchor.set(requestorAnchorId, seeded);
      return seeded;
    }
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

  const pendingJournals = [];
  // 재진입(already_created 수락 등) 시 이미 POSTED된 hold는 queue하지 않는다.
  // postGeneralLedgerJournals는 insertMany라 중복 idempotencyKey면 배치 전체가 실패한다.
  const existingHoldKeys = await getJournalsByIdempotencyKeys({
    idempotencyKeys: list.flatMap((request) => {
      if (!request?._id) return [];
      return [
        requestMachiningHoldKey(request._id),
        requestExpressHoldKey(request._id),
        requestShippingHoldKey(request._id),
      ];
    }),
    session,
  });
  const hasExistingHold = (idempotencyKey) =>
    Boolean(existingHoldKeys.get(String(idempotencyKey || "").trim())?.journalId);

  const queueHold = async ({
    request,
    requestorAnchorId,
    amount,
    holdKind,
    eventType,
    idempotencyKey,
    freeOrder,
  }) => {
    if (hasExistingHold(idempotencyKey)) {
      results.push({
        kind: holdKind,
        held: false,
        reason: "already_held",
        amount: Math.max(0, Math.round(Number(amount || 0))),
        journalId:
          existingHoldKeys.get(String(idempotencyKey || "").trim())?.journalId ||
          null,
      });
      return;
    }
    const prepared = prepareOneRequestHold({
      request,
      requestorAnchorId,
      devopsAnchorId,
      amount,
      holdKind,
      eventType,
      idempotencyKey,
      freeOrder,
      actorUserId,
      cachedBalance: await takeCachedBalance(requestorAnchorId),
    });
    if (!prepared?.held || !prepared.journal) {
      results.push({ kind: holdKind, ...prepared });
      return;
    }
    pendingJournals.push(prepared.journal);
    rememberBalance(requestorAnchorId, prepared);
    results.push({
      kind: holdKind,
      held: true,
      reason: "prepared",
      amount: prepared.amount,
      fromPaid: prepared.fromPaid,
      fromFreeRequest: prepared.fromFreeRequest,
      fromFreeShipping: prepared.fromFreeShipping,
      fromSettlement: prepared.fromSettlement,
    });
    totalHeld += prepared.amount;
  };

  for (const request of list) {
    const requestorAnchorId = resolveRequestCreditHoldAnchorId(request);
    if (!requestorAnchorId) continue;

    if (!shouldSkipMachiningHold(request)) {
      const machiningAmount = resolveMachiningHoldAmount(request);
      if (machiningAmount > 0) {
        await queueHold({
          request,
          requestorAnchorId,
          amount: machiningAmount,
          holdKind: "machining_spend",
          eventType: "REQUEST_SPEND_HOLD",
          idempotencyKey: requestMachiningHoldKey(request._id),
        });
      }

      const expressAmount = resolveExpressHoldAmount(request);
      if (expressAmount > 0) {
        await queueHold({
          request,
          requestorAnchorId,
          amount: expressAmount,
          holdKind: "express_surcharge",
          eventType: "REQUEST_SPEND_HOLD",
          idempotencyKey: requestExpressHoldKey(request._id),
        });
      }
    }

    if (!shouldSkipShippingHold(request)) {
      const groupKey = buildRequesterShipBoxKey(request);
      shipBoxRequests.push({ request, requestorAnchorId, groupKey });
      if (!shippingGroupHeld.has(groupKey)) {
        // 본인 shipping hold가 있으면 형제 검색(excludeSelf)만으로는 못 보고 중복 insert 위험이 있다.
        if (hasExistingHold(requestShippingHoldKey(request._id))) {
          shippingGroupHeld.add(groupKey);
          continue;
        }
        let boxState = shipBoxStateByKey.get(groupKey);
        if (!boxState) {
          const shipT0 = Date.now();
          boxState = await loadRequesterShipBoxHoldState({
            request,
            requestorAnchorId,
            session,
            includeSelf: true,
          });
          timing.shipBoxLoadMs += Date.now() - shipT0;
          shipBoxStateByKey.set(groupKey, boxState);
        }
        const existing = findHoldInShipBoxState(boxState, {
          excludeRequestId: request._id,
        });
        if (existing?.journalId) {
          shippingGroupHeld.add(groupKey);
        } else {
          shippingGroupHeld.add(groupKey);
          shippingGroupsNewHoldOnly.add(groupKey);
          await queueHold({
            request,
            requestorAnchorId,
            amount: shippingFee,
            holdKind: "shipping_fee",
            eventType: "SHIPPING_SPEND_HOLD",
            idempotencyKey: requestShippingHoldKey(request._id),
            freeOrder: ["freeShipping", "freeRequest"],
          });
          const last = results[results.length - 1];
          if (last) last.groupKey = groupKey;
        }
      }
    }
  }

  if (pendingJournals.length > 0) {
    const postT0 = Date.now();
    const posted = await postGeneralLedgerJournals({
      entries: pendingJournals,
      session,
    });
    timing.postJournalsMs += Date.now() - postT0;
    let postedIdx = 0;
    for (const row of results) {
      if (row?.reason !== "prepared") continue;
      const journal = posted[postedIdx];
      postedIdx += 1;
      row.held = Boolean(journal?.posted);
      row.reason = journal?.posted
        ? "posted"
        : journal?.idempotent
          ? "already_held"
          : "not_posted";
      row.journalId = journal?.journalId || null;
      if (!row.held) {
        totalHeld = Math.max(0, totalHeld - Number(row.amount || 0));
      }
    }
  }

  const reconciledKeys = new Set();
  const postedShippingGroups = new Set(
    results
      .filter(
        (row) =>
          row?.kind === "shipping_fee" &&
          row?.reason === "posted" &&
          row?.groupKey,
      )
      .map((row) => row.groupKey),
  );
  for (const row of shipBoxRequests) {
    if (reconciledKeys.has(row.groupKey)) continue;
    reconciledKeys.add(row.groupKey);
    // 기존 형제 보류가 없어 이번 제출에서 배송비 hold를 새로 올렸으면
    // holds.length <= 1 확정 → reconcile 재조회 생략
    if (
      shippingGroupsNewHoldOnly.has(row.groupKey) &&
      postedShippingGroups.has(row.groupKey)
    ) {
      timing.reconcileSkipped += 1;
      continue;
    }
    const reconT0 = Date.now();
    await reconcileRequesterShipBoxShippingHolds({
      request: row.request,
      requestorAnchorId: row.requestorAnchorId,
      session,
      preloadedState: postedShippingGroups.has(row.groupKey)
        ? null
        : shipBoxStateByKey.get(row.groupKey),
    });
    timing.reconcileMs += Date.now() - reconT0;
  }

  // Request 박스 hold가 SSOT — 레거시 PTX 건당 기공소→어벗츠 배송 hold는 해제.
  await releaseLegacyPtxAbutsShippingHoldsForRequests({
    requests: list,
    session,
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[holdRequestCreditsOnSubmit] timing", {
      dt: Date.now() - holdT0,
      requests: list.length,
      ...timing,
    });
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

function practiceTransferAbutsShippingHoldKey(transferId) {
  return `practice_transfer:${String(transferId || "").trim()}:hold:abuts_shipping`;
}

/**
 * 에스크로→매출 전환 후 보류 저널에 convertedAt을 남겨 장부에서 지급완료로 표시한다.
 */
export async function markRequestHoldConverted({
  idempotencyKey,
  commitJournalId = null,
  session = null,
}) {
  const key = String(idempotencyKey || "").trim();
  if (!key) return { updated: false, reason: "invalid_key" };
  const $set = { "meta.convertedAt": new Date() };
  if (commitJournalId) {
    $set["meta.convertedJournalId"] = String(commitJournalId);
  }
  const result = await LedgerJournal.updateOne(
    { idempotencyKey: key },
    { $set },
    { session: session || undefined },
  );
  return {
    updated: Number(result?.modifiedCount || 0) > 0,
    matched: Number(result?.matchedCount || 0) > 0,
  };
}

/** 가공→준비 롤백 시 전환 플래그를 지워 다시 지급보류로 보이게 한다. */
export async function clearRequestHoldConverted({
  idempotencyKey,
  session = null,
}) {
  const key = String(idempotencyKey || "").trim();
  if (!key) return { updated: false, reason: "invalid_key" };
  const result = await LedgerJournal.updateOne(
    { idempotencyKey: key },
    { $unset: { "meta.convertedAt": "", "meta.convertedJournalId": "" } },
    { session: session || undefined },
  );
  return {
    updated: Number(result?.modifiedCount || 0) > 0,
    matched: Number(result?.matchedCount || 0) > 0,
  };
}

/**
 * 레거시 PTX 건당 기공소→어벗츠 배송 hold 해제(Request 박스 hold SSOT).
 */
export async function releaseLegacyPtxAbutsShippingHoldsForRequests({
  requests = [],
  session = null,
  emitBalanceUpdate = true,
}) {
  const ptxIds = new Set();
  for (const request of Array.isArray(requests) ? requests : []) {
    if (!isPtxCaLinkedRequest(request)) continue;
    const id = String(
      request?.partnerBilling?.relatedPracticeTransferId || "",
    ).trim();
    if (id) ptxIds.add(id);
  }
  if (!ptxIds.size) return { released: 0, restoreDelta: 0 };

  let released = 0;
  let restoreDelta = 0;
  for (const ptxId of ptxIds) {
    const key = practiceTransferAbutsShippingHoldKey(ptxId);
    const existing = await getJournalByIdempotencyKey({
      idempotencyKey: key,
      session,
    });
    if (!existing?.journalId) continue;

    const delta = await computeHoldRestoreDeltaByJournalId({
      journalId: existing.journalId,
      session,
    });
    const deleted = await deleteGeneralLedgerCommitJournal({
      journalId: existing.journalId,
      expectedEventTypes: ["PRACTICE_TRANSFER_SPEND_HOLD"],
      session,
    });
    if (!deleted?.deleted) continue;

    released += 1;
    restoreDelta += Number(delta || 0);
    const anchorId = normalizeBusinessAnchorId(existing.businessAnchorId);
    if (emitBalanceUpdate && anchorId && delta > 0) {
      try {
        await emitCreditBalanceUpdatedToBusiness({
          businessAnchorId: anchorId,
          balanceDelta: delta,
          reason: "legacy_ptx_abuts_shipping_hold_release",
          refId: ptxId,
          forceEmit: true,
        });
      } catch {
        // best-effort
      }
    }
    try {
      await mongoose.connection.collection("practicetransfers").updateOne(
        { _id: new Types.ObjectId(ptxId) },
        { $set: { "billing.heldShippingAbutsTotal": 0 } },
        { session: session || undefined },
      );
    } catch {
      // best-effort
    }
  }

  return { released, restoreDelta };
}

/**
 * 가공→준비 롤백 후 의뢰비(·신속) 보류가 없으면 다시 잡는다.
 * 에스크로 전환분만 지워진 경우 convertedAt만 해제한다.
 */
export async function ensureRequestMachiningHoldAfterSpendRollback({
  request,
  actorUserId = null,
  session = null,
}) {
  if (!request?._id) return { held: false, reason: "invalid_request" };
  if (shouldSkipMachiningHold(request)) {
    return { held: false, reason: "skip" };
  }

  const requestorAnchorId = resolveRequestCreditHoldAnchorId(request);
  if (!requestorAnchorId) return { held: false, reason: "no_anchor" };

  const machiningKey = requestMachiningHoldKey(request._id);
  const expressKey = requestExpressHoldKey(request._id);
  const existingMachining = await getRequestHoldJournal({
    idempotencyKey: machiningKey,
    session,
  });
  if (existingMachining?.journalId) {
    await clearRequestHoldConverted({
      idempotencyKey: machiningKey,
      session,
    });
    const existingExpress = await getRequestHoldJournal({
      idempotencyKey: expressKey,
      session,
    });
    if (existingExpress?.journalId) {
      await clearRequestHoldConverted({
        idempotencyKey: expressKey,
        session,
      });
    }
    return { held: false, reason: "already_held", clearedConverted: true };
  }

  const devopsAnchorId = await resolveDevopsEscrowOwnerId(session);
  if (!devopsAnchorId) return { held: false, reason: "no_devops" };

  let totalHeld = 0;
  const results = [];

  const machiningAmount = resolveMachiningHoldAmount(request);
  if (machiningAmount > 0) {
    const holdResult = await postOneRequestHold({
      request,
      requestorAnchorId,
      devopsAnchorId,
      amount: machiningAmount,
      holdKind: "machining_spend",
      eventType: "REQUEST_SPEND_HOLD",
      idempotencyKey: machiningKey,
      actorUserId,
      session,
    });
    results.push({ kind: "machining_spend", ...holdResult });
    if (holdResult.held) totalHeld += Number(holdResult.amount || 0);
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
      idempotencyKey: expressKey,
      actorUserId,
      session,
    });
    results.push({ kind: "express_surcharge", ...holdResult });
    if (holdResult.held) totalHeld += Number(holdResult.amount || 0);
  }

  if (totalHeld > 0) {
    try {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: requestorAnchorId,
        balanceDelta: -totalHeld,
        reason: "machining_hold_restore",
        refId: request._id,
      });
    } catch {
      // best-effort
    }
  }

  return {
    held: totalHeld > 0,
    totalHeld,
    results,
    reason: totalHeld > 0 ? "restored" : "noop",
  };
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
  excludeSiblingIds = null,
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
  let releasedShipping = false;

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
      if (key === requestShippingHoldKey(requestMongoId)) {
        releasedShipping = true;
      }
    }
  }

  if (releasedShipping && anchorId && !shouldSkipShippingHold(request)) {
    const excludeIds = new Set(
      [...(excludeSiblingIds || [])]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );
    const siblings = (
      await listRequesterShipBoxSiblings({
        request,
        requestorAnchorId: anchorId,
        session,
        includeSelf: false,
      })
    ).filter((sib) => !excludeIds.has(String(sib?._id || "")));
    if (siblings.length > 0) {
      const existing = await findExistingRequesterShipBoxShippingHold({
        request: siblings[0],
        requestorAnchorId: anchorId,
        session,
      });
      if (!existing?.journalId) {
        const devopsAnchorId = await resolveDevopsEscrowOwnerId(session);
        if (devopsAnchorId) {
          const shippingFee = await resolveShippingFeePerBox();
          const holdResult = await postOneRequestHold({
            request: siblings[0],
            requestorAnchorId: anchorId,
            devopsAnchorId,
            amount: shippingFee,
            holdKind: "shipping_fee",
            eventType: "SHIPPING_SPEND_HOLD",
            idempotencyKey: requestShippingHoldKey(siblings[0]._id),
            freeOrder: ["freeShipping", "freeRequest"],
            actorUserId,
            session,
          });
          if (holdResult.held) {
            totalRestore = Math.max(
              0,
              totalRestore - Number(holdResult.amount || shippingFee),
            );
          }
        }
      }
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
 * 같은 BA+출고일 박스에 형제 hold가 있으면 재보류하지 않는다(이중 3,500 방지).
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
    await clearRequestHoldConverted({
      idempotencyKey: requestShippingHoldKey(request._id),
      session,
    });
    await releaseLegacyPtxAbutsShippingHoldsForRequests({
      requests: [request],
      session,
    });
    return { held: false, reason: "already_held" };
  }

  const requestorAnchorId = resolveRequestCreditHoldAnchorId(request);
  if (!requestorAnchorId) return { held: false, reason: "no_anchor" };

  const siblingHold = await findExistingRequesterShipBoxShippingHold({
    request,
    requestorAnchorId,
    session,
    excludeRequestId: request._id,
  });
  if (siblingHold?.journalId) {
    await releaseLegacyPtxAbutsShippingHoldsForRequests({
      requests: [request],
      session,
    });
    return { held: false, reason: "sibling_box_already_held" };
  }

  const devopsAnchorId = await resolveDevopsEscrowOwnerId(session);
  if (!devopsAnchorId) return { held: false, reason: "no_devops" };

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

  await reconcileRequesterShipBoxShippingHolds({
    request,
    requestorAnchorId,
    session,
  });
  await releaseLegacyPtxAbutsShippingHoldsForRequests({
    requests: [request],
    session,
  });

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
