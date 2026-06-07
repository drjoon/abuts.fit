import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import AdminCreditLedger from "../../models/adminCreditLedger.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";

// Usage:
// ABUTS_DB_FORCE=true ENV_FILE=local.env node scripts/db/cleanup-free-request-commission-ledgers.js --yes
// --yes 플래그가 없으면 미리보기만 출력합니다.

function parseArgs() {
  const args = process.argv.slice(2);
  return { yes: args.includes("--yes") };
}

function toObjectIdSet(rows) {
  return new Set((rows || []).map((row) => String(row?._id || "")).filter(Boolean));
}

function buildDeleteMatch(ids) {
  return {
    _id: {
      $in: Array.from(ids),
    },
  };
}

async function collectCandidateIds(Model, label) {
  const rows = await Model.aggregate([
    {
      $match: {
        type: "EARN",
        refType: "REQUEST",
      },
    },
    {
      $lookup: {
        from: "requests",
        localField: "refId",
        foreignField: "_id",
        as: "_refRequest",
      },
    },
    {
      $addFields: {
        _requestPaidAmount: {
          $ifNull: [{ $arrayElemAt: ["$_refRequest.price.paidAmount", 0] }, 0],
        },
      },
    },
    {
      $match: {
        _requestPaidAmount: { $lte: 0 },
      },
    },
    {
      $project: {
        _id: 1,
        amount: 1,
        refId: 1,
        refType: 1,
        uniqueKey: 1,
        createdAt: 1,
        _requestPaidAmount: 1,
      },
    },
  ]);

  const ids = toObjectIdSet(rows);
  const amountSum = (rows || []).reduce((sum, row) => sum + Number(row?.amount || 0), 0);

  console.log(`[cleanup-free-request-commission] ${label} candidates: ${ids.size}, amountSum: ${Math.round(amountSum)}`);
  for (const row of (rows || []).slice(0, 10)) {
    console.log(
      `  - ${label} _id:${String(row?._id || "")}, amount:${Number(row?.amount || 0)}, refId:${String(row?.refId || "")}, uniqueKey:${String(row?.uniqueKey || "")}, createdAt:${row?.createdAt}`,
    );
  }

  return { ids, count: ids.size, amountSum: Math.round(amountSum) };
}

async function verifyPaidRequestCount() {
  const count = await Request.countDocuments({ "price.paidAmount": { $gt: 0 } });
  console.log(`[cleanup-free-request-commission] paid request count (price.paidAmount > 0): ${count}`);
}

async function run() {
  const { yes } = parseArgs();
  await connectDb();

  try {
    console.log(`[cleanup-free-request-commission] dryRun: ${!yes}`);
    await verifyPaidRequestCount();

    const [admin, salesman, manufacturer] = await Promise.all([
      collectCandidateIds(AdminCreditLedger, "AdminCreditLedger"),
      collectCandidateIds(SalesmanLedger, "SalesmanLedger"),
      collectCandidateIds(ManufacturerCreditLedger, "ManufacturerCreditLedger"),
    ]);

    const totalCount = admin.count + salesman.count + manufacturer.count;
    const totalAmount = admin.amountSum + salesman.amountSum + manufacturer.amountSum;

    console.log(`[cleanup-free-request-commission] total candidates: ${totalCount}, total amount: ${totalAmount}`);

    if (!yes) {
      console.log("[cleanup-free-request-commission] --yes 플래그가 없어 삭제하지 않습니다.");
      return;
    }

    const [adminDel, salesmanDel, manufacturerDel] = await Promise.all([
      admin.ids.size
        ? AdminCreditLedger.deleteMany(buildDeleteMatch(admin.ids))
        : Promise.resolve({ deletedCount: 0 }),
      salesman.ids.size
        ? SalesmanLedger.deleteMany(buildDeleteMatch(salesman.ids))
        : Promise.resolve({ deletedCount: 0 }),
      manufacturer.ids.size
        ? ManufacturerCreditLedger.deleteMany(buildDeleteMatch(manufacturer.ids))
        : Promise.resolve({ deletedCount: 0 }),
    ]);

    console.log(
      `[cleanup-free-request-commission] deleted: admin=${adminDel.deletedCount || 0}, salesman=${salesmanDel.deletedCount || 0}, manufacturer=${manufacturerDel.deletedCount || 0}`,
    );
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[cleanup-free-request-commission] failed", error);
  process.exit(1);
});
