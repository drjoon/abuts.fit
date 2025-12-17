import mongoose from "mongoose";
import CreditOrder from "../models/creditOrder.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import TossWebhookEvent from "../models/tossWebhookEvent.model.js";

export async function handleTossWebhook(req, res) {
  const transmissionId = String(
    req.headers["tosspayments-webhook-transmission-id"] || ""
  ).trim();
  const transmissionTime = String(
    req.headers["tosspayments-webhook-transmission-time"] || ""
  ).trim();
  const retriedCount = Number(
    req.headers["tosspayments-webhook-transmission-retried-count"] || 0
  );

  if (!transmissionId) {
    return res
      .status(400)
      .json({ success: false, message: "Missing transmission id" });
  }

  const exists = await TossWebhookEvent.findOne({ transmissionId }).lean();
  if (exists) {
    return res.status(200).json({ ok: true });
  }

  const body = req.body || {};
  const eventType = String(body?.eventType || body?.type || "");

  const orderId = String(body?.orderId || "");
  const transactionKey = String(body?.transactionKey || "");
  const status = String(body?.status || "");

  try {
    await TossWebhookEvent.create({
      transmissionId,
      transmissionTime,
      retriedCount: Number.isFinite(retriedCount) ? retriedCount : 0,
      eventType,
      orderId,
      transactionKey,
      status,
      rawBody: body,
      processStatus: "RECEIVED",
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(200).json({ ok: true });
    }
    throw err;
  }

  if (!orderId) {
    await TossWebhookEvent.updateOne(
      { transmissionId },
      { $set: { processStatus: "IGNORED", processedAt: new Date() } }
    );
    return res.status(200).json({ ok: true });
  }

  const order = await CreditOrder.findOne({ orderId }).lean();
  if (!order) {
    await TossWebhookEvent.updateOne(
      { transmissionId },
      { $set: { processStatus: "IGNORED", processedAt: new Date() } }
    );
    return res.status(200).json({ ok: true });
  }

  const secret = String(body?.secret || "");
  if (!secret || secret !== String(order.tossSecret || "")) {
    await TossWebhookEvent.updateOne(
      { transmissionId },
      { $set: { processStatus: "FAILED", processedAt: new Date() } }
    );
    return res.status(400).json({ ok: false });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (status) {
        await CreditOrder.updateOne(
          { _id: order._id },
          {
            $set: {
              status:
                status === "WAITING_FOR_DEPOSIT" ||
                status === "DONE" ||
                status === "CANCELED"
                  ? status
                  : order.status,
              depositedAt: status === "DONE" ? new Date() : order.depositedAt,
            },
          },
          { session }
        );
      }

      if (status === "DONE") {
        const uniqueKey = `toss:${String(order.paymentKey)}:charge`;
        await CreditLedger.updateOne(
          { uniqueKey },
          {
            $setOnInsert: {
              organizationId: order.organizationId,
              userId: order.userId,
              type: "CHARGE",
              amount: Number(order.supplyAmount),
              refType: "CREDIT_ORDER",
              refId: order._id,
              uniqueKey,
            },
          },
          { upsert: true, session }
        );
      }
    });
  } finally {
    session.endSession();
  }

  await TossWebhookEvent.updateOne(
    { transmissionId },
    { $set: { processStatus: "PROCESSED", processedAt: new Date() } }
  );

  return res.status(200).json({ ok: true });
}
