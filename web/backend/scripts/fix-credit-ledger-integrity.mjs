#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import CreditLedger from "../models/creditLedger.model.js";
import Request from "../models/request.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";
import ChargeOrder from "../models/chargeOrder.model.js";

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

function keyOf(...parts) {
  return parts.map((v) => String(v || "")).join("|");
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
    const allRows = await CreditLedger.find({})
      .sort({ createdAt: 1, _id: 1 })
      .select({
        _id: 1,
        businessAnchorId: 1,
        type: 1,
        amount: 1,
        refType: 1,
        refId: 1,
        spentPaidAmount: 1,
        spentBonusAmount: 1,
        uniqueKey: 1,
        createdAt: 1,
      })
      .lean();

    const requestRefIds = Array.from(
      new Set(
        allRows
          .filter((r) => String(r?.refType || "") === "REQUEST" && r?.refId)
          .map((r) => String(r.refId)),
      ),
    );
    const shippingRefIds = Array.from(
      new Set(
        allRows
          .filter((r) => isShippingRefType(r?.refType) && r?.refId)
          .map((r) => String(r.refId)),
      ),
    );
    const chargeRefIds = Array.from(
      new Set(
        allRows
          .filter(
            (r) =>
              String(r?.type || "") === "CHARGE" &&
              String(r?.refType || "") === "CHARGE_ORDER" &&
              r?.refId,
          )
          .map((r) => String(r.refId)),
      ),
    );

    const [existingRequests, existingPackages, existingCharges] =
      await Promise.all([
        requestRefIds.length
          ? Request.find({ _id: { $in: requestRefIds } }).select({ _id: 1 }).lean()
          : [],
        shippingRefIds.length
          ? ShippingPackage.find({ _id: { $in: shippingRefIds } })
              .select({ _id: 1 })
              .lean()
          : [],
        chargeRefIds.length
          ? ChargeOrder.find({ _id: { $in: chargeRefIds } }).select({ _id: 1 }).lean()
          : [],
      ]);

    const requestIdSet = new Set((existingRequests || []).map((d) => String(d._id)));
    const packageIdSet = new Set((existingPackages || []).map((d) => String(d._id)));
    const chargeIdSet = new Set((existingCharges || []).map((d) => String(d._id)));

    const toDelete = new Set();

    // 1) orphan CHARGE/SPEND 삭제 후보
    for (const row of allRows) {
      const type = String(row?.type || "");
      const refType = String(row?.refType || "");
      const refId = row?.refId ? String(row.refId) : "";

      if (!refId) continue;

      if (type === "CHARGE" && refType === "CHARGE_ORDER") {
        if (!chargeIdSet.has(refId)) toDelete.add(String(row._id));
        continue;
      }

      if (type === "SPEND" && refType === "REQUEST") {
        if (!requestIdSet.has(refId)) toDelete.add(String(row._id));
        continue;
      }

      if (type === "SPEND" && isShippingRefType(refType)) {
        if (!packageIdSet.has(refId)) toDelete.add(String(row._id));
      }
    }

    // 2) shipping spend duplicate: 같은 사업자+패키지 중 첫 건만 유지
    const shippingSpends = allRows.filter(
      (r) =>
        String(r?.type || "") === "SPEND" &&
        isShippingRefType(r?.refType) &&
        r?.businessAnchorId &&
        r?.refId,
    );
    const shippingGroup = new Map();
    for (const row of shippingSpends) {
      const gk = keyOf(row.businessAnchorId, row.refId);
      const arr = shippingGroup.get(gk) || [];
      arr.push(row);
      shippingGroup.set(gk, arr);
    }
    let duplicateShippingSpendCount = 0;
    for (const rows of shippingGroup.values()) {
      if (rows.length <= 1) continue;
      const sorted = [...rows].sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a._id).localeCompare(String(b._id));
      });
      for (let i = 1; i < sorted.length; i++) {
        toDelete.add(String(sorted[i]._id));
        duplicateShippingSpendCount += 1;
      }
    }

    // 3) orphan REFUND 삭제 후보 (남아있는 SPEND 기준)
    const keptSpendKeySet = new Set(
      allRows
        .filter(
          (r) =>
            String(r?.type || "") === "SPEND" &&
            !toDelete.has(String(r._id)) &&
            r?.businessAnchorId &&
            r?.refId &&
            (String(r?.refType || "") === "REQUEST" || isShippingRefType(r?.refType)),
        )
        .map((r) =>
          keyOf(
            r.businessAnchorId,
            String(r?.refType || "") === "REQUEST" ? "REQUEST" : "SHIPPING_PACKAGE",
            r.refId,
          ),
        ),
    );

    let orphanRefundCount = 0;
    for (const row of allRows) {
      if (String(row?.type || "") !== "REFUND") continue;
      if (!row?.businessAnchorId || !row?.refId) continue;
      const refType = String(row?.refType || "");
      if (refType !== "REQUEST" && !isShippingRefType(refType)) continue;

      const refundKey = keyOf(
        row.businessAnchorId,
        refType === "REQUEST" ? "REQUEST" : "SHIPPING_PACKAGE",
        row.refId,
      );
      if (!keptSpendKeySet.has(refundKey)) {
        toDelete.add(String(row._id));
        orphanRefundCount += 1;
      }
    }

    // 4) split 재계산
    const rowsAfterDelete = allRows.filter((r) => !toDelete.has(String(r._id)));
    const byAnchor = new Map();
    for (const row of rowsAfterDelete) {
      const aid = String(row?.businessAnchorId || "");
      if (!aid) continue;
      const arr = byAnchor.get(aid) || [];
      arr.push(row);
      byAnchor.set(aid, arr);
    }

    const splitUpdates = [];
    let splitMismatchCount = 0;

    for (const rows of byAnchor.values()) {
      let paid = 0;
      let bonusRequest = 0;
      let bonusShipping = 0;

      const sorted = [...rows].sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a._id).localeCompare(String(b._id));
      });

      for (const row of sorted) {
        const type = String(row?.type || "");
        const refType = String(row?.refType || "");
        const amount = Number(row?.amount || 0);
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
          continue;
        }
        if (type === "ADJUST") {
          paid += amount;
          continue;
        }
        if (type !== "SPEND") continue;

        let spend = absAmount;
        let expectedBonus = 0;

        if (isShippingRefType(refType)) {
          const fromBonusShipping = Math.min(bonusShipping, spend);
          bonusShipping -= fromBonusShipping;
          expectedBonus = fromBonusShipping;
          spend -= fromBonusShipping;
        } else {
          const fromBonusRequest = Math.min(bonusRequest, spend);
          bonusRequest -= fromBonusRequest;
          expectedBonus = fromBonusRequest;
          spend -= fromBonusRequest;
        }

        const expectedPaid = spend;
        const storedPaid = Number(row?.spentPaidAmount);
        const storedBonus = Number(row?.spentBonusAmount);

        const mismatch =
          !Number.isFinite(storedPaid) ||
          !Number.isFinite(storedBonus) ||
          Math.round(storedPaid) !== Math.round(expectedPaid) ||
          Math.round(storedBonus) !== Math.round(expectedBonus);

        if (mismatch) {
          splitMismatchCount += 1;
          splitUpdates.push({
            updateOne: {
              filter: { _id: row._id },
              update: {
                $set: {
                  spentPaidAmount: expectedPaid,
                  spentBonusAmount: expectedBonus,
                },
              },
            },
          });
        }

        paid -= expectedPaid;
      }
    }

    const deleteIds = Array.from(toDelete);

    console.log("=== fix-credit-ledger-integrity ===");
    console.log(`mode=${dryRun ? "dry-run" : "execute"}`);
    console.log(`totalRows=${allRows.length}`);
    console.log(`deleteTargetCount=${deleteIds.length}`);
    console.log(`duplicateShippingSpendCount=${duplicateShippingSpendCount}`);
    console.log(`orphanRefundCount=${orphanRefundCount}`);
    console.log(`splitMismatchCount=${splitMismatchCount}`);

    if (dryRun) {
      console.log("no write executed");
      return;
    }

    let deletedCount = 0;
    let splitModified = 0;

    if (deleteIds.length) {
      const delRes = await CreditLedger.deleteMany({ _id: { $in: deleteIds } });
      deletedCount = Number(delRes?.deletedCount || 0);
    }

    if (splitUpdates.length) {
      const splitRes = await CreditLedger.bulkWrite(splitUpdates, { ordered: false });
      splitModified = Number(splitRes?.modifiedCount || 0);
    }

    console.log(`deletedCount=${deletedCount}`);
    console.log(`splitModified=${splitModified}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
