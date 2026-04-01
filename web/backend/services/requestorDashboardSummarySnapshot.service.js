import { Types } from "mongoose";
import Request from "../models/request.model.js";
import RequestorDashboardSummarySnapshot from "../models/requestorDashboardSummarySnapshot.model.js";
import {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  normalizeKoreanBusinessDay,
  toKstYmd,
} from "../controllers/requests/utils.js";

const buildDateFilter = (period) => {
  const now = new Date();

  if (!period || period === "all") return {};

  if (period === "thisMonth" || period === "lastMonth") {
    // KST 기준 월 계산
    const nowKst = toKstYmd(now);
    const [year, month] = nowKst.split("-").map(Number);

    // 이번 달 시작: KST YYYY-MM-01 00:00:00
    const startOfThisMonth = new Date(
      `${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`,
    );
    // 다음 달 시작
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const startOfNextMonth = new Date(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`,
    );

    if (period === "thisMonth") {
      return { createdAt: { $gte: startOfThisMonth, $lt: startOfNextMonth } };
    }

    // 지난 달 시작
    const lastMonth = month === 1 ? 12 : month - 1;
    const lastYear = month === 1 ? year - 1 : year;
    const startOfLastMonth = new Date(
      `${lastYear}-${String(lastMonth).padStart(2, "0")}-01T00:00:00+09:00`,
    );
    return { createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth } };
  }

  let days = 30;
  if (period === "7d") days = 7;
  else if (period === "90d") days = 90;

  // KST 기준 N일 전
  const todayKst = toKstYmd(now);
  const fromDate = new Date(todayKst);
  fromDate.setDate(fromDate.getDate() - days);
  const fromKst = new Date(`${toKstYmd(fromDate)}T00:00:00+09:00`);
  return { createdAt: { $gte: fromKst } };
};

const getRequestEstimatedShipYmd = ({ request, fallbackMap }) => {
  const timeline = request?.timeline || {};
  const next =
    typeof timeline.nextEstimatedShipYmd === "string" &&
    timeline.nextEstimatedShipYmd.trim()
      ? timeline.nextEstimatedShipYmd.trim()
      : null;
  const est =
    typeof timeline.estimatedShipYmd === "string" &&
    timeline.estimatedShipYmd.trim()
      ? timeline.estimatedShipYmd.trim()
      : null;
  const orig =
    typeof timeline.originalEstimatedShipYmd === "string" &&
    timeline.originalEstimatedShipYmd.trim()
      ? timeline.originalEstimatedShipYmd.trim()
      : null;

  if (next || est || orig) {
    return next || est || orig;
  }

  const pickup = request?.productionSchedule?.scheduledShipPickup;
  const pickupYmd = pickup ? toKstYmd(pickup) : null;
  if (pickupYmd) {
    return pickupYmd;
  }

  const createdYmd = toKstYmd(request?.createdAt) || getTodayYmdInKst();
  return fallbackMap.get(createdYmd) || createdYmd;
};

const recomputeSingleRequestorDashboardSummarySnapshot = async ({
  businessAnchorId,
  periodKey,
}) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const normalizedPeriodKey = String(periodKey || "30d").trim() || "30d";
  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  const requestFilter = {
    businessAnchorId: new Types.ObjectId(anchorId),
  };
  const dateFilter = buildDateFilter(normalizedPeriodKey);

  const [statsResult, shippingPackageRows, recentRequestsResult] =
    await Promise.all([
      Request.aggregate([
        {
          $match: {
            ...requestFilter,
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
                        case: { $eq: ["$$stage", "취소"] },
                        then: "cancel",
                      },
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
          },
        },
      ]),
      Request.aggregate([
        {
          $match: {
            ...requestFilter,
            ...dateFilter,
            manufacturerStage: { $ne: "취소" },
          },
        },
        {
          $project: {
            manufacturerStage: 1,
            shippingPackageId: 1,
          },
        },
        {
          $addFields: {
            stageBucket: {
              $switch: {
                branches: [
                  {
                    case: {
                      $in: ["$manufacturerStage", ["tracking", "추적관리"]],
                    },
                    then: "tracking",
                  },
                  {
                    case: {
                      $in: ["$manufacturerStage", ["shipping", "포장.발송"]],
                    },
                    then: "shipping",
                  },
                ],
                default: null,
              },
            },
          },
        },
        {
          $match: {
            stageBucket: { $in: ["shipping", "tracking"] },
          },
        },
        {
          $group: {
            _id: "$stageBucket",
            productCount: { $sum: 1 },
            packageIds: {
              $addToSet: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$shippingPackageId", null] },
                      { $ne: ["$shippingPackageId", ""] },
                    ],
                  },
                  "$shippingPackageId",
                  "$$REMOVE",
                ],
              },
            },
          },
        },
      ]),
      Request.find({
        ...requestFilter,
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
          price: 1,
        })
        .sort({ createdAt: -1 })
        .limit(10)
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

  const shippingPackageStatsMap = new Map(
    (Array.isArray(shippingPackageRows) ? shippingPackageRows : []).map(
      (row) => {
        const packageIds = Array.isArray(row?.packageIds)
          ? row.packageIds
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
        return [
          String(row?._id || "").trim(),
          {
            productCount: Number(row?.productCount || 0),
            packageCount: new Set(packageIds).size,
          },
        ];
      },
    ),
  );

  const shippingCounts = shippingPackageStatsMap.get("shipping") || {
    productCount: Number(stats.shippingCount || 0),
    packageCount: 0,
  };
  const trackingCounts = shippingPackageStatsMap.get("tracking") || {
    productCount: Number(stats.trackingCount || 0),
    packageCount: 0,
  };

  const shippingTotal = Number(shippingCounts.productCount || 0);
  const trackingTotal = Number(trackingCounts.productCount || 0);
  const totalActive =
    stats.requestCount +
      stats.camCount +
      stats.machiningCount +
      stats.packingCount +
      shippingTotal +
      trackingTotal || 1;

  const manufacturingSummary = {
    totalActive,
    stages: [
      { key: "request", label: "의뢰", count: stats.requestCount },
      { key: "cam", label: "CAM", count: stats.camCount },
      { key: "machining", label: "가공", count: stats.machiningCount },
      { key: "packing", label: "세척.패킹", count: stats.packingCount },
      { key: "shipping", label: "포장.발송", count: shippingTotal },
      { key: "tracking", label: "추적관리", count: trackingTotal },
    ].map((s) => ({
      ...s,
      percent: totalActive ? Math.round((s.count / totalActive) * 100) : 0,
    })),
  };

  const snapshotStats = {
    totalRequests: Number(stats.requestCount || 0),
    totalRequestsChange: "+0%",
    inProgress: Number(
      Number(stats.camCount || 0) +
        Number(stats.machiningCount || 0) +
        Number(stats.packingCount || 0),
    ),
    inProgressChange: "+0%",
    inCam: Number(stats.camCount || 0),
    inCamChange: "+0%",
    inProduction: Number(stats.machiningCount || 0),
    inProductionChange: "+0%",
    inPacking: Number(stats.packingCount || 0),
    inPackingChange: "+0%",
    inShipping: shippingTotal,
    inShippingBoxes: Number(shippingCounts.packageCount || 0),
    inShippingChange: "+0%",
    inTracking: trackingTotal,
    inTrackingBoxes: Number(trackingCounts.packageCount || 0),
    inTrackingChange: "+0%",
    canceled: Number(stats.canceledCount || 0),
    canceledChange: "+0%",
    tracking: trackingTotal,
    doneOrCanceled: trackingTotal + Number(stats.canceledCount || 0),
    doneOrCanceledChange: "+0%",
  };

  const recentRequestFallbackYmds = Array.from(
    new Set(
      (recentRequestsResult || [])
        .map((r) => {
          const timeline = r?.timeline || {};
          const hasTimelineEstimate =
            (typeof timeline.nextEstimatedShipYmd === "string" &&
              timeline.nextEstimatedShipYmd.trim()) ||
            (typeof timeline.estimatedShipYmd === "string" &&
              timeline.estimatedShipYmd.trim()) ||
            (typeof timeline.originalEstimatedShipYmd === "string" &&
              timeline.originalEstimatedShipYmd.trim());
          const pickup = r?.productionSchedule?.scheduledShipPickup;
          if (hasTimelineEstimate || pickup) {
            return null;
          }
          return toKstYmd(r?.createdAt) || getTodayYmdInKst();
        })
        .filter(Boolean),
    ),
  );

  const fallbackEstimatedShipYmdMap = new Map(
    await Promise.all(
      recentRequestFallbackYmds.map(async (createdYmd) => {
        const baseYmd = await normalizeKoreanBusinessDay({
          ymd: createdYmd,
        });
        const estimatedShipYmd = await addKoreanBusinessDays({
          startYmd: baseYmd,
          days: 1,
        });
        return [createdYmd, estimatedShipYmd];
      }),
    ),
  );

  const recentRequests = (recentRequestsResult || []).map((r) => ({
    ...r,
    caseInfos: r.caseInfos || {},
    estimatedShipYmd: getRequestEstimatedShipYmd({
      request: r,
      fallbackMap: fallbackEstimatedShipYmdMap,
    }),
  }));

  const recentRequestsData = recentRequests.map((r) => {
    const ci = r.caseInfos || {};

    return {
      _id: r._id,
      requestId: r.requestId,
      title: r.title,
      manufacturerStage: r.manufacturerStage,
      date: r.createdAt ? toKstYmd(r.createdAt) || "" : "",
      estimatedShipYmd: r.estimatedShipYmd || null,
      originalEstimatedShipYmd:
        r.timeline?.originalEstimatedShipYmd || r.estimatedShipYmd || null,
      nextEstimatedShipYmd:
        r.timeline?.nextEstimatedShipYmd || r.estimatedShipYmd || null,
      patientName: ci.patientName || "",
      tooth: ci.tooth || "",
      caseInfos: ci,
      requestor: r.requestor || null,
      deliveryInfoRef: r.deliveryInfoRef || null,
      price: r.price || null,
      createdAt: r.createdAt,
    };
  });

  const snapshotBusinessAnchorId = new Types.ObjectId(anchorId);
  await RequestorDashboardSummarySnapshot.findOneAndUpdate(
    {
      businessAnchorId: snapshotBusinessAnchorId,
      ymd,
      periodKey: normalizedPeriodKey,
    },
    {
      $set: {
        businessAnchorId: snapshotBusinessAnchorId,
        ymd,
        periodKey: normalizedPeriodKey,
        stats: snapshotStats,
        manufacturingSummary,
        recentRequests: recentRequestsData,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );

  return {
    businessAnchorId: anchorId,
    ymd,
    periodKey: normalizedPeriodKey,
    stats: snapshotStats,
    manufacturingSummary,
    recentRequests: recentRequestsData,
  };
};

export const recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId =
  async (businessAnchorId) => {
    const periods = ["7d", "30d", "90d", "thisMonth", "lastMonth"];
    const results = await Promise.all(
      periods.map((periodKey) =>
        recomputeSingleRequestorDashboardSummarySnapshot({
          businessAnchorId,
          periodKey,
        }),
      ),
    );
    return results.filter(Boolean);
  };

export const invalidateTodayRequestorDashboardSummarySnapshotsForBusinessAnchorId =
  async (businessAnchorId) => {
    const anchorId = String(businessAnchorId || "").trim();
    if (!Types.ObjectId.isValid(anchorId)) return;

    const ymd = getTodayYmdInKst();
    if (!ymd) return;

    const deleteResult = await RequestorDashboardSummarySnapshot.deleteMany({
      businessAnchorId: new Types.ObjectId(anchorId),
      ymd,
    });
  };

export const getRequestorDashboardSummarySnapshot = async ({
  businessAnchorId,
  periodKey,
}) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const normalizedPeriodKey = String(periodKey || "30d").trim() || "30d";
  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  return RequestorDashboardSummarySnapshot.findOne({
    businessAnchorId: new Types.ObjectId(anchorId),
    ymd,
    periodKey: normalizedPeriodKey,
  })
    .select({
      businessAnchorId: 1,
      ymd: 1,
      periodKey: 1,
      stats: 1,
      manufacturingSummary: 1,
      recentRequests: 1,
      computedAt: 1,
    })
    .lean();
};
