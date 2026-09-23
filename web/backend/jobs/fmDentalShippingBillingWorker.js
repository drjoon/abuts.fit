// change-log:
// - 2026-09-23: FM덴탈 월정액 배송 결제일 도래 처리.
// related files:
// - web/backend/services/fmDentalShippingSubscription.service.js
// - web/backend/server.js
import { processDueFmDentalShippings } from "../services/fmDentalShippingSubscription.service.js";

let timerHandle = null;
let running = false;

const INTERVAL_MS = 60 * 60 * 1000;

async function tick() {
  const result = await processDueFmDentalShippings();
  if (result.due || result.backfilled || result.charged) {
    console.log("[fmDentalShippingBilling] completed", result);
  }
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (error) {
    console.error("[fmDentalShippingBilling] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
    timerHandle.unref?.();
  }
}

export function startFmDentalShippingBillingWorker() {
  if (
    process.env.FM_DENTAL_SHIPPING_BILLING_WORKER_ENABLED === "false" ||
    timerHandle
  ) {
    return;
  }
  loop();
}
