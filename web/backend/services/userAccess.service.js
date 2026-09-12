// related files:
// - web/backend/models/userAccessDay.model.js
// - web/backend/services/platformGrowthStats.service.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/middlewares/auth.middleware.js
import UserAccessDay from "../models/userAccessDay.model.js";
import {
  getThisMonthStartYmdInKst,
  getTodayYmdInKst,
} from "../utils/krBusinessDays.js";
import { Types } from "mongoose";

/** In-process skip set: `${ymd}:${userId}` — avoids repeat upserts same process day */
const recordedToday = new Set();
let recordedYmd = "";

function cacheKey(ymd, userId) {
  return `${ymd}:${userId}`;
}

function touchProcessCache(ymd, userId) {
  if (recordedYmd !== ymd) {
    recordedToday.clear();
    recordedYmd = ymd;
  }
  recordedToday.add(cacheKey(ymd, userId));
}

function alreadyRecordedInProcess(ymd, userId) {
  if (recordedYmd !== ymd) return false;
  return recordedToday.has(cacheKey(ymd, userId));
}

/**
 * Upsert one access row per user per KST day. Safe to fire-and-forget.
 * @param {{ userId: unknown, role?: string }} params
 */
export async function recordUserAccessDay({ userId, role } = {}) {
  const id = String(userId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return null;

  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  if (alreadyRecordedInProcess(ymd, id)) return null;

  const now = new Date();
  const roleStr = String(role || "").trim();
  const oid = new Types.ObjectId(id);

  try {
    const doc = await UserAccessDay.findOneAndUpdate(
      { userId: oid, ymd },
      {
        $set: { lastAt: now, ...(roleStr ? { role: roleStr } : {}) },
        $setOnInsert: { firstAt: now, userId: oid, ymd },
      },
      { upsert: true, new: true },
    );
    touchProcessCache(ymd, id);
    return doc;
  } catch (error) {
    // Unique race: treat as success and warm cache
    if (error?.code === 11000) {
      touchProcessCache(ymd, id);
      return null;
    }
    console.error("[userAccess.recordUserAccessDay]", error?.message || error);
    return null;
  }
}

/** Fire-and-forget wrapper for middleware / login paths */
export function voidRecordUserAccessDay(params) {
  void recordUserAccessDay(params).catch(() => {});
}

/**
 * Distinct user count with access days in [fromYmd, toYmd] inclusive (KST ymd strings).
 */
export async function getAccessUniques({ fromYmd, toYmd } = {}) {
  const from = String(fromYmd || "").trim();
  const to = String(toYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return 0;
  }
  const filter =
    from === to
      ? { ymd: from }
      : { ymd: { $gte: from, $lte: to } };
  const ids = await UserAccessDay.distinct("userId", filter);
  return Array.isArray(ids) ? ids.length : 0;
}

export async function getTodayAccessUserCount(now = new Date()) {
  const ymd = getTodayYmdInKst(now);
  if (!ymd) return 0;
  return getAccessUniques({ fromYmd: ymd, toYmd: ymd });
}

export async function getMonthAccessUserCount(now = new Date()) {
  const today = getTodayYmdInKst(now);
  const monthStart = getThisMonthStartYmdInKst(now);
  if (!today || !monthStart) return 0;
  return getAccessUniques({ fromYmd: monthStart, toYmd: today });
}
