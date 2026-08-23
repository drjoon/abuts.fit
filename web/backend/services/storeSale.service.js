// change-log:
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
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";
import { enqueueTaxInvoiceIssue } from "../utils/queueClient.js";
import {
  buildTaxinvoiceObject,
  registIssueInvoice,
} from "../utils/popbill.util.js";

async function resolveAdminAnchorId(session) {
  const adminAnchor = await BusinessAnchor.findOne({
    businessType: "admin",
    status: { $ne: "merged" },
  })
    .select({ _id: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .session(session || null)
    .lean();
  return adminAnchor?._id || null;
}

/** 카탈로그 productId에 재고 문서가 없으면 기본 수량으로 생성. */
export async function ensureStoreInventorySeeded(session) {
  const ids = listStoreProductIds();
  for (const productId of ids) {
    await StoreInventory.updateOne(
      { productId },
      {
        $setOnInsert: {
          productId,
          qtyOnHand: STORE_INVENTORY_DEFAULT_QTY,
          qtyReserved: 0,
        },
      },
      { upsert: true, session: session || undefined },
    );
  }
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
 * @returns {{ finalized: boolean, idempotent?: boolean, draftId?: string }}
 */
export async function finalizeStoreSale({
  orderId,
  bankTransactionId = null,
  matchedBy = "AUTO",
  matchedByUserId = null,
  adminNote = "",
  session: outerSession = null,
  issueInline = false,
} = {}) {
  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  let draftId = null;
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
      const existing = await TaxInvoiceDraft.findOne({
        storeOrderId: order._id,
      })
        .session(session)
        .lean();
      draftId = existing?._id ? String(existing._id) : null;
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
      // 입금 확정 → 출고 대기. 딜러/제조 분배 없음(전액 어벗츠).
      fulfillmentStatus: "READY",
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

    // 스토어 매출 분배 SSOT: 공급가 전액 REV_STORE_TAXABLE → 어벗츠(admin).
    // 커스텀어벗의 딜러/제조/개발운영 분배 경로를 타지 않는다.
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

    const draft = await ensureApprovedStoreInvoiceDraft({
      order: {
        ...order.toObject(),
        supplyAmount: supply,
        vatAmount: vat,
        amountTotal: total,
      },
      session,
    });
    draftId = draft?._id ? String(draft._id) : null;
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

  if (finalized && draftId) {
    const corpNum = process.env.POPBILL_CORP_NUM || "";
    if (corpNum) {
      if (issueInline) {
        await issueStoreInvoice({ draftId }).catch((err) => {
          console.error(
            "[finalizeStoreSale] inline issue failed:",
            err?.message || err,
          );
        });
      } else {
        enqueueTaxInvoiceIssue({
          draftId,
          corpNum,
          priority: 5,
        }).catch((err) => {
          console.error(
            "[finalizeStoreSale] enqueueTaxInvoiceIssue 실패:",
            err.message,
          );
        });
      }
    }
  }

  return { finalized, idempotent, draftId };
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
