// change-log:
// - 2026-09-23: FM덴탈 월정액 배송 결제일 도래 처리.
// related files:
// - web/backend/services/fmDentalShippingSubscription.service.js
// - web/backend/server.js
import { processDeliveryMonthlyCosts } from "../services/deliveryMonthlyCost.service.js";

let timerHandle = null;
let running = false;

const INTERVAL_MS = 60 * 60 * 1000;

async function tick() {
  // 2026-10-13: 딜러 거래처는 적립 차감 없음. 직판만 어벗츠 부담을 기록하고, 기존 딜러 차감 저널은 삭제.
  const result = await processDeliveryMonthlyCosts();
  if (result.posted) {
    console.log("[deliveryMonthlyCost] completed", result);
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
