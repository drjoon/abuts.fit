import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import ActivityLog from "../../models/activityLog.model.js";

import {
  getReferralGroups,
  getReferralGroupTree,
  triggerReferralSnapshotRecalc,
  recalcReferralSnapshot,
  getReferralSnapshotStatus,
} from "./admin.referral.controller.js";
import {
  getDateRangeFromQuery,
  getMongoHealth,
} from "./admin.shared.controller.js";
import { getAdminPricingStatsSummary } from "../../services/requestDashboardStats.service.js";

export {
  getReferralGroups,
  getReferralGroupTree,
  triggerReferralSnapshotRecalc,
  recalcReferralSnapshot,
  getReferralSnapshotStatus,
};

export async function getPricingStats(req, res) {
  try {
    const { start, end } = getDateRangeFromQuery(req);
    const summary = await getAdminPricingStatsSummary({ start, end });

    return res.status(200).json({
      success: true,
      data: {
        range: { startDate: start, endDate: end },
        ...summary,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "가격 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getPricingStatsByUser(req, res) {
  try {
    const { start, end } = getDateRangeFromQuery(req);
    const match = {
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "취소" },
      // R&D 샘플 의뢰는 통계에서 제외
      source: { $ne: "manufacturer_sample" },
    };
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

    const resolveRequestPriceAmountExpr = {
      $ifNull: ["$price.paidAmount", { $ifNull: ["$price.amount", 0] }],
    };

    const rows = await Request.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$requestor",
          orders: { $sum: 1 },
          revenue: { $sum: resolveRequestPriceAmountExpr },
          baseAmount: { $sum: { $ifNull: ["$price.baseAmount", 0] } },
          discountAmount: { $sum: { $ifNull: ["$price.discountAmount", 0] } },
        },
      },
      { $sort: { orders: -1 } },
      { $limit: limit },
    ]);

    const referralRows = await Request.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "requestor",
          foreignField: "_id",
          as: "requestorUser",
        },
      },
      { $unwind: "$requestorUser" },
      {
        $group: {
          _id: "$requestorUser.referredByAnchorId",
          referralOrders: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
    ]);
    const referralMap = new Map(
      referralRows.map((r) => [String(r._id), Number(r.referralOrders || 0)]),
    );

    const userIds = rows
      .map((r) => r._id)
      .filter((id) => Types.ObjectId.isValid(id));
    const users = await User.find({ _id: { $in: userIds } })
      .select({ name: 1, email: 1, business: 1, role: 1, createdAt: 1 })
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const items = rows.map((r) => {
      const user = userMap.get(String(r._id));
      const orders = Number(r.orders || 0);
      const revenue = Number(r.revenue || 0);
      const discountAmount = Number(r.discountAmount || 0);
      const referralLast30DaysOrders = referralMap.get(String(r._id)) || 0;
      return {
        user: user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              business: user.business,
              role: user.role,
              createdAt: user.createdAt,
            }
          : { _id: r._id },
        orders,
        referralLast30DaysOrders,
        totalOrders: orders + referralLast30DaysOrders,
        revenue,
        baseAmount: Number(r.baseAmount || 0),
        discountAmount,
        avgUnitPrice: orders ? Math.round(revenue / orders) : 0,
        avgDiscountPerOrder: orders ? Math.round(discountAmount / orders) : 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        range: { startDate: start, endDate: end },
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사용자별 가격 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getSecurityStats(req, res) {
  try {
    const now = new Date();
    // KST 기준 30일 전
    const { toKstYmd } = await import("../requests/utils.js");
    const todayYmd = toKstYmd(now);
    const todayKst = new Date(`${todayYmd}T00:00:00+09:00`);
    todayKst.setDate(todayKst.getDate() - 30);
    const last30 = todayKst;

    const [
      alertsDetected,
      blockedAttempts,
      severityCounts,
      statusCounts,
      totalEvents,
    ] = await Promise.all([
      ActivityLog.countDocuments({
        createdAt: { $gte: last30, $lte: now },
        severity: { $in: ["high", "critical"] },
      }),
      ActivityLog.countDocuments({
        status: "blocked",
        createdAt: { $gte: last30, $lte: now },
      }),
      ActivityLog.aggregate([
        { $match: { createdAt: { $gte: last30, $lte: now } } },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ]),
      ActivityLog.aggregate([
        { $match: { createdAt: { $gte: last30, $lte: now } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ActivityLog.countDocuments({ createdAt: { $gte: last30, $lte: now } }),
    ]);

    const severityMap = severityCounts.reduce((acc, cur) => {
      acc[cur._id || "unknown"] = cur.count;
      return acc;
    }, {});
    const statusMap = statusCounts.reduce((acc, cur) => {
      acc[cur._id || "unknown"] = cur.count;
      return acc;
    }, {});

    const incidentPenalty =
      Number(severityMap.high || 0) * 3 + Number(severityMap.critical || 0) * 5;
    const blockedPenalty = Number(blockedAttempts || 0);
    const securityScore = Math.max(50, 100 - incidentPenalty - blockedPenalty);
    const mongoHealth = await getMongoHealth();

    return res.status(200).json({
      success: true,
      data: {
        securityScore,
        monitoring: "24/7",
        alertsDetected,
        blockedAttempts,
        severity: severityMap,
        status: statusMap,
        totalEvents,
        systemStatus: [
          {
            name: "데이터베이스",
            status: mongoHealth.status,
            message: mongoHealth.message,
          },
        ],
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보안 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  getPricingStats,
  getPricingStatsByUser,
  getReferralGroups,
  getReferralGroupTree,
  triggerReferralSnapshotRecalc,
  recalcReferralSnapshot,
  getReferralSnapshotStatus,
  getSecurityStats,
};
