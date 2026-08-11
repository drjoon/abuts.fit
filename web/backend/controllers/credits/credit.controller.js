// change-log:
// - 2026-08-11: spend insights 추천 충전액을 월사용량/3 반올림으로 변경. 단위는 기공소 50만/치과 100만.
// - 2026-08-11: 기공소 기공크레딧 일별 정산·지급 내역 API 추가 (제조사 정산 UX 정렬).
// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/utils/creditChargeUnit.js
// - web/backend/utils/requestorCapabilities.js
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
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
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";

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

async function resolveLabSettlementScope(req) {
  const identity = await resolveCreditScopeIdentity(req);
  if (!identity?.businessAnchorId) {
    return {
      ok: false,
      status: 403,
      message: "사업자 정보가 설정되지 않았습니다.",
    };
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
    return {
      ok: false,
      status: 403,
      message: "기공소만 기공크레딧 정산을 이용할 수 있습니다.",
    };
  }

  return { ok: true, anchorId, anchor };
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
 * 기공소 기공크레딧(LAB_SETTLEMENT_CREDIT) 월 정산 인출.
 * 의뢰/배송 잔액과 분리. SETTLEMENT_PAYOUT으로 차감.
 */
export async function createLabSettlementPayout(req, res) {
  try {
    const scope = await resolveLabSettlementScope(req);
    if (!scope.ok) {
      return res.status(scope.status).json({
        success: false,
        message: scope.message,
      });
    }

    const { anchorId, anchor } = scope;

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
        message: "기공크레딧 잔액이 부족합니다.",
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
      message: "기공크레딧 정산에 실패했습니다.",
    });
  }
}

/**
 * 기공소 기공크레딧 일별 정산 집계 (GL LAB_SETTLEMENT_CREDIT, KST).
 * 관계별(active/referred/none) 적립 + 지급·조정을 일자별로 채운다.
 */
export async function getLabSettlementDailySummary(req, res) {
  try {
    const scope = await resolveLabSettlementScope(req);
    if (!scope.ok) {
      return res.status(scope.status).json({
        success: false,
        message: scope.message,
      });
    }

    const labAnchorId = new Types.ObjectId(scope.anchorId);
    const { fromYmd, toYmd, limit = "60" } = req.query;
    const l = Math.min(366, Math.max(1, parseInt(limit, 10) || 60));

    const occurredAtMatch = {};
    if (typeof fromYmd === "string" && fromYmd.trim()) {
      const from = new Date(`${fromYmd.trim()}T00:00:00.000+09:00`);
      if (!Number.isNaN(from.getTime())) {
        occurredAtMatch.$gte = from;
      }
    }
    if (typeof toYmd === "string" && toYmd.trim()) {
      const to = new Date(`${toYmd.trim()}T23:59:59.999+09:00`);
      if (!Number.isNaN(to.getTime())) {
        occurredAtMatch.$lte = to;
      }
    }

    const baseMatch = {
      ownerRole: "requestor",
      ownerId: labAnchorId,
      accountCode: "LAB_SETTLEMENT_CREDIT",
      ...(Object.keys(occurredAtMatch).length > 0
        ? { occurredAt: occurredAtMatch }
        : {}),
    };

    const rows = await LedgerLine.aggregate([
      { $match: baseMatch },
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
        $addFields: {
          ymd: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$occurredAt",
              timezone: "Asia/Seoul",
            },
          },
          baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
          eventType: { $ifNull: ["$journalDoc.eventType", ""] },
          relationshipKind: {
            $let: {
              vars: {
                raw: { $ifNull: ["$meta.relationshipKind", ""] },
              },
              in: {
                $cond: [
                  { $in: ["$$raw", ["active", "referred", "none"]] },
                  "$$raw",
                  {
                    $cond: [
                      {
                        $eq: [
                          { $ifNull: ["$meta.isTradingPartner", false] },
                          true,
                        ],
                      },
                      "active",
                      "none",
                    ],
                  },
                ],
              },
            },
          },
          settleRefKey: { $ifNull: ["$refId", "$journalId"] },
        },
      },
      {
        $group: {
          _id: {
            ymd: "$ymd",
            eventType: "$eventType",
            relationshipKind: "$relationshipKind",
            refId: "$settleRefKey",
          },
          amount: { $sum: "$baseAmount" },
        },
      },
      {
        $group: {
          _id: "$_id.ymd",
          earnPartnerAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$_id.eventType", "PRACTICE_TRANSFER_SPEND_COMMIT"] },
                    { $eq: ["$_id.relationshipKind", "active"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          earnPartnerCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$_id.eventType", "PRACTICE_TRANSFER_SPEND_COMMIT"] },
                    { $eq: ["$_id.relationshipKind", "active"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          earnReferredAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$_id.eventType", "PRACTICE_TRANSFER_SPEND_COMMIT"] },
                    { $eq: ["$_id.relationshipKind", "referred"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          earnReferredCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$_id.eventType", "PRACTICE_TRANSFER_SPEND_COMMIT"] },
                    { $eq: ["$_id.relationshipKind", "referred"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          earnNonPartnerAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$_id.eventType", "PRACTICE_TRANSFER_SPEND_COMMIT"] },
                    { $eq: ["$_id.relationshipKind", "none"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          earnNonPartnerCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$_id.eventType", "PRACTICE_TRANSFER_SPEND_COMMIT"] },
                    { $eq: ["$_id.relationshipKind", "none"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          // 롤백·기타 양수 적립(이벤트 타입 누락/이관) 폴백
          earnOtherAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        "$_id.eventType",
                        "PRACTICE_TRANSFER_SPEND_COMMIT",
                      ],
                    },
                    { $ne: ["$_id.eventType", "SETTLEMENT_PAYOUT"] },
                    { $ne: ["$_id.eventType", "ADJUST"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          earnOtherCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        "$_id.eventType",
                        "PRACTICE_TRANSFER_SPEND_COMMIT",
                      ],
                    },
                    { $ne: ["$_id.eventType", "SETTLEMENT_PAYOUT"] },
                    { $ne: ["$_id.eventType", "ADJUST"] },
                    { $gt: ["$amount", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          payoutAmount: {
            $sum: {
              $cond: [
                { $eq: ["$_id.eventType", "SETTLEMENT_PAYOUT"] },
                "$amount",
                0,
              ],
            },
          },
          adjustAmount: {
            $sum: {
              $cond: [
                { $eq: ["$_id.eventType", "ADJUST"] },
                "$amount",
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          ymd: "$_id",
          earnPartnerAmount: 1,
          earnPartnerCount: 1,
          earnReferredAmount: 1,
          earnReferredCount: 1,
          earnNonPartnerAmount: 1,
          earnNonPartnerCount: 1,
          earnOtherAmount: 1,
          earnOtherCount: 1,
          payoutAmount: 1,
          adjustAmount: 1,
        },
      },
    ]);

    const makeEmptyRow = (ymd) => ({
      ymd,
      earnPartnerAmount: 0,
      earnPartnerCount: 0,
      earnReferredAmount: 0,
      earnReferredCount: 0,
      earnNonPartnerAmount: 0,
      earnNonPartnerCount: 0,
      earnAmount: 0,
      earnCount: 0,
      payoutAmount: 0,
      adjustAmount: 0,
      netAmount: 0,
    });

    const recompute = (row) => {
      const partner = Number(row.earnPartnerAmount || 0);
      const referred = Number(row.earnReferredAmount || 0);
      const nonPartner = Number(row.earnNonPartnerAmount || 0);
      const other = Number(row.earnOtherAmount || 0);
      const partnerCount = Number(row.earnPartnerCount || 0);
      const referredCount = Number(row.earnReferredCount || 0);
      const nonPartnerCount = Number(row.earnNonPartnerCount || 0);
      const otherCount = Number(row.earnOtherCount || 0);
      const payout = Number(row.payoutAmount || 0);
      const adjust = Number(row.adjustAmount || 0);
      row.earnAmount = partner + referred + nonPartner + other;
      row.earnCount = partnerCount + referredCount + nonPartnerCount + otherCount;
      row.netAmount = row.earnAmount + payout + adjust;
      return row;
    };

    const rowMap = new Map();
    for (const row of rows || []) {
      const ymd = String(row?.ymd || "");
      if (!ymd) continue;
      rowMap.set(ymd, recompute({ ...makeEmptyRow(ymd), ...row }));
    }

    const parseKstYmd = (ymd) => {
      if (typeof ymd !== "string" || !ymd.trim()) return null;
      const d = new Date(`${ymd.trim()}T00:00:00.000+09:00`);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    };

    const formatKstYmd = (d) =>
      d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

    const todayYmd = getTodayYmdInKst();
    const requestedEndYmd =
      typeof toYmd === "string" && toYmd.trim() ? toYmd.trim() : todayYmd;
    const endYmd =
      todayYmd && requestedEndYmd > todayYmd ? todayYmd : requestedEndYmd;
    const endDate = parseKstYmd(endYmd) || new Date();

    const startDateByFrom =
      typeof fromYmd === "string" && fromYmd.trim()
        ? parseKstYmd(fromYmd.trim())
        : null;
    const startDate =
      startDateByFrom ||
      new Date(endDate.getTime() - (l - 1) * 24 * 60 * 60 * 1000);

    const fromMs = Math.min(startDate.getTime(), endDate.getTime());
    const toMs = Math.max(startDate.getTime(), endDate.getTime());

    const mergedRows = [];
    for (let t = toMs; t >= fromMs; t -= 24 * 60 * 60 * 1000) {
      const ymd = formatKstYmd(new Date(t));
      if (todayYmd && ymd > todayYmd) continue;
      const existing = rowMap.get(ymd);
      mergedRows.push(
        existing ? { ...makeEmptyRow(ymd), ...existing, ymd } : makeEmptyRow(ymd),
      );
      if (mergedRows.length >= l) break;
    }

    return res.status(200).json({
      success: true,
      data: mergedRows,
    });
  } catch (error) {
    console.error("getLabSettlementDailySummary error:", error);
    return res.status(500).json({
      success: false,
      message: "기공소 일별 정산 집계에 실패했습니다.",
    });
  }
}

/**
 * 기공소 기공크레딧 정산 지급(입금) 내역 — SETTLEMENT_PAYOUT 라인.
 */
export async function listLabSettlementPayouts(req, res) {
  try {
    const scope = await resolveLabSettlementScope(req);
    if (!scope.ok) {
      return res.status(scope.status).json({
        success: false,
        message: scope.message,
      });
    }

    const labAnchorId = new Types.ObjectId(scope.anchorId);
    const { page = 1, limit = 50, from, to, q } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (p - 1) * l;

    const occurredAtMatch = {};
    if (typeof from === "string" && from.trim()) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(from.trim())
        ? new Date(`${from.trim()}T00:00:00.000+09:00`)
        : new Date(from);
      if (!Number.isNaN(d.getTime())) {
        occurredAtMatch.$gte = d;
      }
    }
    if (typeof to === "string" && to.trim()) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(to.trim())
        ? new Date(`${to.trim()}T23:59:59.999+09:00`)
        : new Date(to);
      if (!Number.isNaN(d.getTime())) {
        occurredAtMatch.$lte = d;
      }
    }

    const match = {
      ownerRole: "requestor",
      ownerId: labAnchorId,
      accountCode: "LAB_SETTLEMENT_CREDIT",
      ...(Object.keys(occurredAtMatch).length > 0
        ? { occurredAt: occurredAtMatch }
        : {}),
    };

    const rx =
      typeof q === "string" && q.trim()
        ? new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : null;

    const pipeline = [
      { $match: match },
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
          $or: [
            { "journalDoc.eventType": "SETTLEMENT_PAYOUT" },
            { refType: "LAB_SETTLEMENT_PAYOUT" },
          ],
        },
      },
    ];

    if (rx) {
      pipeline.push({
        $match: {
          $or: [
            { journalId: rx },
            { "journalDoc.meta.payoutAccount.bankName": rx },
            { "journalDoc.meta.payoutAccount.holderName": rx },
            { "journalDoc.meta.payoutAccount.accountNumber": rx },
            { "meta.displayKind": rx },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: l },
            {
              $project: {
                _id: 1,
                amount: {
                  $abs: { $ifNull: ["$amountExcludingVat", "$amount"] },
                },
                occurredAt: 1,
                journalId: 1,
                status: { $literal: "CONFIRMED" },
                note: {
                  $let: {
                    vars: {
                      acct: {
                        $ifNull: ["$journalDoc.meta.payoutAccount", {}],
                      },
                    },
                    in: {
                      $trim: {
                        input: {
                          $concat: [
                            { $ifNull: ["$$acct.bankName", ""] },
                            " ",
                            { $ifNull: ["$$acct.accountNumber", ""] },
                            " ",
                            { $ifNull: ["$$acct.holderName", ""] },
                          ],
                        },
                      },
                    },
                  },
                },
                externalId: "$journalId",
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    );

    const [agg] = await LedgerLine.aggregate(pipeline);
    const items = Array.isArray(agg?.items) ? agg.items : [];
    const total = Number(agg?.total?.[0]?.count || 0);

    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page: p,
        limit: l,
        total,
        totalPages: Math.ceil(total / l) || 0,
      },
    });
  } catch (error) {
    console.error("listLabSettlementPayouts error:", error);
    return res.status(500).json({
      success: false,
      message: "기공소 정산 지급 내역 조회에 실패했습니다.",
    });
  }
}

