// 디자인 완료 유예가 있는 동안만 5초마다 확인한다. 대기 건이 없으면 타이머를 끈다.
// related files:
// - web/backend/services/abutmentDesignGrace.service.js
// - web/backend/server.js
import { promoteDueAbutmentDesignGraceOnce } from "../services/abutmentDesignGrace.service.js";

const INTERVAL_MS = 5_000;

let timer = null;
let running = false;
let epoch = 0;

async function tick() {
  if (running) return;
  running = true;
  const seen = epoch;
  try {
    const result = await promoteDueAbutmentDesignGraceOnce();
    if (result.pending === 0 && epoch === seen && timer) {
      clearInterval(timer);
      timer = null;
    }
  } catch (err) {
    console.error("[abutment-grace] tick failed", err?.message || err);
  } finally {
    running = false;
  }
}

export function ensureAbutmentDesignGraceWorker() {
  epoch += 1;
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  timer.unref?.();
  void tick();
}

export function startAbutmentDesignGraceWorker() {
  ensureAbutmentDesignGraceWorker();
}
