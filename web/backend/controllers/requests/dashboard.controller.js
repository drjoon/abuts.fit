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

const getUniqueRequestIdCount = (requestIds) => {
  if (!Array.isArray(requestIds) || requestIds.length === 0) return 0;
  return new Set(
    requestIds.map((value) => String(value || "").trim()).filter(Boolean),
  ).size;
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
      "caseInfos.implantBrand": { $exists: true, $ne: "" },
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
 * 리퍼럴 직계 사업자 목록 (의뢰자용)
 * @route GET /api/requests/my/referral-direct-members
 */
export async function getMyReferralDirectMembers(req, res) {
  try {
    const requesterUserId = req.user?._id;
    if (!requesterUserId) {
      return res.status(400).json({
        success: false,
        message: "사용자 ID가 없습니다.",
      });
    }

    const range30 = getLast30DaysRangeUtc();
    const lastMonthStart =
      range30?.start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lastMonthEnd = range30?.end ?? new Date();

    const groupLeaderId = await getReferralGroupLeaderId(requesterUserId);

    const leader = await User.findById(groupLeaderId)
      .select({
        businessId: 1,
        role: 1,
        name: 1,
        email: 1,
        business: 1,
        createdAt: 1,
        approvedAt: 1,
      })
      .lean();

    const orgById = new Map();
    const ordersByOrgId = new Map();
    const ordersByUserId = new Map();
    let members = [];

    const role = String(leader?.role || req.user?.role || "requestor");

    if (role === "salesman") {
      const [directRequestors, directSalesmen] = await Promise.all([
        User.find({
          referredByUserId: requesterUserId,
          active: true,
          role: "requestor",
        })
          .select({
            _id: 1,
            name: 1,
            email: 1,
            business: 1,
            createdAt: 1,
            approvedAt: 1,
          })
          .sort({ createdAt: -1 })
          .lean(),
        User.find({
          referredByUserId: requesterUserId,
          active: true,
          role: "salesman",
        })
          .select({ _id: 1, name: 1, email: 1, business: 1, createdAt: 1 })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      const orgIds = Array.from(
        new Set(
          (directRequestors || [])
            .map((u) => String(u.businessId || ""))
            .filter(Boolean),
        ),
      );

      const orgObjectIds = orgIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const orgs = orgObjectIds.length
        ? await RequestorOrganization.find({ _id: { $in: orgObjectIds } })
            .select({ name: 1, extracted: 1, createdAt: 1 })
            .lean()
        : [];
      orgs.forEach((o) => orgById.set(String(o._id), o));

      const orderRows = orgObjectIds.length
        ? await Request.aggregate([
            {
              $match: {
                requestorBusinessId: { $in: orgObjectIds },
                "caseInfos.reviewByStage.shipping.status": "APPROVED",
                createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
              },
            },
            { $group: { _id: "$requestorBusinessId", count: { $sum: 1 } } },
          ])
        : [];
      orderRows.forEach((r) =>
        ordersByOrgId.set(String(r._id), Number(r.count || 0)),
      );

      const orgMembers = orgIds.map((orgId) => {
        const org = orgById.get(orgId) || {};
        return {
          _id: orgId,
          business: org?.name || "",
          email: org?.extracted?.email || "",
          createdAt: org?.createdAt || null,
          last30DaysOrders: ordersByOrgId.get(orgId) || 0,
          lastMonthOrders: ordersByOrgId.get(orgId) || 0,
        };
      });

      const salesmanMembers = (directSalesmen || []).map((u) => ({
        _id: u._id,
        name: u.name || "",
        email: u.email || "",
        business: u.business || "",
        createdAt: u.createdAt || null,
        last30DaysOrders: 0,
        lastMonthOrders: 0,
      }));

      members = [...orgMembers, ...salesmanMembers];
    } else {
      const orgMemberIds = [];
      if (leader?.businessId) {
        const org = await RequestorOrganization.findById(leader.businessId)
          .select({ owner: 1, owners: 1, members: 1 })
          .lean();

        const ownerId = String(org?.owner || "");
        const ownerIds = Array.isArray(org?.owners)
          ? org.owners.map(String)
          : [];
        const memberIds = Array.isArray(org?.members)
          ? org.members.map(String)
          : [];
        orgMemberIds.push(ownerId, ...ownerIds, ...memberIds);
      }

      const orgMemberObjectIds = Array.from(new Set(orgMemberIds))
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      const referredRequestors = await User.find({
        referredByUserId:
          orgMemberObjectIds.length > 0
            ? { $in: orgMemberObjectIds }
            : requesterUserId,
        active: true,
        role: "requestor",
        businessId: { $exists: true, $ne: null },
      })
        .select({
          _id: 1,
          name: 1,
          email: 1,
          business: 1,
          businessId: 1,
          createdAt: 1,
          approvedAt: 1,
        })
        .sort({ createdAt: -1 })
        .lean();

      const leaderOrgId = String(leader?.businessId || "");
      const orgIds = Array.from(
        new Set(
          [
            leaderOrgId,
            ...(referredRequestors || []).map((u) =>
              String(u.businessId || ""),
            ),
          ].filter(Boolean),
        ),
      );

      const orgObjectIds = orgIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const orgs = orgObjectIds.length
        ? await RequestorOrganization.find({ _id: { $in: orgObjectIds } })
            .select({ name: 1, extracted: 1, createdAt: 1 })
            .lean()
        : [];
      orgs.forEach((o) => orgById.set(String(o._id), o));

      const orderRows = orgObjectIds.length
        ? await Request.aggregate([
            {
              $match: {
                requestorBusinessId: { $in: orgObjectIds },
                "caseInfos.reviewByStage.shipping.status": "APPROVED",
                createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
              },
            },
            { $group: { _id: "$requestorBusinessId", count: { $sum: 1 } } },
          ])
        : [];
      orderRows.forEach((r) =>
        ordersByOrgId.set(String(r._id), Number(r.count || 0)),
      );

      const orgMembers = orgIds.map((orgId) => {
        const org = orgById.get(orgId) || {};
        return {
          _id: orgId,
          business: org?.name || "",
          email: org?.extracted?.email || "",
          createdAt: org?.createdAt || null,
          last30DaysOrders: ordersByOrgId.get(orgId) || 0,
          lastMonthOrders: ordersByOrgId.get(orgId) || 0,
        };
      });

      members = [...orgMembers];
    }

    return res.status(200).json({
      success: true,
      data: {
        members,
      },
    });
  } catch (error) {
    console.error("Error in getMyReferralDirectMembers:", error);
    return res.status(500).json({
      success: false,
      message: "직계 사업자 조회 중 오류가 발생했습니다.",
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

    // 집계 쿼리로 사업자 범위 통계와 최근 의뢰를 병렬로 조회
    const [
      deliveryLeadDays,
      statsResult,
      recentRequestsResult,
      shippingPackageRows,
    ] = await Promise.all([
      getDeliveryEtaLeadDays(),
      Request.aggregate([
        {
          $match: {
            ...requestFilter,
            ...dateFilter,
            "caseInfos.implantBrand": { $exists: true, $ne: "" },
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
      Request.find({
        ...requestFilter,
        "caseInfos.implantBrand": { $exists: true, $ne: "" },
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
        .populate("requestor", "name organization")
        .lean(),
      Request.aggregate([
        {
          $match: {
            ...requestFilter,
            ...dateFilter,
            "caseInfos.implantBrand": { $exists: true, $ne: "" },
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

    console.info("[REQUESTOR_DASHBOARD_STAGE_COUNTS]", {
      userId: req.user?._id ? String(req.user._id) : null,
      requestFilter,
      statsShippingCount: Number(stats.shippingCount || 0),
      statsTrackingCount: Number(stats.trackingCount || 0),
      shippingProductCount: Number(shippingCounts.productCount || 0),
      shippingPackageCount: Number(shippingCounts.packageCount || 0),
      trackingProductCount: Number(trackingCounts.productCount || 0),
      trackingPackageCount: Number(trackingCounts.packageCount || 0),
    });

    // '포장.발송'은 shipping, '추적관리'는 tracking으로 분리.
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
        const existingShipYmd = (() => {
          const timeline = r.timeline || {};
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
          return next || est || orig;
        })();

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
        inShippingBoxes: shippingCounts.packageCount,
        inShippingChange: "+0%",
        inTracking: trackingTotal,
        inTrackingBoxes: trackingCounts.packageCount,
        inTrackingChange: "+0%",
        canceled: stats.canceledCount,
        canceledChange: "+0%",
        tracking: trackingTotal,
        doneOrCanceled: trackingTotal + stats.canceledCount,
        doneOrCanceledChange: "+0%",
      },
      manufacturingSummary,
      riskSummary,
      recentRequests: recentRequestsData,
    };

    if (debug) {
      const stageBreakdown = await Request.aggregate([
        {
          $match: {
            ...requestFilter,
            "caseInfos.implantBrand": { $exists: true, $ne: "" },
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
      "caseInfos.implantBrand": { $exists: true, $ne: "" },
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
        r?.requestor?.business ||
        r?.requestor?.organization ||
        r?.requestor?.name ||
        "";
      const manufacturerText =
        r?.manufacturer?.business ||
        r?.manufacturer?.organization ||
        r?.manufacturer?.name ||
        "";

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
    const last30StartYmd = toKstYmd(lastMonthStart);
    const todayYmd = getTodayYmdInKst();

    const ymd = todayYmd;
    if (!ymd) {
      return res.status(500).json({
        success: false,
        message: "날짜 계산에 실패했습니다.",
      });
    }

    const groupLeaderId = await getReferralGroupLeaderId(requestorId);
    const me = await User.findById(requestorId)
      .select({
        businessId: 1,
        createdAt: 1,
        updatedAt: 1,
        active: 1,
        approvedAt: 1,
      })
      .lean();
    const myBusinessId = String(me?.businessId || "");

    const snapshotBusinessObjectId =
      myBusinessId && Types.ObjectId.isValid(myBusinessId)
        ? new Types.ObjectId(myBusinessId)
        : null;

    const cachedSnapshot = snapshotBusinessObjectId
      ? await PricingReferralStatsSnapshot.findOne({
          businessId: snapshotBusinessObjectId,
          ymd,
        })
          .select({
            businessId: 1,
            leaderUserId: 1,
            groupMemberCount: 1,
            groupTotalOrders: 1,
            computedAt: 1,
          })
          .lean()
      : null;

    // 누락 감지: 오늘 스냅샷이 없으면 당일 자정 기준 30일로 즉시 계산 (워커 장애 복구)
    const snapshotMissing = !cachedSnapshot;

    const cachedGroupMemberCount = cachedSnapshot?.groupMemberCount;
    const cachedGroupTotalOrders = cachedSnapshot?.groupTotalOrders;

    const leader = await User.findById(groupLeaderId)
      .select({ businessId: 1, role: 1 })
      .lean();

    const role = String(leader?.role || req.user?.role || "requestor");
    let groupMemberCount = 0;
    let freshGroupTotalOrders = 0;
    let myLastMonthOrders = 0;
    let groupMemberIds = [];

    const shippedBusinessRows = await ShippingPackage.find({
      shipDateYmd: { $gte: last30StartYmd, $lte: todayYmd },
    })
      .select({ _id: 0, businessId: 1, requestIds: 1 })
      .lean();

    const shippingRequestCountByBusinessId = new Map();
    for (const row of Array.isArray(shippedBusinessRows)
      ? shippedBusinessRows
      : []) {
      const businessId = String(row?.businessId || "").trim();
      if (!businessId) continue;
      const count = getUniqueRequestIdCount(row?.requestIds);
      shippingRequestCountByBusinessId.set(
        businessId,
        Number(shippingRequestCountByBusinessId.get(businessId) || 0) + count,
      );
    }

    if (role === "requestor") {
      let orgMemberObjectIds = [];
      const leaderBusinessId = String(leader?.businessId || "");
      if (leader?.businessId) {
        const org = await RequestorOrganization.findById(leader.businessId)
          .select({ owner: 1, owners: 1, members: 1 })
          .lean();

        const ownerId = String(org?.owner || "");
        const ownerIds = Array.isArray(org?.owners)
          ? org.owners.map(String)
          : [];
        const memberIds = Array.isArray(org?.members)
          ? org.members.map(String)
          : [];
        const allIds = [ownerId, ...ownerIds, ...memberIds]
          .map(String)
          .filter((id) => Types.ObjectId.isValid(id));
        orgMemberObjectIds = allIds.map((id) => new Types.ObjectId(id));
      }

      const referredRequestors = await User.find({
        referredByUserId:
          orgMemberObjectIds.length > 0
            ? { $in: orgMemberObjectIds }
            : requestorId,
        active: true,
        role: "requestor",
        businessId: { $exists: true, $ne: null },
      })
        .select({ businessId: 1 })
        .lean();

      const orgIds = Array.from(
        new Set(
          [
            leaderBusinessId,
            ...(referredRequestors || []).map((u) =>
              String(u.businessId || ""),
            ),
          ].filter(Boolean),
        ),
      );
      const orgObjectIds = orgIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      groupMemberCount = orgIds.length;
      groupMemberIds = orgObjectIds.map((id) => id.toString());

      freshGroupTotalOrders = orgIds.reduce(
        (acc, id) =>
          acc + Number(shippingRequestCountByBusinessId.get(String(id)) || 0),
        0,
      );
      myLastMonthOrders = Number(
        shippingRequestCountByBusinessId.get(String(leaderBusinessId)) || 0,
      );
    } else {
      const directChildren = await User.find({
        referredByUserId: requestorId,
        active: true,
        role: { $in: ["requestor", "salesman"] },
      })
        .select({ _id: 1 })
        .lean();

      const baseMemberIds = [requestorId];
      const rawMemberIds = [
        ...baseMemberIds,
        ...(directChildren || []).map((c) => c._id).filter(Boolean),
      ];
      groupMemberIds = rawMemberIds.map((id) => String(id));
      groupMemberCount = groupMemberIds.length;

      [freshGroupTotalOrders, myLastMonthOrders] = await Promise.all([
        groupMemberIds.length
          ? Request.countDocuments({
              requestor: { $in: rawMemberIds },
              manufacturerStage: {
                $in: ["shipping", "포장.발송", "tracking", "추적관리"],
              },
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            })
          : Promise.resolve(0),
        Request.countDocuments({
          requestor: requestorId,
          manufacturerStage: {
            $in: ["shipping", "포장.발송", "tracking", "추적관리"],
          },
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
        }),
      ]);
    }

    const user = me;

    const totalLastMonthOrders = freshGroupTotalOrders;

    if (snapshotBusinessObjectId) {
      await PricingReferralStatsSnapshot.findOneAndUpdate(
        { businessId: snapshotBusinessObjectId, ymd },
        {
          $set: {
            businessId: snapshotBusinessObjectId,
            leaderUserId: groupLeaderId,
            groupMemberCount,
            groupTotalOrders: totalLastMonthOrders,
            computedAt: now,
          },
        },
        { upsert: true, new: true },
      );
    }

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

    if (process.env.NODE_ENV !== "production") {
      console.log("[pricing-referral-stats]", {
        requestorId: String(requestorId),
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
