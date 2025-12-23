import TaxInvoiceDraft from "../../shared/models/taxInvoiceDraft.model.js";

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

async function mockSendToHometax(draft) {
  const id = `mock-hometax:${String(draft._id)}:${Date.now()}`;
  return { hometaxTrxId: id };
}

export async function runTaxInvoiceBatchOnce() {
  status.lastRunAt = new Date().toISOString();
  status.lastError = null;
  status.lastProcessed = 0;

  const now = new Date();
  const todayYmdKst = toKstYmd(now);

  const candidates = await TaxInvoiceDraft.find({
    status: "APPROVED",
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

    const { hometaxTrxId } = await mockSendToHometax(d);

    await TaxInvoiceDraft.updateOne(
      { _id: d._id, status: "APPROVED", sentAt: null },
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
        await runTaxInvoiceBatchOnce();
      } catch (err) {
        status.lastError = { message: err?.message };
      }
      schedule();
    }, delay);
  };

  schedule();
}
