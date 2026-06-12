#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import CreditLedger from "../models/creditLedger.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";
import Request from "../models/request.model.js";
import ChargeOrder from "../models/chargeOrder.model.js";

const SHIPPING_FEE_SUPPLY = 3500;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../local.env") });

function isShippingRefType(refType) {
  const t = String(refType || "");
  return t === "SHIPPING_PACKAGE" || t === "SHIPPING_FEE";
}

async function main() {
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;
  if (!uri) throw new Error("MONGODB_URI_TEST (or MONGO_URI_TEST) is required");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  try {
    const anchors = await BusinessAnchor.find({})
      .select({ _id: 1, name: 1 })
      .lean();

    const allChargeRefs = await CreditLedger.find({
      type: "CHARGE",
      refType: "CHARGE_ORDER",
    })
      .select({ refId: 1 })
      .lean();
    const chargeRefIds = Array.from(
      new Set(
        allChargeRefs
          .map((r) => (r?.refId ? String(r.refId) : ""))
          .filter(Boolean),
      ),
    );

    const allRequestSpends = await CreditLedger.find({
      type: "SPEND",
      refType: "REQUEST",
    })
      .select({ refId: 1 })
      .lean();
    const requestSpendRefIds = Array.from(
      new Set(
        allRequestSpends
          .map((r) => (r?.refId ? String(r.refId) : ""))
          .filter(Boolean),
      ),
    );

    const allShippingSpends = await CreditLedger.find({
      type: "SPEND",
      refType: { $in: ["SHIPPING_PACKAGE", "SHIPPING_FEE"] },
    })
      .select({ refId: 1 })
      .lean();
    const shippingSpendRefIds = Array.from(
      new Set(
        allShippingSpends
          .map((r) => (r?.refId ? String(r.refId) : ""))
          .filter(Boolean),
      ),
    );

    const [existingChargeRows, existingRequestRows, existingPackageRows] =
      await Promise.all([
        chargeRefIds.length
          ? ChargeOrder.find({ _id: { $in: chargeRefIds } })
              .select({ _id: 1 })
              .lean()
          : [],
        requestSpendRefIds.length
          ? Request.find({ _id: { $in: requestSpendRefIds } })
              .select({ _id: 1 })
              .lean()
          : [],
        shippingSpendRefIds.length
          ? ShippingPackage.find({ _id: { $in: shippingSpendRefIds } })
              .select({ _id: 1 })
              .lean()
          : [],
      ]);

    const existingChargeIdSet = new Set(
      existingChargeRows.map((d) => String(d._id)),
    );
    const existingRequestIdSet = new Set(
      existingRequestRows.map((d) => String(d._id)),
    );
    const existingPackageIdSet = new Set(
      existingPackageRows.map((d) => String(d._id)),
    );

    const chargeMissingRefCount = chargeRefIds.filter(
      (id) => !existingChargeIdSet.has(id),
    ).length;
    const requestSpendMissingRefCount = requestSpendRefIds.filter(
      (id) => !existingRequestIdSet.has(id),
    ).length;
    const shippingSpendMissingRefCount = shippingSpendRefIds.filter(
      (id) => !existingPackageIdSet.has(id),
    ).length;

    let checkedAnchors = 0;
    let ledgerSplitMismatchCount = 0;
    let negativeBeforeClampAnchors = 0;
    let requestSpendDuplicateCount = 0;
    let shippingSpendDuplicateCount = 0;
    let shippingFeeMismatchCount = 0;
    let orphanRequestRefundCount = 0;
    let orphanShippingRefundCount = 0;

    const sampleIssues = {
      ledgerSplitMismatch: [],
      requestSpendDuplicate: [],
      shippingSpendDuplicate: [],
      shippingFeeMismatch: [],
      negativeAnchors: [],
    };

    for (const anchor of anchors) {
      const rows = await CreditLedger.find({ businessAnchorId: anchor._id })
        .sort({ createdAt: 1, _id: 1 })
        .select({
          _id: 1,
          type: 1,
          amount: 1,
          refType: 1,
          refId: 1,
          spentPaidAmount: 1,
          spentBonusAmount: 1,
          uniqueKey: 1,
        })
        .lean();

      if (!rows.length) continue;
      checkedAnchors += 1;

      const requestSpendCountByRef = new Map();
      const shippingSpendCountByRef = new Map();
      const requestSpendRefSet = new Set();
      const shippingSpendRefSet = new Set();

      let paid = 0;
      let bonusRequest = 0;
      let bonusShipping = 0;
      let hadNegative = false;

      for (const r of rows) {
        const type = String(r?.type || "");
        const refType = String(r?.refType || "");
        const amount = Number(r?.amount || 0);
        if (!Number.isFinite(amount)) continue;

        const absAmount = Math.abs(amount);

        if (type === "CHARGE") {
          paid += absAmount;
          continue;
        }

        if (type === "BONUS") {
          if (refType === "FREE_SHIPPING_CREDIT") bonusShipping += absAmount;
          else bonusRequest += absAmount;
          continue;
        }

        if (type === "REFUND") {
          paid += absAmount;
          if (
            refType === "REQUEST" &&
            r?.refId &&
            !requestSpendRefSet.has(String(r.refId))
          ) {
            orphanRequestRefundCount += 1;
          }
          if (
            isShippingRefType(refType) &&
            r?.refId &&
            !shippingSpendRefSet.has(String(r.refId))
          ) {
            orphanShippingRefundCount += 1;
          }
          continue;
        }

        if (type === "ADJUST") {
          paid += amount;
          continue;
        }

        if (type !== "SPEND") continue;

        if (refType === "REQUEST" && r?.refId) {
          const key = String(r.refId);
          requestSpendRefSet.add(key);
          const next = Number(requestSpendCountByRef.get(key) || 0) + 1;
          requestSpendCountByRef.set(key, next);
          if (next > 1) {
            requestSpendDuplicateCount += 1;
            if (sampleIssues.requestSpendDuplicate.length < 10) {
              sampleIssues.requestSpendDuplicate.push({
                anchorName: anchor.name,
                ledgerId: String(r._id),
                requestRefId: key,
                uniqueKey: r.uniqueKey,
              });
            }
          }
        }

        if (isShippingRefType(refType) && r?.refId) {
          const key = String(r.refId);
          shippingSpendRefSet.add(key);
          const next = Number(shippingSpendCountByRef.get(key) || 0) + 1;
          shippingSpendCountByRef.set(key, next);
          if (next > 1) {
            shippingSpendDuplicateCount += 1;
            if (sampleIssues.shippingSpendDuplicate.length < 10) {
              sampleIssues.shippingSpendDuplicate.push({
                anchorName: anchor.name,
                ledgerId: String(r._id),
                packageRefId: key,
                uniqueKey: r.uniqueKey,
              });
            }
          }

          if (Math.round(absAmount) !== SHIPPING_FEE_SUPPLY) {
            shippingFeeMismatchCount += 1;
            if (sampleIssues.shippingFeeMismatch.length < 10) {
              sampleIssues.shippingFeeMismatch.push({
                anchorName: anchor.name,
                ledgerId: String(r._id),
                packageRefId: key,
                uniqueKey: r.uniqueKey,
                amount: absAmount,
                expected: SHIPPING_FEE_SUPPLY,
              });
            }
          }
        }

        let spend = absAmount;
        let expectedFromBonus = 0;

        if (isShippingRefType(refType)) {
          const fromBonusShipping = Math.min(bonusShipping, spend);
          bonusShipping -= fromBonusShipping;
          expectedFromBonus = fromBonusShipping;
          spend -= fromBonusShipping;
        } else {
          const fromBonusRequest = Math.min(bonusRequest, spend);
          bonusRequest -= fromBonusRequest;
          expectedFromBonus = fromBonusRequest;
          spend -= fromBonusRequest;
        }

        const expectedPaid = spend;
        const storedPaid = Number(r?.spentPaidAmount);
        const storedBonus = Number(r?.spentBonusAmount);
        const hasStoredSplit =
          Number.isFinite(storedPaid) && Number.isFinite(storedBonus);

        if (hasStoredSplit) {
          const mismatch =
            Math.round(storedPaid) !== Math.round(expectedPaid) ||
            Math.round(storedBonus) !== Math.round(expectedFromBonus);
          if (mismatch) {
            ledgerSplitMismatchCount += 1;
            if (sampleIssues.ledgerSplitMismatch.length < 10) {
              sampleIssues.ledgerSplitMismatch.push({
                anchorName: anchor.name,
                ledgerId: String(r._id),
                uniqueKey: r.uniqueKey,
                refType,
                expectedPaid,
                expectedBonus: expectedFromBonus,
                storedPaid,
                storedBonus,
              });
            }
          }
        }

        paid -= expectedPaid;
        if (paid + bonusRequest + bonusShipping < 0) {
          hadNegative = true;
        }
      }

      if (hadNegative) {
        negativeBeforeClampAnchors += 1;
        if (sampleIssues.negativeAnchors.length < 10) {
          sampleIssues.negativeAnchors.push({
            anchorName: anchor.name,
            businessAnchorId: String(anchor._id),
          });
        }
      }
    }

    console.log("=== CREDIT LIFECYCLE AUDIT (MONGODB_URI_TEST) ===");
    console.log(`anchors_total=${anchors.length}`);
    console.log(`anchors_checked_with_ledger=${checkedAnchors}`);
    console.log(`chargeMissingRefCount=${chargeMissingRefCount}`);
    console.log(`requestSpendMissingRefCount=${requestSpendMissingRefCount}`);
    console.log(`shippingSpendMissingRefCount=${shippingSpendMissingRefCount}`);
    console.log(`requestSpendDuplicateCount=${requestSpendDuplicateCount}`);
    console.log(`shippingSpendDuplicateCount=${shippingSpendDuplicateCount}`);
    console.log(`shippingFeeMismatchCount=${shippingFeeMismatchCount}`);
    console.log(`orphanRequestRefundCount=${orphanRequestRefundCount}`);
    console.log(`orphanShippingRefundCount=${orphanShippingRefundCount}`);
    console.log(`ledgerSplitMismatchCount=${ledgerSplitMismatchCount}`);
    console.log(`negativeBeforeClampAnchors=${negativeBeforeClampAnchors}`);

    console.log("\n--- sample: requestSpendDuplicate ---");
    console.log(JSON.stringify(sampleIssues.requestSpendDuplicate, null, 2));

    console.log("\n--- sample: shippingSpendDuplicate ---");
    console.log(JSON.stringify(sampleIssues.shippingSpendDuplicate, null, 2));

    console.log("\n--- sample: shippingFeeMismatch ---");
    console.log(JSON.stringify(sampleIssues.shippingFeeMismatch, null, 2));

    console.log("\n--- sample: ledgerSplitMismatch ---");
    console.log(JSON.stringify(sampleIssues.ledgerSplitMismatch, null, 2));

    console.log("\n--- sample: negativeAnchors ---");
    console.log(JSON.stringify(sampleIssues.negativeAnchors, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
