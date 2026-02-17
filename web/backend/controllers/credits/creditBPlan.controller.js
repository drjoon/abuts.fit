import ChargeOrder from "../../models/chargeOrder.model.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import {
  ensureOrganizationDepositCode,
  generateChargeOrderDepositCode,
} from "../../utils/depositCode.utils.js";

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
  const userName = req.user?.name;

  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 없습니다.",
    });
  }

  if (!userName) {
    return res.status(400).json({
      success: false,
      message:
        "사용자 이름이 등록되지 않았습니다. 계정 정보를 먼저 등록해주세요.",
    });
  }

  const validated = validateSupplyAmount(req.body?.supplyAmount);
  if (!validated.ok) {
    return res.status(400).json({ success: false, message: validated.message });
  }

  const supplyAmount = validated.supplyAmount;
  const vatAmount = roundVat(supplyAmount);
  const amountTotal = supplyAmount + vatAmount;

  // 기존 대기 건이 있으면 재사용 (유효기간 연장/코드 재발급 방지)
  const now = new Date();
  const existing = await ChargeOrder.findOne({
    organizationId,
    status: "PENDING",
    bankTransactionId: null,
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  if (existing) {
    const needsMigration = !String(existing.depositCode || "")
      .trim()
      .match(/^\d{2}$/);

    if (needsMigration) {
      const { depositCode: migratedCode } =
        await generateChargeOrderDepositCode();
      const migrated = await ChargeOrder.findOneAndUpdate(
        {
          _id: existing._id,
          status: "PENDING",
          bankTransactionId: null,
          expiresAt: { $gt: now },
        },
        { $set: { depositCode: migratedCode, depositorName: migratedCode } },
        { new: true }
      ).lean();

      const doc = migrated || existing;
      return res.status(200).json({
        success: true,
        data: {
          id: doc._id,
          status: doc.status,
          depositCode: doc.depositCode,
          depositorName: doc.depositorName,
          supplyAmount: doc.supplyAmount,
          vatAmount: doc.vatAmount,
          amountTotal: doc.amountTotal,
          expiresAt: doc.expiresAt,
          depositAccount: getDepositAccountInfo(),
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: existing._id,
        status: existing.status,
        depositCode: existing.depositCode,
        depositorName: existing.depositorName,
        supplyAmount: existing.supplyAmount,
        vatAmount: existing.vatAmount,
        amountTotal: existing.amountTotal,
        expiresAt: existing.expiresAt,
        depositAccount: getDepositAccountInfo(),
      },
    });
  }

  // 기공소 코드(기존)와 별개로, 충전 요청마다 일회성 2자리 코드 발급
  await ensureOrganizationDepositCode(organizationId); // 기존 보존 (타 기능 호환)
  const { depositCode } = await generateChargeOrderDepositCode();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const doc = await ChargeOrder.create({
    organizationId,
    userId,
    depositCode,
    depositorName: depositCode,
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
      depositorName: doc.depositorName,
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
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
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

export async function requestTaxInvoice(req, res) {
  try {
    const userId = req.user?._id;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "기공소 정보가 설정되지 않았습니다.",
      });
    }

    const { chargeOrderId } = req.body;
    if (!chargeOrderId) {
      return res.status(400).json({
        success: false,
        message: "충전 주문 ID가 필요합니다.",
      });
    }

    const chargeOrder = await ChargeOrder.findOne({
      _id: chargeOrderId,
      organizationId,
    });

    if (!chargeOrder) {
      return res.status(404).json({
        success: false,
        message: "충전 주문을 찾을 수 없습니다.",
      });
    }

    if (chargeOrder.status !== "MATCHED") {
      return res.status(400).json({
        success: false,
        message: "입금이 확인된 주문만 세금계산서를 요청할 수 있습니다.",
      });
    }

    const existingDraft = await TaxInvoiceDraft.findOne({
      chargeOrderId,
      status: { $in: ["PENDING_APPROVAL", "APPROVED", "SENT"] },
    });

    if (existingDraft) {
      return res.status(400).json({
        success: false,
        message: "이미 세금계산서 발급 요청이 진행 중입니다.",
      });
    }

    const organization = await RequestorOrganization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        message:
          "조직 정보를 찾을 수 없습니다. 사업자 정보를 먼저 등록해주세요.",
      });
    }

    const extracted = organization.extracted || {};
    const buyer = {
      bizNo: extracted.businessNumber || "",
      corpName: extracted.companyName || "",
      ceoName: extracted.ceoName || "",
      addr: extracted.address || "",
      bizType: extracted.businessType || "",
      bizClass: extracted.businessCategory || "",
      contactName: req.user?.name || "",
      contactEmail: req.user?.email || "",
      contactTel: req.user?.phone || "",
    };

    const draft = await TaxInvoiceDraft.create({
      chargeOrderId,
      organizationId,
      userId,
      status: "PENDING_APPROVAL",
      supplyAmount: chargeOrder.supplyAmount || 0,
      vatAmount: chargeOrder.vatAmount || 0,
      totalAmount: chargeOrder.amountTotal || 0,
      buyer,
    });

    return res.status(201).json({ success: true, data: draft });
  } catch (error) {
    console.error("세금계산서 발급 요청 실패:", error);
    return res.status(500).json({
      success: false,
      message: "세금계산서 발급 요청에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function listMyTaxInvoices(req, res) {
  try {
    const userId = req.user?._id;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "기공소 정보가 설정되지 않았습니다.",
      });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { organizationId };
    if (status) {
      query.status = status;
    }

    const drafts = await TaxInvoiceDraft.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await TaxInvoiceDraft.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: drafts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("세금계산서 목록 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "세금계산서 목록 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function getMyTaxInvoice(req, res) {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "기공소 정보가 설정되지 않았습니다.",
      });
    }

    const draft = await TaxInvoiceDraft.findOne({
      _id: id,
      organizationId,
    }).lean();

    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "세금계산서를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({ success: true, data: draft });
  } catch (error) {
    console.error("세금계산서 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "세금계산서 조회에 실패했습니다.",
      error: error.message,
    });
  }
}
