// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - 2026-09-15: 후속 보철 hold-only → 기공소 ESCROW_RELEASE heal (리메이크 settle과 동일).
//
// Usage:
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/settle-unreleased-prosthesis-follow-ups.js
//
// Optional:
//   TRANSFER_ID=PTX-... node scripts/db/settle-unreleased-prosthesis-follow-ups.js

import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { settleUnreleasedProsthesisFollowUpsForTransfer } from "../../services/practiceTransferBilling.service.js";
import { practiceTransferNotDeletedMongoFilter } from "../../utils/practiceTransferStage.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

async function main() {
  await connectDb();
  const transferId = String(process.env.TRANSFER_ID || "").trim();
  const filter = {
    ...practiceTransferNotDeletedMongoFilter(),
    "billing.labSettledAt": { $exists: true, $ne: null },
    prosthesisFollowUps: { $exists: true, $ne: [] },
    ...(transferId ? { transferId } : {}),
  };

  const docs = await PracticeTransfer.find(filter)
    .select({
      transferId: 1,
      prosthesisFollowUps: 1,
      billing: 1,
      practiceBusinessAnchorId: 1,
      practiceUserId: 1,
      targetLabAnchorId: 1,
      matchingMode: 1,
      autoMatch: 1,
    })
    .lean();

  console.log(`[settle-follow-up] candidates=${docs.length}`);
  let released = 0;
  const labTouched = new Set();

  for (const doc of docs) {
    const results = await settleUnreleasedProsthesisFollowUpsForTransfer({
      transfer: doc,
      actorUserId: null,
    });
    const justReleased = results.filter((r) => r?.released);
    if (!justReleased.length) continue;

    const addNet = justReleased.reduce(
      (sum, r) =>
        sum + Math.max(0, Math.round(Number(r.labSettlementAmount || 0))),
      0,
    );
    if (addNet > 0) {
      await PracticeTransfer.updateOne(
        { _id: doc._id },
        {
          $inc: { "billing.labSettlementAmount": addNet },
        },
      );
    }

    released += justReleased.length;
    const labId = String(doc.targetLabAnchorId || "").trim();
    if (labId) labTouched.add(labId);
    console.log(
      `[settle-follow-up] ${doc.transferId} released=${justReleased.length} net=+${addNet}`,
    );
  }

  for (const labId of labTouched) {
    try {
      await emitCreditBalanceUpdatedToBusiness(labId);
    } catch {
      // best-effort
    }
  }

  console.log(`[settle-follow-up] done released=${released} labs=${labTouched.size}`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[settle-follow-up] FAILED", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
