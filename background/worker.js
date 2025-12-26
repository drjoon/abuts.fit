import "./bootstrap/env.js";
import { dbReady } from "./db.js";
import express from "express";
import {
  startCreditBPlanJobs,
  getCreditBPlanStatus,
} from "./jobs/creditBPlanJobs.js";
import {
  startTaxInvoiceBatchJobs,
  getTaxInvoiceBatchStatus,
} from "./jobs/taxInvoiceBatch.js";
import { startTaxInvoiceScheduler } from "./jobs/taxInvoiceScheduler.js";
import { startHealthMonitor } from "./monitor/healthMonitor.js";

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

  app.get("/status", (req, res) => {
    res.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      creditBPlan: getCreditBPlanStatus(),
      taxInvoiceBatch: getTaxInvoiceBatchStatus(),
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

  startCreditBPlanJobs();
  console.log("[worker] credit b-plan jobs started");

  startTaxInvoiceBatchJobs();
  console.log("[worker] tax invoice batch jobs started");

  startTaxInvoiceScheduler();
  console.log("[worker] tax invoice scheduler started (daily 12:00)");

  startHealthMonitor({
    getCreditBPlanStatus,
    getTaxInvoiceBatchStatus,
    staleMinutes: Number(process.env.WORKER_HEALTH_STALE_MINUTES || 10),
    intervalMinutes: Number(process.env.WORKER_HEALTH_INTERVAL_MINUTES || 1),
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
