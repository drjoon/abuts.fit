// related files:
// - web/backend/models/taxInvoiceDraft.model.js
// - web/backend/controllers/admin/adminTaxInvoice.controller.js
//
// Restore demo drafts that were wrongly downgraded SENT→CANCELLED.
// Keep originals as SENT and attach a separate REVERSE (minus) draft.
// Does NOT call Popbill (test docs already settled).
//
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/restore-tax-invoice-reverse-semantics.js
import { connectDb, disconnectDb } from "./_mongo.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";

async function main() {
  await connectDb();

  const cancelled = await TaxInvoiceDraft.find({
    status: "CANCELLED",
    $or: [{ kind: { $exists: false } }, { kind: "NORMAL" }, { kind: null }],
  }).lean();

  console.log(`[restore] CANCELLED NORMAL count=${cancelled.length}`);

  let restored = 0;
  let reversesCreated = 0;

  for (const draft of cancelled) {
    const id = draft._id;
    let reverseId = draft.reversedByDraftId || null;

    if (!reverseId) {
      const existingReverse = await TaxInvoiceDraft.findOne({
        kind: "REVERSE",
        reversesDraftId: id,
      }).lean();
      if (existingReverse) reverseId = existingReverse._id;
    }

    if (!reverseId) {
      const now = new Date();
      const reverse = await TaxInvoiceDraft.create({
        // chargeOrderId omitted — unique index; reverse is not charge-linked
        userId: draft.userId || null,
        businessAnchorId: draft.businessAnchorId || null,
        direction: draft.direction || "ABUTS_TO_CUSTOMER",
        issuanceMode: draft.issuanceMode || "SELF",
        taxType: draft.taxType === "과세" ? "과세" : "면세",
        kind: "REVERSE",
        reversesDraftId: id,
        modifyCode: "4",
        orgNtsConfirmNum: draft.ntsConfirmNum || draft.hometaxTrxId || null,
        sellerAnchorId: draft.sellerAnchorId || null,
        seller: draft.seller || undefined,
        writeDate: now.toISOString().slice(0, 10).replace(/-/g, ""),
        status: "SENT",
        approvedAt: draft.approvedAt || now,
        sentAt: now,
        supplyAmount: -Math.abs(Number(draft.supplyAmount) || 0),
        vatAmount: -Math.abs(Number(draft.vatAmount) || 0),
        totalAmount: -Math.abs(Number(draft.totalAmount) || 0),
        itemName: `${draft.itemName || "항목"} (마이너스)`,
        buyer: draft.buyer || {},
        sourceRefType: "TaxInvoiceDraft",
        sourceRefIds: [id],
        hometaxTrxId: draft.hometaxTrxId
          ? `R${String(draft.hometaxTrxId).slice(0, 23)}`
          : null,
        failReason:
          "demo reverse restore (DB only; Popbill already settled)",
      });
      reverseId = reverse._id;
      reversesCreated += 1;
      console.log(`[restore] created REVERSE ${reverseId} for ${id}`);
    }

    await TaxInvoiceDraft.updateOne(
      { _id: id },
      {
        $set: {
          status: "SENT",
          kind: "NORMAL",
          reversedByDraftId: reverseId,
          failReason: null,
        },
      },
    );
    restored += 1;
    console.log(`[restore] original ${id} -> SENT, reversedBy=${reverseId}`);
  }

  const norm = await TaxInvoiceDraft.updateMany(
    { $or: [{ kind: { $exists: false } }, { kind: null }] },
    { $set: { kind: "NORMAL" } },
  );

  const counts = await TaxInvoiceDraft.aggregate([
    {
      $group: {
        _id: { status: "$status", kind: { $ifNull: ["$kind", "NORMAL"] } },
        n: { $sum: 1 },
      },
    },
    { $sort: { "_id.status": 1, "_id.kind": 1 } },
  ]);

  console.log("[restore] done", {
    restored,
    reversesCreated,
    kindNormalized: norm.modifiedCount,
    counts,
  });

  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[restore] failed", err);
  try {
    await disconnectDb();
  } catch {}
  process.exit(1);
});
