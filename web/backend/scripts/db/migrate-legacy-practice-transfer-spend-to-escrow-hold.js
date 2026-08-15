// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/rules.md
// - .cursor/rules/mongodb-uri-test.mdc
//
// Convert a legacy PRACTICE_TRANSFER_SPEND_COMMIT (lab credit on accept)
// into PRACTICE_TRANSFER_SPEND_HOLD (escrow) while the transfer is still accepted.
//
// Usage (TEST DB):
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/migrate-legacy-practice-transfer-spend-to-escrow-hold.js \
//     --transfer PTX-MSSUVATL-CPH6CD
//   ... --apply
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import {
  rollbackPracticeTransferBilling,
  holdPracticeTransferCredits,
} from "../../services/practiceTransferBilling.service.js";
import { computeBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const transferIdx = args.findIndex((a) => a === "--transfer");
  return {
    apply: args.includes("--apply"),
    transferId:
      transferIdx >= 0 ? String(args[transferIdx + 1] || "").trim() : "",
  };
}

async function main() {
  const { apply, transferId } = parseArgs(process.argv);
  if (!transferId) {
    throw new Error("--transfer PTX-... is required");
  }

  await connectDb();
  try {
    const doc = await PracticeTransfer.findOne({ transferId });
    if (!doc) throw new Error(`transfer not found: ${transferId}`);

    const mongoId = doc._id;
    const total = Math.max(0, Math.round(Number(doc.billing?.total || 0)));
    const settlement = Math.max(
      0,
      Math.round(Number(doc.billing?.labSettlementAmount || 0)),
    );

    const [spend, hold, release] = await Promise.all([
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${String(mongoId)}:spend`,
      }).lean(),
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${String(mongoId)}:hold`,
      }).lean(),
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${String(mongoId)}:escrow_release`,
      }).lean(),
    ]);

    console.log("plan", {
      transferId,
      mongoId: String(mongoId),
      total,
      settlement,
      completedAt: doc.autoMatch?.completedAt || null,
      hasSpendCommit: Boolean(spend?.journalId),
      spendEvent: spend?.eventType || null,
      hasHold: Boolean(hold?.journalId),
      hasRelease: Boolean(release?.journalId),
      apply,
    });

    if (!spend?.journalId) {
      throw new Error("no legacy SPEND_COMMIT to reverse");
    }
    if (hold?.journalId) throw new Error("hold already exists — abort");
    if (release?.journalId) throw new Error("escrow already released — abort");
    if (doc.autoMatch?.completedAt) {
      throw new Error("already completed — abort");
    }
    if (total <= 0) throw new Error("billing.total invalid");

    if (!apply) {
      console.log("dry-run only. Re-run with --apply");
      return;
    }

    const beforeLab = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: doc.targetLabAnchorId,
    });
    const beforePractice = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: doc.practiceBusinessAnchorId,
    });

    const rb = await rollbackPracticeTransferBilling({ transferId: mongoId });
    console.log("rollback", rb);
    if (!rb?.didRollback) {
      throw new Error(`rollback failed: ${rb?.reason}`);
    }

    const holdResult = await holdPracticeTransferCredits({
      transfer: doc.toObject(),
      toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
      holdAmount: total,
    });
    console.log("hold", holdResult);
    if (!holdResult?.held && holdResult?.reason !== "already_held") {
      throw new Error(`hold failed: ${holdResult?.reason || "unknown"}`);
    }

    const now = new Date();
    const prevBilling =
      doc.billing && typeof doc.billing === "object"
        ? doc.billing.toObject?.() || { ...doc.billing }
        : {};
    const billing = {
      ...prevBilling,
      heldAt: now,
      heldTotal: Number(holdResult.heldTotal ?? total),
      holdFromPaid: Number(holdResult.fromPaid || 0),
      holdFromFreeRequest: Number(holdResult.fromFreeRequest || 0),
      holdFromFreeShipping: Number(holdResult.fromFreeShipping || 0),
      settledAt: null,
    };
    await PracticeTransfer.updateOne({ _id: mongoId }, { $set: { billing } });

    const journals = await LedgerJournal.find({
      $or: [
        { refId: mongoId },
        { idempotencyKey: { $regex: String(mongoId) } },
      ],
    })
      .select({ eventType: 1, idempotencyKey: 1 })
      .lean();
    const lines = await LedgerLine.find({ refId: mongoId })
      .select({ accountCode: 1, amount: 1, creditKind: 1 })
      .lean();
    const afterLab = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: doc.targetLabAnchorId,
    });
    const afterPractice = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: doc.practiceBusinessAnchorId,
    });

    console.log(
      "after journals",
      journals.map((j) => ({ eventType: j.eventType, key: j.idempotencyKey })),
    );
    console.log("after lines", lines);
    console.log("balances", {
      practicePaid: {
        before: beforePractice.paidCredit,
        after: afterPractice.paidCredit,
      },
      labSettlement: {
        before: beforeLab.settlementCredit,
        after: afterLab.settlementCredit,
      },
      labFree: { before: beforeLab.freeCredit, after: afterLab.freeCredit },
    });
    console.log("done", { transferId, heldTotal: billing.heldTotal });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[migrate-legacy-practice-transfer-spend-to-escrow-hold] failed", err);
  process.exitCode = 1;
});
