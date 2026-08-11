// change-log:
// - 2026-08-11: spend insights 추천 충전액을 월사용량/3 반올림으로 변경. 단위는 기공소 50만/치과 100만.
// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/utils/creditChargeUnit.js
// - web/backend/utils/requestorCapabilities.js
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import {
  normalizeRequestorKind,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";
import {
  MAX_CHARGE_SUPPLY,
  resolveCreditChargeUnit,
} from "../../utils/creditChargeUnit.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";

// NOTE:
// - /api/credits/balance 는 GL 집계 SSOT를 즉시 반영해야 하므로
//   프로세스 메모리 캐시를 사용하지 않는다.

function roundNearestUnit(amount, unit) {
  const n = Number(amount);
  const u = Number(unit);
  if (!Number.isFinite(n) || !Number.isFinite(u) || u <= 0) return 0;
  return Math.round(n / u) * u;
}

async function resolveCreditScopeIdentity(req) {
  const directBusinessAnchorId = req.user?.businessAnchorId;
  if (directBusinessAnchorId) {
    return {
      businessAnchorId: String(directBusinessAnchorId),
    };
  }

  const userId = req.user?._id;
  if (!userId) {
    return { businessAnchorId: "" };
  }

  const anchor = await BusinessAnchor.findOne({
    $or: [
      { primaryContactUserId: userId },
      { owners: userId },
      { members: userId },
    ],
  })
    .select({ _id: 1 })
    .lean();

  if (anchor?._id) {
    const resolvedBusinessAnchorId = String(anchor._id);
    console.error("[CREDIT_BALANCE_SCOPE_RESOLVED] resolved from anchor", {
      userId: String(userId),
      resolvedBusinessAnchorId,
      originalUserBusinessAnchorId: req.user?.businessAnchorId
        ? String(req.user.businessAnchorId)
        : null,
    });
    return {
      businessAnchorId: resolvedBusinessAnchorId,
    };
  }

  const requestWithBusiness = await Request.findOne({ requestor: userId })
    .sort({ createdAt: -1, _id: -1 })
    .select({ businessAnchorId: 1, requestId: 1 })
    .lean();

  if (requestWithBusiness?.businessAnchorId) {
    const resolvedBusinessAnchorId = String(
      requestWithBusiness.businessAnchorId || "",
    );
    console.error("[CREDIT_BALANCE_SCOPE_RESOLVED] resolved from request", {
      userId: String(userId),
      resolvedBusinessAnchorId,
      requestId: String(requestWithBusiness.requestId || ""),
      originalUserBusinessAnchorId: req.user?.businessAnchorId
        ? String(req.user.businessAnchorId)
        : null,
    });
    return {
      businessAnchorId: resolvedBusinessAnchorId,
    };
  }

  return { businessAnchorId: "" };
}

async function getCreditScope(req) {
  const { businessAnchorId } = await resolveCreditScopeIdentity(req);
  if (!businessAnchorId) {
    throw new Error("사업자 정보가 설정되지 않았습니다.");
  }
  return { businessAnchorId };
}

function buildLedgerQuery(scope) {
  return { businessAnchorId: scope.businessAnchorId };
}

async function getBalanceBreakdown(scope) {
  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId: scope.businessAnchorId,
    upsertIfMissing: true,
  });

  return {
    balance: Number(snapshot?.balance || 0),
    paidCredit: Number(snapshot?.paidCredit || 0),
    freeRequestCredit: Number(snapshot?.freeRequestCredit || 0),
    freeShippingCredit: Number(snapshot?.freeShippingCredit || 0),
    settlementCredit: Number(snapshot?.settlementCredit || 0),
  };
}

export async function getMyCreditBalance(req, res) {
  const identity = await resolveCreditScopeIdentity(req);
  if (!identity?.businessAnchorId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const scope = { businessAnchorId: String(identity.businessAnchorId || "") };
  const balanceData = await getBalanceBreakdown(scope);

  return res.json({
    success: true,
    data: balanceData,
  });
}

export async function getMyCreditSpendInsights(req, res) {
  const identity = await resolveCreditScopeIdentity(req);
  if (!identity?.businessAnchorId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  console.error("[CREDIT_SPEND_INSIGHTS_SCOPE]", {
    userId: req.user?._id ? String(req.user._id) : null,
    userBusinessAnchorId: req.user?.businessAnchorId
      ? String(req.user.businessAnchorId)
      : null,
    resolvedBusinessAnchorId: String(scope.businessAnchorId || ""),
  });

  const anchor = await BusinessAnchor.findById(scope.businessAnchorId)
    .select({ requestorKind: 1 })
    .lean();
  const requestorKind =
    normalizeRequestorKind(anchor?.requestorKind) ||
    normalizeRequestorKind(req.user?.requestorKind) ||
    "lab";
  const chargeUnit = resolveCreditChargeUnit(requestorKind);
  const MIN = chargeUnit;
  const MAX = MAX_CHARGE_SUPPLY;
  const WINDOW_DAYS = 90;
  const now = new Date();
  // KST 기준 90일 전
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayKst = new Date(`${kstDate}T00:00:00+09:00`);
  todayKst.setDate(todayKst.getDate() - WINDOW_DAYS);
  const since = todayKst;

  const ownerId = new Types.ObjectId(String(scope.businessAnchorId));

  const rows = await LedgerLine.aggregate([
    {
      $match: {
        ownerRole: "requestor",
        ownerId,
        accountCode: {
          $in: [
            "REQ_PAID_CREDIT",
            "REQ_FREE_REQUEST_CREDIT",
            "REQ_FREE_SHIPPING_CREDIT",
          ],
        },
        occurredAt: { $gte: since },
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
    {
      $group: {
        _id: null,
        spentSupply: {
          $sum: {
            $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0],
          },
        },
      },
    },
  ]);

  const spentSupply90 = Number(rows?.[0]?.spentSupply || 0);
  const avgDailySpendSupply =
    spentSupply90 > 0 ? spentSupply90 / WINDOW_DAYS : 0;
  const avgMonthlySpendSupply = spentSupply90 > 0 ? spentSupply90 / 3 : 0;

  const estimatedDaysFor500k =
    avgDailySpendSupply > 0
      ? Math.max(1, Math.ceil(chargeUnit / avgDailySpendSupply))
      : null;

  // 2회차 기본 배수 3의 근거: 단위≈월사용량 1/3. insights는 추천 버튼(한 달분)용.
  const recommendedChargeSupply = roundNearestUnit(
    avgMonthlySpendSupply / 3,
    chargeUnit,
  );
  const recommendedOneMonthSupply = roundNearestUnit(
    avgMonthlySpendSupply,
    chargeUnit,
  );
  const recommendedThreeMonthsSupply = roundNearestUnit(
    avgMonthlySpendSupply * 3,
    chargeUnit,
  );

  const chargeSupply = Math.min(
    MAX,
    Math.max(MIN, recommendedChargeSupply || 0),
  );
  const oneMonthSupply = Math.min(
    MAX,
    Math.max(MIN, recommendedOneMonthSupply || 0),
  );
  const threeMonthsSupply = Math.min(
    MAX,
    Math.max(MIN, recommendedThreeMonthsSupply || 0),
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
      chargeUnit,
      requestorKind,
      recommended: {
        // chargeSupply = 월사용량/3(단위). UI 기본 배수는 프론트에서 3 고정.
        // oneMonthSupply는 호환용으로 chargeSupply와 동일. 한 달분은 oneMonthFullSupply.
        chargeSupply,
        oneMonthSupply: chargeSupply,
        oneMonthFullSupply: oneMonthSupply,
        threeMonthsSupply,
      },
    },
  });
}

/**
 * 기공소 결제크레딧(LAB_SETTLEMENT_CREDIT) 월 정산 인출.
 * 의뢰/배송 잔액과 분리. SETTLEMENT_PAYOUT으로 차감.
 */
export async function createLabSettlementPayout(req, res) {
  try {
    const identity = await resolveCreditScopeIdentity(req);
    if (!identity?.businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const anchorId = String(identity.businessAnchorId);
    const anchor = await BusinessAnchor.findById(anchorId)
      .select({
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        businessType: 1,
        status: 1,
        payoutAccount: 1,
        name: 1,
      })
      .lean();
    const freshUser = await User.findById(req.user?._id)
      .select({
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        role: 1,
      })
      .lean();
    const profile = resolveRequestorProfile({
      anchorKind: anchor?.requestorKind,
      anchorServices: anchor?.requestorServices,
      anchorCaps: anchor?.requestorCapabilities,
      userKind: freshUser?.requestorKind ?? req.user?.requestorKind,
      userServices: freshUser?.requestorServices ?? req.user?.requestorServices,
      userCaps:
        freshUser?.requestorCapabilities ?? req.user?.requestorCapabilities,
      userRole: freshUser?.role || req.user?.role,
      businessVerified: String(anchor?.status || "") === "verified",
    });
    if (
      !anchor ||
      String(anchor.businessType || "") !== "requestor" ||
      normalizeRequestorKind(profile.kind) !== "lab"
    ) {
      return res.status(403).json({
        success: false,
        message: "기공소만 결제크레딧 정산을 요청할 수 있습니다.",
      });
    }

    const amount = Math.round(Number(req.body?.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "정산 금액이 올바르지 않습니다.",
      });
    }

    const snapshot = await getBusinessCreditBalanceSnapshot({
      businessAnchorId: anchorId,
    });
    const available = Number(snapshot?.settlementCredit || 0);
    if (available < amount) {
      return res.status(400).json({
        success: false,
        message: "결제크레딧 잔액이 부족합니다.",
        data: { available, requested: amount },
      });
    }

    const payoutAccount = anchor.payoutAccount || {};
    if (
      !String(payoutAccount.bankName || "").trim() ||
      !String(payoutAccount.accountNumber || "").trim() ||
      !String(payoutAccount.holderName || "").trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "정산 입금 계좌를 사업자 설정에서 먼저 등록해주세요.",
      });
    }

    const now = new Date();
    const idempotencyKey =
      String(req.body?.idempotencyKey || "").trim() ||
      `gl:lab_settlement_payout:${anchorId}:${amount}:${now.getTime()}`;

    const posted = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType: "SETTLEMENT_PAYOUT",
      businessAnchorId: anchorId,
      refType: "LAB_SETTLEMENT_PAYOUT",
      refId: null,
      occurredAt: now,
      createdBy: req.user?._id || null,
      meta: {
        payoutTargetRole: "requestor",
        payoutKind: "lab_settlement",
        payoutAmount: amount,
        payoutAccount: {
          bankName: payoutAccount.bankName,
          accountNumber: payoutAccount.accountNumber,
          holderName: payoutAccount.holderName,
        },
      },
      lines: [
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: anchorId,
          amount: -amount,
          amountExcludingVat: -amount,
          vatAmount: 0,
          amountIncludingVat: -amount,
          creditKind: "SETTLEMENT",
          refType: "LAB_SETTLEMENT_PAYOUT",
          refId: null,
          meta: {
            payoutKind: "lab_settlement",
            displayKind: "lab_settlement_payout",
          },
        },
      ],
    });

    return res.status(200).json({
      success: true,
      data: {
        journalId: posted?.journalId || null,
        amount,
        settlementCreditAfter: available - amount,
        payoutAccount: {
          bankName: payoutAccount.bankName,
          accountNumber: payoutAccount.accountNumber,
          holderName: payoutAccount.holderName,
        },
        idempotent: Boolean(posted?.idempotent),
      },
    });
  } catch (error) {
    console.error("createLabSettlementPayout error:", error);
    return res.status(500).json({
      success: false,
      message: "결제크레딧 정산에 실패했습니다.",
    });
  }
}

