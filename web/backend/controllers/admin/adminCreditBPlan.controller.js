// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/generalLedger.service.js
// - web/backend/utils/creditBPlanMatching.js
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";

import AdminAuditLog from "../../models/adminAuditLog.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ActivityLog from "../../models/activityLog.model.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  buildTaxinvoiceObject,
  registIssueInvoice,
} from "../../utils/popbill.util.js";
import {
  upsertBankTransaction,
  autoMatchBankTransactionsOnce,
  notifyChargePrepaidApplied,
} from "../../utils/creditBPlanMatching.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";

async function writeAuditLog({ req, action, refType, refId, details }) {
  const actorUserId = req.user?._id;
  if (!actorUserId) return;

  await AdminAuditLog.create({
    actorUserId,
    action,
    refType: String(refType || ""),
    refId: refId || null,
    details: details ?? null,
    ipAddress: String(req.headers["x-forwarded-for"] || req.ip || ""),
  });
}

async function sendPushover({ title, message, priority = "0" }) {
  if (!process.env.PUSHOVER_TOKEN || !process.env.PUSHOVER_USER_KEY) return;
  try {
    await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: process.env.PUSHOVER_TOKEN,
        user: process.env.PUSHOVER_USER_KEY,
        title,
        message,
        priority,
      }).toString(),
    });
  } catch (err) {
    console.error("[sendPushover] failed", err);
  }
}

async function logActivity({
  userId,
  action,
  details,
  severity = "info",
  status = "info",
}) {
  if (!userId) return;
  try {
    await ActivityLog.create({
      userId,
      action,
      details: details ?? null,
      severity,
      status,
    });
  } catch (err) {
    console.error("[logActivity] failed", err);
  }
}

async function ensureApprovedChargeInvoiceDraft({ order, session }) {
  const existing = await TaxInvoiceDraft.findOne(
    { chargeOrderId: order._id },
    null,
    { session },
  ).lean();
  if (existing) {
    if (["PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(existing.status)) {
      await TaxInvoiceDraft.updateOne(
        { _id: existing._id },
        {
          $set: {
            status: "APPROVED",
            approvedAt: new Date(),
            taxType: "면세",
            vatAmount: 0,
            totalAmount: Number(order.supplyAmount),
          },
        },
        { session },
      );
      return TaxInvoiceDraft.findById(existing._id).session(session).lean();
    }
    return existing;
  }

  const org = await BusinessAnchor.findById(order.businessAnchorId)
    .select({
      "metadata.businessNumber": 1,
      "metadata.companyName": 1,
      "metadata.representativeName": 1,
      "metadata.address": 1,
      "metadata.businessType": 1,
      "metadata.businessItem": 1,
      "metadata.email": 1,
      "metadata.phoneNumber": 1,
    })
    .lean({ session });

  const [draft] = await TaxInvoiceDraft.create(
    [
      {
        chargeOrderId: order._id,
        userId: order.userId,
        businessAnchorId: order.businessAnchorId,
        direction: "ABUTS_TO_CUSTOMER",
        issuanceMode: "SELF",
        taxType: "면세",
        status: "APPROVED",
        approvedAt: new Date(),
        supplyAmount: Number(order.supplyAmount),
        vatAmount: 0,
        totalAmount: Number(order.supplyAmount),
        itemName: "기공료 선입금",
        buyer: {
          bizNo: org?.metadata?.businessNumber || "",
          corpName: org?.metadata?.companyName || "",
          ceoName: org?.metadata?.representativeName || "",
          addr: org?.metadata?.address || "",
          bizType: org?.metadata?.businessType || "",
          bizClass: org?.metadata?.businessItem || "",
          contactEmail: org?.metadata?.email || "",
          contactTel: org?.metadata?.phoneNumber || "",
          contactName: org?.metadata?.representativeName || "",
        },
      },
    ],
    { session },
  );
  return draft.toObject();
}

async function issueChargeInvoice({ draftId, mock = false }) {
  const draft = await TaxInvoiceDraft.findById(draftId).lean();
  if (!draft || String(draft.status) === "SENT") return { draft, issued: false };

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

export async function adminListChargeOrders(req, res) {
  const now = new Date();
  await ChargeOrder.deleteMany({
    status: "PENDING",
    bankTransactionId: null,
    expiresAt: { $lte: now },
  });

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Math.max(Number(req.query.skip) || 0, 0);

  const status = String(req.query.status || "")
    .trim()
    .toUpperCase();
  const match = {};
  if (
    status &&
    ["PENDING", "MATCHED", "AUTO_MATCHED", "EXPIRED", "CANCELED"].includes(
      status,
    )
  ) {
    match.status = status;
  }

  const [items, total] = await Promise.all([
    ChargeOrder.find(match)
      .populate("adminApprovalBy", "name email")
      .populate("businessAnchorId", "name metadata")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ChargeOrder.countDocuments(match),
  ]);

  return res.json({ success: true, data: { items, total, skip, limit } });
}

async function approveChargeOrder(req, res, { mock = false } = {}) {
  const id = String(req.params?.id || "").trim();
  const note = String(req.body?.note || "");
  const actorUserId = req.user?._id;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "chargeOrderId가 유효하지 않습니다.",
    });
  }

  const order = await ChargeOrder.findById(id).lean();
  if (!order) {
    return res.status(404).json({
      success: false,
      message: "ChargeOrder를 찾을 수 없습니다.",
    });
  }

  if (!["PENDING", "AUTO_MATCHED", "MATCHED"].includes(String(order.status))) {
    return res.status(400).json({
      success: false,
      message: "대기, 자동매칭, 또는 매칭완료 상태만 승인할 수 있습니다.",
    });
  }
  if (order.adminApprovalStatus !== "PENDING") {
    return res.status(400).json({
      success: false,
      message: "이미 처리된 승인 건입니다.",
    });
  }
  if (order.userId && String(order.userId) === String(actorUserId)) {
    return res.status(403).json({
      success: false,
      message: "작성자는 본인 주문을 승인할 수 없습니다.",
    });
  }

  const chargeAmount = Math.max(0, Math.round(Number(order.supplyAmount || 0)));
  if (chargeAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 충전 금액입니다.",
    });
  }

  const session = await mongoose.startSession();
  let glResult;
  let invoiceDraft;

  try {
    await session.withTransaction(async () => {
      const approval = await ChargeOrder.updateOne(
        {
          _id: order._id,
          adminApprovalStatus: "PENDING",
          status: { $in: ["PENDING", "AUTO_MATCHED", "MATCHED"] },
        },
        {
          $set: {
            // Direct admin approval is the final confirmation of payment, so
            // it must also close the customer-facing pending deposit order.
            status: "MATCHED",
            matchedAt: new Date(),
            matchedBy: "ADMIN",
            matchedByUserId: actorUserId,
            adminApprovalStatus: "APPROVED",
            adminApprovalNote: note,
            adminApprovalAt: new Date(),
            adminApprovalBy: actorUserId,
          },
        },
        { session },
      );

      if (!approval.modifiedCount) {
        throw new Error("ChargeOrder approval update failed");
      }

      // 관리자의 승인은 실입금 확인의 최종 처리다. 승인과 크레딧 지급을
      // 하나의 트랜잭션으로 처리해 승인만 되고 원장이 누락되는 것을 방지한다.
      glResult = await postGeneralLedgerJournal({
        idempotencyKey: `gl:bplan:chargeOrder:${String(order._id)}:charge`,
        eventType: "CHARGE_PAID",
        businessAnchorId: order.businessAnchorId,
        refType: "CHARGE_ORDER",
        refId: order._id,
        occurredAt: new Date(),
        createdBy: actorUserId || null,
        meta: {
          chargeOrderId: String(order._id),
          depositCode: String(order.depositCode || "").trim() || null,
          source: "admin_bplan_approval",
        },
        lines: [
          {
            accountCode: "REQ_PAID_CREDIT",
            ownerRole: "requestor",
            ownerId: order.businessAnchorId,
            amount: chargeAmount,
            amountExcludingVat: chargeAmount,
            vatAmount: 0,
            amountIncludingVat: chargeAmount,
            creditKind: "PAID",
            refType: "CHARGE_ORDER",
            refId: order._id,
          },
        ],
        session,
      });

      invoiceDraft = await ensureApprovedChargeInvoiceDraft({ order, session });
    });
  } finally {
    await session.endSession();
  }

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId: order.businessAnchorId,
    balanceDelta: glResult?.posted ? chargeAmount : 0,
    reason: "bplan_admin_charge_approval",
    refId: glResult?.journalId || order._id,
    // A retried/idempotent approval still changes the customer-facing order
    // state, so active credit tabs must refetch even without a new journal.
    forceEmit: true,
  });

  const invoiceResult = await issueChargeInvoice({
    draftId: invoiceDraft?._id,
    mock,
  });

  const updated = await ChargeOrder.findById(order._id)
    .populate("adminApprovalBy", "name email")
    .lean();

  await writeAuditLog({
    req,
    action: mock
      ? "CREDIT_B_PLAN_CHARGE_MOCK_APPROVE"
      : "CREDIT_B_PLAN_CHARGE_APPROVE",
    refType: "CHARGE_ORDER",
    refId: order._id,
    details: {
      chargeOrderId: String(order._id),
      businessAnchorId: String(order.businessAnchorId || ""),
      amountTotal: order.amountTotal,
      note,
      taxInvoiceDraftId: String(invoiceDraft?._id || ""),
      taxInvoiceStatus: invoiceResult?.draft?.status || "FAILED",
      mock,
    },
  });

  await logActivity({
    userId: actorUserId,
    action: mock ? "CHARGE_MOCK_APPROVED" : "CHARGE_APPROVED",
    details: {
      chargeOrderId: String(order._id),
      businessAnchorId: String(order.businessAnchorId || ""),
      amountTotal: order.amountTotal,
      note,
      taxInvoiceDraftId: String(invoiceDraft?._id || ""),
      taxInvoiceStatus: invoiceResult?.draft?.status || "FAILED",
      mock,
    },
    severity: "high",
    status: "success",
  });

  await sendPushover({
    title: mock ? "[Charge] 모의승인 완료" : "[Charge] 승인 완료",
    message: `ChargeOrder ${order.depositCode || order._id} ${
      mock ? "모의승인" : "승인"
    } (총액 ${order.amountTotal}원)`,
    priority: "1",
  });

  return res.json({
    success: true,
    data: { chargeOrder: updated, taxInvoice: invoiceResult?.draft || null },
    message: invoiceResult?.issued
      ? mock
        ? "모의승인 및 면세 계산서 모의 발행을 완료했습니다."
        : "승인 및 면세 계산서 발행을 완료했습니다."
      : "승인과 크레딧 지급은 완료됐지만 계산서 발행에 실패했습니다. 계산서 관리에서 재발행하세요.",
  });
}

export async function adminApproveChargeOrder(req, res) {
  return approveChargeOrder(req, res);
}

export async function adminMockApproveChargeOrder(req, res) {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    return res.status(403).json({
      success: false,
      message: "모의승인은 개발 및 테스트 환경에서만 사용할 수 있습니다.",
    });
  }
  return approveChargeOrder(req, res, { mock: true });
}

export async function adminRejectChargeOrder(req, res) {
  const id = String(req.params?.id || "").trim();
  const note = String(req.body?.note || "");
  const actorUserId = req.user?._id;

  if (!note.trim()) {
    return res.status(400).json({
      success: false,
      message: "거절 사유(note)가 필요합니다.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "chargeOrderId가 유효하지 않습니다.",
    });
  }

  const order = await ChargeOrder.findById(id).lean();
  if (!order) {
    return res.status(404).json({
      success: false,
      message: "ChargeOrder를 찾을 수 없습니다.",
    });
  }

  if (!["PENDING", "AUTO_MATCHED", "MATCHED"].includes(String(order.status))) {
    return res.status(400).json({
      success: false,
      message: "대기, 자동매칭, 또는 매칭완료 상태만 거절할 수 있습니다.",
    });
  }
  if (order.adminApprovalStatus !== "PENDING") {
    return res.status(400).json({
      success: false,
      message: "이미 처리된 승인 건입니다.",
    });
  }
  if (order.userId && String(order.userId) === String(actorUserId)) {
    return res.status(403).json({
      success: false,
      message: "작성자는 본인 주문을 거절할 수 없습니다.",
    });
  }

  await ChargeOrder.updateOne(
    { _id: order._id, adminApprovalStatus: "PENDING" },
    {
      $set: {
        adminApprovalStatus: "REJECTED",
        adminApprovalNote: note,
        adminApprovalAt: new Date(),
        adminApprovalBy: actorUserId,
      },
    },
  );

  const updated = await ChargeOrder.findById(order._id)
    .populate("adminApprovalBy", "name email")
    .lean();

  await writeAuditLog({
    req,
    action: "CREDIT_B_PLAN_CHARGE_REJECT",
    refType: "CHARGE_ORDER",
    refId: order._id,
    details: {
      chargeOrderId: String(order._id),
      businessAnchorId: String(order.businessAnchorId || ""),
      amountTotal: order.amountTotal,
      note,
    },
  });

  await logActivity({
    userId: actorUserId,
    action: "CHARGE_REJECTED",
    details: {
      chargeOrderId: String(order._id),
      businessAnchorId: String(order.businessAnchorId || ""),
      amountTotal: order.amountTotal,
      note,
    },
    severity: "medium",
    status: "allowed",
  });

  await sendPushover({
    title: "[Charge] 승인 거절",
    message: `ChargeOrder ${order.depositCode || order._id} 거절 (총액 ${
      order.amountTotal
    }원)\n사유: ${note}`,
    priority: "0",
  });

  return res.json({ success: true, data: updated });
}

export async function adminListBankTransactions(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Math.max(Number(req.query.skip) || 0, 0);

  const status = String(req.query.status || "")
    .trim()
    .toUpperCase();
  const match = {};
  if (status && ["NEW", "MATCHED", "IGNORED"].includes(status)) {
    match.status = status;
  }

  const [items, total] = await Promise.all([
    BankTransaction.find(match)
      .sort({ occurredAt: -1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BankTransaction.countDocuments(match),
  ]);

  return res.json({ success: true, data: { items, total, skip, limit } });
}

export async function adminUpsertBankTransaction(req, res) {
  const doc = await upsertBankTransaction({
    externalId: req.body?.externalId,
    tranAmt: req.body?.tranAmt,
    printedContent: req.body?.printedContent,
    occurredAt: req.body?.occurredAt,
    raw: req.body?.raw,
  });

  await autoMatchBankTransactionsOnce({ limit: 200 }).catch(() => null);

  await writeAuditLog({
    req,
    action: "CREDIT_B_PLAN_BANK_TX_UPSERT",
    refType: "BANK_TRANSACTION",
    refId: doc?._id,
    details: { externalId: doc?.externalId },
  });

  return res.json({ success: true, data: doc });
}

export async function adminManualMatch(req, res) {
  const bankTransactionId = String(req.body?.bankTransactionId || "").trim();
  const chargeOrderId = String(req.body?.chargeOrderId || "").trim();
  const note = String(req.body?.note || "");
  const force = Boolean(req.body?.force);

  if (!mongoose.Types.ObjectId.isValid(bankTransactionId)) {
    return res.status(400).json({
      success: false,
      message: "bankTransactionId가 유효하지 않습니다.",
    });
  }
  if (!mongoose.Types.ObjectId.isValid(chargeOrderId)) {
    return res
      .status(400)
      .json({ success: false, message: "chargeOrderId가 유효하지 않습니다." });
  }

  const [tx, order] = await Promise.all([
    BankTransaction.findById(bankTransactionId).lean(),
    ChargeOrder.findById(chargeOrderId).lean(),
  ]);

  if (!tx) {
    return res
      .status(404)
      .json({ success: false, message: "입금 내역을 찾을 수 없습니다." });
  }
  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "ChargeOrder를 찾을 수 없습니다." });
  }

  const txAmount = Number(tx?.tranAmt || 0);
  const orderAmountTotal = Number(order?.amountTotal || 0);
  if (
    !force &&
    Number.isFinite(txAmount) &&
    Number.isFinite(orderAmountTotal) &&
    txAmount !== orderAmountTotal
  ) {
    return res.status(400).json({
      success: false,
      message: "입금액과 충전요청 금액이 일치하지 않습니다.",
    });
  }

  if (force && !note.trim()) {
    return res.status(400).json({
      success: false,
      message: "강제 매칭(force) 시 note가 필요합니다.",
    });
  }

  const txCode = String(tx?.depositCode || "").trim();
  const orderCode = String(order?.depositCode || "").trim();
  if (!force && txCode && orderCode && txCode !== orderCode) {
    return res.status(400).json({
      success: false,
      message: "입금 코드와 충전요청 코드가 일치하지 않습니다.",
    });
  }

  if (String(tx.status) === "MATCHED" || tx.chargeOrderId) {
    return res
      .status(400)
      .json({ success: false, message: "이미 매칭된 입금 내역입니다." });
  }
  if (String(order.status) === "MATCHED" || order.bankTransactionId) {
    return res
      .status(400)
      .json({ success: false, message: "이미 매칭된 ChargeOrder입니다." });
  }

  if (String(order.status) === "CANCELED") {
    return res.status(400).json({
      success: false,
      message: "취소된 ChargeOrder는 매칭할 수 없습니다.",
    });
  }

  const session = await mongoose.startSession();
  let updatedOrder;
  let updatedTx;

  try {
    await session.withTransaction(async () => {
      await BankTransaction.updateOne(
        { _id: tx._id, status: "NEW", chargeOrderId: null },
        {
          $set: {
            status: "MATCHED",
            chargeOrderId: order._id,
            matchedAt: new Date(),
            matchedBy: "ADMIN",
            matchedByUserId: req.user?._id || null,
          },
        },
        { session },
      );

      await ChargeOrder.updateOne(
        {
          _id: order._id,
          status: { $in: ["PENDING", "EXPIRED"] },
          bankTransactionId: null,
        },
        {
          $set: {
            status: "MATCHED",
            bankTransactionId: tx._id,
            matchedAt: new Date(),
            matchedBy: "ADMIN",
            matchedByUserId: req.user?._id || null,
            note,
          },
        },
        { session },
      );

      const idempotencyKey = `gl:bplan:chargeOrder:${String(order._id)}:charge`;
      const chargeAmount = Math.max(0, Math.round(Number(order.supplyAmount || 0)));
      if (chargeAmount <= 0) {
        throw new Error("유효하지 않은 충전 금액입니다.");
      }

      const glResult = await postGeneralLedgerJournal({
        idempotencyKey,
        eventType: "CHARGE_PAID",
        businessAnchorId: order.businessAnchorId,
        refType: "CHARGE_ORDER",
        refId: order._id,
        occurredAt: new Date(),
        createdBy: req.user?._id || null,
        meta: {
          chargeOrderId: String(order._id),
          bankTransactionId: String(tx._id),
          depositCode: String(order.depositCode || "").trim() || null,
          source: "admin_bplan_manual_match",
        },
        lines: [
          {
            accountCode: "REQ_PAID_CREDIT",
            ownerRole: "requestor",
            ownerId: order.businessAnchorId,
            amount: chargeAmount,
            amountExcludingVat: chargeAmount,
            vatAmount: 0,
            amountIncludingVat: chargeAmount,
            creditKind: "PAID",
            refType: "CHARGE_ORDER",
            refId: order._id,
          },
        ],
        session,
      });

      if (glResult?.posted) {
        await emitCreditBalanceUpdatedToBusiness({
          businessAnchorId: order.businessAnchorId,
          balanceDelta: chargeAmount,
          reason: "bplan_admin_charge",
          refId: glResult?.journalId || order._id,
        });
      }

      const existingDraft = await TaxInvoiceDraft.findOne(
        { chargeOrderId: order._id },
        null,
        { session },
      );
      if (!existingDraft) {
        const org = await BusinessAnchor.findOne({
          _id: order.businessAnchorId,
        })
          .select({
            "metadata.businessNumber": 1,
            "metadata.companyName": 1,
            "metadata.representativeName": 1,
            "metadata.address": 1,
            "metadata.businessType": 1,
            "metadata.businessItem": 1,
            "metadata.email": 1,
            "metadata.phoneNumber": 1,
          })
          .lean({ session });

        await TaxInvoiceDraft.create(
          [
            {
              chargeOrderId: order._id,
              userId: order.userId,
              businessAnchorId: order.businessAnchorId,
              status: "PENDING_APPROVAL",
              supplyAmount: Number(order.supplyAmount),
              vatAmount: Number(order.vatAmount || 0),
              totalAmount: Number(order.amountTotal || 0),
              // SSOT: metadata 사용 (extracted 레거시 제거)
              buyer: {
                bizNo: org?.metadata?.businessNumber || "",
                corpName: org?.metadata?.companyName || "",
                ceoName: org?.metadata?.representativeName || "",
                addr: org?.metadata?.address || "",
                bizType: org?.metadata?.businessType || "",
                bizClass: org?.metadata?.businessItem || "",
                contactEmail: org?.metadata?.email || "",
                contactTel: org?.metadata?.phoneNumber || "",
                contactName: org?.metadata?.representativeName || "",
              },
            },
          ],
          { session },
        );
      }

      updatedOrder = await ChargeOrder.findById(order._id)
        .session(session)
        .lean();
      updatedTx = await BankTransaction.findById(tx._id)
        .session(session)
        .lean();
    });
  } finally {
    session.endSession();
  }

  await writeAuditLog({
    req,
    action: "CREDIT_B_PLAN_MANUAL_MATCH",
    refType: "BANK_TRANSACTION",
    refId: tx._id,
    details: {
      chargeOrderId: String(order._id),
      note,
      force,
      tx: { tranAmt: txAmount, depositCode: txCode },
      order: { amountTotal: orderAmountTotal, depositCode: orderCode },
    },
  });

  notifyChargePrepaidApplied({
    userId: order.userId,
    businessAnchorId: order.businessAnchorId,
    amount: Number(order.amountTotal || orderAmountTotal || 0),
  }).catch((err) => {
    console.error(
      "[adminMatch] charge prepaid notify failed:",
      err?.message || err,
    );
  });

  return res.json({
    success: true,
    data: { chargeOrder: updatedOrder, bankTransaction: updatedTx },
  });
}

export async function adminVerifyChargeOrder(req, res) {
  try {
    const { chargeOrderId } = req.body;
    const adminUserId = req.user?._id;

    if (!chargeOrderId) {
      return res.status(400).json({
        success: false,
        message: "충전 주문 ID가 필요합니다.",
      });
    }

    const order = await ChargeOrder.findById(chargeOrderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "충전 주문을 찾을 수 없습니다.",
      });
    }

    if (order.status !== "MATCHED") {
      return res.status(400).json({
        success: false,
        message: "매칭된 주문만 검증할 수 있습니다.",
      });
    }

    if (order.adminVerified) {
      return res.status(400).json({
        success: false,
        message: "이미 검증된 주문입니다.",
      });
    }

    await ChargeOrder.updateOne(
      { _id: order._id },
      {
        $set: {
          adminVerified: true,
          adminVerifiedAt: new Date(),
          adminVerifiedBy: adminUserId,
        },
      },
    );

    await writeAuditLog({
      req,
      action: "CREDIT_B_PLAN_VERIFY",
      refType: "CHARGE_ORDER",
      refId: order._id,
      details: {
        chargeOrderId: String(order._id),
        businessAnchorId: String(order.businessAnchorId || ""),
        supplyAmount: order.supplyAmount,
      },
    });

    const updatedOrder = await ChargeOrder.findById(order._id).lean();

    return res.json({
      success: true,
      data: updatedOrder,
      message: "충전 주문이 검증되었습니다.",
    });
  } catch (error) {
    console.error("충전 주문 검증 실패:", error);
    return res.status(500).json({
      success: false,
      message: "충전 주문 검증에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function adminLockChargeOrder(req, res) {
  try {
    const { chargeOrderId, reason } = req.body;

    if (!chargeOrderId) {
      return res.status(400).json({
        success: false,
        message: "충전 주문 ID가 필요합니다.",
      });
    }

    const order = await ChargeOrder.findById(chargeOrderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "충전 주문을 찾을 수 없습니다.",
      });
    }

    if (order.isLocked) {
      return res.status(400).json({
        success: false,
        message: "이미 잠긴 주문입니다.",
      });
    }

    await ChargeOrder.updateOne(
      { _id: order._id },
      {
        $set: {
          isLocked: true,
          lockedAt: new Date(),
          lockedReason: reason || "관리자 검토 필요",
        },
      },
    );

    await writeAuditLog({
      req,
      action: "CREDIT_B_PLAN_LOCK",
      refType: "CHARGE_ORDER",
      refId: order._id,
      details: {
        chargeOrderId: String(order._id),
        businessAnchorId: String(order.businessAnchorId || ""),
        reason: reason || "관리자 검토 필요",
      },
    });

    const updatedOrder = await ChargeOrder.findById(order._id).lean();

    return res.json({
      success: true,
      data: updatedOrder,
      message: "충전 주문이 잠겼습니다. 해당 조직의 크레딧 사용이 제한됩니다.",
    });
  } catch (error) {
    console.error("충전 주문 잠금 실패:", error);
    return res.status(500).json({
      success: false,
      message: "충전 주문 잠금에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function adminUnlockChargeOrder(req, res) {
  try {
    const { chargeOrderId } = req.body;

    if (!chargeOrderId) {
      return res.status(400).json({
        success: false,
        message: "충전 주문 ID가 필요합니다.",
      });
    }

    const order = await ChargeOrder.findById(chargeOrderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "충전 주문을 찾을 수 없습니다.",
      });
    }

    if (!order.isLocked) {
      return res.status(400).json({
        success: false,
        message: "잠기지 않은 주문입니다.",
      });
    }

    await ChargeOrder.updateOne(
      { _id: order._id },
      {
        $set: {
          isLocked: false,
          lockedAt: null,
          lockedReason: "",
        },
      },
    );

    await writeAuditLog({
      req,
      action: "CREDIT_B_PLAN_UNLOCK",
      refType: "CHARGE_ORDER",
      refId: order._id,
      details: {
        chargeOrderId: String(order._id),
        businessAnchorId: String(order.businessAnchorId || ""),
      },
    });

    const updatedOrder = await ChargeOrder.findById(order._id).lean();

    return res.json({
      success: true,
      data: updatedOrder,
      message: "충전 주문 잠금이 해제되었습니다.",
    });
  } catch (error) {
    console.error("충전 주문 잠금 해제 실패:", error);
    return res.status(500).json({
      success: false,
      message: "충전 주문 잠금 해제에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function adminGetBankTransactions(req, res) {
  try {
    // 기존: jobID로 팝빌 조회
    // 변경: DB에서 최근 거래내역 조회 (혹은 필터링)
    // adminListBankTransactions API가 이미 존재하므로 이 API의 역할이 모호해짐.
    // 하지만 "수집 결과 확인" 용도라면 DB조회로 대체 가능.

    const { limit = 100 } = req.query;

    const transactions = await BankTransaction.find({})
      .sort({ occurredAt: -1, _id: -1 })
      .limit(Number(limit))
      .lean();

    return res.json({ success: true, data: transactions });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "계좌 거래내역 조회 실패",
      error: error.message,
    });
  }
}
