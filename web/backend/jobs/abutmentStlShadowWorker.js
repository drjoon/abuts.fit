// related files:
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/server.js
/**
 * Rhino 대체 JS 파이프라인 섀도 비교 대기열을 하나씩 비운다.
 * register-file(2-filled)이 대기열에 넣고 바로 깨운다. 계산은 worker_threads에서 돈다.
 */
import {
  isAbutmentStlShadowWorkerEnabled,
  requeueStaleAbutmentStlShadowRuns,
  runNextAbutmentStlShadow,
  setAbutmentStlShadowWake,
} from "../services/abutmentStl/shadow.service.js";

const IDLE_MS = Number(process.env.ABUTMENT_STL_SHADOW_IDLE_MS || 60 * 1000);

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
    idle = !(await runNextAbutmentStlShadow());
  } catch (error) {
    idle = true;
    console.error("[abutmentStlShadow] loop failed", error?.message || error);
  } finally {
    running = false;
    schedule(idle ? IDLE_MS : 0);
  }
}

export function startAbutmentStlShadowWorker() {
  if (!isAbutmentStlShadowWorkerEnabled() || started) return;
  started = true;
  setAbutmentStlShadowWake(() => {
    if (!running) schedule(0);
  });
  void requeueStaleAbutmentStlShadowRuns()
    .then((count) => {
      if (count) console.log("[abutmentStlShadow] requeued stale runs", count);
    })
    .catch((error) => console.error("[abutmentStlShadow] requeue failed", error?.message || error))
    .finally(() => schedule(0));
}
