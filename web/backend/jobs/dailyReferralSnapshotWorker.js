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
import Request from "../models/request.model.js";
import DeliveryInfo from "../models/deliveryInfo.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "../services/bulkShippingSnapshot.service.js";
import { recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId } from "../services/requestorDashboardSummarySnapshot.service.js";
import { recomputePricingReferralSnapshotForLeaderAnchorId } from "../services/pricingReferralSnapshot.service.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "../services/pricingReferralOrderBucket.service.js";
import { runPricingSsotConsistencyCheck } from "../services/pricingSsotHealth.service.js";
import {
  getTodayYmdInKst,
  getYesterdayYmdInKst,
  getTodayMidnightUtcInKst,
} from "../utils/krBusinessDays.js";
import { resolveMongoUri } from "../utils/mongoUri.js";

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
  const kstTime = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [hour, minute] = kstTime.split(":").map(Number);
  return hour === 0 && minute === 0;
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
  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error("[dailyReferralSnapshot] Mongo URI is not set");
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
      { role: "requestor", subRole: "owner" },
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

  // 가격/리퍼럴 SSOT 일치성 점검 (관리자 대시보드 노출용 스냅샷 생성)
  // 주의: 이 점검은 Request 원본 집계와 rolling snapshot의 일치성을 확인한다.
  // mismatch > 0이면 데이터 누락/집계 경로 이탈 신호이므로 운영 경고 대상으로 본다.
  try {
    const ssotResult = await runPricingSsotConsistencyCheck({
      write: true,
    });
    if (!ssotResult.success) {
      console.warn("[pricingSsotHealth] mismatch detected", {
        mismatchCount: ssotResult.mismatchCount,
        range: ssotResult.range,
      });
    } else {
      console.log("[pricingSsotHealth] check passed", {
        checkedSnapshotCount: ssotResult.checkedSnapshotCount,
        range: ssotResult.range,
      });
    }
  } catch (e) {
    console.error("[pricingSsotHealth] failed:", e);
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
        } else if (type === "REFUND") {
          cur.refundAmount += amount;
        } else if (type === "PAYOUT") {
          cur.payoutAmount += amount;
        } else if (type === "ADJUST") {
          cur.adjustAmount += amount;
        }
        byOrg.set(org, cur);
      }

      // 배송비는 집하일(pickedUpAt) 기준으로 재집계한다.
      // (배송완료일 우선/ledger occurredAt 기준 집계와의 불일치 방지)
      const shippingAgg = await Request.aggregate([
        {
          $match: {
            manufacturerStage: { $ne: "취소" },
            shippingPackageId: { $exists: true, $ne: null },
            caManufacturer: { $exists: true, $ne: null },
          },
        },
        {
          $lookup: {
            from: DeliveryInfo.collection.name,
            localField: "deliveryInfoRef",
            foreignField: "_id",
            as: "deliveryDoc",
          },
        },
        {
          $unwind: {
            path: "$deliveryDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: ShippingPackage.collection.name,
            localField: "shippingPackageId",
            foreignField: "_id",
            as: "packageDoc",
          },
        },
        {
          $unwind: {
            path: "$packageDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            settlementYmd: {
              $switch: {
                branches: [
                  {
                    case: {
                      $ne: [{ $ifNull: ["$deliveryDoc.pickedUpAt", null] }, null],
                    },
                    then: {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$deliveryDoc.pickedUpAt",
                        timezone: "Asia/Seoul",
                      },
                    },
                  },
                  {
                    case: {
                      $ne: [{ $ifNull: ["$deliveryDoc.deliveredAt", null] }, null],
                    },
                    then: {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$deliveryDoc.deliveredAt",
                        timezone: "Asia/Seoul",
                      },
                    },
                  },
                  {
                    case: {
                      $ne: [{ $ifNull: ["$deliveryDoc.shippedAt", null] }, null],
                    },
                    then: {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$deliveryDoc.shippedAt",
                        timezone: "Asia/Seoul",
                      },
                    },
                  },
                  {
                    case: {
                      $regexMatch: {
                        input: { $ifNull: ["$packageDoc.shipDateYmd", ""] },
                        regex: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
                      },
                    },
                    then: "$packageDoc.shipDateYmd",
                  },
                ],
                default: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                    timezone: "Asia/Seoul",
                  },
                },
              },
            },
          },
        },
        { $match: { settlementYmd: yesterdayYmd } },
        {
          $group: {
            _id: {
              shippingPackageId: "$shippingPackageId",
              caManufacturer: "$caManufacturer",
            },
          },
        },
        {
          $lookup: {
            from: User.collection.name,
            localField: "_id.caManufacturer",
            foreignField: "_id",
            as: "manufacturerUser",
          },
        },
        {
          $unwind: {
            path: "$manufacturerUser",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            manufacturerOrganization: {
              $trim: {
                input: {
                  $ifNull: [
                    "$manufacturerUser.business",
                    { $ifNull: ["$manufacturerUser.name", ""] },
                  ],
                },
              },
            },
          },
        },
        {
          $match: {
            manufacturerOrganization: { $ne: "" },
          },
        },
        {
          $lookup: {
            from: CreditLedger.collection.name,
            let: { shippingPackageId: "$_id.shippingPackageId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$refId", "$$shippingPackageId"] },
                      { $eq: ["$type", "SPEND"] },
                      { $in: ["$refType", ["SHIPPING_PACKAGE", "SHIPPING_FEE"]] },
                    ],
                  },
                },
              },
              { $sort: { createdAt: -1, _id: -1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 0,
                  amount: 1,
                  spentPaidAmount: 1,
                },
              },
            ],
            as: "shippingSpend",
          },
        },
        {
          $unwind: {
            path: "$shippingSpend",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$manufacturerOrganization",
            earnShippingCount: { $sum: 1 },
            earnShippingAmount: {
              $sum: {
                $cond: [
                  { $gt: ["$shippingSpend.spentPaidAmount", 0] },
                  { $abs: { $ifNull: ["$shippingSpend.amount", 0] } },
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            manufacturerOrganization: "$_id",
            earnShippingCount: 1,
            earnShippingAmount: 1,
          },
        },
      ]);

      for (const row of shippingAgg || []) {
        const org = String(row?.manufacturerOrganization || "").trim();
        if (!org) continue;
        const cur = byOrg.get(org) || {
          earnRequestAmount: 0,
          earnRequestCount: 0,
          earnShippingAmount: 0,
          earnShippingCount: 0,
          refundAmount: 0,
          payoutAmount: 0,
          adjustAmount: 0,
        };
        cur.earnShippingCount = Number(row?.earnShippingCount || 0);
        cur.earnShippingAmount = Number(row?.earnShippingAmount || 0);
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
