// related files:
// - web/backend/services/integrations/threeShape/syncLabInbox.js
// - web/backend/server.js
import { syncAllConnectedThreeShapeInboxes } from "./syncLabInbox.js";

let _interval = null;
let _running = false;

function isEnabled() {
  const raw = String(process.env.THREE_SHAPE_SYNC_ENABLED || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function intervalMs() {
  const n = Number(process.env.THREE_SHAPE_SYNC_INTERVAL_MS || 300000);
  if (!Number.isFinite(n) || n < 60_000) return 300_000;
  return Math.floor(n);
}

async function tick() {
  if (_running) return;
  _running = true;
  try {
    const results = await syncAllConnectedThreeShapeInboxes();
    const imported = results.reduce(
      (sum, r) => sum + Number(r?.imported || 0),
      0,
    );
    if (imported > 0) {
      console.log(`[3shape-sync] imported=${imported} labs=${results.length}`);
    }
  } catch (error) {
    console.error("[3shape-sync] tick failed:", error?.message || error);
  } finally {
    _running = false;
  }
}

export function startThreeShapeInboxSyncWorker() {
  if (_interval) return;
  if (!isEnabled()) {
    console.log("[3shape-sync] worker skipped (THREE_SHAPE_SYNC_ENABLED!=true)");
    return;
  }
  const ms = intervalMs();
  console.log(`[3shape-sync] worker start intervalMs=${ms}`);
  _interval = setInterval(() => {
    void tick();
  }, ms);
  // Avoid immediate burst on boot; first tick after one interval.
}

export function stopThreeShapeInboxSyncWorker() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
