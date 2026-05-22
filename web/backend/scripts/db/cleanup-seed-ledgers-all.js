import { connectDb, disconnectDb } from "./_mongo.js";
import CreditLedger from "../../models/creditLedger.model.js";

// Usage:
// node cleanup-seed-ledgers-all.js 90 --yes
// - 첫번째 인자: lookback days (기본: 90)
// - --yes 플래그를 주지 않으면 미리보기만 출력하고 삭제하지 않습니다.

function parseArgs() {
  const args = process.argv.slice(2);
  const lookbackDays = args[0] ? Number.parseInt(args[0], 10) : 90;
  const yes = args.includes("--yes");
  return { lookbackDays, yes };
}

function daysAgoDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function run() {
  const { lookbackDays, yes } = parseArgs();
  await connectDb();
  try {
    console.log(`[cleanup-ledgers] lookbackDays: ${lookbackDays}, willDelete: ${yes}`);
    const since = daysAgoDate(lookbackDays);

    const match = {
      $and: [
        {
          $or: [
            { refType: { $regex: "SEED", $options: "i" } },
            { uniqueKey: { $regex: "seed", $options: "i" } },
          ],
        },
        { createdAt: { $gte: since } },
      ],
    };

    const count = await CreditLedger.countDocuments(match);
    console.log(`[cleanup-ledgers] matched ledgers: ${count}`);
    if (count === 0) {
      console.log("[cleanup-ledgers] no matching ledgers found. Nothing to do.");
      return;
    }

    const samples = await CreditLedger.find(match).limit(10).lean();
    console.log("[cleanup-ledgers] sample ledgers (up to 10):");
    samples.forEach((l) => {
      console.log(`  - _id:${l._id}, businessAnchorId:${l.businessAnchorId}, type:${l.type}, amount:${l.amount}, refType:${l.refType}, uniqueKey:${l.uniqueKey}, createdAt:${l.createdAt}`);
    });

    if (!yes) {
      console.log("\n[cleanup-ledgers] --yes 플래그가 없으므로 삭제를 수행하지 않습니다. 미리보기만 출력했습니다.");
      return;
    }

    // 삭제 실행
    console.log("[cleanup-ledgers] deleting...");
    // Try using transaction if available
    let deletedCount = 0;
    try {
      const db = CreditLedger.db;
      let session = null;
      if (typeof db.startSession === "function") {
        session = await db.startSession();
        session.startTransaction();
      }

      const res = await CreditLedger.deleteMany(match).session(session || undefined);
      deletedCount = res.deletedCount || 0;

      if (session) {
        await session.commitTransaction();
        await session.endSession();
      }
    } catch (err) {
      console.error("[cleanup-ledgers] deletion failed", err);
      throw err;
    }

    console.log(`[cleanup-ledgers] deleted ledgers: ${deletedCount}`);
    console.log("[cleanup-ledgers] Done.");
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[cleanup-ledgers] failed", err);
  process.exit(1);
});
