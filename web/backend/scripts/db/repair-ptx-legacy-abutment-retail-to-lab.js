// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/utils/labFeeSchedule.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// 레거시 PTX: 커스텀어벗을 어벗츠 몫(abutmentRetailTotal)으로 잡은 건을
// 신규 SSOT(보철+커스텀어벗 = 기공소 몫 labFeeTotal/labAbutmentTotal)로 맞춘다.
//
// Usage (TEST DB):
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/repair-ptx-legacy-abutment-retail-to-lab.js
//   ... --apply
//   ... --transfer PTX-... [--apply]
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import {
  PRACTICE_TRANSFER_LEDGER_LABELS,
} from "../../services/practiceTransferBilling.service.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import {
  allocateSpendFromCreditBuckets,
  computeBusinessCreditBalanceFromLedger,
  upsertBusinessCreditBalanceFromLedger,
} from "../../services/creditBalance.service.js";
import { resolveDevopsEscrowOwnerId } from "../../services/requestCreditHold.service.js";
import {
  computePracticeTransferRetailFees,
  LAB_FEE_SCHEDULE_DEFAULTS,
  LAB_FEE_SCHEDULE_ENABLED_DEFAULTS,
  normalizeLabFeeItems,
  normalizeLabFeeMultiplier,
  normalizeLabFeeSchedule,
  normalizeRushFeeMultiplier,
  resolveLabFeeScheduleSource,
  splitPracticeTransferSettlement,
} from "../../utils/labFeeSchedule.js";

const REPAIR_SOURCE = "legacy_abutment_retail_to_lab_ssot";
const REPAIR_KEY_SUFFIX = "hold_adjust_ca_retail_to_lab";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const transferIdx = args.findIndex((a) => a === "--transfer");
  return {
    apply: args.includes("--apply"),
    transferId:
      transferIdx >= 0 ? String(args[transferIdx + 1] || "").trim() : "",
  };
}

function buildFallbackLabFeeSchedule() {
  const flat = {
    ...LAB_FEE_SCHEDULE_DEFAULTS,
    enabled: { ...LAB_FEE_SCHEDULE_ENABLED_DEFAULTS },
    active: true,
  };
  return {
    ...normalizeLabFeeSchedule(flat),
    enabled: { ...LAB_FEE_SCHEDULE_ENABLED_DEFAULTS },
    items: normalizeLabFeeItems(flat),
    active: true,
  };
}

function implantFavoritesFromPractice(practice) {
  const raw = practice?.practiceTransferSettings?.implantFavorites;
  return Array.isArray(raw) ? raw : [];
}

/** hold_lab/abut/legacy 원보류 + hold_adjust 에스크로 증감(라인 합). */
function sumFeeHoldFromJournals(journals, escrowByJournalId = new Map()) {
  let lab = 0;
  let abut = 0;
  let legacy = 0;
  let adjustDelta = 0;
  for (const j of journals) {
    const key = String(j?.idempotencyKey || "");
    const held = Math.max(0, Math.round(Number(j?.meta?.heldTotal || 0)));
    const metaDelta = Math.round(Number(j?.meta?.delta || 0));
    const escrowDelta = Math.round(
      Number(escrowByJournalId.get(String(j.journalId || "")) || 0),
    );
    if (key.endsWith(":hold_lab")) lab += held;
    else if (key.endsWith(":hold_abutment")) abut += held;
    else if (key.endsWith(":hold")) legacy += held;
    else if (key.includes(":hold_adjust")) {
      if (metaDelta !== 0) adjustDelta += metaDelta;
      else if (escrowDelta !== 0) adjustDelta += escrowDelta;
    }
  }
  if (lab > 0 || abut > 0) return Math.max(0, lab + abut + adjustDelta);
  return Math.max(0, legacy + adjustDelta);
}

async function resolveFeesForDoc(doc, lab, practice) {
  const mult = normalizeLabFeeMultiplier(doc.billing?.labFeeMultiplier);
  const rush = normalizeRushFeeMultiplier(doc.billing?.rushFeeMultiplier);
  const favorites = implantFavoritesFromPractice(practice);
  const liveSchedule = lab?.labFeeSchedule
    ? resolveLabFeeScheduleSource(lab.labFeeSchedule)
    : null;
  let fees = computePracticeTransferRetailFees({
    toothWorks: doc.toothWorks,
    implantFavorites: favorites,
    labFeeSchedule: liveSchedule || buildFallbackLabFeeSchedule(),
    labFeeMultiplier: mult,
    rushFeeMultiplier: rush,
  });
  // 기공소 수가 Off/삭제면 기본 수가로 재시도
  if (fees.total <= 0 && Array.isArray(doc.toothWorks) && doc.toothWorks.length) {
    fees = computePracticeTransferRetailFees({
      toothWorks: doc.toothWorks,
      implantFavorites: favorites,
      labFeeSchedule: buildFallbackLabFeeSchedule(),
      labFeeMultiplier: mult,
      rushFeeMultiplier: rush,
    });
  }
  return fees;
}

async function main() {
  const { apply, transferId } = parseArgs(process.argv);
  await connectDb();
  try {
    const filter = {
      status: { $ne: "deleted" },
      "billing.abutmentRetailTotal": { $gt: 0 },
    };
    if (transferId) filter.transferId = transferId;

    const docs = await PracticeTransfer.find(filter).lean();
    console.log("candidates", docs.length, { apply, transferId: transferId || null });

    const labIds = [
      ...new Set(
        docs
          .map((d) => String(d.targetLabAnchorId || "").trim())
          .filter(Boolean),
      ),
    ];
    const practiceIds = [
      ...new Set(
        docs
          .map((d) => String(d.practiceBusinessAnchorId || "").trim())
          .filter(Boolean),
      ),
    ];
    const [labs, practices] = await Promise.all([
      labIds.length
        ? BusinessAnchor.find({ _id: { $in: labIds } })
            .select({ labFeeSchedule: 1, name: 1 })
            .lean()
        : [],
      practiceIds.length
        ? BusinessAnchor.find({ _id: { $in: practiceIds } })
            .select({ "practiceTransferSettings.implantFavorites": 1 })
            .lean()
        : [],
    ]);
    const labById = new Map(labs.map((l) => [String(l._id), l]));
    const practiceById = new Map(practices.map((p) => [String(p._id), p]));

    const devopsAnchorId = await resolveDevopsEscrowOwnerId(null);
    if (!devopsAnchorId) throw new Error("devops escrow missing");

    const practiceIdsToRefresh = new Set();
    let repaired = 0;
    let skipped = 0;

    for (const doc of docs) {
      const mongoId = String(doc._id);
      const practiceAnchorId = String(doc.practiceBusinessAnchorId || "");
      const lab = labById.get(String(doc.targetLabAnchorId || ""));
      const practice = practiceById.get(practiceAnchorId);
      const fees = await resolveFeesForDoc(doc, lab, practice);

      if (fees.total <= 0) {
        console.log("skip zero fees", doc.transferId);
        skipped += 1;
        continue;
      }
      if (Number(fees.abutmentRetailTotal || 0) > 0) {
        console.log("skip still has retail", doc.transferId, fees.abutmentRetailTotal);
        skipped += 1;
        continue;
      }

      const feeRateApplied = Number(doc.billing?.feeRateApplied || 0);
      const settlement = splitPracticeTransferSettlement({
        labFeeTotal: fees.labFeeTotal,
        abutmentRetailTotal: 0,
        feeRateApplied,
      });

      const journals = await LedgerJournal.find({
        refType: "PRACTICE_TRANSFER",
        refId: doc._id,
        eventType: {
          $in: ["PRACTICE_TRANSFER_SPEND_HOLD", "PRACTICE_TRANSFER_HOLD_ADJUST"],
        },
      })
        .select({ journalId: 1, idempotencyKey: 1, meta: 1, eventType: 1 })
        .lean();

      const repairKey = `practice_transfer:${mongoId}:${REPAIR_KEY_SUFFIX}`;
      const already = journals.find((j) => j.idempotencyKey === repairKey);
      if (already?.journalId) {
        console.log("already repaired", doc.transferId);
        skipped += 1;
        continue;
      }

      const adjustJournalIds = journals
        .filter((j) => String(j.idempotencyKey || "").includes(":hold_adjust"))
        .map((j) => j.journalId)
        .filter(Boolean);
      const escrowByJournalId = new Map();
      if (adjustJournalIds.length) {
        const escrowLines = await LedgerLine.find({
          journalId: { $in: adjustJournalIds },
          accountCode: "PLATFORM_ESCROW",
        })
          .select({ journalId: 1, amount: 1 })
          .lean();
        for (const line of escrowLines) {
          const jid = String(line.journalId || "");
          escrowByJournalId.set(
            jid,
            Math.round(Number(escrowByJournalId.get(jid) || 0)) +
              Math.round(Number(line.amount || 0)),
          );
        }
      }

      const heldShipping =
        Math.max(0, Math.round(Number(doc.billing?.heldShippingLabTotal || 0))) +
        Math.max(0, Math.round(Number(doc.billing?.heldShippingAbutsTotal || 0)));

      const oldRetail = Math.max(
        0,
        Math.round(Number(doc.billing?.abutmentRetailTotal || 0)),
      );
      const oldLab = Math.max(0, Math.round(Number(doc.billing?.labFeeTotal || 0)));
      const oldTotal = Math.max(
        0,
        Math.round(Number(doc.billing?.total || oldLab + oldRetail)),
      );
      const journalHeldFee = sumFeeHoldFromJournals(journals, escrowByJournalId);
      const billingHeldFee = Math.max(
        0,
        Math.round(
          Number(doc.billing?.heldLabTotal || 0) +
            Number(doc.billing?.heldAbutmentTotal || 0),
        ),
      );
      const currentHeldFee =
        journalHeldFee > 0
          ? journalHeldFee
          : billingHeldFee > 0
            ? billingHeldFee
            : Math.max(
                0,
                Math.round(Number(doc.billing?.heldTotal || 0)) - heldShipping,
              ) || oldTotal;

      const targetFee = fees.total;
      const delta = targetFee - currentHeldFee;
      const nextHeldTotal = targetFee + heldShipping;

      const plan = {
        transferId: doc.transferId,
        labName: lab?.name || "(missing lab → default schedule)",
        old: {
          labFeeTotal: oldLab,
          labAbutmentTotal: doc.billing?.labAbutmentTotal || 0,
          abutmentRetailTotal: oldRetail,
          total: oldTotal,
          heldFee: currentHeldFee,
        },
        next: {
          labFeeTotal: fees.labFeeTotal,
          labAbutmentTotal: fees.labAbutmentTotal,
          abutmentRetailTotal: 0,
          total: targetFee,
          heldLabTotal: targetFee,
          heldAbutmentTotal: 0,
          heldTotal: nextHeldTotal,
          labSettlementAmount: settlement.labSettlementAmount,
          abutsRevenueAmount: settlement.abutsRevenueAmount,
        },
        delta,
        lines: fees.lines,
      };
      console.log(JSON.stringify(plan));

      if (!apply) continue;

      if (delta !== 0) {
        const balance = await computeBusinessCreditBalanceFromLedger({
          businessAnchorId: practiceAnchorId,
        });
        const lines = [];
        const metaBase = {
          displayKind: "lab_fee_hold",
          displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAdjust,
          usageKind: "practice_transfer",
          escrow: true,
          source: REPAIR_SOURCE,
          holdShare: "lab",
        };

        if (delta > 0) {
          const split = allocateSpendFromCreditBuckets({
            amount: delta,
            paidCredit: Number(balance?.paidCredit || 0),
            freeRequestCredit: Number(balance?.freeRequestCredit || 0),
            freeShippingCredit: Number(balance?.freeShippingCredit || 0),
            freeOrder: ["freeRequest", "freeShipping"],
          });
          if (!split.ok) {
            throw new Error(
              `${doc.transferId}: insufficient credit need=${delta} available=${split.available}`,
            );
          }
          if (split.fromFreeRequest > 0) {
            lines.push({
              accountCode: "REQ_FREE_REQUEST_CREDIT",
              ownerRole: "requestor",
              ownerId: practiceAnchorId,
              amount: -split.fromFreeRequest,
              amountExcludingVat: -split.fromFreeRequest,
              vatAmount: 0,
              creditKind: "FREE_REQUEST",
              refType: "PRACTICE_TRANSFER",
              refId: mongoId,
              meta: { ...metaBase, fromPaid: 0, fromFreeRequest: split.fromFreeRequest },
            });
          }
          if (split.fromFreeShipping > 0) {
            lines.push({
              accountCode: "REQ_FREE_SHIPPING_CREDIT",
              ownerRole: "requestor",
              ownerId: practiceAnchorId,
              amount: -split.fromFreeShipping,
              amountExcludingVat: -split.fromFreeShipping,
              vatAmount: 0,
              creditKind: "FREE_SHIPPING",
              refType: "PRACTICE_TRANSFER",
              refId: mongoId,
              meta: {
                ...metaBase,
                fromFreeShipping: split.fromFreeShipping,
              },
            });
          }
          if (split.fromPaid > 0) {
            lines.push({
              accountCode: "REQ_PAID_CREDIT",
              ownerRole: "requestor",
              ownerId: practiceAnchorId,
              amount: -split.fromPaid,
              amountExcludingVat: -split.fromPaid,
              vatAmount: 0,
              creditKind: "PAID",
              refType: "PRACTICE_TRANSFER",
              refId: mongoId,
              meta: { ...metaBase, fromPaid: split.fromPaid },
            });
          }
          lines.push({
            accountCode: "PLATFORM_ESCROW",
            ownerRole: "devops",
            ownerId: String(devopsAnchorId),
            amount: delta,
            amountExcludingVat: delta,
            vatAmount: 0,
            creditKind: null,
            refType: "PRACTICE_TRANSFER",
            refId: mongoId,
            meta: { ...metaBase, source: `${REPAIR_SOURCE}_topup` },
          });
        } else {
          const absDelta = Math.abs(delta);
          lines.push(
            {
              accountCode: "PLATFORM_ESCROW",
              ownerRole: "devops",
              ownerId: String(devopsAnchorId),
              amount: -absDelta,
              amountExcludingVat: -absDelta,
              vatAmount: 0,
              creditKind: null,
              refType: "PRACTICE_TRANSFER",
              refId: mongoId,
              meta: { ...metaBase, source: `${REPAIR_SOURCE}_release` },
            },
            {
              accountCode: "REQ_PAID_CREDIT",
              ownerRole: "requestor",
              ownerId: practiceAnchorId,
              amount: absDelta,
              amountExcludingVat: absDelta,
              vatAmount: 0,
              creditKind: "PAID",
              refType: "PRACTICE_TRANSFER",
              refId: mongoId,
              meta: { ...metaBase, source: `${REPAIR_SOURCE}_release` },
            },
          );
        }

        await postGeneralLedgerJournal({
          eventType: "PRACTICE_TRANSFER_HOLD_ADJUST",
          idempotencyKey: repairKey,
          businessAnchorId: practiceAnchorId,
          refType: "PRACTICE_TRANSFER",
          refId: mongoId,
          lines,
          meta: {
            previousHeldFee: currentHeldFee,
            heldTotal: nextHeldTotal,
            heldLabTotal: targetFee,
            heldAbutmentTotal: 0,
            heldFeeTotal: targetFee,
            delta,
            source: REPAIR_SOURCE,
            displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAdjust,
            devopsAnchorId: String(devopsAnchorId),
          },
        });
      }

      await PracticeTransfer.updateOne(
        { _id: doc._id },
        {
          $set: {
            "billing.labFeeTotal": fees.labFeeTotal,
            "billing.labAbutmentTotal": fees.labAbutmentTotal,
            "billing.labAbutmentPending": Boolean(fees.labAbutmentPending),
            "billing.abutmentRetailTotal": 0,
            "billing.abutmentQuotePending": Boolean(fees.abutmentQuotePending),
            "billing.abutmentQty": Math.max(
              0,
              Math.round(Number(fees.abutmentQty || 0)),
            ),
            "billing.total": targetFee,
            "billing.labSettlementAmount": settlement.labSettlementAmount,
            "billing.abutsRevenueAmount": settlement.abutsRevenueAmount,
            "billing.heldLabTotal": targetFee,
            "billing.heldAbutmentTotal": 0,
            "billing.heldTotal": nextHeldTotal,
            "billing.repairedLegacyAbutmentRetailAt": new Date(),
            "billing.repairedLegacyAbutmentRetailSource": REPAIR_SOURCE,
          },
        },
      );

      if (practiceAnchorId) practiceIdsToRefresh.add(practiceAnchorId);
      repaired += 1;
    }

    for (const id of practiceIdsToRefresh) {
      await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: id });
    }

    console.log("done", { repaired, skipped, apply });
    if (!apply) console.log("dry-run only (pass --apply)");
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
