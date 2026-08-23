// change-log:
// - 2026-08-23: 고객향 월합 (세금)계산서 크론 (KST 매월 1일 전월분).
// related files:
// - web/backend/services/customerMonthlyInvoice.service.js
// - web/backend/server.js
import {
  generateMonthlyCustomerInvoiceDrafts,
  resolvePreviousKstMonthRange,
} from "../services/customerMonthlyInvoice.service.js";

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
    Math.min(28, Number(process.env.CUSTOMER_INVOICE_DAY_OF_MONTH || 1)),
  );
  const key = `${year}-${month}`;
  if (Number(day) !== runDay || lastRunKey === key) return;
  const result = await generateMonthlyCustomerInvoiceDrafts(
    resolvePreviousKstMonthRange(),
  );
  lastRunKey = key;
  console.log("[monthlyCustomerInvoice] completed", { key, ...result });
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[monthlyCustomerInvoice] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, 60 * 60 * 1000);
    timerHandle.unref?.();
  }
}

export function startMonthlyCustomerInvoiceWorker() {
  if (process.env.CUSTOMER_INVOICE_WORKER_ENABLED === "false" || timerHandle) {
    return;
  }
  loop();
}
