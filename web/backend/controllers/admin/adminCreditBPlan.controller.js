import mongoose from "mongoose";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import AdminAuditLog from "../../models/adminAuditLog.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import ActivityLog from "../../models/activityLog.model.js";
import {
  upsertBankTransaction,
  autoMatchBankTransactionsOnce,
} from "../../utils/creditBPlanMatching.js";

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

export async function adminListChargeOrders(req, res) {
  const now = new Date();
  await ChargeOrder.deleteMany({
    status: "PENDING",
    bankTransactionId: null,
    expiresAt: { $lte: now },
  });

  const status = String(req.query.status || "")
    .trim()
    .toUpperCase();
  const match = {};
  if (
    status &&
    ["PENDING", "MATCHED", "EXPIRED", "CANCELED"].includes(status)
  ) {
    match.status = status;
  }

  const items = await ChargeOrder.find(match)
    .populate("adminApprovalBy", "name email")
    .sort({ createdAt: -1, _id: -1 })
    .limit(500)
    .lean();

  return res.json({ success: true, data: items });
}

export async function adminApproveChargeOrder(req, res) {
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

  if (!["PENDING", "AUTO_MATCHED"].includes(String(order.status))) {
    return res.status(400).json({
      success: false,
      message: "대기 또는 자동매칭 상태만 승인할 수 있습니다.",
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

  await ChargeOrder.updateOne(
    { _id: order._id, adminApprovalStatus: "PENDING" },
    {
      $set: {
        adminApprovalStatus: "APPROVED",
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
    action: "CREDIT_B_PLAN_CHARGE_APPROVE",
    refType: "CHARGE_ORDER",
    refId: order._id,
    details: {
      chargeOrderId: String(order._id),
      organizationId: String(order.organizationId),
      amountTotal: order.amountTotal,
      note,
    },
  });

  await logActivity({
    userId: actorUserId,
    action: "CHARGE_APPROVED",
    details: {
      chargeOrderId: String(order._id),
      organizationId: String(order.organizationId),
      amountTotal: order.amountTotal,
      note,
    },
    severity: "high",
    status: "success",
  });

  await sendPushover({
    title: "[Charge] 승인 완료",
    message: `ChargeOrder ${order.depositCode || order._id} 승인 (총액 ${
      order.amountTotal
    }원)`,
    priority: "1",
  });

  return res.json({ success: true, data: updated });
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

  if (!["PENDING", "AUTO_MATCHED"].includes(String(order.status))) {
    return res.status(400).json({
      success: false,
      message: "대기 또는 자동매칭 상태만 거절할 수 있습니다.",
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
      organizationId: String(order.organizationId),
      amountTotal: order.amountTotal,
      note,
    },
  });

  await logActivity({
    userId: actorUserId,
    action: "CHARGE_REJECTED",
    details: {
      chargeOrderId: String(order._id),
      organizationId: String(order.organizationId),
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
  const status = String(req.query.status || "")
    .trim()
    .toUpperCase();
  const match = {};
  if (status && ["NEW", "MATCHED", "IGNORED"].includes(status)) {
    match.status = status;
  }

  const items = await BankTransaction.find(match)
    .sort({ occurredAt: -1, createdAt: -1, _id: -1 })
    .limit(500)
    .lean();

  return res.json({ success: true, data: items });
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

      const uniqueKey = `bplan:bankTx:${String(tx._id)}:charge`;
      await CreditLedger.updateOne(
        { uniqueKey },
        {
          $setOnInsert: {
            organizationId: order.organizationId,
            userId: order.userId,
            type: "CHARGE",
            amount: Number(order.supplyAmount),
            refType: "CHARGE_ORDER",
            refId: order._id,
            uniqueKey,
          },
        },
        { upsert: true, session },
      );

      const existingDraft = await TaxInvoiceDraft.findOne(
        { chargeOrderId: order._id },
        null,
        { session },
      );
      if (!existingDraft) {
        const org = await RequestorOrganization.findById(order.organizationId)
          .select({
            "extracted.businessNumber": 1,
            "extracted.companyName": 1,
            "extracted.representativeName": 1,
            "extracted.address": 1,
            "extracted.businessType": 1,
            "extracted.businessItem": 1,
            "extracted.email": 1,
            "extracted.phoneNumber": 1,
          })
          .lean({ session });

        await TaxInvoiceDraft.create(
          [
            {
              chargeOrderId: order._id,
              organizationId: order.organizationId,
              status: "PENDING_APPROVAL",
              supplyAmount: Number(order.supplyAmount),
              vatAmount: Number(order.vatAmount || 0),
              totalAmount: Number(order.amountTotal || 0),
              buyer: {
                bizNo: org?.extracted?.businessNumber || "",
                corpName: org?.extracted?.companyName || "",
                ceoName: org?.extracted?.representativeName || "",
                addr: org?.extracted?.address || "",
                bizType: org?.extracted?.businessType || "",
                bizClass: org?.extracted?.businessItem || "",
                contactEmail: org?.extracted?.email || "",
                contactTel: org?.extracted?.phoneNumber || "",
                contactName: org?.extracted?.representativeName || "",
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
        organizationId: String(order.organizationId),
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
        organizationId: String(order.organizationId),
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
        organizationId: String(order.organizationId),
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
