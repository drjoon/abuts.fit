import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import PricingReferralStatsSnapshot from "../../models/pricingReferralStatsSnapshot.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import ManufacturerDailySettlementSnapshot from "../../models/manufacturerDailySettlementSnapshot.model.js";
import {
  getLast30DaysRangeUtc,
  getTodayYmdInKst,
  getYesterdayYmdInKst,
  getTodayMidnightUtcInKst,
} from "../../utils/krBusinessDays.js";
import { recalcAdminSalesmanCreditsOverviewSnapshot } from "../admin/adminCredit.controller.js";

function kstYmdToUtcRange(ymd) {
  const dt = new Date(`${ymd}T00:00:00.000+09:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const start = new Date(dt.getTime() - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

async function runReferralSnapshotRecalc() {
  const ymd = getTodayYmdInKst();
  const range30 = getLast30DaysRangeUtc();
  if (!ymd || !range30) {
    return {
      success: false,
      message: "날짜 계산 실패",
    };
  }
  const { start: lastMonthStart, end: lastMonthEnd } = range30;

  const leaders = await User.find({
    $or: [{ role: "salesman" }, { role: "requestor", requestorRole: "owner" }],
    active: true,
  })
    .select({ _id: 1, role: 1, organizationId: 1 })
    .lean();

  if (!leaders.length) {
    return { success: true, upsertCount: 0, ymd, computedAt: new Date() };
  }

  const leaderIds = leaders.map((l) => l._id).filter(Boolean);

  const directChildren = await User.find({
    referredByUserId: { $in: leaderIds },
    role: { $in: ["requestor", "salesman"] },
    active: true,
  })
    .select({ _id: 1, referredByUserId: 1, organizationId: 1, role: 1 })
    .lean();

  const childIdsByLeaderId = new Map();
  for (const u of directChildren) {
    const lid = String(u.referredByUserId || "");
    if (!lid) continue;
    const arr = childIdsByLeaderId.get(lid) || [];
    arr.push(u);
    childIdsByLeaderId.set(lid, arr);
  }

  const relevantUserIds = [...leaderIds, ...directChildren.map((u) => u._id)].filter(
    Boolean,
  );

  const requestRows = relevantUserIds.length
    ? await Request.aggregate([
        {
          $match: {
            requestor: { $in: relevantUserIds },
            status: "완료",
            createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          },
        },
        { $group: { _id: "$requestor", orderCount: { $sum: 1 } } },
      ])
    : [];

  const ordersByUserId = new Map(
    requestRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
  );

  const requestorLeaderOrgIds = leaders
    .filter((l) => String(l.role) === "requestor" && l.organizationId)
    .map((l) => String(l.organizationId));
  const requestorLeaderOrgObjectIds = requestorLeaderOrgIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const orgOrderRows = requestorLeaderOrgObjectIds.length
    ? await Request.aggregate([
        {
          $match: {
            requestorOrganizationId: { $in: requestorLeaderOrgObjectIds },
            status: "완료",
            createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          },
        },
        {
          $group: { _id: "$requestorOrganizationId", orderCount: { $sum: 1 } },
        },
      ])
    : [];

  const ordersByOrgId = new Map(
    orgOrderRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
  );

  let upsertCount = 0;
  const computedAt = new Date();
  for (const leader of leaders) {
    const lid = String(leader._id);
    const children = childIdsByLeaderId.get(lid) || [];
    const memberCount = 1 + children.length;

    let groupTotalOrders = 0;
    if (String(leader.role) === "requestor") {
      const orgId = String(leader.organizationId || "");
      groupTotalOrders = orgId ? ordersByOrgId.get(orgId) || 0 : 0;
    } else {
      const leaderOrders = ordersByUserId.get(lid) || 0;
      const childOrders = children.reduce(
        (acc, c) => acc + (ordersByUserId.get(String(c._id)) || 0),
        0,
      );
      groupTotalOrders = leaderOrders + childOrders;
    }

    await PricingReferralStatsSnapshot.findOneAndUpdate(
      { groupLeaderId: leader._id, ymd },
      {
        $set: {
          ownerUserId: leader._id,
          groupLeaderId: leader._id,
          groupMemberCount: memberCount,
          groupTotalOrders,
          computedAt,
        },
      },
      { upsert: true, new: false },
    );
    upsertCount++;
  }

  return { success: true, upsertCount, ymd, computedAt };
}

async function runManufacturerDailySettlementSnapshotRecalc({ manufacturerOrganization }) {
  const baseYmd = getTodayYmdInKst();
  const snapshotYmd = getYesterdayYmdInKst();
  const baseMidnightUtc = getTodayMidnightUtcInKst();

  if (!baseYmd || !snapshotYmd || !baseMidnightUtc) {
    return { success: false, message: "날짜 계산 실패" };
  }

  const utcRange = kstYmdToUtcRange(snapshotYmd);
  if (!utcRange) {
    return { success: false, message: "날짜 범위 계산 실패" };
  }

  const { start, end } = utcRange;
  const agg = await ManufacturerCreditLedger.aggregate([
    {
      $match: {
        manufacturerOrganization,
        occurredAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: { type: "$type", refType: "$refType" },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const sums = {
    earnRequestAmount: 0,
    earnRequestCount: 0,
    earnShippingAmount: 0,
    earnShippingCount: 0,
    refundAmount: 0,
    payoutAmount: 0,
    adjustAmount: 0,
  };

  for (const row of agg) {
    const type = String(row?._id?.type || "");
    const refType = String(row?._id?.refType || "");
    const amount = Math.round(Number(row?.amount || 0));
    const count = Math.round(Number(row?.count || 0));

    if (type === "EARN" && refType === "REQUEST") {
      sums.earnRequestAmount += amount;
      sums.earnRequestCount += count;
    } else if (type === "EARN" && refType === "SHIPPING_PACKAGE") {
      sums.earnShippingAmount += amount;
      sums.earnShippingCount += count;
    } else if (type === "REFUND") {
      sums.refundAmount += amount;
    } else if (type === "PAYOUT") {
      sums.payoutAmount += amount;
    } else if (type === "ADJUST") {
      sums.adjustAmount += amount;
    }
  }

  const netAmount =
    Math.round(Number(sums.earnRequestAmount || 0)) +
    Math.round(Number(sums.earnShippingAmount || 0)) +
    Math.round(Number(sums.refundAmount || 0)) +
    Math.round(Number(sums.payoutAmount || 0)) +
    Math.round(Number(sums.adjustAmount || 0));

  const computedAt = new Date();
  await ManufacturerDailySettlementSnapshot.updateOne(
    { manufacturerOrganization, ymd: snapshotYmd },
    {
      $set: {
        ...sums,
        netAmount,
        computedAt,
      },
    },
    { upsert: true },
  );

  return {
    success: true,
    data: {
      baseYmd,
      baseMidnightUtc: baseMidnightUtc.toISOString(),
      snapshotYmd,
      computedAt: computedAt.toISOString(),
    },
  };
}

export async function recalcAllSnapshots(req, res) {
  try {
    const referral = await runReferralSnapshotRecalc();
    if (!referral.success) {
      return res.status(500).json({
        success: false,
        message: referral.message || "리퍼럴 스냅샷 재계산 실패",
      });
    }

    const user = req.user;
    if (user?.role === "manufacturer") {
      const manufacturerOrganization = String(user.organization || "").trim();
      if (!manufacturerOrganization) {
        return res.status(400).json({
          success: false,
          message: "조직 정보가 필요합니다.",
        });
      }

      const credit = await runManufacturerDailySettlementSnapshotRecalc({
        manufacturerOrganization,
      });
      if (!credit.success) {
        return res.status(500).json({
          success: false,
          message: credit.message || "정산 스냅샷 재계산 실패",
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          referral: {
            upsertCount: referral.upsertCount,
            ymd: referral.ymd,
            computedAt: referral.computedAt?.toISOString?.() || null,
          },
          credit: credit.data,
        },
      });
    }

    if (user?.role === "admin") {
      const credit = await recalcAdminSalesmanCreditsOverviewSnapshot({
        periodKey: "30d",
      });
      if (!credit?.computedAt) {
        return res.status(500).json({
          success: false,
          message: "영업자 크레딧 요약 스냅샷 재계산 실패",
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          referral: {
            upsertCount: referral.upsertCount,
            ymd: referral.ymd,
            computedAt: referral.computedAt?.toISOString?.() || null,
          },
          credit,
        },
      });
    }

    return res.status(403).json({
      success: false,
      message: "이 작업을 수행할 권한이 없습니다.",
    });
  } catch (error) {
    console.error("recalcAllSnapshots error:", error);
    return res.status(500).json({
      success: false,
      message: "스냅샷 재계산에 실패했습니다.",
    });
  }
}
