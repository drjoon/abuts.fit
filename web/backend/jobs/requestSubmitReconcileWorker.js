// related files:
// - web/backend/services/requestSubmitIntegrity.service.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/server.js
// change-log:
// - 2026-11-08: 신설. 접수 뒤 후처리(출고일·보류·STL 트리거)가 서버 재시작 등으로 끊긴 준비 의뢰를 이어 준다.
import { runRequestSubmitReconcilePass } from "../services/requestSubmitIntegrity.service.js";
import { runWithJobLock } from "../utils/distributedJobLock.js";

const INTERVAL_MS = Number(process.env.REQUEST_SUBMIT_RECONCILE_INTERVAL_MS || 60000);
const OWNER_ID = `request-submit-reconcile-${process.pid}-${Date.now()}`;
let timerHandle = null;
let running = false;

async function tick() {
  await runWithJobLock({
    name: "worker:request-submit-reconcile",
    ownerId: OWNER_ID,
    leaseMs: 120000,
    heartbeatMs: 30000,
    onLockMiss: () => {},
    task: async () => {
      const r = await runRequestSubmitReconcilePass({
        limit: Number(process.env.REQUEST_SUBMIT_RECONCILE_BATCH || 50),
      });
      if (r.schedule || r.stl || r.hold) {
        console.log("[requestSubmitReconcile] pass", r);
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
    console.error("[requestSubmitReconcile] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    timerHandle.unref?.();
  }
}

export function startRequestSubmitReconcileWorker() {
  if (process.env.REQUEST_SUBMIT_RECONCILE_ENABLED === "false" || timerHandle) {
    return;
  }
  loop();
}
