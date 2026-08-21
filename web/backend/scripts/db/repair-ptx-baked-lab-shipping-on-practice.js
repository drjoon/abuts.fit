// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// 레거시: 치과→기공소「배송비」가 labFeeTotal/hold_lab에 합쳐진 PTX를 기공비만으로 맞춘다.
//
// Usage:
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/repair-ptx-baked-lab-shipping-on-practice.js \
//     --transfer PTX-MT2Y7INN-2AKG89 [--apply]
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import BusinessCreditBalance from "../../models/businessCreditBalance.model.js";
import {
  PRACTICE_TRANSFER_LEDGER_LABELS,
  buildPracticeTransferQuote,
} from "../../services/practiceTransferBilling.service.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";
import { resolveDevopsEscrowOwnerId } from "../../services/requestCreditHold.service.js";

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
    const practiceAnchorId = String(doc.practiceBusinessAnchorId || "");

    const quote = await buildPracticeTransferQuote({
      transfer: doc,
      toothWorks: doc.toothWorks,
      practiceAnchorId: doc.practiceBusinessAnchorId,
      labAnchorId: doc.targetLabAnchorId || doc.assigneeLabAnchorId,
    });
    const fees = quote?.fees || quote || {};
    const expectedWork = Math.max(
      0,
      Math.round(Number(fees.labFeeTotal || fees.total || 0)),
    );

    const holdLab = await LedgerJournal.findOne({
      idempotencyKey: `practice_transfer:${mongoId}:hold_lab`,
    }).lean();
    const holdHeld = Math.max(
      0,
      Math.round(
        Number(
          holdLab?.meta?.heldTotal ??
            doc.billing?.heldLabTotal ??
            doc.billing?.labFeeTotal ??
            0,
        ),
      ),
    );
    const peel = Math.max(0, holdHeld - expectedWork);

    console.log("plan", {
      transferId,
      mongoId,
      practiceAnchorId,
      holdHeld,
      expectedWork,
      peel,
      apply,
    });

    if (peel <= 0) {
      console.log("nothing to peel");
      return;
    }
    if (!apply) {
      console.log("dry-run only (pass --apply)");
      return;
    }

    const devopsAnchorId = await resolveDevopsEscrowOwnerId(null);
    if (!devopsAnchorId) throw new Error("devops escrow missing");

    const adjustKey = `practice_transfer:${mongoId}:hold_adjust:peel_baked_lab_shipping`;
    const existing = await LedgerJournal.findOne({
      idempotencyKey: adjustKey,
    }).lean();
    if (existing?.journalId) {
      console.log("already repaired", existing.journalId);
      return;
    }

    await postGeneralLedgerJournal({
      eventType: "PRACTICE_TRANSFER_HOLD_ADJUST",
      idempotencyKey: adjustKey,
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: mongoId,
      lines: [
        {
          accountCode: "PLATFORM_ESCROW",
          ownerRole: "devops",
          ownerId: devopsAnchorId,
          amount: -peel,
          amountExcludingVat: -peel,
          vatAmount: 0,
          creditKind: null,
          refType: "PRACTICE_TRANSFER",
          refId: mongoId,
          meta: {
            displayKind: "lab_fee_hold",
            displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAdjust,
            source: "peel_baked_lab_shipping",
          },
        },
        {
          accountCode: "REQ_PAID_CREDIT",
          ownerRole: "requestor",
          ownerId: practiceAnchorId,
          amount: peel,
          amountExcludingVat: peel,
          vatAmount: 0,
          creditKind: "PAID",
          refType: "PRACTICE_TRANSFER",
          refId: mongoId,
          meta: {
            displayKind: "lab_fee_hold",
            displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAdjust,
            source: "peel_baked_lab_shipping",
            holdShare: "lab",
          },
        },
      ],
      meta: {
        heldTotal: peel,
        delta: -peel,
        holdShare: "lab",
        source: "peel_baked_lab_shipping",
        displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAdjust,
      },
    });

    const nextHeldLab = Math.max(0, holdHeld - peel);
    await PracticeTransfer.updateOne(
      { _id: doc._id },
      {
        $set: {
          "billing.labFeeTotal": expectedWork,
          "billing.total": expectedWork,
          "billing.labShippingFee": 0,
          "billing.heldLabTotal": nextHeldLab,
          "billing.heldTotal": Math.max(
            0,
            Math.round(Number(doc.billing?.heldTotal || 0)) - peel,
          ),
        },
      },
    );

    if (holdLab?.journalId) {
      // hold 원본 라인은 유지하고, 조정 저널(+peel)만으로 순액을 expectedWork에 맞춘다.
      // (라인을 줄이면 조정 저널과 이중으로 반영됨)
      await LedgerJournal.updateOne(
        { _id: holdLab._id },
        {
          $set: {
            "meta.note": "legacy_baked_lab_shipping_peeled_via_hold_adjust",
          },
        },
      );
    }

    await upsertBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
    });
    const bal = await BusinessCreditBalance.findOne({
      businessAnchorId: practiceAnchorId,
    })
      .select({ paidCredit: 1 })
      .lean();
    console.log("done", {
      nextHeldLab,
      expectedWork,
      paidCredit: bal?.paidCredit,
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
