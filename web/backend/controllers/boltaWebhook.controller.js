import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";

function normalizeSecret(req) {
  return (
    req.headers["x-bolta-webhook-secret"] ||
    req.headers["bolta-webhook-secret"] ||
    req.headers["x-webhook-secret"] ||
    req.body?.secret ||
    ""
  );
}

export async function receiveBoltaTaxInvoiceWebhook(req, res) {
  try {
    const expectedSecret = process.env.BOLTA_WEBHOOK_SECRET;
    if (expectedSecret) {
      const incoming = String(normalizeSecret(req) || "").trim();
      if (!incoming || incoming !== expectedSecret) {
        return res
          .status(401)
          .json({ success: false, message: "unauthorized" });
      }
    }

    const eventType = String(req.body?.eventType || "").trim();
    const issuanceKey = String(req.body?.data?.issuanceKey || "").trim();
    if (!eventType || !issuanceKey) {
      return res
        .status(400)
        .json({ success: false, message: "invalid_payload" });
    }

    if (eventType === "TAX_INVOICE_ISSUANCE_SUCCESS") {
      const updated = await TaxInvoiceDraft.updateOne(
        { hometaxTrxId: issuanceKey },
        {
          $set: {
            status: "SENT",
            sentAt: new Date(),
            failReason: null,
          },
        }
      );

      if (!updated.modifiedCount) {
        return res
          .status(404)
          .json({ success: false, message: "draft_not_found" });
      }

      return res.json({ success: true });
    }

    if (eventType === "TAX_INVOICE_ISSUANCE_FAILURE") {
      const causeCode = String(req.body?.data?.cause?.code || "").trim();
      const causeMsg = String(req.body?.data?.cause?.message || "").trim();
      const failReason =
        [causeCode, causeMsg].filter(Boolean).join(": ") || null;

      const updated = await TaxInvoiceDraft.updateOne(
        { hometaxTrxId: issuanceKey },
        {
          $set: {
            status: "FAILED",
            failReason,
          },
        }
      );

      if (!updated.modifiedCount) {
        return res
          .status(404)
          .json({ success: false, message: "draft_not_found" });
      }

      return res.json({ success: true });
    }

    return res
      .status(400)
      .json({ success: false, message: "unsupported_event" });
  } catch (err) {
    console.error("[receiveBoltaTaxInvoiceWebhook] failed", err);
    return res.status(500).json({ success: false, message: "internal_error" });
  }
}
