// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";
import { emitCreditBalanceSnapshotToBusiness } from "../../utils/creditRealtime.js";

// Usage:
// node recompute-business-credit-snapshots.js
// This recomputes BusinessCreditBalance from SSOT General Ledger for each requestor BusinessAnchor
// and emits a realtime snapshot event "credit:balance-snapshot" to the business users.

async function run() {
  await connectDb();
  try {
    const anchors = await BusinessAnchor.find({})
      .select({ _id: 1, name: 1 })
      .lean();
    console.log(`[recompute-credit] anchors: ${anchors.length}`);

    for (const anchor of anchors) {
      const anchorId = anchor._id;
      const name = anchor.name || String(anchorId);
      const result = await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: anchorId,
      });
      console.log(
        `[recompute-credit] ${name} (${anchorId}) -> balance:${result.balance} paid:${result.paidCredit} bonus:${result.bonusRequestCredit} freeShip:${result.bonusShippingCredit}`,
      );

      // Emit realtime snapshot event so connected clients can refresh their UI.
      try {
        await emitCreditBalanceSnapshotToBusiness({
          businessAnchorId: anchorId,
          balance: result.balance,
          reason: "recompute_after_seed_cleanup",
        });
      } catch (err) {
        console.warn(
          `[recompute-credit] emit failed for ${anchorId}:`,
          err.message || err,
        );
      }
    }

    console.log("[recompute-credit] done");
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[recompute-credit] failed", err);
  process.exit(1);
});
