// related files:
// - web/backend/rules.md
// - web/backend/scripts/db/_mongo.js
// - web/backend/services/creditBalance.service.js
// - web/backend/models/businessCreditBalance.model.js
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  computeBusinessCreditBalanceFromLedger,
  upsertBusinessCreditBalanceFromLedger,
} from "../../services/creditBalance.service.js";

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const hasYes = args.includes("--yes");

  const anchorFlagIndex = args.findIndex((arg) => arg === "--anchor");
  let anchorId = "";
  if (anchorFlagIndex >= 0 && args[anchorFlagIndex + 1]) {
    anchorId = String(args[anchorFlagIndex + 1] || "").trim();
  }

  return {
    yes: hasYes,
    anchorId,
  };
}

async function run() {
  const cli = parseCliArgs(process.argv || []);

  if (!cli.yes) {
    console.log(
      "[backfill-business-credit-balances] dry-run mode. Add --yes to apply.",
    );
  }

  await connectDb();

  try {
    const query = cli.anchorId ? { _id: cli.anchorId } : {};
    const anchors = await BusinessAnchor.find(query)
      .select({ _id: 1, businessType: 1, name: 1, status: 1 })
      .lean();

    console.log(
      `[backfill-business-credit-balances] targets=${anchors.length} anchor=${cli.anchorId || "ALL"}`,
    );

    let updatedCount = 0;
    let skippedCount = 0;

    for (const anchor of anchors) {
      const anchorId = String(anchor?._id || "").trim();
      if (!anchorId) {
        skippedCount += 1;
        continue;
      }

      const snapshot = cli.yes
        ? await upsertBusinessCreditBalanceFromLedger({
            businessAnchorId: anchorId,
          })
        : await computeBusinessCreditBalanceFromLedger({
            businessAnchorId: anchorId,
          });

      if (!cli.yes) {
        console.log(
          "[backfill-business-credit-balances][dry-run]",
          JSON.stringify(
            {
              anchorId,
              businessType: anchor?.businessType || null,
              name: anchor?.name || "",
              status: anchor?.status || "",
              paidCredit: snapshot.paidCredit,
              freeRequestCredit: snapshot.freeRequestCredit,
              freeShippingCredit: snapshot.freeShippingCredit,
              balance: snapshot.balance,
            },
            null,
            2,
          ),
        );
        continue;
      }

      updatedCount += 1;
      console.log(
        "[backfill-business-credit-balances][applied]",
        JSON.stringify(
          {
            anchorId,
            businessType: anchor?.businessType || null,
            name: anchor?.name || "",
            status: anchor?.status || "",
            paidCredit: snapshot.paidCredit,
            freeRequestCredit: snapshot.freeRequestCredit,
            freeShippingCredit: snapshot.freeShippingCredit,
            balance: snapshot.balance,
          },
          null,
          2,
        ),
      );
    }

    console.log(
      `[backfill-business-credit-balances] done updated=${updatedCount} skipped=${skippedCount} mode=${cli.yes ? "apply" : "dry-run"}`,
    );
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[backfill-business-credit-balances] failed", error);
  process.exit(1);
});
