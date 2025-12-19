import mongoose from "mongoose";
import ChargeOrder from "../models/chargeOrder.model.js";
import BankTransaction from "../models/bankTransaction.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import AdminAuditLog from "../models/adminAuditLog.model.js";
import { upsertBankTransaction } from "../utils/creditBPlanMatching.js";

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

export async function adminListChargeOrders(req, res) {
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
    .sort({ createdAt: -1, _id: -1 })
    .limit(500)
    .lean();

  return res.json({ success: true, data: items });
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
    return res
      .status(400)
      .json({
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
        { session }
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
        { session }
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
        { upsert: true, session }
      );

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
