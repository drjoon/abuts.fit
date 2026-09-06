// related files:
// - web/backend/scripts/db/_mongo.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/services/settlement.service.js
// change-log:
// - 2026-09-06: 미지급 REV_SALESMAN/REV_DEVOPS earn에 VAT 백필(포함가 장부 SSOT).
//
// dry-run:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/backfill-affiliate-earn-vat-inclusive.js
// apply:
//   ... node scripts/db/backfill-affiliate-earn-vat-inclusive.js --yes

import { connectDb, disconnectDb } from "./_mongo.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import {
  DEFAULT_AFFILIATE_VAT_RATE,
  normalizeAffiliateVatRate,
} from "../../services/creditRevenuePolicy.service.js";
import { loadCreditSettingsDefaults } from "../../utils/creditSettingsDefaults.js";

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  return { execute: args.includes("--yes") };
}

async function run() {
  const cli = parseCliArgs(process.argv || []);
  console.log(
    `[backfill-affiliate-earn-vat-inclusive] mode=${cli.execute ? "APPLY" : "DRY_RUN"}`,
  );

  await connectDb();
  const settings = await loadCreditSettingsDefaults();
  const vatRate = normalizeAffiliateVatRate(
    settings?.affiliateVatRate ?? DEFAULT_AFFILIATE_VAT_RATE,
  );

  const payoutJournalIds = await LedgerJournal.distinct("journalId", {
    eventType: "SETTLEMENT_PAYOUT",
  });
  const payoutJournalSet = new Set(
    (payoutJournalIds || []).map((id) => String(id || "")).filter(Boolean),
  );

  const cursor = LedgerLine.find({
    accountCode: { $in: ["REV_SALESMAN", "REV_DEVOPS"] },
    ownerRole: { $in: ["salesman", "devops"] },
    $or: [{ vatAmount: { $exists: false } }, { vatAmount: 0 }, { vatAmount: null }],
  }).cursor();

  let scanned = 0;
  let skippedPayout = 0;
  let skippedZero = 0;
  let wouldUpdate = 0;
  let updated = 0;

  for await (const line of cursor) {
    scanned += 1;
    const journalId = String(line.journalId || "");
    if (journalId && payoutJournalSet.has(journalId)) {
      skippedPayout += 1;
      continue;
    }

    const supply = Math.round(
      Number(
        line.amountExcludingVat ??
          (Number(line.vatAmount || 0) === 0 ? line.amount : 0) ??
          0,
      ) || 0,
    );
    if (supply === 0) {
      skippedZero += 1;
      continue;
    }

    const vat = Math.round(Math.abs(supply) * vatRate) * Math.sign(supply || 1);
    const total = supply + vat;
    const currentVat = Math.round(Number(line.vatAmount || 0));
    const currentInc = Math.round(
      Number(line.amountIncludingVat ?? line.amount ?? supply),
    );
    if (currentVat === vat && currentInc === total && Number(line.amount) === total) {
      continue;
    }

    wouldUpdate += 1;
    if (!cli.execute) continue;

    await LedgerLine.updateOne(
      { _id: line._id },
      {
        $set: {
          amountExcludingVat: supply,
          vatAmount: vat,
          amountIncludingVat: total,
          amount: total,
          "meta.backfilledBy": "affiliate_earn_vat_inclusive_v1",
        },
      },
    );
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        vatRate,
        scanned,
        skippedPayout,
        skippedZero,
        wouldUpdate,
        updated,
      },
      null,
      2,
    ),
  );

  await disconnectDb();
}

run().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
