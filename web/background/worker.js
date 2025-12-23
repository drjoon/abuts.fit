import "../backend/bootstrap/env.js";
import { dbReady } from "../backend/app.js";
import express from "express";
import {
  startCreditBPlanJobs,
  getCreditBPlanStatus,
} from "./jobs/creditBPlanJobs.js";

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = new Date();

function startStatusServer() {
  const app = express();
  const port = Number(process.env.BACKGROUND_PORT || 4001);

  app.get("/healthz", (req, res) => {
    res.json({ ok: true, startedAt: startedAt.toISOString() });
  });

  app.get("/status", (req, res) => {
    res.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      creditBPlan: getCreditBPlanStatus(),
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
