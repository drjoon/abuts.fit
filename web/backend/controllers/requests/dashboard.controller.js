import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import Business from "../../models/business.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import Machine from "../../models/machine.model.js";
import { Types } from "mongoose";
import {
  buildRequestorOrgScopeFilter,
  buildRequestorOrgFilter,
  normalizeCaseInfosImplantFields,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  getLast30DaysRangeUtc,
  normalizeKoreanBusinessDay,
} from "./utils.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "../../services/requestDashboardCache.service.js";
import {
  getRequestorDashboardSummarySnapshot,
  recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId,
} from "../../services/requestorDashboardSummarySnapshot.service.js";
import { getDashboardRiskSummaryData } from "../../services/dashboardRiskSummary.service.js";
import {
  getPricingReferralRolling30dAggregateByBusinessAnchorId,
  recomputePricingReferralSnapshotForLeaderAnchorId,
  getStoredRequestorDirectCircleMembershipByAnchorId,
} from "../../services/pricingReferralSnapshot.service.js";
import { getPricingReferralOrderCountMapByBusinessAnchorIds } from "../../services/pricingReferralOrderBucket.service.js";

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

const getShippingOrderCountsByBusinessAnchorIds = async ({
  businessAnchorIds,
  startYmd,
  endYmd,
}) => {
  const orgKeys = Array.from(
    new Set(
      (businessAnchorIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );

  if (orgKeys.length === 0 || !startYmd || !endYmd) return new Map();

  const cacheKey = `shipping-order-counts:${startYmd}:${endYmd}:${orgKeys
    .slice()
    .sort()
    .join(",")}`;
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached instanceof Map) {
    return cached;
  }

  const countMap = await getPricingReferralOrderCountMapByBusinessAnchorIds({
    businessAnchorIds: orgKeys,
    startYmd,
    endYmd,
  });
  setRequestPerfCacheValue(cacheKey, countMap, 60 * 1000);
  return countMap;
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

    // 제조사 대시보드: 해당 제조사에게 할당된 의뢰건을 조회
    const baseFilter = {
      manufacturerStage: { $ne: "취소" },
      "caseInfos.implantBrand": { $exists: true, $ne: "" },
    };

    // 제조사 역할일 때: 해당 제조사에게 할당된 의뢰건만 필터링
    if (role === "manufacturer") {
      baseFilter.$or = [
        { caManufacturer: req.user._id },
        { caManufacturer: null },
        { caManufacturer: { $exists: false } },
      ];
      console.log("[Dashboard] Manufacturer filter:", {
        userId: req.user._id,
        filter: baseFilter,
        period,
        dateFilter,
      });
    }

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

    console.log("[Dashboard] Assigned summary result", {
      period,
      dateFilter,
      baseFilter,
      totals: {
        total: Number(statsResult?.total ?? 0) || 0,
        tracking: Number(statsResult?.trackingCount ?? 0) || 0,
        shipping: Number(statsResult?.shippingCount ?? 0) || 0,
        packing: Number(statsResult?.packingCount ?? 0) || 0,
        machining: Number(statsResult?.machiningCount ?? 0) || 0,
        cam: Number(statsResult?.camCount ?? 0) || 0,
        request: Number(statsResult?.requestCount ?? 0) || 0,
      },
    });

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
    const requestorUserId = req.user?._id;
    const directMembersCacheKey = `referral-direct-members:v3:${String(
      req.user?._id || "",
    )}:${String(req.user?.businessAnchorId || "")}`;
    const cachedDirectMembers = getRequestPerfCacheValue(directMembersCacheKey);
    if (cachedDirectMembers) {
      return res.status(200).json({
        success: true,
        data: cachedDirectMembers,
        cached: true,
      });
    }

    if (!requestorUserId) {
      return res.status(400).json({
        success: false,
        message: "사용자 ID가 없습니다.",
      });
    }

    const responseData = await withRequestPerfInFlight(
      directMembersCacheKey,
      async () => {
        const range30 = getLast30DaysRangeUtc();
        const lastMonthStart =
          range30?.start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const lastMonthEnd = range30?.end ?? new Date();

        const requestor = await User.findById(requestorUserId)
          .select({
            businessAnchorId: 1,
            role: 1,
            name: 1,
            email: 1,
            business: 1,
            createdAt: 1,
            approvedAt: 1,
          })
          .lean();

        const orgByKey = new Map();
        const ordersByOrgKey = new Map();
        let members = [];

        const role = String(requestor?.role || req.user?.role || "requestor");

        // 이 API도 user row가 아니라 business anchor row만 읽어야 한다.
        // 동일 사업자의 owner/member user를 동시에 읽으면 소개 사업자 수와 목록이
        // 모두 부풀어 보이므로, direct members는 항상 unique business anchor 기준이다.
        const leaderAnchorId = String(requestor?.businessAnchorId || "").trim();
        const childBusinessTypes =
          role === "salesman" ? ["requestor", "salesman"] : ["requestor"];
        const directChildAnchors =
          leaderAnchorId && Types.ObjectId.isValid(leaderAnchorId)
            ? await BusinessAnchor.find({
                referredByAnchorId: new Types.ObjectId(leaderAnchorId),
                businessType: { $in: childBusinessTypes },
              })
                .select({ _id: 1, name: 1, metadata: 1, createdAt: 1 })
                .sort({ createdAt: -1 })
                .lean()
            : [];

        const orgPairs = [];
        if (role === "requestor" && leaderAnchorId) {
          orgPairs.push([
            leaderAnchorId,
            { orgKey: leaderAnchorId, businessAnchorId: leaderAnchorId },
          ]);
        }
        (directChildAnchors || []).forEach((anchor) => {
          const businessAnchorId = String(anchor?._id || "").trim();
          if (!businessAnchorId) return;
          orgPairs.push([
            businessAnchorId,
            { orgKey: businessAnchorId, businessAnchorId },
          ]);
        });

        const orgRows = Array.from(new Map(orgPairs).values());

        const orgAnchorIds = orgRows
          .map((row) => row.businessAnchorId)
          .filter((id) => id && Types.ObjectId.isValid(id));
        const orgs = orgAnchorIds.length
          ? await Business.find({
              businessAnchorId: {
                $in: orgAnchorIds.map((id) => new Types.ObjectId(id)),
              },
            })
              .select({
                _id: 1,
                businessAnchorId: 1,
                name: 1,
                extracted: 1,
                createdAt: 1,
              })
              .lean()
          : [];
        orgs.forEach((o) => {
          const orgKey = String(o?.businessAnchorId || "").trim();
          if (!orgKey) return;
          orgByKey.set(orgKey, o);
        });

        const anchorOrderRows = orgAnchorIds.length
          ? await Request.aggregate([
              {
                $match: {
                  businessAnchorId: {
                    $in: orgAnchorIds.map((id) => new Types.ObjectId(id)),
                  },
                  manufacturerStage: "추적관리",
                  createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
                },
              },
              { $group: { _id: "$businessAnchorId", count: { $sum: 1 } } },
            ])
          : [];
        anchorOrderRows.forEach((r) =>
          ordersByOrgKey.set(String(r._id), Number(r.count || 0)),
        );

        const anchorById = new Map(
          (directChildAnchors || []).map((anchor) => [
            String(anchor?._id || ""),
            anchor,
          ]),
        );

        const orgMembers = orgRows.map(({ orgKey }) => {
          const org = orgByKey.get(orgKey) || {};
          const anchor = anchorById.get(orgKey) || {};
          const isLeaderRow = orgKey === leaderAnchorId;
          return {
            _id: orgKey,
            business:
              org?.name ||
              anchor?.name ||
              (isLeaderRow ? requestor?.business || "" : ""),
            email:
              org?.extracted?.email ||
              anchor?.metadata?.email ||
              (isLeaderRow ? requestor?.email || "" : ""),
            createdAt:
              org?.createdAt ||
              anchor?.createdAt ||
              (isLeaderRow ? requestor?.createdAt || null : null),
            last30DaysOrders: ordersByOrgKey.get(orgKey) || 0,
            lastMonthOrders: ordersByOrgKey.get(orgKey) || 0,
          };
        });

        members = [...orgMembers];

        const responseData = {
          members,
        };
        setRequestPerfCacheValue(
          directMembersCacheKey,
          responseData,
          60 * 1000,
        );
        return responseData;
      },
    );

    return res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
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
    const summaryCacheKey = `dashboard-summary:${String(
      req.user?._id || "",
    )}:${String(req.user?.businessAnchorId || "")}:${period}`;

    if (!debug) {
      const cached = getRequestPerfCacheValue(summaryCacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: cached,
          cached: true,
        });
      }
    }

    const responseData = await withRequestPerfInFlight(
      summaryCacheKey,
      async () => {
        const requestFilter = buildRequestorOrgFilter(req);
        const businessAnchorId = String(
          req.user?.businessAnchorId || "",
        ).trim();

        const dateFilter = buildDateFilter(period);

        const summarySnapshot =
          !debug && businessAnchorId
            ? (await getRequestorDashboardSummarySnapshot({
                businessAnchorId,
                periodKey: period,
              })) ||
              ((
                await recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId(
                  businessAnchorId,
                )
              ).find(
                (row) => String(row?.periodKey || "") === String(period),
              ) ??
                null)
            : null;

        const riskRequestFilter = {
          ...requestFilter,
          manufacturerStage: {
            $in: [
              "request",
              "cam",
              "machining",
              "packing",
              "shipping",
              "의뢰",
              "CAM",
              "가공",
              "세척.패킹",
              "포장.발송",
            ],
          },
          productionSchedule: { $exists: true, $ne: null },
          $or: [
            { "timeline.originalEstimatedShipYmd": { $exists: true, $ne: "" } },
            { "timeline.estimatedShipYmd": { $exists: true, $ne: "" } },
          ],
        };

        const [recentRequestsResult, riskData] = await Promise.all([
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
            .lean(),
          getDashboardRiskSummaryData({
            cacheKey: `dashboard-risk-summary:requestor:${businessAnchorId}:${String(period)}`,
            riskRequestFilter,
            debug,
            role: "requestor",
            populateRelated: false,
          }),
        ]);

        const snapshotStats = summarySnapshot?.stats || null;
        const snapshotManufacturingSummary =
          summarySnapshot?.manufacturingSummary || null;
        const snapshotRecentRequests = Array.isArray(
          summarySnapshot?.recentRequests,
        )
          ? summarySnapshot.recentRequests
          : null;

        const activeRequests = Array.isArray(riskData?.activeRequests)
          ? riskData.activeRequests
          : [];
        const riskSummary = riskData?.riskSummary || {
          delayedCount: 0,
          warningCount: 0,
          onTimeRate: 100,
          items: [],
        };

        // 직경별 통계 실제 집계

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
              r.timeline?.originalEstimatedShipYmd ||
              r.estimatedShipYmd ||
              null,
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

        const responseData = {
          stats: snapshotStats || {
            totalRequests: 0,
            totalRequestsChange: "+0%",
            inProgress: 0,
            inProgressChange: "+0%",
            inCam: 0,
            inCamChange: "+0%",
            inProduction: 0,
            inProductionChange: "+0%",
            inPacking: 0,
            inPackingChange: "+0%",
            inShipping: 0,
            inShippingBoxes: 0,
            inShippingChange: "+0%",
            inTracking: 0,
            inTrackingBoxes: 0,
            inTrackingChange: "+0%",
            canceled: 0,
            canceledChange: "+0%",
            tracking: 0,
            doneOrCanceled: 0,
            doneOrCanceledChange: "+0%",
          },
          manufacturingSummary: snapshotManufacturingSummary || {
            totalActive: 0,
            stages: [],
          },
          riskSummary,
          recentRequests: snapshotRecentRequests || recentRequestsData,
        };

        if (debug) {
          const riskStageBreakdownMap = new Map();
          for (const request of activeRequests || []) {
            const manufacturerStage = String(
              request?.manufacturerStage || "",
            ).trim();
            const timeline = request?.timeline || {};
            const originalEstimatedShipYmd = String(
              timeline?.originalEstimatedShipYmd ||
                timeline?.estimatedShipYmd ||
                "",
            ).trim();
            const nextEstimatedShipYmd = String(
              timeline?.nextEstimatedShipYmd || originalEstimatedShipYmd || "",
            ).trim();
            const key = `${manufacturerStage}__${originalEstimatedShipYmd}__${nextEstimatedShipYmd}`;
            const prev = riskStageBreakdownMap.get(key) || {
              manufacturerStage,
              originalEstimatedShipYmd,
              nextEstimatedShipYmd,
              count: 0,
              sampleRequestIds: [],
            };
            prev.count += 1;
            if (
              prev.sampleRequestIds.length < 5 &&
              request?.requestId &&
              !prev.sampleRequestIds.includes(String(request.requestId))
            ) {
              prev.sampleRequestIds.push(String(request.requestId));
            }
            riskStageBreakdownMap.set(key, prev);
          }

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
            riskQuery: {
              totalMatched: Array.isArray(activeRequests)
                ? activeRequests.length
                : 0,
              delayedCount: Number(riskSummary?.delayedCount || 0),
              warningCount: Number(riskSummary?.warningCount || 0),
              stageBreakdown: Array.from(riskStageBreakdownMap.values()).sort(
                (a, b) => Number(b?.count || 0) - Number(a?.count || 0),
              ),
              delayedItems: Array.isArray(riskSummary?.items)
                ? riskSummary.items
                    .filter((item) => item?.riskLevel === "danger")
                    .slice(0, 20)
                    .map((item) => ({
                      requestId: String(item?.requestId || ""),
                      manufacturerStage: String(item?.manufacturerStage || ""),
                      originalEstimatedShipYmd: String(
                        item?.originalEstimatedShipYmd || item?.dueDate || "",
                      ),
                      nextEstimatedShipYmd: String(
                        item?.nextEstimatedShipYmd || "",
                      ),
                    }))
                : [],
              warningItems: Array.isArray(riskSummary?.items)
                ? riskSummary.items
                    .filter((item) => item?.riskLevel !== "danger")
                    .slice(0, 20)
                    .map((item) => ({
                      requestId: String(item?.requestId || ""),
                      manufacturerStage: String(item?.manufacturerStage || ""),
                      originalEstimatedShipYmd: String(
                        item?.originalEstimatedShipYmd || item?.dueDate || "",
                      ),
                      nextEstimatedShipYmd: String(
                        item?.nextEstimatedShipYmd || "",
                      ),
                    }))
                : [],
            },
          };
        }

        if (!debug) {
          setRequestPerfCacheValue(summaryCacheKey, responseData, 15 * 1000);
        }

        return responseData;
      },
    );

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
    const debug =
      process.env.NODE_ENV !== "production" && String(req.query.debug) === "1";

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
                  { caManufacturer: req.user._id },
                  { caManufacturer: null },
                  { caManufacturer: { $exists: false } },
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

    const cacheScope =
      role === "requestor"
        ? String(req.user?.businessAnchorId || "").trim()
        : role === "manufacturer"
          ? String(req.user?._id || "").trim()
          : "admin";
    const riskData = await getDashboardRiskSummaryData({
      cacheKey: `dashboard-risk-summary:${role}:${cacheScope}:${String(period)}`,
      riskRequestFilter: filter,
      debug,
      role,
      populateRelated: role !== "requestor",
    });

    return res.status(200).json({
      success: true,
      data: {
        riskSummary: riskData?.riskSummary || {
          delayedCount: 0,
          warningCount: 0,
          onTimeRate: 100,
          items: [],
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
    const debug =
      process.env.NODE_ENV !== "production" && String(req.query.debug) === "1";
    const statsCacheKey = `pricing-referral-stats:v6:${String(
      req.user?._id || "",
    )}:${String(req.user?.businessAnchorId || "")}`;

    if (!debug) {
      const cached = getRequestPerfCacheValue(statsCacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: cached,
          cached: true,
        });
      }
    }

    if (!requestorId) {
      return res.status(400).json({
        success: false,
        message: "사용자 ID가 없습니다.",
      });
    }

    const responseData = await withRequestPerfInFlight(
      statsCacheKey,
      async () => {
        const now = new Date();
        const range30 = getLast30DaysRangeUtc(now);
        if (!range30) {
          throw new Error("날짜 계산에 실패했습니다.");
        }
        const { start: lastMonthStart, end: lastMonthEnd } = range30;
        const last30StartYmd = toKstYmd(lastMonthStart);
        const todayYmd = getTodayYmdInKst();

        const ymd = todayYmd;
        if (!ymd) {
          throw new Error("날짜 계산에 실패했습니다.");
        }

        const me =
          String(req.user?._id || "") === String(requestorId || "")
            ? req.user
            : await User.findById(requestorId)
                .select({
                  businessAnchorId: 1,
                  role: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  active: 1,
                  approvedAt: 1,
                })
                .lean();
        const role = String(me?.role || req.user?.role || "requestor");
        // 누락 감지: 오늘 스냅샷이 없으면 당일 자정 기준 30일로 즉시 계산 (워커 장애 복구)
        let cachedRollingAggregate = null;
        let snapshotMissing = true;
        let groupMemberCount = 0;
        let freshGroupTotalOrders = 0;
        let myLastMonthOrders = 0;
        let groupMemberIds = [];
        let referralBusinessCount = 0;
        let referralBusinessOrders = 0;
        let selfBusinessOrders = 0;
        let indirectReferralBusinessCount = 0;
        let indirectReferralBusinessOrders = 0;
        let statsMode = role === "requestor" ? "group" : "referral";

        if (role === "requestor") {
          const leaderBusinessAnchorId = String(me?.businessAnchorId || "");
          const storedMembership =
            await getStoredRequestorDirectCircleMembershipByAnchorId(
              leaderBusinessAnchorId,
            );

          groupMemberIds = (storedMembership?.memberAnchorIds || []).map(
            String,
          );

          cachedRollingAggregate =
            await getPricingReferralRolling30dAggregateByBusinessAnchorId(
              leaderBusinessAnchorId,
              ymd,
            );
          if (!cachedRollingAggregate && leaderBusinessAnchorId) {
            await recomputePricingReferralSnapshotForLeaderAnchorId(
              leaderBusinessAnchorId,
            );
            cachedRollingAggregate =
              await getPricingReferralRolling30dAggregateByBusinessAnchorId(
                leaderBusinessAnchorId,
                ymd,
              );
          }

          snapshotMissing = !cachedRollingAggregate;
          groupMemberCount = Number(
            storedMembership?.memberCount ||
              cachedRollingAggregate?.groupMemberCount ||
              groupMemberIds.length ||
              0,
          );
          myLastMonthOrders = Number(
            cachedRollingAggregate?.selfBusinessOrders30d || 0,
          );
          freshGroupTotalOrders = Number(
            cachedRollingAggregate?.groupTotalOrders30d || 0,
          );
          referralBusinessCount = groupMemberCount;
          referralBusinessOrders = freshGroupTotalOrders;
          selfBusinessOrders = myLastMonthOrders;
        } else {
          const refBusinessAnchorId = String(me?.businessAnchorId || "").trim();
          const directChildBusinessTypes =
            role === "salesman" ? ["requestor", "salesman"] : ["requestor"];
          const directChildren =
            refBusinessAnchorId && Types.ObjectId.isValid(refBusinessAnchorId)
              ? await BusinessAnchor.find({
                  referredByAnchorId: new Types.ObjectId(refBusinessAnchorId),
                  businessType: { $in: directChildBusinessTypes },
                })
                  .select({ _id: 1 })
                  .lean()
              : [];

          const directChildBusinessAnchorIds = Array.from(
            new Set(
              (directChildren || [])
                .map((child) => String(child?._id || "").trim())
                .filter(Boolean),
            ),
          );
          const shippingCountMap =
            await getShippingOrderCountsByBusinessAnchorIds({
              businessAnchorIds: [
                refBusinessAnchorId,
                ...directChildBusinessAnchorIds,
              ],
              startYmd: last30StartYmd,
              endYmd: todayYmd,
            });

          selfBusinessOrders = Number(
            shippingCountMap.get(String(refBusinessAnchorId)) || 0,
          );
          referralBusinessCount = directChildBusinessAnchorIds.length;
          referralBusinessOrders = directChildBusinessAnchorIds.reduce(
            (acc, id) => acc + Number(shippingCountMap.get(String(id)) || 0),
            0,
          );

          myLastMonthOrders = selfBusinessOrders;
          freshGroupTotalOrders = referralBusinessOrders;
          groupMemberCount = referralBusinessCount;
          groupMemberIds = directChildBusinessAnchorIds.map(String);

          // 영업자(salesman)의 간접 소개 통계 계산:
          // 직접 소개한 사업자들이 다시 소개한 사업자(2단계)의 수와 의뢰건수.
          // 직접 소개 5%, 간접 소개 2.5% 수수료 정책 기반.
          // read 경로에서 재계산하므로 캐시 TTL(60s) 이내 정합성 허용.
          if (role === "salesman" && directChildBusinessAnchorIds.length > 0) {
            const indirectChildren = await BusinessAnchor.find({
              referredByAnchorId: {
                $in: directChildBusinessAnchorIds.map(
                  (id) => new Types.ObjectId(id),
                ),
              },
            })
              .select({ _id: 1 })
              .lean();

            const indirectChildIds = Array.from(
              new Set(
                (indirectChildren || [])
                  .map((child) => String(child?._id || "").trim())
                  .filter(Boolean),
              ),
            );

            if (indirectChildIds.length > 0) {
              const indirectCountMap =
                await getShippingOrderCountsByBusinessAnchorIds({
                  businessAnchorIds: indirectChildIds,
                  startYmd: last30StartYmd,
                  endYmd: todayYmd,
                });
              indirectReferralBusinessCount = indirectChildIds.length;
              indirectReferralBusinessOrders = indirectChildIds.reduce(
                (acc, id) =>
                  acc + Number(indirectCountMap.get(String(id)) || 0),
                0,
              );
            }
          }
        }

        const user = me;

        const totalLastMonthOrders = freshGroupTotalOrders;

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

        if (debug) {
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
          referralBusinessCount,
          referralBusinessOrders,
          selfBusinessOrders,
          indirectReferralBusinessCount,
          indirectReferralBusinessOrders,
          statsMode,
          totalOrders,
          baseUnitPrice,
          discountPerOrder,
          maxDiscountPerUnit,
          discountAmount,
          effectiveUnitPrice,
          rule,
          groupMemberCount,
          snapshotMissing,
          ...(debug
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
                  snapshot: cachedRollingAggregate
                    ? {
                        groupMemberCount:
                          cachedRollingAggregate.groupMemberCount,
                        groupTotalOrders:
                          cachedRollingAggregate.groupTotalOrders30d,
                        computedAt: cachedRollingAggregate.computedAt,
                      }
                    : null,
                },
              }
            : {}),
        };

        if (!debug) {
          setRequestPerfCacheValue(statsCacheKey, responseData, 60 * 1000);
        }
        return responseData;
      },
    );

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
