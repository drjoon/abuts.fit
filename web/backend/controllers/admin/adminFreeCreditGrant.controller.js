// related files:
// - web/backend/rules.md
// - web/backend/modules/admin/admin.routes.js
// - web/backend/models/freeCreditGrant.model.js

// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/generalLedger.service.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";

import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";

/** 신규 무료 크레딧 지급 중단(옵션 B). list/cancel은 유지. */
const FREE_CREDIT_GRANT_DISABLED_MESSAGE =
  "신규 무료 크레딧 지급은 중단되었습니다. 기존 잔액·지급 이력 조회 및 회수만 가능합니다.";

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
  if (!t || t === "REQUEST_FREE_CREDIT") {
    return {
      queryTypes: ["REQUEST_FREE_CREDIT"],
      canonicalType: "REQUEST_FREE_CREDIT",
    };
  }
  if (t === "SHIPPING_FREE_CREDIT") {
    return {
      queryTypes: ["SHIPPING_FREE_CREDIT"],
      canonicalType: "SHIPPING_FREE_CREDIT",
    };
  }
  return {
    queryTypes: [t],
    canonicalType: t,
  };
}

export async function adminOverrideRequestFreeCredit(req, res) {
  return res.status(403).json({
    success: false,
    message: FREE_CREDIT_GRANT_DISABLED_MESSAGE,
  });
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
      String(grant?.type || "").trim().toUpperCase() ===
      "SHIPPING_FREE_CREDIT"
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
  return res.status(403).json({
    success: false,
    message: FREE_CREDIT_GRANT_DISABLED_MESSAGE,
  });
}
