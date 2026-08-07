// related files:
// - web/backend/services/requestBackup.service.js
// - web/backend/models/requestBackupRun.model.js
// - web/backend/utils/distributedJobLock.js
// - web/backend/server.js
// - web/backend/rules.md
/**
 * 중요 DB 컬렉션 정기 백업 워커.
 *
 * 정책:
 * - 기본 1시간 간격 증분 백업 (watermark 이후 신규/수정 문서만)
 * - 주 1회 전체 스냅샷 (REQUEST_BACKUP_WEEKLY_FULL_MS, 기본 7일)
 * - 증분이고 지문이 동일하면 생략
 * - 과거 백업 파일은 삭제하지 않음 (append-only)
 * - 멀티 인스턴스는 JobLock으로 중복 실행 방지
 */
import { runWithJobLock } from "../utils/distributedJobLock.js";
import { runRequestBackupOnce } from "../services/requestBackup.service.js";

const INTERVAL_MS = Number(
  process.env.REQUEST_BACKUP_INTERVAL_MS || 60 * 60 * 1000,
);
const WORKER_LOCK_NAME =
  process.env.REQUEST_BACKUP_LOCK_NAME || "worker:hourly-request-backup";
const WORKER_OWNER_ID = `hourly-request-backup-${process.pid}-${Date.now()}`;
const WORKER_LOCK_LEASE_MS = Number(
  process.env.REQUEST_BACKUP_LOCK_LEASE_MS || 50 * 60 * 1000,
);
const WORKER_LOCK_HEARTBEAT_MS = Number(
  process.env.REQUEST_BACKUP_LOCK_HEARTBEAT_MS || 60 * 1000,
);

let timerHandle = null;
let running = false;

function isDisabled() {
  const raw = String(process.env.REQUEST_BACKUP_DISABLED || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function tick() {
  if (running) return;
  if (isDisabled()) return;
  running = true;
  try {
    await runWithJobLock({
      name: WORKER_LOCK_NAME,
      ownerId: WORKER_OWNER_ID,
      leaseMs: WORKER_LOCK_LEASE_MS,
      heartbeatMs: WORKER_LOCK_HEARTBEAT_MS,
      task: async () => {
        const result = await runRequestBackupOnce({ kind: "hourly" });
        console.log("[critical-backup]", {
          status: result.status,
          reason: result.reason,
          mode: result.mode || null,
          requestCount: result.requestCount || null,
          files: result.files?.length || 0,
          collections: result.collections?.length || null,
          storageType: result.storage?.type || null,
        });
        return result;
      },
    });
  } catch (err) {
    console.error("[critical-backup] tick failed:", err?.message || err);
  } finally {
    running = false;
  }
}

export function startHourlyRequestBackupWorker({
  runImmediate = false,
} = {}) {
  if (isDisabled()) {
    console.log("[critical-backup] worker disabled (REQUEST_BACKUP_DISABLED)");
    return;
  }
  if (timerHandle) return;

  console.log(
    `[critical-backup] worker started (intervalMs=${INTERVAL_MS}, incremental+weekly-full, append-only)`,
  );

  if (runImmediate) {
    void tick();
  }

  timerHandle = setInterval(() => {
    void tick();
  }, INTERVAL_MS);

  if (typeof timerHandle.unref === "function") {
    timerHandle.unref();
  }
}

export function stopHourlyRequestBackupWorker() {
  if (!timerHandle) return;
  clearInterval(timerHandle);
  timerHandle = null;
}
