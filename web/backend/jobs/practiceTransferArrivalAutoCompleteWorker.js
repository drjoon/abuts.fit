// related files:
// - web/backend/services/practiceTransferComplete.service.js
// - web/backend/server.js
// change-log:
// - 2026-09-02: 치과도착일 경과 — CA 미업로드 기한만료 + 그 외 자동 작업완료.
/**
 * 주기적으로 치과도착일이 지난 기공의뢰를 작업완료 처리한다.
 * 도착일 당일·그 전에 도착일을 재지정하면 대상에서 제외되어 기한이 연장된다.
 */
import { autoCompletePracticeTransfersPastArrival } from "../services/practiceTransferComplete.service.js";

let timerHandle = null;
let running = false;

const INTERVAL_MS = Number(
  process.env.PRACTICE_TRANSFER_ARRIVAL_AUTO_COMPLETE_INTERVAL_MS ||
    15 * 60 * 1000,
);

async function tick() {
  const result = await autoCompletePracticeTransfersPastArrival({
    limit: Number(
      process.env.PRACTICE_TRANSFER_ARRIVAL_AUTO_COMPLETE_BATCH || 200,
    ),
  });
  if (result.completed || result.failed || result.expired) {
    console.log("[practiceTransferArrivalAutoComplete] done", result);
  }
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[practiceTransferArrivalAutoComplete] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    timerHandle.unref?.();
  }
}

export function startPracticeTransferArrivalAutoCompleteWorker() {
  if (
    process.env.PRACTICE_TRANSFER_ARRIVAL_AUTO_COMPLETE_WORKER_ENABLED ===
      "false" ||
    timerHandle
  ) {
    return;
  }
  loop();
}
