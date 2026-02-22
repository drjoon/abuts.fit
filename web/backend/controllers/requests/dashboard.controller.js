import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import PricingReferralStatsSnapshot from "../../models/pricingReferralStatsSnapshot.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import Machine from "../../models/machine.model.js";
import { Types } from "mongoose";
import {
  buildRequestorOrgScopeFilter,
  buildRequestorOrgFilter,
  getDeliveryEtaLeadDays,
  normalizeCaseInfosImplantFields,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  getThisMonthStartYmdInKst,
  getLast30DaysRangeUtc,
  normalizeKoreanBusinessDay,
  getReferralGroupLeaderId,
} from "./utils.js";
import { computeShippingPriority } from "./shippingPriority.utils.js";

function getLastMonthRangeUtc() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end };
}

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
 * 제조사 대시보드 요약 (할당된 의뢰 기준)
 * @route GET /api/requests/assigned/dashboard-summary
 */
export async function getAssignedDashboardSummary(req, res) {
  try {
    const { period = "30d" } = req.query;
    const role = String(req.user?.role || "").trim();
    if (role !== "manufacturer" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "권한이 없습니다.",
      });
    }

    const dateFilter = buildDateFilter(period);

    const machineIds = await (async () => {
      if (role === "admin") {
        const list = await Machine.find({})
          .select({ uid: 1 })
          .lean()
          .catch(() => []);
        return (Array.isArray(list) ? list : [])
          .map((m) => String(m?.uid || "").trim())
          .filter(Boolean);
      }

      const list = await Machine.find({ manufacturer: req.user._id })
        .select({ uid: 1 })
        .lean()
        .catch(() => []);
      return (Array.isArray(list) ? list : [])
        .map((m) => String(m?.uid || "").trim())
        .filter(Boolean);
    })();

    if (!machineIds.length) {
      return res.status(200).json({
        success: true,
        data: {
          total: 0,
          canceledCount: 0,
          trackingCount: 0,
          requestCount: 0,
          camCount: 0,
          machiningCount: 0,
          packingCount: 0,
          shippingCount: 0,
        },
      });
    }

    const baseFilter = {
      manufacturerStage: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
      "productionSchedule.assignedMachine": { $in: machineIds },
    };

    const [statsResult] = await Request.aggregate([
      {
        $match: {
          ...baseFilter,
          ...dateFilter,
        },
      },
      {
        $addFields: {
          normalizedStage: {
            $let: {
              vars: {
                stage: { $ifNull: ["$manufacturerStage", ""] },
              },
              in: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $in: ["$$stage", ["tracking", "추적관리"]],
                      },
                      then: "tracking",
                    },
                    {
                      case: {
                        $in: ["$$stage", ["shipping", "포장.발송"]],
                      },
                      then: "shipping",
                    },
                    {
                      case: {
                        $in: ["$$stage", ["packing", "세척.패킹"]],
                      },
                      then: "packing",
                    },
                    {
                      case: {
                        $in: ["$$stage", ["machining", "가공"]],
                      },
                      then: "machining",
                    },
                    {
                      case: {
                        $in: ["$$stage", ["cam", "CAM"]],
                      },
                      then: "cam",
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
            $sum: { $cond: [{ $eq: ["$manufacturerStage", "취소"] }, 1, 0] },
          },
          trackingCount: {
            $sum: { $cond: [{ $eq: ["$normalizedStage", "tracking"] }, 1, 0] },
          },
          requestCount: {
            $sum: { $cond: [{ $eq: ["$normalizedStage", "request"] }, 1, 0] },
          },
          camCount: {
            $sum: { $cond: [{ $eq: ["$normalizedStage", "cam"] }, 1, 0] },
          },
          machiningCount: {
            $sum: { $cond: [{ $eq: ["$normalizedStage", "machining"] }, 1, 0] },
          },
          packingCount: {
            $sum: { $cond: [{ $eq: ["$normalizedStage", "packing"] }, 1, 0] },
          },
          shippingCount: {
            $sum: { $cond: [{ $eq: ["$normalizedStage", "shipping"] }, 1, 0] },
          },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total: Number(statsResult?.total ?? 0) || 0,
        canceledCount: Number(statsResult?.canceledCount ?? 0) || 0,
        trackingCount: Number(statsResult?.trackingCount ?? 0) || 0,
        requestCount: Number(statsResult?.requestCount ?? 0) || 0,
        camCount: Number(statsResult?.camCount ?? 0) || 0,
        machiningCount: Number(statsResult?.machiningCount ?? 0) || 0,
        packingCount: Number(statsResult?.packingCount ?? 0) || 0,
        shippingCount: Number(statsResult?.shippingCount ?? 0) || 0,
      },
    });
  } catch (error) {
    console.error("getAssignedDashboardSummary error", error);
    return res.status(500).json({
      success: false,
      message: "제조사 대시보드 요약 조회 중 오류가 발생했습니다.",
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

    const range30 = getLast30DaysRangeUtc();
    const lastMonthStart =
      range30?.start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lastMonthEnd = range30?.end ?? new Date();

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
              "caseInfos.reviewByStage.shipping.status": "APPROVED",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          {
            $group: {
              _id: "$requestor",
              count: { $sum: 1 },
            },
          },
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
          lastMonthOrders: ordersByUserId.get(String(m._id)) || 0,
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
                    stage: { $ifNull: ["$manufacturerStage", ""] },
                  },
                  in: {
                    $switch: {
                      branches: [
                        {
                          case: {
                            $in: ["$$stage", ["tracking", "추적관리"]],
                          },
                          then: "tracking",
                        },
                        {
                          case: {
                            $in: ["$$stage", ["shipping", "포장.발송"]],
                          },
                          then: "shipping",
                        },
                        {
                          case: {
                            $in: ["$$stage", ["packing", "세척.패킹"]],
                          },
                          then: "packing",
                        },
                        {
                          case: {
                            $in: ["$$stage", ["machining", "가공"]],
                          },
                          then: "machining",
                        },
                        {
                          case: {
                            $in: ["$$stage", ["cam", "CAM"]],
                          },
                          then: "cam",
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
                $sum: {
                  $cond: [{ $eq: ["$manufacturerStage", "취소"] }, 1, 0],
                },
              },
              trackingCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "tracking"] }, 1, 0],
                },
              },
              requestCount: {
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
              packingCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "packing"] }, 1, 0],
                },
              },
              shippingCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "shipping"] }, 1, 0],
                },
              },
              trackingCount: {
                $sum: {
                  $cond: [{ $eq: ["$normalizedStage", "tracking"] }, 1, 0],
                },
              },
            },
          },
        ]),
        Request.find({
          ...requestFilter,
          "caseInfos.implantSystem": { $exists: true, $ne: "" },
          manufacturerStage: { $ne: "취소" },
        })
          .select({
            _id: 1,
            requestId: 1,
            title: 1,
            manufacturerStage: 1,
            createdAt: 1,
            caseInfos: 1,
            timeline: 1,
            productionSchedule: 1,
            shippingMode: 1,
            finalShipping: 1,
            originalShipping: 1,
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
      trackingCount: 0,
      requestCount: 0,
      camCount: 0,
      machiningCount: 0,
      packingCount: 0,
      shippingCount: 0,
    };

    // '포장.발송'은 shipping, '추적관리'는 tracking으로 분리.
    const shippingTotal = stats.shippingCount;

    const totalActive =
      stats.requestCount +
        stats.camCount +
        stats.machiningCount +
        stats.packingCount +
        shippingTotal +
        stats.trackingCount || 1;

    const manufacturingSummary = {
      totalActive,
      stages: [
        { key: "request", label: "의뢰", count: stats.requestCount },
        { key: "cam", label: "CAM", count: stats.camCount },
        { key: "machining", label: "가공", count: stats.machiningCount },
        { key: "packing", label: "세척.패킹", count: stats.packingCount },
        { key: "shipping", label: "포장.발송", count: shippingTotal },
        { key: "tracking", label: "추적관리", count: stats.trackingCount },
      ].map((s) => ({
        ...s,
        percent: totalActive ? Math.round((s.count / totalActive) * 100) : 0,
      })),
    };

    // Risk Summary: 지연 위험 요약 (시각 기반)
    const { calculateRiskSummary } = await import("./production.utils.js");
    const activeRequests = await Request.find({
      ...requestFilter,
      manufacturerStage: {
        $in: [
          "request",
          "cam",
          "machining",
          "packing",
          "shipping",
          "tracking",
          "의뢰",
          "CAM",
          "가공",
          "세척.패킹",
          "포장.발송",
          "추적관리",
        ],
      },
    })
      .select(
        "requestId title manufacturerStage productionSchedule caseInfos createdAt timeline shippingMode finalShipping originalShipping",
      )
      .lean();

    const riskSummary = calculateRiskSummary(activeRequests);

    // 직경별 통계 실제 집계

    const recentRequests = await Promise.all(
      (recentRequestsResult || []).map(async (r) => {
        const ci = r.caseInfos || {};
        const existingShipYmd =
          typeof r.timeline?.estimatedShipYmd === "string" &&
          r.timeline.estimatedShipYmd.trim()
            ? r.timeline.estimatedShipYmd.trim()
            : null;

        if (existingShipYmd) {
          return {
            ...r,
            caseInfos: ci,
            estimatedShipYmd: existingShipYmd,
          };
        }

        const pickup = r.productionSchedule?.scheduledShipPickup;
        const pickupYmd = pickup ? toKstYmd(pickup) : null;
        if (pickupYmd) {
          return {
            ...r,
            caseInfos: ci,
            estimatedShipYmd: pickupYmd,
          };
        }

        const createdYmd = toKstYmd(r.createdAt) || getTodayYmdInKst();
        const baseYmd = await normalizeKoreanBusinessDay({ ymd: createdYmd });
        const estimatedShipYmd = await addKoreanBusinessDays({
          startYmd: baseYmd,
          days: 1,
        });

        return {
          ...r,
          caseInfos: ci,
          estimatedShipYmd,
        };
      }),
    );

    const recentRequestsData = recentRequests.map((r) => {
      const ci = r.caseInfos || {};

      return {
        _id: r._id,
        requestId: r.requestId,
        title: r.title,
        manufacturerStage: r.manufacturerStage,
        date: r.createdAt ? toKstYmd(r.createdAt) || "" : "",
        estimatedShipYmd: r.estimatedShipYmd || null,
        patientName: ci.patientName || "",
        tooth: ci.tooth || "",
        caseInfos: ci,
        requestor: r.requestor || null,
        deliveryInfoRef: r.deliveryInfoRef || null,
        createdAt: r.createdAt,
      };
    });

    const inProgress =
      stats.camCount + stats.machiningCount + stats.packingCount;

    const responseData = {
      stats: {
        totalRequests: stats.requestCount,
        totalRequestsChange: "+0%",
        inProgress,
        inProgressChange: "+0%",
        inCam: stats.camCount,
        inCamChange: "+0%",
        inProduction: stats.machiningCount,
        inProductionChange: "+0%",
        inPacking: stats.packingCount,
        inPackingChange: "+0%",
        inShipping: shippingTotal,
        inShippingChange: "+0%",
        inTracking: stats.trackingCount,
        inTrackingChange: "+0%",
        canceled: stats.canceledCount,
        canceledChange: "+0%",
        tracking: stats.trackingCount,
        doneOrCanceled: stats.trackingCount + stats.canceledCount,
        doneOrCanceledChange: "+0%",
      },
      manufacturingSummary,
      riskSummary,
      recentRequests,
    };

    if (debug) {
      const stageBreakdown = await Request.aggregate([
        {
          $match: {
            ...requestFilter,
            "caseInfos.implantSystem": { $exists: true, $ne: "" },
            manufacturerStage: { $ne: "취소" },
          },
        },
        {
          $addFields: {
            normalizedStage: {
              $let: {
                vars: {
                  stage: { $ifNull: ["$manufacturerStage", ""] },
                },
                in: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $in: ["$$stage", ["tracking", "추적관리"]],
                        },
                        then: "tracking",
                      },
                      {
                        case: {
                          $in: ["$$stage", ["shipping", "포장.발송"]],
                        },
                        then: "shipping",
                      },
                      {
                        case: {
                          $in: ["$$stage", ["packing", "세척.패킹"]],
                        },
                        then: "packing",
                      },
                      {
                        case: {
                          $in: ["$$stage", ["machining", "가공"]],
                        },
                        then: "machining",
                      },
                      {
                        case: {
                          $in: ["$$stage", ["cam", "CAM"]],
                        },
                        then: "cam",
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
              manufacturerStage: "$manufacturerStage",
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
      manufacturerStage: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
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
            ],
          }
        : role === "admin"
          ? {
              $and: [baseFilter],
            }
          : {
              $and: [baseFilter, await buildRequestorOrgScopeFilter(req)],
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
      const isDone =
        r?.caseInfos?.reviewByStage?.shipping?.status === "APPROVED" ||
        Boolean(deliveredAt || shippedAt);
      if (isDone) continue;

      const stage = String(r.manufacturerStage || "").trim();
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
    const range30 = getLast30DaysRangeUtc(now);
    if (!range30) {
      return res.status(500).json({
        success: false,
        message: "날짜 계산에 실패했습니다.",
      });
    }
    const { start: lastMonthStart, end: lastMonthEnd } = range30;

    const ymd = getTodayYmdInKst();
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

    // 누락 감지: 오늘 스냅샷이 없으면 당일 자정 기준 30일로 즉시 계산 (워커 장애 복구)
    const snapshotMissing = !cachedSnapshot;

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

    // 그룹 내 모든 멤버의 최근 30일 주문량 합산 (항상 실시간 계산)
    const [freshGroupTotalOrders, myLastMonthOrders, user] = await Promise.all([
      groupMemberIds.length
        ? Request.countDocuments({
            requestor: { $in: groupMemberIds },
            "caseInfos.reviewByStage.shipping.status": "APPROVED",
            createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          })
        : Promise.resolve(0),
      Request.countDocuments({
        requestor: requestorId,
        "caseInfos.reviewByStage.shipping.status": "APPROVED",
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      }),
      User.findById(requestorId)
        .select({ createdAt: 1, updatedAt: 1, active: 1, approvedAt: 1 })
        .lean(),
    ]);

    const totalLastMonthOrders = freshGroupTotalOrders;

    await PricingReferralStatsSnapshot.findOneAndUpdate(
      { ownerUserId: requestorId, ymd },
      {
        $set: {
          ownerUserId: requestorId,
          groupLeaderId,
          groupMemberCount,
          groupTotalOrders: totalLastMonthOrders,
          computedAt: now,
        },
      },
      { upsert: true, new: true },
    );

    const totalOrders = totalLastMonthOrders;

    const baseUnitPrice = 15000;
    const discountPerOrder = 20;
    const maxDiscountPerUnit = 5000;
    const discountAmount = Math.min(
      totalOrders * discountPerOrder,
      maxDiscountPerUnit,
    );

    let rule = "volume_discount_last_month";
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
        myLastMonthOrders,
        totalOrders,
        discountAmount,
        effectiveUnitPrice,
        rule,
      });
    }

    const responseData = {
      lastMonthStart,
      lastMonthEnd,
      myLastMonthOrders,
      groupTotalOrders: totalLastMonthOrders,
      totalOrders,
      baseUnitPrice,
      discountPerOrder,
      maxDiscountPerUnit,
      discountAmount,
      effectiveUnitPrice,
      rule,
      groupMemberCount,
      snapshotMissing,
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: {
              lastMonthStart,
              lastMonthEnd,
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
