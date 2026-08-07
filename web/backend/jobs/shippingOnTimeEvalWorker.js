// change-log:
// - 2026-08-07: 약속 출고일 자정 이후 정시/실패 평가. 신속 실패 시 추가비 취소.
// related files:
// - web/backend/rules.md
// - web/backend/server.js
// - web/backend/controllers/requests/shippingOnTime.utils.js
// - web/backend/controllers/requests/common.review.helpers.js
/**
 * KST 일자당 1회: 약속 출고일이 지난 의뢰의 정시 집하 여부를 평가한다.
 * - on_time: 약속일(KST) 당일 집하(수동 집하 포함)
 * - late: 자정까지 당일 집하 없음 → 신속이면 추가 크레딧 취소
 */
import "../bootstrap/env.js";
import mongoose from "mongoose";
import Request from "../models/request.model.js";
import DeliveryInfo from "../models/deliveryInfo.model.js";
import JobLock from "../models/jobLock.model.js";
import { runWithJobLock } from "../utils/distributedJobLock.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";
import { resolveMongoUri } from "../utils/mongoUri.js";
import {
  evaluateShipOnTimeOutcome,
  resolvePromisedShipYmd,
} from "../controllers/requests/shippingOnTime.utils.js";
import { cancelExpressSurchargeIfShipDelayed } from "../controllers/requests/common.review.helpers.js";

const INTERVAL_MS = 60 * 1000;
const WORKER_LOCK_NAME =
  process.env.SHIPPING_ON_TIME_EVAL_LOCK_NAME ||
  "worker:shipping-on-time-eval";
const WORKER_OWNER_ID = `shipping-on-time-eval-${process.pid}-${Date.now()}`;
const WORKER_LOCK_LEASE_MS = Number(
  process.env.SHIPPING_ON_TIME_EVAL_LOCK_LEASE_MS || 20 * 60 * 1000,
);
const WORKER_LOCK_HEARTBEAT_MS = Number(
  process.env.SHIPPING_ON_TIME_EVAL_LOCK_HEARTBEAT_MS || 60 * 1000,
);
const DONE_LOCK_PREFIX = "worker:shipping-on-time-eval:done:";
const DONE_LOCK_TTL_MS = 48 * 60 * 60 * 1000;
const BATCH_LIMIT = Number(
  process.env.SHIPPING_ON_TIME_EVAL_BATCH_LIMIT || 500,
);

let timerHandle = null;
let running = false;
let lastRunYmd = null;

function doneLockName(ymd) {
  return `${DONE_LOCK_PREFIX}${String(ymd || "").trim()}`;
}

async function ensureMongoConnected() {
  if (mongoose.connection.readyState === 1) return true;
  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error("[shippingOnTimeEval] Mongo URI is not set");
    return false;
  }
  await mongoose.connect(mongoUri);
  return true;
}

async function isDailyRunCompleted(ymd) {
  const name = doneLockName(ymd);
  if (!ymd || !name) return false;
  const doc = await JobLock.findOne({ name }).select({ _id: 1 }).lean();
  return Boolean(doc);
}

async function markDailyRunCompleted(ymd) {
  const name = doneLockName(ymd);
  if (!ymd || !name) return;
  const now = new Date();
  await JobLock.updateOne(
    { name },
    {
      $set: {
        name,
        ownerId: WORKER_OWNER_ID,
        leaseUntil: new Date(now.getTime() + DONE_LOCK_TTL_MS),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

async function evaluatePendingShipOutcomes({ todayYmd }) {
  const filter = {
    manufacturerStage: { $ne: "취소" },
    source: { $ne: "manufacturer_sample" },
    "rnd.unmachinableAt": null,
    $or: [
      { "timeline.shipOutcome.status": { $exists: false } },
      { "timeline.shipOutcome.status": null },
      { "timeline.shipOutcome.status": "pending" },
      { "timeline.shipOutcome.status": { $nin: ["on_time", "late"] } },
    ],
    $and: [
      {
        $or: [
          {
            "timeline.originalEstimatedShipYmd": {
              $exists: true,
              $type: "string",
              $lt: todayYmd,
            },
          },
          {
            "timeline.estimatedShipYmd": {
              $exists: true,
              $type: "string",
              $lt: todayYmd,
            },
          },
        ],
      },
    ],
  };

  const rows = await Request.find(filter)
    .select({
      requestId: 1,
      businessAnchorId: 1,
      shippingMode: 1,
      finalShipping: 1,
      originalShipping: 1,
      timeline: 1,
      productionSchedule: 1,
      deliveryInfoRef: 1,
      price: 1,
      manufacturerStage: 1,
    })
    .limit(BATCH_LIMIT)
    .lean(false);

  if (!rows.length) {
    return { scanned: 0, evaluated: 0, lateExpressCancelled: 0 };
  }

  const deliveryIds = rows
    .map((r) => r.deliveryInfoRef)
    .filter(Boolean);
  const deliveryDocs = deliveryIds.length
    ? await DeliveryInfo.find({ _id: { $in: deliveryIds } })
        .select({ pickedUpAt: 1, shippedAt: 1 })
        .lean()
    : [];
  const deliveryById = new Map(
    deliveryDocs.map((d) => [String(d._id), d]),
  );

  let evaluated = 0;
  let lateExpressCancelled = 0;
  const now = new Date();

  for (const request of rows) {
    const promisedYmd = resolvePromisedShipYmd(request);
    if (!promisedYmd || promisedYmd >= todayYmd) continue;

    const deliveryInfo = request.deliveryInfoRef
      ? deliveryById.get(String(request.deliveryInfoRef)) || null
      : null;

    const outcome = evaluateShipOnTimeOutcome({
      request,
      deliveryInfo,
      todayYmd,
    });
    if (outcome.status !== "on_time" && outcome.status !== "late") continue;

    request.timeline = request.timeline || {};
    request.timeline.shipOutcome = {
      status: outcome.status,
      evaluatedAt: now,
      pickedUpYmd: outcome.pickedUpYmd || null,
      promisedYmd: outcome.promisedYmd || promisedYmd,
    };

    if (outcome.status === "late" && outcome.mode === "express") {
      const businessAnchorId = String(request.businessAnchorId || "").trim();
      if (businessAnchorId) {
        const cancelResult = await cancelExpressSurchargeIfShipDelayed({
          request,
          businessAnchorId,
          deliveryInfo,
          todayYmd,
        });
        if (cancelResult?.didCancel || cancelResult?.reason === "no_express_surcharge") {
          lateExpressCancelled += 1;
        }
      }
    }

    await request.save();
    evaluated += 1;
  }

  return { scanned: rows.length, evaluated, lateExpressCancelled };
}

async function runOnce() {
  const todayYmd = getTodayYmdInKst();
  if (!todayYmd) return;

  if (lastRunYmd === todayYmd && (await isDailyRunCompleted(todayYmd))) {
    return;
  }

  const connected = await ensureMongoConnected();
  if (!connected) return;

  await runWithJobLock({
    name: WORKER_LOCK_NAME,
    ownerId: WORKER_OWNER_ID,
    leaseMs: WORKER_LOCK_LEASE_MS,
    heartbeatMs: WORKER_LOCK_HEARTBEAT_MS,
    task: async () => {
      if (await isDailyRunCompleted(todayYmd)) {
        lastRunYmd = todayYmd;
        return;
      }

      console.log(`[shippingOnTimeEval] start ymd=${todayYmd}`);
      const result = await evaluatePendingShipOutcomes({ todayYmd });
      console.log("[shippingOnTimeEval] done", result);

      // 배치 한도에 걸리면 done 마커를 남기지 않고 다음 tick에서 이어서 처리
      if (result.scanned < BATCH_LIMIT) {
        await markDailyRunCompleted(todayYmd);
        lastRunYmd = todayYmd;
      }
    },
  });
}

export function startShippingOnTimeEvalWorker() {
  if (timerHandle) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce();
    } catch (err) {
      console.error("[shippingOnTimeEval] tick error", err);
    } finally {
      running = false;
    }
  };
  void tick();
  timerHandle = setInterval(tick, INTERVAL_MS);
  if (typeof timerHandle.unref === "function") timerHandle.unref();
  console.log("[shippingOnTimeEval] worker started");
}

export async function runShippingOnTimeEvalOnceForTests() {
  return runOnce();
}
