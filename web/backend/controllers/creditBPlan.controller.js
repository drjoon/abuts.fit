import ChargeOrder from "../models/chargeOrder.model.js";
import { ensureOrganizationDepositCode } from "../utils/depositCode.utils.js";

function roundVat(amount) {
  return Math.round(amount * 0.1);
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

function getDepositAccountInfo() {
  return {
    bankName: String(process.env.B_PLAN_DEPOSIT_BANK_NAME || "").trim(),
    accountNumber: String(process.env.B_PLAN_DEPOSIT_ACCOUNT_NO || "").trim(),
    holderName: String(process.env.B_PLAN_DEPOSIT_ACCOUNT_HOLDER || "").trim(),
  };
}

export async function createChargeOrder(req, res) {
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

  const validated = validateSupplyAmount(req.body?.supplyAmount);
  if (!validated.ok) {
    return res.status(400).json({ success: false, message: validated.message });
  }

  const supplyAmount = validated.supplyAmount;
  const vatAmount = roundVat(supplyAmount);
  const amountTotal = supplyAmount + vatAmount;

  const { depositCode } = await ensureOrganizationDepositCode(organizationId);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const doc = await ChargeOrder.create({
    organizationId,
    userId,
    depositCode,
    supplyAmount,
    vatAmount,
    amountTotal,
    status: "PENDING",
    expiresAt,
  });

  return res.status(201).json({
    success: true,
    data: {
      id: doc._id,
      status: doc.status,
      depositCode: doc.depositCode,
      supplyAmount: doc.supplyAmount,
      vatAmount: doc.vatAmount,
      amountTotal: doc.amountTotal,
      expiresAt: doc.expiresAt,
      depositAccount: getDepositAccountInfo(),
    },
  });
}

export async function listMyChargeOrders(req, res) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  const items = await ChargeOrder.find({ organizationId })
    .sort({ createdAt: -1, _id: -1 })
    .select({
      status: 1,
      depositCode: 1,
      supplyAmount: 1,
      vatAmount: 1,
      amountTotal: 1,
      expiresAt: 1,
      matchedAt: 1,
      createdAt: 1,
    })
    .lean();

  return res.json({
    success: true,
    data: {
      depositAccount: getDepositAccountInfo(),
      items,
    },
  });
}

export async function cancelMyChargeOrder(req, res) {
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

  const chargeOrderId = String(req.params.chargeOrderId || "").trim();
  if (!chargeOrderId) {
    return res
      .status(400)
      .json({ success: false, message: "chargeOrderId가 필요합니다." });
  }

  const order = await ChargeOrder.findOne({
    _id: chargeOrderId,
    organizationId,
  })
    .select({ status: 1, bankTransactionId: 1 })
    .lean();
  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "ChargeOrder를 찾을 수 없습니다." });
  }

  if (String(order.status) !== "PENDING") {
    return res.status(400).json({
      success: false,
      message: "현재 상태에서는 취소할 수 없습니다.",
    });
  }

  if (order.bankTransactionId) {
    return res.status(400).json({
      success: false,
      message: "이미 매칭된 ChargeOrder는 취소할 수 없습니다.",
    });
  }

  await ChargeOrder.updateOne(
    { _id: order._id, status: "PENDING", bankTransactionId: null },
    { $set: { status: "CANCELED" } }
  );

  const updated = await ChargeOrder.findById(order._id).lean();
  return res.json({ success: true, data: updated });
}
