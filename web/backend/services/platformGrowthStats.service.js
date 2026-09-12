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
import {
  getMonthAccessUserCount,
  getTodayAccessUserCount,
} from "./userAccess.service.js";

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
