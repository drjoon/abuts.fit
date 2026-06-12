#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import CreditLedger from "../models/creditLedger.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../local.env") });

function parseArgs(argv) {
  const set = new Set(argv.slice(2));
  return {
    dryRun: !set.has("--execute"),
  };
}

function isShippingRefType(refType) {
  const t = String(refType || "");
  return t === "SHIPPING_PACKAGE" || t === "SHIPPING_FEE";
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;
  if (!uri) throw new Error("MONGODB_URI_TEST (or MONGO_URI_TEST) is required");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  try {
    const anchors = await BusinessAnchor.find({}).select({ _id: 1, name: 1 }).lean();
    const plans = [];

    for (const anchor of anchors) {
      const rows = await CreditLedger.find({ businessAnchorId: anchor._id })
        .sort({ createdAt: 1, _id: 1 })
        .select({ type: 1, amount: 1, refType: 1, createdAt: 1 })
        .lean();

      if (!rows.length) continue;

      let paid = 0;
      let bonusRequest = 0;
      let bonusShipping = 0;
      let minTotal = 0;

      for (const row of rows) {
        const type = String(row?.type || "");
        const amount = Number(row?.amount || 0);
        const refType = String(row?.refType || "");
        if (!Number.isFinite(amount)) continue;

        const absAmount = Math.abs(amount);

        if (type === "CHARGE") paid += absAmount;
        else if (type === "BONUS") {
          if (refType === "FREE_SHIPPING_CREDIT") bonusShipping += absAmount;
          else bonusRequest += absAmount;
        } else if (type === "REFUND") paid += absAmount;
        else if (type === "ADJUST") paid += amount;
        else if (type === "SPEND") {
          let spend = absAmount;
          if (isShippingRefType(refType)) {
            const fromBonusShipping = Math.min(bonusShipping, spend);
            bonusShipping -= fromBonusShipping;
            spend -= fromBonusShipping;
          } else {
            const fromBonusRequest = Math.min(bonusRequest, spend);
            bonusRequest -= fromBonusRequest;
            spend -= fromBonusRequest;
          }
          paid -= spend;
        }

        const total = paid + bonusRequest + bonusShipping;
        if (total < minTotal) minTotal = total;
      }

      if (minTotal < 0) {
        const topup = Math.ceil(Math.abs(minTotal));
        const firstAt = new Date(rows[0].createdAt || new Date());
        const adjustAt = new Date(firstAt.getTime() - 1000);
        plans.push({
          businessAnchorId: String(anchor._id),
          anchorName: anchor.name,
          topup,
          adjustAt,
        });
      }
    }

    console.log("=== fix-credit-ledger-negative-balance ===");
    console.log(`mode=${dryRun ? "dry-run" : "execute"}`);
    console.log(`targets=${plans.length}`);
    console.log(JSON.stringify(plans, null, 2));

    if (dryRun || !plans.length) {
      console.log("no write executed");
      return;
    }

    const collection = mongoose.connection.collection("creditledgers");
    let inserted = 0;

    for (const plan of plans) {
      const uniqueKey = `integrity_topup:${plan.businessAnchorId}`;
      const exists = await collection.findOne({ uniqueKey }, { projection: { _id: 1 } });
      if (exists?._id) continue;

      await collection.insertOne({
        businessAnchorId: new mongoose.Types.ObjectId(plan.businessAnchorId),
        userId: null,
        type: "ADJUST",
        amount: plan.topup,
        refType: "INTEGRITY_RECONCILE",
        refId: new mongoose.Types.ObjectId(plan.businessAnchorId),
        uniqueKey,
        createdAt: plan.adjustAt,
        updatedAt: plan.adjustAt,
      });
      inserted += 1;
    }

    console.log(`inserted=${inserted}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
