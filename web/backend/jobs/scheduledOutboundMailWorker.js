// related files:
// - web/backend/server.js
// - web/backend/services/outboundMailRecord.service.js
import mongoose from "mongoose";
import { processDueScheduledOutboundMails } from "../services/outboundMailRecord.service.js";

const INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.SCHEDULED_MAIL_SEND_INTERVAL_MS) || 60_000,
);

let timer = null;
let running = false;

async function tick() {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const { scanned, sentCount } = await processDueScheduledOutboundMails();
    if (sentCount > 0) {
      console.log(
        `[scheduledOutboundMail] sent=${sentCount} scanned=${scanned}`,
      );
    }
  } catch (e) {
    console.error("[scheduledOutboundMail]", e?.message || e);
  } finally {
    running = false;
  }
}

export function startScheduledOutboundMailWorker() {
  if (timer) return;
  if (process.env.SCHEDULED_MAIL_SEND_ENABLED === "false") return;

  void tick();
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  timer.unref?.();
  console.log(`[scheduledOutboundMail] worker started (${INTERVAL_MS}ms)`);
}

export async function runScheduledOutboundMailOnceForTests() {
  return processDueScheduledOutboundMails();
}
