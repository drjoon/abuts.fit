// change-log:
// - 2026-10-15: 스토어 카드결제(CARD) 확정·취소(토스 취소 후 REFUND). 신규 크레딧 결제 중단.
// - 2026-10-04: 패키지 구매자 자동 ON 제거(단일가).
// - 2026-09-13: full-package 결제 확정 시 BA.storePackageBuyer ON.
// - 2026-09-13: 입금확정·선수금결제·취소 후 관리자 스토어 배지 emit(ownSession).
// - 2026-09-06: REV_STORE_TAXABLE amount=부가세 포함가.
// - 2026-09-06: 스토어 취소 = STORE_SALE 원본 유지 + REFUND(잔고 복구). 제조사 삭형과 분리.
// - 2026-08-23: 스토어 취소 = STORE_SALE 저널 삭제 + StoreOrder 취소 이력(canceledAt/By).
// - 2026-08-23: admin 앵커·재고 시드 1회 캐시(카탈로그·주문 latency 감소).
// - 2026-08-23: 스토어 취소 = STORE_SALE 저널 삭제(기공 롤백과 동일). 환불 행 없음.
// - 2026-08-23: 풀필먼트(READY→SHIPPED→DELIVERED). 매출 전액 어벗츠(REV_STORE_TAXABLE).
// - 2026-08-23: 스토어 입금 확정 → 재고 차감 · STORE_SALE 저널 · 과세 세금계산서.
// related files:
// - rules.md §2.3
// - web/backend/constants/ledgerTaxLanes.js
// - web/backend/utils/creditBPlanMatching.js
// - web/backend/utils/storeAdminBadge.util.js
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
import {
  postGeneralLedgerJournal,
  getJournalsByIdempotencyKeys,
  postGeneralLedgerCancelRefund,
} from "./generalLedger.service.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";
import { enqueueTaxInvoiceIssue } from "../utils/queueClient.js";
import {
  buildTaxinvoiceObject,
  registIssueInvoice,
} from "../utils/popbill.util.js";
import { scheduleStoreAdminActionBadgeEmit } from "../utils/storeAdminBadge.util.js";
import {
  tossCancelPayment,
  tossConfirmPayment,
  tossGetPayment,
  makeDeterministicIdempotencyKey,
} from "../utils/tossPayments.js";

/** 스토어 크레딧 결제 재개 방지 (법인 판매·크레딧 분리). 코드 상수로만 켠다. */
const ALLOW_LEGACY_STORE_CREDIT_PAY = false;

function storeOrderSaleIdempotencyKeys(orderId) {
  const id = String(orderId || "").trim();
  return [
    `gl:store:order:${id}:credit-pay`,
    `gl:store:order:${id}:sale`,
  ];
}

/**
 * 스토어 결제 취소: STORE_SALE 원본 유지 + REFUND(취소 시점 잔고 복구).
 * @param {{ orderId: unknown, session?: import("mongoose").ClientSession | null, dryRun?: boolean }} args
 */
export async function rollbackStoreSaleJournals({
  orderId,
  session = null,
  dryRun = false,
}) {
  const id = String(orderId || "").trim();
  if (!id) {
    return {
      deletedJournalIds: [],
      refundJournalIds: [],
      refundedCredit: 0,
      journalIds: [],
    };
  }

  const keys = storeOrderSaleIdempotencyKeys(id);
  const journalsByKey = await getJournalsByIdempotencyKeys({
    idempotencyKeys: keys,
    session,
  });
  const saleJournalIds = new Set();
  for (const existing of journalsByKey.values()) {
    if (String(existing?.eventType || "") !== LEDGER_EVENT_STORE_SALE) continue;
    const jid = String(existing?.journalId || "").trim();
    if (jid) saleJournalIds.add(jid);
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
    if (jid) saleJournalIds.add(jid);
  }

  if (saleJournalIds.size === 0) {
    return {
      deletedJournalIds: [],
      refundJournalIds: [],
      refundedCredit: 0,
      journalIds: [],
    };
  }

  const journalIds = [...saleJournalIds];
  const lines = await LedgerLine.find({ journalId: { $in: journalIds } })
    .select({ accountCode: 1, amount: 1 })
    .session(session || null)
    .lean();

  // REQ_PAID_CREDIT 소비(-) → REFUND로 잔액 복원(+)
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
      refundJournalIds: [],
      refundedCredit: Math.max(0, Math.round(refundedCredit)),
      journalIds,
    };
  }

  const refundJournalIds = [];
  for (const journalId of journalIds) {
    const result = await postGeneralLedgerCancelRefund({
      journalId,
      expectedEventTypes: [LEDGER_EVENT_STORE_SALE],
      displayLabel: "스토어 주문 취소",
      session,
    });
    if (result?.journalId && (result.posted || result.idempotent)) {
      refundJournalIds.push(result.journalId);
    }
  }

  return {
    deletedJournalIds: [],
    refundJournalIds,
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
let storeInventorySeededForKey = "";

export async function ensureStoreInventorySeeded(session) {
  const ids = listStoreProductIds();
  if (ids.length === 0) return;
  const seedKey = ids.join(",");
  if (storeInventorySeededForKey === seedKey) return;
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
  storeInventorySeededForKey = seedKey;
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
  pg = null,
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
    if (pg && String(order.paymentMethod) === "CARD") {
      setFields.pgProvider = "toss";
      setFields.pgPaymentKey = String(pg.paymentKey || "");
      setFields.pgReceiptUrl = String(pg.receiptUrl || "");
      setFields.pgApprovedAt = pg.approvedAt || now;
    }
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
        paymentMethod: String(order.paymentMethod) === "CARD" ? "CARD" : "BANK",
        source:
          String(order.paymentMethod) === "CARD"
            ? "store_card_pay"
            : matchedBy === "ADMIN"
              ? "admin_store_approval"
              : "store_auto_match",
        revenueOwner: STORE_REVENUE_OWNER_ROLE,
        splitToDealer: false,
        splitToManufacturer: false,
      },
      lines: [
        {
          accountCode: LEDGER_ACCOUNT_REV_STORE_TAXABLE,
          ownerRole: STORE_REVENUE_OWNER_ROLE,
          ownerId: adminAnchorId,
          amount: total,
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

  if (ownSession && (finalized || idempotent)) {
    scheduleStoreAdminActionBadgeEmit();
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
  // 2026-10-15: 스토어는 크레딧(선수금)과 분리. 카드결제만 허용.
  if (!ALLOW_LEGACY_STORE_CREDIT_PAY) {
    const err = new Error(
      "스토어는 카드로만 결제할 수 있습니다. 크레딧은 기공·커스텀어벗 전용입니다.",
    );
    err.statusCode = 400;
    err.code = "STORE_CREDIT_NOT_ALLOWED";
    throw err;
  }
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
          amount: total,
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
 * - 결제 완료·출고 전: 재고 복구 + STORE_SALE 원본 유지 + REFUND
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

  // 카드결제 완료 건: 트랜잭션 밖에서 PG 취소(멱등키로 재시도 안전).
  const pre = await StoreOrder.findOne({ _id: orderId, businessAnchorId })
    .select({
      status: 1,
      fulfillmentStatus: 1,
      paymentMethod: 1,
      pgPaymentKey: 1,
      amountTotal: 1,
    })
    .lean();
  if (
    pre &&
    String(pre.paymentMethod) === "CARD" &&
    String(pre.status) === "PAID" &&
    pre.pgPaymentKey &&
    isStoreOrderCustomerCancelable(pre)
  ) {
    try {
      await tossCancelPayment({
        paymentKey: pre.pgPaymentKey,
        cancelReason: String(cancelReason || "").trim() || "고객 요청 취소",
        idempotencyKey: makeDeterministicIdempotencyKey(
          "store-cancel",
          String(pre._id),
        ),
      });
    } catch (e) {
      // 이미 PG에서 취소된 건은 DB만 정리한다.
      const code = String(e?.data?.code || "");
      if (code !== "ALREADY_CANCELED_PAYMENT") {
        const err = new Error(
          e?.message || "카드 결제 취소에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        err.statusCode = 502;
        err.code = "STORE_CARD_CANCEL_FAILED";
        throw err;
      }
    }
  }

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

/** 토스 orderId(6~64자): 스토어 주문 _id 기반. */
export function buildStoreCardPgOrderId(orderId) {
  return `store-${String(orderId)}`;
}

/**
 * 카드결제 승인: 금액·주문 검증 → 토스 승인 → 매출 확정(크레딧 라인 없음).
 * 확정 실패 시 PG 승인 취소.
 */
export async function confirmStoreCardPayment({
  orderId,
  businessAnchorId,
  userId = null,
  paymentKey,
  pgOrderId,
  amount,
} = {}) {
  const order = await StoreOrder.findOne({ _id: orderId, businessAnchorId });
  if (!order) {
    const err = new Error("주문을 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  if (String(order.paymentMethod) !== "CARD") {
    const err = new Error("카드결제 주문이 아닙니다.");
    err.statusCode = 400;
    throw err;
  }
  if (String(order.status) === "PAID") {
    return { order: order.toObject(), idempotent: true };
  }
  if (String(order.status) !== "PENDING") {
    const err = new Error(`결제할 수 없는 주문 상태입니다: ${order.status}`);
    err.statusCode = 400;
    throw err;
  }
  const expected = buildStoreCardPgOrderId(order._id);
  if (String(pgOrderId || "") !== expected || order.pgOrderId !== expected) {
    const err = new Error("주문번호가 일치하지 않습니다.");
    err.statusCode = 400;
    throw err;
  }
  if (Number(amount) !== Number(order.amountTotal)) {
    const err = new Error("결제 금액이 주문 금액과 일치하지 않습니다.");
    err.statusCode = 400;
    err.code = "STORE_CARD_AMOUNT_MISMATCH";
    throw err;
  }
  if (!String(paymentKey || "").trim()) {
    const err = new Error("paymentKey가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  const confirmed = await tossConfirmPayment({
    paymentKey,
    orderId: expected,
    amount: Number(order.amountTotal),
  });

  try {
    await finalizeStoreSale({
      orderId: order._id,
      matchedBy: "AUTO",
      matchedByUserId: userId || null,
      pg: {
        paymentKey,
        receiptUrl: confirmed?.receipt?.url || "",
        approvedAt: confirmed?.approvedAt
          ? new Date(confirmed.approvedAt)
          : new Date(),
      },
    });
  } catch (finalizeErr) {
    await tossCancelPayment({
      paymentKey,
      cancelReason: "주문 확정 실패 자동 취소",
      idempotencyKey: makeDeterministicIdempotencyKey(
        "store-autocancel",
        String(order._id),
      ),
    }).catch(() => {});
    throw finalizeErr;
  }

  const paid = await StoreOrder.findById(order._id).lean();
  return { order: paid, idempotent: false };
}

/** 결제 대기(PENDING) 카드 주문 만료: 재고 예약 해제. 조회·주문 진입 시 호출(저비용). */
export async function expireStaleStoreCardOrders({ limit = 50 } = {}) {
  const stale = await StoreOrder.find({
    status: "PENDING",
    paymentMethod: "CARD",
    expiresAt: { $lt: new Date() },
  })
    .select({ _id: 1, items: 1 })
    .limit(limit)
    .lean();
  let expired = 0;
  for (const row of stale) {
    const res = await StoreOrder.updateOne(
      { _id: row._id, status: "PENDING" },
      {
        $set: {
          status: "EXPIRED",
          fulfillmentStatus: "CANCELED",
          canceledAt: new Date(),
          canceledByRole: "SYSTEM",
          cancelReason: "결제 대기 만료",
        },
      },
    );
    if (res.modifiedCount) {
      await releaseStoreInventoryReservation({ items: row.items });
      expired += 1;
    }
  }
  return { expired };
}

/**
 * 토스 웹훅(PAYMENT_STATUS_CHANGED): 토스에서 취소된 결제를 주문에 반영.
 * 웹훅 본문은 신뢰하지 않고 paymentKey로 재조회해 상태를 확인한다.
 */
export async function syncStoreCardPaymentFromWebhook({ paymentKey } = {}) {
  const key = String(paymentKey || "").trim();
  if (!key) return { handled: false, reason: "no_payment_key" };
  const payment = await tossGetPayment({ paymentKey: key });
  const order = await StoreOrder.findOne({ pgPaymentKey: key }).lean();
  if (!order) return { handled: false, reason: "order_not_found" };
  if (String(payment?.status) !== "CANCELED") {
    return { handled: false, reason: `status_${payment?.status}` };
  }
  if (String(order.status) !== "PAID") {
    return { handled: false, reason: "order_not_paid" };
  }
  if (!isStoreOrderCustomerCancelable(order)) {
    // 출고 이후 PG 취소는 자동 반영하지 않는다(수동 확인).
    console.warn("[tossWebhook] 출고 후 PG 취소 — 수동 확인 필요", order._id);
    return { handled: false, reason: "already_shipped" };
  }
  await cancelStoreOrderByUser({
    orderId: order._id,
    businessAnchorId: order.businessAnchorId,
    userId: null,
    cancelReason: "PG 취소 동기화",
  });
  return { handled: true };
}
