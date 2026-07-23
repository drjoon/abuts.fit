import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import File from "../../models/file.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import AdminHappyCallCompletion from "../../models/adminHappyCallCompletion.model.js";
import {
  getDateRangeFromQuery,
  getMongoHealth,
} from "./admin.shared.controller.js";
import { getLatestPricingSsotHealthSnapshot } from "../../services/pricingSsotHealth.service.js";
import {
  buildMonitoringByStatusFromAssignedLikeSummary,
  getAdminPricingStatsSummary,
  getAssignedLikeDashboardSummary,
} from "../../services/requestDashboardStats.service.js";

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

export async function getDashboardStats(req, res) {
  try {
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
      latestPricingSsotHealth,
      requestorAnchors,
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
          caseInfos: 1,
          rnd: 1,
        })
        .lean(),
      getLatestPricingSsotHealthSnapshot(),
      BusinessAnchor.find({ businessType: "requestor", status: { $ne: "merged" } })
        .select({
          _id: 1,
          name: 1,
          businessNumberNormalized: 1,
          metadata: 1,
          createdAt: 1,
          status: 1,
        })
        .lean(),
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

    const unmachinableSummary = {
      potentialCount: Number(assignedLikeSummary?.unmachinablePotentialCount || 0),
      judgedCount: Number(
        assignedLikeSummary?.unmachinablePendingConfirmCount || 0,
      ),
      confirmedCount: Number(
        assignedLikeSummary?.unmachinableConfirmedCount || 0,
      ),
      items: (Array.isArray(unmachinableRows) ? unmachinableRows : [])
        .map((r) => {
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

          return {
            _id: r._id,
            requestId: r.requestId,
            title: r.title || "",
            manufacturerStage: r.manufacturerStage,
            createdAt: r.createdAt || null,
            caseInfos: r.caseInfos || {},
            rnd: {
              ...(r.rnd || {}),
              unmachinablePotentialAt: r?.rnd?.unmachinablePotentialAt || null,
              unmachinableAt: r?.rnd?.unmachinableAt || null,
              unmachinableConfirmedAt: r?.rnd?.unmachinableConfirmedAt || null,
              unmachinableReason: String(r?.rnd?.unmachinableReason || ""),
            },
            unmachinableDetailCode: detailCode,
          };
        })
        .sort((a, b) => {
          const aKey =
            a?.rnd?.unmachinableConfirmedAt ||
            a?.rnd?.unmachinableAt ||
            a?.rnd?.unmachinablePotentialAt ||
            a?.createdAt ||
            0;
          const bKey =
            b?.rnd?.unmachinableConfirmedAt ||
            b?.rnd?.unmachinableAt ||
            b?.rnd?.unmachinablePotentialAt ||
            b?.createdAt ||
            0;
          return new Date(bKey).getTime() - new Date(aKey).getTime();
        })
        .slice(0, 10),
    };

    const ssotCheckedAt = latestPricingSsotHealth?.checkedAt
      ? new Date(latestPricingSsotHealth.checkedAt)
      : null;
    const ssotAgeHours = ssotCheckedAt
      ? (Date.now() - ssotCheckedAt.getTime()) / (1000 * 60 * 60)
      : null;
    const pricingSsotHealth = {
      success: Boolean(latestPricingSsotHealth?.success),
      mismatchCount: Number(latestPricingSsotHealth?.mismatchCount || 0),
      checkedSnapshotCount: Number(
        latestPricingSsotHealth?.checkedSnapshotCount || 0,
      ),
      checkedAt: latestPricingSsotHealth?.checkedAt || null,
      range: latestPricingSsotHealth?.range || null,
      topMismatches: Array.isArray(latestPricingSsotHealth?.mismatches)
        ? latestPricingSsotHealth.mismatches.slice(0, 5).map((row) => ({
            businessAnchorId: String(row?.businessAnchorId || "").trim(),
            name: String(row?.name || ""),
            gap: Number(row?.gap || 0),
            latestRequestMongoId: String(
              row?.latestRequestMongoId || "",
            ).trim(),
            latestRequestId: String(row?.latestRequestId || "").trim(),
          }))
        : [],
    };

    const requestorAnchorIds = (Array.isArray(requestorAnchors)
      ? requestorAnchors
      : []
    )
      .map((a) => a?._id)
      .filter(Boolean);

    const [requestorRequestStats, firstCompletions, activeHappyCallCompletions] =
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
          ])
        : [[], [], []];

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
    const reasonCounter = new Map();

    for (const anchorRaw of Array.isArray(requestorAnchors) ? requestorAnchors : []) {
      const anchor = anchorRaw || {};
      const anchorId = String(anchor?._id || "").trim();
      if (!anchorId) continue;

      if (suppressedAnchorSet.has(anchorId)) {
        continue;
      }

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

      const reasons = [];

      if (
        firstCompletedAt &&
        firstCompletedAt >= weekStartUtc &&
        firstCompletedAt < weekEndUtc
      ) {
        reasons.push({ code: "first_completion_this_week" });
      }

      if (
        firstCompletedAt &&
        firstCompletedAt <= sevenDaysAgo &&
        firstCompletedAt >= twentyOneDaysAgo
      ) {
        reasons.push({ code: "first_completion_after_signup" });
      }

      // 운영 정책 보정:
      // 가입 1개월 경과 + 완료 0건이라도 최근 주문 활동이 활발하면
      // 해당 사유로는 해피콜 대상에서 제외한다.
      if (
        anchorCreatedAt &&
        anchorCreatedAt <= thirtyDaysAgo &&
        completedCount === 0 &&
        recent30Total === 0
      ) {
        reasons.push({ code: "no_completion_30d_from_join" });
      }

      if (lastCompletedAt && lastCompletedAt <= sixtyDaysAgo) {
        reasons.push({ code: "dormant_60d_since_last_completion" });
      }

      if (recent30Total >= 3 && recent30Canceled / recent30Total >= 0.5) {
        reasons.push({ code: "high_cancel_rate_30d" });
      }

      if (recent14UnmachinableJudged > 0) {
        reasons.push({ code: "recent_unmachinable_14d" });
      }

      if (completedCount > 0 && recent30Total >= 2 && recent30Completed === 0) {
        reasons.push({ code: "active_but_no_completion_30d" });
      }

      if (anchorCreatedAt && anchorCreatedAt <= fourteenDaysAgo && totalRequestsByAnchor === 0) {
        reasons.push({ code: "new_signup_no_first_request_14d" });
      }

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

      happyCallItems.push({
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
        reasons: normalizedReasons,
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
      items: happyCallItems.map(({ _priority, ...rest }) => rest),
    };

    // SSOT 점검 상태를 관리자 알림에 반영한다.
    // - 누락: 점검 자체가 아직 실행되지 않음
    // - stale: 워커/배치가 정상 수행되지 않았을 가능성
    // - mismatch: Request SSOT와 스냅샷 불일치 발생
    if (!latestPricingSsotHealth) {
      systemAlerts.push({
        id: "pricing-ssot:missing",
        type: "warning",
        message:
          "가격 SSOT 점검 스냅샷이 없습니다. 점검 스크립트를 실행하세요.",
        date: new Date().toISOString(),
      });
    } else if (pricingSsotHealth.mismatchCount > 0) {
      systemAlerts.push({
        id: "pricing-ssot:mismatch",
        type: "warning",
        message: `가격 SSOT 불일치 ${pricingSsotHealth.mismatchCount}건 발생`,
        date: new Date().toISOString(),
      });
    } else if (ssotAgeHours !== null && ssotAgeHours > 26) {
      systemAlerts.push({
        id: "pricing-ssot:stale",
        type: "warning",
        message: "가격 SSOT 점검 결과가 26시간 이상 갱신되지 않았습니다.",
        date: new Date().toISOString(),
      });
    }

    // 최근 요청 및 파일 통계를 병렬로 조회
    const [recentRequests, totalFiles, totalFileSize] = await Promise.all([
      Request.find({ source: { $ne: "manufacturer_sample" } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("requestor", "name email")
        .populate("caManufacturer", "name email"),
      File.countDocuments(),
      File.aggregate([{ $group: { _id: null, totalSize: { $sum: "$size" } } }]),
    ]);

    const dashboardData = {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        requestorBusinessCount,
        byRole: userStatsByRole,
      },
      requests: {
        total: totalRequests,
        byStatus: requestStatsByStatus,
        range: { startDate: start, endDate: end },
        recent: recentRequests,
      },
      pricing: {
        range: { startDate: start, endDate: end },
        ...pricingSummary,
      },
      files: {
        total: totalFiles,
        totalSize: totalFileSize.length > 0 ? totalFileSize[0].totalSize : 0,
      },
    };

    res.status(200).json({
      success: true,
      data: {
        userStats: dashboardData.users,
        requestStats: dashboardData.requests,
        recentActivity: dashboardData.files,
        pricingSummary: dashboardData.pricing,
        completionSummary,
        systemAlerts,
        pricingSsotHealth,
        unmachinableSummary,
        happyCallSummary,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "대시보드 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
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
          select: "name metadata.companyName",
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
            reasonCode: String(row?.reasonCode || ""),
            note: String(row?.note || ""),
            completedAt: toIsoOrNull(row?.completedAt),
            suppressUntil: toIsoOrNull(row?.suppressUntil),
            completedByName,
            completedByEmail,
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

export async function completeHappyCall(req, res) {
  try {
    const businessAnchorId = String(req.body?.businessAnchorId || "").trim();
    const rawReasonCodes = Array.isArray(req.body?.reasonCodes)
      ? req.body.reasonCodes
      : [];
    const note = String(req.body?.note || "").slice(0, 500).trim();

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

    const created = await AdminHappyCallCompletion.create({
      businessAnchorId,
      reasonCode: completionReasonCode,
      completedAt,
      completedBy: req.user?._id || null,
      suppressUntil,
      note,
    });

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
