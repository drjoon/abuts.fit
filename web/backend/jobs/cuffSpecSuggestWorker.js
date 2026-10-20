// related files:
// - web/backend/services/abutmentStl/cuffSpecSuggest.service.js
// - web/backend/services/abutmentStl/cuffBlend.service.js (스펙 미등록 결과가 나오면 trigger)
// - web/backend/utils/distributedJobLock.js
/**
 * 커넥션 스펙 미등록 샘플이 제조사 준비에 새로 들어오면(cuffBlend=spec-pending) 모든 미등록 스펙을 다시 분석한다.
 * 주기 실행은 없다. 호출부가 cuffBlend 기록을 저장할 시간을 주려고 짧게 지연하고, 연속 유입은 한 번으로 합친다.
 * 측정은 메시 worker_threads에서 돈다.
 */
import { runWithJobLock } from "../utils/distributedJobLock.js";
import { runCuffSpecSuggestOnce } from "../services/abutmentStl/cuffSpecSuggest.service.js";

const DEBOUNCE_MS = Number(process.env.CUFF_SPEC_SUGGEST_DEBOUNCE_MS || 15 * 1000);
const LOCK_NAME = "worker:cuff-spec-suggest";
const OWNER_ID = `cuff-spec-suggest-${process.pid}-${Date.now()}`;
const LOCK_LEASE_MS = 20 * 60 * 1000;

let timer = null;
let running = false;
let rerun = false;

async function run() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    await runWithJobLock({
      name: LOCK_NAME,
      ownerId: OWNER_ID,
      leaseMs: LOCK_LEASE_MS,
      task: async () => {
        const out = await runCuffSpecSuggestOnce();
        if (out.keys) console.log("[cuffSpecSuggest] done", out);
      },
    });
  } catch (error) {
    console.error("[cuffSpecSuggest] run failed", error?.message || error);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      triggerCuffSpecSuggest();
    }
  }
}

/** 스펙 미등록 샘플이 들어올 때마다 부른다. 응답 경로를 막지 않는다. */
export function triggerCuffSpecSuggest() {
  if (String(process.env.CUFF_SPEC_SUGGEST_DISABLED || "").trim() === "true") return;
  clearTimeout(timer);
  timer = setTimeout(() => void run(), DEBOUNCE_MS);
  timer.unref?.();
}
