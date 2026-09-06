// related files:
// - web/backend/scripts/db/_mongo.js
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
// - 2026-09-06: 과세 REV 분할 라인 VAT 드리프트(+1원 등) 보정. 저널 단위 공급가 합×요율=VAT 합.
//
// dry-run:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/backfill-manufacturer-split-vat-drift.js
// apply:
//   ... node scripts/db/backfill-manufacturer-split-vat-drift.js --yes

import { connectDb, disconnectDb } from "./_mongo.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import {
  allocateAffiliateVatAcrossSupplyParts,
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
    `[backfill-manufacturer-split-vat-drift] mode=${cli.execute ? "APPLY" : "DRY_RUN"}`,
  );

  await connectDb();
  const settings = await loadCreditSettingsDefaults();
  const vatRate = normalizeAffiliateVatRate(
    settings?.affiliateVatRate ?? DEFAULT_AFFILIATE_VAT_RATE,
  );

  const groups = await LedgerLine.aggregate([
    {
      $match: {
        ownerRole: { $in: ["manufacturer", "salesman", "devops"] },
        accountCode: {
          $in: ["REV_MANUFACTURER", "REV_SALESMAN", "REV_DEVOPS"],
        },
      },
    },
    {
      $group: {
        _id: {
          journalId: "$journalId",
          ownerRole: "$ownerRole",
          accountCode: "$accountCode",
        },
        lines: {
          $push: {
            _id: "$_id",
            creditKind: "$creditKind",
            supply: { $ifNull: ["$amountExcludingVat", "$amount"] },
            vat: { $ifNull: ["$vatAmount", 0] },
            amount: "$amount",
            amountIncludingVat: "$amountIncludingVat",
          },
        },
        n: { $sum: 1 },
        supplySum: {
          $sum: { $ifNull: ["$amountExcludingVat", "$amount"] },
        },
        vatSum: { $sum: { $ifNull: ["$vatAmount", 0] } },
        totalSum: {
          $sum: {
            $ifNull: ["$amountIncludingVat", { $ifNull: ["$amount", 0] }],
          },
        },
      },
    },
    { $match: { n: { $gte: 2 } } },
  ]);

  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  const samples = [];

  for (const g of groups) {
    scanned += 1;
    const supplySum = Math.round(Number(g.supplySum || 0));
    if (supplySum <= 0) continue;
    const expectedVat = Math.round(supplySum * vatRate);
    const expectedTotal = supplySum + expectedVat;
    const vatSum = Math.round(Number(g.vatSum || 0));
    const totalSum = Math.round(Number(g.totalSum || 0));
    if (vatSum === expectedVat && totalSum === expectedTotal) continue;

    const allocated = allocateAffiliateVatAcrossSupplyParts(
      (g.lines || []).map((l) => ({
        supply: Math.round(Number(l.supply || 0)),
        creditKind: String(l.creditKind || "PAID"),
      })),
      vatRate,
    );
    const byKind = new Map(allocated.map((p) => [p.creditKind, p]));

    const patches = [];
    for (const line of g.lines || []) {
      const part = byKind.get(String(line.creditKind || "PAID"));
      if (!part) continue;
      const curVat = Math.round(Number(line.vat || 0));
      const curInc = Math.round(
        Number(line.amountIncludingVat ?? line.amount ?? 0),
      );
      if (curVat === part.vat && curInc === part.total) continue;
      patches.push({
        _id: line._id,
        amountExcludingVat: part.supply,
        vatAmount: part.vat,
        amountIncludingVat: part.total,
        amount: part.total,
      });
    }
    if (!patches.length) continue;

    wouldUpdate += patches.length;
    if (samples.length < 5) {
      samples.push({
        journalId: g._id.journalId,
        ownerRole: g._id.ownerRole,
        before: { supplySum, vatSum, totalSum },
        after: { supplySum, vat: expectedVat, total: expectedTotal },
        patches: patches.length,
      });
    }
    if (!cli.execute) continue;

    for (const p of patches) {
      await LedgerLine.updateOne(
        { _id: p._id },
        {
          $set: {
            amountExcludingVat: p.amountExcludingVat,
            vatAmount: p.vatAmount,
            amountIncludingVat: p.amountIncludingVat,
            amount: p.amount,
            "meta.backfilledBy": "manufacturer_split_vat_drift_v1",
          },
        },
      );
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      { vatRate, scanned, wouldUpdate, updated, samples },
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
    // ignore
  }
  process.exit(1);
});
