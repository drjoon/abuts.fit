// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/server.js
/**
 * 데모 모드 30일 만료 일괄 실사용 전환 워커.
 * - demoModeStartedAt + DEMO_MODE_DURATION_DAYS 경과 시 exitDemoMode(잔여 데모 크레딧 회수)
 * - /me 미방문 사업자도 만료 처리
 */
import { exitExpiredDemoModesBatch } from "../controllers/businesses/business.demoMode.util.js";

let timerHandle = null;
let running = false;

const INTERVAL_MS = Number(
  process.env.DEMO_MODE_EXPIRY_WORKER_INTERVAL_MS || 60 * 60 * 1000,
);
const BATCH_LIMIT = Number(process.env.DEMO_MODE_EXPIRY_WORKER_BATCH_LIMIT || 200);

async function tick() {
  const result = await exitExpiredDemoModesBatch({ limit: BATCH_LIMIT });
  if (result.scanned > 0 || result.exited > 0 || result.errors > 0) {
    console.log("[demoModeExpiry] completed", result);
  }
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[demoModeExpiry] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    timerHandle.unref?.();
  }
}

export function startDemoModeExpiryWorker() {
  if (
    process.env.DEMO_MODE_EXPIRY_WORKER_ENABLED === "false" ||
    timerHandle
  ) {
    return;
  }
  loop();
}
