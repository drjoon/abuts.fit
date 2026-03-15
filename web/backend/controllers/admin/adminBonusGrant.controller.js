import { Types } from "mongoose";
import Business from "../../models/business.model.js";
import BonusGrant from "../../models/bonusGrant.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  CREDIT_SETTINGS_SCHEMA_DEFAULTS,
  loadCreditSettingsDefaults,
} from "../../utils/creditSettingsDefaults.js";

function normalizeBusinessNumberDigits(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
}

function formatBusinessNumber(digits10) {
  const digits = String(digits10 || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export async function adminOverrideWelcomeBonus(req, res) {
  try {
    const businessNumberDigits = normalizeBusinessNumberDigits(
      req.body?.businessNumber,
    );
    if (!businessNumberDigits) {
      return res.status(400).json({
        success: false,
        message: "유효한 사업자등록번호(10자리)를 입력해주세요.",
      });
    }

    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "예외 지급 사유(reason)를 입력해주세요.",
      });
    }

    const defaults = await loadCreditSettingsDefaults();
    const amountRaw = req.body?.amount;
    const amount =
      typeof amountRaw === "number" && !Number.isNaN(amountRaw)
        ? Math.max(0, Math.floor(amountRaw))
        : Number(defaults.defaultWelcomeBonusCredit ?? 0) ||
          CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultWelcomeBonusCredit;

    const formatted = formatBusinessNumber(businessNumberDigits);

    let businessId = String(req.body?.businessId || "").trim();
    if (businessId && !Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessId입니다.",
      });
    }

    let businessAnchorId = null;
    if (!businessId) {
      const org = await Business.findOne({
        "extracted.businessNumber": formatted,
      })
        .select({ _id: 1, businessAnchorId: 1 })
        .lean();
      if (!org?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 사업자등록번호로 등록된 기공소를 찾을 수 없습니다.",
        });
      }
      businessId = String(org._id);
      businessAnchorId = org?.businessAnchorId || null;
    } else {
      const org = await Business.findById(businessId)
        .select({ businessAnchorId: 1 })
        .lean();
      businessAnchorId = org?.businessAnchorId || null;
    }

    const userIdRaw = String(req.body?.userId || "").trim();
    const userId =
      userIdRaw && Types.ObjectId.isValid(userIdRaw) ? userIdRaw : null;

    const grant = await BonusGrant.create({
      type: "WELCOME_BONUS",
      businessNumber: businessNumberDigits,
      amount,
      businessId: businessId,
      userId,
      isOverride: true,
      source: "admin",
      overrideReason: reason,
      grantedByUserId: req.user?._id || null,
    });

    const uniqueKey = `bonus_grant:${String(grant._id)}`;
    const result = await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          businessId,
          businessAnchorId,
          userId,
          type: "BONUS",
          amount,
          refType: "WELCOME_BONUS",
          refId: businessAnchorId || businessId,
          uniqueKey,
        },
      },
      { upsert: true },
    );

    if (!result?.upsertedCount) {
      return res.status(409).json({
        success: false,
        message: "이미 처리된 지급 건입니다.",
      });
    }

    const ledgerDoc = await CreditLedger.findOne({ uniqueKey })
      .select({ _id: 1 })
      .lean();

    await BonusGrant.updateOne(
      { _id: grant._id },
      { $set: { creditLedgerId: ledgerDoc?._id || null } },
    );

    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: amount,
      reason: "admin_welcome_bonus",
      refId: ledgerDoc?._id || grant._id,
    });

    return res.json({
      success: true,
      data: {
        bonusGrantId: grant._id,
        businessId,
        businessNumber: businessNumberDigits,
        amount,
        creditLedgerId: ledgerDoc?._id || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보너스 예외 지급 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminListBonusGrants(req, res) {
  try {
    const type = String(req.query?.type || "").trim() || "WELCOME_BONUS";
    const businessNumberDigits = normalizeBusinessNumberDigits(
      req.query?.businessNumber,
    );
    const skip = Math.max(0, parseInt(req.query?.skip || "0", 10));
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query?.limit || "20", 10)),
    );

    const startDate = req.query?.startDate
      ? new Date(String(req.query.startDate))
      : null;
    const endDate = req.query?.endDate
      ? new Date(String(req.query.endDate))
      : null;

    const q = { type };
    if (businessNumberDigits) {
      q.businessNumber = businessNumberDigits;
    }

    if (startDate && endDate) {
      q.createdAt = {
        $gte: startDate,
        $lte: new Date(endDate.getTime() + 86400000),
      };
    }

    const rows = await BonusGrant.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await BonusGrant.countDocuments(q);
    const businessIds = Array.from(
      new Set(
        (rows || [])
          .map((row) => String(row?.businessId || "").trim())
          .filter((id) => id && Types.ObjectId.isValid(id)),
      ),
    );
    const businesses = businessIds.length
      ? await Business.find({
          _id: {
            $in: businessIds.map((id) => new Types.ObjectId(id)),
          },
        })
          .select({ _id: 1, businessAnchorId: 1 })
          .lean()
      : [];
    const businessAnchorIdByBusinessId = new Map(
      (businesses || []).map((business) => [
        String(business?._id || ""),
        String(business?.businessAnchorId || "").trim(),
      ]),
    );

    const rowsWithSpent = await Promise.all(
      rows.map(async (row) => {
        const businessId = String(row?.businessId || "").trim();
        const businessAnchorId =
          businessAnchorIdByBusinessId.get(businessId) || "";
        const spentLedger =
          businessAnchorId && Types.ObjectId.isValid(businessAnchorId)
            ? await CreditLedger.findOne({
                businessAnchorId: new Types.ObjectId(businessAnchorId),
                type: "SPEND",
                createdAt: { $gte: row.createdAt },
              })
                .select({ amount: 1 })
                .lean()
            : null;

        return {
          ...row,
          hasSpent: !!spentLedger,
        };
      }),
    );

    return res.json({
      success: true,
      data: {
        rows: rowsWithSpent,
        total,
        skip,
        limit,
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보너스 지급 내역 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminCancelBonusGrant(req, res) {
  try {
    const grantId = String(req.params?.id || "").trim();
    if (!Types.ObjectId.isValid(grantId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 bonusGrantId입니다.",
      });
    }

    const cancelReason = String(req.body?.reason || "").trim();
    if (!cancelReason) {
      return res.status(400).json({
        success: false,
        message: "지급 취소 사유(reason)를 입력해주세요.",
      });
    }

    const grant = await BonusGrant.findById(grantId).lean();
    if (!grant?._id) {
      return res.status(404).json({
        success: false,
        message: "지급 내역을 찾을 수 없습니다.",
      });
    }

    if (grant.canceledAt) {
      return res.status(409).json({
        success: false,
        message: "이미 취소된 지급 건입니다.",
      });
    }

    const businessId = String(grant.businessId || "").trim();
    let businessAnchorId = null;
    if (businessId && Types.ObjectId.isValid(businessId)) {
      businessAnchorId =
        (
          await Business.findById(businessId)
            .select({ businessAnchorId: 1 })
            .lean()
        )?.businessAnchorId || null;
    }
    if (!businessAnchorId) {
      const businessByNumber = await Business.findOne({
        "extracted.businessNumber": formatBusinessNumber(grant.businessNumber),
      })
        .select({ _id: 1, businessAnchorId: 1 })
        .lean();
      businessAnchorId = businessByNumber?.businessAnchorId || null;
    }
    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "지급 건의 businessAnchorId를 확인할 수 없습니다.",
      });
    }

    const amount = Number(grant.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "취소할 금액이 올바르지 않습니다.",
      });
    }

    const uniqueKey = `bonus_grant_cancel:${String(grant._id)}`;
    const result = await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          businessId,
          businessAnchorId,
          userId: grant.userId || null,
          type: "ADJUST",
          amount: -amount,
          refType: "WELCOME_BONUS_CANCEL",
          refId: grant._id,
          uniqueKey,
        },
      },
      { upsert: true },
    );

    if (!result?.upsertedCount) {
      return res.status(409).json({
        success: false,
        message: "이미 취소 처리된 지급 건입니다.",
      });
    }

    const cancelLedgerDoc = await CreditLedger.findOne({ uniqueKey })
      .select({ _id: 1 })
      .lean();

    const canceledAt = new Date();

    await BonusGrant.updateOne(
      { _id: grant._id },
      {
        $set: {
          canceledAt,
          canceledByUserId: req.user?._id || null,
          cancelReason,
          cancelCreditLedgerId: cancelLedgerDoc?._id || null,
        },
      },
    );

    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: -amount,
      reason: "admin_welcome_bonus_cancel",
      refId: cancelLedgerDoc?._id || grant._id,
    });

    return res.json({
      success: true,
      data: {
        bonusGrantId: grant._id,
        cancelCreditLedgerId: cancelLedgerDoc?._id || null,
        canceledAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보너스 지급 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminGrantFreeShippingCredit(req, res) {
  try {
    const businessNumberDigits = normalizeBusinessNumberDigits(
      req.body?.businessNumber,
    );
    if (!businessNumberDigits) {
      return res.status(400).json({
        success: false,
        message: "유효한 사업자등록번호(10자리)를 입력해주세요.",
      });
    }

    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "배송비 무료 크레딧 지급 사유(reason)를 입력해주세요.",
      });
    }

    const defaults = await loadCreditSettingsDefaults();
    const amountRaw = req.body?.amount;
    const amount =
      typeof amountRaw === "number" && !Number.isNaN(amountRaw)
        ? Math.max(0, Math.floor(amountRaw))
        : Number(defaults.defaultFreeShippingCredit ?? 0) ||
          CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultFreeShippingCredit;

    const formatted = formatBusinessNumber(businessNumberDigits);

    let businessId = String(req.body?.businessId || "").trim();
    if (businessId && !Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessId입니다.",
      });
    }

    let businessAnchorId = null;
    if (!businessId) {
      const org = await Business.findOne({
        "extracted.businessNumber": formatted,
      })
        .select({ _id: 1, businessAnchorId: 1 })
        .lean();
      if (!org?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 사업자등록번호로 등록된 기공소를 찾을 수 없습니다.",
        });
      }
      businessId = String(org._id);
      businessAnchorId = org?.businessAnchorId || null;
    } else {
      const org = await Business.findById(businessId)
        .select({ businessAnchorId: 1 })
        .lean();
      businessAnchorId = org?.businessAnchorId || null;
    }

    const userIdRaw = String(req.body?.userId || "").trim();
    const userId =
      userIdRaw && Types.ObjectId.isValid(userIdRaw) ? userIdRaw : null;

    const grant = await BonusGrant.create({
      type: "FREE_SHIPPING_CREDIT",
      businessNumber: businessNumberDigits,
      amount,
      businessId: businessId,
      userId,
      isOverride: true,
      source: "admin",
      overrideReason: reason,
      grantedByUserId: req.user?._id || null,
    });

    const uniqueKey = `bonus_grant:${String(grant._id)}`;
    const result = await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          businessId,
          businessAnchorId,
          userId,
          type: "BONUS",
          amount,
          refType: "FREE_SHIPPING_CREDIT",
          refId: businessAnchorId || businessId,
          uniqueKey,
        },
      },
      { upsert: true },
    );

    if (!result?.upsertedCount) {
      return res.status(409).json({
        success: false,
        message: "이미 처리된 지급 건입니다.",
      });
    }

    const ledgerDoc = await CreditLedger.findOne({ uniqueKey })
      .select({ _id: 1 })
      .lean();

    await BonusGrant.updateOne(
      { _id: grant._id },
      { $set: { creditLedgerId: ledgerDoc?._id || null } },
    );

    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: amount,
      reason: "admin_free_shipping_credit",
      refId: ledgerDoc?._id || grant._id,
    });

    return res.json({
      success: true,
      data: {
        bonusGrantId: grant._id,
        businessId,
        businessNumber: businessNumberDigits,
        amount,
        creditLedgerId: ledgerDoc?._id || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "배송비 무료 크레딧 지급 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
