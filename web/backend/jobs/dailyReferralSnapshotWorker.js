// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/distributedJobLock.js
// - web/backend/models/jobLock.model.js
/**
 * KST 일자당 1회 실행되는 리퍼럴 그룹 스냅샷 재계산 워커.
 *
 * 오늘(KST) 기준 직전 30일 주문 집계를 재조정하여
 * 각 그룹 리더의 rolling 30일 리퍼럴 집계를
 * PricingReferralRolling30dAggregate에 반영한다.
 * 이 스냅샷이 당일 의뢰 단가 계산의 기준이 된다.
 *
 * 스케줄:
 * - server.js에서 기동 (EB web 프로세스 포함)
 * - KST 날짜가 바뀌면(또는 당일 완료 마커가 없으면) 즉시 1회 실행
 * - 이벤트 기반 스냅샷이 있어도 일일 배치(정산/warmup 포함)는 건너뛰지 않음
 * - 멀티 인스턴스는 Mongo JobLock으로 중복 실행 방지
 *
 * 가격 SSOT 자동 점검은 수행하지 않는다(수동/CI 스크립트만 유지).
 */

import "../bootstrap/env.js";
import path from "path";
import { fileURLToPath } from "url";
import mongoose, { Types } from "mongoose";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import JobLock from "../models/jobLock.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";
import PricingReferralDailyOrderBucket from "../models/pricingReferralDailyOrderBucket.model.js";
import ManufacturerDailySettlementSnapshot from "../models/manufacturerDailySettlementSnapshot.model.js";
import Request from "../models/request.model.js";
import DeliveryInfo from "../models/deliveryInfo.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "../services/bulkShippingSnapshot.service.js";
import { recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId } from "../services/requestorDashboardSummarySnapshot.service.js";
import { recomputePricingReferralSnapshotForLeaderAnchorId } from "../services/pricingReferralSnapshot.service.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "../services/pricingReferralOrderBucket.service.js";
import { runWithJobLock } from "../utils/distributedJobLock.js";
import {
  getTodayYmdInKst,
  getYesterdayYmdInKst,
} from "../utils/krBusinessDays.js";
import { resolveMongoUri } from "../utils/mongoUri.js";

const INTERVAL_MS = 60 * 1000;
const WORKER_LOCK_NAME =
  process.env.DAILY_REFERRAL_SNAPSHOT_LOCK_NAME ||
  "worker:daily-referral-snapshot";
const WORKER_OWNER_ID = `daily-referral-snapshot-${process.pid}-${Date.now()}`;
const WORKER_LOCK_LEASE_MS = Number(
  process.env.DAILY_REFERRAL_SNAPSHOT_LOCK_LEASE_MS || 30 * 60 * 1000,
);
const WORKER_LOCK_HEARTBEAT_MS = Number(
  process.env.DAILY_REFERRAL_SNAPSHOT_LOCK_HEARTBEAT_MS || 60 * 1000,
);
const DONE_LOCK_PREFIX = "worker:daily-referral-snapshot:done:";
const DONE_LOCK_TTL_MS = 48 * 60 * 60 * 1000;

let timerHandle = null;
let running = false;
let lastRunYmd = null;

function kstYmdToUtcRange(ymd) {
  const dt = new Date(`${ymd}T00:00:00.000+09:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const start = new Date(dt.getTime() - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

function doneLockName(ymd) {
  return `${DONE_LOCK_PREFIX}${String(ymd || "").trim()}`;
}

async function ensureMongoConnected() {
  if (mongoose.connection.readyState === 1) return true;
  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error("[dailyReferralSnapshot] Mongo URI is not set");
    return false;
  }
  await mongoose.connect(mongoUri);
  return true;
}

async function isDailyRunCompleted(ymd) {
  const name = doneLockName(ymd);
  if (!name.endsWith(String(ymd || "").trim()) || !ymd) return false;
  const doc = await JobLock.findOne({ name }).select({ _id: 1 }).lean();
  return Boolean(doc);
}

async function markDailyRunCompleted(ymd) {
  const name = doneLockName(ymd);
  if (!ymd || !name) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DONE_LOCK_TTL_MS);
  await JobLock.findOneAndUpdate(
    { name },
    {
      $set: {
        ownerId: "completed",
        heartbeatAt: now,
        expiresAt,
      },
      $setOnInsert: {
        name,
        acquiredAt: now,
      },
    },
    { upsert: true },
  );
}

async function runDailySnapshot(ymd) {
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

  // 가격 SSOT 자동 점검은 운영 모니터에서 제외한다.
  // (스냅샷 재계산은 유지. 수동/CI 점검은 scripts/db/check-pricing-ssot-consistency.js)

  // 제조사 일별 정산 스냅샷 (전일분)
  try {
    const yesterdayYmd = getYesterdayYmdInKst();
    const utcRange = kstYmdToUtcRange(yesterdayYmd);
    if (utcRange) {
      const { start, end } = utcRange;
      const agg = await LedgerLine.aggregate([
        {
          $match: {
            ownerRole: "manufacturer",
            accountCode: "REV_MANUFACTURER",
            occurredAt: { $gte: start, $lte: end },
          },
        },
        {
          $lookup: {
            from: LedgerJournal.collection.name,
            localField: "journalId",
            foreignField: "journalId",
            as: "journalDoc",
          },
        },
        {
          $unwind: {
            path: "$journalDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: BusinessAnchor.collection.name,
            localField: "ownerId",
            foreignField: "_id",
            as: "ownerAnchor",
          },
        },
        {
          $unwind: {
            path: "$ownerAnchor",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            manufacturerOrganization: {
              $trim: { input: { $ifNull: ["$ownerAnchor.name", ""] } },
            },
            type: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                    then: "PAYOUT",
                  },
                  {
                    case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                    then: "ADJUST",
                  },
                ],
                default: "EARN",
              },
            },
            amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
          },
        },
        {
          $match: {
            manufacturerOrganization: { $ne: "" },
          },
        },
        {
          $group: {
            _id: {
              manufacturerOrganization: "$manufacturerOrganization",
              type: "$type",
              refType: "$refType",
            },
            amount: { $sum: "$amountBase" },
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
            from: LedgerLine.collection.name,
            let: { shippingPackageId: "$_id.shippingPackageId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$refId", "$$shippingPackageId"] },
                      { $eq: ["$ownerRole", "manufacturer"] },
                      { $eq: ["$accountCode", "REV_MANUFACTURER"] },
                      { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                      { $eq: ["$creditKind", "PAID"] },
                    ],
                  },
                },
              },
              { $sort: { occurredAt: -1, _id: -1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 0,
                  amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
                },
              },
            ],
            as: "shippingRevenue",
          },
        },
        {
          $unwind: {
            path: "$shippingRevenue",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$manufacturerOrganization",
            earnShippingCount: { $sum: 1 },
            earnShippingAmount: {
              $sum: { $abs: { $ifNull: ["$shippingRevenue.amountBase", 0] } },
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

async function tickOnce() {
  const ymd = getTodayYmdInKst();
  if (!ymd) return;

  if (lastRunYmd === ymd) return;

  const connected = await ensureMongoConnected();
  if (!connected) return;

  if (await isDailyRunCompleted(ymd)) {
    lastRunYmd = ymd;
    return;
  }

  const lockRun = await runWithJobLock({
    name: WORKER_LOCK_NAME,
    ownerId: WORKER_OWNER_ID,
    leaseMs: WORKER_LOCK_LEASE_MS,
    heartbeatMs: WORKER_LOCK_HEARTBEAT_MS,
    task: async () => {
      if (await isDailyRunCompleted(ymd)) {
        return { skipped: true, reason: "already_completed" };
      }
      await runDailySnapshot(ymd);
      await markDailyRunCompleted(ymd);
      return { skipped: false };
    },
  });

  if (!lockRun?.acquired) {
    if (await isDailyRunCompleted(ymd)) {
      lastRunYmd = ymd;
    }
    return;
  }

  if (lockRun?.result?.skipped) {
    lastRunYmd = ymd;
    return;
  }

  lastRunYmd = ymd;
  console.log(
    `[dailyReferralSnapshot] Daily run completed for ymd=${ymd}`,
  );
}

async function loop() {
  if (running) {
    timerHandle = setTimeout(loop, INTERVAL_MS);
    return;
  }
  running = true;
  try {
    await tickOnce();
  } catch (err) {
    console.error("[dailyReferralSnapshot] Error:", err);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    if (typeof timerHandle?.unref === "function") {
      timerHandle.unref();
    }
  }
}

export function startDailyReferralSnapshotWorker() {
  if (process.env.DAILY_REFERRAL_SNAPSHOT_WORKER_ENABLED === "false") {
    console.log("[dailyReferralSnapshot] Worker is disabled");
    return;
  }
  if (timerHandle || running) {
    return;
  }
  console.log("[dailyReferralSnapshot] Worker started");
  loop().catch((err) => {
    running = false;
    timerHandle = null;
    console.error("[dailyReferralSnapshot] Init failed:", err);
  });
}

export function stopDailyReferralSnapshotWorker() {
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  running = false;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  startDailyReferralSnapshotWorker();
}
