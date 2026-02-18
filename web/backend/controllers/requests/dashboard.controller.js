import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import PricingReferralStatsSnapshot from "../../models/pricingReferralStatsSnapshot.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import { Types } from "mongoose";
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
  getReferralGroupLeaderId,
} from "./utils.js";
import { computeShippingPriority } from "./shippingPriority.utils.js";

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
        diameter: 12,
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
 * 리퍼럴 직계 멤버 목록 (의뢰자용)
 * @route GET /api/requests/my/referral-direct-members
 */
export async function getMyReferralDirectMembers(req, res) {
  try {
    const requestorId = req.user?._id;
    if (!requestorId) {
      return res.status(400).json({
        success: false,
        message: "사용자 ID가 없습니다.",
      });
    }

    const now = new Date();
    const last30Cutoff = new Date(now);
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);

    const groupLeaderId = await getReferralGroupLeaderId(requestorId);

    const leader = await User.findById(groupLeaderId)
      .select({ organizationId: 1 })
      .lean();

    const orgMemberIds = [];
    if (leader?.organizationId) {
      const org = await RequestorOrganization.findById(leader.organizationId)
        .select({ owner: 1, owners: 1, members: 1 })
        .lean();

      const ownerId = String(org?.owner || "");
      const ownerIds = Array.isArray(org?.owners) ? org.owners.map(String) : [];
      const memberIds = Array.isArray(org?.members)
        ? org.members.map(String)
        : [];
      orgMemberIds.push(ownerId, ...ownerIds, ...memberIds);
    }

    const orgMemberObjectIds = Array.from(new Set(orgMemberIds))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const members = await User.find({
      referredByUserId:
        orgMemberObjectIds.length > 0
          ? { $in: orgMemberObjectIds }
          : requestorId,
      active: true,
      role: { $in: ["requestor", "salesman"] },
    })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        organization: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
      })
      .sort({ createdAt: -1 })
      .lean();

    const memberIds = (members || []).map((m) => m._id).filter(Boolean);
    const orderRows = memberIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestor: { $in: memberIds },
              status: "완료",
              createdAt: { $gte: last30Cutoff },
            },
          },
          { $group: { _id: "$requestor", count: { $sum: 1 } } },
        ])
      : [];
    const ordersByUserId = new Map(
      (orderRows || []).map((r) => [String(r._id), Number(r.count || 0)]),
    );

    return res.status(200).json({
      success: true,
      data: {
        members: (members || []).map((m) => ({
          ...m,
          last30DaysOrders: ordersByUserId.get(String(m._id)) || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error in getMyReferralDirectMembers:", error);
    return res.status(500).json({
      success: false,
      message: "직계 멤버 조회 중 오류가 발생했습니다.",
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
              ...dateFilter,
              "caseInfos.implantSystem": { $exists: true, $ne: "" },
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
                    shippingReviewStatus: {
                      $ifNull: ["$caseInfos.reviewByStage.shipping.status", ""],
                    },
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
                            $or: [
                              { $eq: ["$$shippingReviewStatus", "APPROVED"] },
                              { $eq: ["$$status", "완료"] },
                              { $eq: ["$$status2", "완료"] },
                            ],
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
                              {
                                $in: [
                                  "$$status",
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
                                $in: ["$$stage", ["packaging", "세척.포장"]],
                              },
                              {
                                $in: ["$$status", ["packaging", "세척.포장"]],
                              },
                            ],
                          },
                          then: "packaging",
                        },
                        {
                          case: {
                            $or: [
                              {
                                $in: [
                                  "$$stage",
                                  ["machining", "production", "가공", "생산"],
                                ],
                              },
                              {
                                $in: [
                                  "$$status",
                                  ["machining", "production", "가공", "생산"],
                                ],
                              },
                            ],
                          },
                          then: "machining",
                        },
                        {
                          case: {
                            $or: [
                              { $in: ["$$stage", ["cam", "CAM", "가공전"]] },
                              { $in: ["$$status", ["cam", "CAM", "가공전"]] },
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
                              {
                                $in: [
                                  "$$status",
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
              machiningCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "machining"] }, 1, 0],
                },
              },
              packagingCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "packaging"] }, 1, 0],
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
      machiningCount: 0,
      packagingCount: 0,
      shippingCount: 0,
    };

    // '발송(완료)' 카드는 발송/추적 + 배송 승인 완료 건을 함께 보여준다.
    const shippingPlusCompleted = stats.shippingCount + stats.completed;

    const totalActive =
      stats.designCount +
        stats.camCount +
        stats.machiningCount +
        stats.packagingCount +
        shippingPlusCompleted || 1;

    const manufacturingSummary = {
      totalActive,
      stages: [
        { key: "design", label: "의뢰 접수", count: stats.designCount },
        { key: "cam", label: "CAM", count: stats.camCount },
        { key: "machining", label: "가공", count: stats.machiningCount },
        { key: "packaging", label: "세척.포장", count: stats.packagingCount },
        { key: "shipping", label: "발송", count: shippingPlusCompleted },
      ].map((s) => ({
        ...s,
        percent: totalActive ? Math.round((s.count / totalActive) * 100) : 0,
      })),
    };

    // Risk Summary: 지연 위험 요약 (시각 기반)
    const { calculateRiskSummary } = await import("./production.utils.js");
    const activeRequests = await Request.find({
      ...requestFilter,
      status: { $in: ["의뢰", "CAM", "가공", "세척.포장"] },
    })
      .select(
        "requestId title status status2 manufacturerStage productionSchedule caseInfos createdAt timeline estimatedCompletion",
      )
      .lean();

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
      }),
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

    const inProgress =
      stats.camCount + stats.machiningCount + stats.packagingCount;

    const responseData = {
      stats: {
        totalRequests: stats.designCount,
        totalRequestsChange: "+0%",
        inProgress,
        inProgressChange: "+0%",
        inCam: stats.camCount,
        inCamChange: "+0%",
        inProduction: stats.machiningCount,
        inProductionChange: "+0%",
        inPackaging: stats.packagingCount,
        inPackagingChange: "+0%",
        inShipping: shippingPlusCompleted,
        inShippingChange: "+0%",
        canceled: stats.canceledCount,
        canceledChange: "+0%",
        completed: stats.completed,
        doneOrCanceled: stats.completed + stats.canceledCount,
        doneOrCanceledChange: "+0%",
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
                  shippingReviewStatus: {
                    $ifNull: ["$caseInfos.reviewByStage.shipping.status", ""],
                  },
                },
                in: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$$status", "취소"] }, then: "cancel" },
                      {
                        case: {
                          $or: [
                            { $eq: ["$$shippingReviewStatus", "APPROVED"] },
                            { $eq: ["$$status", "완료"] },
                            { $eq: ["$$status2", "완료"] },
                          ],
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

    const role = String(req.user?.role || "");

    const filter =
      role === "manufacturer"
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
        : role === "admin"
          ? {
              $and: [baseFilter, completionWindowFilter],
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

    const now = new Date();
    const delayedItems = [];
    const warningItems = [];

    for (const r of requests) {
      if (!r) continue;

      const shippedAt = r.deliveryInfoRef?.shippedAt
        ? new Date(r.deliveryInfoRef.shippedAt)
        : null;
      const deliveredAt = r.deliveryInfoRef?.deliveredAt
        ? new Date(r.deliveryInfoRef.deliveredAt)
        : null;
      const isDone = r.status2 === "완료" || Boolean(deliveredAt || shippedAt);
      if (isDone) continue;

      const stage = String(r.manufacturerStage || r.status || "").trim();
      const isPreShip = ["의뢰", "CAM", "생산"].includes(stage);
      if (!isPreShip) continue;

      const sp = await computeShippingPriority({ request: r, now });
      if (!sp) continue;

      if (sp.level === "danger") {
        delayedItems.push({ r, shippingPriority: sp });
        continue;
      }
      if (sp.level === "warning") {
        warningItems.push({ r, shippingPriority: sp });
      }
    }

    const totalWithDeadline = delayedItems.length + warningItems.length;
    const delayedCount = delayedItems.length;
    const warningCount = warningItems.length;
    const onTimeBase = Math.max(1, totalWithDeadline + 1);
    const onTimeRate = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100,
        ),
      ),
    );

    const toRiskItem = (entry, level) => {
      const r = entry?.r || entry;
      const sp = entry?.shippingPriority || null;
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

      const message =
        level === "danger"
          ? `출고 마감(15:00) 기준 처리 지연 위험이 매우 큽니다. ${
              sp?.label || ""
            }`.trim()
          : `출고 마감(15:00)이 임박했습니다. ${sp?.label || ""}`.trim();

      return {
        id: r?.requestId,
        title,
        manufacturer: secondaryText,
        riskLevel: level,
        status: r?.status,
        status2: r?.status2,
        dueDate: sp?.deadlineAt || null,
        message,
        caseInfos: r?.caseInfos || {},
        shippingPriority: sp || undefined,
      };
    };

    const riskItems = [
      ...delayedItems
        .slice()
        .sort(
          (a, b) =>
            (b?.shippingPriority?.score || 0) -
            (a?.shippingPriority?.score || 0),
        )
        .slice(0, 5) // 지연 최대 5건
        .map((entry) => toRiskItem(entry, "danger")),
      ...warningItems
        .slice()
        .sort(
          (a, b) =>
            (b?.shippingPriority?.score || 0) -
            (a?.shippingPriority?.score || 0),
        )
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
 * 그룹 기반 주문량 합산: 리더 또는 멤버 모두 그룹 내 전체 주문량 조회
 * @route GET /api/requests/my/pricing-referral-stats
 */
export async function getMyPricingReferralStats(req, res) {
  try {
    const requestorId = req.user._id;

    if (!requestorId) {
      return res.status(400).json({
        success: false,
        message: "사용자 ID가 없습니다.",
      });
    }

    const now = new Date();
    const last30Cutoff = new Date(now);
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);

    const ymd = toKstYmd(now);
    if (!ymd) {
      return res.status(500).json({
        success: false,
        message: "날짜 계산에 실패했습니다.",
      });
    }

    const groupLeaderId = await getReferralGroupLeaderId(requestorId);

    const cachedSnapshot = await PricingReferralStatsSnapshot.findOne({
      $or: [
        { ownerUserId: requestorId, ymd },
        { groupLeaderId, ymd, ownerUserId: null },
      ],
    })
      .select({
        ownerUserId: 1,
        groupMemberCount: 1,
        groupTotalOrders: 1,
        computedAt: 1,
      })
      .lean();

    const cachedGroupMemberCount = cachedSnapshot?.groupMemberCount;
    const cachedGroupTotalOrders = cachedSnapshot?.groupTotalOrders;

    // 조직 단위: 조직 구성원(대표/직원) + 조직 구성원이 추천한 1단계만 합산
    const leader = await User.findById(groupLeaderId)
      .select({ organizationId: 1 })
      .lean();

    let orgMemberObjectIds = [];
    if (leader?.organizationId) {
      const org = await RequestorOrganization.findById(leader.organizationId)
        .select({ owner: 1, owners: 1, members: 1 })
        .lean();

      const ownerId = String(org?.owner || "");
      const ownerIds = Array.isArray(org?.owners) ? org.owners.map(String) : [];
      const memberIds = Array.isArray(org?.members)
        ? org.members.map(String)
        : [];
      const allIds = [ownerId, ...ownerIds, ...memberIds]
        .map(String)
        .filter((id) => Types.ObjectId.isValid(id));
      orgMemberObjectIds = allIds.map((id) => new Types.ObjectId(id));
    }

    const directChildren = await User.find({
      referredByUserId:
        orgMemberObjectIds.length > 0
          ? { $in: orgMemberObjectIds }
          : requestorId,
      active: true,
    })
      .select({ _id: 1 })
      .lean();

    const baseMemberIds =
      orgMemberObjectIds.length > 0 ? orgMemberObjectIds : [requestorId];
    const groupMemberIds = [
      ...baseMemberIds,
      ...(directChildren || []).map((c) => c._id).filter(Boolean),
    ];

    const groupMemberCount = groupMemberIds.length;

    // 그룹 내 모든 멤버의 지난 30일 주문량 합산 (항상 실시간 계산)
    const [freshGroupTotalOrders, myLast30DaysOrders, user] = await Promise.all(
      [
        groupMemberIds.length
          ? Request.countDocuments({
              requestor: { $in: groupMemberIds },
              status: "완료",
              createdAt: { $gte: last30Cutoff },
            })
          : Promise.resolve(0),
        Request.countDocuments({
          requestor: requestorId,
          status: "완료",
          createdAt: { $gte: last30Cutoff },
        }),
        User.findById(requestorId)
          .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
          .lean(),
      ],
    );

    const totalLast30DaysOrders = freshGroupTotalOrders;

    await PricingReferralStatsSnapshot.findOneAndUpdate(
      { ownerUserId: requestorId, ymd },
      {
        $set: {
          ownerUserId: requestorId,
          groupLeaderId,
          groupMemberCount,
          groupTotalOrders: totalLast30DaysOrders,
          computedAt: now,
        },
      },
      { upsert: true, new: true },
    );

    const totalOrders = totalLast30DaysOrders;

    const baseUnitPrice = 15000;
    const discountPerOrder = 10;
    const maxDiscountPerUnit = 5000;
    const discountAmount = Math.min(
      totalOrders * discountPerOrder,
      maxDiscountPerUnit,
    );

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
        totalOrders,
        discountAmount,
        effectiveUnitPrice,
        rule,
      });
    }

    const responseData = {
      last30Cutoff,
      myLast30DaysOrders,
      groupTotalOrders: totalLast30DaysOrders,
      totalOrders,
      baseUnitPrice,
      discountPerOrder,
      maxDiscountPerUnit,
      discountAmount,
      effectiveUnitPrice,
      rule,
      groupMemberCount,
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
              groupMemberIds: groupMemberIds.map(String),
              ymd,
              snapshot: cachedSnapshot
                ? {
                    groupMemberCount: cachedSnapshot.groupMemberCount,
                    groupTotalOrders: cachedSnapshot.groupTotalOrders,
                    computedAt: cachedSnapshot.computedAt,
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
    const devMessage =
      process.env.NODE_ENV !== "production"
        ? `${error?.message || "unknown error"}`
        : "가격/리퍼럴 통계 조회 중 오류가 발생했습니다.";
    return res.status(500).json({
      success: false,
      message: devMessage,
      error: error.message,
    });
  }
}
