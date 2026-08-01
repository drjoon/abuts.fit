// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { connectDb, disconnectDb } from "./_mongo.js";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";

// Usage:
// node cleanup-freecreditgrant-ledger-refs.js --yes
// Without --yes it's a dry-run that lists problematic FreeCreditGrant docs.

function parseArgs() {
  const args = process.argv.slice(2);
  const yes = args.includes("--yes");
  return { yes };
}

async function run() {
  const { yes } = parseArgs();
  await connectDb();
  try {
    console.log(`[cleanup-freecreditgrant] start. willApply: ${yes}`);

    // Find FreeCreditGrant docs that reference non-existent LedgerJournal in grantJournalId/cancelJournalId
    const grants = await FreeCreditGrant.find({
      $or: [{ grantJournalId: { $ne: null } }, { cancelJournalId: { $ne: null } }],
    })
      .select({ _id: 1, type: 1, businessNumber: 1, businessAnchorId: 1, grantJournalId: 1, cancelJournalId: 1 })
      .lean();

    const missing = [];
    for (const g of grants || []) {
      const checks = [];
      if (g.grantJournalId) checks.push({ field: "grantJournalId", id: g.grantJournalId });
      if (g.cancelJournalId) checks.push({ field: "cancelJournalId", id: g.cancelJournalId });

      let hasMissing = false;
      for (const c of checks) {
        const exists = await LedgerJournal.exists({ journalId: String(c.id) });
        if (!exists) {
          missing.push({ grant: g, field: c.field, id: c.id });
          hasMissing = true;
        }
      }
    }

    console.log(`[cleanup-freecreditgrant] found ${missing.length} broken references in FreeCreditGrant`);
    if (missing.length > 0) {
      for (const m of missing) {
        console.log(`  - grantId:${m.grant._id} field:${m.field} ref:${m.id}`);
      }
    }

    if (!yes) {
      console.log("[cleanup-freecreditgrant] dry-run completed. Rerun with --yes to apply fixes.");
      return;
    }

    // Apply fixes: set referenced fields to null where referenced LedgerJournal doesn't exist
    let fixed = 0;
    for (const m of missing) {
      const update = {};
      update[m.field] = null;
      const r = await FreeCreditGrant.updateOne({ _id: m.grant._id }, { $set: update });
      if (r && r.modifiedCount) fixed += 1;
    }

    console.log(`[cleanup-freecreditgrant] fixed ${fixed} fields`);
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[cleanup-freecreditgrant] failed", err);
  process.exit(1);
});
