import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import {
  buildRequestorOrgScopeFilter,
  buildRequestorOrgFilter,
  getDeliveryEtaLeadDays,
  computeDiameterStats,
  normalizeCaseInfosImplantFields,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  normalizeKoreanBusinessDay,
  ymdToMmDd,
} from "./utils.js";

const toKstYmd = (d) => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const ymdToKstMidnight = (ymd) => {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * 기간 파라미터에 따른 createdAt 필터 생성
 * 지원 값: 7d, 30d, 90d, lastMonth, thisMonth, all(기본값 30d)
 */
const buildDateFilter = (period) => {
  const now = new Date();

  // all 또는 잘못된 값이면 필터 없음
  if (!period || period === "all") return {};

  // 이번달/지난달: 월 단위 구간
  if (period === "thisMonth" || period === "lastMonth") {
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (period === "thisMonth") {
      return { createdAt: { $gte: startOfThisMonth, $lt: startOfNextMonth } };
    }

    // lastMonth
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth } };
  }

  // 기본: 일 단위
  let days = 30;
  if (period === "7d") days = 7;
  else if (period === "90d") days = 90;

  const from = new Date();
  from.setDate(from.getDate() - days);
  return { createdAt: { $gte: from } };
};

/**
 * 최대 직경별 통계 (공용)
 * @route GET /api/requests/diameter-stats
 */
export async function getDiameterStats(req, res) {
  try {
    const userId = req.user?._id?.toString() || "anonymous";
    const role = req.user?.role || "public";
    const isManufacturer = role === "manufacturer";

    const leadDays = await getDeliveryEtaLeadDays();
    const baseFilter = {
      status: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
    };

    const filter =
      role === "requestor"
        ? { ...baseFilter, ...(await buildRequestorOrgScopeFilter(req)) }
        : isManufacturer
        ? {
            $and: [
              baseFilter,
              { status2: { $ne: "완료" } },
              {
                $or: [
                  { manufacturer: req.user._id },
                  { manufacturer: null },
                  { manufacturer: { $exists: false } },
                ],
              },
            ],
          }
        : baseFilter;

    // 집계 쿼리로 직경별 통계 계산 (메모리 사용량 대폭 감소)
    const stats = await Request.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          d6Count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lte: ["$caseInfos.maxDiameter", 6] },
                    { $gt: ["$caseInfos.maxDiameter", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          d8Count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$caseInfos.maxDiameter", 6] },
                    { $lte: ["$caseInfos.maxDiameter", 8] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          d10Count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$caseInfos.maxDiameter", 8] },
                    { $lte: ["$caseInfos.maxDiameter", 10] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          d10plusCount: {
            $sum: {
              $cond: [{ $gt: ["$caseInfos.maxDiameter", 10] }, 1, 0],
            },
          },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    const result = stats[0] || {
      d6Count: 0,
      d8Count: 0,
      d10Count: 0,
      d10plusCount: 0,
      totalCount: 0,
    };

    const diameterStatsLegacy = [
      { range: "≤6mm", count: result.d6Count, leadDays: leadDays.d6 },
      { range: "6-8mm", count: result.d8Count, leadDays: leadDays.d8 },
      { range: "8-10mm", count: result.d10Count, leadDays: leadDays.d10 },
      {
        range: ">10mm",
        count: result.d10plusCount,
        leadDays: leadDays.d10plus,
      },
    ];

    const todayYmd = getTodayYmdInKst();

    const toBucket = async ({ diameter, count, leadDays }) => {
      const etaYmd = await addKoreanBusinessDays({
        startYmd: todayYmd,
        days:
          typeof leadDays === "number" && !Number.isNaN(leadDays)
            ? leadDays
            : 0,
      });
      const shipLabel = ymdToMmDd(etaYmd);
      const total = result.totalCount || 0;
      const ratio = total ? Math.min(1, Math.max(0, count / total)) : 0;
      return { diameter, shipLabel, ratio, count };
    };

    const buckets = await Promise.all([
      toBucket({ diameter: 6, count: result.d6Count, leadDays: leadDays.d6 }),
      toBucket({ diameter: 8, count: result.d8Count, leadDays: leadDays.d8 }),
      toBucket({
        diameter: 10,
        count: result.d10Count,
        leadDays: leadDays.d10,
      }),
      toBucket({
        diameter: "10+",
        count: result.d10plusCount,
        leadDays: leadDays.d10plus,
      }),
    ]);

    const diameterStats = {
      buckets,
      total: result.totalCount,
    };

    return res.status(200).json({
      success: true,
      data: {
        diameterStats,
        diameterStatsLegacy,
        total: result.totalCount,
      },
      cached: false,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "직경별 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 대시보드 요약 (의뢰자용)
 * @route GET /api/requests/my/dashboard-summary
 */
export async function getMyDashboardSummary(req, res) {
  try {
    const { period = "30d" } = req.query;
    const userId = req.user?._id?.toString();
    const debug =
      process.env.NODE_ENV !== "production" && String(req.query.debug) === "1";

    const requestFilter = await buildRequestorOrgScopeFilter(req);

    const dateFilter = buildDateFilter(period);

    // 집계 쿼리로 통계와 최근 의뢰를 병렬로 조회
    const [deliveryLeadDays, statsResult, recentRequestsResult] =
      await Promise.all([
        getDeliveryEtaLeadDays(),
        Request.aggregate([
          {
            $match: {
              ...requestFilter,
              "caseInfos.implantSystem": { $exists: true, $ne: "" },
              $or: [{ status: { $nin: ["완료", "취소"] } }, dateFilter],
            },
          },
          {
            $addFields: {
              normalizedStage: {
                $let: {
                  vars: {
                    status: { $ifNull: ["$status", ""] },
                    stage: { $ifNull: ["$manufacturerStage", ""] },
                    status2: { $ifNull: ["$status2", ""] },
                  },
                  in: {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$$status", "취소"] },
                          then: "cancel",
                        },
                        {
                          case: {
                            $or: [{ $eq: ["$$status2", "완료"] }],
                          },
                          then: "completed",
                        },
                        {
                          case: {
                            $or: [
                              {
                                $in: [
                                  "$$stage",
                                  ["shipping", "tracking", "발송", "추적관리"],
                                ],
                              },
                            ],
                          },
                          then: "shipping",
                        },
                        {
                          case: {
                            $or: [
                              {
                                $in: [
                                  "$$stage",
                                  [
                                    "machining",
                                    "packaging",
                                    "production",
                                    "생산",
                                  ],
                                ],
                              },
                            ],
                          },
                          then: "production",
                        },
                        {
                          case: {
                            $or: [
                              { $in: ["$$stage", ["cam", "CAM", "가공전"]] },
                            ],
                          },
                          then: "cam",
                        },
                        {
                          case: {
                            $or: [
                              {
                                $in: [
                                  "$$stage",
                                  ["request", "receive", "의뢰", "의뢰접수"],
                                ],
                              },
                            ],
                          },
                          then: "request",
                        },
                      ],
                      default: "request",
                    },
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              canceledCount: {
                $sum: { $cond: [{ $eq: ["$status", "취소"] }, 1, 0] },
              },
              completed: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "completed"] }, 1, 0],
                },
              },
              designCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "request"] }, 1, 0],
                },
              },
              camCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "cam"] }, 1, 0],
                },
              },
              productionCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "production"] }, 1, 0],
                },
              },
              shippingCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "shipping"] }, 1, 0],
                },
              },
            },
          },
        ]),
        Request.find({
          ...requestFilter,
          "caseInfos.implantSystem": { $exists: true, $ne: "" },
          status: { $ne: "취소" },
        })
          .select({
            _id: 1,
            requestId: 1,
            title: 1,
            status: 1,
            manufacturerStage: 1,
            createdAt: 1,
            caseInfos: 1,
            timeline: 1,
            estimatedCompletion: 1,
            deliveryInfoRef: 1,
          })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("requestor", "name organization")
          .lean(),
      ]);

    const stats = statsResult[0] || {
      total: 0,
      canceledCount: 0,
      completed: 0,
      designCount: 0,
      camCount: 0,
      productionCount: 0,
      shippingCount: 0,
    };

    const totalActive =
      stats.designCount +
        stats.camCount +
        stats.productionCount +
        stats.shippingCount || 1;

    const manufacturingSummary = {
      totalActive,
      stages: [
        { key: "design", label: "의뢰 접수", count: stats.designCount },
        { key: "cam", label: "CAM", count: stats.camCount },
        { key: "production", label: "생산", count: stats.productionCount },
        { key: "shipping", label: "발송", count: stats.shippingCount },
      ].map((s) => ({
        ...s,
        percent: totalActive ? Math.round((s.count / totalActive) * 100) : 0,
      })),
    };

    // Risk Summary: 지연 위험 요약 (시각 기반)
    const { calculateRiskSummary } = await import("./production.utils.js");
    const activeRequests = await Request.find({
      ...requestFilter,
      status: { $in: ["의뢰", "CAM", "생산"] },
    }).select("requestId title status manufacturerStage productionSchedule");

    const riskSummary = calculateRiskSummary(activeRequests);

    // 직경별 통계 실제 집계
    const diameterAggResult = await Request.aggregate([
      {
        $match: {
          ...requestFilter,
          "caseInfos.implantSystem": { $exists: true, $ne: "" },
          status: { $ne: "취소" },
        },
      },
      {
        $group: {
          _id: null,
          d6Count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lte: ["$caseInfos.maxDiameter", 6] },
                    { $gt: ["$caseInfos.maxDiameter", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          d8Count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$caseInfos.maxDiameter", 6] },
                    { $lte: ["$caseInfos.maxDiameter", 8] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          d10Count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$caseInfos.maxDiameter", 8] },
                    { $lte: ["$caseInfos.maxDiameter", 10] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          d10plusCount: {
            $sum: {
              $cond: [{ $gt: ["$caseInfos.maxDiameter", 10] }, 1, 0],
            },
          },
        },
      },
    ]);

    const diameterResult = diameterAggResult[0] || {
      d6Count: 0,
      d8Count: 0,
      d10Count: 0,
      d10plusCount: 0,
    };

    const diameterStats = [
      {
        range: "≤6mm",
        count: diameterResult.d6Count,
        leadDays: deliveryLeadDays.d6,
      },
      {
        range: "6-8mm",
        count: diameterResult.d8Count,
        leadDays: deliveryLeadDays.d8,
      },
      {
        range: "8-10mm",
        count: diameterResult.d10Count,
        leadDays: deliveryLeadDays.d10,
      },
      {
        range: ">10mm",
        count: diameterResult.d10plusCount,
        leadDays: deliveryLeadDays.d10plus,
      },
    ];

    const effectiveLeadDays = {
      d6: deliveryLeadDays?.d6 ?? 2,
      d8: deliveryLeadDays?.d8 ?? 2,
      d10: deliveryLeadDays?.d10 ?? 5,
      d10plus: deliveryLeadDays?.d10plus ?? 5,
    };

    const resolveNormalLeadDays = (maxDiameter) => {
      const d =
        typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
          ? maxDiameter
          : maxDiameter != null && String(maxDiameter).trim()
          ? Number(maxDiameter)
          : null;
      if (d == null || Number.isNaN(d)) return effectiveLeadDays.d10;
      if (d <= 6) return effectiveLeadDays.d6;
      if (d <= 8) return effectiveLeadDays.d8;
      if (d <= 10) return effectiveLeadDays.d10;
      return effectiveLeadDays.d10plus;
    };

    const recentRequests = await Promise.all(
      (recentRequestsResult || []).map(async (r) => {
        const ci = r.caseInfos || {};
        const timelineEta = r.timeline?.estimatedCompletion
          ? new Date(r.timeline.estimatedCompletion).toISOString().slice(0, 10)
          : null;

        if (timelineEta) {
          return {
            ...r,
            caseInfos: ci,
            estimatedCompletion: timelineEta,
          };
        }

        const createdYmd = toKstYmd(r.createdAt) || getTodayYmdInKst();
        const baseYmd = await normalizeKoreanBusinessDay({ ymd: createdYmd });
        // 생성일 다음 영업일부터 카운트 시작 (신규 의뢰와 동일하게 +2영업일 적용)
        const startYmd = await addKoreanBusinessDays({
          startYmd: baseYmd,
          days: 1,
        });
        const days = resolveNormalLeadDays(ci?.maxDiameter);
        const etaYmd = await addKoreanBusinessDays({ startYmd, days });

        return {
          ...r,
          caseInfos: ci,
          estimatedCompletion: etaYmd,
        };
      })
    );

    const recentRequestsData = recentRequests.map((r) => {
      const ci = r.caseInfos || {};

      return {
        _id: r._id,
        requestId: r.requestId,
        title: r.title,
        status: r.status,
        manufacturerStage: r.manufacturerStage,
        date: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : "",
        estimatedCompletion: r.estimatedCompletion || null,
        patientName: ci.patientName || "",
        tooth: ci.tooth || "",
        caseInfos: ci,
        requestor: r.requestor || null,
        deliveryInfoRef: r.deliveryInfoRef || null,
        createdAt: r.createdAt,
      };
    });

    const responseData = {
      stats: {
        totalRequests: stats.designCount,
        inCam: stats.camCount,
        inProduction: stats.productionCount,
        inShipping: stats.shippingCount,
        completed: stats.completed,
        doneOrCanceled: stats.completed + stats.canceledCount,
      },
      manufacturingSummary,
      riskSummary,
      diameterStats,
      recentRequests,
    };

    if (debug) {
      const stageBreakdown = await Request.aggregate([
        {
          $match: {
            ...requestFilter,
            "caseInfos.implantSystem": { $exists: true, $ne: "" },
            $or: [{ status: { $nin: ["완료", "취소"] } }, dateFilter],
          },
        },
        {
          $addFields: {
            normalizedStage: {
              $let: {
                vars: {
                  status: { $ifNull: ["$status", ""] },
                  stage: { $ifNull: ["$manufacturerStage", ""] },
                  status2: { $ifNull: ["$status2", ""] },
                },
                in: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$$status", "취소"] }, then: "cancel" },
                      {
                        case: {
                          $or: [{ $eq: ["$$status2", "완료"] }],
                        },
                        then: "completed",
                      },
                      {
                        case: {
                          $in: [
                            "$$stage",
                            ["shipping", "tracking", "발송", "추적관리"],
                          ],
                        },
                        then: "shipping",
                      },
                      {
                        case: {
                          $in: [
                            "$$stage",
                            ["machining", "packaging", "production", "생산"],
                          ],
                        },
                        then: "production",
                      },
                      {
                        case: { $in: ["$$stage", ["cam", "CAM", "가공전"]] },
                        then: "cam",
                      },
                      {
                        case: {
                          $in: [
                            "$$stage",
                            ["request", "receive", "의뢰", "의뢰접수"],
                          ],
                        },
                        then: "request",
                      },
                    ],
                    default: "request",
                  },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: {
              status: "$status",
              manufacturerStage: "$manufacturerStage",
              status2: "$status2",
              normalizedStage: "$normalizedStage",
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]);

      responseData.debug = {
        period,
        stageBreakdown,
      };
    }

    return res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
    });
  } catch (error) {
    console.error("Error in getMyDashboardSummary:", error);
    return res.status(500).json({
      success: false,
      message: "대시보드 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getDashboardRiskSummary(req, res) {
  try {
    const { period = "30d" } = req.query;

    const dateFilter = buildDateFilter(period);

    const baseFilter = {
      status: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
    };

    const completionWindowFilter = {
      $or: [
        { status2: { $ne: "완료" } },
        { $and: [{ status2: "완료" }, dateFilter] },
      ],
    };

    const filter =
      req.user?.role === "manufacturer"
        ? {
            $and: [
              baseFilter,
              {
                $or: [
                  { manufacturer: req.user._id },
                  { manufacturer: null },
                  { manufacturer: { $exists: false } },
                ],
              },
              completionWindowFilter,
            ],
          }
        : {
            $and: [
              baseFilter,
              await buildRequestorOrgScopeFilter(req),
              completionWindowFilter,
            ],
          };

    const requests = await Request.find(filter)
      .populate("requestor", "name organization")
      .populate("manufacturer", "name organization")
      .populate("deliveryInfoRef")
      .lean();

    const nowYmd = getTodayYmdInKst();
    const nowMidnight = ymdToKstMidnight(nowYmd) || new Date();
    const delayedItems = [];
    const warningItems = [];

    requests.forEach((r) => {
      if (!r) return;
      const est = r.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      if (!est) return;

      const shippedAt = r.deliveryInfoRef?.shippedAt
        ? new Date(r.deliveryInfoRef.shippedAt)
        : null;
      const deliveredAt = r.deliveryInfoRef?.deliveredAt
        ? new Date(r.deliveryInfoRef.deliveredAt)
        : null;
      const isDone = r.status2 === "완료" || Boolean(deliveredAt || shippedAt);

      const estYmd = toKstYmd(est);
      const estMidnight = ymdToKstMidnight(estYmd);
      if (!estMidnight) return;

      const diffDays = Math.floor(
        (nowMidnight.getTime() - estMidnight.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysOverdue = diffDays > 0 ? diffDays : 0;
      const daysUntilDue = diffDays < 0 ? Math.abs(diffDays) : 0;

      if (!isDone) {
        if (diffDays > 0) {
          delayedItems.push({ r, est, daysOverdue, daysUntilDue });
        } else if (diffDays === 0 || diffDays === -1) {
          warningItems.push({ r, est, daysOverdue, daysUntilDue });
        }
      }
    });

    const totalWithEta = requests.filter(
      (r) => r.timeline?.estimatedCompletion
    ).length;
    const delayedCount = delayedItems.length;
    const warningCount = warningItems.length;
    const onTimeBase = totalWithEta || 1;
    const onTimeRate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100
        )
      )
    );

    const toRiskItem = (entry, level) => {
      const r = entry?.r || entry;
      const est = entry?.est
        ? entry.est
        : r?.timeline?.estimatedCompletion
        ? new Date(r.timeline.estimatedCompletion)
        : null;
      const daysOverdue = entry?.daysOverdue || 0;
      const daysUntilDue = entry?.daysUntilDue || 0;

      const ci = r?.caseInfos || {};

      const requestorText =
        r?.requestor?.organization || r?.requestor?.name || "";
      const manufacturerText =
        r?.manufacturer?.organization || r?.manufacturer?.name || "";

      const secondaryText =
        req.user?.role === "manufacturer"
          ? requestorText
          : [requestorText, manufacturerText].filter(Boolean).join(" → ");

      const title =
        (r?.title || "").trim() ||
        [ci.patientName, ci.tooth].filter(Boolean).join(" ") ||
        r?.requestId ||
        "";

      const mm = est ? String(est.getMonth() + 1).padStart(2, "0") : "";
      const dd = est ? String(est.getDate()).padStart(2, "0") : "";
      const dueLabel = est ? `${mm}/${dd}` : "";

      let message = "";
      if (level === "danger") {
        message = `예상 도착일(${dueLabel}) 기준 ${daysOverdue}일 지연 중입니다.`;
      } else {
        message = `예상 도착일(${dueLabel})이 임박했습니다. (D-${daysUntilDue})`;
      }

      return {
        id: r?.requestId,
        title,
        manufacturer: secondaryText,
        riskLevel: level,
        status: r?.status,
        status2: r?.status2,
        dueDate: est ? est.toISOString().slice(0, 10) : null,
        daysOverdue,
        daysUntilDue,
        message,
        caseInfos: r?.caseInfos || {},
      };
    };

    const riskItems = [
      ...delayedItems
        .slice()
        .sort((a, b) => (b?.daysOverdue || 0) - (a?.daysOverdue || 0))
        .slice(0, 5) // 지연 최대 5건
        .map((entry) => toRiskItem(entry, "danger")),
      ...warningItems
        .slice()
        .sort((a, b) => (a?.daysUntilDue || 0) - (b?.daysUntilDue || 0))
        .slice(0, 5) // 주의 최대 5건
        .map((entry) => toRiskItem(entry, "warning")),
    ];

    return res.status(200).json({
      success: true,
      data: {
        riskSummary: {
          delayedCount,
          warningCount,
          onTimeRate,
          items: riskItems,
        },
      },
    });
  } catch (error) {
    console.error("Error in getDashboardRiskSummary:", error);
    return res.status(500).json({
      success: false,
      message: "지연 위험 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 가격/리퍼럴 통계 (의뢰자용)
 * @route GET /api/requests/my/pricing-referral-stats
 */
export async function getMyPricingReferralStats(req, res) {
  try {
    const requestorId = req.user._id;

    const now = new Date();
    const last30Cutoff = new Date(now);
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);

    // 병렬로 조회하여 성능 개선
    const [myLast30DaysOrders, referredUsers] = await Promise.all([
      Request.countDocuments({
        requestor: requestorId,
        status: "완료",
        createdAt: { $gte: last30Cutoff },
      }),
      User.find({
        referredByUserId: requestorId,
        active: true,
      })
        .select({ _id: 1 })
        .lean(),
    ]);

    const referredUserIds = referredUsers.map((u) => u._id).filter(Boolean);

    const referralLast30DaysOrders = referredUserIds.length
      ? await Request.countDocuments({
          requestor: { $in: referredUserIds },
          status: "완료",
          createdAt: { $gte: last30Cutoff },
        })
      : 0;

    const totalOrders = myLast30DaysOrders + referralLast30DaysOrders;

    const baseUnitPrice = 15000;
    const discountPerOrder = 10;
    const maxDiscountPerUnit = 5000;
    const discountAmount = Math.min(
      totalOrders * discountPerOrder,
      maxDiscountPerUnit
    );

    const user = await User.findById(requestorId)
      .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
      .lean();

    let rule = "volume_discount_last30days";
    let effectiveUnitPrice = Math.max(0, baseUnitPrice - discountAmount);

    const dateSource = user || req.user;

    const baseDate =
      dateSource?.approvedAt ||
      (dateSource?.active ? dateSource?.updatedAt : null) ||
      dateSource?.createdAt;

    let fixedUntil = null;

    if (baseDate) {
      fixedUntil = new Date(baseDate);
      fixedUntil.setDate(fixedUntil.getDate() + 90);
      if (now < fixedUntil) {
        rule = "new_user_90days_fixed_10000";
        effectiveUnitPrice = 10000;
      }
    }

    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (process.env.NODE_ENV !== "production") {
      console.log("[pricing-referral-stats]", {
        requestorId: String(requestorId),
        isMockDevToken,
        now,
        baseDate,
        fixedUntil,
        userDates: user
          ? {
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
              approvedAt: user.approvedAt,
              active: user.active,
            }
          : null,
        myLast30DaysOrders,
        referralLast30DaysOrders,
        totalOrders,
        discountAmount,
        effectiveUnitPrice,
        rule,
      });
    }

    const responseData = {
      last30Cutoff,
      myLast30DaysOrders,
      referralLast30DaysOrders,
      totalOrders,
      baseUnitPrice,
      discountPerOrder,
      maxDiscountPerUnit,
      discountAmount,
      effectiveUnitPrice,
      rule,
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: {
              requestorId,
              isMockDevToken,
              now,
              baseDate,
              fixedUntil,
              userDates: user
                ? {
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                    approvedAt: user.approvedAt,
                    active: user.active,
                  }
                : null,
            },
          }
        : {}),
    };

    return res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
    });
  } catch (error) {
    console.error("Error in getMyPricingReferralStats:", error);
    return res.status(500).json({
      success: false,
      message: "가격/리퍼럴 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
