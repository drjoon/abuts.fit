#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import CreditLedger from "../models/creditLedger.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";
import Request from "../models/request.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../local.env") });

function parseArgs(argv) {
  const set = new Set(argv.slice(2));
  return {
    execute: set.has("--execute"),
    dryRun: !set.has("--execute"),
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv);

  const uri = process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;
  if (!uri) {
    throw new Error("MONGODB_URI_TEST (or MONGO_URI_TEST) is required");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  try {
    const targets = await CreditLedger.find({
      type: "SPEND",
      refType: { $in: ["SHIPPING_PACKAGE", "SHIPPING_FEE"] },
      $or: [{ hasFreeRequest: { $exists: false } }, { hasFreeRequest: null }],
    })
      .select({ _id: 1, refType: 1, refId: 1, uniqueKey: 1, hasFreeRequest: 1 })
      .lean();

    const packageIds = Array.from(
      new Set(
        targets.map((r) => (r?.refId ? String(r.refId) : "")).filter(Boolean),
      ),
    );

    const packages = packageIds.length
      ? await ShippingPackage.find({ _id: { $in: packageIds } })
          .select({ _id: 1, requestIds: 1 })
          .lean()
      : [];

    const packageById = new Map(packages.map((p) => [String(p._id), p]));

    const requestIds = Array.from(
      new Set(
        packages
          .flatMap((p) => (Array.isArray(p?.requestIds) ? p.requestIds : []))
          .map((id) => String(id))
          .filter(Boolean),
      ),
    );

    const freeRequests = requestIds.length
      ? await Request.find({
          _id: { $in: requestIds },
          "caseInfos.newSystemRequest.requested": true,
          "caseInfos.newSystemRequest.free": true,
        })
          .select({ _id: 1 })
          .lean()
      : [];

    const freeRequestIdSet = new Set(freeRequests.map((r) => String(r._id)));

    const updates = [];
    let missingPackageCount = 0;
    let resolvedTrue = 0;
    let resolvedFalse = 0;

    for (const row of targets) {
      const pkgId = row?.refId ? String(row.refId) : "";
      const pkg = pkgId ? packageById.get(pkgId) : null;

      let hasFreeRequest = false;
      if (!pkg) {
        missingPackageCount += 1;
      } else {
        const reqIds = (pkg?.requestIds || []).map((id) => String(id));
        hasFreeRequest = reqIds.some((id) => freeRequestIdSet.has(id));
      }

      if (hasFreeRequest) resolvedTrue += 1;
      else resolvedFalse += 1;

      updates.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { hasFreeRequest } },
        },
      });
    }

    console.log("=== backfill shipping hasFreeRequest ===");
    console.log(`mode=${dryRun ? "dry-run" : "execute"}`);
    console.log(`targets=${targets.length}`);
    console.log(`packageIds=${packageIds.length}`);
    console.log(`missingPackageCount=${missingPackageCount}`);
    console.log(`setTrue=${resolvedTrue}`);
    console.log(`setFalse=${resolvedFalse}`);

    if (dryRun || updates.length === 0) {
      console.log("no write executed");
      return;
    }

    const result = await CreditLedger.bulkWrite(updates, { ordered: false });
    console.log(`matched=${result.matchedCount || 0}`);
    console.log(`modified=${result.modifiedCount || 0}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
