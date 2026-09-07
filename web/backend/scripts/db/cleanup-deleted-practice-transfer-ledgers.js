// change-log:
// - 2026-09-08: 삭제·작업취소 PTX의 잔여 GL(원본+과거 REFUND) 물리 삭제.
// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/utils/practiceTransferStage.js
//
// Usage (dry-run):
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/cleanup-deleted-practice-transfer-ledgers.js
//
// Apply:
//   ... node scripts/db/cleanup-deleted-practice-transfer-ledgers.js --yes
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import {
  PRACTICE_TRANSFER_DELETED_STATUSES,
} from "../../utils/practiceTransferStage.js";
import { rollbackPracticeTransferBilling } from "../../services/practiceTransferBilling.service.js";

function parseArgs() {
  const args = process.argv.slice(2);
  return { yes: args.includes("--yes") };
}

async function run() {
  const { yes } = parseArgs();
  await connectDb();
  try {
    const deletedOrCanceled = await PracticeTransfer.find({
      $or: [
        { status: { $in: PRACTICE_TRANSFER_DELETED_STATUSES } },
        { workCanceledAt: { $ne: null } },
      ],
    })
      .select({ _id: 1, transferId: 1, status: 1, workCanceledAt: 1 })
      .lean();

    // 하드삭제 후 orphan: PRACTICE_TRANSFER 저널의 refId가 PTX에 없음
    const journalRefIds = await LedgerJournal.distinct("refId", {
      refType: "PRACTICE_TRANSFER",
      eventType: {
        $in: [
          "PRACTICE_TRANSFER_ESCROW_RELEASE",
          "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
          "PRACTICE_TRANSFER_HOLD_ADJUST",
          "PRACTICE_TRANSFER_SPEND_HOLD",
          "PRACTICE_TRANSFER_SPEND_COMMIT",
          "SHIPPING_SPEND_COMMIT",
          "ADJUST",
          "REFUND",
        ],
      },
    });
    const liveIds = new Set(
      (
        await PracticeTransfer.find({
          _id: { $in: journalRefIds.filter(Boolean) },
        })
          .select({ _id: 1 })
          .lean()
      ).map((d) => String(d._id)),
    );
    const orphanIds = journalRefIds
      .map((id) => String(id || "").trim())
      .filter((id) => id && !liveIds.has(id));

    const transferIds = [
      ...new Set([
        ...deletedOrCanceled.map((d) => String(d._id)),
        ...orphanIds,
      ]),
    ];

    console.log(
      `[cleanup-deleted-ptx] candidates=${transferIds.length} ` +
        `deletedDocs=${deletedOrCanceled.length} orphans=${orphanIds.length} ` +
        `willApply=${yes}`,
    );

    let touched = 0;
    let deletedJournals = 0;

    for (const transferId of transferIds) {
      if (!yes) {
        const count = await LedgerJournal.countDocuments({
          refType: "PRACTICE_TRANSFER",
          refId: { $in: [transferId] },
        });
        if (count <= 0) continue;
        touched += 1;
        deletedJournals += count;
        console.log(`  - transfer=${transferId} journals=${count}`);
        continue;
      }

      const rolled = await rollbackPracticeTransferBilling({
        transferId,
        emitRealtime: false,
        syncBalanceCache: true,
      });
      const n = (rolled.deletedJournalIds || []).length;
      if (!rolled.didRollback || n <= 0) continue;
      touched += 1;
      deletedJournals += n;
      console.log(
        `  - transfer=${transferId} deleted=${n} reason=${rolled.reason || "ok"}`,
      );
    }

    console.log(
      `[cleanup-deleted-ptx] done touched=${touched} deletedJournals=${deletedJournals}`,
    );
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
