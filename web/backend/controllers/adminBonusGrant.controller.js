import { Types } from "mongoose";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import BonusGrant from "../models/bonusGrant.model.js";
import CreditLedger from "../models/creditLedger.model.js";

const DEFAULT_WELCOME_BONUS_AMOUNT = 30000;

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
      req.body?.businessNumber
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

    const amountRaw = req.body?.amount;
    const amount =
      typeof amountRaw === "number" && !Number.isNaN(amountRaw)
        ? Math.max(0, Math.floor(amountRaw))
        : DEFAULT_WELCOME_BONUS_AMOUNT;

    const formatted = formatBusinessNumber(businessNumberDigits);

    let organizationId = String(req.body?.organizationId || "").trim();
    if (organizationId && !Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 organizationId입니다.",
      });
    }

    if (!organizationId) {
      const org = await RequestorOrganization.findOne({
        "extracted.businessNumber": formatted,
      })
        .select({ _id: 1 })
        .lean();
      if (!org?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 사업자등록번호로 등록된 기공소를 찾을 수 없습니다.",
        });
      }
      organizationId = String(org._id);
    }

    const userIdRaw = String(req.body?.userId || "").trim();
    const userId =
      userIdRaw && Types.ObjectId.isValid(userIdRaw) ? userIdRaw : null;

    const grant = await BonusGrant.create({
      type: "WELCOME_BONUS",
      businessNumber: businessNumberDigits,
      amount,
      organizationId,
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
          organizationId,
          userId,
          type: "BONUS",
          amount,
          refType: "WELCOME_BONUS",
          refId: organizationId,
          uniqueKey,
        },
      },
      { upsert: true }
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
      { $set: { creditLedgerId: ledgerDoc?._id || null } }
    );

    return res.json({
      success: true,
      data: {
        bonusGrantId: grant._id,
        organizationId,
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
      req.query?.businessNumber
    );

    const q = { type };
    if (businessNumberDigits) {
      q.businessNumber = businessNumberDigits;
    }

    const rows = await BonusGrant.find(q)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ success: true, data: { rows } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보너스 지급 내역 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
