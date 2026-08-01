// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/models/creditLedger.model.js
// - web/backend/controllers/manufacturers/manufacturer.controller.js
// - web/backend/scripts/db/README.md
import mongoose, { Types } from "mongoose";
import "../../bootstrap/env.js";

import CreditLedger from "../../models/creditLedger.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

function parseArgs(argv) {
  const args = new Set((argv || []).slice(2));
  return {
    apply: args.has("--yes") || args.has("--apply"),
    verbose: args.has("--verbose"),
  };
}

function getMongoUriTestOnly() {
  const uri = String(
    process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST || "",
  ).trim();
  if (!uri) {
    throw new Error("MONGODB_URI_TEST (or MONGO_URI_TEST) is required.");
  }

  const dbNameRaw = uri.split("?")[0].split("/").filter(Boolean).pop() || "";
  const dbName = String(dbNameRaw || "").trim();
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run: DB name does not look like test DB. db=${dbName || "unknown"}`,
    );
  }

  return { uri, dbName };
}

async function getAnchorPaidSupplyMap(anchorIds) {
  if (!anchorIds.length) return new Map();

  const rows = await CreditLedger.aggregate([
    {
      $match: {
        businessAnchorId: { $in: anchorIds },
        $or: [
          {
            type: "CHARGE",
            creditKind: { $nin: ["FREE_REQUEST", "FREE_SHIPPING"] },
          },
          {
            type: "ADJUST",
            amount: { $gt: 0 },
            creditKind: { $nin: ["FREE_REQUEST", "FREE_SHIPPING"] },
          },
        ],
      },
    },
    {
      $group: {
        _id: "$businessAnchorId",
        paidSupply: {
          $sum: {
            $cond: [{ $eq: ["$type", "CHARGE"] }, { $abs: "$amount" }, "$amount"],
          },
        },
      },
    },
  ]);

  const m = new Map();
  for (const row of rows || []) {
    m.set(String(row?._id || ""), Number(row?.paidSupply || 0));
  }
  return m;
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv);

  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv !== "test") {
    throw new Error(
      `Refusing to run outside test mode. Set NODE_ENV=test. current=${nodeEnv || "(empty)"}`,
    );
  }

  const { uri, dbName } = getMongoUriTestOnly();
  await mongoose.connect(uri);

  try {
    const pollutedRows = await CreditLedger.find({
      type: { $in: ["SPEND", "REFUND"] },
      spentPaidAmount: { $gt: 0 },
      businessAnchorId: { $ne: null },
    })
      .select({
        _id: 1,
        businessAnchorId: 1,
        type: 1,
        amount: 1,
        spentPaidAmount: 1,
        spentFreeAmount: 1,
        refType: 1,
        uniqueKey: 1,
        createdAt: 1,
      })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const anchorIdSet = new Set(
      (pollutedRows || [])
        .map((row) => String(row?.businessAnchorId || "").trim())
        .filter((id) => id && Types.ObjectId.isValid(id)),
    );

    const anchorIds = Array.from(anchorIdSet).map((id) => new Types.ObjectId(id));
    const paidSupplyMap = await getAnchorPaidSupplyMap(anchorIds);

    const targetRows = (pollutedRows || []).filter((row) => {
      const anchorId = String(row?.businessAnchorId || "").trim();
      const paidSupply = Number(paidSupplyMap.get(anchorId) || 0);
      return paidSupply <= 0;
    });

    const anchorDocs = await BusinessAnchor.find({ _id: { $in: anchorIds } })
      .select({ _id: 1, name: 1 })
      .lean();
    const anchorNameById = new Map(
      (anchorDocs || []).map((a) => [String(a?._id || ""), String(a?.name || "")]),
    );

    const byAnchor = new Map();
    for (const row of targetRows) {
      const anchorId = String(row?.businessAnchorId || "");
      const curr = byAnchor.get(anchorId) || {
        anchorId,
        anchorName: anchorNameById.get(anchorId) || "",
        count: 0,
        spendCount: 0,
        refundCount: 0,
      };
      curr.count += 1;
      if (row.type === "SPEND") curr.spendCount += 1;
      if (row.type === "REFUND") curr.refundCount += 1;
      byAnchor.set(anchorId, curr);
    }

    console.log("[fix-spent-paid-pollution-test-only] summary");
    console.log(
      JSON.stringify(
        {
          dbName,
          mode: apply ? "APPLY" : "DRY_RUN",
          pollutedRows: pollutedRows.length,
          targetRows: targetRows.length,
          targetAnchors: byAnchor.size,
        },
        null,
        2,
      ),
    );

    if (verbose || !apply) {
      const anchorSummaries = Array.from(byAnchor.values()).sort(
        (a, b) => b.count - a.count,
      );
      console.log(
        "[fix-spent-paid-pollution-test-only] target anchors:\n" +
          JSON.stringify(anchorSummaries, null, 2),
      );

      const preview = targetRows.slice(0, 20).map((row) => ({
        _id: String(row?._id || ""),
        businessAnchorId: String(row?.businessAnchorId || ""),
        businessName:
          anchorNameById.get(String(row?.businessAnchorId || "")) || "",
        type: row?.type,
        refType: row?.refType,
        amount: Number(row?.amount || 0),
        spentPaidAmount: Number(row?.spentPaidAmount || 0),
        spentFreeAmount: Number(row?.spentFreeAmount || 0),
        uniqueKey: row?.uniqueKey,
        createdAt: row?.createdAt,
      }));
      console.log(
        "[fix-spent-paid-pollution-test-only] target preview (max 20):\n" +
          JSON.stringify(preview, null, 2),
      );
    }

    if (!apply) {
      console.log("[fix-spent-paid-pollution-test-only] dry-run complete.");
      return;
    }

    let modified = 0;
    for (const row of targetRows) {
      const absAmount = Math.abs(Number(row?.amount || 0));
      const nextPaid = 0;
      const nextBonus = absAmount;

      const res = await CreditLedger.updateOne(
        {
          _id: row._id,
          spentPaidAmount: Number(row?.spentPaidAmount || 0),
        },
        {
          $set: {
            spentPaidAmount: nextPaid,
            spentFreeAmount: nextBonus,
          },
        },
      );

      modified += Number(res?.modifiedCount || 0);
    }

    const remaining = await CreditLedger.countDocuments({
      _id: { $in: targetRows.map((row) => row._id) },
      spentPaidAmount: { $gt: 0 },
    });

    console.log(
      JSON.stringify(
        {
          applied: true,
          updatedRows: modified,
          expectedTargetRows: targetRows.length,
          remainingCorruptedInTargetSet: remaining,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("[fix-spent-paid-pollution-test-only] failed", error);
  process.exit(1);
});
