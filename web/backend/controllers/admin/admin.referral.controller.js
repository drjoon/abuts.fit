import { Types } from "mongoose";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import Request from "../../models/request.model.js";
import PricingReferralRolling30dAggregate from "../../models/pricingReferralRolling30dAggregate.model.js";
import { getLast30DaysRangeUtc } from "../requests/utils.js";
import { getTodayYmdInKst, toKstYmd } from "../../utils/krBusinessDays.js";
import { computeVolumeEffectiveUnitPrice } from "./admin.shared.controller.js";
import { buildReferralLeaderAggregation } from "./adminReferral.aggregation.js";
import {
  getDirectReferralCircleAnchorIds,
  recomputePricingReferralSnapshotForLeaderAnchorId,
} from "../../services/pricingReferralSnapshot.service.js";
import { getPricingReferralOrderCountMapByBusinessAnchorIds } from "../../services/pricingReferralOrderBucket.service.js";
import {
  clearAdminReferralCaches,
  getAdminReferralCache,
  setAdminReferralCache,
  withAdminReferralInFlight,
} from "../../services/adminReferralCache.service.js";

const REFERRAL_LEADER_ROLE_FILTER = [
  { role: "salesman" },
  { role: "devops" },
  { role: "requestor", requestorRole: "owner" },
];
const REFERRAL_TREE_ROLES = ["requestor", "salesman", "devops"];
const REFERRAL_REVENUE_OWNER_ROLES = new Set(["requestor", "devops"]);
const REFERRAL_COMMISSION_LEADER_ROLES = new Set(["salesman", "devops"]);

async function getShippingRequestCountByBusinessAnchorIds({
  businessAnchorIds,
  startYmd,
  endYmd,
}) {
  const validIds = Array.from(
    new Set(
      (businessAnchorIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  );

  if (!validIds.length || !startYmd || !endYmd) {
    return new Map();
  }

  return getPricingReferralOrderCountMapByBusinessAnchorIds({
    businessAnchorIds: validIds,
    startYmd,
    endYmd,
  });
}

function normalizeReferralLeaders(leaders) {
  const pickedByBusinessAnchorId = new Map();
  const fallbackLeaders = [];

  for (const leader of leaders || []) {
    const businessAnchorId = String(leader?.businessAnchorId || "").trim();
    if (!businessAnchorId || !Types.ObjectId.isValid(businessAnchorId)) {
      fallbackLeaders.push(leader);
      continue;
    }

    const current = pickedByBusinessAnchorId.get(businessAnchorId);
    if (!current) {
      pickedByBusinessAnchorId.set(businessAnchorId, leader);
      continue;
    }

    const currentCreatedAt = current?.createdAt
      ? new Date(current.createdAt).getTime()
      : Number.POSITIVE_INFINITY;
    const nextCreatedAt = leader?.createdAt
      ? new Date(leader.createdAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (nextCreatedAt < currentCreatedAt) {
      pickedByBusinessAnchorId.set(businessAnchorId, leader);
    }
  }

  return [
    ...Array.from(pickedByBusinessAnchorId.values()),
    ...fallbackLeaders,
  ].sort((a, b) => {
    const aCreatedAt = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreatedAt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bCreatedAt - aCreatedAt;
  });
}

function pickRepresentativeUser(users) {
  const rows = Array.isArray(users) ? users : [];
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const score = (user) => {
      const role = String(user?.role || "");
      if (
        role === "requestor" &&
        String(user?.requestorRole || "") === "owner"
      ) {
        return 0;
      }
      if (role === "salesman") return 1;
      if (role === "devops") return 2;
      if (role === "requestor") return 3;
      return 9;
    };
    const scoreDiff = score(a) - score(b);
    if (scoreDiff !== 0) return scoreDiff;
    const aCreatedAt = a?.createdAt
      ? new Date(a.createdAt).getTime()
      : Number.MAX_SAFE_INTEGER;
    const bCreatedAt = b?.createdAt
      ? new Date(b.createdAt).getTime()
      : Number.MAX_SAFE_INTEGER;
    return aCreatedAt - bCreatedAt;
  })[0];
}

export async function getReferralGroups(req, res) {
  try {
    const refresh = String(req.query.refresh || "") === "1";
    const startDateRaw = String(req.query.startDate || "").trim();
    const endDateRaw = String(req.query.endDate || "").trim();
    const hasPeriodFilter = Boolean(startDateRaw || endDateRaw);
    const cacheKeySuffix = hasPeriodFilter
      ? `:${startDateRaw}:${endDateRaw}`
      : "";
    if (!refresh) {
      const cached = getAdminReferralCache(
        `referral-groups:v6${cacheKeySuffix}`,
      );
      if (cached) return res.status(200).json(cached);
    }

    const rawLeaders = await User.find({
      $or: REFERRAL_LEADER_ROLE_FILTER,
    })
      .select({
        _id: 1,
        role: 1,
        requestorRole: 1,
        name: 1,
        email: 1,
        business: 1,
        businessAnchorId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1 })
      .lean();
    const leaders = normalizeReferralLeaders(rawLeaders);

    if (!leaders.length) {
      return res.status(200).json({ success: true, data: { groups: [] } });
    }

    const ymd = getTodayYmdInKst();
    let rollingAggregates = await PricingReferralRolling30dAggregate.find({
      ymd,
    })
      .select({
        businessAnchorId: 1,
        groupMemberCount: 1,
        groupTotalOrders30d: 1,
        selfBusinessOrders30d: 1,
        computedAt: 1,
      })
      .lean();

    const rollingAggregateAnchorIds = new Set(
      (rollingAggregates || [])
        .map((row) => String(row?.businessAnchorId || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    );
    const missingLeaderAnchorIds = leaders
      .map((leader) => String(leader?.businessAnchorId || "").trim())
      .filter(
        (id) =>
          Types.ObjectId.isValid(id) && !rollingAggregateAnchorIds.has(id),
      );

    if (missingLeaderAnchorIds.length) {
      await Promise.all(
        missingLeaderAnchorIds.map((leaderBusinessAnchorId) =>
          recomputePricingReferralSnapshotForLeaderAnchorId(
            leaderBusinessAnchorId,
          ),
        ),
      );

      rollingAggregates = await PricingReferralRolling30dAggregate.find({ ymd })
        .select({
          businessAnchorId: 1,
          groupMemberCount: 1,
          groupTotalOrders30d: 1,
          selfBusinessOrders30d: 1,
          computedAt: 1,
        })
        .lean();
    }

    const now = new Date();
    const defaultRange = getLast30DaysRangeUtc(now);
    const periodStart = startDateRaw
      ? new Date(startDateRaw)
      : (defaultRange?.start ??
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const periodEnd = endDateRaw
      ? new Date(endDateRaw)
      : (defaultRange?.end ?? now);
    const {
      directCountByLeaderBusinessAnchorId,
      childBusinessAnchorIdsByLeaderBusinessAnchorId,
      revenueByBusinessAnchorId,
      bonusByBusinessAnchorId,
      requestorBusinessStatsByBusinessAnchorId,
    } = await buildReferralLeaderAggregation({
      leaders,
      periodStart,
      periodEnd,
    });
    const rollingAggregateByBusinessAnchorId = new Map(
      rollingAggregates
        .filter((row) => String(row?.businessAnchorId || ""))
        .map((row) => [String(row?.businessAnchorId || ""), row]),
    );
    const requestorCircleBusinessAnchorIdsByLeaderBusinessAnchorId = new Map(
      await Promise.all(
        leaders
          .filter((leader) => String(leader?.role || "") === "requestor")
          .map(async (leader) => {
            const leaderBusinessAnchorId = String(
              leader?.businessAnchorId || "",
            ).trim();
            const circleIds = leaderBusinessAnchorId
              ? await getDirectReferralCircleAnchorIds(leaderBusinessAnchorId, {
                  allowedBusinessTypes: ["requestor"],
                })
              : [];
            return [leaderBusinessAnchorId, circleIds];
          }),
      ),
    );

    const groups = leaders.map((leader) => {
      const leaderBusinessAnchorId = String(leader?.businessAnchorId || "");
      const directCount =
        directCountByLeaderBusinessAnchorId.get(leaderBusinessAnchorId) || 0;
      const rollingAggregate = leaderBusinessAnchorId
        ? rollingAggregateByBusinessAnchorId.get(leaderBusinessAnchorId)
        : null;
      const snapshotGroupMemberCount = Number(
        rollingAggregate?.groupMemberCount || 0,
      );
      const role = String(leader?.role || "");
      const fallbackChildBusinessAnchorIds = Array.from(
        childBusinessAnchorIdsByLeaderBusinessAnchorId.get(
          leaderBusinessAnchorId,
        ) || [],
      );
      const requestorCircleBusinessAnchorIds =
        requestorCircleBusinessAnchorIdsByLeaderBusinessAnchorId.get(
          leaderBusinessAnchorId,
        ) || [];

      const groupTotalOrders = Number(
        rollingAggregate?.groupTotalOrders30d || 0,
      );
      let groupRevenueAmount = 0;
      let groupBonusAmount = 0;
      if (REFERRAL_REVENUE_OWNER_ROLES.has(role)) {
        const businessStats = leaderBusinessAnchorId
          ? requestorBusinessStatsByBusinessAnchorId.get(leaderBusinessAnchorId)
          : null;
        groupRevenueAmount = Number(businessStats?.revenueAmount || 0);
        groupBonusAmount = Number(businessStats?.bonusAmount || 0);
      } else {
        groupRevenueAmount =
          Number(revenueByBusinessAnchorId.get(leaderBusinessAnchorId) || 0) +
          fallbackChildBusinessAnchorIds.reduce(
            (acc, businessAnchorId) =>
              acc +
              Number(
                revenueByBusinessAnchorId.get(String(businessAnchorId)) || 0,
              ),
            0,
          );
        groupBonusAmount =
          Number(bonusByBusinessAnchorId.get(leaderBusinessAnchorId) || 0) +
          fallbackChildBusinessAnchorIds.reduce(
            (acc, businessAnchorId) =>
              acc +
              Number(
                bonusByBusinessAnchorId.get(String(businessAnchorId)) || 0,
              ),
            0,
          );
      }

      const effectiveUnitPrice =
        computeVolumeEffectiveUnitPrice(groupTotalOrders);
      const commissionAmount = REFERRAL_COMMISSION_LEADER_ROLES.has(role)
        ? Math.round(groupRevenueAmount * 0.05)
        : 0;

      return {
        leader,
        memberCount: REFERRAL_REVENUE_OWNER_ROLES.has(role)
          ? snapshotGroupMemberCount ||
            requestorCircleBusinessAnchorIds.length ||
            directCount + 1
          : directCount + 1,
        groupMemberCount:
          snapshotGroupMemberCount ||
          requestorCircleBusinessAnchorIds.length ||
          directCount + 1,
        groupTotalOrders,
        groupRevenueAmount,
        groupBonusAmount,
        effectiveUnitPrice,
        commissionAmount,
        snapshotComputedAt: rollingAggregate?.computedAt || null,
      };
    });

    const requestorGroups = groups.filter((g) =>
      REFERRAL_REVENUE_OWNER_ROLES.has(String(g?.leader?.role || "")),
    );
    const salesmanGroups = groups.filter((g) =>
      REFERRAL_COMMISSION_LEADER_ROLES.has(String(g?.leader?.role || "")),
    );

    const requestorGroupCount = requestorGroups.length;
    const salesmanGroupCount = salesmanGroups.length;
    const requestorTotalAccounts = requestorGroups.reduce(
      (acc, g) => acc + Number(g.groupMemberCount || g.memberCount || 0),
      0,
    );
    const salesmanTotalAccounts = salesmanGroups.reduce(
      (acc, g) => acc + Number(g.groupMemberCount || g.memberCount || 0),
      0,
    );
    const requestorTotalRevenueAmount = requestorGroups.reduce(
      (acc, g) => acc + Number(g.groupRevenueAmount || 0),
      0,
    );
    const requestorTotalBonusAmount = requestorGroups.reduce(
      (acc, g) => acc + Number(g.groupBonusAmount || 0),
      0,
    );
    const requestorTotalOrders = requestorGroups.reduce(
      (acc, g) => acc + Number(g.groupTotalOrders || 0),
      0,
    );
    const salesmanTotalReferredRevenueAmount = salesmanGroups.reduce(
      (acc, g) => acc + Number(g.groupRevenueAmount || 0),
      0,
    );
    const salesmanTotalReferredBonusAmount = salesmanGroups.reduce(
      (acc, g) => acc + Number(g.groupBonusAmount || 0),
      0,
    );
    const salesmanTotalReferralOrders = salesmanGroups.reduce(
      (acc, g) => acc + Number(g.groupTotalOrders || 0),
      0,
    );
    const salesmanTotalCommissionAmount = salesmanGroups.reduce(
      (acc, g) => acc + Number(g.commissionAmount || 0),
      0,
    );

    const payload = {
      success: true,
      data: {
        overview: {
          ymd,
          totalGroups: groups.length,
          totalAccounts: groups.reduce(
            (acc, g) => acc + Number(g.memberCount || 0),
            0,
          ),
          totalGroupOrders: groups.reduce(
            (acc, g) => acc + Number(g.groupTotalOrders || 0),
            0,
          ),
          avgEffectiveUnitPrice: requestorGroupCount
            ? Math.round(
                requestorGroups.reduce(
                  (acc, g) => acc + Number(g.effectiveUnitPrice || 0),
                  0,
                ) / requestorGroupCount,
              )
            : 0,
          requestor: {
            groupCount: requestorGroupCount,
            avgAccountsPerGroup: requestorGroupCount
              ? Math.round(requestorTotalAccounts / requestorGroupCount)
              : 0,
            netNewGroups: 0,
            avgRevenuePerGroup: requestorGroupCount
              ? Math.round(requestorTotalRevenueAmount / requestorGroupCount)
              : 0,
            totalRevenueAmount: requestorTotalRevenueAmount,
            totalBonusAmount: requestorTotalBonusAmount,
            totalOrders: requestorTotalOrders,
          },
          salesman: {
            groupCount: salesmanGroupCount,
            avgAccountsPerGroup: salesmanGroupCount
              ? Math.round(salesmanTotalAccounts / salesmanGroupCount)
              : 0,
            netNewGroups: 0,
            avgCommissionPerGroup: salesmanGroupCount
              ? Math.round(salesmanTotalCommissionAmount / salesmanGroupCount)
              : 0,
            totalCommissionAmount: salesmanTotalCommissionAmount,
            totalReferredRevenueAmount: salesmanTotalReferredRevenueAmount,
            totalReferredBonusAmount: salesmanTotalReferredBonusAmount,
            totalReferralOrders: salesmanTotalReferralOrders,
          },
        },
        groups,
      },
    };

    if (!refresh)
      setAdminReferralCache(`referral-groups:v6${cacheKeySuffix}`, payload);
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소개 그룹 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getReferralGroupTree(req, res) {
  try {
    const { leaderId } = req.params;
    const lite = String(req.query.lite || "") === "1";
    const requestingUserId = String(req.user?._id || req.user?.id || "");
    const requestingUserRole = String(req.user?.role || "");

    if (!Types.ObjectId.isValid(leaderId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 리더 ID입니다." });
    }

    // 본인 또는 admin만 접근 가능
    if (
      requestingUserRole !== "admin" &&
      String(leaderId) !== requestingUserId
    ) {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    const refresh = String(req.query.refresh || "") === "1";
    const leader = await User.findById(leaderId)
      .select({
        _id: 1,
        role: 1,
        requestorRole: 1,
        name: 1,
        email: 1,
        business: 1,
        businessAnchorId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
        referredByAnchorId: 1,
      })
      .lean();

    if (!leader || !REFERRAL_TREE_ROLES.includes(String(leader.role || ""))) {
      const error = new Error("리더를 찾을 수 없습니다.");
      error.statusCode = 404;
      throw error;
    }

    const leaderBusinessAnchorIdForCache = String(
      leader?.businessAnchorId || "",
    ).trim();
    const cacheKey = `referral-group-tree:v11:${leaderId}:anchor=${leaderBusinessAnchorIdForCache}:lite=${lite ? 1 : 0}`;
    if (!refresh) {
      const cached = getAdminReferralCache(cacheKey);
      if (cached) return res.status(200).json(cached);
    }

    const payload = await withAdminReferralInFlight(cacheKey, async () => {
      const leaderBusinessAnchorId = String(leader?.businessAnchorId || "");
      if (!Types.ObjectId.isValid(leaderBusinessAnchorId)) {
        const error = new Error(
          "리더의 사업자 정보가 없어 그룹 트리를 구성할 수 없습니다.",
        );
        error.statusCode = 400;
        throw error;
      }

      // 트리의 canonical node는 User가 아니라 BusinessAnchor다.
      // 각 계정은 항상 자기 자신의 사업자를 루트로 본다.
      // 따라서 루트는 상위 소개자 ancestor가 아니라 요청한 리더의 businessAnchorId다.
      const rootBusinessAnchorId = String(leaderBusinessAnchorId);

      const leaderAnchor = await BusinessAnchor.findById(rootBusinessAnchorId)
        .select({
          _id: 1,
          businessType: 1,
          name: 1,
          metadata: 1,
          referredByAnchorId: 1,
          createdAt: 1,
          updatedAt: 1,
          status: 1,
        })
        .lean();
      if (!leaderAnchor) {
        const error = new Error("리더 사업자 정보를 찾을 수 없습니다.");
        error.statusCode = 404;
        throw error;
      }

      const isRequestorCircleGroup = String(leader?.role || "") === "requestor";
      let anchorMembers;
      if (isRequestorCircleGroup) {
        const circleAnchorIds = await getDirectReferralCircleAnchorIds(
          rootBusinessAnchorId,
          { allowedBusinessTypes: ["requestor"] },
        );
        const circleAnchorObjectIds = circleAnchorIds.map(
          (id) => new Types.ObjectId(id),
        );
        const circleAnchors = circleAnchorObjectIds.length
          ? await BusinessAnchor.find({ _id: { $in: circleAnchorObjectIds } })
              .select({
                _id: 1,
                businessType: 1,
                name: 1,
                metadata: 1,
                referredByAnchorId: 1,
                createdAt: 1,
                updatedAt: 1,
                status: 1,
              })
              .lean()
          : [];
        const anchorById = new Map(
          circleAnchors.map((anchor) => [String(anchor?._id || ""), anchor]),
        );
        anchorMembers = circleAnchorIds
          .map((id) => anchorById.get(String(id)))
          .filter(Boolean);
      } else {
        const descendantRows = await BusinessAnchor.aggregate([
          {
            $match: {
              _id: new Types.ObjectId(rootBusinessAnchorId),
            },
          },
          {
            $graphLookup: {
              from: "businessanchors",
              startWith: "$_id",
              connectFromField: "_id",
              connectToField: "referredByAnchorId",
              as: "descendants",
              restrictSearchWithMatch: {
                businessType: { $in: REFERRAL_TREE_ROLES },
              },
            },
          },
          {
            $project: {
              descendants: {
                $map: {
                  input: "$descendants",
                  as: "anchor",
                  in: {
                    _id: "$$anchor._id",
                    businessType: "$$anchor.businessType",
                    name: "$$anchor.name",
                    metadata: "$$anchor.metadata",
                    referredByAnchorId: "$$anchor.referredByAnchorId",
                    createdAt: "$$anchor.createdAt",
                    updatedAt: "$$anchor.updatedAt",
                    status: "$$anchor.status",
                  },
                },
              },
            },
          },
        ]);
        anchorMembers = [
          leaderAnchor,
          ...(descendantRows?.[0]?.descendants || []).filter(
            (anchor) => String(anchor?._id || "") !== String(leaderAnchor._id),
          ),
        ];
      }

      const memberBusinessAnchorIds = Array.from(
        new Set(
          (anchorMembers || [])
            .map((u) => String(u?._id || ""))
            .filter((id) => id && Types.ObjectId.isValid(id)),
        ),
      ).map((id) => new Types.ObjectId(id));

      const representativeUsers = memberBusinessAnchorIds.length
        ? await User.find({
            businessAnchorId: { $in: memberBusinessAnchorIds },
            active: true,
            role: { $in: REFERRAL_TREE_ROLES },
          })
            .select({
              _id: 1,
              role: 1,
              requestorRole: 1,
              name: 1,
              email: 1,
              business: 1,
              businessAnchorId: 1,
              active: 1,
              createdAt: 1,
              approvedAt: 1,
              updatedAt: 1,
            })
            .lean()
        : [];

      const representativeUsersByBusinessAnchorId = new Map();
      for (const row of representativeUsers || []) {
        const businessAnchorId = String(row?.businessAnchorId || "").trim();
        if (!businessAnchorId) continue;
        const list =
          representativeUsersByBusinessAnchorId.get(businessAnchorId) || [];
        list.push(row);
        representativeUsersByBusinessAnchorId.set(businessAnchorId, list);
      }

      const range30 = getLast30DaysRangeUtc();
      const start = range30?.start;
      const end = range30?.end;
      const startYmd = start ? toKstYmd(start) : null;
      const endYmd = end ? toKstYmd(end) : null;

      const shippingOrderCountByBusinessAnchorId =
        await getShippingRequestCountByBusinessAnchorIds({
          businessAnchorIds: memberBusinessAnchorIds,
          startYmd,
          endYmd,
        });

      const businessStatsRows =
        !lite && memberBusinessAnchorIds.length && start && end
          ? await Request.aggregate([
              {
                $match: {
                  businessAnchorId: { $in: memberBusinessAnchorIds },
                  manufacturerStage: "추적관리",
                  createdAt: { $gte: start, $lte: end },
                },
              },
              {
                $group: {
                  _id: "$businessAnchorId",
                  lastMonthOrders: { $sum: 1 },
                  lastMonthPaidOrders: {
                    $sum: {
                      $cond: [
                        { $gt: [{ $ifNull: ["$price.paidAmount", 0] }, 0] },
                        1,
                        0,
                      ],
                    },
                  },
                  lastMonthBonusOrders: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            {
                              $gt: [{ $ifNull: ["$price.bonusAmount", 0] }, 0],
                            },
                            { $eq: [{ $ifNull: ["$price.paidAmount", 0] }, 0] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  lastMonthPaidRevenue: {
                    $sum: { $ifNull: ["$price.paidAmount", 0] },
                  },
                  lastMonthBonusRevenue: {
                    $sum: { $ifNull: ["$price.bonusAmount", 0] },
                  },
                },
              },
            ])
          : [];

      const businessStatsByBusinessAnchorId = new Map(
        businessStatsRows.map((row) => [
          String(row._id),
          {
            lastMonthOrders: Number(row.lastMonthOrders || 0),
            lastMonthPaidOrders: Number(row.lastMonthPaidOrders || 0),
            lastMonthBonusOrders: Number(row.lastMonthBonusOrders || 0),
            lastMonthPaidRevenue: Number(row.lastMonthPaidRevenue || 0),
            lastMonthBonusRevenue: Number(row.lastMonthBonusRevenue || 0),
          },
        ]),
      );

      const nodes = anchorMembers.map((anchor) => {
        const businessAnchorId = String(anchor?._id || "");
        const representative = pickRepresentativeUser(
          representativeUsersByBusinessAnchorId.get(businessAnchorId) || [],
        );
        return {
          _id: businessAnchorId,
          role: representative?.role || anchor?.businessType || "requestor",
          requestorRole: representative?.requestorRole || null,
          name: representative?.name || anchor?.name || "",
          email: representative?.email || anchor?.metadata?.email || "",
          business: representative?.business || anchor?.name || "",
          businessAnchorId,
          active:
            representative?.active ??
            (String(anchor?.status || "") !== "inactive" &&
              String(anchor?.status || "") !== "merged"),
          createdAt: representative?.createdAt || anchor?.createdAt || null,
          approvedAt: representative?.approvedAt || null,
          updatedAt: representative?.updatedAt || anchor?.updatedAt || null,
          referredByAnchorId: anchor?.referredByAnchorId || null,
          lastMonthOrders: Number(
            shippingOrderCountByBusinessAnchorId.get(businessAnchorId) || 0,
          ),
          lastMonthPaidOrders: Number(
            businessStatsByBusinessAnchorId.get(businessAnchorId)
              ?.lastMonthPaidOrders || 0,
          ),
          lastMonthBonusOrders: Number(
            businessStatsByBusinessAnchorId.get(businessAnchorId)
              ?.lastMonthBonusOrders || 0,
          ),
          lastMonthPaidRevenue: Number(
            businessStatsByBusinessAnchorId.get(businessAnchorId)
              ?.lastMonthPaidRevenue || 0,
          ),
          lastMonthBonusRevenue: Number(
            businessStatsByBusinessAnchorId.get(businessAnchorId)
              ?.lastMonthBonusRevenue || 0,
          ),
          children: [],
        };
      });
      const nodeById = new Map(nodes.map((n) => [String(n._id), n]));
      if (isRequestorCircleGroup) {
        const rootNodeForCircle = nodeById.get(String(rootBusinessAnchorId));
        if (rootNodeForCircle) {
          rootNodeForCircle.children = nodes.filter(
            (node) => String(node._id) !== String(rootBusinessAnchorId),
          );
        }
      } else {
        for (const node of nodes) {
          const parentBusinessAnchorId = node.referredByAnchorId
            ? String(node.referredByAnchorId)
            : null;
          if (!parentBusinessAnchorId || !nodeById.has(parentBusinessAnchorId))
            continue;
          if (parentBusinessAnchorId === String(node._id)) continue;
          nodeById.get(parentBusinessAnchorId).children.push(node);
        }
      }

      const effectiveRootAnchor = leaderAnchor;
      const rootLeaderUser = leader;

      const rootNode = nodeById.get(String(rootBusinessAnchorId)) || {
        _id: rootBusinessAnchorId,
        role:
          rootLeaderUser?.role ||
          effectiveRootAnchor?.businessType ||
          "requestor",
        requestorRole: rootLeaderUser?.requestorRole || null,
        name: rootLeaderUser?.name || effectiveRootAnchor?.name || "",
        email:
          rootLeaderUser?.email || effectiveRootAnchor?.metadata?.email || "",
        business: rootLeaderUser?.business || effectiveRootAnchor?.name || "",
        businessAnchorId: rootBusinessAnchorId,
        active:
          rootLeaderUser?.active ??
          (String(effectiveRootAnchor?.status || "") !== "inactive" &&
            String(effectiveRootAnchor?.status || "") !== "merged"),
        createdAt:
          rootLeaderUser?.createdAt || effectiveRootAnchor?.createdAt || null,
        approvedAt: rootLeaderUser?.approvedAt || null,
        updatedAt:
          rootLeaderUser?.updatedAt || effectiveRootAnchor?.updatedAt || null,
        referredByAnchorId: effectiveRootAnchor?.referredByAnchorId || null,
        children: [],
      };
      if (
        !lite &&
        REFERRAL_COMMISSION_LEADER_ROLES.has(String(rootNode.role || ""))
      ) {
        const isDevops = String(rootNode.role || "") === "devops";
        const directChildren = Array.isArray(rootNode.children)
          ? rootNode.children
          : [];
        let directCommissionAmount = 0;
        let level1CommissionAmount = 0;
        for (const child of directChildren) {
          if (String(child?.role || "") === "requestor") {
            directCommissionAmount += Math.round(
              Number(child?.lastMonthPaidRevenue || 0) * 0.05,
            );
          } else if (
            !isDevops &&
            REFERRAL_COMMISSION_LEADER_ROLES.has(String(child?.role || ""))
          ) {
            const grandChildren = Array.isArray(child?.children)
              ? child.children
              : [];
            for (const grandChild of grandChildren) {
              if (String(grandChild?.role || "") !== "requestor") continue;
              level1CommissionAmount += Math.round(
                Number(grandChild?.lastMonthPaidRevenue || 0) * 0.025,
              );
            }
          }
        }
        rootNode.directCommissionAmount = directCommissionAmount;
        rootNode.level1CommissionAmount = level1CommissionAmount;
        rootNode.commissionAmount =
          Number(directCommissionAmount || 0) +
          Number(level1CommissionAmount || 0);
      }

      const payload = {
        success: true,
        data: {
          leader,
          memberCount: nodes.length,
          tree: rootNode,
        },
      };
      if (!refresh) setAdminReferralCache(cacheKey, payload);
      return payload;
    });

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message:
        error?.statusCode && error?.message
          ? error.message
          : "소개 그룹 계층도 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function recalcReferralSnapshot() {
  const ymd = getTodayYmdInKst();
  if (!ymd) return { success: false, message: "날짜 계산 실패" };

  const rawLeaders = await User.find({
    $or: REFERRAL_LEADER_ROLE_FILTER,
    active: true,
  })
    .select({ _id: 1, role: 1, businessAnchorId: 1 })
    .lean();
  const leaders = normalizeReferralLeaders(rawLeaders);

  if (!leaders.length) {
    clearAdminReferralCaches();
    return { success: true, upsertCount: 0, ymd, computedAt: new Date() };
  }

  let upsertCount = 0;
  const computedAt = new Date();
  for (const leader of leaders) {
    const leaderBusinessAnchorId = String(leader?.businessAnchorId || "");
    if (
      !leaderBusinessAnchorId ||
      !Types.ObjectId.isValid(leaderBusinessAnchorId)
    ) {
      continue;
    }
    const result = await recomputePricingReferralSnapshotForLeaderAnchorId(
      leaderBusinessAnchorId,
    );
    if (result) upsertCount += 1;
  }

  clearAdminReferralCaches();
  return { success: true, upsertCount, ymd, computedAt };
}

export async function triggerReferralSnapshotRecalc(req, res) {
  try {
    const out = await recalcReferralSnapshot();
    if (!out.success) return res.status(500).json(out);
    return res.status(200).json({
      ...out,
      computedAt: out?.computedAt ? out.computedAt.toISOString() : null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "스냅샷 재계산 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getReferralSnapshotStatus(req, res) {
  try {
    const ymd = getTodayYmdInKst();
    const latest = await PricingReferralRolling30dAggregate.findOne({ ymd })
      .sort({ computedAt: -1 })
      .select({ computedAt: 1, ymd: 1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: {
        lastComputedAt: latest?.computedAt || null,
        baseYmd: ymd,
        snapshotMissing: !latest,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "스냅샷 상태 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
