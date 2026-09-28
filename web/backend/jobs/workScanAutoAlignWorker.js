// related files:
// - web/backend/services/workScanAutoAlign.service.js
// - web/backend/server.js
/**
 * 의뢰 상악·하악·바이트 자동 모델 정렬 대기열을 하나씩 비운다.
 * 켜질 때 상태가 없는 기존 의뢰를 모두 대기열에 넣는다. 새 의뢰 파일은 바로 깨운다.
 */
import {
  backfillWorkScanAutoAlignQueue,
  runNextWorkScanAutoAlign,
  setWorkScanAutoAlignWake,
} from "../services/workScanAutoAlign.service.js";

const IDLE_MS = Number(process.env.WORK_SCAN_AUTO_ALIGN_IDLE_MS || 30 * 1000);

let started = false;
let running = false;
let timerHandle = null;

function schedule(ms) {
  clearTimeout(timerHandle);
  timerHandle = setTimeout(loop, ms);
  timerHandle.unref?.();
}

async function loop() {
  if (running) return;
  running = true;
  let idle = false;
  try {
    idle = !(await runNextWorkScanAutoAlign());
  } catch (error) {
    idle = true;
    console.error("[workScanAutoAlign] failed", error?.message || error);
  } finally {
    running = false;
    schedule(idle ? IDLE_MS : 0);
  }
}

export function startWorkScanAutoAlignWorker() {
  if (process.env.WORK_SCAN_AUTO_ALIGN_WORKER_ENABLED === "false" || started) {
    return;
  }
  started = true;
  setWorkScanAutoAlignWake(() => {
    if (!running) schedule(0);
  });
  void backfillWorkScanAutoAlignQueue()
    .then((count) => {
      if (count) console.log("[workScanAutoAlign] backfill queued", count);
    })
    .catch((error) => {
      console.error("[workScanAutoAlign] backfill failed", error?.message || error);
    })
    .finally(() => schedule(0));
}
