// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// 기공소 작업완료 때 잘못 전환된 어벗츠→제조사 배송비(CA 미집하)를 보류로 되돌린다.
// Usage:
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/repair-premature-ptx-abuts-shipping.js
//   ... --apply
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import { deleteGeneralLedgerCommitJournal } from "../../services/generalLedger.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  return { apply: args.includes("--apply") };
}

function hasBeenPickedUp(request) {
  if (String(request?.shippingPackageId || "").trim()) return true;
  const stage = String(request?.manufacturerStage || "").trim();
  return stage === "포장.발송" || stage === "배송중" || stage === "배송완료";
}

async function main() {
  const { apply } = parseArgs(process.argv);
  await connectDb();
  try {
    const commits = await LedgerJournal.find({
      eventType: "SHIPPING_SPEND_COMMIT",
      $or: [
        { "meta.usageKind": "practice_transfer_abuts_shipping" },
        { "meta.source": "practice_transfer_abuts_shipping" },
        { idempotencyKey: { $regex: /:abuts_shipping$/ } },
      ],
    })
      .select({
        journalId: 1,
        refId: 1,
        idempotencyKey: 1,
        occurredAt: 1,
        meta: 1,
      })
      .lean();

    const targets = [];
    const skippedPickedUp = [];
    const ownerIds = new Set();

    for (const journal of commits) {
      const transferId = String(journal?.refId || "").trim();
      if (!transferId) continue;
      const transfer = await PracticeTransfer.findById(transferId)
        .select({
          transferId: 1,
          "production.relatedRequestIds": 1,
        })
        .lean();
      const relatedIds = Array.isArray(transfer?.production?.relatedRequestIds)
        ? transfer.production.relatedRequestIds
        : [];
      const requests = relatedIds.length
        ? await Request.find({ _id: { $in: relatedIds } })
            .select({
              requestId: 1,
              manufacturerStage: 1,
              shippingPackageId: 1,
            })
            .lean()
        : [];
      if (requests.some(hasBeenPickedUp)) {
        skippedPickedUp.push({
          transferId: transfer?.transferId || transferId,
          journalId: journal.journalId,
        });
        continue;
      }
      const lines = await LedgerLine.find({ journalId: journal.journalId })
        .select({ ownerId: 1, ownerRole: 1, accountCode: 1, amount: 1 })
        .lean();
      for (const line of lines) {
        if (line?.ownerId) ownerIds.add(String(line.ownerId));
      }
      targets.push({
        transferId: transfer?.transferId || transferId,
        mongoId: transferId,
        journalId: journal.journalId,
        requestIds: requests.map((row) => row.requestId).filter(Boolean),
        stages: requests.map((row) => row.manufacturerStage),
        manufacturerEarn: lines
          .filter((line) => line.accountCode === "REV_MANUFACTURER")
          .reduce((sum, line) => sum + Number(line.amount || 0), 0),
      });
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? "APPLY" : "DRY_RUN",
          prematureCount: targets.length,
          skippedPickedUpCount: skippedPickedUp.length,
          targets,
          skippedPickedUp,
        },
        null,
        2,
      ),
    );

    if (!apply || !targets.length) return;

    for (const row of targets) {
      const deleted = await deleteGeneralLedgerCommitJournal({
        journalId: row.journalId,
        expectedEventTypes: ["SHIPPING_SPEND_COMMIT"],
      });
      console.log("deleted", { ...row, deleted });
    }

    for (const ownerId of ownerIds) {
      await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: ownerId,
      });
    }
    console.log("balances upserted", [...ownerIds]);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
