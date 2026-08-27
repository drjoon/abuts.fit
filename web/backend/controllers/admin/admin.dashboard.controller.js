// related files:
// - web/backend/rules.md
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/unsupportedAbutmentDashboardStats.service.js
// - web/frontend/src/features/settings/tabs/RequestTab.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-08-21: unsupportedAbutmentStats — 미제공(요청중) 어벗 대시보드 집계.
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import AdminHappyCallCompletion from "../../models/adminHappyCallCompletion.model.js";
import AdminHappyCallMemoDraft from "../../models/adminHappyCallMemoDraft.model.js";
import {
  getDateRangeFromQuery,
  getMongoHealth,
} from "./admin.shared.controller.js";
import {
  buildMonitoringByStatusFromAssignedLikeSummary,
  getAdminPricingStatsSummary,
  getAssignedLikeDashboardSummary,
} from "../../services/requestDashboardStats.service.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "../../services/requestDashboardCache.service.js";
import { collectHappyCallReasonCodes } from "./happyCallReasons.js";
import { buildUnsupportedAbutmentDashboardStats } from "../../services/unsupportedAbutmentDashboardStats.service.js";

const HAPPY_CALL_REASON_META = {
  first_completion_this_week: {
    label: "최근 가입 후 첫 거래 완료(이번 주)",
    description:
      "첫 완료 직후 제품 만족도·재주문 의향을 확인하면 장기 전환율을 높일 수 있습니다.",
    severity: "high",
  },
  first_completion_after_signup: {
    label: "가입 후 첫 주문 완료",
    description:
      "첫 주문 완료 직후 품질 만족도와 재주문 의향을 확인하면 재구매 전환에 도움이 됩니다.",
    severity: "high",
  },
  no_completion_30d_from_join: {
    label: "가입 1개월 경과, 완료 0건",
    description:
      "온보딩 이탈 가능성이 높은 구간입니다. 주문 장애 요인을 파악하고 첫 완료를 유도하세요.",
    severity: "high",
  },
  dormant_60d_since_last_completion: {
    label: "최근 거래(완료) 2개월 이상 공백",
    description:
      "휴면 전환 위험 고객입니다. 품질/납기/가격 이슈를 점검해 재활성화를 시도하세요.",
    severity: "high",
  },
  high_cancel_rate_30d: {
    label: "최근 30일 취소율 높음",
    description:
      "사양 입력/커뮤니케이션/납기 관련 불편 가능성이 있습니다.",
    severity: "medium",
  },
  recent_unmachinable_14d: {
    label: "최근 14일 가공불가 판정 발생",
    description:
      "임플란트 정보 입력/데이터 품질 이슈 가능성이 있어 사전 안내가 필요합니다.",
    severity: "medium",
  },
  active_but_no_completion_30d: {
    label: "최근 주문은 있으나 30일 내 완료 없음",
    description:
      "진행 정체 가능성이 있습니다. 병목 단계와 체감 리드타임을 확인하세요.",
    severity: "medium",
  },
  new_signup_no_first_request_14d: {
    label: "가입 14일 경과, 첫 주문 없음",
    description:
      "초기 사용 가이드/샘플 안내 등 온보딩 지원이 필요한 상태입니다.",
    severity: "low",
  },
  custom_design_software: {
    label: "디자인 소프트웨어 직접 입력(custom) 사용",
    description:
      "설정값이 표준 선택(3Shape/ExoCAD) 외 직접 입력입니다. 더 정확한 제품을 위해 작업 방식/파일 구성 안내 해피콜이 필요합니다.",
    severity: "medium",
  },
};

const HAPPY_CALL_REASON_PRIORITY = {
  high: 3,
  medium: 2,
  low: 1,
};

// 정책: 해피콜 완료 1회로 해당 의뢰자(사업체)의 모든 해피콜 사유를 해소한 것으로 본다.
const HAPPY_CALL_GLOBAL_REASON_CODE = "__all__";
const HAPPY_CALL_SUPPRESS_DAYS = 3650;

const isGlobalHappyCallReasonCode = (reasonCodeRaw) => {
  const reasonCode = String(reasonCodeRaw || "").trim();
  return (
    reasonCode === HAPPY_CALL_GLOBAL_REASON_CODE ||
    reasonCode.startsWith(`${HAPPY_CALL_GLOBAL_REASON_CODE}:`)
  );
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toIsoOrNull = (value) => {
  const d = toDateOrNull(value);
  return d ? d.toISOString() : null;
};

const getCurrentKstWeekRangeUtc = () => {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstDay = kstNow.getUTCDay();
  const daysFromMonday = (kstDay + 6) % 7;

  const kstWeekStart = new Date(kstNow);
  kstWeekStart.setUTCHours(0, 0, 0, 0);
  kstWeekStart.setUTCDate(kstWeekStart.getUTCDate() - daysFromMonday);

  const kstWeekEnd = new Date(kstWeekStart);
  kstWeekEnd.setUTCDate(kstWeekEnd.getUTCDate() + 7);

  return {
    startUtc: new Date(kstWeekStart.getTime() - 9 * 60 * 60 * 1000),
    endUtc: new Date(kstWeekEnd.getTime() - 9 * 60 * 60 * 1000),
  };
};

/**
 * 의뢰 단위 크레딧 순소비 ↔ 수익 귀속 합계 점검.
 * 순소비는 부호 있는 합(`-(REQ_* amount)`)을 쓴다.
 * (소비=음수, 환불/ADJUST 복구=양수. 음수만 절대화하면 환불을 누락해 false positive 발생)
 */
async function buildCreditRevenueFlowMismatchSummary({ since }) {
  const [consumedRows, revenueRows] = await Promise.all([
    LedgerLine.aggregate([
      {
        $match: {
          occurredAt: { $gte: since },
          refType: "REQUEST",
          refId: { $ne: null },
          accountCode: { $in: ["REQ_PAID_CREDIT", "REQ_FREE_REQUEST_CREDIT"] },
          ownerRole: "requestor",
        },
      },
      {
        $group: {
          _id: "$refId",
          netConsumed: {
            $sum: {
              $multiply: [
                { $ifNull: ["$amountExcludingVat", "$amount"] },
                -1,
              ],
            },
          },
        },
      },
      { $match: { netConsumed: { $gt: 0 } } },
    ]),
    LedgerLine.aggregate([
      {
        $match: {
          occurredAt: { $gte: since },
          refType: "REQUEST",
          refId: { $ne: null },
          accountCode: {
            $in: ["REV_MANUFACTURER", "REV_DEVOPS", "REV_SALESMAN", "REV_ADMIN"],
          },
        },
      },
      {
        $group: {
          _id: "$refId",
          earnBase: {
            $sum: { $ifNull: ["$amountExcludingVat", "$amount"] },
          },
        },
      },
    ]),
  ]);

  if (!consumedRows.length) {
    return {
      checkedRequestCount: 0,
      mismatchCount: 0,
      totalNetConsumed: 0,
      totalEarnBase: 0,
      topMismatches: [],
    };
  }

  const earnMap = new Map(
    (revenueRows || []).map((row) => [String(row?._id || ""), Number(row?.earnBase || 0)]),
  );

  const mismatches = [];
  let totalNetConsumed = 0;
  let totalEarnBase = 0;

  for (const row of consumedRows) {
    const requestMongoId = String(row?._id || "");
    const netConsumed = Number(row?.netConsumed || 0);
    const earnBase = Number(earnMap.get(requestMongoId) || 0);
    const gap = Math.round(netConsumed - earnBase);

    totalNetConsumed += netConsumed;
    totalEarnBase += earnBase;

    if (Math.abs(gap) > 1) {
      mismatches.push({ requestMongoId, netConsumed, earnBase, gap });
    }
  }

  mismatches.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const top = mismatches.slice(0, 5);
  const topIds = top.map((it) => it.requestMongoId).filter(Boolean);

  const requestDocs = topIds.length
    ? await Request.find({ _id: { $in: topIds } })
        .select({ _id: 1, requestId: 1 })
        .lean()
    : [];

  const requestNoById = new Map(
    (requestDocs || []).map((d) => [String(d?._id || ""), String(d?.requestId || "")]),
  );

  const topMismatches = top.map((it) => ({
    requestMongoId: it.requestMongoId,
    requestId: requestNoById.get(it.requestMongoId) || null,
    netConsumed: it.netConsumed,
    earnBase: it.earnBase,
    gap: it.gap,
  }));

  return {
    checkedRequestCount: consumedRows.length,
    mismatchCount: mismatches.length,
    totalNetConsumed: Math.round(totalNetConsumed),
    totalEarnBase: Math.round(totalEarnBase),
    topMismatches,
  };
}

export async function getDashboardStats(req, res) {
  try {
    const periodKey = String(req.query?.period || "30d").trim() || "30d";
    const forceFresh =
      String(req.query?.fresh || "").trim() === "1" ||
      String(req.query?.fresh || "").trim().toLowerCase() === "true";
    const cacheKey = `admin-dashboard:v4:${periodKey}`;
    if (!forceFresh) {
      const cached = getRequestPerfCacheValue(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }
    }

    const payload = forceFresh
      ? await buildAdminDashboardPayload(req)
      : await withRequestPerfInFlight(cacheKey, async () => {
          return buildAdminDashboardPayload(req);
        });

    setRequestPerfCacheValue(cacheKey, payload, 20 * 1000);
    return res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "대시보드 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function buildAdminDashboardPayload(req) {
    const systemAlerts = [];
    const mongoHealth = await getMongoHealth();
    if (!mongoHealth?.ok) {
      systemAlerts.push({
        id: "mongo:down",
        type: "warning",
        message: mongoHealth?.message || "MongoDB 상태 확인 실패",
        date: new Date().toISOString(),
      });
    } else if (mongoHealth.status !== "ok") {
      systemAlerts.push({
        id: "mongo:warning",
        type: "warning",
        message: mongoHealth.message,
        date: new Date().toISOString(),
      });
    }

    const { start, end } = getDateRangeFromQuery(req);

    const createdAtFilter = { createdAt: { $gte: start, $lte: end } };
    const requestBaseFilter = {
      "caseInfos.implantBrand": { $exists: true, $ne: "" },
    };

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const { startUtc: weekStartUtc, endUtc: weekEndUtc } =
      getCurrentKstWeekRangeUtc();

    // 모든 핵심 통계를 동일 집계식으로 병렬 조회
    const [
      userStats,
      totalUsers,
      activeUsers,
      requestorBusinessCount,
      assignedLikeSummary,
      pricingSummary,
      unmachinableRows,
      requestorAnchors,
      practiceTransferStatsRaw,
      practiceTransferTopPracticesRaw,
      practiceTransferTopLabsRaw,
      practiceTransferRecentRaw,
      unsupportedAbutmentStats,
    ] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      User.countDocuments({ role: "requestor" }),
      User.countDocuments({ role: "requestor", active: true }),
      BusinessAnchor.countDocuments({ businessType: "requestor" }),
      getAssignedLikeDashboardSummary({
        baseFilter: requestBaseFilter,
        dateFilter: createdAtFilter,
      }),
      getAdminPricingStatsSummary({ start, end }),
      Request.find({
        ...requestBaseFilter,
        ...createdAtFilter,
        $or: [
          { "rnd.unmachinablePotentialAt": { $ne: null } },
          { "rnd.unmachinableAt": { $ne: null } },
          { "rnd.unmachinableConfirmedAt": { $ne: null } },
        ],
      })
        .select({
          requestId: 1,
          title: 1,
          manufacturerStage: 1,
          createdAt: 1,
          "caseInfos.clinicName": 1,
          "caseInfos.patientName": 1,
          "caseInfos.tooth": 1,
          rnd: 1,
          businessAnchorId: 1,
          shippingMode: 1,
          finalShipping: 1,
          originalShipping: 1,
        })
        .sort({
          "rnd.unmachinableConfirmedAt": -1,
          "rnd.unmachinableAt": -1,
          "rnd.unmachinablePotentialAt": -1,
          createdAt: -1,
        })
        .limit(10)
        .lean(),
      BusinessAnchor.find({ businessType: "requestor", status: { $ne: "merged" } })
        .select({
          _id: 1,
          name: 1,
          businessNumberNormalized: 1,
          metadata: 1,
          requestSettings: 1,
          createdAt: 1,
          status: 1,
        })
        .lean(),
      PracticeTransfer.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $project: {
            status: 1,
            fileCount: { $size: { $ifNull: ["$files", []] } },
            unreadFlag: {
              $cond: [{ $eq: ["$requestorReadAt", null] }, 1, 0],
            },
            practiceKey: {
              $cond: [
                { $ifNull: ["$practiceBusinessAnchorId", false] },
                { $toString: "$practiceBusinessAnchorId" },
                null,
              ],
            },
            labKey: {
              $let: {
                vars: {
                  targetLabNameTrimmed: {
                    $trim: {
                      input: { $ifNull: ["$targetLabName", ""] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $ifNull: ["$targetLabAnchorId", false] },
                    { $concat: ["a:", { $toString: "$targetLabAnchorId" }] },
                    {
                      $cond: [
                        { $gt: [{ $strLenCP: "$$targetLabNameTrimmed" }, 0] },
                        { $concat: ["n:", "$$targetLabNameTrimmed"] },
                        null,
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalTransfers: { $sum: 1 },
            activeTransfers: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
            },
            canceledTransfers: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["deleted", "canceled"]] },
                  1,
                  0,
                ],
              },
            },
            totalFiles: { $sum: "$fileCount" },
            unreadTransfers: { $sum: "$unreadFlag" },
            practiceKeys: { $addToSet: "$practiceKey" },
            labKeys: { $addToSet: "$labKey" },
          },
        },
      ]),
      PracticeTransfer.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $project: {
            practiceBusinessAnchorId: 1,
            fileCount: { $size: { $ifNull: ["$files", []] } },
          },
        },
        {
          $match: {
            practiceBusinessAnchorId: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$practiceBusinessAnchorId",
            transferCount: { $sum: 1 },
            fileCount: { $sum: "$fileCount" },
          },
        },
        { $sort: { transferCount: -1, fileCount: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: "businessanchors",
            localField: "_id",
            foreignField: "_id",
            as: "practiceAnchor",
          },
        },
        {
          $project: {
            _id: 0,
            practiceAnchorId: { $toString: "$_id" },
            practiceName: {
              $let: {
                vars: {
                  nm: {
                    $trim: {
                      input: {
                        $ifNull: [{ $arrayElemAt: ["$practiceAnchor.name", 0] }, ""],
                      },
                    },
                  },
                },
                in: {
                  $cond: [{ $gt: [{ $strLenCP: "$$nm" }, 0] }, "$$nm", "-"]
                },
              },
            },
            transferCount: 1,
            fileCount: 1,
          },
        },
      ]),
      PracticeTransfer.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $project: {
            targetLabAnchorId: 1,
            targetLabName: { $trim: { input: { $ifNull: ["$targetLabName", ""] } } },
            fileCount: { $size: { $ifNull: ["$files", []] } },
          },
        },
        {
          $addFields: {
            labKey: {
              $cond: [
                { $ifNull: ["$targetLabAnchorId", false] },
                { $concat: ["a:", { $toString: "$targetLabAnchorId" }] },
                {
                  $cond: [
                    { $gt: [{ $strLenCP: "$targetLabName" }, 0] },
                    { $concat: ["n:", "$targetLabName"] },
                    null,
                  ],
                },
              ],
            },
          },
        },
        {
          $match: {
            labKey: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$labKey",
            targetLabAnchorId: { $first: "$targetLabAnchorId" },
            targetLabName: { $first: "$targetLabName" },
            transferCount: { $sum: 1 },
            fileCount: { $sum: "$fileCount" },
          },
        },
        { $sort: { transferCount: -1, fileCount: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: "businessanchors",
            localField: "targetLabAnchorId",
            foreignField: "_id",
            as: "labAnchor",
          },
        },
        {
          $project: {
            _id: 0,
            labKey: "$_id",
            labAnchorId: {
              $cond: [
                { $ifNull: ["$targetLabAnchorId", false] },
                { $toString: "$targetLabAnchorId" },
                "",
              ],
            },
            labName: {
              $let: {
                vars: {
                  anchorName: {
                    $trim: {
                      input: {
                        $ifNull: [{ $arrayElemAt: ["$labAnchor.name", 0] }, ""],
                      },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $gt: [{ $strLenCP: "$$anchorName" }, 0] },
                    "$$anchorName",
                    {
                      $cond: [
                        { $gt: [{ $strLenCP: "$targetLabName" }, 0] },
                        "$targetLabName",
                        "-",
                      ],
                    },
                  ],
                },
              },
            },
            transferCount: 1,
            fileCount: 1,
          },
        },
      ]),
      PracticeTransfer.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $project: {
            transferId: 1,
            status: 1,
            createdAt: 1,
            targetLabName: { $trim: { input: { $ifNull: ["$targetLabName", ""] } } },
            practiceBusinessAnchorId: 1,
            fileCount: { $size: { $ifNull: ["$files", []] } },
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 30 },
        {
          $lookup: {
            from: "businessanchors",
            localField: "practiceBusinessAnchorId",
            foreignField: "_id",
            as: "practiceAnchor",
          },
        },
        {
          $project: {
            _id: 0,
            transferMongoId: { $toString: "$_id" },
            transferId: 1,
            status: 1,
            createdAt: 1,
            fileCount: 1,
            practiceName: {
              $let: {
                vars: {
                  nm: {
                    $trim: {
                      input: {
                        $ifNull: [{ $arrayElemAt: ["$practiceAnchor.name", 0] }, ""],
                      },
                    },
                  },
                },
                in: {
                  $cond: [{ $gt: [{ $strLenCP: "$$nm" }, 0] }, "$$nm", "-"]
                },
              },
            },
            labName: {
              $cond: [
                { $gt: [{ $strLenCP: "$targetLabName" }, 0] },
                "$targetLabName",
                "-",
              ],
            },
          },
        },
      ]),
      buildUnsupportedAbutmentDashboardStats(),
    ]);

    const userStatsByRole = {};
    userStats.forEach((stat) => {
      userStatsByRole[stat._id] = stat.count;
    });

    console.log("[Admin Dashboard] User stats:", {
      totalUsers,
      activeUsers,
      requestorBusinessCount,
      byRole: userStatsByRole,
    });

    const requestStatsByStatus =
      buildMonitoringByStatusFromAssignedLikeSummary(assignedLikeSummary);
    const totalRequests =
      Number(assignedLikeSummary?.total || 0) +
      Number(assignedLikeSummary?.canceledCount || 0);

    const completionSummary = {
      total: Number(assignedLikeSummary?.trackingCount || 0),
      paid: Number(assignedLikeSummary?.trackingPaidCount || 0),
      free: Math.max(
        0,
        Number(assignedLikeSummary?.trackingCount || 0) -
          Number(assignedLikeSummary?.trackingPaidCount || 0),
      ),
    };

    const requestorAnchorById = new Map(
      (Array.isArray(requestorAnchors) ? requestorAnchors : []).map((a) => [
        String(a?._id || "").trim(),
        a || {},
      ]),
    );

    const unmachinableSummary = {
      potentialCount: Number(assignedLikeSummary?.unmachinablePotentialCount || 0),
      judgedCount: Number(
        assignedLikeSummary?.unmachinablePendingConfirmCount || 0,
      ),
      confirmedCount: Number(
        assignedLikeSummary?.unmachinableConfirmedCount || 0,
      ),
      items: (Array.isArray(unmachinableRows) ? unmachinableRows : []).map((r) => {
          const hasPotential = Boolean(r?.rnd?.unmachinablePotentialAt);
          const hasJudged = Boolean(r?.rnd?.unmachinableAt);
          const hasConfirmed = Boolean(r?.rnd?.unmachinableConfirmedAt);
          const detailCode = hasConfirmed
            ? "confirmed"
            : hasJudged
              ? "judged"
              : hasPotential
                ? "potential"
                : "none";

          const businessAnchorId = String(r?.businessAnchorId || "").trim();
          const anchor = requestorAnchorById.get(businessAnchorId) || {};
          const ci = r?.caseInfos || {};

          return {
            _id: r._id,
            requestId: r.requestId,
            businessAnchorId,
            businessName: String(anchor?.name || "").trim() || "",
            companyName: String(anchor?.metadata?.companyName || "").trim() || "",
            representativeName:
              String(anchor?.metadata?.representativeName || "").trim() || "",
            phoneNumber: String(anchor?.metadata?.phoneNumber || "").trim() || "",
            email: String(anchor?.metadata?.email || "").trim() || "",
            title: r.title || "",
            manufacturerStage: r.manufacturerStage,
            createdAt: r.createdAt || null,
            shippingMode: r.shippingMode || null,
            finalShipping: r.finalShipping || null,
            originalShipping: r.originalShipping || null,
            caseInfos: {
              clinicName: ci.clinicName || "",
              patientName: ci.patientName || "",
              tooth: ci.tooth || "",
            },
            rnd: {
              unmachinablePotentialAt: r?.rnd?.unmachinablePotentialAt || null,
              unmachinableAt: r?.rnd?.unmachinableAt || null,
              unmachinableConfirmedAt: r?.rnd?.unmachinableConfirmedAt || null,
              unmachinableReason: String(r?.rnd?.unmachinableReason || ""),
            },
            unmachinableDetailCode: detailCode,
          };
        }),
    };

    const requestorAnchorIds = (Array.isArray(requestorAnchors)
      ? requestorAnchors
      : []
    )
      .map((a) => a?._id)
      .filter(Boolean);

    // 해피콜 집계 + 크레딧 무결성 점검을 한 번에 병렬 실행
    const [
      requestorRequestStats,
      firstCompletions,
      activeHappyCallCompletions,
      happyCallMemoDrafts,
      flowSummary,
    ] =
      requestorAnchorIds.length > 0
        ? await Promise.all([
            Request.aggregate([
              {
                $match: {
                  ...requestBaseFilter,
                  businessAnchorId: { $in: requestorAnchorIds },
                },
              },
              {
                $group: {
                  _id: "$businessAnchorId",
                  totalRequests: { $sum: 1 },
                  firstRequestAt: { $min: "$createdAt" },
                  lastRequestAt: { $max: "$createdAt" },
                  completedCount: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $ne: ["$shippingWorkflow.completedAt", null] },
                            { $eq: ["$manufacturerStage", "추적관리"] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  lastCompletedAt: {
                    $max: {
                      $cond: [
                        {
                          $or: [
                            { $ne: ["$shippingWorkflow.completedAt", null] },
                            { $eq: ["$manufacturerStage", "추적관리"] },
                          ],
                        },
                        {
                          $ifNull: ["$shippingWorkflow.completedAt", "$createdAt"],
                        },
                        null,
                      ],
                    },
                  },
                  recent30Total: {
                    $sum: {
                      $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0],
                    },
                  },
                  recent30Canceled: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gte: ["$createdAt", thirtyDaysAgo] },
                            { $eq: ["$manufacturerStage", "취소"] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  recent30Completed: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $gte: ["$shippingWorkflow.completedAt", thirtyDaysAgo] },
                            {
                              $and: [
                                { $eq: ["$shippingWorkflow.completedAt", null] },
                                { $eq: ["$manufacturerStage", "추적관리"] },
                                { $gte: ["$createdAt", thirtyDaysAgo] },
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  recent14UnmachinableJudged: {
                    $sum: {
                      $cond: [
                        { $gte: ["$rnd.unmachinableAt", fourteenDaysAgo] },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ]),
            Request.aggregate([
              {
                $match: {
                  ...requestBaseFilter,
                  businessAnchorId: { $in: requestorAnchorIds },
                  $or: [
                    { "shippingWorkflow.completedAt": { $ne: null } },
                    { manufacturerStage: "추적관리" },
                  ],
                },
              },
              {
                $addFields: {
                  __completionAt: {
                    $ifNull: ["$shippingWorkflow.completedAt", "$createdAt"],
                  },
                },
              },
              { $sort: { __completionAt: 1 } },
              {
                $group: {
                  _id: "$businessAnchorId",
                  firstCompletedAt: { $first: "$__completionAt" },
                  firstCompletedRequestId: { $first: "$requestId" },
                  firstCompletedRequestMongoId: { $first: "$_id" },
                },
              },
            ]),
            AdminHappyCallCompletion.find({
              businessAnchorId: { $in: requestorAnchorIds },
              suppressUntil: { $gt: now },
            })
              .select({ businessAnchorId: 1, reasonCode: 1, suppressUntil: 1 })
              .lean(),
            AdminHappyCallMemoDraft.find({
              businessAnchorId: { $in: requestorAnchorIds },
            })
              .select({ businessAnchorId: 1, entries: 1 })
              .lean(),
            buildCreditRevenueFlowMismatchSummary({
              since: thirtyDaysAgo,
            }),
          ])
        : [[], [], [], [], await buildCreditRevenueFlowMismatchSummary({
            since: thirtyDaysAgo,
          })];

    const requestStatsByAnchorId = new Map(
      (Array.isArray(requestorRequestStats) ? requestorRequestStats : []).map(
        (row) => [String(row?._id || "").trim(), row],
      ),
    );

    const firstCompletionByAnchorId = new Map(
      (Array.isArray(firstCompletions) ? firstCompletions : []).map((row) => [
        String(row?._id || "").trim(),
        row,
      ]),
    );

    const happyCallMemoEntryMap = new Map(
      (Array.isArray(happyCallMemoDrafts) ? happyCallMemoDrafts : []).map((row) => [
        String(row?.businessAnchorId || "").trim(),
        (Array.isArray(row?.entries) ? row.entries : [])
          .map((entry) => ({
            id: String(entry?._id || "").trim(),
            message: String(entry?.message || "").trim(),
            savedAt: toIsoOrNull(entry?.savedAt),
          }))
          .filter((entry) => Boolean(entry.id) && Boolean(entry.message)),
      ]),
    );

    const suppressedReasonKeySet = new Set(
      (Array.isArray(activeHappyCallCompletions)
        ? activeHappyCallCompletions
        : []
      )
        .map((row) => {
          const anchorId = String(row?.businessAnchorId || "").trim();
          const reasonCode = String(row?.reasonCode || "").trim();
          if (!anchorId || !reasonCode) return "";
          if (!isGlobalHappyCallReasonCode(reasonCode)) return "";
          return `${anchorId}:${HAPPY_CALL_GLOBAL_REASON_CODE}`;
        })
        .filter(Boolean),
    );

    const suppressedAnchorSet = new Set(
      (Array.isArray(activeHappyCallCompletions)
        ? activeHappyCallCompletions
        : []
      )
        .map((row) => {
          const anchorId = String(row?.businessAnchorId || "").trim();
          const reasonCode = String(row?.reasonCode || "").trim();
          if (!anchorId) return "";
          if (!isGlobalHappyCallReasonCode(reasonCode)) return "";
          return anchorId;
        })
        .filter(Boolean),
    );

    const happyCallItems = [];
    const requestorItems = [];
    const reasonCounter = new Map();

    for (const anchorRaw of Array.isArray(requestorAnchors) ? requestorAnchors : []) {
      const anchor = anchorRaw || {};
      const anchorId = String(anchor?._id || "").trim();
      if (!anchorId) continue;

      const statsRow = requestStatsByAnchorId.get(anchorId) || {};
      const firstCompletionRow = firstCompletionByAnchorId.get(anchorId) || {};

      const anchorCreatedAt = toDateOrNull(anchor?.createdAt);
      const totalRequestsByAnchor = Number(statsRow?.totalRequests || 0);
      const completedCount = Number(statsRow?.completedCount || 0);
      const firstCompletedAt = toDateOrNull(firstCompletionRow?.firstCompletedAt);
      const lastCompletedAt = toDateOrNull(statsRow?.lastCompletedAt);
      const lastRequestAt = toDateOrNull(statsRow?.lastRequestAt);
      const recent30Total = Number(statsRow?.recent30Total || 0);
      const recent30Canceled = Number(statsRow?.recent30Canceled || 0);
      const recent30Completed = Number(statsRow?.recent30Completed || 0);
      const recent14UnmachinableJudged = Number(
        statsRow?.recent14UnmachinableJudged || 0,
      );

      const memoEntries = happyCallMemoEntryMap.get(anchorId) || [];
      const designSoftware = String(anchor?.requestSettings?.designSoftware || "").trim();
      const isCustomDesignSoftware = Boolean(
        designSoftware && designSoftware !== "3Shape" && designSoftware !== "ExoCAD",
      );

      const baseItem = {
        businessAnchorId: anchorId,
        businessName: String(anchor?.name || "").trim() || "-",
        companyName: String(anchor?.metadata?.companyName || "").trim() || "",
        representativeName: String(anchor?.metadata?.representativeName || "").trim() || "",
        phoneNumber: String(anchor?.metadata?.phoneNumber || "").trim() || "",
        email: String(anchor?.metadata?.email || "").trim() || "",
        address: String(anchor?.metadata?.address || "").trim() || "",
        addressDetail: String(anchor?.metadata?.addressDetail || "").trim() || "",
        zipCode: String(anchor?.metadata?.zipCode || "").trim() || "",
        businessNumber:
          String(anchor?.metadata?.businessNumber || "").trim() ||
          String(anchor?.businessNumberNormalized || "").trim() || "",
        createdAt: toIsoOrNull(anchorCreatedAt),
        firstCompletedAt: toIsoOrNull(firstCompletedAt),
        lastCompletedAt: toIsoOrNull(lastCompletedAt),
        lastRequestAt: toIsoOrNull(lastRequestAt),
        firstCompletedRequestId: String(firstCompletionRow?.firstCompletedRequestId || "").trim(),
        firstCompletedRequestMongoId: String(
          firstCompletionRow?.firstCompletedRequestMongoId || "",
        ).trim(),
        stats: {
          totalRequests: totalRequestsByAnchor,
          completedCount,
          recent30Total,
          recent30Canceled,
          recent30Completed,
          recent14UnmachinableJudged,
        },
        reasons: [],
        designSoftware,
        memoEntries,
      };

      requestorItems.push(baseItem);

      if (suppressedAnchorSet.has(anchorId)) {
        continue;
      }

      const reasons = collectHappyCallReasonCodes({
        anchorCreatedAt,
        firstCompletedAt,
        lastCompletedAt,
        completedCount,
        totalRequestsByAnchor,
        recent30Total,
        recent30Canceled,
        recent30Completed,
        recent14UnmachinableJudged,
        isCustomDesignSoftware,
        weekStartUtc,
        weekEndUtc,
        sevenDaysAgo,
        fourteenDaysAgo,
        twentyOneDaysAgo,
        thirtyDaysAgo,
        sixtyDaysAgo,
      }).map((code) => ({ code }));

      if (!reasons.length) {
        continue;
      }

      const normalizedReasons = reasons
        .map((r) => {
          const code = String(r?.code || "").trim();
          const meta = HAPPY_CALL_REASON_META[code] || null;
          if (!code || !meta) return null;
          if (suppressedReasonKeySet.has(`${anchorId}:${code}`)) return null;
          reasonCounter.set(code, Number(reasonCounter.get(code) || 0) + 1);
          return {
            code,
            label: meta.label,
            description: meta.description,
            severity: meta.severity,
          };
        })
        .filter(Boolean);

      if (!normalizedReasons.length) continue;

      const maxSeverity = normalizedReasons.reduce((acc, reason) => {
        return Math.max(acc, Number(HAPPY_CALL_REASON_PRIORITY[reason.severity] || 0));
      }, 0);

      baseItem.reasons = normalizedReasons;

      happyCallItems.push({
        ...baseItem,
        _priority: maxSeverity,
      });
    }

    happyCallItems.sort((a, b) => {
      if (b._priority !== a._priority) return b._priority - a._priority;

      const aLast = new Date(a.lastCompletedAt || a.lastRequestAt || a.createdAt || 0).getTime();
      const bLast = new Date(b.lastCompletedAt || b.lastRequestAt || b.createdAt || 0).getTime();
      return aLast - bLast;
    });

    const reasonCounts = Array.from(reasonCounter.entries())
      .map(([code, count]) => {
        const meta = HAPPY_CALL_REASON_META[code] || {};
        return {
          code,
          label: String(meta.label || code),
          severity: String(meta.severity || "low"),
          count: Number(count || 0),
        };
      })
      .sort((a, b) => {
        const severityGap =
          Number(HAPPY_CALL_REASON_PRIORITY[b.severity] || 0) -
          Number(HAPPY_CALL_REASON_PRIORITY[a.severity] || 0);
        if (severityGap !== 0) return severityGap;
        return b.count - a.count;
      });

    const happyCallSummary = {
      generatedAt: now.toISOString(),
      weekRange: {
        start: weekStartUtc.toISOString(),
        end: weekEndUtc.toISOString(),
      },
      totalRequestorCount: happyCallItems.length,
      totalReasonCount: happyCallItems.reduce(
        (acc, item) => acc + Number(item?.reasons?.length || 0),
        0,
      ),
      reasonCounts,
      allItems: requestorItems,
      items: happyCallItems.map(({ _priority, ...rest }) => rest),
    };

    // 크레딧 소비 ↔ 수익 귀속 합계 무결성 점검 (의뢰 단위)
    // SSOT: 의뢰자 순소비(netConsumed) == (어벗츠+제조사+개발운영사+딜러사) 수익합(공급가)
    if (Number(flowSummary?.mismatchCount || 0) > 0) {
      const top = (flowSummary.topMismatches || [])[0] || null;
      const sampleText = top
        ? `예: ${top.requestId || top.requestMongoId} (gap=${Number(top.gap || 0).toLocaleString()}원)`
        : "";
      systemAlerts.push({
        id: "credit-flow:mismatch",
        type: "warning",
        message: `최근 30일 의뢰 크레딧 소비/수익 귀속 불일치 ${flowSummary.mismatchCount}건. ${sampleText}`.trim(),
        date: new Date().toISOString(),
      });
    }

    const practiceTransferStatsBase =
      Array.isArray(practiceTransferStatsRaw) && practiceTransferStatsRaw[0]
        ? practiceTransferStatsRaw[0]
        : {};

    const practiceKeys = Array.isArray(practiceTransferStatsBase?.practiceKeys)
      ? practiceTransferStatsBase.practiceKeys
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      : [];
    const labKeys = Array.isArray(practiceTransferStatsBase?.labKeys)
      ? practiceTransferStatsBase.labKeys
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      : [];

    return {
      success: true,
      data: {
        userStats: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          requestorBusinessCount,
          byRole: userStatsByRole,
        },
        requestStats: {
          total: totalRequests,
          byStatus: requestStatsByStatus,
          inProgressByShippingMode: {
            normal: Number(assignedLikeSummary?.inProgressNormalCount || 0),
            express: Number(assignedLikeSummary?.inProgressExpressCount || 0),
          },
          range: { startDate: start, endDate: end },
          recent: [],
        },
        // 프론트 미사용 — 호환용 stub (File 전수 집계 제거)
        recentActivity: { total: 0, totalSize: 0 },
        pricingSummary: {
          range: { startDate: start, endDate: end },
          ...pricingSummary,
        },
        completionSummary,
        systemAlerts,
        unmachinableSummary,
        happyCallSummary,
        practiceTransferStats: {
          totalTransfers: Number(practiceTransferStatsBase?.totalTransfers || 0),
          totalFiles: Number(practiceTransferStatsBase?.totalFiles || 0),
          totalPractices: practiceKeys.length,
          totalLabs: labKeys.length,
          unreadTransfers: Number(practiceTransferStatsBase?.unreadTransfers || 0),
          activeTransfers: Number(practiceTransferStatsBase?.activeTransfers || 0),
          canceledTransfers: Number(
            practiceTransferStatsBase?.canceledTransfers || 0,
          ),
          topPractices: Array.isArray(practiceTransferTopPracticesRaw)
            ? practiceTransferTopPracticesRaw
            : [],
          topLabs: Array.isArray(practiceTransferTopLabsRaw)
            ? practiceTransferTopLabsRaw
            : [],
          recentTransfers: Array.isArray(practiceTransferRecentRaw)
            ? practiceTransferRecentRaw
            : [],
        },
        unsupportedAbutmentStats: unsupportedAbutmentStats || {
          pending: 0,
          adoptedCnc: 0,
          adoptedRoundBar: 0,
          total: 0,
          items: [],
        },
        // 상세 mismatch 목록은 응답에서 제외(알림만 유지). 용량·지연 절감.
        creditFlowHealth: {
          mismatchCount: Number(flowSummary?.mismatchCount || 0),
          checkedCount: Number(flowSummary?.checkedCount || 0),
        },
      },
    };
}

export async function listHappyCallCompletions(req, res) {
  try {
    const rawLimit = Number(req.query?.limit || 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
      : 50;

    const rawDays = Number(req.query?.days || 0);
    const days = Number.isFinite(rawDays)
      ? Math.max(Math.trunc(rawDays), 0)
      : 0;

    const query = {
      reasonCode: new RegExp(`^${HAPPY_CALL_GLOBAL_REASON_CODE}(?::|$)`),
    };

    if (days > 0) {
      query.completedAt = {
        $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      };
    }

    const q = String(req.query?.q || "").trim();
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      const anchors = await BusinessAnchor.find({
        $or: [{ name: regex }, { "metadata.companyName": regex }],
      })
        .select("_id")
        .limit(1000)
        .lean();

      const anchorIds = anchors
        .map((anchor) => String(anchor?._id || "").trim())
        .filter(Boolean);

      if (!anchorIds.length) {
        return res.status(200).json({
          success: true,
          data: {
            totalCount: 0,
            items: [],
          },
        });
      }

      query.businessAnchorId = { $in: anchorIds };
    }

    const [rows, totalCount] = await Promise.all([
      AdminHappyCallCompletion.find(query)
        .sort({ completedAt: -1, updatedAt: -1 })
        .limit(limit)
        .populate({
          path: "businessAnchorId",
          select:
            "name businessNumberNormalized metadata.companyName metadata.representativeName metadata.phoneNumber metadata.email metadata.address metadata.addressDetail metadata.zipCode metadata.businessNumber",
        })
        .populate({
          path: "completedBy",
          select: "name email",
        })
        .lean(),
      AdminHappyCallCompletion.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalCount,
        items: rows.map((row) => {
          const anchor = row?.businessAnchorId || null;
          const actor = row?.completedBy || null;
          const anchorId =
            anchor && typeof anchor === "object" && anchor?._id
              ? String(anchor._id)
              : String(row?.businessAnchorId || "");

          const businessName =
            anchor && typeof anchor === "object"
              ? String(anchor?.name || "").trim()
              : "";

          const companyName =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.companyName || "").trim()
              : "";

          const representativeName =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.representativeName || "").trim()
              : "";

          const phoneNumber =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.phoneNumber || "").trim()
              : "";

          const email =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.email || "").trim()
              : "";

          const address =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.address || "").trim()
              : "";

          const addressDetail =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.addressDetail || "").trim()
              : "";

          const zipCode =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.zipCode || "").trim()
              : "";

          const businessNumber =
            anchor && typeof anchor === "object"
              ? String(anchor?.metadata?.businessNumber || "").trim() ||
                String(anchor?.businessNumberNormalized || "").trim()
              : "";

          const completedByName =
            actor && typeof actor === "object"
              ? String(actor?.name || "").trim()
              : "";

          const completedByEmail =
            actor && typeof actor === "object"
              ? String(actor?.email || "").trim()
              : "";

          return {
            id: String(row?._id || ""),
            businessAnchorId: anchorId,
            businessName,
            companyName,
            representativeName,
            phoneNumber,
            email,
            address,
            addressDetail,
            zipCode,
            businessNumber,
            reasonCode: String(row?.reasonCode || ""),
            note: String(row?.note || ""),
            completedAt: toIsoOrNull(row?.completedAt),
            suppressUntil: toIsoOrNull(row?.suppressUntil),
            completedByName,
            completedByEmail,
            memoEntries: (Array.isArray(row?.memoEntries) ? row.memoEntries : [])
              .map((entry) => ({
                id: String(entry?._id || "").trim(),
                message: String(entry?.message || "").trim(),
                savedAt: toIsoOrNull(entry?.savedAt),
              }))
              .filter((entry) => Boolean(entry.id) && Boolean(entry.message)),
          };
        }),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "해피콜 완료 내역 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveHappyCallMemoDraft(req, res) {
  try {
    const businessAnchorId = String(req.body?.businessAnchorId || "").trim();
    const message = String(req.body?.message || "").slice(0, 500).trim();

    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "businessAnchorId가 필요합니다.",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "메모 내용을 입력해주세요.",
      });
    }

    const savedAt = new Date();
    const savedBy = req.user?._id || null;

    await AdminHappyCallMemoDraft.findOneAndUpdate(
      { businessAnchorId },
      {
        $push: {
          entries: {
            $each: [
              {
                message,
                savedAt,
                savedBy,
              },
            ],
            $slice: -200,
          },
        },
      },
      {
        upsert: true,
        new: false,
        setDefaultsOnInsert: true,
      },
    );

    const draft = await AdminHappyCallMemoDraft.findOne({ businessAnchorId })
      .select({ businessAnchorId: 1, entries: 1 })
      .lean();

    const entries = (Array.isArray(draft?.entries) ? draft.entries : [])
      .map((entry) => ({
        id: String(entry?._id || "").trim(),
        message: String(entry?.message || "").trim(),
        savedAt: toIsoOrNull(entry?.savedAt),
      }))
      .filter((entry) => Boolean(entry.id) && Boolean(entry.message));

    return res.status(200).json({
      success: true,
      data: {
        businessAnchorId,
        entries,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "해피콜 메모 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function completeHappyCall(req, res) {
  try {
    const businessAnchorId = String(req.body?.businessAnchorId || "").trim();
    const rawReasonCodes = Array.isArray(req.body?.reasonCodes)
      ? req.body.reasonCodes
      : [];
    const note = String(req.body?.note || "").slice(0, 5000).trim();

    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "businessAnchorId가 필요합니다.",
      });
    }

    const reasonCodes = Array.from(
      new Set(
        rawReasonCodes
          .map((code) => String(code || "").trim())
          .filter((code) => Boolean(HAPPY_CALL_REASON_META[code])),
      ),
    );

    const suppressUntil = new Date(
      Date.now() + HAPPY_CALL_SUPPRESS_DAYS * 24 * 60 * 60 * 1000,
    );

    const completedAt = new Date();

    const completionReasonCode = `${HAPPY_CALL_GLOBAL_REASON_CODE}:${completedAt.getTime()}`;

    // 정책: 완료 처리 시 해피콜 대상 메모 드래프트의 기존 메모 엔트리를 완료 기록에도 보관한다.
    // (되돌리기 시 원본 엔트리로 복원하기 위함)
    const existingDraft = await AdminHappyCallMemoDraft.findOne({
      businessAnchorId,
    })
      .select({ entries: 1 })
      .lean();

    const memoEntries = (Array.isArray(existingDraft?.entries)
      ? existingDraft.entries
      : []
    ).map((entry) => ({
      message: String(entry?.message || "").trim(),
      savedAt: entry?.savedAt || completedAt,
      savedBy: entry?.savedBy || null,
    }));

    const created = await AdminHappyCallCompletion.create({
      businessAnchorId,
      reasonCode: completionReasonCode,
      completedAt,
      completedBy: req.user?._id || null,
      suppressUntil,
      note,
      memoEntries,
    });

    await AdminHappyCallMemoDraft.deleteOne({ businessAnchorId });

    return res.status(200).json({
      success: true,
      data: {
        id: String(created?._id || ""),
        businessAnchorId,
        reasonCodes,
        suppressedScope: "anchor:all-reasons",
        completedAt: completedAt.toISOString(),
        suppressUntil: suppressUntil.toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "해피콜 완료 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function restoreHappyCallMemoDraftFromCompletion(target) {
  const businessAnchorId = String(target?.businessAnchorId || "").trim();
  if (!businessAnchorId) return;

  // 정책: 완료 시 기록해둔 메모 엔트리를 그대로 되돌려, 되돌리기 후에도
  // 해피콜 대상 목록에서 기존 메모를 그대로 이어볼 수 있게 한다.
  const savedEntries = (Array.isArray(target?.memoEntries) ? target.memoEntries : [])
    .map((entry) => ({
      message: String(entry?.message || "").trim(),
      savedAt: entry?.savedAt || target?.completedAt || new Date(),
      savedBy: entry?.savedBy || null,
    }))
    .filter((entry) => Boolean(entry.message));

  // 레거시 완료 기록(memoEntries 미보유) 호환: note 텍스트를 단일 엔트리로 복원
  const entriesToRestore = savedEntries.length
    ? savedEntries
    : String(target?.note || "").trim()
      ? [
          {
            message: String(target.note).trim(),
            savedAt: target?.completedAt || new Date(),
            savedBy: target?.completedBy || null,
          },
        ]
      : [];

  if (!entriesToRestore.length) return;

  await AdminHappyCallMemoDraft.findOneAndUpdate(
    { businessAnchorId },
    { $set: { entries: entriesToRestore } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export async function revertLastHappyCallCompletion(req, res) {
  try {
    const completedBy = req.user?._id || null;
    if (!completedBy) {
      return res.status(401).json({
        success: false,
        message: "로그인이 필요합니다.",
      });
    }

    const businessAnchorId = String(req.body?.businessAnchorId || "").trim();

    if (businessAnchorId) {
      const target = await AdminHappyCallCompletion.findOne({
        businessAnchorId,
        reasonCode: new RegExp(`^${HAPPY_CALL_GLOBAL_REASON_CODE}(?::|$)`),
      })
        .sort({ completedAt: -1, updatedAt: -1 })
        .lean();

      if (!target?._id) {
        return res.status(404).json({
          success: false,
          message: "해당 의뢰자의 해피콜 완료 이력이 없습니다.",
        });
      }

      await restoreHappyCallMemoDraftFromCompletion(target);
      await AdminHappyCallCompletion.deleteOne({ _id: target._id });

      return res.status(200).json({
        success: true,
        data: {
          revertedId: String(target._id),
          businessAnchorId: String(target.businessAnchorId || "").trim(),
        },
      });
    }

    let last = await AdminHappyCallCompletion.findOne({
      completedBy,
      reasonCode: new RegExp(`^${HAPPY_CALL_GLOBAL_REASON_CODE}(?::|$)`),
    })
      .sort({ completedAt: -1, updatedAt: -1 })
      .lean();

    // 운영 편의: completedBy 누락/불일치 케이스를 위해 최신 전역 이력으로 fallback
    if (!last?._id) {
      last = await AdminHappyCallCompletion.findOne({
        reasonCode: new RegExp(`^${HAPPY_CALL_GLOBAL_REASON_CODE}(?::|$)`),
      })
        .sort({ completedAt: -1, updatedAt: -1 })
        .lean();
    }

    if (!last?._id) {
      return res.status(404).json({
        success: false,
        message: "되돌릴 해피콜 완료 이력이 없습니다.",
      });
    }

    await restoreHappyCallMemoDraftFromCompletion(last);
    await AdminHappyCallCompletion.deleteOne({ _id: last._id });

    return res.status(200).json({
      success: true,
      data: {
        revertedId: String(last._id),
        businessAnchorId: String(last.businessAnchorId || "").trim(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "해피콜 완료 되돌리기 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function addHappyCallCompletionMemo(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    const message = String(req.body?.message || "").slice(0, 500).trim();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id가 필요합니다.",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "메모 내용을 입력해주세요.",
      });
    }

    const savedAt = new Date();
    const savedBy = req.user?._id || null;

    const target = await AdminHappyCallCompletion.findById(id);

    if (!target || !isGlobalHappyCallReasonCode(String(target.reasonCode || ""))) {
      return res.status(404).json({
        success: false,
        message: "해당 해피콜 완료 이력을 찾을 수 없습니다.",
      });
    }

    target.memoEntries.push({ message, savedAt, savedBy });
    // note는 기존 카드 표시 호환을 위해 memoEntries를 이어붙인 텍스트로 함께 갱신한다.
    target.note = target.memoEntries
      .map((entry) => `[${new Date(entry.savedAt).toLocaleString("ko-KR")}] ${entry.message}`)
      .join("\n");

    await target.save();

    return res.status(200).json({
      success: true,
      data: {
        id: String(target._id),
        note: target.note,
        memoEntries: target.memoEntries.map((entry) => ({
          id: String(entry._id || ""),
          message: entry.message,
          savedAt: toIsoOrNull(entry.savedAt),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "해피콜 완료 메모 추가 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
