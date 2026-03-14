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

const ADMIN_REFERRAL_CACHE_TTL_MS = 60 * 60 * 1000;
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

    const leaders = await User.find({
      $or: [
        { role: "salesman" },
        { role: "requestor", requestorRole: "owner" },
      ],
    })
      .select({
        _id: 1,
        role: 1,
        requestorRole: 1,
        name: 1,
        email: 1,
        business: 1,
        businessId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1 })
      .lean();

    const leaderBusinessIds = leaders
      .map((l) => String(l?.businessId || ""))
      .filter((id) => id && Types.ObjectId.isValid(id));
    const leaderBusinessObjectIds = leaderBusinessIds.map(
      (id) => new Types.ObjectId(id),
    );
    if (!leaders.length) {
      return res.status(200).json({ success: true, data: { groups: [] } });
    }

    const ymd = getThisMonthStartYmdInKst();
    const [directCounts, snapshots] = await Promise.all([
      User.aggregate([
        {
          $match: {
            referredByBusinessId: { $in: leaderBusinessObjectIds },
            active: true,
            role: { $in: ["requestor", "salesman"] },
          },
        },
        { $group: { _id: "$referredByBusinessId", count: { $sum: 1 } } },
      ]),
      PricingReferralStatsSnapshot.find({ ymd })
        .select({
          businessId: 1,
          leaderUserId: 1,
          groupMemberCount: 1,
          groupTotalOrders: 1,
          computedAt: 1,
        })
        .lean(),
    ]);

    const now = new Date();
    const defaultRange = getLast30DaysRangeUtc(now);
    const periodStart = startDateRaw
      ? new Date(startDateRaw)
      : (defaultRange?.start ??
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const periodEnd = endDateRaw
      ? new Date(endDateRaw)
      : (defaultRange?.end ?? now);

    const directChildren = await User.find({
      referredByBusinessId: { $in: leaderBusinessObjectIds },
      role: { $in: ["requestor", "salesman"] },
      active: true,
    })
      .select({ _id: 1, referredByBusinessId: 1, businessId: 1 })
      .lean();

    const relevantBusinessIds = Array.from(
      new Set(
        [...leaders, ...directChildren]
          .map((u) => String(u?.businessId || ""))
          .filter((id) => id && Types.ObjectId.isValid(id)),
      ),
    );
    const relevantBusinessObjectIds = relevantBusinessIds.map(
      (id) => new Types.ObjectId(id),
    );
    const requestRows = relevantBusinessObjectIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestorBusinessId: { $in: relevantBusinessObjectIds },
              manufacturerStage: "추적관리",
              createdAt: { $gte: periodStart, $lte: periodEnd },
            },
          },
          {
            $group: {
              _id: "$requestorBusinessId",
              orderCount: { $sum: 1 },
              revenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
              bonusAmount: { $sum: { $ifNull: ["$price.bonusAmount", 0] } },
            },
          },
        ])
      : [];

    const requestorLeaderBusinessIds = leaders
      .filter((l) => String(l?.role || "") === "requestor")
      .map((l) => String(l?.businessId || ""))
      .filter(Boolean);
    const requestorLeaderBusinessObjectIds = requestorLeaderBusinessIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const requestorBusinessRows = requestorLeaderBusinessObjectIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestorBusinessId: { $in: requestorLeaderBusinessObjectIds },
              manufacturerStage: "추적관리",
              createdAt: { $gte: periodStart, $lte: periodEnd },
            },
          },
          {
            $group: {
              _id: "$requestorBusinessId",
              orderCount: { $sum: 1 },
              revenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
              bonusAmount: { $sum: { $ifNull: ["$price.bonusAmount", 0] } },
            },
          },
        ])
      : [];

    const requestorBusinessStatsByBusinessId = new Map(
      requestorBusinessRows.map((r) => [
        String(r._id),
        {
          orderCount: Number(r.orderCount || 0),
          revenueAmount: Number(r.revenueAmount || 0),
          bonusAmount: Number(r.bonusAmount || 0),
        },
      ]),
    );

    const ordersByBusinessId = new Map(
      requestRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
    );
    const revenueByBusinessId = new Map(
      requestRows.map((r) => [String(r._id), Number(r.revenueAmount || 0)]),
    );
    const bonusByBusinessId = new Map(
      requestRows.map((r) => [String(r._id), Number(r.bonusAmount || 0)]),
    );
    const requestorBusinessSnapshotByBusinessId = new Map(
      snapshots
        .filter((row) => String(row?.businessId || ""))
        .map((row) => [String(row?.businessId || ""), row]),
    );

    const childIdsByLeaderBusinessId = new Map();
    const childBusinessIdsByLeaderBusinessId = new Map();
    for (const u of directChildren) {
      const leaderBusinessId = String(u?.referredByBusinessId || "");
      if (!leaderBusinessId) continue;
      const arr = childIdsByLeaderBusinessId.get(leaderBusinessId) || [];
      arr.push(String(u._id));
      childIdsByLeaderBusinessId.set(leaderBusinessId, arr);
      const childBusinessId = String(u?.businessId || "");
      if (childBusinessId && Types.ObjectId.isValid(childBusinessId)) {
        const businessSet =
          childBusinessIdsByLeaderBusinessId.get(leaderBusinessId) || new Set();
        businessSet.add(childBusinessId);
        childBusinessIdsByLeaderBusinessId.set(leaderBusinessId, businessSet);
      }
    }

    const directCountByLeaderBusinessId = new Map();
    for (const r of directCounts) {
      directCountByLeaderBusinessId.set(String(r._id), Number(r.count || 0));
    }

    const groups = leaders.map((leader) => {
      const leaderBusinessId = String(leader?.businessId || "");
      const directCount =
        directCountByLeaderBusinessId.get(leaderBusinessId) || 0;
      const snapshot = leaderBusinessId
        ? requestorBusinessSnapshotByBusinessId.get(leaderBusinessId)
        : null;
      const snapshotGroupMemberCount = Number(snapshot?.groupMemberCount || 0);
      const role = String(leader?.role || "");
      const fallbackChildBusinessIds = Array.from(
        childBusinessIdsByLeaderBusinessId.get(leaderBusinessId) || [],
      );

      let groupTotalOrders = 0;
      let groupRevenueAmount = 0;
      let groupBonusAmount = 0;
      if (role === "requestor") {
        const businessStats = leaderBusinessId
          ? requestorBusinessStatsByBusinessId.get(leaderBusinessId)
          : null;
        groupTotalOrders = Number(businessStats?.orderCount || 0);
        groupRevenueAmount = Number(businessStats?.revenueAmount || 0);
        groupBonusAmount = Number(businessStats?.bonusAmount || 0);
      } else {
        const fallbackOrders = fallbackChildBusinessIds.reduce(
          (acc, businessId) =>
            acc + Number(ordersByBusinessId.get(String(businessId)) || 0),
          0,
        );
        const fallbackLeaderOrders = Number(
          ordersByBusinessId.get(leaderBusinessId) || 0,
        );
        groupTotalOrders = fallbackLeaderOrders + fallbackOrders;
        groupRevenueAmount =
          Number(revenueByBusinessId.get(leaderBusinessId) || 0) +
          fallbackChildBusinessIds.reduce(
            (acc, businessId) =>
              acc + Number(revenueByBusinessId.get(String(businessId)) || 0),
            0,
          );
        groupBonusAmount =
          Number(bonusByBusinessId.get(leaderBusinessId) || 0) +
          fallbackChildBusinessIds.reduce(
            (acc, businessId) =>
              acc + Number(bonusByBusinessId.get(String(businessId)) || 0),
            0,
          );
      }

      const effectiveUnitPrice =
        computeVolumeEffectiveUnitPrice(groupTotalOrders);
      const commissionAmount =
        role === "salesman" ? Math.round(groupRevenueAmount * 0.05) : 0;

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

    const requestorGroups = groups.filter(
      (g) => String(g?.leader?.role || "") === "requestor",
    );
    const salesmanGroups = groups.filter(
      (g) => String(g?.leader?.role || "") === "salesman",
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
        businessId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
        referredByBusinessId: 1,
      })
      .lean();

    if (
      !leader ||
      !["requestor", "salesman"].includes(String(leader.role || ""))
    ) {
      return res
        .status(404)
        .json({ success: false, message: "리더를 찾을 수 없습니다." });
    }

    const leaderBusinessId = String(leader?.businessId || "");
    if (!Types.ObjectId.isValid(leaderBusinessId)) {
      return res.status(400).json({
        success: false,
        message: "리더의 사업자 정보가 없어 그룹 트리를 구성할 수 없습니다.",
      });
    }

    const memberMap = new Map();
    const queueBusinessIds = [leaderBusinessId];
    const visitedParentBusinessIds = new Set();

    memberMap.set(String(leader._id), leader);

    while (queueBusinessIds.length) {
      const frontier = queueBusinessIds.splice(0, 100);
      const parentBusinessIds = frontier.filter(
        (id) => id && !visitedParentBusinessIds.has(id),
      );
      if (!parentBusinessIds.length) continue;

      parentBusinessIds.forEach((id) => visitedParentBusinessIds.add(id));
      const parentBusinessObjectIds = parentBusinessIds.map(
        (id) => new Types.ObjectId(id),
      );
      const children = await User.find({
        referredByBusinessId: { $in: parentBusinessObjectIds },
        role: { $in: ["requestor", "salesman"] },
      })
        .select({
          _id: 1,
          role: 1,
          requestorRole: 1,
          name: 1,
          email: 1,
          business: 1,
          businessId: 1,
          active: 1,
          createdAt: 1,
          approvedAt: 1,
          updatedAt: 1,
          referredByBusinessId: 1,
        })
        .lean();

      for (const child of children) {
        memberMap.set(String(child._id), child);
        const childBusinessId = String(child?.businessId || "");
        if (
          childBusinessId &&
          Types.ObjectId.isValid(childBusinessId) &&
          !visitedParentBusinessIds.has(childBusinessId)
        ) {
          queueBusinessIds.push(childBusinessId);
        }
      }
    }

    const members = Array.from(memberMap.values());

    const memberBusinessIds = Array.from(
      new Set(
        (members || [])
          .map((u) => String(u?.businessId || ""))
          .filter((id) => id && Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const range30 = getLast30DaysRangeUtc();
    const start = range30?.start;
    const end = range30?.end;

    const businessStatsRows =
      memberBusinessIds.length && start && end
        ? await Request.aggregate([
            {
              $match: {
                requestorBusinessId: { $in: memberBusinessIds },
                manufacturerStage: "추적관리",
                createdAt: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: "$requestorBusinessId",
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

    const businessStatsByBusinessId = new Map(
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
        businessStatsByBusinessId.get(String(u?.businessId || ""))
          ?.lastMonthOrders || 0,
      ),
      lastMonthPaidOrders: Number(
        businessStatsByBusinessId.get(String(u?.businessId || ""))
          ?.lastMonthPaidOrders || 0,
      ),
      lastMonthBonusOrders: Number(
        businessStatsByBusinessId.get(String(u?.businessId || ""))
          ?.lastMonthBonusOrders || 0,
      ),
      lastMonthPaidRevenue: Number(
        businessStatsByBusinessId.get(String(u?.businessId || ""))
          ?.lastMonthPaidRevenue || 0,
      ),
      lastMonthBonusRevenue: Number(
        businessStatsByBusinessId.get(String(u?.businessId || ""))
          ?.lastMonthBonusRevenue || 0,
      ),
      referredByBusinessId: u.referredByBusinessId || null,
      children: [],
    }));
    const nodeById = new Map(nodes.map((n) => [String(n._id), n]));
    const representativeByBusinessId = new Map();
    for (const node of nodes) {
      const businessId = String(node?.businessId || "");
      if (!businessId || !Types.ObjectId.isValid(businessId)) continue;
      if (
        businessId === leaderBusinessId &&
        String(node._id) === String(leader._id)
      ) {
        representativeByBusinessId.set(businessId, node);
        continue;
      }
      if (!representativeByBusinessId.has(businessId)) {
        representativeByBusinessId.set(businessId, node);
      }
    }
    for (const node of nodes) {
      const parentBusinessId = node.referredByBusinessId
        ? String(node.referredByBusinessId)
        : null;
      const parentNode = parentBusinessId
        ? representativeByBusinessId.get(parentBusinessId)
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
    if (String(rootNode.role || "") === "salesman") {
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
        } else if (String(child?.role || "") === "salesman") {
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

  const leaders = await User.find({
    $or: [{ role: "salesman" }, { role: "requestor", requestorRole: "owner" }],
    active: true,
  })
    .select({ _id: 1, role: 1, businessId: 1 })
    .lean();

  if (!leaders.length) {
    adminReferralCache.clear();
    return { success: true, upsertCount: 0, ymd, computedAt: new Date() };
  }

  const leaderBusinessIds = leaders
    .map((l) => String(l?.businessId || ""))
    .filter((id) => id && Types.ObjectId.isValid(id));
  const leaderBusinessObjectIds = leaderBusinessIds.map(
    (id) => new Types.ObjectId(id),
  );
  const directChildren = await User.find({
    referredByBusinessId: { $in: leaderBusinessObjectIds },
    role: { $in: ["requestor", "salesman"] },
    active: true,
  })
    .select({ _id: 1, referredByBusinessId: 1, businessId: 1, role: 1 })
    .lean();

  const childIdsByLeaderBusinessId = new Map();
  const childBusinessIdsByLeaderBusinessId = new Map();
  for (const u of directChildren) {
    const leaderBusinessId = String(u.referredByBusinessId || "");
    if (!leaderBusinessId) continue;
    const arr = childIdsByLeaderBusinessId.get(leaderBusinessId) || [];
    arr.push(u);
    childIdsByLeaderBusinessId.set(leaderBusinessId, arr);
    const childBusinessId = String(u?.businessId || "");
    if (childBusinessId && Types.ObjectId.isValid(childBusinessId)) {
      const businessSet =
        childBusinessIdsByLeaderBusinessId.get(leaderBusinessId) || new Set();
      businessSet.add(childBusinessId);
      childBusinessIdsByLeaderBusinessId.set(leaderBusinessId, businessSet);
    }
  }

  const relevantBusinessIds = Array.from(
    new Set(
      [...leaders, ...directChildren]
        .map((u) => String(u?.businessId || ""))
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  );
  const relevantBusinessObjectIds = relevantBusinessIds.map(
    (id) => new Types.ObjectId(id),
  );
  const requestRows = relevantBusinessObjectIds.length
    ? await Request.aggregate([
        {
          $match: {
            requestorBusinessId: { $in: relevantBusinessObjectIds },
            manufacturerStage: "추적관리",
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: "$requestorBusinessId", orderCount: { $sum: 1 } } },
      ])
    : [];
  const ordersByBusinessId = new Map(
    requestRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
  );

  let upsertCount = 0;
  const computedAt = new Date();
  for (const leader of leaders) {
    const leaderBusinessId = String(leader?.businessId || "");
    if (!leaderBusinessId || !Types.ObjectId.isValid(leaderBusinessId)) {
      continue;
    }
    const children = childIdsByLeaderBusinessId.get(leaderBusinessId) || [];
    const childBusinessIds = Array.from(
      childBusinessIdsByLeaderBusinessId.get(leaderBusinessId) || [],
    );
    const memberCount = 1 + children.length;
    const groupTotalOrders =
      Number(ordersByBusinessId.get(leaderBusinessId) || 0) +
      childBusinessIds.reduce(
        (acc, businessId) =>
          acc + Number(ordersByBusinessId.get(String(businessId)) || 0),
        0,
      );
    const snapshotBusinessId = new Types.ObjectId(leaderBusinessId);

    if (snapshotBusinessId) {
      await PricingReferralStatsSnapshot.findOneAndUpdate(
        { businessId: snapshotBusinessId, ymd },
        {
          $set: {
            businessId: snapshotBusinessId,
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
