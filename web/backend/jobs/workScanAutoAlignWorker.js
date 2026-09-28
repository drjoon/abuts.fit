// related files:
// - web/backend/services/workScanAutoAlign.service.js
// - web/backend/server.js
/**
 * 의뢰 상악·하악·바이트 자동 모델 정렬 대기열을 하나씩 비운다.
 * 새 의뢰 스캔이 올라온 직후 대기열에 들어온 것만 처리한다. 기존 의뢰는 백필하지 않는다.
 * 건 사이에 쉬어 API 인스턴스의 CPU를 계속 잡지 않는다.
 */
import {
  runNextWorkScanAutoAlign,
  setWorkScanAutoAlignWake,
} from "../services/workScanAutoAlign.service.js";

const IDLE_MS = Number(process.env.WORK_SCAN_AUTO_ALIGN_IDLE_MS || 30 * 1000);
const COOLDOWN_MS = Number(process.env.WORK_SCAN_AUTO_ALIGN_COOLDOWN_MS || 5 * 1000);

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
    schedule(idle ? IDLE_MS : COOLDOWN_MS);
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
  schedule(0);
}
