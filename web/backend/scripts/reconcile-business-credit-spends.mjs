#!/usr/bin/env node
import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import BusinessAnchor from "../models/businessAnchor.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import Request from "../models/request.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../local.env") });

const DEFAULT_SHIPPING_FEE = 3500;
const REQUEST_SPEND_ELIGIBLE_STAGES = new Set([
  "가공",
  "세척.패킹",
  "포장.발송",
  "추적관리",
]);
const SHIPPING_SPEND_ELIGIBLE_STAGES = new Set(["포장.발송", "추적관리"]);

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

function isFreeByPolicy(reqDoc) {
  const priceAmount = Number(reqDoc?.price?.amount || 0);
  if (priceAmount <= 0) return true;

  const source = String(reqDoc?.source || "").trim().toLowerCase();
  if (source === "manufacturer_sample") return true;

  const rule = String(reqDoc?.price?.rule || "").trim().toLowerCase();
  if (rule === "manufacturer_sample") return true;

  const isNewSystemFree =
    reqDoc?.caseInfos?.newSystemRequest?.requested &&
    reqDoc?.caseInfos?.newSystemRequest?.free;
  if (isNewSystemFree) return true;

  return false;
}

function shouldBackfillRequestSpend(reqDoc) {
  const stage = String(reqDoc?.manufacturerStage || "").trim();
  return REQUEST_SPEND_ELIGIBLE_STAGES.has(stage);
}

function shouldBackfillShippingSpend(reqDoc) {
  const stage = String(reqDoc?.manufacturerStage || "").trim();
  return SHIPPING_SPEND_ELIGIBLE_STAGES.has(stage);
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

async function reconcileAnchor(anchor, { execute }) {
  const anchorId = new Types.ObjectId(String(anchor._id));

  const requests = await Request.find({
    businessAnchorId: anchorId,
    manufacturerStage: { $ne: "취소" },
  })
    .select({
      _id: 1,
      requestId: 1,
      requestor: 1,
      manufacturerStage: 1,
      shippingPackageId: 1,
      createdAt: 1,
      updatedAt: 1,
      price: 1,
      source: 1,
      caseInfos: 1,
    })
    .lean();

  const requestIds = requests.map((r) => r._id).filter(Boolean);
  const packageIds = requests
    .map((r) => r.shippingPackageId)
    .filter(Boolean)
    .map((id) => String(id));

  const [requestSpendRows, shippingSpendRows, packages] = await Promise.all([
    requestIds.length
      ? CreditLedger.find({
          businessAnchorId: anchorId,
          type: "SPEND",
          refType: "REQUEST",
          refId: { $in: requestIds },
        })
          .sort({ createdAt: 1, _id: 1 })
          .select({ _id: 1, refId: 1, amount: 1, hasFreeRequest: 1, uniqueKey: 1 })
          .lean()
      : [],
    packageIds.length
      ? CreditLedger.find({
          businessAnchorId: anchorId,
          type: "SPEND",
          refType: { $in: ["SHIPPING_PACKAGE", "SHIPPING_FEE"] },
          refId: { $in: packageIds },
        })
          .sort({ createdAt: 1, _id: 1 })
          .select({ _id: 1, refId: 1, amount: 1, uniqueKey: 1 })
          .lean()
      : [],
    packageIds.length
      ? ShippingPackage.find({ _id: { $in: packageIds } })
          .select({ _id: 1, shippingFeeSupply: 1, createdAt: 1 })
          .lean()
      : [],
  ]);

  const requestSpendsByRefId = new Map();
  for (const row of requestSpendRows) {
    const key = String(row?.refId || "");
    if (!key) continue;
    const arr = requestSpendsByRefId.get(key) || [];
    arr.push(row);
    requestSpendsByRefId.set(key, arr);
  }

  const shippingSpendsByPkgId = new Map();
  for (const row of shippingSpendRows) {
    const key = String(row?.refId || "");
    if (!key) continue;
    const arr = shippingSpendsByPkgId.get(key) || [];
    arr.push(row);
    shippingSpendsByPkgId.set(key, arr);
  }

  const packageById = new Map((packages || []).map((p) => [String(p._id), p]));

  const requestSpendCorrections = [];
  const requestSpendInsertions = [];
  const shippingSpendInsertions = [];

  for (const reqDoc of requests) {
    const reqId = String(reqDoc?._id || "");
    if (!reqId) continue;

    if (shouldBackfillRequestSpend(reqDoc)) {
      const expectedRequestSpend = Number(reqDoc?.price?.amount || 0);
      const freeByPolicy = isFreeByPolicy(reqDoc);
      const reqSpendRows = requestSpendsByRefId.get(reqId) || [];
      const hasNegativeSpend = reqSpendRows.some(
        (row) => Number(row?.amount || 0) < 0,
      );

      if (!freeByPolicy && expectedRequestSpend > 0 && !hasNegativeSpend) {
        const freeMarkerRow = reqSpendRows.find(
          (row) => Number(row?.amount || 0) === 0 && row?.hasFreeRequest === true,
        );

        if (freeMarkerRow?._id) {
          requestSpendCorrections.push({
            ledgerId: String(freeMarkerRow._id),
            requestMongoId: reqId,
            requestId: reqDoc?.requestId || null,
            uniqueKey: String(freeMarkerRow?.uniqueKey || ""),
            amount: -expectedRequestSpend,
            userId: reqDoc?.requestor || null,
          });
        } else {
          const cycle = Number(reqDoc?.caseInfos?.rollbackCounts?.cam || 0);
          requestSpendInsertions.push({
            requestMongoId: reqId,
            requestId: reqDoc?.requestId || null,
            uniqueKey: `request:${reqId}:machining_spend:${cycle}`,
            amount: -expectedRequestSpend,
            createdAt: reqDoc?.updatedAt || reqDoc?.createdAt || new Date(),
            userId: reqDoc?.requestor || null,
          });
        }
      }
    }

    if (!shouldBackfillShippingSpend(reqDoc)) continue;

    const shippingPackageId = reqDoc?.shippingPackageId
      ? String(reqDoc.shippingPackageId)
      : "";
    if (!shippingPackageId) continue;

    const pkg = packageById.get(shippingPackageId);
    if (!pkg?._id) continue;

    const hasShippingSpend = (shippingSpendsByPkgId.get(shippingPackageId) || [])
      .some((row) => Number(row?.amount || 0) < 0);

    if (!hasShippingSpend) {
      const fee = Number(pkg?.shippingFeeSupply || DEFAULT_SHIPPING_FEE);
      if (!Number.isFinite(fee) || fee <= 0) continue;

      shippingSpendInsertions.push({
        packageMongoId: shippingPackageId,
        requestMongoId: reqId,
        requestId: reqDoc?.requestId || null,
        uniqueKey: `shippingPackage:${shippingPackageId}:shipping_fee`,
        amount: -fee,
        createdAt:
          reqDoc?.updatedAt || reqDoc?.createdAt || pkg?.createdAt || new Date(),
        userId: reqDoc?.requestor || null,
      });
    }
  }

  let correctedCount = 0;
  let insertedRequestSpendCount = 0;
  let insertedShippingSpendCount = 0;

  if (execute) {
    for (const item of requestSpendCorrections) {
      const res = await CreditLedger.updateOne(
        {
          _id: new Types.ObjectId(item.ledgerId),
          amount: 0,
          hasFreeRequest: true,
        },
        {
          $set: {
            userId: item.userId || null,
            amount: item.amount,
            spentPaidAmount: null,
            spentBonusAmount: null,
            hasFreeRequest: false,
          },
        },
      );
      if (Number(res?.modifiedCount || 0) > 0) correctedCount += 1;
    }

    for (const item of requestSpendInsertions) {
      const upsertRes = await CreditLedger.updateOne(
        { uniqueKey: item.uniqueKey },
        {
          $setOnInsert: {
            businessAnchorId: anchorId,
            userId: item.userId || null,
            type: "SPEND",
            amount: item.amount,
            refType: "REQUEST",
            refId: new Types.ObjectId(item.requestMongoId),
            uniqueKey: item.uniqueKey,
            spentPaidAmount: null,
            spentBonusAmount: null,
            hasFreeRequest: false,
            createdAt: item.createdAt,
          },
        },
        { upsert: true },
      );
      if (Number(upsertRes?.upsertedCount || 0) > 0) {
        insertedRequestSpendCount += 1;
      }
    }

    for (const item of shippingSpendInsertions) {
      const upsertRes = await CreditLedger.updateOne(
        { uniqueKey: item.uniqueKey },
        {
          $setOnInsert: {
            businessAnchorId: anchorId,
            userId: item.userId || null,
            type: "SPEND",
            amount: item.amount,
            refType: "SHIPPING_PACKAGE",
            refId: new Types.ObjectId(item.packageMongoId),
            uniqueKey: item.uniqueKey,
            spentPaidAmount: null,
            spentBonusAmount: null,
            createdAt: item.createdAt,
          },
        },
        { upsert: true },
      );

      if (Number(upsertRes?.upsertedCount || 0) > 0) {
        insertedShippingSpendCount += 1;
      }
    }
  }

  return {
    anchorId: String(anchor._id),
    anchorName: String(anchor.name || ""),
    requestsChecked: requests.length,
    requestSpendCorrections,
    requestSpendInsertions,
    shippingSpendInsertions,
    correctedCount,
    insertedRequestSpendCount,
    insertedShippingSpendCount,
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.allRequestors && !opts.anchorId && !opts.businessName) {
    throw new Error(
      "Usage: node scripts/reconcile-business-credit-spends.mjs --all-requestors [--execute] OR --anchor-id <id> [--execute] OR --business-name <name> [--execute]",
    );
  }

  const mongoUri = process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;
  if (!mongoUri) throw new Error("MONGODB_URI_TEST (or MONGO_URI_TEST) is required");

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });

  try {
    const mode = opts.execute ? "execute" : "dry-run";
    const anchors = await resolveAnchors(opts);

    if (!anchors.length) {
      throw new Error("No target anchors found");
    }

    console.log("=== reconcile-business-credit-spends ===");
    console.log(`mode=${mode}`);
    console.log(`targetAnchors=${anchors.length}`);

    let totalRequestsChecked = 0;
    let totalCorrectionTargets = 0;
    let totalRequestInsertTargets = 0;
    let totalShippingInsertTargets = 0;

    let correctedCount = 0;
    let insertedRequestSpendCount = 0;
    let insertedShippingSpendCount = 0;

    const changedAnchors = [];

    for (const anchor of anchors) {
      const result = await reconcileAnchor(anchor, { execute: opts.execute });

      totalRequestsChecked += result.requestsChecked;
      totalCorrectionTargets += result.requestSpendCorrections.length;
      totalRequestInsertTargets += result.requestSpendInsertions.length;
      totalShippingInsertTargets += result.shippingSpendInsertions.length;
      correctedCount += result.correctedCount;
      insertedRequestSpendCount += result.insertedRequestSpendCount;
      insertedShippingSpendCount += result.insertedShippingSpendCount;

      const targetCount =
        result.requestSpendCorrections.length +
        result.requestSpendInsertions.length +
        result.shippingSpendInsertions.length;

      if (targetCount > 0) {
        changedAnchors.push({
          anchorId: result.anchorId,
          anchorName: result.anchorName,
          targetCount,
          requestSpendCorrections: result.requestSpendCorrections.length,
          requestSpendInsertions: result.requestSpendInsertions.length,
          shippingSpendInsertions: result.shippingSpendInsertions.length,
          sample: {
            requestSpendCorrection: result.requestSpendCorrections[0] || null,
            requestSpendInsertion: result.requestSpendInsertions[0] || null,
            shippingSpendInsertion: result.shippingSpendInsertions[0] || null,
          },
        });
      }
    }

    console.log(`requestsChecked=${totalRequestsChecked}`);
    console.log(`target.requestSpendCorrections=${totalCorrectionTargets}`);
    console.log(`target.requestSpendInsertions=${totalRequestInsertTargets}`);
    console.log(`target.shippingSpendInsertions=${totalShippingInsertTargets}`);
    console.log(`changedAnchors=${changedAnchors.length}`);

    if (changedAnchors.length) {
      console.log("changedAnchors.sample", changedAnchors.slice(0, 20));
    }

    if (!opts.execute) {
      console.log("dry-run complete (no write)");
      return;
    }

    console.log("execute done");
    console.log(`applied.correctedCount=${correctedCount}`);
    console.log(`applied.insertedRequestSpendCount=${insertedRequestSpendCount}`);
    console.log(`applied.insertedShippingSpendCount=${insertedShippingSpendCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
