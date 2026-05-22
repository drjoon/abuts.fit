import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import Request from "../../models/request.model.js";

// Usage:
// node cleanup-seed-requests-all.js 90
// - 첫번째 인자: lookback days (기본: 7)
// 이 스크립트는 비파괴 미리보기 모드만 수행합니다. 삭제는 수행하지 않습니다.

function parseArgs() {
  const args = process.argv.slice(2);
  const lookbackDays = args[0] ? Number.parseInt(args[0], 10) : 7;
  return { lookbackDays };
}

function daysAgoDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function run() {
  const { lookbackDays } = parseArgs();
  await connectDb();
  try {
    console.log(`[cleanup-all] lookbackDays: ${lookbackDays}`);
    const since = daysAgoDate(lookbackDays);

    const anchors = await BusinessAnchor.find({}).select({ _id: 1, name: 1, "metadata.companyName": 1 }).lean();
    console.log(`[cleanup-all] found ${anchors.length} anchors`);

    let totalLedgers = 0;
    let totalRequests = 0;

    for (const anchor of anchors) {
      const anchorId = anchor._id;
      const name = anchor.name || anchor.metadata?.companyName || String(anchorId);

      const ledgerMatch = {
        businessAnchorId: anchorId,
        $or: [
          { refType: { $regex: "SEED", $options: "i" } },
          { uniqueKey: { $regex: "seed", $options: "i" } },
          { createdAt: { $gte: since } },
        ],
      };

      const ledgers = await CreditLedger.find(ledgerMatch).select({ _id: 1, type: 1, amount: 1, refType: 1, uniqueKey: 1, createdAt: 1 }).lean();

      const requestMatch = {
        businessAnchorId: anchorId,
        createdAt: { $gte: since },
      };
      const requests = await Request.find(requestMatch).select({ _id: 1, requestId: 1, createdAt: 1, "caseInfos.clinicName": 1 }).lean();

      if (ledgers.length === 0 && requests.length === 0) continue;

      totalLedgers += ledgers.length;
      totalRequests += requests.length;

      console.log(`\n[anchor] ${name} (${anchorId})`);
      console.log(`  matched ledgers: ${ledgers.length}, matched requests: ${requests.length}`);

      if (ledgers.length > 0) {
        console.log("  sample ledgers:");
        ledgers.slice(0, 5).forEach((l) => {
          console.log(`    - _id:${l._id}, type:${l.type}, amount:${l.amount}, refType:${l.refType}, uniqueKey:${l.uniqueKey}, createdAt:${l.createdAt}`);
        });
      }

      if (requests.length > 0) {
        console.log("  sample requests:");
        requests.slice(0, 5).forEach((r) => {
          console.log(`    - _id:${r._id}, requestId:${r.requestId}, clinicName:${r.caseInfos?.clinicName}, createdAt:${r.createdAt}`);
        });
      }
    }

    console.log(`\n[cleanup-all] total anchors with matches: TBD (counted above), total ledgers: ${totalLedgers}, total requests: ${totalRequests}`);
    console.log("[cleanup-all] Note: This run was a preview only. No deletions executed.");
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[cleanup-all] failed", err);
  process.exit(1);
});
