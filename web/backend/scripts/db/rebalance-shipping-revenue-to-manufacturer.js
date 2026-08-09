// related files:
// - web/backend/rules.md
// - web/backend/scripts/db/_mongo.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/controllers/requests/common.review.helpers.js
import mongoose, { Types } from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";

// 면세 정책: 공급가 그대로 (VAT 가산 없음)
function withVat(base) {
  return Math.round(Number(base || 0));
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const out = {
    execute: args.includes("--yes"),
    allRequestors: args.includes("--all-requestors"),
    anchorId: "",
    businessName: "",
    limit: 0,
  };

  const anchorIdx = args.findIndex((a) => a === "--anchor");
  if (anchorIdx >= 0 && args[anchorIdx + 1]) out.anchorId = String(args[anchorIdx + 1]).trim();

  const nameIdx = args.findIndex((a) => a === "--business-name");
  if (nameIdx >= 0 && args[nameIdx + 1]) out.businessName = String(args[nameIdx + 1]).trim();

  const limitIdx = args.findIndex((a) => a === "--limit");
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    const n = Number(args[limitIdx + 1]);
    out.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  return out;
}

function toObjectId(raw) {
  const s = String(raw || "").trim();
  if (!s || !Types.ObjectId.isValid(s)) return null;
  return new Types.ObjectId(s);
}

async function resolveAnchorIds(cli) {
  if (cli.allRequestors) {
    const cursor = BusinessAnchor.find({ businessType: "requestor" }).select({ _id: 1 }).sort({ createdAt: -1 });
    if (cli.limit > 0) cursor.limit(cli.limit);
    const rows = await cursor.lean();
    return rows.map((r) => String(r._id));
  }

  if (cli.anchorId) {
    const id = toObjectId(cli.anchorId);
    if (!id) throw new Error(`invalid --anchor: ${cli.anchorId}`);
    return [String(id)];
  }

  if (cli.businessName) {
    const doc = await BusinessAnchor.findOne({
      $or: [{ name: cli.businessName }, { "metadata.companyName": cli.businessName }],
    })
      .select({ _id: 1 })
      .lean();
    return doc?._id ? [String(doc._id)] : [];
  }

  throw new Error("usage: --all-requestors [--limit N] [--yes] OR --anchor <id> [--yes] OR --business-name <name> [--yes]");
}

function detectPaidFreeFromRequestorLines(lines) {
  let paid = 0;
  let freeShipping = 0;
  for (const line of lines || []) {
    if (String(line?.ownerRole || "") !== "requestor") continue;
    const account = String(line?.accountCode || "");
    const base = Math.abs(Math.round(Number(line?.amountExcludingVat ?? line?.amount ?? 0)));
    if (base <= 0) continue;
    if (account === "REQ_PAID_CREDIT") paid += base;
    else if (account === "REQ_FREE_SHIPPING_CREDIT") freeShipping += base;
  }
  return { paid, freeShipping, total: paid + freeShipping };
}

function isAlreadyManufacturerFullRevenue(lines) {
  const revenueLines = (lines || []).filter((l) => String(l?.accountCode || "").startsWith("REV_"));
  if (!revenueLines.length) return false;
  return revenueLines.every((l) => String(l?.accountCode || "") === "REV_MANUFACTURER" && String(l?.ownerRole || "") === "manufacturer");
}

function buildRebalancedLines({ journal, currentLines, manufacturerOwnerId, paidBase, freeShippingBase }) {
  const nonRevenue = (currentLines || []).filter((l) => !String(l?.accountCode || "").startsWith("REV_"));

  const revenue = [];
  if (paidBase > 0) {
    const inc = withVat(paidBase);
    revenue.push({
      journalId: journal.journalId,
      businessAnchorId: journal.businessAnchorId,
      accountCode: "REV_MANUFACTURER",
      ownerRole: "manufacturer",
      ownerId: manufacturerOwnerId,
      amount: inc,
      amountExcludingVat: paidBase,
      vatAmount: inc - paidBase,
      amountIncludingVat: inc,
      creditKind: "PAID",
      occurredAt: journal.occurredAt || new Date(),
      refType: journal.refType || "",
      refId: journal.refId || null,
      meta: { rebalancedBy: "shipping_full_manufacturer_policy" },
    });
  }

  if (freeShippingBase > 0) {
    const inc = withVat(freeShippingBase);
    revenue.push({
      journalId: journal.journalId,
      businessAnchorId: journal.businessAnchorId,
      accountCode: "REV_MANUFACTURER",
      ownerRole: "manufacturer",
      ownerId: manufacturerOwnerId,
      amount: inc,
      amountExcludingVat: freeShippingBase,
      vatAmount: inc - freeShippingBase,
      amountIncludingVat: inc,
      creditKind: "FREE_SHIPPING",
      occurredAt: journal.occurredAt || new Date(),
      refType: journal.refType || "",
      refId: journal.refId || null,
      meta: { rebalancedBy: "shipping_full_manufacturer_policy" },
    });
  }

  const merged = [...nonRevenue, ...revenue].map((line, idx) => ({ ...line, lineNo: idx + 1 }));
  return merged;
}

async function run() {
  const cli = parseCliArgs(process.argv || []);
  console.log(`[rebalance-shipping-revenue] mode=${cli.execute ? "APPLY" : "DRY_RUN"}`);

  await connectDb();
  try {
    const anchorIds = await resolveAnchorIds(cli);
    const anchorObjectIds = anchorIds.map((id) => new Types.ObjectId(id));

    const journals = await LedgerJournal.find({
      businessAnchorId: { $in: anchorObjectIds },
      eventType: "SHIPPING_SPEND_COMMIT",
    })
      .select({ journalId: 1, businessAnchorId: 1, refType: 1, refId: 1, occurredAt: 1 })
      .lean();

    let scanned = 0;
    let already = 0;
    let rebalanced = 0;
    let skipped = 0;

    for (const journal of journals || []) {
      scanned += 1;
      const journalId = String(journal?.journalId || "");
      if (!journalId) {
        skipped += 1;
        continue;
      }

      const lines = await LedgerLine.find({ journalId }).sort({ lineNo: 1 }).lean();
      if (!lines.length) {
        skipped += 1;
        continue;
      }

      if (isAlreadyManufacturerFullRevenue(lines)) {
        already += 1;
        continue;
      }

      const manufacturerOwnerId = lines.find((l) => String(l?.ownerRole || "") === "manufacturer")?.ownerId || null;
      if (!manufacturerOwnerId || !Types.ObjectId.isValid(String(manufacturerOwnerId))) {
        skipped += 1;
        continue;
      }

      const split = detectPaidFreeFromRequestorLines(lines);
      if (split.total <= 0) {
        skipped += 1;
        continue;
      }

      const nextLines = buildRebalancedLines({
        journal,
        currentLines: lines,
        manufacturerOwnerId: new Types.ObjectId(String(manufacturerOwnerId)),
        paidBase: split.paid,
        freeShippingBase: split.freeShipping,
      });

      if (!cli.execute) continue;

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await LedgerLine.deleteMany({ journalId }, { session });
          await LedgerLine.insertMany(nextLines, { session, ordered: true });
        });
        rebalanced += 1;
      } finally {
        await session.endSession().catch(() => null);
      }
    }

    console.log("[rebalance-shipping-revenue] summary");
    console.log(`- anchors: ${anchorIds.length}`);
    console.log(`- journals_scanned: ${scanned}`);
    console.log(`- already_full_manufacturer: ${already}`);
    console.log(`- rebalanced: ${rebalanced}`);
    console.log(`- skipped: ${skipped}`);
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[rebalance-shipping-revenue] failed", error?.message || error);
  process.exit(1);
});
