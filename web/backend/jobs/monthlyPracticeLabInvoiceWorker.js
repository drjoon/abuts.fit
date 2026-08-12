// related files:
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/server.js
import {
  generateMonthlyLabToPracticeInvoiceDrafts,
  resolvePreviousKstMonthRange,
} from "../services/practiceLabInvoice.service.js";

let timerHandle = null;
let running = false;
let lastRunKey = "";

function getKstParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

async function tick() {
  const { year, month, day } = getKstParts();
  const runDay = Math.max(
    1,
    Math.min(28, Number(process.env.PRACTICE_LAB_INVOICE_DAY_OF_MONTH || 1)),
  );
  const key = `${year}-${month}`;
  if (Number(day) !== runDay || lastRunKey === key) return;
  const result = await generateMonthlyLabToPracticeInvoiceDrafts(
    resolvePreviousKstMonthRange(),
  );
  lastRunKey = key;
  console.log("[monthlyPracticeLabInvoice] completed", { key, ...result });
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[monthlyPracticeLabInvoice] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, 60 * 60 * 1000);
    timerHandle.unref?.();
  }
}

export function startMonthlyPracticeLabInvoiceWorker() {
  if (process.env.PRACTICE_LAB_INVOICE_WORKER_ENABLED === "false" || timerHandle) {
    return;
  }
  loop();
}
