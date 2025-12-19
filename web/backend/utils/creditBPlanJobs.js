import ChargeOrder from "../models/chargeOrder.model.js";
import { autoMatchBankTransactionsOnce } from "./creditBPlanMatching.js";

export async function expireChargeOrdersOnce() {
  const now = new Date();
  const result = await ChargeOrder.updateMany(
    { status: "PENDING", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED" } }
  );

  return { expired: result?.modifiedCount || 0 };
}

export async function runCreditBPlanOnce() {
  const expire = await expireChargeOrdersOnce();
  const match = await autoMatchBankTransactionsOnce();
  return { expire, match };
}

export function startCreditBPlanJobs() {
  const intervalMs = Number(
    process.env.CREDIT_B_PLAN_JOB_INTERVAL_MS || 30 * 60_000
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 10_000) {
    return;
  }

  const run = async () => {
    try {
      await runCreditBPlanOnce();
    } catch {}
  };

  run();
  setInterval(run, intervalMs);
}
