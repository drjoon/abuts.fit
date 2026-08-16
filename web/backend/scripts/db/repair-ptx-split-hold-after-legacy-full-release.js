// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// 레거시 통합 보류(`:hold`) + 통합 해제(`:escrow_release`)로
// 기공소 완료 시 어벗츠분까지 해제된 PTX를 분할 보류/기공소분만 해제로 복구.
//
// Usage (TEST DB):
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/repair-ptx-split-hold-after-legacy-full-release.js \
//     --transfer PTX-MSVTXKY6-VM69ZV
//   ... --apply
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import {
  PRACTICE_TRANSFER_LEDGER_LABELS,
  releasePracticeTransferLabShare,
} from "../../services/practiceTransferBilling.service.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import {
  computeBusinessCreditBalanceFromLedger,
  upsertBusinessCreditBalanceFromLedger,
} from "../../services/creditBalance.service.js";

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

    const mongoId = String(doc._id);
    const practiceAnchorId = String(doc.practiceBusinessAnchorId || "");
    const labFeeTotal = Math.max(
      0,
      Math.round(Number(doc.billing?.labFeeTotal || 0)),
    );
    const abutmentRetailTotal = Math.max(
      0,
      Math.round(Number(doc.billing?.abutmentRetailTotal || 0)),
    );
    const heldTotal = Math.max(
      0,
      Math.round(Number(doc.billing?.heldTotal || 0)),
    );

    const [hold, release, holdLab, holdAbut, releaseLab] = await Promise.all([
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${mongoId}:hold`,
      }).lean(),
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${mongoId}:escrow_release`,
      }).lean(),
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${mongoId}:hold_lab`,
      }).lean(),
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${mongoId}:hold_abutment`,
      }).lean(),
      LedgerJournal.findOne({
        idempotencyKey: `practice_transfer:${mongoId}:escrow_release_lab`,
      }).lean(),
    ]);

    const holdLines = hold?.journalId
      ? await LedgerLine.find({ journalId: hold.journalId }).lean()
      : [];
    const releaseLines = release?.journalId
      ? await LedgerLine.find({ journalId: release.journalId }).lean()
      : [];

    const plan = {
      transferId,
      mongoId,
      practiceAnchorId,
      labFeeTotal,
      abutmentRetailTotal,
      heldTotal,
      hasLegacyHold: Boolean(hold?.journalId),
      hasLegacyRelease: Boolean(release?.journalId),
      hasHoldLab: Boolean(holdLab?.journalId),
      hasHoldAbut: Boolean(holdAbut?.journalId),
      hasReleaseLab: Boolean(releaseLab?.journalId),
      holdLineAmounts: holdLines.map((l) => ({
        accountCode: l.accountCode,
        amount: l.amount,
      })),
      releaseLineAmounts: releaseLines.map((l) => ({
        accountCode: l.accountCode,
        amount: l.amount,
      })),
      apply,
    };
    console.log("plan", JSON.stringify(plan, null, 2));

    if (!hold?.journalId) throw new Error("legacy :hold journal missing");
    if (!release?.journalId) {
      throw new Error("legacy :escrow_release journal missing — nothing to repair");
    }
    if (holdLab?.journalId || holdAbut?.journalId || releaseLab?.journalId) {
      throw new Error("split journals already present — abort");
    }
    if (labFeeTotal <= 0 || abutmentRetailTotal <= 0) {
      throw new Error("billing lab/abut totals missing");
    }
    if (heldTotal < labFeeTotal + abutmentRetailTotal) {
      throw new Error(
        `heldTotal ${heldTotal} < lab+abut ${labFeeTotal + abutmentRetailTotal}`,
      );
    }

    if (!apply) {
      console.log("dry-run only. pass --apply to mutate.");
      return;
    }

    const devopsLine = holdLines.find(
      (l) => String(l.accountCode) === "PLATFORM_ESCROW" && Number(l.amount) > 0,
    );
    const devopsAnchorId = String(devopsLine?.ownerId || "").trim();
    if (!devopsAnchorId) throw new Error("devops escrow owner missing on hold");

    // 1) 통합 해제 저널 삭제(기공크레딧·REV 포함) — 이후 lab share만 재해제
    await LedgerLine.deleteMany({ journalId: release.journalId });
    await LedgerJournal.deleteOne({ journalId: release.journalId });

    // 2) 레거시 보류를 기공소몫(labFeeTotal)으로 축소·라벨 갱신
    const holdPracticeLines = holdLines.filter((l) =>
      ["REQ_PAID_CREDIT", "REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"].includes(
        String(l.accountCode),
      ),
    );
    const holdEscrowLines = holdLines.filter(
      (l) => String(l.accountCode) === "PLATFORM_ESCROW",
    );
    if (holdPracticeLines.length !== 1 || holdEscrowLines.length !== 1) {
      throw new Error("unexpected hold line shape");
    }
    const fromPaid = Math.max(
      0,
      Math.round(Number(holdPracticeLines[0].meta?.fromPaid ?? labFeeTotal)),
    );
    await LedgerLine.updateOne(
      { _id: holdPracticeLines[0]._id },
      {
        $set: {
          amount: -labFeeTotal,
          amountExcludingVat: -labFeeTotal,
          "meta.displayLabel": PRACTICE_TRANSFER_LEDGER_LABELS.holdLab,
          "meta.holdShare": "lab",
          "meta.fromPaid": Math.min(fromPaid, labFeeTotal),
          "meta.heldTotal": labFeeTotal,
        },
      },
    );
    await LedgerLine.updateOne(
      { _id: holdEscrowLines[0]._id },
      {
        $set: {
          amount: labFeeTotal,
          amountExcludingVat: labFeeTotal,
          "meta.displayLabel": PRACTICE_TRANSFER_LEDGER_LABELS.holdLab,
          "meta.holdShare": "lab",
          "meta.fromPaid": Math.min(fromPaid, labFeeTotal),
          "meta.heldTotal": labFeeTotal,
          "meta.source": "practice_transfer_escrow_hold",
        },
      },
    );
    await LedgerJournal.updateOne(
      { journalId: hold.journalId },
      {
        $set: {
          idempotencyKey: `practice_transfer:${mongoId}:hold_lab`,
          "meta.heldTotal": labFeeTotal,
          "meta.holdShare": "lab",
          "meta.displayLabel": PRACTICE_TRANSFER_LEDGER_LABELS.holdLab,
          "meta.fromPaid": Math.min(fromPaid, labFeeTotal),
        },
      },
    );

    // 3) 어벗츠몫 보류 신규
    await postGeneralLedgerJournal({
      idempotencyKey: `practice_transfer:${mongoId}:hold_abutment`,
      eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: doc._id,
      meta: {
        heldTotal: abutmentRetailTotal,
        holdShare: "abutment",
        displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAbutment,
        fromPaid: abutmentRetailTotal,
        fromFreeRequest: 0,
        fromFreeShipping: 0,
        devopsAnchorId,
      },
      lines: [
        {
          accountCode: "REQ_PAID_CREDIT",
          ownerRole: "requestor",
          ownerId: practiceAnchorId,
          amount: -abutmentRetailTotal,
          amountExcludingVat: -abutmentRetailTotal,
          vatAmount: 0,
          creditKind: "PAID",
          refType: "PRACTICE_TRANSFER",
          refId: doc._id,
          meta: {
            displayKind: "lab_fee_hold",
            displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAbutment,
            usageKind: "practice_transfer",
            escrow: true,
            holdShare: "abutment",
            fromPaid: abutmentRetailTotal,
            fromFreeRequest: 0,
            fromFreeShipping: 0,
            heldTotal: abutmentRetailTotal,
          },
        },
        {
          accountCode: "PLATFORM_ESCROW",
          ownerRole: "devops",
          ownerId: devopsAnchorId,
          amount: abutmentRetailTotal,
          amountExcludingVat: abutmentRetailTotal,
          vatAmount: 0,
          creditKind: null,
          refType: "PRACTICE_TRANSFER",
          refId: doc._id,
          meta: {
            displayKind: "lab_fee_hold",
            displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAbutment,
            usageKind: "practice_transfer",
            escrow: true,
            holdShare: "abutment",
            fromPaid: abutmentRetailTotal,
            fromFreeRequest: 0,
            fromFreeShipping: 0,
            heldTotal: abutmentRetailTotal,
            source: "practice_transfer_escrow_hold",
          },
        },
      ],
    });

    // 4) billing 스냅샷 정리 후 기공소몫만 재해제
    // (보류 182→120 축소 + 어벗 50 신규 = 순 +12 환급이 장부 합에 반영됨)
    const nextBilling = {
      ...(doc.billing && typeof doc.billing === "object"
        ? doc.billing.toObject?.() || doc.billing
        : {}),
      heldTotal: labFeeTotal + abutmentRetailTotal,
      heldLabTotal: labFeeTotal,
      heldAbutmentTotal: abutmentRetailTotal,
      holdFromPaid: labFeeTotal + abutmentRetailTotal,
      holdFromFreeRequest: 0,
      holdFromFreeShipping: 0,
      labSettledAt: null,
      abutmentSettledAt: null,
      settledAt: null,
    };
    doc.billing = nextBilling;
    await PracticeTransfer.updateOne(
      { _id: doc._id },
      { $set: { billing: nextBilling } },
    );

    const releaseResult = await releasePracticeTransferLabShare({
      transfer: doc,
      toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
      actorUserId: null,
    });
    if (!releaseResult?.released && releaseResult?.reason !== "already_released") {
      throw new Error(
        `lab share release failed: ${releaseResult?.reason || "unknown"}`,
      );
    }

    const labSettledAt = new Date();
    const billingAfter = {
      ...nextBilling,
      labSettledAt,
      labSettlementAmount:
        releaseResult.labSettlementAmount ?? nextBilling.labSettlementAmount,
      // 어벗츠는 아직 에스크로 — 전체 settledAt 금지
      settledAt: null,
      abutmentSettledAt: null,
    };
    await PracticeTransfer.updateOne(
      { _id: doc._id },
      { $set: { billing: billingAfter } },
    );

    await upsertBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
    });
    if (doc.targetLabAnchorId) {
      await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: String(doc.targetLabAnchorId),
      });
    }

    const balance = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
    });
    console.log("done", {
      releaseReason: releaseResult?.reason || "released",
      labFeeTotal: releaseResult?.labFeeTotal,
      platformFee: releaseResult?.platformFee,
      labSettlementAmount: releaseResult?.labSettlementAmount,
      practicePaidCredit: balance?.paidCredit,
      overshootReturnedInPlace: Math.max(
        0,
        heldTotal - labFeeTotal - abutmentRetailTotal,
      ),
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
