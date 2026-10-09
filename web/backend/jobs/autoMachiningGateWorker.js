// related files:
// - web/backend/services/autoMachiningGate.service.js
// - web/backend/server.js
// change-log:
// - 2026-10-09: 스위치가 꺼져 있어도 테스트 계정 준비 의뢰는 hold로 남긴다.
// - 2026-10-09: 신설. 관리자 토글(autoMachiningGate.enabled)이 켜진 동안만 품질 판정·자동 승인.
import { runAutoMachiningGatePass } from "../services/autoMachiningGate.service.js";
import { runWithJobLock } from "../utils/distributedJobLock.js";

const INTERVAL_MS = Number(process.env.AUTO_MACHINING_GATE_INTERVAL_MS || 30000);
const OWNER_ID = `auto-gate-${process.pid}-${Date.now()}`;
let timerHandle = null;
let running = false;

async function tick() {
  await runWithJobLock({
    name: "worker:auto-machining-gate",
    ownerId: OWNER_ID,
    leaseMs: 120000,
    heartbeatMs: 30000,
    onLockMiss: () => {},
    task: async () => {
      const r = await runAutoMachiningGatePass({
        limit: Number(process.env.AUTO_MACHINING_GATE_BATCH || 10),
      });
      if (r.approved || r.held || r.failed) {
        console.log("[autoMachiningGate] pass", r);
      }
    },
  });
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[autoMachiningGate] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    timerHandle.unref?.();
  }
}

export function startAutoMachiningGateWorker() {
  if (process.env.AUTO_MACHINING_GATE_WORKER_ENABLED === "false" || timerHandle) {
    return;
  }
  loop();
}
