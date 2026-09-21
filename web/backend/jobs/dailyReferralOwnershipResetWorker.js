// related files:
// - web/backend/rules.md
// - web/backend/server.js
// - web/backend/services/referralOwnershipReset.service.js
// - web/backend/utils/distributedJobLock.js
/**
 * KST 일자당 1회: 영업(딜러·영업본부) 소개 귀속 90일 비활성 리셋.
 */
import "../bootstrap/env.js";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import JobLock from "../models/jobLock.model.js";
import { runWithJobLock } from "../utils/distributedJobLock.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";
import { resolveMongoUri } from "../utils/mongoUri.js";
import { resetExpiredReferralOwnerships } from "../services/referralOwnershipReset.service.js";

const INTERVAL_MS = 60 * 1000;
const WORKER_LOCK_NAME =
  process.env.REFERRAL_OWNERSHIP_RESET_LOCK_NAME ||
  "worker:daily-referral-ownership-reset";
const WORKER_OWNER_ID = `referral-ownership-reset-${process.pid}-${Date.now()}`;
const WORKER_LOCK_LEASE_MS = Number(
  process.env.REFERRAL_OWNERSHIP_RESET_LOCK_LEASE_MS || 20 * 60 * 1000,
);
const WORKER_LOCK_HEARTBEAT_MS = Number(
  process.env.REFERRAL_OWNERSHIP_RESET_LOCK_HEARTBEAT_MS || 60 * 1000,
);
const DONE_LOCK_PREFIX = "worker:daily-referral-ownership-reset:done:";
const DONE_LOCK_TTL_MS = 48 * 60 * 60 * 1000;
const BATCH_LIMIT = Number(
  process.env.REFERRAL_OWNERSHIP_RESET_BATCH_LIMIT || 500,
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
    console.error("[referralOwnershipReset] Mongo URI is not set");
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

async function runDailyReset(ymd) {
  console.log(`[referralOwnershipReset] Daily run start ymd=${ymd}`);
  let totalReset = 0;
  let totalErrors = 0;
  let totalScanned = 0;
  let rounds = 0;
  let afterId = null;
  while (rounds < 50) {
    rounds += 1;
    const result = await resetExpiredReferralOwnerships({
      limit: BATCH_LIMIT,
      dryRun: false,
      afterId,
    });
    totalReset += Number(result.reset || 0);
    totalErrors += Number(result.errors || 0);
    totalScanned += Number(result.scanned || 0);
    afterId = result.nextAfterId || null;
    if (result.exhausted || !afterId) break;
  }
  console.log(
    `[referralOwnershipReset] Daily run done ymd=${ymd} scanned=${totalScanned} reset=${totalReset} errors=${totalErrors} rounds=${rounds}`,
  );
}

async function tickOnce() {
  const ok = await ensureMongoConnected();
  if (!ok) return;

  const ymd = getTodayYmdInKst();
  if (!ymd) return;
  if (lastRunYmd === ymd) return;
  if (await isDailyRunCompleted(ymd)) {
    lastRunYmd = ymd;
    return;
  }

  const lockRun = await runWithJobLock({
    name: WORKER_LOCK_NAME,
    ownerId: WORKER_OWNER_ID,
    leaseMs: WORKER_LOCK_LEASE_MS,
    heartbeatMs: WORKER_LOCK_HEARTBEAT_MS,
    fn: async () => {
      if (await isDailyRunCompleted(ymd)) {
        return { skipped: true };
      }
      await runDailyReset(ymd);
      await markDailyRunCompleted(ymd);
      return { skipped: false };
    },
  });

  if (!lockRun?.acquired) return;
  if (lockRun?.result?.skipped) {
    lastRunYmd = ymd;
    return;
  }
  lastRunYmd = ymd;
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
    console.error("[referralOwnershipReset] Error:", err);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    if (typeof timerHandle?.unref === "function") {
      timerHandle.unref();
    }
  }
}

export function startDailyReferralOwnershipResetWorker() {
  if (process.env.REFERRAL_OWNERSHIP_RESET_WORKER_ENABLED === "false") {
    console.log("[referralOwnershipReset] Worker is disabled");
    return;
  }
  if (timerHandle || running) return;
  console.log("[referralOwnershipReset] Worker started");
  loop().catch((err) => {
    running = false;
    timerHandle = null;
    console.error("[referralOwnershipReset] Init failed:", err);
  });
}

export function stopDailyReferralOwnershipResetWorker() {
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
  startDailyReferralOwnershipResetWorker();
}
