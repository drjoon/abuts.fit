// related files:
// - web/backend/rules.md
// - web/backend/models/creditLedger.model.js
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/scripts/db/README.md
import { connectDb, disconnectDb, getDbNameFromMongoUri } from "./_mongo.js";
import CreditLedger from "../../models/creditLedger.model.js";

function parseArgs(argv) {
  const args = new Set((argv || []).slice(2));
  return {
    apply: args.has("--yes") || args.has("--apply"),
    verbose: args.has("--verbose"),
  };
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv);
  const { mongoUri } = await connectDb();

  try {
    const dbName = getDbNameFromMongoUri(mongoUri);
    const collection = CreditLedger.collection;

    const rows = await collection
      .find({ spentBonusAmount: { $exists: true } })
      .project({
        _id: 1,
        type: 1,
        amount: 1,
        spentPaidAmount: 1,
        spentBonusAmount: 1,
        spentFreeAmount: 1,
        uniqueKey: 1,
      })
      .toArray();

    console.log("[migrate-spent-bonus-to-spent-free] summary");
    console.log(
      JSON.stringify(
        {
          dbName,
          mode: apply ? "APPLY" : "DRY_RUN",
          targetRows: rows.length,
        },
        null,
        2,
      ),
    );

    if (verbose || !apply) {
      console.log(
        "[migrate-spent-bonus-to-spent-free] preview (max 20):\n" +
          JSON.stringify(
            rows.slice(0, 20).map((r) => ({
              _id: String(r?._id || ""),
              type: r?.type,
              amount: r?.amount,
              spentPaidAmount: r?.spentPaidAmount,
              spentBonusAmount: r?.spentBonusAmount,
              spentFreeAmount: r?.spentFreeAmount,
              uniqueKey: r?.uniqueKey,
            })),
            null,
            2,
          ),
      );
    }

    if (!apply) {
      console.log("[migrate-spent-bonus-to-spent-free] dry-run complete.");
      return;
    }

    let modified = 0;
    for (const row of rows) {
      const hasFree = row?.spentFreeAmount !== undefined;
      const freeValue = hasFree
        ? row.spentFreeAmount
        : row?.spentBonusAmount ?? null;

      const res = await collection.updateOne(
        { _id: row._id },
        {
          $set: { spentFreeAmount: freeValue },
          $unset: { spentBonusAmount: "" },
        },
      );
      modified += Number(res?.modifiedCount || 0);
    }

    const remain = await collection.countDocuments({
      spentBonusAmount: { $exists: true },
    });

    console.log(
      JSON.stringify(
        {
          applied: true,
          updatedRows: modified,
          expectedRows: rows.length,
          remainingRowsWithSpentBonusAmount: remain,
        },
        null,
        2,
      ),
    );
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  console.error("[migrate-spent-bonus-to-spent-free] failed", error);
  process.exit(1);
});
