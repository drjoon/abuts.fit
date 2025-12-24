import TaxInvoiceDraft from "../../shared/models/taxInvoiceDraft.model.js";
import JobLock from "../../shared/models/jobLock.model.js";
import { sendTaxInvoiceDraft } from "../services/hometaxClient.js";

const status = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastProcessed: 0,
};

export function getTaxInvoiceBatchStatus() {
  return { ...status };
}

function toKstYmd(date) {
  const d = date ? new Date(date) : new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function nextNoonKstMs(fromMs = Date.now()) {
  const now = new Date(fromMs);
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const y = kst.getUTCFullYear();
  const mo = kst.getUTCMonth();
  const da = kst.getUTCDate();

  const noonKstUtcMs = Date.UTC(y, mo, da, 3, 0, 0); // KST 12:00 == UTC 03:00
  if (fromMs < noonKstUtcMs) return noonKstUtcMs;
  return Date.UTC(y, mo, da + 1, 3, 0, 0);
}

async function acquireJobLock({ key, ttlMs }) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);
  const owner = `${process.env.HOSTNAME || "unknown"}:${process.pid}`;

  await JobLock.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true });

  const res = await JobLock.updateOne(
    {
      key,
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil, owner, lastLockedAt: now } },
    { upsert: false }
  );

  return Boolean(res?.modifiedCount);
}

function canRetryNow({ attemptCount, lastAttemptAt, now, retryMinMinutes }) {
  const attempts = Math.max(0, Number(attemptCount || 0));
  const last = lastAttemptAt ? new Date(lastAttemptAt) : null;
  if (!last || Number.isNaN(last.getTime())) return true;
  const waitMs = Math.max(0, Number(retryMinMinutes || 0)) * 60_000;
  return now.getTime() - last.getTime() >= waitMs;
}

export async function runTaxInvoiceBatchOnce() {
  status.lastRunAt = new Date().toISOString();
  status.lastError = null;
  status.lastProcessed = 0;

  const now = new Date();
  const todayYmdKst = toKstYmd(now);

  const candidates = await TaxInvoiceDraft.find({
    status: { $in: ["APPROVED", "FAILED"] },
    approvedAt: { $ne: null },
    sentAt: null,
  })
    .sort({ approvedAt: 1, _id: 1 })
    .limit(500)
    .lean();

  let processed = 0;
  for (const d of candidates) {
    const approvedYmdKst = toKstYmd(d.approvedAt);
    if (approvedYmdKst >= todayYmdKst) continue; // 익일 처리

    const maxAttempts = Math.max(
      1,
      Number(process.env.TAX_INVOICE_BATCH_MAX_ATTEMPTS || 5)
    );
    const retryMinMinutes = Math.max(
      0,
      Number(process.env.TAX_INVOICE_BATCH_RETRY_MINUTES || 30)
    );

    const attemptCount = Math.max(0, Number(d.attemptCount || 0));
    if (attemptCount >= maxAttempts) continue;

    if (
      String(d.status) === "FAILED" &&
      !canRetryNow({
        attemptCount,
        lastAttemptAt: d.lastAttemptAt,
        now,
        retryMinMinutes,
      })
    ) {
      continue;
    }

    await TaxInvoiceDraft.updateOne(
      { _id: d._id, sentAt: null },
      { $set: { lastAttemptAt: new Date() }, $inc: { attemptCount: 1 } }
    );

    try {
      const { hometaxTrxId } = await sendTaxInvoiceDraft(d);

      await TaxInvoiceDraft.updateOne(
        { _id: d._id, sentAt: null },
        {
          $set: {
            status: "SENT",
            sentAt: new Date(),
            hometaxTrxId,
            failReason: null,
          },
        }
      );

      processed += 1;
    } catch (err) {
      await TaxInvoiceDraft.updateOne(
        { _id: d._id, sentAt: null },
        {
          $set: {
            status: "FAILED",
            failReason: String(err?.message || "send_failed"),
          },
        }
      );
    }
  }

  status.lastProcessed = processed;
  status.lastSuccessAt = new Date().toISOString();
  return { processed };
}

export function startTaxInvoiceBatchJobs() {
  const enabled = String(process.env.TAX_INVOICE_BATCH_ENABLED || "")
    .trim()
    .toLowerCase();
  if (enabled && enabled !== "true") return;

  const schedule = async () => {
    const delay = Math.max(1000, nextNoonKstMs(Date.now()) - Date.now());
    setTimeout(async () => {
      try {
        const ttlMs = Number(
          process.env.TAX_INVOICE_BATCH_LOCK_TTL_MS || 15 * 60_000
        );
        const lockOk = await acquireJobLock({
          key: "taxInvoiceBatch:noonKst",
          ttlMs: Number.isFinite(ttlMs) ? ttlMs : 15 * 60_000,
        });

        if (lockOk) {
          await runTaxInvoiceBatchOnce();
        }
      } catch (err) {
        status.lastError = { message: err?.message };
      }
      schedule();
    }, delay);
  };

  schedule();
}
