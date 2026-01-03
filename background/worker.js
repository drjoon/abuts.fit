import "./bootstrap/env.js";
import { dbReady } from "./db.js";
import express from "express";
import {
  startCreditBPlanJobs,
  getCreditBPlanStatus,
} from "./jobs/creditBPlanJobs.js";
import { startHealthMonitor } from "./monitor/healthMonitor.js";
import {
  startPopbillWorker,
  getPopbillWorkerStatus,
  getQueueStats,
} from "./jobs/popbillWorker.js";
import {
  startProductionScheduler,
  getProductionSchedulerStatus,
} from "./jobs/productionScheduler.js";
import { waitForJobLockLeadership } from "./utils/jobLock.js";

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = new Date();

function startStatusServer() {
  const app = express();
  const port = Number(process.env.PORT || process.env.BACKGROUND_PORT || 4001);

  app.get("/", (req, res) => {
    res.json({ ok: true, service: "background-worker" });
  });

  app.get("/healthz", (req, res) => {
    res.json({ ok: true, startedAt: startedAt.toISOString() });
  });

  app.get("/status", async (req, res) => {
    // getQueueStats가 sync라도 안전하게 Promise.resolve로 래핑
    const queueStats = await Promise.resolve()
      .then(() => getQueueStats())
      .catch(() => ({}));
    res.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      creditBPlan: getCreditBPlanStatus(),
      popbillWorker: getPopbillWorkerStatus(),
      productionScheduler: getProductionSchedulerStatus(),
      queueStats,
    });
  });

  app.listen(port, () => {
    console.log(`[worker] status server listening on ${port}`);
  });
}

async function main() {
  console.log("[worker] starting");

  startStatusServer();

  await dbReady;
  console.log("[worker] db ready");

  const lockName = process.env.WORKER_LOCK_NAME || "background-worker";
  await waitForJobLockLeadership({
    name: lockName,
    ttlMs: Number(process.env.WORKER_LOCK_TTL_MS || 60_000),
    heartbeatMs: Number(process.env.WORKER_LOCK_HEARTBEAT_MS || 20_000),
    retryMs: Number(process.env.WORKER_LOCK_RETRY_MS || 5_000),
    onLeadershipGained: async () => {
      startCreditBPlanJobs();
      console.log("[worker] credit b-plan jobs started");

      startPopbillWorker();
      console.log("[worker] popbill worker started (queue-based)");

      startProductionScheduler();
      console.log("[worker] production scheduler started");

      startHealthMonitor({
        getCreditBPlanStatus,
        getPopbillWorkerStatus,
        staleMinutes: Number(process.env.WORKER_HEALTH_STALE_MINUTES || 10),
        intervalMinutes: Number(
          process.env.WORKER_HEALTH_INTERVAL_MINUTES || 1
        ),
      });
    },
    onLeadershipLost: async () => {
      console.error("[worker] leadership lost. exiting for failover");
    },
  });

  while (true) {
    await sleepMs(60_000);
  }
}

process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[worker] SIGINT");
  process.exit(0);
});

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
