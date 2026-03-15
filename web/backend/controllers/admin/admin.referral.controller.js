import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import PricingReferralStatsSnapshot from "../../models/pricingReferralStatsSnapshot.model.js";
import {
  getThisMonthStartYmdInKst,
  getLast30DaysRangeUtc,
} from "../requests/utils.js";
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";
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

function normalizeReferralLeaders(leaders) {
  const pickedByBusinessAnchorId = new Map();

  for (const leader of leaders || []) {
    const businessAnchorId = String(leader?.businessAnchorId || "").trim();
    if (!businessAnchorId || !Types.ObjectId.isValid(businessAnchorId))
      continue;

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

  return Array.from(pickedByBusinessAnchorId.values()).sort((a, b) => {
    const aCreatedAt = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreatedAt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bCreatedAt - aCreatedAt;
  });
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
        leaderUserId: 1,
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
    const cacheKey = `referral-group-tree:v4:${leaderId}`;
    const refresh = String(req.query.refresh || "") === "1";
    if (!refresh) {
      const cached = getAdminReferralCache(cacheKey);
      if (cached) return res.status(200).json(cached);
    }
    if (!Types.ObjectId.isValid(leaderId)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 리더 ID입니다." });
    }

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
      return res
        .status(404)
        .json({ success: false, message: "리더를 찾을 수 없습니다." });
    }

    const leaderBusinessAnchorId = String(leader?.businessAnchorId || "");
    if (!Types.ObjectId.isValid(leaderBusinessAnchorId)) {
      return res.status(400).json({
        success: false,
        message: "리더의 사업자 정보가 없어 그룹 트리를 구성할 수 없습니다.",
      });
    }

    const memberMap = new Map();
    const queueBusinessAnchorIds = [leaderBusinessAnchorId];
    const visitedParentBusinessAnchorIds = new Set();

    memberMap.set(String(leader._id), leader);

    while (queueBusinessAnchorIds.length) {
      const frontier = queueBusinessAnchorIds.splice(0, 100);
      const parentBusinessAnchorIds = frontier.filter(
        (id) => id && !visitedParentBusinessAnchorIds.has(id),
      );
      if (!parentBusinessAnchorIds.length) continue;

      parentBusinessAnchorIds.forEach((id) =>
        visitedParentBusinessAnchorIds.add(id),
      );
      const parentBusinessAnchorObjectIds = parentBusinessAnchorIds.map(
        (id) => new Types.ObjectId(id),
      );
      const children = await User.find({
        referredByAnchorId: { $in: parentBusinessAnchorObjectIds },
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
          referredByAnchorId: 1,
        })
        .lean();

      for (const child of children) {
        memberMap.set(String(child._id), child);
        const childBusinessAnchorId = String(child?.businessAnchorId || "");
        if (
          childBusinessAnchorId &&
          Types.ObjectId.isValid(childBusinessAnchorId) &&
          !visitedParentBusinessAnchorIds.has(childBusinessAnchorId)
        ) {
          queueBusinessAnchorIds.push(childBusinessAnchorId);
        }
      }
    }

    const members = Array.from(memberMap.values());

    const memberBusinessAnchorIds = Array.from(
      new Set(
        (members || [])
          .map((u) => String(u?.businessAnchorId || ""))
          .filter((id) => id && Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const range30 = getLast30DaysRangeUtc();
    const start = range30?.start;
    const end = range30?.end;

    const businessStatsRows =
      memberBusinessAnchorIds.length && start && end
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
                          { $gt: [{ $ifNull: ["$price.bonusAmount", 0] }, 0] },
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

    const nodes = members.map((u) => ({
      ...u,
      lastMonthOrders: Number(
        businessStatsByBusinessAnchorId.get(String(u?.businessAnchorId || ""))
          ?.lastMonthOrders || 0,
      ),
      lastMonthPaidOrders: Number(
        businessStatsByBusinessAnchorId.get(String(u?.businessAnchorId || ""))
          ?.lastMonthPaidOrders || 0,
      ),
      lastMonthBonusOrders: Number(
        businessStatsByBusinessAnchorId.get(String(u?.businessAnchorId || ""))
          ?.lastMonthBonusOrders || 0,
      ),
      lastMonthPaidRevenue: Number(
        businessStatsByBusinessAnchorId.get(String(u?.businessAnchorId || ""))
          ?.lastMonthPaidRevenue || 0,
      ),
      lastMonthBonusRevenue: Number(
        businessStatsByBusinessAnchorId.get(String(u?.businessAnchorId || ""))
          ?.lastMonthBonusRevenue || 0,
      ),
      referredByAnchorId: u.referredByAnchorId || null,
      children: [],
    }));
    const nodeById = new Map(nodes.map((n) => [String(n._id), n]));
    const representativeByBusinessAnchorId = new Map();
    for (const node of nodes) {
      const businessAnchorId = String(node?.businessAnchorId || "");
      if (!businessAnchorId || !Types.ObjectId.isValid(businessAnchorId))
        continue;
      if (
        businessAnchorId === leaderBusinessAnchorId &&
        String(node._id) === String(leader._id)
      ) {
        representativeByBusinessAnchorId.set(businessAnchorId, node);
        continue;
      }
      if (!representativeByBusinessAnchorId.has(businessAnchorId)) {
        representativeByBusinessAnchorId.set(businessAnchorId, node);
      }
    }
    for (const node of nodes) {
      const parentBusinessAnchorId = node.referredByAnchorId
        ? String(node.referredByAnchorId)
        : null;
      const parentNode = parentBusinessAnchorId
        ? representativeByBusinessAnchorId.get(parentBusinessAnchorId)
        : null;
      const parentId = parentNode?._id ? String(parentNode._id) : null;
      if (!parentId || !nodeById.has(parentId)) continue;
      if (parentId === String(node._id)) continue;
      nodeById.get(parentId).children.push(node);
    }

    const rootNode = nodeById.get(String(leader._id)) || {
      ...leader,
      children: [],
    };
    if (REFERRAL_COMMISSION_LEADER_ROLES.has(String(rootNode.role || ""))) {
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
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "소개 그룹 계층도 조회 중 오류가 발생했습니다.",
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
            leaderUserId: leader._id,
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
