import { connectDb, disconnectDb } from "./_mongo.js";
import BonusGrant from "../../models/bonusGrant.model.js";
import CreditLedger from "../../models/creditLedger.model.js";

// Usage:
// node cleanup-bonusgrant-ledger-refs.js --yes
// Without --yes it's a dry-run that lists problematic BonusGrant docs.

function parseArgs() {
  const args = process.argv.slice(2);
  const yes = args.includes("--yes");
  return { yes };
}

async function run() {
  const { yes } = parseArgs();
  await connectDb();
  try {
    console.log(`[cleanup-bonusgrant] start. willApply: ${yes}`);

    // Find BonusGrant docs that reference non-existent CreditLedger in creditLedgerId or cancelCreditLedgerId
    const grants = await BonusGrant.find({
      $or: [{ creditLedgerId: { $ne: null } }, { cancelCreditLedgerId: { $ne: null } }],
    })
      .select({ _id: 1, type: 1, businessNumber: 1, businessAnchorId: 1, creditLedgerId: 1, cancelCreditLedgerId: 1 })
      .lean();

    const missing = [];
    for (const g of grants || []) {
      const checks = [];
      if (g.creditLedgerId) checks.push({ field: "creditLedgerId", id: g.creditLedgerId });
      if (g.cancelCreditLedgerId) checks.push({ field: "cancelCreditLedgerId", id: g.cancelCreditLedgerId });

      let hasMissing = false;
      for (const c of checks) {
        const exists = await CreditLedger.exists({ _id: c.id });
        if (!exists) {
          missing.push({ grant: g, field: c.field, id: c.id });
          hasMissing = true;
        }
      }
    }

    console.log(`[cleanup-bonusgrant] found ${missing.length} broken references in BonusGrant`);
    if (missing.length > 0) {
      for (const m of missing) {
        console.log(`  - grantId:${m.grant._id} field:${m.field} ref:${m.id}`);
      }
    }

    if (!yes) {
      console.log("[cleanup-bonusgrant] dry-run completed. Rerun with --yes to apply fixes.");
      return;
    }

    // Apply fixes: set referenced fields to null where referenced CreditLedger doesn't exist
    let fixed = 0;
    for (const m of missing) {
      const update = {};
      update[m.field] = null;
      const r = await BonusGrant.updateOne({ _id: m.grant._id }, { $set: update });
      if (r && r.modifiedCount) fixed += 1;
    }

    console.log(`[cleanup-bonusgrant] fixed ${fixed} fields`);
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[cleanup-bonusgrant] failed", err);
  process.exit(1);
});
