import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import PricingReferralStatsSnapshot from "../../models/pricingReferralStatsSnapshot.model.js";
import {
  getThisMonthStartYmdInKst,
  getLast30DaysRangeUtc,
} from "../requests/utils.js";
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";

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
        `referral-groups:v3${cacheKeySuffix}`,
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

    const leaderIds = leaders.map((l) => l._id).filter(Boolean);
    if (!leaderIds.length) {
      return res.status(200).json({ success: true, data: { groups: [] } });
    }

    const ymd = getThisMonthStartYmdInKst();
    const [directCounts, snapshots] = await Promise.all([
      User.aggregate([
        {
          $match: {
            referredByUserId: { $in: leaderIds },
            active: true,
            role: { $in: ["requestor", "salesman"] },
          },
        },
        { $group: { _id: "$referredByUserId", count: { $sum: 1 } } },
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
      referredByUserId: { $in: leaderIds },
      role: { $in: ["requestor", "salesman"] },
      active: true,
    })
      .select({ _id: 1, referredByUserId: 1, businessId: 1 })
      .lean();

    const childIds = directChildren.map((u) => u._id).filter(Boolean);
    const relevantUserIds = [...leaderIds, ...childIds];
    const requestRows = relevantUserIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestor: { $in: relevantUserIds },
              manufacturerStage: "추적관리",
              createdAt: { $gte: periodStart, $lte: periodEnd },
            },
          },
          {
            $group: {
              _id: "$requestor",
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

    const ordersByUserId = new Map(
      requestRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
    );
    const revenueByUserId = new Map(
      requestRows.map((r) => [String(r._id), Number(r.revenueAmount || 0)]),
    );
    const bonusByUserId = new Map(
      requestRows.map((r) => [String(r._id), Number(r.bonusAmount || 0)]),
    );
    const requestorBusinessSnapshotByBusinessId = new Map(
      snapshots
        .filter((row) => String(row?.businessId || ""))
        .map((row) => [String(row?.businessId || ""), row]),
    );

    const childIdsByLeaderId = new Map();
    for (const u of directChildren) {
      const lid = String(u?.referredByUserId || "");
      if (!lid) continue;
      const arr = childIdsByLeaderId.get(lid) || [];
      arr.push(String(u._id));
      childIdsByLeaderId.set(lid, arr);
    }

    const directCountByLeaderId = new Map();
    for (const r of directCounts) {
      directCountByLeaderId.set(String(r._id), Number(r.count || 0));
    }

    const groups = leaders.map((leader) => {
      const directCount = directCountByLeaderId.get(String(leader._id)) || 0;
      const leaderBusinessId = String(leader?.businessId || "");
      const snapshot =
        (String(leader?.role || "") === "requestor" && leaderBusinessId
          ? requestorBusinessSnapshotByBusinessId.get(leaderBusinessId)
          : null) ||
        snapshots.find((s) => String(s.leaderUserId) === String(leader._id));
      const snapshotGroupMemberCount = Number(snapshot?.groupMemberCount || 0);
      const role = String(leader?.role || "");
      const fallbackChildIds = childIdsByLeaderId.get(String(leader._id)) || [];

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
        const fallbackOrders = fallbackChildIds.reduce(
          (acc, cid) => acc + Number(ordersByUserId.get(String(cid)) || 0),
          0,
        );
        const fallbackLeaderOrders = Number(
          ordersByUserId.get(String(leader._id)) || 0,
        );
        groupTotalOrders = fallbackLeaderOrders + fallbackOrders;
        groupRevenueAmount =
          Number(revenueByUserId.get(String(leader._id)) || 0) +
          fallbackChildIds.reduce(
            (acc, cid) => acc + Number(revenueByUserId.get(String(cid)) || 0),
            0,
          );
        groupBonusAmount =
          Number(bonusByUserId.get(String(leader._id)) || 0) +
          fallbackChildIds.reduce(
            (acc, cid) => acc + Number(bonusByUserId.get(String(cid)) || 0),
            0,
          );
      }

      return {
        leader,
        memberCount: directCount + 1,
        groupMemberCount: snapshotGroupMemberCount || directCount + 1,
        groupTotalOrders,
        groupRevenueAmount,
        groupBonusAmount,
        snapshotComputedAt: snapshot?.computedAt || null,
      };
    });

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
        },
        groups,
      },
    };

    if (!refresh)
      setAdminReferralCache(`referral-groups:v3${cacheKeySuffix}`, payload);
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
    const cacheKey = `referral-group-tree:v3:${leaderId}`;
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
        name: 1,
        email: 1,
        business: 1,
        businessId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
        referredByUserId: 1,
        referralGroupLeaderId: 1,
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

    const members = await User.find({
      $or: [
        { _id: leader._id },
        { referralGroupLeaderId: leader._id },
        { referredByUserId: leader._id },
      ],
      role: { $in: ["requestor", "salesman"] },
    })
      .select({
        _id: 1,
        role: 1,
        name: 1,
        email: 1,
        business: 1,
        businessId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
        referredByUserId: 1,
        referralGroupLeaderId: 1,
      })
      .lean();

    const nodes = members.map((u) => ({
      ...u,
      referredByUserId: u.referredByUserId || null,
      children: [],
    }));
    const nodeById = new Map(nodes.map((n) => [String(n._id), n]));
    for (const node of nodes) {
      const parentId = node.referredByUserId
        ? String(node.referredByUserId)
        : null;
      if (!parentId || !nodeById.has(parentId)) continue;
      nodeById.get(parentId).children.push(node);
    }

    const payload = {
      success: true,
      data: {
        leader,
        memberCount: nodes.length,
        tree: nodeById.get(String(leader._id)) || { ...leader, children: [] },
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

  const leaderIds = leaders.map((l) => l._id).filter(Boolean);
  const directChildren = await User.find({
    referredByUserId: { $in: leaderIds },
    role: { $in: ["requestor", "salesman"] },
    active: true,
  })
    .select({ _id: 1, referredByUserId: 1, businessId: 1, role: 1 })
    .lean();

  const childIdsByLeaderId = new Map();
  for (const u of directChildren) {
    const lid = String(u.referredByUserId || "");
    if (!lid) continue;
    const arr = childIdsByLeaderId.get(lid) || [];
    arr.push(u);
    childIdsByLeaderId.set(lid, arr);
  }

  const relevantUserIds = [
    ...leaderIds,
    ...directChildren.map((u) => u._id),
  ].filter(Boolean);
  const requestRows = relevantUserIds.length
    ? await Request.aggregate([
        {
          $match: {
            requestor: { $in: relevantUserIds },
            manufacturerStage: "추적관리",
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: "$requestor", orderCount: { $sum: 1 } } },
      ])
    : [];
  const ordersByUserId = new Map(
    requestRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
  );

  const requestorLeaderBusinessObjectIds = leaders
    .filter((l) => String(l.role) === "requestor" && l.businessId)
    .map((l) => String(l.businessId))
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  const businessOrderRows = requestorLeaderBusinessObjectIds.length
    ? await Request.aggregate([
        {
          $match: {
            requestorBusinessId: { $in: requestorLeaderBusinessObjectIds },
            manufacturerStage: "추적관리",
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: "$requestorBusinessId", orderCount: { $sum: 1 } } },
      ])
    : [];
  const ordersByBusinessId = new Map(
    businessOrderRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
  );

  let upsertCount = 0;
  const computedAt = new Date();
  for (const leader of leaders) {
    const lid = String(leader._id);
    const children = childIdsByLeaderId.get(lid) || [];
    const memberCount = 1 + children.length;
    let groupTotalOrders = 0;
    let snapshotBusinessId = null;
    if (String(leader.role) === "requestor") {
      const businessId = String(leader.businessId || "");
      groupTotalOrders = businessId
        ? ordersByBusinessId.get(businessId) || 0
        : 0;
      snapshotBusinessId =
        businessId && Types.ObjectId.isValid(businessId)
          ? new Types.ObjectId(businessId)
          : null;
    } else {
      groupTotalOrders =
        (ordersByUserId.get(lid) || 0) +
        children.reduce(
          (acc, c) => acc + (ordersByUserId.get(String(c._id)) || 0),
          0,
        );
      snapshotBusinessId = new Types.ObjectId(String(leader._id));
    }

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
