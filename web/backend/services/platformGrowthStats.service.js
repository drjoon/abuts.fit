// related files:
// - web/backend/services/userAccess.service.js
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/modules/system/system.routes.js
import User from "../models/user.model.js";
import Request from "../models/request.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  getThisMonthStartYmdInKst,
  getTodayYmdInKst,
} from "../utils/krBusinessDays.js";
import { Types } from "mongoose";
import {
  getAccessUniques,
  getMonthAccessUserCount,
  getTodayAccessUserCount,
  listAccessUsers,
} from "./userAccess.service.js";
import { buildDashboardNormalizedStageExpr } from "./requestDashboardStats.service.js";

const GROWTH_DETAIL_METRICS = new Set([
  "todayAccess",
  "monthAccess",
  "totalUsers",
  "periodRequests",
  "periodRevenue",
]);

const DETAIL_LIMIT = 500;

async function hydrateUsersById(userIds) {
  const ids = (userIds || [])
    .map((id) => String(id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } })
    .select({ name: 1, email: 1, business: 1, role: 1, active: 1, createdAt: 1 })
    .lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

async function listAccessDetailItems({ fromYmd, toYmd }) {
  const accessRows = await listAccessUsers({
    fromYmd,
    toYmd,
    limit: DETAIL_LIMIT,
  });
  const userMap = await hydrateUsersById(accessRows.map((r) => r.userId));
  return accessRows.map((row) => {
    const user = userMap.get(String(row.userId));
    return {
      userId: row.userId,
      name: user?.name || "",
      email: user?.email || "",
      business: user?.business || "",
      role: user?.role || row.role || "",
      active: user?.active !== false,
      firstAt: row.firstAt,
      lastAt: row.lastAt,
      dayCount: row.dayCount,
    };
  });
}

function kstYmdToUtcRange(ymd) {
  const s = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const start = new Date(`${s}T00:00:00+09:00`);
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end: endExclusive };
}

function currentMonthUtcRange(now = new Date()) {
  const today = getTodayYmdInKst(now);
  const monthStart = getThisMonthStartYmdInKst(now);
  if (!today || !monthStart) return null;
  const fromR = kstYmdToUtcRange(monthStart);
  const toR = kstYmdToUtcRange(today);
  if (!fromR || !toR) return null;
  return { start: fromR.start, end: toR.end };
}

async function countRequestorBusinessesByKind() {
  const rows = await BusinessAnchor.aggregate([
    {
      $match: {
        businessType: "requestor",
        requestorKind: { $in: ["practice", "lab"] },
      },
    },
    { $group: { _id: "$requestorKind", count: { $sum: 1 } } },
  ]);
  let practiceBusinessCount = 0;
  let labBusinessCount = 0;
  for (const row of rows || []) {
    if (row?._id === "practice") practiceBusinessCount = Number(row.count || 0);
    if (row?._id === "lab") labBusinessCount = Number(row.count || 0);
  }
  return { practiceBusinessCount, labBusinessCount };
}

/**
 * Sales-safe social proof (no revenue).
 */
export async function getPlatformSocialProof(now = new Date()) {
  const monthRange = currentMonthUtcRange(now);
  const [
    { practiceBusinessCount, labBusinessCount },
    allTimeRequestCount,
    monthRequestCount,
  ] = await Promise.all([
    countRequestorBusinessesByKind(),
    Request.countDocuments({}),
    monthRange
      ? Request.countDocuments({
          createdAt: { $gte: monthRange.start, $lt: monthRange.end },
        })
      : Promise.resolve(0),
  ]);

  return {
    practiceBusinessCount,
    labBusinessCount,
    monthRequestCount: Number(monthRequestCount || 0),
    allTimeRequestCount: Number(allTimeRequestCount || 0),
  };
}

/**
 * Admin growth KPIs. Period request count uses optional start/end (dashboard filter).
 * Access metrics use KST calendar today / this month.
 * periodRevenue is optional (admin attaches from pricingSummary to avoid double query).
 */
export async function getPlatformGrowthStats({
  start,
  end,
  periodRevenue,
} = {}) {
  const now = new Date();
  const hasPeriod =
    start instanceof Date &&
    end instanceof Date &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime());

  const [
    todayAccessUsers,
    monthActiveUsers,
    totalUsers,
    social,
    periodRequestCount,
  ] = await Promise.all([
    getTodayAccessUserCount(now),
    getMonthAccessUserCount(now),
    User.countDocuments({}),
    getPlatformSocialProof(now),
    hasPeriod
      ? Request.countDocuments({
          createdAt: { $gte: start, $lte: end },
        })
      : Promise.resolve(0),
  ]);

  return {
    todayAccessUsers: Number(todayAccessUsers || 0),
    monthActiveUsers: Number(monthActiveUsers || 0),
    totalUsers: Number(totalUsers || 0),
    practiceBusinessCount: social.practiceBusinessCount,
    labBusinessCount: social.labBusinessCount,
    periodRequestCount: Number(periodRequestCount || 0),
    allTimeRequestCount: social.allTimeRequestCount,
    monthRequestCount: social.monthRequestCount,
    periodRevenue: Number(periodRevenue || 0),
  };
}

/**
 * Drill-down rows for admin growth KPI cards.
 * @param {{ metric: string, start?: Date, end?: Date }} params
 */
export async function getPlatformGrowthDetail({ metric, start, end } = {}) {
  const key = String(metric || "").trim();
  if (!GROWTH_DETAIL_METRICS.has(key)) {
    const err = new Error("지원하지 않는 metric입니다.");
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const hasPeriod =
    start instanceof Date &&
    end instanceof Date &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime());

  if (key === "todayAccess") {
    const ymd = getTodayYmdInKst(now);
    const [items, total] = ymd
      ? await Promise.all([
          listAccessDetailItems({ fromYmd: ymd, toYmd: ymd }),
          getAccessUniques({ fromYmd: ymd, toYmd: ymd }),
        ])
      : [[], 0];
    return {
      metric: key,
      range: { fromYmd: ymd, toYmd: ymd },
      total: Number(total || 0),
      items,
    };
  }

  if (key === "monthAccess") {
    const today = getTodayYmdInKst(now);
    const monthStart = getThisMonthStartYmdInKst(now);
    const [items, total] =
      today && monthStart
        ? await Promise.all([
            listAccessDetailItems({ fromYmd: monthStart, toYmd: today }),
            getAccessUniques({ fromYmd: monthStart, toYmd: today }),
          ])
        : [[], 0];
    return {
      metric: key,
      range: { fromYmd: monthStart, toYmd: today },
      total: Number(total || 0),
      items,
    };
  }

  if (key === "totalUsers") {
    const [users, total] = await Promise.all([
      User.find({})
        .select({
          name: 1,
          email: 1,
          business: 1,
          role: 1,
          active: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .limit(DETAIL_LIMIT)
        .lean(),
      User.countDocuments({}),
    ]);
    return {
      metric: key,
      range: null,
      total: Number(total || 0),
      items: (users || []).map((u) => ({
        userId: String(u._id),
        name: u.name || "",
        email: u.email || "",
        business: u.business || "",
        role: u.role || "",
        active: u.active !== false,
        createdAt: u.createdAt || null,
      })),
    };
  }

  if (key === "periodRequests") {
    if (!hasPeriod) {
      const err = new Error("기간(start/end)이 필요합니다.");
      err.statusCode = 400;
      throw err;
    }
    const match = { createdAt: { $gte: start, $lte: end } };
    const [rows, total] = await Promise.all([
      Request.find(match)
        .select({
          requestId: 1,
          title: 1,
          status: 1,
          shippingMode: 1,
          createdAt: 1,
          requestor: 1,
          price: 1,
        })
        .populate("requestor", "name email business role")
        .sort({ createdAt: -1 })
        .limit(DETAIL_LIMIT)
        .lean(),
      Request.countDocuments(match),
    ]);
    return {
      metric: key,
      range: { startDate: start, endDate: end },
      total: Number(total || 0),
      items: (rows || []).map((r) => {
        const reqUser = r.requestor && typeof r.requestor === "object"
          ? r.requestor
          : null;
        return {
          requestMongoId: String(r._id),
          requestId: r.requestId || "",
          title: r.title || "",
          status: r.status || "",
          shippingMode: r.shippingMode || "",
          createdAt: r.createdAt || null,
          paidAmount: Number(
            r?.price?.paidAmount ?? r?.price?.amount ?? 0,
          ),
          requestor: reqUser
            ? {
                _id: String(reqUser._id || ""),
                name: reqUser.name || "",
                email: reqUser.email || "",
                business: reqUser.business || "",
                role: reqUser.role || "",
              }
            : null,
        };
      }),
    };
  }

  // periodRevenue — 카드의 pricingSummary.totalRevenue와 동일 기준
  // (추적관리 단계 · paidAmount · 샘플 제외)
  if (!hasPeriod) {
    const err = new Error("기간(start/end)이 필요합니다.");
    err.statusCode = 400;
    throw err;
  }
  const preMatch = {
    createdAt: { $gte: start, $lte: end },
    source: { $ne: "manufacturer_sample" },
  };
  const [aggRows, totals] = await Promise.all([
    Request.aggregate([
      { $match: preMatch },
      {
        $addFields: {
          normalizedStage: buildDashboardNormalizedStageExpr(),
        },
      },
      { $match: { normalizedStage: "tracking" } },
      {
        $group: {
          _id: "$requestor",
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$price.paidAmount", 0] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: DETAIL_LIMIT },
    ]),
    Request.aggregate([
      { $match: preMatch },
      {
        $addFields: {
          normalizedStage: buildDashboardNormalizedStageExpr(),
        },
      },
      { $match: { normalizedStage: "tracking" } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$price.paidAmount", 0] } },
        },
      },
    ]),
  ]);
  const userMap = await hydrateUsersById(aggRows.map((r) => r._id));
  const totalOrders = Number(totals?.[0]?.orders || 0);
  const totalRevenue = Number(totals?.[0]?.revenue || 0);
  return {
    metric: key,
    range: { startDate: start, endDate: end },
    total: totalOrders,
    totalRevenue,
    items: (aggRows || []).map((r) => {
      const user = userMap.get(String(r._id));
      const orders = Number(r.orders || 0);
      const revenue = Number(r.revenue || 0);
      return {
        userId: String(r._id || ""),
        name: user?.name || "",
        email: user?.email || "",
        business: user?.business || "",
        role: user?.role || "",
        orders,
        revenue,
        avgUnitPrice: orders ? Math.round(revenue / orders) : 0,
      };
    }),
  };
}
