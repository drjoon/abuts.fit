// related files:
// - web/backend/utils/abutsLabFeeAverage.js
// - web/backend/server.js
// - web/backend/utils/distributedJobLock.js
//
// KST 일자당 1회: 기공비 설정 기공소 수가 → 1σ 제거 → 평균 → 1천원 올림 → 카탈로그 반영.

import "../bootstrap/env.js";
import mongoose from "mongoose";
import JobLock from "../models/jobLock.model.js";
import { runWithJobLock } from "../utils/distributedJobLock.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";
import { resolveMongoUri } from "../utils/mongoUri.js";
import { recomputeAndPersistAbutsLabFeeAverages } from "../utils/abutsLabFeeAverage.js";

const INTERVAL_MS = 60 * 1000;
const WORKER_LOCK_NAME =
  process.env.ABUTS_LAB_FEE_AVERAGE_LOCK_NAME ||
  "worker:abuts-lab-fee-average";
const WORKER_OWNER_ID = `abuts-lab-fee-average-${process.pid}-${Date.now()}`;
const WORKER_LOCK_LEASE_MS = Number(
  process.env.ABUTS_LAB_FEE_AVERAGE_LOCK_LEASE_MS || 20 * 60 * 1000,
);
const WORKER_LOCK_HEARTBEAT_MS = Number(
  process.env.ABUTS_LAB_FEE_AVERAGE_LOCK_HEARTBEAT_MS || 60 * 1000,
);
const DONE_LOCK_PREFIX = "worker:abuts-lab-fee-average:done:";
const DONE_LOCK_TTL_MS = 48 * 60 * 60 * 1000;

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
    console.error("[abutsLabFeeAverage] Mongo URI is not set");
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

async function runOnce() {
  if (running) return;
  const ymd = getTodayYmdInKst();
  if (!ymd) return;
  if (lastRunYmd === ymd) return;

  const ok = await ensureMongoConnected();
  if (!ok) return;

  if (await isDailyRunCompleted(ymd)) {
    lastRunYmd = ymd;
    return;
  }

  running = true;
  try {
    await runWithJobLock({
      name: WORKER_LOCK_NAME,
      ownerId: WORKER_OWNER_ID,
      leaseMs: WORKER_LOCK_LEASE_MS,
      heartbeatMs: WORKER_LOCK_HEARTBEAT_MS,
      task: async () => {
        if (await isDailyRunCompleted(ymd)) {
          lastRunYmd = ymd;
          return;
        }
        console.log(
          `[${new Date().toISOString()}] abutsLabFeeAverage started ymd=${ymd}`,
        );
        const result = await recomputeAndPersistAbutsLabFeeAverages();
        await markDailyRunCompleted(ymd);
        lastRunYmd = ymd;
        console.log(
          `[${new Date().toISOString()}] abutsLabFeeAverage done`,
          result,
        );
      },
    });
  } catch (error) {
    console.error("[abutsLabFeeAverage] failed", error?.message || error);
  } finally {
    running = false;
  }
}

export function startAbutsLabFeeAverageWorker({ runImmediate = true } = {}) {
  if (timerHandle) return;
  if (runImmediate) {
    void runOnce();
  }
  timerHandle = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  if (typeof timerHandle.unref === "function") timerHandle.unref();
  console.log("[abutsLabFeeAverage] worker started");
}

export function stopAbutsLabFeeAverageWorker() {
  if (!timerHandle) return;
  clearInterval(timerHandle);
  timerHandle = null;
}
