// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/services/practiceTransferRemakeCharge.service.js
// - 2026-09-10: remake hold-only → 기공소 ESCROW_RELEASE heal.
//
// Usage:
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/settle-unreleased-remake-charges.js
//
// Optional:
//   TRANSFER_ID=PTX-... node scripts/db/settle-unreleased-remake-charges.js

import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { settleUnreleasedRemakeChargesForTransfer } from "../../services/practiceTransferRemakeCharge.service.js";
import { practiceTransferNotDeletedMongoFilter } from "../../utils/practiceTransferStage.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

async function main() {
  await connectDb();
  const transferId = String(process.env.TRANSFER_ID || "").trim();
  const filter = {
    ...practiceTransferNotDeletedMongoFilter(),
    remakeCharges: { $exists: true, $ne: [] },
    ...(transferId ? { transferId } : {}),
  };

  const docs = await PracticeTransfer.find(filter)
    .select({
      transferId: 1,
      remakeCharges: 1,
      billing: 1,
      practiceBusinessAnchorId: 1,
      practiceUserId: 1,
      targetLabAnchorId: 1,
      matchingMode: 1,
      autoMatch: 1,
    })
    .lean();

  console.log(`[settle-remake] candidates=${docs.length}`);
  let released = 0;
  const labTouched = new Set();

  for (const doc of docs) {
    const results = await settleUnreleasedRemakeChargesForTransfer({
      transfer: doc,
      actorUserId: null,
    });
    const justReleased = results.filter((r) => r?.released);
    if (!justReleased.length) continue;

    const addNet = justReleased.reduce(
      (sum, r) => sum + Math.max(0, Math.round(Number(r.labSettlementAmount || 0))),
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
      `[settle-remake] ${doc.transferId} released=${justReleased.length} net=+${addNet}`,
    );
  }

  for (const labId of labTouched) {
    try {
      await emitCreditBalanceUpdatedToBusiness(labId);
    } catch {
      // best-effort
    }
  }

  console.log(`[settle-remake] done released=${released} labs=${labTouched.size}`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
