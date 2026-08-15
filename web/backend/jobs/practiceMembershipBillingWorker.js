// related files:
// - web/backend/services/practiceMembership.service.js
// - web/backend/server.js
// change-log:
// - 2026-08-15: 결제일 도래 시 유료 크레딧 실차감. 부족·해지 예약은 미결제·만료.
// - 2026-08-13: 치과 멤버십 결제일 도래 시 해지 예약건은 미결제·만료, 유지건은 다음 결제일만 연장.
import { processDuePracticeMemberships } from "../services/practiceMembership.service.js";

let timerHandle = null;
let running = false;

const INTERVAL_MS = 60 * 60 * 1000;

async function tick() {
  const result = await processDuePracticeMemberships();
  if (result.due || result.backfilled || result.charged) {
    console.log("[practiceMembershipBilling] completed", result);
  }
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[practiceMembershipBilling] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    timerHandle.unref?.();
  }
}

export function startPracticeMembershipBillingWorker() {
  if (
    process.env.PRACTICE_MEMBERSHIP_BILLING_WORKER_ENABLED === "false" ||
    timerHandle
  ) {
    return;
  }
  loop();
}
