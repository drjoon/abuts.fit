// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// Usage:
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/repair-ptx-abut-production-hold-and-shipping.js \
//     --transfer PTX-MSVTXKY6-VM69ZV --apply
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import {
  PRACTICE_TRANSFER_LEDGER_LABELS,
  chargePracticeTransferAbutsShipping,
} from "../../services/practiceTransferBilling.service.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";

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
  if (!transferId) throw new Error("--transfer PTX-... required");

  await connectDb();
  try {
    const doc = await PracticeTransfer.findOne({ transferId });
    if (!doc) throw new Error(`not found: ${transferId}`);
    const mongoId = String(doc._id);
    const practiceAnchorId = String(doc.practiceBusinessAnchorId);
    const production = 30000;
    const design = 20000;

    const holdAbut = await LedgerJournal.findOne({
      idempotencyKey: `practice_transfer:${mongoId}:hold_abutment`,
    }).lean();
    if (!holdAbut?.journalId) throw new Error("hold_abutment missing");
    const lines = await LedgerLine.find({ journalId: holdAbut.journalId }).lean();
    const practiceLine = lines.find((l) => l.accountCode === "REQ_PAID_CREDIT");
    const escrowLine = lines.find((l) => l.accountCode === "PLATFORM_ESCROW");
    if (!practiceLine || !escrowLine) throw new Error("bad hold lines");

    console.log("plan", {
      transferId,
      currentAbutHold: practiceLine.amount,
      production,
      design,
      apply,
    });
    if (!apply) {
      console.log("dry-run only");
      return;
    }

    const devopsAnchorId = String(escrowLine.ownerId);

    if (Number(practiceLine.amount) === -50000) {
      await LedgerLine.updateOne(
        { _id: practiceLine._id },
        {
          $set: {
            amount: -production,
            amountExcludingVat: -production,
            "meta.displayLabel": PRACTICE_TRANSFER_LEDGER_LABELS.holdAbutment,
            "meta.fromPaid": production,
            "meta.heldTotal": production,
          },
        },
      );
      await LedgerLine.updateOne(
        { _id: escrowLine._id },
        {
          $set: {
            amount: production,
            amountExcludingVat: production,
            "meta.displayLabel": PRACTICE_TRANSFER_LEDGER_LABELS.holdAbutment,
            "meta.fromPaid": production,
            "meta.heldTotal": production,
          },
        },
      );
      await LedgerJournal.updateOne(
        { journalId: holdAbut.journalId },
        {
          $set: {
            "meta.heldTotal": production,
            "meta.displayLabel": PRACTICE_TRANSFER_LEDGER_LABELS.holdAbutment,
            "meta.fromPaid": production,
          },
        },
      );
    }

    const existingDesign = await LedgerJournal.findOne({
      idempotencyKey: `practice_transfer:${mongoId}:hold_design`,
    }).lean();
    if (!existingDesign?.journalId) {
      await postGeneralLedgerJournal({
        idempotencyKey: `practice_transfer:${mongoId}:hold_design`,
        eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
        businessAnchorId: practiceAnchorId,
        refType: "PRACTICE_TRANSFER",
        refId: doc._id,
        meta: {
          heldTotal: design,
          holdShare: "lab_design",
          displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdLab,
          fromPaid: design,
          devopsAnchorId,
        },
        lines: [
          {
            accountCode: "REQ_PAID_CREDIT",
            ownerRole: "requestor",
            ownerId: practiceAnchorId,
            amount: -design,
            amountExcludingVat: -design,
            vatAmount: 0,
            creditKind: "PAID",
            refType: "PRACTICE_TRANSFER",
            refId: doc._id,
            meta: {
              displayKind: "lab_fee_hold",
              displayLabel: "디자인비+지그제작비 보류(치과→기공소)",
              usageKind: "practice_transfer",
              escrow: true,
              holdShare: "lab_design",
              fromPaid: design,
              heldTotal: design,
            },
          },
          {
            accountCode: "PLATFORM_ESCROW",
            ownerRole: "devops",
            ownerId: devopsAnchorId,
            amount: design,
            amountExcludingVat: design,
            vatAmount: 0,
            creditKind: null,
            refType: "PRACTICE_TRANSFER",
            refId: doc._id,
            meta: {
              displayKind: "lab_fee_hold",
              displayLabel: "디자인비+지그제작비 보류(치과→기공소)",
              usageKind: "practice_transfer",
              escrow: true,
              holdShare: "lab_design",
              fromPaid: design,
              heldTotal: design,
              source: "practice_transfer_escrow_hold",
            },
          },
        ],
      });
    }

    const existingRepay = await LedgerJournal.findOne({
      idempotencyKey: `practice_transfer:${mongoId}:design_escrow_to_devops_repay`,
    }).lean();
    if (!existingRepay?.journalId) {
      await postGeneralLedgerJournal({
        idempotencyKey: `practice_transfer:${mongoId}:design_escrow_to_devops_repay`,
        eventType: "ADJUST",
        businessAnchorId: practiceAnchorId,
        refType: "PRACTICE_TRANSFER",
        refId: doc._id,
        meta: {
          source: "abutment_design_lab_fee_escrow_repay",
          displayLabel: "디자인비+지그제작비",
          amount: design,
        },
        lines: [
          {
            accountCode: "PLATFORM_ESCROW",
            ownerRole: "devops",
            ownerId: devopsAnchorId,
            amount: -design,
            amountExcludingVat: -design,
            vatAmount: 0,
            creditKind: null,
            refType: "PRACTICE_TRANSFER",
            refId: doc._id,
            meta: {
              source: "abutment_design_lab_fee_escrow_repay",
              displayLabel: "디자인비+지그제작비",
            },
          },
          {
            accountCode: "REV_DEVOPS",
            ownerRole: "devops",
            ownerId: devopsAnchorId,
            amount: design,
            amountExcludingVat: design,
            vatAmount: 0,
            creditKind: "PAID",
            refType: "PRACTICE_TRANSFER",
            refId: doc._id,
            meta: {
              source: "abutment_design_lab_fee_escrow_repay",
              displayLabel: "디자인비+지그제작비",
            },
          },
        ],
      });
    }

    const labFee = Math.max(
      0,
      Math.round(Number(doc.billing?.labFeeTotal || 120000)),
    );
    const nextBilling = {
      ...(doc.billing?.toObject?.() || doc.billing || {}),
      heldAbutmentTotal: production,
      heldLabTotal: labFee + design,
      heldDesignFeeTotal: design,
      heldTotal: labFee + design + production,
    };
    await PracticeTransfer.updateOne(
      { _id: doc._id },
      { $set: { billing: nextBilling } },
    );
    doc.billing = nextBilling;

    const ship = await chargePracticeTransferAbutsShipping({
      transfer: doc,
      toothWorks: doc.toothWorks,
    });
    await upsertBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
    });

    const practiceLines = await LedgerLine.find({
      ownerId: practiceAnchorId,
      accountCode: "REQ_PAID_CREDIT",
      refId: doc._id,
    })
      .sort({ createdAt: 1 })
      .lean();
    console.log("done", {
      ship,
      practiceLines: practiceLines.map((l) => ({
        amount: l.amount,
        label: l.meta?.displayLabel,
      })),
      billing: {
        heldLabTotal: nextBilling.heldLabTotal,
        heldAbutmentTotal: nextBilling.heldAbutmentTotal,
        heldDesignFeeTotal: nextBilling.heldDesignFeeTotal,
      },
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
