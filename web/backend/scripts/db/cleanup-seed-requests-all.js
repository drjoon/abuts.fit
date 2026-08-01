// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
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

    let totalJournals = 0;
    let totalRequests = 0;

    for (const anchor of anchors) {
      const anchorId = anchor._id;
      const name = anchor.name || anchor.metadata?.companyName || String(anchorId);

      const journalMatch = {
        businessAnchorId: anchorId,
        $or: [
          { refType: { $regex: "SEED", $options: "i" } },
          { idempotencyKey: { $regex: "seed", $options: "i" } },
          { createdAt: { $gte: since } },
        ],
      };

      const journals = await LedgerJournal.find(journalMatch)
        .select({ _id: 1, journalId: 1, eventType: 1, refType: 1, idempotencyKey: 1, createdAt: 1 })
        .lean();

      const requestMatch = {
        businessAnchorId: anchorId,
        createdAt: { $gte: since },
      };
      const requests = await Request.find(requestMatch).select({ _id: 1, requestId: 1, createdAt: 1, "caseInfos.clinicName": 1 }).lean();

      if (journals.length === 0 && requests.length === 0) continue;

      totalJournals += journals.length;
      totalRequests += requests.length;

      console.log(`\n[anchor] ${name} (${anchorId})`);
      console.log(`  matched journals: ${journals.length}, matched requests: ${requests.length}`);

      if (journals.length > 0) {
        console.log("  sample journals:");
        journals.slice(0, 5).forEach((j) => {
          console.log(`    - _id:${j._id}, journalId:${j.journalId}, eventType:${j.eventType}, refType:${j.refType}, idempotencyKey:${j.idempotencyKey}, createdAt:${j.createdAt}`);
        });
      }

      if (requests.length > 0) {
        console.log("  sample requests:");
        requests.slice(0, 5).forEach((r) => {
          console.log(`    - _id:${r._id}, requestId:${r.requestId}, clinicName:${r.caseInfos?.clinicName}, createdAt:${r.createdAt}`);
        });
      }
    }

    console.log(`\n[cleanup-all] total anchors with matches: TBD (counted above), total journals: ${totalJournals}, total requests: ${totalRequests}`);
    console.log("[cleanup-all] Note: This run was a preview only. No deletions executed.");
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[cleanup-all] failed", err);
  process.exit(1);
});
