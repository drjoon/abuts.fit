import ChargeOrder from "../models/chargeOrder.model.js";
import { autoMatchBankTransactionsOnce } from "../utils/creditBPlanMatching.js";

const status = {
  lastRunAt: null,
  lastExpire: null,
  lastMatch: null,
  lastError: null,
};

export function getCreditBPlanStatus() {
  return { ...status };
}

export async function expireChargeOrdersOnce() {
  const now = new Date();
  const result = await ChargeOrder.updateMany(
    { status: "PENDING", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED" } }
  );

  return { expired: result?.modifiedCount || 0 };
}

export async function runCreditBPlanOnce() {
  status.lastRunAt = new Date().toISOString();
  try {
    const expire = await expireChargeOrdersOnce();
    status.lastExpire = new Date().toISOString();

    const match = await autoMatchBankTransactionsOnce();
    status.lastMatch = new Date().toISOString();

    status.lastError = null;
    return { expire, match };
  } catch (err) {
    status.lastError = {
      message: err?.message,
    };
    throw err;
  }
}

export function startCreditBPlanJobs() {
  const enabled = String(process.env.CREDIT_B_PLAN_JOB_ENABLED || "")
    .trim()
    .toLowerCase();
  if (enabled && enabled !== "true") {
    return;
  }

  const intervalMs = Number(
    process.env.CREDIT_B_PLAN_JOB_INTERVAL_MS || 5 * 60_000
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 10_000) {
    return;
  }

  const run = async () => {
    try {
      await runCreditBPlanOnce();
    } catch (err) {
      // swallow to keep interval alive
    }
  };

  run();
  setInterval(run, intervalMs);
}
