import CreditOrder from "../models/creditOrder.model.js";

function parseDueDate(dueDate) {
  const raw = String(dueDate || "").trim();
  if (!raw) return null;

  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) return asDate;

  return null;
}

export async function expireCreditOrdersOnce() {
  const now = new Date();

  const candidates = await CreditOrder.find({
    status: "WAITING_FOR_DEPOSIT",
    "virtualAccount.dueDate": { $ne: "" },
  })
    .select({ _id: 1, virtualAccount: 1 })
    .lean();

  if (!candidates.length) return { scanned: 0, expired: 0 };

  const expiredIds = [];
  for (const c of candidates) {
    const due = parseDueDate(c?.virtualAccount?.dueDate);
    if (!due) continue;
    if (now.getTime() > due.getTime()) expiredIds.push(c._id);
  }

  if (!expiredIds.length) return { scanned: candidates.length, expired: 0 };

  const result = await CreditOrder.updateMany(
    { _id: { $in: expiredIds }, status: "WAITING_FOR_DEPOSIT" },
    { $set: { status: "EXPIRED" } }
  );

  return {
    scanned: candidates.length,
    expired: result?.modifiedCount || 0,
  };
}

export function startCreditJobs() {
  const intervalMs = Number(
    process.env.CREDIT_EXPIRE_JOB_INTERVAL_MS || 60_000
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 10_000) {
    return;
  }

  const run = async () => {
    try {
      await expireCreditOrdersOnce();
    } catch {
      // ignore
    }
  };

  run();
  setInterval(run, intervalMs);
}
