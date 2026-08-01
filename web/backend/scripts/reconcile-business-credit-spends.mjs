#!/usr/bin/env node
// related files:
// - web/backend/rules.md
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/services/creditBalance.service.js
import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import BusinessAnchor from "../models/businessAnchor.model.js";
import BusinessCreditBalance from "../models/businessCreditBalance.model.js";
import {
  computeBusinessCreditBalanceFromLedger,
  upsertBusinessCreditBalanceFromLedger,
} from "../services/creditBalance.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../local.env") });

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    execute: false,
    allRequestors: false,
    anchorId: "",
    businessName: "",
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i] || "").trim();
    if (token === "--execute") {
      out.execute = true;
      continue;
    }
    if (token === "--all-requestors") {
      out.allRequestors = true;
      continue;
    }
    if (token === "--anchor-id") {
      out.anchorId = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--business-name") {
      out.businessName = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
  }

  return out;
}

function toObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

async function resolveAnchors(opts) {
  if (opts.allRequestors) {
    return BusinessAnchor.find({ businessType: "requestor" })
      .select({ _id: 1, name: 1, businessType: 1 })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (opts.anchorId) {
    const anchorObjectId = toObjectId(opts.anchorId);
    if (!anchorObjectId) throw new Error(`Invalid --anchor-id: ${opts.anchorId}`);

    const anchor = await BusinessAnchor.findById(anchorObjectId)
      .select({ _id: 1, name: 1, businessType: 1 })
      .lean();
    return anchor ? [anchor] : [];
  }

  if (opts.businessName) {
    const anchor = await BusinessAnchor.findOne({
      $or: [{ name: opts.businessName }, { "metadata.companyName": opts.businessName }],
    })
      .sort({ createdAt: -1 })
      .select({ _id: 1, name: 1, businessType: 1 })
      .lean();
    return anchor ? [anchor] : [];
  }

  throw new Error(
    "Usage: node scripts/reconcile-business-credit-spends.mjs --all-requestors [--execute] OR --anchor-id <id> [--execute] OR --business-name <name> [--execute]",
  );
}

function asNumber(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toDiff(current, recomputed) {
  return {
    paid: asNumber(recomputed.paidCredit) - asNumber(current.paidCredit),
    freeRequest:
      asNumber(recomputed.freeRequestCredit) - asNumber(current.freeRequestCredit),
    freeShipping:
      asNumber(recomputed.freeShippingCredit) - asNumber(current.freeShippingCredit),
    balance: asNumber(recomputed.balance) - asNumber(current.balance),
  };
}

function hasDiff(diff) {
  return diff.paid !== 0 || diff.freeRequest !== 0 || diff.freeShipping !== 0 || diff.balance !== 0;
}

async function reconcileAnchor(anchor, { execute }) {
  const anchorId = String(anchor?._id || "").trim();
  if (!anchorId) {
    return { changed: false, updated: false, error: "invalid_anchor" };
  }

  const [currentDoc, recomputed] = await Promise.all([
    BusinessCreditBalance.findOne({ businessAnchorId: anchorId })
      .select({
        businessAnchorId: 1,
        paidCredit: 1,
        freeRequestCredit: 1,
        freeShippingCredit: 1,
        balance: 1,
      })
      .lean(),
    computeBusinessCreditBalanceFromLedger({ businessAnchorId: anchorId }),
  ]);

  const current = {
    paidCredit: asNumber(currentDoc?.paidCredit),
    freeRequestCredit: asNumber(currentDoc?.freeRequestCredit),
    freeShippingCredit: asNumber(currentDoc?.freeShippingCredit),
    balance: asNumber(currentDoc?.balance),
  };

  const snapshot = {
    paidCredit: asNumber(recomputed?.paidCredit),
    freeRequestCredit: asNumber(recomputed?.freeRequestCredit),
    freeShippingCredit: asNumber(recomputed?.freeShippingCredit),
    balance: asNumber(recomputed?.balance),
  };

  const diff = toDiff(current, snapshot);
  const changed = hasDiff(diff);

  if (execute && changed) {
    await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: anchorId });
  }

  return {
    changed,
    updated: Boolean(execute && changed),
    current,
    snapshot,
    diff,
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;
  if (!uri) {
    throw new Error("MONGODB_URI_TEST (or MONGO_URI_TEST) is required");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  try {
    const anchors = await resolveAnchors(opts);
    if (!anchors.length) {
      console.log("No anchors found.");
      return;
    }

    let changedCount = 0;
    let updatedCount = 0;

    console.log(
      `Mode: ${opts.execute ? "EXECUTE (upsert snapshots)" : "DRY RUN"} | anchors=${anchors.length}`,
    );

    for (const anchor of anchors) {
      const result = await reconcileAnchor(anchor, { execute: opts.execute });
      const name = String(anchor?.name || "").trim() || "(no-name)";
      const anchorId = String(anchor?._id || "");

      if (result.changed) changedCount += 1;
      if (result.updated) updatedCount += 1;

      const marker = result.changed ? (result.updated ? "UPDATED" : "DIFF") : "OK";
      console.log(
        `[${marker}] ${name} (${anchorId}) | paid ${result.current.paidCredit} -> ${result.snapshot.paidCredit} | freeReq ${result.current.freeRequestCredit} -> ${result.snapshot.freeRequestCredit} | freeShip ${result.current.freeShippingCredit} -> ${result.snapshot.freeShippingCredit} | balance ${result.current.balance} -> ${result.snapshot.balance}`,
      );
    }

    console.log("\nSummary");
    console.log(`- scanned: ${anchors.length}`);
    console.log(`- changed: ${changedCount}`);
    console.log(`- updated: ${updatedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
