import crypto from "crypto";
import mongoose from "mongoose";
import CreditOrder from "../models/creditOrder.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import {
  tossCancelPayment,
  tossConfirmPayment,
  makeDeterministicIdempotencyKey,
} from "../utils/tossPayments.js";

function isMockPaymentsEnabled() {
  return (
    String(process.env.PAYMENTS_MODE || "").toLowerCase() === "mock" &&
    String(process.env.NODE_ENV || "").toLowerCase() !== "production"
  );
}

async function confirmPayment({ paymentKey, orderId, amount }) {
  if (!isMockPaymentsEnabled()) {
    return tossConfirmPayment({ paymentKey, orderId, amount });
  }

  return {
    paymentKey: String(paymentKey || "MOCK_PAYMENT_KEY"),
    orderId: String(orderId || ""),
    status: "DONE",
    secret: `mock_${crypto.randomBytes(12).toString("hex")}`,
    virtualAccount: {
      bank: "",
      accountNumber: "",
      customerName: "",
      dueDate: "",
    },
  };
}

async function cancelPayment({
  paymentKey,
  cancelReason,
  cancelAmount,
  refundReceiveAccount,
  idempotencyKey,
}) {
  if (!isMockPaymentsEnabled()) {
    return tossCancelPayment({
      paymentKey,
      cancelReason,
      cancelAmount,
      refundReceiveAccount,
      idempotencyKey,
    });
  }

  return {
    paymentKey: String(paymentKey || "MOCK_PAYMENT_KEY"),
    cancels: [
      {
        transactionKey: String(idempotencyKey || "mock_cancel"),
        cancelReason: String(cancelReason || ""),
        cancelAmount: typeof cancelAmount === "number" ? cancelAmount : null,
      },
    ],
  };
}

function roundVat(amount) {
  return Math.round(amount * 0.1);
}

function roundUpUnit(amount, unit) {
  const n = Number(amount);
  const u = Number(unit);
  if (!Number.isFinite(n) || !Number.isFinite(u) || u <= 0) return 0;
  return Math.ceil(n / u) * u;
}

function validateSupplyAmount(raw) {
  const supplyAmount = Number(raw);
  if (!Number.isFinite(supplyAmount) || supplyAmount <= 0) {
    return { ok: false, message: "유효하지 않은 금액입니다." };
  }

  const MIN = 500000;
  const MAX = 5000000;
  if (supplyAmount < MIN || supplyAmount > MAX) {
    return {
      ok: false,
      message: "크레딧 충전 금액은 50만원 ~ 500만원 범위여야 합니다.",
    };
  }

  if (supplyAmount <= 1000000) {
    if (supplyAmount % 500000 !== 0) {
      return {
        ok: false,
        message: "100만원 이하는 50만원 단위로만 충전할 수 있습니다.",
      };
    }
  } else {
    if (supplyAmount % 1000000 !== 0) {
      return {
        ok: false,
        message: "100만원 초과는 100만원 단위로만 충전할 수 있습니다.",
      };
    }
  }

  return { ok: true, supplyAmount };
}

function buildOrderId(userId) {
  const rand = crypto.randomBytes(6).toString("hex");
  return `CREDIT_${String(userId)}_${Date.now()}_${rand}`;
}

async function getCreditScope(req) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    throw new Error("기공소 정보가 설정되지 않았습니다.");
  }

  const members = await User.find({ organizationId }).select({ _id: 1 }).lean();
  const userIds = (members || []).map((m) => m?._id).filter(Boolean);
  if (
    req.user?._id &&
    !userIds.some((id) => String(id) === String(req.user._id))
  ) {
    userIds.push(req.user._id);
  }

  return { organizationId, userIds };
}

function buildLedgerQuery(scope) {
  return { organizationId: scope.organizationId };
}

function buildOrderQuery(scope) {
  return { organizationId: scope.organizationId };
}

async function getBalanceBreakdown(scope) {
  const ledgerQuery = buildLedgerQuery(scope);
  const rows = await CreditLedger.find(ledgerQuery)
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1 })
    .lean();

  let paid = 0;
  let bonus = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);

    if (!Number.isFinite(amount)) continue;

    if (type === "CHARGE") {
      paid += amount;
      continue;
    }
    if (type === "BONUS") {
      bonus += amount;
      continue;
    }
    if (type === "REFUND") {
      paid += amount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = Math.abs(amount);
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidBalance = Math.max(0, Math.round(paid));
  const bonusBalance = Math.max(0, Math.round(bonus));
  return {
    balance: paidBalance + bonusBalance,
    paidBalance,
    bonusBalance,
  };
}

async function executeCreditRefund({
  organizationId,
  userId,
  desiredSupply,
  refundReceiveAccount,
}) {
  if (!refundReceiveAccount || typeof refundReceiveAccount !== "object") {
    const err = new Error(
      "refundReceiveAccount(은행/계좌/예금주)가 필요합니다."
    );
    err.statusCode = 400;
    throw err;
  }

  const scope = { organizationId, userIds: userId ? [userId] : [] };
  const { paidBalance } = await getBalanceBreakdown(scope);

  if (!Number.isFinite(desiredSupply) || desiredSupply <= 0) {
    const err = new Error("유효하지 않은 환불 금액입니다.");
    err.statusCode = 400;
    throw err;
  }

  if (desiredSupply > paidBalance) {
    const err = new Error("환불 금액이 보유 유료 크레딧을 초과합니다.");
    err.statusCode = 400;
    throw err;
  }

  let remainingSupply = desiredSupply;
  const totalVat = roundVat(desiredSupply);
  let remainingVat = totalVat;

  const orders = await CreditOrder.find({
    ...buildOrderQuery(scope),
    status: "DONE",
    paymentKey: { $ne: null },
    $expr: {
      $lt: [{ $ifNull: ["$refundedSupplyAmount", 0] }, "$supplyAmount"],
    },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!orders.length) {
    const err = new Error("환불 가능한 충전 내역이 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const allocations = [];

  for (let i = 0; i < orders.length && remainingSupply > 0; i += 1) {
    const o = orders[i];
    const refundedSupply = Number(o.refundedSupplyAmount || 0);
    const refundableSupply = Math.max(
      0,
      Number(o.supplyAmount) - refundedSupply
    );
    if (refundableSupply <= 0) continue;

    const takeSupply = Math.min(refundableSupply, remainingSupply);
    const isLastChunk = remainingSupply === takeSupply;
    const takeVat = isLastChunk ? remainingVat : roundVat(takeSupply);
    const takeTotal = takeSupply + takeVat;

    const idempotencyKey = makeDeterministicIdempotencyKey(
      "refund",
      `${String(o.paymentKey)}:${String(refundedSupply)}:${String(takeTotal)}`
    );
    const payment = await cancelPayment({
      paymentKey: o.paymentKey,
      cancelReason: "CREDIT_REFUND",
      cancelAmount: takeTotal,
      refundReceiveAccount,
      idempotencyKey,
    });

    const cancels = Array.isArray(payment?.cancels) ? payment.cancels : [];
    const cancelTx = cancels[cancels.length - 1];
    const txKey = cancelTx?.transactionKey || idempotencyKey;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const nextRefundedSupply = refundedSupply + takeSupply;
        const nextRefundedVat = Number(o.refundedVatAmount || 0) + takeVat;
        const nextRefundedTotal =
          Number(o.refundedTotalAmount || 0) + takeTotal;

        const isFullyRefunded = nextRefundedSupply >= Number(o.supplyAmount);

        await CreditOrder.updateOne(
          { _id: o._id },
          {
            $set: {
              status: isFullyRefunded ? "REFUNDED" : "DONE",
              refundedSupplyAmount: nextRefundedSupply,
              refundedVatAmount: nextRefundedVat,
              refundedTotalAmount: nextRefundedTotal,
            },
          },
          { session }
        );

        const uniqueKey = `toss:${String(o.paymentKey)}:refund:${String(
          txKey
        )}`;
        await CreditLedger.updateOne(
          { uniqueKey },
          {
            $setOnInsert: {
              organizationId: o.organizationId,
              userId,
              type: "REFUND",
              amount: -takeSupply,
              refType: "CREDIT_ORDER",
              refId: o._id,
              uniqueKey,
            },
          },
          { upsert: true, session }
        );
      });
    } finally {
      session.endSession();
    }

    allocations.push({
      creditOrderId: String(o._id),
      paymentKey: String(o.paymentKey),
      refundSupply: takeSupply,
      refundVat: takeVat,
      refundTotal: takeTotal,
      transactionKey: String(txKey),
    });

    remainingSupply -= takeSupply;
    remainingVat -= takeVat;
  }

  return {
    requestedSupply: desiredSupply,
    requestedVat: totalVat,
    requestedTotal: desiredSupply + totalVat,
    allocations,
  };
}

export async function refundAllPaidCreditForWithdraw({
  organizationId,
  userId,
  refundReceiveAccount,
}) {
  const scope = { organizationId, userIds: userId ? [userId] : [] };
  const { paidBalance } = await getBalanceBreakdown(scope);
  if (!paidBalance) {
    return {
      requestedSupply: 0,
      requestedVat: 0,
      requestedTotal: 0,
      allocations: [],
    };
  }

  return executeCreditRefund({
    organizationId,
    userId,
    desiredSupply: paidBalance,
    refundReceiveAccount,
  });
}

export async function createCreditOrder(req, res) {
  const organizationId = req.user?.organizationId;
  const userId = req.user?._id;
  const position = String(req.user?.position || "");

  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  if (position !== "principal") {
    return res.status(403).json({
      success: false,
      message: "크레딧 충전은 주대표만 가능합니다.",
    });
  }

  const { supplyAmount: rawSupply } = req.body;

  const validated = validateSupplyAmount(rawSupply);
  if (!validated.ok) {
    return res.status(400).json({ success: false, message: validated.message });
  }

  const supplyAmount = validated.supplyAmount;
  const vatAmount = roundVat(supplyAmount);
  const totalAmount = supplyAmount + vatAmount;

  const order = await CreditOrder.create({
    organizationId,
    userId,
    orderId: buildOrderId(organizationId),
    supplyAmount,
    vatAmount,
    totalAmount,
    status: "CREATED",
    requestedAt: new Date(),
  });

  return res.status(201).json({
    success: true,
    data: {
      id: order._id,
      orderId: order.orderId,
      status: order.status,
      supplyAmount: order.supplyAmount,
      vatAmount: order.vatAmount,
      totalAmount: order.totalAmount,
    },
  });
}

export async function listMyCreditOrders(req, res) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const items = await CreditOrder.find(buildOrderQuery(scope))
    .sort({ createdAt: -1 })
    .select({
      orderId: 1,
      status: 1,
      supplyAmount: 1,
      vatAmount: 1,
      totalAmount: 1,
      paymentKey: 1,
      approvedAt: 1,
      depositedAt: 1,
      virtualAccount: 1,
      refundedSupplyAmount: 1,
      refundedVatAmount: 1,
      refundedTotalAmount: 1,
      createdAt: 1,
    })
    .lean();

  return res.json({ success: true, data: items });
}

export async function getMyCreditBalance(req, res) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const { balance, paidBalance, bonusBalance } = await getBalanceBreakdown(
    scope
  );
  return res.json({
    success: true,
    data: { balance, paidBalance, bonusBalance },
  });
}

export async function getMyCreditSpendInsights(req, res) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const ledgerQuery = buildLedgerQuery(scope);

  const MIN = 500000;
  const MAX = 5000000;
  const WINDOW_DAYS = 90;
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const match = {
    ...ledgerQuery,
    type: "SPEND",
    createdAt: { $gte: since },
  };

  const rows = await CreditLedger.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: null,
        spentSupply: { $sum: { $abs: "$amount" } },
      },
    },
  ]);

  const spentSupply90 = Number(rows?.[0]?.spentSupply || 0);
  const avgDailySpendSupply =
    spentSupply90 > 0 ? spentSupply90 / WINDOW_DAYS : 0;
  const avgMonthlySpendSupply = spentSupply90 > 0 ? spentSupply90 / 3 : 0;

  const estimatedDaysFor500k =
    avgDailySpendSupply > 0
      ? Math.max(1, Math.ceil(500000 / avgDailySpendSupply))
      : null;

  const recommendedOneMonthSupply = roundUpUnit(avgMonthlySpendSupply, 500000);
  const recommendedThreeMonthsSupply = roundUpUnit(
    avgMonthlySpendSupply * 3,
    500000
  );

  const oneMonthSupply = Math.min(
    MAX,
    Math.max(MIN, recommendedOneMonthSupply || 0)
  );
  const threeMonthsSupply = Math.min(
    MAX,
    Math.max(MIN, recommendedThreeMonthsSupply || 0)
  );

  return res.json({
    success: true,
    data: {
      windowDays: WINDOW_DAYS,
      spentSupply90,
      avgDailySpendSupply,
      avgMonthlySpendSupply,
      estimatedDaysFor500k,
      hasUsageData: spentSupply90 > 0,
      recommended: {
        oneMonthSupply,
        threeMonthsSupply,
      },
    },
  });
}

export async function confirmVirtualAccountPayment(req, res) {
  const organizationId = req.user?.organizationId;
  const userId = req.user?._id;
  const position = String(req.user?.position || "");
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  if (position !== "principal") {
    return res.status(403).json({
      success: false,
      message: "크레딧 충전은 주대표만 가능합니다.",
    });
  }
  const { paymentKey, orderId, amount } = req.body;

  if (
    (!isMockPaymentsEnabled() && !paymentKey) ||
    !orderId ||
    typeof amount !== "number"
  ) {
    return res.status(400).json({
      success: false,
      message: "paymentKey, orderId, amount가 필요합니다.",
    });
  }

  const scope = await getCreditScope(req);
  const order = await CreditOrder.findOne({
    ...buildOrderQuery(scope),
    orderId,
  });
  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "주문을 찾을 수 없습니다." });
  }

  if (order.totalAmount !== amount) {
    return res.status(400).json({
      success: false,
      message: "결제 금액이 주문 금액과 일치하지 않습니다.",
    });
  }

  const resolvedPaymentKey =
    paymentKey || (isMockPaymentsEnabled() ? `MOCK_${String(orderId)}` : "");
  const payment = await confirmPayment({
    paymentKey: resolvedPaymentKey,
    orderId,
    amount,
  });

  const status = String(payment?.status || "");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await CreditOrder.updateOne(
        { _id: order._id },
        {
          $set: {
            paymentKey: String(payment.paymentKey || paymentKey),
            tossSecret: String(payment.secret || ""),
            approvedAt: new Date(),
            status:
              status === "WAITING_FOR_DEPOSIT" ||
              status === "DONE" ||
              status === "CANCELED"
                ? status
                : "WAITING_FOR_DEPOSIT",
            virtualAccount: {
              bank: String(payment?.virtualAccount?.bank || ""),
              accountNumber: String(
                payment?.virtualAccount?.accountNumber || ""
              ),
              customerName: String(payment?.virtualAccount?.customerName || ""),
              dueDate: String(payment?.virtualAccount?.dueDate || ""),
            },
          },
        },
        { session }
      );

      if (status === "DONE") {
        const uniqueKey = `toss:${String(
          payment.paymentKey || paymentKey
        )}:charge`;
        await CreditLedger.updateOne(
          { uniqueKey },
          {
            $setOnInsert: {
              organizationId: order.organizationId,
              userId,
              type: "CHARGE",
              amount: order.supplyAmount,
              refType: "CREDIT_ORDER",
              refId: order._id,
              uniqueKey,
            },
          },
          { upsert: true, session }
        );
        await CreditOrder.updateOne(
          { _id: order._id },
          { $set: { depositedAt: new Date() } },
          { session }
        );
      }
    });
  } finally {
    session.endSession();
  }

  const updated = await CreditOrder.findById(order._id).lean();
  return res.json({ success: true, data: updated });
}

export async function cancelMyCreditOrder(req, res) {
  const organizationId = req.user?.organizationId;
  const position = String(req.user?.position || "");
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  if (position !== "principal") {
    return res.status(403).json({
      success: false,
      message: "크레딧 충전은 주대표만 가능합니다.",
    });
  }
  const orderId = String(req.params.orderId || "").trim();

  if (!orderId) {
    return res
      .status(400)
      .json({ success: false, message: "orderId가 필요합니다." });
  }

  const scope = await getCreditScope(req);
  const order = await CreditOrder.findOne({
    ...buildOrderQuery(scope),
    orderId,
  });
  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "주문을 찾을 수 없습니다." });
  }

  if (order.status === "CANCELED" || order.status === "EXPIRED") {
    return res.json({ success: true, data: order });
  }

  if (order.status === "DONE" || order.status === "REFUNDED") {
    return res.status(400).json({
      success: false,
      message: "입금 완료된 주문은 취소할 수 없습니다.",
    });
  }

  if (order.status === "CREATED") {
    await CreditOrder.updateOne(
      { _id: order._id, status: "CREATED" },
      { $set: { status: "CANCELED" } }
    );
    const updated = await CreditOrder.findById(order._id).lean();
    return res.json({ success: true, data: updated });
  }

  if (order.status !== "WAITING_FOR_DEPOSIT") {
    return res.status(400).json({
      success: false,
      message: "현재 상태에서는 취소할 수 없습니다.",
    });
  }

  if (!order.paymentKey) {
    return res.status(400).json({
      success: false,
      message: "결제 정보가 없어 취소할 수 없습니다.",
    });
  }

  const idempotencyKey = makeDeterministicIdempotencyKey(
    "cancel",
    `${String(order.paymentKey)}:${String(order.orderId)}`
  );

  await cancelPayment({
    paymentKey: order.paymentKey,
    cancelReason: "USER_CANCEL",
    idempotencyKey,
  });

  await CreditOrder.updateOne(
    { _id: order._id, status: "WAITING_FOR_DEPOSIT" },
    { $set: { status: "CANCELED" } }
  );

  const updated = await CreditOrder.findById(order._id).lean();
  return res.json({ success: true, data: updated });
}

export async function requestCreditRefund(req, res) {
  return res.status(403).json({
    success: false,
    message: "크레딧 환불은 회원 탈퇴(계정 해지) 시에만 가능합니다.",
  });
}
