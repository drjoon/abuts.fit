import { Types } from "mongoose";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import PricingReferralStatsSnapshot from "../../models/pricingReferralStatsSnapshot.model.js";
import {
  getThisMonthStartYmdInKst,
  getLast30DaysRangeUtc,
} from "../requests/utils.js";
import { getTodayYmdInKst, toKstYmd } from "../../utils/krBusinessDays.js";
import { computeVolumeEffectiveUnitPrice } from "./admin.shared.controller.js";
import { buildReferralLeaderAggregation } from "./adminReferral.aggregation.js";

const ADMIN_REFERRAL_CACHE_TTL_MS = 60 * 60 * 1000;
const REFERRAL_LEADER_ROLE_FILTER = [
  { role: "salesman" },
  { role: "devops" },
  { role: "requestor", requestorRole: "owner" },
];
const REFERRAL_TREE_ROLES = ["requestor", "salesman", "devops"];
const REFERRAL_REVENUE_OWNER_ROLES = new Set(["requestor", "devops"]);
const REFERRAL_COMMISSION_LEADER_ROLES = new Set(["salesman", "devops"]);
const adminReferralCache = new Map();
const adminReferralInFlight = new Map();

function getAdminReferralCache(key) {
  const hit = adminReferralCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ADMIN_REFERRAL_CACHE_TTL_MS) {
    adminReferralCache.delete(key);
    return null;
  }
  return hit.value;
}

function setAdminReferralCache(key, value) {
  adminReferralCache.set(key, { ts: Date.now(), value });
}

async function withAdminReferralInFlight(key, factory) {
  const existing = adminReferralInFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (adminReferralInFlight.get(key) === promise) {
        adminReferralInFlight.delete(key);
      }
    });

  adminReferralInFlight.set(key, promise);
  return promise;
}

function buildShippingRequestCountByBusinessKey(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const businessKey = String(row?.businessAnchorId || "").trim();
    if (!businessKey) continue;
    const count = Array.isArray(row?.requestIds)
      ? new Set(
          row.requestIds
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ).size
      : 0;
    map.set(businessKey, Number(map.get(businessKey) || 0) + count);
  }
  return map;
}

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
  ).map((id) => new Types.ObjectId(id));

  if (!validIds.length || !startYmd || !endYmd) {
    return new Map();
  }

  const rows = await ShippingPackage.aggregate([
    {
      $match: {
        businessAnchorId: { $in: validIds },
        shipDateYmd: { $gte: startYmd, $lte: endYmd },
      },
    },
    {
      $unwind: {
        path: "$requestIds",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $group: {
        _id: {
          businessAnchorId: "$businessAnchorId",
          requestId: "$requestIds",
        },
      },
    },
    {
      $group: {
        _id: "$_id.businessAnchorId",
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [String(row._id || "").trim(), Number(row.count || 0)]),
  );
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
        `referral-groups:v4${cacheKeySuffix}`,
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

    const ymd = getThisMonthStartYmdInKst();
    const snapshots = await PricingReferralStatsSnapshot.find({ ymd })
      .select({
        businessAnchorId: 1,
        groupMemberCount: 1,
        groupTotalOrders: 1,
        computedAt: 1,
      })
      .lean();

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
      ordersByBusinessAnchorId,
      revenueByBusinessAnchorId,
      bonusByBusinessAnchorId,
      requestorBusinessStatsByBusinessAnchorId,
    } = await buildReferralLeaderAggregation({
      leaders,
      periodStart,
      periodEnd,
    });
    const businessSnapshotByBusinessAnchorId = new Map(
      snapshots
        .filter((row) => String(row?.businessAnchorId || ""))
        .map((row) => [String(row?.businessAnchorId || ""), row]),
    );

    const groups = leaders.map((leader) => {
      const leaderBusinessAnchorId = String(leader?.businessAnchorId || "");
      const directCount =
        directCountByLeaderBusinessAnchorId.get(leaderBusinessAnchorId) || 0;
      const snapshot = leaderBusinessAnchorId
        ? businessSnapshotByBusinessAnchorId.get(leaderBusinessAnchorId)
        : null;
      const snapshotGroupMemberCount = Number(snapshot?.groupMemberCount || 0);
      const role = String(leader?.role || "");
      const fallbackChildBusinessAnchorIds = Array.from(
        childBusinessAnchorIdsByLeaderBusinessAnchorId.get(
          leaderBusinessAnchorId,
        ) || [],
      );

      let groupTotalOrders = 0;
      let groupRevenueAmount = 0;
      let groupBonusAmount = 0;
      if (REFERRAL_REVENUE_OWNER_ROLES.has(role)) {
        const businessStats = leaderBusinessAnchorId
          ? requestorBusinessStatsByBusinessAnchorId.get(leaderBusinessAnchorId)
          : null;
        groupTotalOrders = Number(businessStats?.orderCount || 0);
        groupRevenueAmount = Number(businessStats?.revenueAmount || 0);
        groupBonusAmount = Number(businessStats?.bonusAmount || 0);
      } else {
        const fallbackOrders = fallbackChildBusinessAnchorIds.reduce(
          (acc, businessAnchorId) =>
            acc +
            Number(ordersByBusinessAnchorId.get(String(businessAnchorId)) || 0),
          0,
        );
        const fallbackLeaderOrders = Number(
          ordersByBusinessAnchorId.get(leaderBusinessAnchorId) || 0,
        );
        groupTotalOrders = fallbackLeaderOrders + fallbackOrders;
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
        memberCount: directCount + 1,
        groupMemberCount: snapshotGroupMemberCount || directCount + 1,
        groupTotalOrders,
        groupRevenueAmount,
        groupBonusAmount,
        effectiveUnitPrice,
        commissionAmount,
        snapshotComputedAt: snapshot?.computedAt || null,
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
      setAdminReferralCache(`referral-groups:v4${cacheKeySuffix}`, payload);
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

    const cacheKey = `referral-group-tree:v6:${leaderId}:lite=${lite ? 1 : 0}`;
    const refresh = String(req.query.refresh || "") === "1";
    if (!refresh) {
      const cached = getAdminReferralCache(cacheKey);
      if (cached) return res.status(200).json(cached);
    }

    const payload = await withAdminReferralInFlight(cacheKey, async () => {
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

      const leaderBusinessAnchorId = String(leader?.businessAnchorId || "");
      if (!Types.ObjectId.isValid(leaderBusinessAnchorId)) {
        const error = new Error(
          "리더의 사업자 정보가 없어 그룹 트리를 구성할 수 없습니다.",
        );
        error.statusCode = 400;
        throw error;
      }

      // 트리의 canonical node는 User가 아니라 BusinessAnchor다.
      // user 그래프를 타면 같은 사업자에 속한 여러 user가 한 트리에 중복 포함되어
      // memberCount가 29처럼 부풀 수 있으므로 business-level edge만 읽는다.
      const leaderAnchor = await BusinessAnchor.findById(leaderBusinessAnchorId)
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

      const descendantRows = await BusinessAnchor.aggregate([
        {
          $match: {
            _id: new Types.ObjectId(leaderBusinessAnchorId),
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

      const anchorMembers = [
        leaderAnchor,
        ...(descendantRows?.[0]?.descendants || []).filter(
          (anchor) => String(anchor?._id || "") !== String(leaderAnchor._id),
        ),
      ];

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
      for (const node of nodes) {
        const parentBusinessAnchorId = node.referredByAnchorId
          ? String(node.referredByAnchorId)
          : null;
        if (!parentBusinessAnchorId || !nodeById.has(parentBusinessAnchorId))
          continue;
        if (parentBusinessAnchorId === String(node._id)) continue;
        nodeById.get(parentBusinessAnchorId).children.push(node);
      }

      const rootNode = nodeById.get(String(leaderBusinessAnchorId)) || {
        _id: leaderBusinessAnchorId,
        role: leader?.role || "requestor",
        requestorRole: leader?.requestorRole || null,
        name: leader?.name || leaderAnchor?.name || "",
        email: leader?.email || leaderAnchor?.metadata?.email || "",
        business: leader?.business || leaderAnchor?.name || "",
        businessAnchorId: leaderBusinessAnchorId,
        active: leader?.active ?? true,
        createdAt: leader?.createdAt || leaderAnchor?.createdAt || null,
        approvedAt: leader?.approvedAt || null,
        updatedAt: leader?.updatedAt || leaderAnchor?.updatedAt || null,
        referredByAnchorId: leaderAnchor?.referredByAnchorId || null,
        children: [],
      };
      if (
        !lite &&
        REFERRAL_COMMISSION_LEADER_ROLES.has(String(rootNode.role || ""))
      ) {
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
  const range30 = getLast30DaysRangeUtc();
  if (!ymd || !range30) return { success: false, message: "날짜 계산 실패" };
  const { start, end } = range30;

  const rawLeaders = await User.find({
    $or: REFERRAL_LEADER_ROLE_FILTER,
    active: true,
  })
    .select({ _id: 1, role: 1, businessAnchorId: 1 })
    .lean();
  const leaders = normalizeReferralLeaders(rawLeaders);

  if (!leaders.length) {
    adminReferralCache.clear();
    return { success: true, upsertCount: 0, ymd, computedAt: new Date() };
  }

  const {
    childIdsByLeaderBusinessAnchorId,
    childBusinessAnchorIdsByLeaderBusinessAnchorId,
    ordersByBusinessAnchorId,
  } = await buildReferralLeaderAggregation({
    leaders,
    periodStart: start,
    periodEnd: end,
  });

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
    const children =
      childIdsByLeaderBusinessAnchorId.get(leaderBusinessAnchorId) || [];
    const childBusinessAnchorIds = Array.from(
      childBusinessAnchorIdsByLeaderBusinessAnchorId.get(
        leaderBusinessAnchorId,
      ) || [],
    );
    const memberCount = 1 + children.length;
    const groupTotalOrders =
      Number(ordersByBusinessAnchorId.get(leaderBusinessAnchorId) || 0) +
      childBusinessAnchorIds.reduce(
        (acc, businessAnchorId) =>
          acc +
          Number(ordersByBusinessAnchorId.get(String(businessAnchorId)) || 0),
        0,
      );
    const snapshotBusinessAnchorId = new Types.ObjectId(leaderBusinessAnchorId);

    if (snapshotBusinessAnchorId) {
      await PricingReferralStatsSnapshot.findOneAndUpdate(
        { businessAnchorId: snapshotBusinessAnchorId, ymd },
        {
          $set: {
            businessAnchorId: snapshotBusinessAnchorId,
            groupMemberCount: memberCount,
            groupTotalOrders,
            computedAt,
          },
        },
        { upsert: true, new: false },
      );
    }
    upsertCount += 1;
  }

  adminReferralCache.clear();
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
    const latest = await PricingReferralStatsSnapshot.findOne({ ymd })
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
