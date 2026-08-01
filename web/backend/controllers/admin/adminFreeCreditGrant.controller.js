// related files:
// - web/backend/rules.md
// - web/backend/modules/admin/admin.routes.js
// - web/backend/models/freeCreditGrant.model.js
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/generalLedger.service.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import BusinessCreditBalance from "../../models/businessCreditBalance.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import User from "../../models/user.model.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  CREDIT_SETTINGS_SCHEMA_DEFAULTS,
  loadCreditSettingsDefaults,
} from "../../utils/creditSettingsDefaults.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";

// 무료 크레딧 지급 가능 대상:
// 1) BusinessAnchor.businessType === requestor
// 2) 또는 대표 사용자(User.role)가 requestor
const isFreeCreditEligibleBusiness = async (businessDoc) => {
  const businessType = String(businessDoc?.businessType || "")
    .trim()
    .toLowerCase();
  if (businessType === "requestor") return true;

  const primaryContactUserId = String(
    businessDoc?.primaryContactUserId || "",
  ).trim();
  if (!primaryContactUserId || !Types.ObjectId.isValid(primaryContactUserId)) {
    return false;
  }

  const owner = await User.findById(primaryContactUserId)
    .select({ role: 1 })
    .lean();
  return (
    String(owner?.role || "")
      .trim()
      .toLowerCase() === "requestor"
  );
};

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

function normalizeFreeCreditGrantType(typeRaw) {
  const t = String(typeRaw || "").trim().toUpperCase();
  if (!t || t === "REQUEST_FREE_CREDIT" || t === "WELCOME_BONUS") {
    return {
      queryTypes: ["REQUEST_FREE_CREDIT", "WELCOME_BONUS"], // legacy 호환 (앱 안정화 후 삭제 예정): WELCOME_BONUS 병행 조회
      canonicalType: "REQUEST_FREE_CREDIT",
    };
  }
  if (t === "SHIPPING_FREE_CREDIT" || t === "FREE_SHIPPING_CREDIT") {
    return {
      queryTypes: ["SHIPPING_FREE_CREDIT", "FREE_SHIPPING_CREDIT"], // legacy 호환 (앱 안정화 후 삭제 예정): FREE_SHIPPING_CREDIT 병행 조회
      canonicalType: "SHIPPING_FREE_CREDIT",
    };
  }
  return {
    queryTypes: [t],
    canonicalType: t,
  };
}

export async function adminOverrideRequestFreeCredit(req, res) {
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
        : Number(defaults.defaultRequestFreeCredit ?? 0) ||
          CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultRequestFreeCredit;

    let businessAnchorId = String(
      req.body?.businessAnchorId || req.body?.businessId || "",
    ).trim();
    if (businessAnchorId && !Types.ObjectId.isValid(businessAnchorId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessAnchorId입니다.",
      });
    }

    if (!businessAnchorId) {
      const org = await BusinessAnchor.findOne({
        businessNumberNormalized: businessNumberDigits,
      })
        .select({ _id: 1, businessType: 1, primaryContactUserId: 1 })
        .lean();
      if (!org?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 사업자등록번호로 등록된 기공소를 찾을 수 없습니다.",
        });
      }
      if (!(await isFreeCreditEligibleBusiness(org))) {
        return res.status(400).json({
          success: false,
          message: "의뢰자 사업자에게만 무료 크레딧을 지급할 수 있습니다.",
        });
      }
      businessAnchorId = String(org._id);
    } else {
      const org = await BusinessAnchor.findById(businessAnchorId)
        .select({ _id: 1, businessType: 1, primaryContactUserId: 1 })
        .lean();
      if (!org?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 사업자등록번호로 등록된 기공소를 찾을 수 없습니다.",
        });
      }
      if (!(await isFreeCreditEligibleBusiness(org))) {
        return res.status(400).json({
          success: false,
          message: "의뢰자 사업자에게만 무료 크레딧을 지급할 수 있습니다.",
        });
      }
    }
    const businessId = businessAnchorId;

    const userIdRaw = String(req.body?.userId || "").trim();
    const userId =
      userIdRaw && Types.ObjectId.isValid(userIdRaw) ? userIdRaw : null;

    const grant = await FreeCreditGrant.create({
      type: "REQUEST_FREE_CREDIT",
      businessNumber: businessNumberDigits,
      amount,
      businessId: businessId,
      businessAnchorId,
      userId,
      isOverride: true,
      source: "admin",
      overrideReason: reason,
      grantedByUserId: req.user?._id || null,
    });

    const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
    if (!normalizedAmount) {
      return res.status(400).json({
        success: false,
        message: "지급 금액이 올바르지 않습니다.",
      });
    }

    const glResult = await postGeneralLedgerJournal({
      idempotencyKey: `gl:free_credit_grant:${String(grant._id)}`,
      eventType: "CHARGE_FREE_REQUEST",
      businessAnchorId,
      refType: "FREE_REQUEST_CREDIT",
      refId: grant._id,
      createdBy: req.user?._id || null,
      meta: {
        freeCreditGrantId: String(grant._id),
        bonusGrantId: String(grant._id), // legacy 호환 (앱 안정화 후 삭제 예정)
        reason,
        source: "admin_override",
      },
      lines: [
        {
          accountCode: "REQ_FREE_REQUEST_CREDIT",
          ownerRole: "requestor",
          ownerId: businessAnchorId,
          amount: normalizedAmount,
          amountExcludingVat: normalizedAmount,
          vatAmount: 0,
          amountIncludingVat: normalizedAmount,
          creditKind: "FREE_REQUEST",
          refType: "FREE_REQUEST_CREDIT",
          refId: grant._id,
        },
      ],
    });

    if (glResult?.posted) {
      await BusinessCreditBalance.updateOne(
        { businessAnchorId },
        {
          $inc: { bonusRequestCredit: normalizedAmount, version: 1 },
          $setOnInsert: {
            businessAnchorId,
            paidCredit: 0,
            bonusRequestCredit: 0,
            bonusShippingCredit: 0,
          },
        },
        { upsert: true },
      );
    }

    if (glResult?.journalId) {
      await FreeCreditGrant.updateOne(
        { _id: grant._id },
        { $set: { grantJournalId: String(glResult.journalId) } },
      );
    }

    if (glResult?.posted) {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId,
        balanceDelta: normalizedAmount,
        reason: "admin_request_free_credit",
        refId: glResult?.journalId || grant._id,
      });
    }

    return res.json({
      success: true,
      data: {
        freeCreditGrantId: grant._id,
        bonusGrantId: grant._id, // legacy 호환 (앱 안정화 후 삭제 예정)
        businessId,
        businessNumber: businessNumberDigits,
        amount: normalizedAmount,
        grantJournalId: glResult?.journalId || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "무료 의뢰크레딧 예외 지급 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminListFreeCreditGrants(req, res) {
  try {
    const typeInfo = normalizeFreeCreditGrantType(req.query?.type);
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

    const q = { type: { $in: typeInfo.queryTypes } };
    if (businessNumberDigits) {
      q.businessNumber = businessNumberDigits;
    }

    if (startDate && endDate) {
      q.createdAt = {
        $gte: startDate,
        $lte: new Date(endDate.getTime() + 86400000),
      };
    }

    const rows = await FreeCreditGrant.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await FreeCreditGrant.countDocuments(q);
    const businessIds = Array.from(
      new Set(
        (rows || [])
          .map((row) => String(row?.businessId || "").trim())
          .filter((id) => id && Types.ObjectId.isValid(id)),
      ),
    );
    const businesses = businessIds.length
      ? await BusinessAnchor.find({
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
          String(row?.businessAnchorId || "").trim() ||
          businessAnchorIdByBusinessId.get(businessId) ||
          "";
        const spentRows =
          businessAnchorId && Types.ObjectId.isValid(businessAnchorId)
            ? await LedgerLine.aggregate([
                {
                  $match: {
                    ownerRole: "requestor",
                    ownerId: new Types.ObjectId(businessAnchorId),
                    accountCode: {
                      $in: [
                        "REQ_PAID_CREDIT",
                        "REQ_FREE_REQUEST_CREDIT",
                        "REQ_FREE_SHIPPING_CREDIT",
                      ],
                    },
                    occurredAt: { $gte: row.createdAt },
                    amount: { $lt: 0 },
                  },
                },
                {
                  $lookup: {
                    from: LedgerJournal.collection.name,
                    localField: "journalId",
                    foreignField: "journalId",
                    as: "journalDoc",
                  },
                },
                {
                  $unwind: {
                    path: "$journalDoc",
                    preserveNullAndEmptyArrays: true,
                  },
                },
                {
                  $match: {
                    "journalDoc.eventType": {
                      $in: ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                    },
                  },
                },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ])
            : [];

        return {
          ...row,
          hasSpent: Array.isArray(spentRows) && spentRows.length > 0,
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
      message: "무료크레딧 지급 내역 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminCancelFreeCreditGrant(req, res) {
  try {
    const grantId = String(req.params?.id || "").trim();
    if (!Types.ObjectId.isValid(grantId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 freeCreditGrantId입니다.",
      });
    }

    const cancelReason = String(req.body?.reason || "").trim();
    if (!cancelReason) {
      return res.status(400).json({
        success: false,
        message: "지급 취소 사유(reason)를 입력해주세요.",
      });
    }

    const grant = await FreeCreditGrant.findById(grantId).lean();
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
    let businessAnchorId = String(grant.businessAnchorId || "").trim();
    if (!businessAnchorId && businessId && Types.ObjectId.isValid(businessId)) {
      businessAnchorId = businessId;
    }
    if (!businessAnchorId) {
      const businessByNumber = await BusinessAnchor.findOne({
        "metadata.businessNumber": formatBusinessNumber(grant.businessNumber),
      })
        .select({ _id: 1 })
        .lean();
      businessAnchorId = String(businessByNumber?._id || "").trim();
    }
    if (!businessAnchorId || !Types.ObjectId.isValid(businessAnchorId)) {
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

    const cancelCreditKind =
      ["FREE_SHIPPING_CREDIT", "SHIPPING_FREE_CREDIT"].includes(
        String(grant?.type || "").trim().toUpperCase(),
      )
        ? "FREE_SHIPPING"
        : "FREE_REQUEST";

    const glResult = await postGeneralLedgerJournal({
      idempotencyKey: `gl:free_credit_grant_cancel:${String(grant._id)}`,
      eventType: "ADJUST",
      businessAnchorId,
      refType: "FREE_CREDIT_CANCEL",
      refId: grant._id,
      createdBy: req.user?._id || null,
      meta: {
        freeCreditGrantId: String(grant._id),
        bonusGrantId: String(grant._id), // legacy 호환 (앱 안정화 후 삭제 예정)
        cancelReason,
        source: "admin_free_credit_cancel",
      },
      lines: [
        {
          accountCode:
            cancelCreditKind === "FREE_SHIPPING"
              ? "REQ_FREE_SHIPPING_CREDIT"
              : "REQ_FREE_REQUEST_CREDIT",
          ownerRole: "requestor",
          ownerId: businessAnchorId,
          amount: -amount,
          amountExcludingVat: -amount,
          vatAmount: 0,
          amountIncludingVat: -amount,
          creditKind: cancelCreditKind,
          refType: "FREE_CREDIT_CANCEL",
          refId: grant._id,
        },
      ],
    });

    if (glResult?.posted) {
      const bonusField =
        cancelCreditKind === "FREE_SHIPPING"
          ? "bonusShippingCredit"
          : "bonusRequestCredit";
      await BusinessCreditBalance.updateOne(
        { businessAnchorId },
        {
          $inc: { [bonusField]: -amount, version: 1 },
          $setOnInsert: {
            businessAnchorId,
            paidCredit: 0,
            bonusRequestCredit: 0,
            bonusShippingCredit: 0,
          },
        },
        { upsert: true },
      );
    }

    const canceledAt = new Date();

    await FreeCreditGrant.updateOne(
      { _id: grant._id },
      {
        $set: {
          canceledAt,
          canceledByUserId: req.user?._id || null,
          cancelReason,
          cancelJournalId: glResult?.journalId ? String(glResult.journalId) : null,
        },
      },
    );

    if (glResult?.posted) {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId,
        balanceDelta: -amount,
        reason: "admin_request_free_credit_cancel",
        refId: glResult?.journalId || grant._id,
      });
    }

    return res.json({
      success: true,
      data: {
        freeCreditGrantId: grant._id,
        bonusGrantId: grant._id, // legacy 호환 (앱 안정화 후 삭제 예정)
        cancelJournalId: glResult?.journalId || null,
        canceledAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "무료크레딧 지급 취소 중 오류가 발생했습니다.",
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
        : Number(defaults.defaultShippingFreeCredit ?? 0) ||
          CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultShippingFreeCredit;

    let businessAnchorId = String(
      req.body?.businessAnchorId || req.body?.businessId || "",
    ).trim();
    if (businessAnchorId && !Types.ObjectId.isValid(businessAnchorId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 businessAnchorId입니다.",
      });
    }

    if (!businessAnchorId) {
      const org = await BusinessAnchor.findOne({
        businessNumberNormalized: businessNumberDigits,
      })
        .select({ _id: 1, businessType: 1, primaryContactUserId: 1 })
        .lean();
      if (!org?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 사업자등록번호로 등록된 기공소를 찾을 수 없습니다.",
        });
      }
      if (!(await isFreeCreditEligibleBusiness(org))) {
        return res.status(400).json({
          success: false,
          message:
            "의뢰자 사업자에게만 배송비 무료 크레딧을 지급할 수 있습니다.",
        });
      }
      businessAnchorId = String(org._id);
    } else {
      const org = await BusinessAnchor.findById(businessAnchorId)
        .select({ _id: 1, businessType: 1, primaryContactUserId: 1 })
        .lean();
      if (!org?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 사업자등록번호로 등록된 기공소를 찾을 수 없습니다.",
        });
      }
      if (!(await isFreeCreditEligibleBusiness(org))) {
        return res.status(400).json({
          success: false,
          message:
            "의뢰자 사업자에게만 배송비 무료 크레딧을 지급할 수 있습니다.",
        });
      }
    }
    const businessId = businessAnchorId;

    const userIdRaw = String(req.body?.userId || "").trim();
    const userId =
      userIdRaw && Types.ObjectId.isValid(userIdRaw) ? userIdRaw : null;

    const grant = await FreeCreditGrant.create({
      type: "SHIPPING_FREE_CREDIT",
      businessNumber: businessNumberDigits,
      amount,
      businessId: businessId,
      businessAnchorId,
      userId,
      isOverride: true,
      source: "admin",
      overrideReason: reason,
      grantedByUserId: req.user?._id || null,
    });

    const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
    if (!normalizedAmount) {
      return res.status(400).json({
        success: false,
        message: "지급 금액이 올바르지 않습니다.",
      });
    }

    const glResult = await postGeneralLedgerJournal({
      idempotencyKey: `gl:free_credit_grant:${String(grant._id)}`,
      eventType: "CHARGE_FREE_SHIPPING",
      businessAnchorId,
      refType: "FREE_SHIPPING_CREDIT",
      refId: grant._id,
      createdBy: req.user?._id || null,
      meta: {
        freeCreditGrantId: String(grant._id),
        bonusGrantId: String(grant._id), // legacy 호환 (앱 안정화 후 삭제 예정)
        reason,
        source: "admin_override",
      },
      lines: [
        {
          accountCode: "REQ_FREE_SHIPPING_CREDIT",
          ownerRole: "requestor",
          ownerId: businessAnchorId,
          amount: normalizedAmount,
          amountExcludingVat: normalizedAmount,
          vatAmount: 0,
          amountIncludingVat: normalizedAmount,
          creditKind: "FREE_SHIPPING",
          refType: "FREE_SHIPPING_CREDIT",
          refId: grant._id,
        },
      ],
    });

    if (glResult?.posted) {
      await BusinessCreditBalance.updateOne(
        { businessAnchorId },
        {
          $inc: { bonusShippingCredit: normalizedAmount, version: 1 },
          $setOnInsert: {
            businessAnchorId,
            paidCredit: 0,
            bonusRequestCredit: 0,
            bonusShippingCredit: 0,
          },
        },
        { upsert: true },
      );
    }

    if (glResult?.journalId) {
      await FreeCreditGrant.updateOne(
        { _id: grant._id },
        { $set: { grantJournalId: String(glResult.journalId) } },
      );
    }

    if (glResult?.posted) {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId,
        balanceDelta: normalizedAmount,
        reason: "admin_free_shipping_credit",
        refId: glResult?.journalId || grant._id,
      });
    }

    return res.json({
      success: true,
      data: {
        freeCreditGrantId: grant._id,
        bonusGrantId: grant._id, // legacy 호환 (앱 안정화 후 삭제 예정)
        businessId,
        businessNumber: businessNumberDigits,
        amount: normalizedAmount,
        grantJournalId: glResult?.journalId || null,
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

// legacy 함수명 호환 export (앱 안정화 후 삭제 예정)
export const adminListBonusGrants = adminListFreeCreditGrants; // legacy 호환 (앱 안정화 후 삭제 예정)
export const adminOverrideWelcomeRequestCredit = adminOverrideRequestFreeCredit; // legacy 호환 (앱 안정화 후 삭제 예정)
export const adminOverrideWelcomeBonus = adminOverrideRequestFreeCredit; // legacy 호환 (앱 안정화 후 삭제 예정)
export const adminCancelBonusGrant = adminCancelFreeCreditGrant; // legacy 호환 (앱 안정화 후 삭제 예정)
