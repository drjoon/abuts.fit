/**
 * 매일 KST 00:00에 실행되는 리퍼럴 그룹 스냅샷 재계산 워커.
 *
 * 오늘 자정(KST 00:00) 기준 직전 30일 주문 집계를 재조정하여
 * 각 그룹 리더의 rolling 30일 리퍼럴 집계를
 * PricingReferralRolling30dAggregate에 반영한다.
 * 이 스냅샷이 당일 의뢰 단가 계산의 기준이 된다.
 *
 * 누락 방지: 매 1분마다 KST 자정 여부를 확인하고,
 * 오늘 ymd로 스냅샷이 없으면(누락) 즉시 재계산한다.
 */

import "../bootstrap/env.js";
import mongoose, { Types } from "mongoose";
import User from "../models/user.model.js";
import PricingReferralRolling30dAggregate from "../models/pricingReferralRolling30dAggregate.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";
import PricingReferralDailyOrderBucket from "../models/pricingReferralDailyOrderBucket.model.js";
import ManufacturerCreditLedger from "../models/manufacturerCreditLedger.model.js";
import ManufacturerDailySettlementSnapshot from "../models/manufacturerDailySettlementSnapshot.model.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "../services/bulkShippingSnapshot.service.js";
import { recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId } from "../services/requestorDashboardSummarySnapshot.service.js";
import { recomputePricingReferralSnapshotForLeaderAnchorId } from "../services/pricingReferralSnapshot.service.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "../services/pricingReferralOrderBucket.service.js";
import {
  getTodayYmdInKst,
  getYesterdayYmdInKst,
  getTodayMidnightUtcInKst,
} from "../utils/krBusinessDays.js";

function kstYmdToUtcRange(ymd) {
  const dt = new Date(`${ymd}T00:00:00.000+09:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const start = new Date(dt.getTime() - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

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
  const count = await PricingReferralRolling30dAggregate.countDocuments({
    ymd,
  });
  return count === 0;
}

async function runDailySnapshot(ymd) {
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

  const leaders = await User.find({
    $or: [
      { role: "salesman" },
      { role: "devops" },
      { role: "requestor", requestorRole: "owner" },
    ],
    active: true,
    businessAnchorId: { $ne: null },
  })
    .select({ _id: 1, role: 1, businessAnchorId: 1 })
    .lean();

  if (!leaders.length) {
    console.log("[dailyReferralSnapshot] No leaders found, skipping.");
    return;
  }

  const leaderAnchorIds = Array.from(
    new Set(
      leaders
        .map((leader) => String(leader?.businessAnchorId || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

  const packageAnchorIds = (await ShippingPackage.distinct("businessAnchorId"))
    .map((value) => String(value || "").trim())
    .filter((id) => Types.ObjectId.isValid(id));
  const bucketAnchorIds = (
    await PricingReferralDailyOrderBucket.distinct("businessAnchorId")
  )
    .map((value) => String(value || "").trim())
    .filter((id) => Types.ObjectId.isValid(id));

  const orderAnchorIds = Array.from(
    new Set(
      [...packageAnchorIds, ...bucketAnchorIds].filter((id) =>
        Types.ObjectId.isValid(id),
      ),
    ),
  );

  for (const businessAnchorId of orderAnchorIds) {
    await recomputePricingReferralDailyOrderBucketsForBusinessAnchorId(
      businessAnchorId,
    );
  }

  let upsertCount = 0;
  for (const leaderAnchorId of leaderAnchorIds) {
    const result =
      await recomputePricingReferralSnapshotForLeaderAnchorId(leaderAnchorId);
    if (result) upsertCount++;
  }

  console.log(
    `[${new Date().toISOString()}] Daily referral snapshot completed. Upserted ${upsertCount} snapshots for ymd=${ymd}.`,
  );

  try {
    const requestorAnchors = await User.find({
      role: "requestor",
      active: true,
      businessAnchorId: { $ne: null },
    })
      .select({ businessAnchorId: 1 })
      .lean();

    const requestorBusinessAnchorIds = Array.from(
      new Set(
        (requestorAnchors || [])
          .map((row) => String(row?.businessAnchorId || "").trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );

    for (const businessAnchorId of requestorBusinessAnchorIds) {
      await recomputeBulkShippingSnapshotForBusinessAnchorId(businessAnchorId);
      await recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId(
        businessAnchorId,
      );
    }

    console.log(
      `[${new Date().toISOString()}] Requestor dashboard snapshots warmed up for ${requestorBusinessAnchorIds.length} business anchors.`,
    );
  } catch (e) {
    console.error("[requestorDashboardSnapshotWarmup] failed:", e);
  }

  // 제조사 일별 정산 스냅샷 (전일분)
  try {
    const yesterdayYmd = getYesterdayYmdInKst();
    const utcRange = kstYmdToUtcRange(yesterdayYmd);
    if (utcRange) {
      const { start, end } = utcRange;
      const agg = await ManufacturerCreditLedger.aggregate([
        {
          $match: {
            occurredAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: {
              manufacturerOrganization: "$manufacturerOrganization",
              type: "$type",
              refType: "$refType",
            },
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      const byOrg = new Map();
      for (const row of agg) {
        const org = String(row?._id?.manufacturerOrganization || "").trim();
        if (!org) continue;
        const type = String(row?._id?.type || "");
        const refType = String(row?._id?.refType || "");
        const amount = Math.round(Number(row?.amount || 0));
        const count = Math.round(Number(row?.count || 0));
        const cur = byOrg.get(org) || {
          earnRequestAmount: 0,
          earnRequestCount: 0,
          earnShippingAmount: 0,
          earnShippingCount: 0,
          refundAmount: 0,
          payoutAmount: 0,
          adjustAmount: 0,
        };

        if (type === "EARN" && refType === "REQUEST") {
          cur.earnRequestAmount += amount;
          cur.earnRequestCount += count;
        } else if (type === "EARN" && refType === "SHIPPING_PACKAGE") {
          cur.earnShippingAmount += amount;
          cur.earnShippingCount += count;
        } else if (type === "REFUND") {
          cur.refundAmount += amount;
        } else if (type === "PAYOUT") {
          cur.payoutAmount += amount;
        } else if (type === "ADJUST") {
          cur.adjustAmount += amount;
        }
        byOrg.set(org, cur);
      }

      for (const [manufacturerOrganization, sums] of byOrg.entries()) {
        const netAmount =
          Math.round(Number(sums.earnRequestAmount || 0)) +
          Math.round(Number(sums.earnShippingAmount || 0)) +
          Math.round(Number(sums.refundAmount || 0)) +
          Math.round(Number(sums.payoutAmount || 0)) +
          Math.round(Number(sums.adjustAmount || 0));

        await ManufacturerDailySettlementSnapshot.updateOne(
          { manufacturerOrganization, ymd: yesterdayYmd },
          {
            $set: {
              ...sums,
              netAmount,
              computedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }
    }
  } catch (e) {
    console.error("[manufacturerDailySnapshot] failed:", e);
  }
}

// 1분마다 KST 자정 여부 확인 후 실행 (중복 실행 방지: ymd 기준)
const INTERVAL_MS = 60 * 1000;
let lastRunYmd = null;

async function loop() {
  try {
    const ymd = getTodayYmdInKst();

    if (!ymd) {
      setTimeout(loop, INTERVAL_MS);
      return;
    }

    // 자정 타이밍에 실행 (중복 방지)
    if (isMidnightKst() && lastRunYmd !== ymd) {
      lastRunYmd = ymd;
      await runDailySnapshot(ymd);
    } else if (lastRunYmd !== ymd) {
      // 자정이 아니더라도 오늘 스냅샷이 누락된 경우 재계산 (워커 장애 복구)
      const missing = await isTodaySnapshotMissing(ymd);
      if (missing) {
        console.log(
          `[dailyReferralSnapshot] Snapshot missing for ymd=${ymd}, running fallback.`,
        );
        lastRunYmd = ymd;
        await runDailySnapshot(ymd);
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
