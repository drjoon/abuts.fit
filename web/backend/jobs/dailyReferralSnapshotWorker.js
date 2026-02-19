/**
 * 매일 KST 00:00에 실행되는 리퍼럴 그룹 스냅샷 재계산 워커.
 *
 * 오늘 자정(KST 00:00) 기준 직전 30일 완료 의뢰를 집계하여
 * 각 그룹 리더의 groupTotalOrders / groupMemberCount 를
 * PricingReferralStatsSnapshot에 upsert한다.
 * 이 스냅샷이 당일 의뢰 단가 계산의 기준이 된다.
 *
 * 누락 방지: 매 1분마다 KST 자정 여부를 확인하고,
 * 오늘 ymd로 스냅샷이 없으면(누락) 즉시 재계산한다.
 */

import "../bootstrap/env.js";
import mongoose, { Types } from "mongoose";
import User from "../models/user.model.js";
import Request from "../models/request.model.js";
import PricingReferralStatsSnapshot from "../models/pricingReferralStatsSnapshot.model.js";
import {
  getTodayYmdInKst,
  getTodayMidnightUtcInKst,
  getLast30DaysRangeUtc,
} from "../utils/krBusinessDays.js";

/**
 * 현재 KST 시각이 자정(00:00 ~ 00:01) 사이인지 확인한다.
 */
function isMidnightKst() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kstNow.getUTCHours() === 0 && kstNow.getUTCMinutes() === 0;
}

/**
 * 오늘 ymd 기준 스냅샷이 이미 존재하는지 확인한다.
 * 리더가 1명 이상 있고 스냅샷이 하나도 없으면 누락으로 판단.
 */
async function isTodaySnapshotMissing(ymd) {
  const count = await PricingReferralStatsSnapshot.countDocuments({ ymd });
  return count === 0;
}

async function runDailySnapshot(ymd, range) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[dailyReferralSnapshot] MONGODB_URI is not set");
    return;
  }

  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    await mongoose.connect(mongoUri);
  }

  console.log(
    `[${new Date().toISOString()}] Daily referral snapshot started for ymd=${ymd}`,
  );

  const { start: rangeStart, end: rangeEnd } = range;

  // 모든 그룹 리더(영업자 + 의뢰자 owner) 조회
  const leaders = await User.find({
    $or: [{ role: "salesman" }, { role: "requestor", requestorRole: "owner" }],
    active: true,
  })
    .select({ _id: 1, role: 1, organizationId: 1 })
    .lean();

  if (!leaders.length) {
    console.log("[dailyReferralSnapshot] No leaders found, skipping.");
    return;
  }

  const leaderIds = leaders.map((l) => l._id).filter(Boolean);

  // 직계 자식 조회 (그룹 멤버 수 계산용)
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

  // 최근 30일 완료 의뢰 집계 (requestor 기준)
  const relevantUserIds = [
    ...leaderIds,
    ...directChildren.map((u) => u._id),
  ].filter(Boolean);

  const requestRows = relevantUserIds.length
    ? await Request.aggregate([
        {
          $match: {
            requestor: { $in: relevantUserIds },
            status: "완료",
            createdAt: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        { $group: { _id: "$requestor", orderCount: { $sum: 1 } } },
      ])
    : [];

  const ordersByUserId = new Map(
    requestRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
  );

  // 의뢰자 조직 기준 집계 (requestor leader용)
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
            createdAt: { $gte: rangeStart, $lte: rangeEnd },
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
          computedAt: new Date(),
        },
      },
      { upsert: true, new: false },
    );
    upsertCount++;
  }

  console.log(
    `[${new Date().toISOString()}] Daily referral snapshot completed. Upserted ${upsertCount} snapshots for ymd=${ymd}.`,
  );
}

// 1분마다 KST 자정 여부 확인 후 실행 (중복 실행 방지: ymd 기준)
const INTERVAL_MS = 60 * 1000;
let lastRunYmd = null;

async function loop() {
  try {
    const ymd = getTodayYmdInKst();
    const range = getLast30DaysRangeUtc();

    if (!ymd || !range) {
      setTimeout(loop, INTERVAL_MS);
      return;
    }

    // 자정 타이밍에 실행 (중복 방지)
    if (isMidnightKst() && lastRunYmd !== ymd) {
      lastRunYmd = ymd;
      await runDailySnapshot(ymd, range);
    } else if (lastRunYmd !== ymd) {
      // 자정이 아니더라도 오늘 스냅샷이 누락된 경우 재계산 (워커 장애 복구)
      const missing = await isTodaySnapshotMissing(ymd);
      if (missing) {
        console.log(
          `[dailyReferralSnapshot] Snapshot missing for ymd=${ymd}, running fallback.`,
        );
        lastRunYmd = ymd;
        await runDailySnapshot(ymd, range);
      }
    }
  } catch (err) {
    console.error("[dailyReferralSnapshot] Error:", err);
  }
  setTimeout(loop, INTERVAL_MS);
}

if (process.env.DAILY_REFERRAL_SNAPSHOT_WORKER_ENABLED !== "false") {
  loop().catch((err) => {
    console.error("[dailyReferralSnapshot] Init failed:", err);
    process.exit(1);
  });
} else {
  console.log("[dailyReferralSnapshot] Worker is disabled");
}
