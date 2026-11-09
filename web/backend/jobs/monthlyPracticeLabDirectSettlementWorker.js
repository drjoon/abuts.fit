// related files:
// - web/backend/services/practiceLabDirectSettlement.service.js
// - web/backend/server.js
//
// KST 매월 1일 이후 전월 외부 기공비 정산서를 만든다. 계좌 이체는 하지 않는다.
import { ensureDirectSettlementsThroughPrevious } from "../services/practiceLabDirectSettlement.service.js";

let timerHandle = null;
let running = false;
let lastRunKey = "";

function kstYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${map.year}-${map.month}`;
}

export async function runMonthlyDirectLabSettlementTick(now = new Date()) {
  const key = kstYearMonth(now);
  if (lastRunKey === key) return { skipped: true };
  const result = await ensureDirectSettlementsThroughPrevious();
  lastRunKey = key;
  return { skipped: false, ...result };
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await runMonthlyDirectLabSettlementTick();
  } catch (error) {
    console.error("[monthlyPracticeLabDirectSettlement] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, 60 * 60 * 1000);
    timerHandle.unref?.();
  }
}

export function startMonthlyPracticeLabDirectSettlementWorker() {
  if (process.env.PRACTICE_LAB_DIRECT_SETTLEMENT_WORKER_ENABLED === "false" || timerHandle) {
    return;
  }
  loop();
}
