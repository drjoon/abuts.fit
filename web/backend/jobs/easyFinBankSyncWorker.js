// related files:
// - web/backend/server.js
// - web/backend/services/easyFinBankSync.service.js
// change-log:
// - 2026-10-14: 팝빌 계좌조회 20분 주기. 운영에서만 자동 실행.
import mongoose from "mongoose";
import { syncEasyFinBankOnce } from "../services/easyFinBankSync.service.js";

const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.EASYFIN_BANK_SYNC_INTERVAL_MS) || 20 * 60_000,
);

let timer = null;
let running = false;

async function tick() {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const { snapshot } = await syncEasyFinBankOnce();
    const balance = snapshot?.balance;
    console.log(
      "[easyFinBank] synced",
      balance == null ? "balance=-" : `balance=${balance}`,
      `deposits=${snapshot?.depositCount ?? 0}`,
    );
  } catch (e) {
    if (e?.statusCode === 409) return;
    console.error("[easyFinBank]", e?.message || e);
  } finally {
    running = false;
  }
}

export function startEasyFinBankSyncWorker() {
  if (timer) return;
  if (process.env.EASYFIN_BANK_SYNC_ENABLED === "false") return;
  const prod = process.env.NODE_ENV === "production";
  const forced = process.env.EASYFIN_BANK_SYNC_ENABLED === "true";
  if (!prod && !forced) return;

  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  timer.unref?.();
  const first = setTimeout(() => {
    void tick();
  }, 60_000);
  first.unref?.();
  console.log(`[easyFinBank] worker started (${INTERVAL_MS}ms)`);
}
