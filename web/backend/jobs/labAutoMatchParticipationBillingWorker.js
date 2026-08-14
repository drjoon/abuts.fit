// related files:
// - web/backend/services/labAutoMatchParticipation.service.js
// - web/backend/server.js
// change-log:
// - 2026-08-14: 기공소 자동 매칭 월 참여 결제일 도래 처리(해지 예약→만료, 유지→다음 결제일 연장).
import { processDueAutoMatchParticipations } from "../services/labAutoMatchParticipation.service.js";

let timerHandle = null;
let running = false;

const INTERVAL_MS = 60 * 60 * 1000;

async function tick() {
  const result = await processDueAutoMatchParticipations();
  if (result.due) {
    console.log("[labAutoMatchParticipationBilling] completed", result);
  }
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[labAutoMatchParticipationBilling] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    timerHandle.unref?.();
  }
}

export function startLabAutoMatchParticipationBillingWorker() {
  if (
    process.env.LAB_AUTO_MATCH_PARTICIPATION_BILLING_WORKER_ENABLED ===
      "false" ||
    timerHandle
  ) {
    return;
  }
  loop();
}
