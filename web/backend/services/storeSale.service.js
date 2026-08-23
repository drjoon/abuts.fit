// change-log:
// - 2026-08-23: 스토어 취소 = STORE_SALE 저널 삭제 + StoreOrder 취소 이력(canceledAt/By).
// - 2026-08-23: admin 앵커·재고 시드 1회 캐시(카탈로그·주문 latency 감소).
// - 2026-08-23: 스토어 취소 = STORE_SALE 저널 삭제(기공 롤백과 동일). 환불 행 없음.
// - 2026-08-23: 풀필먼트(READY→SHIPPED→DELIVERED). 매출 전액 어벗츠(REV_STORE_TAXABLE).
// - 2026-08-23: 스토어 입금 확정 → 재고 차감 · STORE_SALE 저널 · 과세 세금계산서.
// related files:
// - rules.md §2.3
// - web/backend/constants/ledgerTaxLanes.js
// - web/backend/utils/creditBPlanMatching.js
import mongoose from "mongoose";
import StoreOrder from "../models/storeOrder.model.js";
import StoreInventory from "../models/storeInventory.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  LEDGER_EVENT_STORE_SALE,
  LEDGER_ACCOUNT_REV_STORE_TAXABLE,
  STORE_REVENUE_OWNER_ROLE,
} from "../constants/ledgerTaxLanes.js";
import {
  listStoreProductIds,
  STORE_INVENTORY_DEFAULT_QTY,
} from "../constants/storeCatalog.js";
import { postGeneralLedgerJournal, getJournalsByIdempotencyKeys, deleteGeneralLedgerCommitJournal } from "./generalLedger.service.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";
import { enqueueTaxInvoiceIssue } from "../utils/queueClient.js";
import {
  buildTaxinvoiceObject,
  registIssueInvoice,
} from "../utils/popbill.util.js";

function storeOrderSaleIdempotencyKeys(orderId) {
  const id = String(orderId || "").trim();
  return [
    `gl:store:order:${id}:credit-pay`,
    `gl:store:order:${id}:sale`,
    // 이전 구현의 역분개 잔존분도 함께 제거
    `gl:store:order:${id}:credit-cancel`,
    `gl:store:order:${id}:bank-cancel`,
  ];
}

/**
 * 스토어 결제 저널 삭제형 롤백(기공의뢰 rollback과 동일 UX).
 * 정산 내역에 환불 행을 남기지 않고 원 결제(및 과거 역분개)를 지운다.
 * @param {{ orderId: unknown, session?: import("mongoose").ClientSession | null, dryRun?: boolean }} args
 */
export async function rollbackStoreSaleJournals({
  orderId,
  session = null,
  dryRun = false,
}) {
  const id = String(orderId || "").trim();
  if (!id) {
    return { deletedJournalIds: [], refundedCredit: 0, journalIds: [] };
  }

  const keys = storeOrderSaleIdempotencyKeys(id);
  const journalsByKey = await getJournalsByIdempotencyKeys({
    idempotencyKeys: keys,
    session,
  });
  const journalEventById = new Map();
  for (const existing of journalsByKey.values()) {
    const jid = String(existing?.journalId || "").trim();
    if (!jid) continue;
    journalEventById.set(jid, [LEDGER_EVENT_STORE_SALE]);
  }

  const oid =
    mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id
      ? new mongoose.Types.ObjectId(id)
      : null;
  const byRef = await LedgerJournal.find({
    refType: "STORE_ORDER",
    refId: oid ? { $in: [oid, id] } : id,
    eventType: LEDGER_EVENT_STORE_SALE,
  })
    .select({ journalId: 1 })
    .session(session || null)
    .lean();
  for (const row of byRef || []) {
    const jid = String(row?.journalId || "").trim();
    if (!jid) continue;
    journalEventById.set(jid, [LEDGER_EVENT_STORE_SALE]);
  }

  if (journalEventById.size === 0) {
    return { deletedJournalIds: [], refundedCredit: 0, journalIds: [] };
  }

  const journalIds = [...journalEventById.keys()];
  const lines = await LedgerLine.find({ journalId: { $in: journalIds } })
    .select({ accountCode: 1, amount: 1 })
    .session(session || null)
    .lean();

  // REQ_PAID_CREDIT 소비(-) 삭제 → 잔액 복원(+)
  let refundedCredit = 0;
  for (const line of lines || []) {
    if (String(line?.accountCode || "") !== "REQ_PAID_CREDIT") continue;
    const amount = Number(line?.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    refundedCredit += -amount;
  }

  if (dryRun) {
    return {
      deletedJournalIds: [],
      refundedCredit: Math.max(0, Math.round(refundedCredit)),
      journalIds,
    };
  }

  const deletedJournalIds = [];
  for (const [journalId, events] of journalEventById.entries()) {
    const result = await deleteGeneralLedgerCommitJournal({
      journalId,
      expectedEventTypes: events,
      session,
    });
    if (result?.deleted) deletedJournalIds.push(journalId);
  }

  return {
    deletedJournalIds,
    refundedCredit: Math.max(0, Math.round(refundedCredit)),
    journalIds,
  };
}

async function resolveAdminAnchorId(session) {
  const now = Date.now();
  if (
    cachedAdminAnchorId &&
    now - cachedAdminAnchorIdAt < ADMIN_ANCHOR_CACHE_MS
  ) {
    return cachedAdminAnchorId;
  }
  const adminAnchor = await BusinessAnchor.findOne({
    businessType: "admin",
    status: { $ne: "merged" },
  })
    .select({ _id: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .session(session || null)
    .lean();
  cachedAdminAnchorId = adminAnchor?._id || null;
  cachedAdminAnchorIdAt = now;
  return cachedAdminAnchorId;
}

let cachedAdminAnchorId = null;
let cachedAdminAnchorIdAt = 0;
const ADMIN_ANCHOR_CACHE_MS = 60_000;

/** 카탈로그 productId에 재고 문서가 없으면 기본 수량으로 생성(1회 bulk). */
let storeInventorySeeded = false;

export async function ensureStoreInventorySeeded(session) {
  const ids = listStoreProductIds();
  if (ids.length === 0) return;
  if (storeInventorySeeded) return;
  await StoreInventory.bulkWrite(
    ids.map((productId) => ({
      updateOne: {
        filter: { productId },
        update: {
          $setOnInsert: {
            productId,
            qtyOnHand: STORE_INVENTORY_DEFAULT_QTY,
            qtyReserved: 0,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false, session: session || undefined },
  );
  storeInventorySeeded = true;
}

export async function getInventoryMap(session) {
  await ensureStoreInventorySeeded(session);
  const rows = await StoreInventory.find({})
    .session(session || null)
    .lean();
  const map = {};
  for (const row of rows) {
    map[String(row.productId)] = {
      qtyOnHand: Number(row.qtyOnHand || 0),
      qtyReserved: Number(row.qtyReserved || 0),
      available: Math.max(
        0,
        Number(row.qtyOnHand || 0) - Number(row.qtyReserved || 0),
      ),
    };
  }
  return map;
}

/** PENDING 주문 생성 시 재고 예약. */
export async function reserveStoreInventory({ items, session }) {
  await ensureStoreInventorySeeded(session);
  for (const item of items) {
    const productId = String(item.productId || "").trim();
    const qty = Math.max(0, Math.round(Number(item.qty || 0)));
    if (!productId || qty <= 0) {
      throw Object.assign(new Error("invalid_store_item"), { statusCode: 400 });
    }
    const updated = await StoreInventory.findOneAndUpdate(
      {
        productId,
        $expr: {
          $gte: [{ $subtract: ["$qtyOnHand", "$qtyReserved"] }, qty],
        },
      },
      { $inc: { qtyReserved: qty } },
      { new: true, session },
    );
    if (!updated) {
      const err = new Error(`재고 부족: ${productId}`);
      err.statusCode = 409;
      err.code = "INSUFFICIENT_STOCK";
      throw err;
    }
  }
}

/** 주문 취소/만료 시 예약 해제. */
export async function releaseStoreInventoryReservation({ items, session }) {
  for (const item of items || []) {
    const productId = String(item.productId || "").trim();
    const qty = Math.max(0, Math.round(Number(item.qty || 0)));
    if (!productId || qty <= 0) continue;
    await StoreInventory.updateOne(
      { productId, qtyReserved: { $gte: qty } },
      { $inc: { qtyReserved: -qty } },
      { session },
    );
  }
}

/** 결제 확정: 예약 → 실차감. */
async function commitStoreInventory({ items, session }) {
  for (const item of items || []) {
    const productId = String(item.productId || "").trim();
    const qty = Math.max(0, Math.round(Number(item.qty || 0)));
    if (!productId || qty <= 0) continue;
    const updated = await StoreInventory.findOneAndUpdate(
      {
        productId,
        qtyOnHand: { $gte: qty },
        qtyReserved: { $gte: qty },
      },
      { $inc: { qtyOnHand: -qty, qtyReserved: -qty } },
      { new: true, session },
    );
    if (!updated) {
      const err = new Error(`재고 확정 실패: ${productId}`);
      err.statusCode = 409;
      err.code = "INVENTORY_COMMIT_FAILED";
      throw err;
    }
  }
}

async function ensureApprovedStoreInvoiceDraft({ order, session }) {
  const existing = await TaxInvoiceDraft.findOne(
    { storeOrderId: order._id },
    null,
    { session },
  ).lean();
  if (existing) {
    if (
      ["PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(existing.status)
    ) {
      await TaxInvoiceDraft.updateOne(
        { _id: existing._id },
        {
          $set: {
            status: "APPROVED",
            approvedAt: new Date(),
            taxType: "과세",
            direction: "ABUTS_TO_CUSTOMER",
            issuanceMode: "SELF",
            supplyAmount: Number(order.supplyAmount),
            vatAmount: Number(order.vatAmount),
            totalAmount: Number(order.amountTotal),
          },
        },
        { session },
      );
      return TaxInvoiceDraft.findById(existing._id).session(session).lean();
    }
    return existing;
  }

  const org = await BusinessAnchor.findById(order.businessAnchorId)
    .session(session || null)
    .lean();
  const buyer = buildPartySnapshotFromAnchor(org, null);
  const itemLabel =
    (order.items || [])
      .map((it) => `${it.name}×${it.qty}`)
      .join(", ")
      .slice(0, 100) || "스토어 기성품";

  const [draft] = await TaxInvoiceDraft.create(
    [
      {
        storeOrderId: order._id,
        chargeOrderId: null,
        userId: order.userId,
        businessAnchorId: order.businessAnchorId,
        direction: "ABUTS_TO_CUSTOMER",
        issuanceMode: "SELF",
        taxType: "과세",
        kind: "NORMAL",
        status: "APPROVED",
        approvedAt: new Date(),
        supplyAmount: Number(order.supplyAmount),
        vatAmount: Number(order.vatAmount),
        totalAmount: Number(order.amountTotal),
        itemName: itemLabel,
        buyer,
        sourceRefType: "StoreOrder",
        sourceRefIds: [order._id],
      },
    ],
    { session },
  );
  return draft.toObject();
}

export async function issueStoreInvoice({ draftId, mock = false }) {
  const draft = await TaxInvoiceDraft.findById(draftId).lean();
  if (!draft || String(draft.status) === "SENT") {
    return { draft, issued: false };
  }

  const now = new Date();
  if (mock) {
    await TaxInvoiceDraft.updateOne(
      { _id: draft._id, status: { $in: ["APPROVED", "FAILED"] } },
      {
        $set: {
          status: "SENT",
          hometaxTrxId: `MOCK:${String(draft._id)}`,
          sentAt: now,
          lastAttemptAt: now,
          failReason: null,
        },
        $inc: { attemptCount: 1 },
      },
    );
    return {
      draft: await TaxInvoiceDraft.findById(draft._id).lean(),
      issued: true,
      mock: true,
    };
  }

  const corpNum = (process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
  if (!corpNum) {
    const reason = "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.";
    await TaxInvoiceDraft.updateOne(
      { _id: draft._id },
      {
        $set: { status: "FAILED", failReason: reason, lastAttemptAt: now },
        $inc: { attemptCount: 1 },
      },
    );
    return { draft, issued: false, error: reason };
  }

  try {
    const mgtKey = String(draft._id).slice(0, 24);
    const response = await registIssueInvoice({
      corpNum,
      taxinvoice: buildTaxinvoiceObject({ draft, mgtKey }),
    });
    await TaxInvoiceDraft.updateOne(
      { _id: draft._id },
      {
        $set: {
          status: "SENT",
          hometaxTrxId: response?.trxID || response?.TrxID || mgtKey,
          sentAt: now,
          lastAttemptAt: now,
          failReason: null,
        },
        $inc: { attemptCount: 1 },
      },
    );
    return {
      draft: await TaxInvoiceDraft.findById(draft._id).lean(),
      issued: true,
    };
  } catch (error) {
    const reason = error?.ErrMsg || error?.message || String(error);
    await TaxInvoiceDraft.updateOne(
      { _id: draft._id },
      {
        $set: {
          status: "FAILED",
          failReason: `[팝빌 오류] ${reason}`,
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
    );
    return { draft, issued: false, error: reason };
  }
}

/**
 * 입금 매칭/관리자 승인 후 스토어 매출 확정.
 * 건별 과세 draft는 만들지 않음(월말 합산).
 * @returns {{ finalized: boolean, idempotent?: boolean }}
 */
export async function finalizeStoreSale({
  orderId,
  bankTransactionId = null,
  matchedBy = "AUTO",
  matchedByUserId = null,
  adminNote = "",
  session: outerSession = null,
  issueInline: _issueInline = false,
} = {}) {
  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  let finalized = false;
  let idempotent = false;

  const run = async () => {
    const order = await StoreOrder.findById(orderId).session(session);
    if (!order) {
      const err = new Error("store_order_not_found");
      err.statusCode = 404;
      throw err;
    }

    if (String(order.status) === "PAID") {
      idempotent = true;
      return;
    }

    if (!["PENDING", "MATCHED"].includes(String(order.status))) {
      const err = new Error(`store_order_not_payable:${order.status}`);
      err.statusCode = 400;
      throw err;
    }

    const now = new Date();
    const setFields = {
      status: "PAID",
      paidAt: now,
      matchedAt: order.matchedAt || now,
      matchedBy: matchedBy || order.matchedBy || "AUTO",
      adminApprovalStatus: "APPROVED",
      adminApprovalAt: now,
      fulfillmentStatus: "READY",
      paymentMethod: order.paymentMethod || "BANK",
    };
    if (bankTransactionId) setFields.bankTransactionId = bankTransactionId;
    if (matchedByUserId) {
      setFields.matchedByUserId = matchedByUserId;
      setFields.adminApprovalBy = matchedByUserId;
    }
    if (adminNote) setFields.adminApprovalNote = adminNote;

    const updated = await StoreOrder.updateOne(
      { _id: order._id, status: { $in: ["PENDING", "MATCHED"] } },
      { $set: setFields },
      { session },
    );
    if (!updated?.modifiedCount) {
      idempotent = true;
      return;
    }

    await commitStoreInventory({ items: order.items, session });

    const adminAnchorId = await resolveAdminAnchorId(session);
    if (!adminAnchorId) {
      const err = new Error("admin_anchor_missing");
      err.statusCode = 500;
      throw err;
    }

    const supply = Math.max(0, Math.round(Number(order.supplyAmount || 0)));
    const vat = Math.max(0, Math.round(Number(order.vatAmount || 0)));
    const total = Math.max(0, Math.round(Number(order.amountTotal || 0)));

    await postGeneralLedgerJournal({
      idempotencyKey: `gl:store:order:${String(order._id)}:sale`,
      eventType: LEDGER_EVENT_STORE_SALE,
      businessAnchorId: order.businessAnchorId,
      refType: "STORE_ORDER",
      refId: order._id,
      createdBy: matchedByUserId || order.userId || null,
      meta: {
        storeOrderId: String(order._id),
        bankTransactionId: bankTransactionId
          ? String(bankTransactionId)
          : null,
        paymentMethod: "BANK",
        source:
          matchedBy === "ADMIN" ? "admin_store_approval" : "store_auto_match",
        revenueOwner: STORE_REVENUE_OWNER_ROLE,
        splitToDealer: false,
        splitToManufacturer: false,
      },
      lines: [
        {
          accountCode: LEDGER_ACCOUNT_REV_STORE_TAXABLE,
          ownerRole: STORE_REVENUE_OWNER_ROLE,
          ownerId: adminAnchorId,
          amount: supply,
          amountExcludingVat: supply,
          vatAmount: vat,
          amountIncludingVat: total,
          creditKind: "PAID",
          refType: "STORE_ORDER",
          refId: order._id,
        },
      ],
      session,
    });

    // 건별 과세 draft 없음 — 월말 customerMonthlyInvoice 합산.
    finalized = true;
  };

  try {
    if (ownSession) {
      await session.withTransaction(run);
    } else {
      await run();
    }
  } finally {
    if (ownSession) session.endSession();
  }

  return { finalized, idempotent };
}

/**
 * 유료 선수금으로 스토어 주문 결제. 무료·기공크레딧 사용 금지.
 * 건별 과세 draft 없음(월말 합산).
 */
export async function payStoreOrderWithCredit({
  orderId,
  userId = null,
  session: outerSession = null,
} = {}) {
  const {
    allocateSpendFromCreditBuckets,
    computeBusinessCreditBalanceFromLedger,
  } = await import("./creditBalance.service.js");
  const { emitCreditBalanceUpdatedToBusiness } = await import(
    "../utils/creditRealtime.js"
  );

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  let finalized = false;
  let idempotent = false;
  let paidTotal = 0;
  let businessAnchorId = null;

  const run = async () => {
    const order = await StoreOrder.findById(orderId).session(session);
    if (!order) {
      const err = new Error("store_order_not_found");
      err.statusCode = 404;
      throw err;
    }
    businessAnchorId = order.businessAnchorId;

    if (String(order.status) === "PAID") {
      idempotent = true;
      return;
    }
    if (String(order.status) !== "PENDING") {
      const err = new Error(`store_order_not_payable:${order.status}`);
      err.statusCode = 400;
      throw err;
    }

    const supply = Math.max(0, Math.round(Number(order.supplyAmount || 0)));
    const vat = Math.max(0, Math.round(Number(order.vatAmount || 0)));
    const total = Math.max(0, Math.round(Number(order.amountTotal || 0)));
    paidTotal = total;
    if (total <= 0) {
      const err = new Error("invalid_store_amount");
      err.statusCode = 400;
      throw err;
    }

    const glBalance = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: order.businessAnchorId,
      session,
    });
    // 스토어는 유료 선수금만.
    const split = allocateSpendFromCreditBuckets({
      amount: total,
      paidCredit: Number(glBalance?.paidCredit || 0),
      freeRequestCredit: 0,
      freeShippingCredit: 0,
      settlementCredit: 0,
    });
    if (!split.ok || split.fromPaid < total) {
      const err = new Error("유료 거래 선수금 잔액이 부족합니다.");
      err.statusCode = 402;
      err.code = "INSUFFICIENT_PAID_CREDIT";
      err.payload = {
        required: total,
        paidCredit: split.paidCredit,
        shortfall: split.shortfall,
      };
      throw err;
    }

    const now = new Date();
    const updated = await StoreOrder.updateOne(
      { _id: order._id, status: "PENDING" },
      {
        $set: {
          status: "PAID",
          paidAt: now,
          matchedAt: now,
          matchedBy: "ADMIN",
          adminApprovalStatus: "APPROVED",
          adminApprovalAt: now,
          fulfillmentStatus: "READY",
          paymentMethod: "CREDIT",
        },
      },
      { session },
    );
    if (!updated?.modifiedCount) {
      idempotent = true;
      return;
    }

    await commitStoreInventory({ items: order.items, session });

    const adminAnchorId = await resolveAdminAnchorId(session);
    if (!adminAnchorId) {
      const err = new Error("admin_anchor_missing");
      err.statusCode = 500;
      throw err;
    }

    await postGeneralLedgerJournal({
      idempotencyKey: `gl:store:order:${String(order._id)}:credit-pay`,
      eventType: LEDGER_EVENT_STORE_SALE,
      businessAnchorId: order.businessAnchorId,
      refType: "STORE_ORDER",
      refId: order._id,
      createdBy: userId || order.userId || null,
      meta: {
        storeOrderId: String(order._id),
        paymentMethod: "CREDIT",
        source: "store_credit_pay",
        revenueOwner: STORE_REVENUE_OWNER_ROLE,
        splitToDealer: false,
        splitToManufacturer: false,
      },
      lines: [
        {
          accountCode: "REQ_PAID_CREDIT",
          ownerRole: "requestor",
          ownerId: order.businessAnchorId,
          amount: -total,
          amountExcludingVat: -total,
          vatAmount: 0,
          amountIncludingVat: -total,
          creditKind: "PAID",
          refType: "STORE_ORDER",
          refId: order._id,
        },
        {
          accountCode: LEDGER_ACCOUNT_REV_STORE_TAXABLE,
          ownerRole: STORE_REVENUE_OWNER_ROLE,
          ownerId: adminAnchorId,
          amount: supply,
          amountExcludingVat: supply,
          vatAmount: vat,
          amountIncludingVat: total,
          creditKind: "PAID",
          refType: "STORE_ORDER",
          refId: order._id,
        },
      ],
      session,
    });

    finalized = true;
  };

  try {
    if (ownSession) {
      await session.withTransaction(run);
    } else {
      await run();
    }
  } finally {
    if (ownSession) session.endSession();
  }

  if (finalized && businessAnchorId && paidTotal > 0) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: -paidTotal,
      reason: "store_credit_pay",
      refId: orderId,
    }).catch(() => {});
  }

  return { finalized, idempotent };
}

/** 출고 전(PENDING·MATCHED 또는 PAID+READY) 고객 취소 가능. */
export function isStoreOrderCustomerCancelable(order) {
  const status = String(order?.status || "");
  const fulfillment = String(order?.fulfillmentStatus || "");
  if (["PENDING", "MATCHED"].includes(status)) return true;
  if (status === "PAID" && fulfillment === "READY") return true;
  return false;
}

/** 결제 확정 후 취소 시 재고 복구(onHand만). */
async function restoreStoreInventoryAfterPaidCancel({ items, session }) {
  for (const item of items || []) {
    const productId = String(item.productId || "").trim();
    const qty = Math.max(0, Math.round(Number(item.qty || 0)));
    if (!productId || qty <= 0) continue;
    await StoreInventory.updateOne(
      { productId },
      { $inc: { qtyOnHand: qty } },
      { session },
    );
  }
}

/**
 * 의뢰자 스토어 주문 취소.
 * - 입금 대기: 예약 해제
 * - 결제 완료·출고 전: 재고 복구 + STORE_SALE 저널 삭제(기공과 동일, 환불 행 없음)
 */
export async function cancelStoreOrderByUser({
  orderId,
  businessAnchorId,
  userId = null,
  session: outerSession = null,
  cancelReason = "",
} = {}) {
  const { emitCreditBalanceUpdatedToBusiness } = await import(
    "../utils/creditRealtime.js"
  );
  const { upsertBusinessCreditBalanceFromLedger } = await import(
    "./creditBalance.service.js"
  );

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  let canceled = null;
  let refundedCredit = 0;
  let businessAnchorForEmit = null;

  const run = async () => {
    const order = await StoreOrder.findOne({
      _id: orderId,
      businessAnchorId,
    }).session(session);
    if (!order) {
      const err = new Error("취소할 주문이 없습니다.");
      err.statusCode = 404;
      throw err;
    }
    if (!isStoreOrderCustomerCancelable(order)) {
      const err = new Error(
        "출고가 시작된 주문은 취소할 수 없습니다. 문의가 필요하면 고객센터에 연락해 주세요.",
      );
      err.statusCode = 400;
      throw err;
    }

    const status = String(order.status);
    businessAnchorForEmit = order.businessAnchorId;

    if (["PENDING", "MATCHED"].includes(status)) {
      await releaseStoreInventoryReservation({
        items: order.items,
        session,
      });
    } else if (status === "PAID") {
      await restoreStoreInventoryAfterPaidCancel({
        items: order.items,
        session,
      });

      const rolled = await rollbackStoreSaleJournals({
        orderId: order._id,
        session,
      });
      refundedCredit = Number(rolled.refundedCredit || 0);

      if (businessAnchorForEmit && refundedCredit > 0) {
        try {
          await upsertBusinessCreditBalanceFromLedger({
            businessAnchorId: businessAnchorForEmit,
            session,
          });
        } catch {
          /* ledger SSOT; cache best-effort */
        }
      }
    }

    const now = new Date();
    order.status = "CANCELED";
    order.fulfillmentStatus = "CANCELED";
    order.canceledAt = now;
    order.canceledBy = userId || order.userId || null;
    order.canceledByRole = "USER";
    order.cancelReason = String(cancelReason || "").trim();
    await order.save({ session });
    canceled = order.toObject();
  };

  try {
    if (ownSession) {
      await session.withTransaction(run);
    } else {
      await run();
    }
  } finally {
    if (ownSession) session.endSession();
  }

  if (refundedCredit > 0 && businessAnchorForEmit) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId: businessAnchorForEmit,
      balanceDelta: refundedCredit,
      reason: "store_order_cancel",
      refId: orderId,
    }).catch(() => {});
  }

  return canceled;
}

/**
 * 관리자 출고: READY → SHIPPED (운송장).
 */
export async function markStoreOrderShipped({
  orderId,
  courier = "",
  trackingNumber = "",
  note = "",
  actorUserId = null,
} = {}) {
  const order = await StoreOrder.findById(orderId);
  if (!order) {
    const err = new Error("store_order_not_found");
    err.statusCode = 404;
    throw err;
  }
  if (String(order.status) !== "PAID") {
    const err = new Error("결제 완료 주문만 출고할 수 있습니다.");
    err.statusCode = 400;
    throw err;
  }
  if (!["READY", "SHIPPED"].includes(String(order.fulfillmentStatus))) {
    const err = new Error(
      `출고할 수 없는 상태: ${order.fulfillmentStatus || "UNPAID"}`,
    );
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const nextCourier = String(courier || order.courier || "").trim();
  const nextTracking = String(
    trackingNumber || order.trackingNumber || "",
  ).trim();
  if (!nextTracking) {
    const err = new Error("운송장 번호가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  order.fulfillmentStatus = "SHIPPED";
  order.courier = nextCourier;
  order.trackingNumber = nextTracking;
  order.shippedAt = order.shippedAt || now;
  if (note) order.fulfillmentNote = String(note).trim();
  await order.save();

  return {
    order: order.toObject(),
    actorUserId: actorUserId ? String(actorUserId) : null,
  };
}

/**
 * 관리자 배송완료: SHIPPED → DELIVERED.
 */
export async function markStoreOrderDelivered({
  orderId,
  note = "",
  actorUserId = null,
} = {}) {
  const order = await StoreOrder.findById(orderId);
  if (!order) {
    const err = new Error("store_order_not_found");
    err.statusCode = 404;
    throw err;
  }
  if (String(order.status) !== "PAID") {
    const err = new Error("결제 완료 주문만 배송완료 처리할 수 있습니다.");
    err.statusCode = 400;
    throw err;
  }
  if (!["SHIPPED", "DELIVERED"].includes(String(order.fulfillmentStatus))) {
    const err = new Error(
      `배송완료할 수 없는 상태: ${order.fulfillmentStatus || "UNPAID"}`,
    );
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  order.fulfillmentStatus = "DELIVERED";
  order.deliveredAt = order.deliveredAt || now;
  if (note) order.fulfillmentNote = String(note).trim();
  await order.save();

  return {
    order: order.toObject(),
    actorUserId: actorUserId ? String(actorUserId) : null,
  };
}
