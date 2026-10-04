// related files:
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/services/generalLedger.service.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// 이벤트 기간 플랫폼·협력 수수료 면제 정리. 하청 10%는 유지.
// - devops: directPlatformFeeEnabled=false, rate 2% 저장, subcontractFeeRate=0.1
// - 비하청 PTX billing.feeRateApplied → 0
// - PRACTICE_TRANSFER_LAB_PLATFORM_FEE 저널 삭제
// - 협력 에스크로 잔여 수수료 → 수행 기공소 ADJUST 환급
//
// Usage:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/repair-ptx-event-fee-exemption.js --dry-run
//   ... --apply
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import {
  deleteGeneralLedgerCommitJournal,
  postGeneralLedgerJournal,
} from "../../services/generalLedger.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";
import {
  DEFAULT_DIRECT_PLATFORM_FEE_RATE,
  DEFAULT_SUBCONTRACT_FEE_RATE,
} from "../../services/creditRevenuePolicy.service.js";

const COOP_REPAIR_SOURCE = "practice_transfer_cooperation_fee_exempt_repair";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  return {
    apply: args.includes("--apply"),
    dryRun: !args.includes("--apply"),
  };
}

function toId(value) {
  const s = String(value || "").trim();
  return s || null;
}

function money(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv);
  await connectDb();

  const ownerIds = new Set();
  const summary = {
    mode: apply ? "APPLY" : "DRY_RUN",
    policy: null,
    ptxSnapshots: { subcontractKept: 0, zeroed: 0, samples: [] },
    platformFeeDeletes: [],
    cooperationRepairs: [],
    skippedSubcontract: [],
    alreadyRepaired: [],
  };

  try {
    // ── 1) 정책 ───────────────────────────────────────────────
    const devops = await BusinessAnchor.findOne({ businessType: "devops" })
      .sort({ createdAt: 1 })
      .select({ name: 1, payoutRates: 1 })
      .lean();
    if (!devops?._id) {
      throw new Error("devops BusinessAnchor not found");
    }
    const rates = devops.payoutRates || {};
    const policySet = {
      "payoutRates.directPlatformFeeEnabled": false,
      "payoutRates.directPlatformFeeRate": DEFAULT_DIRECT_PLATFORM_FEE_RATE,
      "payoutRates.subcontractFeeRate": DEFAULT_SUBCONTRACT_FEE_RATE,
      "payoutRates.updatedAt": new Date(),
    };
    summary.policy = {
      devopsId: String(devops._id),
      before: {
        directPlatformFeeEnabled: rates.directPlatformFeeEnabled,
        directPlatformFeeRate: rates.directPlatformFeeRate,
        subcontractFeeRate: rates.subcontractFeeRate,
      },
      after: {
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: DEFAULT_DIRECT_PLATFORM_FEE_RATE,
        subcontractFeeRate: DEFAULT_SUBCONTRACT_FEE_RATE,
      },
    };
    if (apply) {
      await BusinessAnchor.updateOne({ _id: devops._id }, { $set: policySet });
    }

    // ── 2) PTX 스냅샷 ─────────────────────────────────────────
    const feePtx = await PracticeTransfer.find({
      "billing.feeRateApplied": { $gt: 0 },
    })
      .select({
        transferId: 1,
        assigneeKind: 1,
        billing: 1,
      })
      .lean();

    for (const ptx of feePtx) {
      const kind = String(ptx.assigneeKind || "").trim();
      const prevRate = Number(ptx.billing?.feeRateApplied || 0);
      const prevPlat = ptx.billing?.platformFeeRateApplied;
      const prevAbutsRev = money(ptx.billing?.abutsRevenueAmount);

      if (kind === "subcontract") {
        summary.ptxSnapshots.subcontractKept += 1;
        if (summary.ptxSnapshots.samples.length < 8) {
          summary.ptxSnapshots.samples.push({
            id: String(ptx._id),
            kind,
            action: "keep_subcontract",
            feeRateApplied: DEFAULT_SUBCONTRACT_FEE_RATE,
            prevRate,
          });
        }
        if (apply) {
          await PracticeTransfer.updateOne(
            { _id: ptx._id },
            {
              $set: {
                "billing.feeRateApplied": DEFAULT_SUBCONTRACT_FEE_RATE,
                "billing.platformFeeRateApplied": 0,
              },
            },
          );
        }
        continue;
      }

      summary.ptxSnapshots.zeroed += 1;
      if (summary.ptxSnapshots.samples.length < 12) {
        summary.ptxSnapshots.samples.push({
          id: String(ptx._id),
          kind: kind || null,
          action: "zero",
          prevRate,
          prevPlat,
          prevAbutsRev,
        });
      }
      if (apply) {
        const $set = {
          "billing.feeRateApplied": 0,
          "billing.platformFeeRateApplied": 0,
        };
        // 수수료분만 어벗츠 매출이었던 경우 0으로. 어벗 소매가 등이 섞여 있으면 차감.
        if (prevAbutsRev > 0) {
          const feePart = money(prevAbutsRev * prevRate); // rough; prefer exact from rate*lab if available
          const labFee = money(ptx.billing?.labFeeTotal || ptx.billing?.heldLabTotal);
          const exactFee =
            labFee > 0 && prevRate > 0 ? money(labFee * prevRate) : 0;
          const subtract = exactFee > 0 ? Math.min(prevAbutsRev, exactFee) : 0;
          if (subtract > 0) {
            $set["billing.abutsRevenueAmount"] = Math.max(
              0,
              prevAbutsRev - subtract,
            );
          } else if (Math.abs(prevAbutsRev - money(labFee * prevRate)) < 1) {
            $set["billing.abutsRevenueAmount"] = 0;
          }
        }
        await PracticeTransfer.updateOne({ _id: ptx._id }, { $set });
      }
    }

    // ── 3A) 플랫폼 사용료 저널 삭제 ────────────────────────────
    const platformFeeJournals = await LedgerJournal.find({
      eventType: "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
    })
      .select({
        journalId: 1,
        refId: 1,
        businessAnchorId: 1,
        meta: 1,
        occurredAt: 1,
      })
      .lean();

    for (const j of platformFeeJournals) {
      const labId = toId(j.meta?.labAnchorId || j.businessAnchorId);
      const fee = money(j.meta?.platformFee);
      const transferId = toId(j.refId);
      if (labId) ownerIds.add(labId);
      summary.platformFeeDeletes.push({
        journalId: j.journalId,
        transferId,
        labId,
        fee,
        feeRateApplied: j.meta?.feeRateApplied,
        occurredAt: j.occurredAt,
      });

      if (!apply) continue;

      await deleteGeneralLedgerCommitJournal({
        journalId: j.journalId,
        expectedEventTypes: ["PRACTICE_TRANSFER_LAB_PLATFORM_FEE"],
      });

      if (transferId) {
        await LedgerJournal.updateOne(
          {
            eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
            refType: "PRACTICE_TRANSFER",
            refId: transferId,
            "meta.holdShare": "lab",
          },
          {
            $set: {
              "meta.platformFee": 0,
              "meta.feeRateApplied": 0,
              "meta.labSettlementAmount": money(j.meta?.labFeeTotal),
            },
          },
        );
        await PracticeTransfer.updateOne(
          { _id: transferId },
          {
            $set: {
              "billing.feeRateApplied": 0,
              "billing.platformFeeRateApplied": 0,
            },
          },
        );
      }
    }

    // ── 3B) 협력 에스크로 잔여 환급 ────────────────────────────
    const escrowWithFee = await LedgerJournal.find({
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      "meta.platformFee": { $gt: 0 },
    })
      .select({
        journalId: 1,
        refId: 1,
        businessAnchorId: 1,
        meta: 1,
        occurredAt: 1,
      })
      .lean();

    for (const j of escrowWithFee) {
      const transferId = toId(j.refId);
      const fee = money(j.meta?.platformFee);
      const labFeeTotal = money(j.meta?.labFeeTotal);
      const primeId = toId(j.meta?.labAnchorId);
      const payeeId = toId(j.meta?.purchasePayeeId);
      if (!transferId || fee <= 0) continue;

      const ptx = await PracticeTransfer.findById(transferId)
        .select({ assigneeKind: 1, transferId: 1 })
        .lean();
      const kind = String(ptx?.assigneeKind || "").trim();

      if (kind === "subcontract") {
        summary.skippedSubcontract.push({
          journalId: j.journalId,
          transferId,
          fee,
          feeRateApplied: j.meta?.feeRateApplied,
          payeeId,
        });
        continue;
      }

      // 자체 지정 2%는 플랫폼 저널 삭제로 잔액 복구. release meta만 정리 대상일 수 있음.
      // 협력(어벗츠 원청 + purchasePayee)만 ADJUST 환급.
      const isCooperationRepair =
        kind === "cooperation" &&
        Boolean(j.meta?.abutsPrime) &&
        Boolean(payeeId) &&
        Boolean(primeId);

      if (!isCooperationRepair) {
        // 지정 자체 수행 등: meta만 면제 상태로 (플랫폼 저널 삭제와 짝)
        if (apply && !payeeId) {
          await LedgerJournal.updateOne(
            { journalId: j.journalId },
            {
              $set: {
                "meta.platformFee": 0,
                "meta.feeRateApplied": 0,
                "meta.labSettlementAmount": labFeeTotal || money(j.meta?.labSettlementAmount),
              },
            },
          );
        }
        continue;
      }

      const idempotencyKey = `repair:ptx:${transferId}:cooperation_fee_exempt`;
      const existingRepair = await LedgerJournal.findOne({
        idempotencyKey,
      })
        .select({ journalId: 1 })
        .lean();
      if (existingRepair?.journalId) {
        summary.alreadyRepaired.push({
          transferId,
          journalId: existingRepair.journalId,
          fee,
        });
        continue;
      }

      // 이미 같은 source ADJUST가 있으면 skip
      const existingBySource = await LedgerJournal.findOne({
        eventType: "ADJUST",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        "meta.source": COOP_REPAIR_SOURCE,
      })
        .select({ journalId: 1 })
        .lean();
      if (existingBySource?.journalId) {
        summary.alreadyRepaired.push({
          transferId,
          journalId: existingBySource.journalId,
          fee,
        });
        continue;
      }

      ownerIds.add(primeId);
      ownerIds.add(payeeId);
      summary.cooperationRepairs.push({
        journalId: j.journalId,
        transferId,
        transferKey: ptx?.transferId || null,
        fee,
        feeRateApplied: j.meta?.feeRateApplied,
        labFeeTotal,
        primeId,
        payeeId,
        occurredAt: j.occurredAt,
      });

      if (!apply) continue;

      await postGeneralLedgerJournal({
        idempotencyKey,
        eventType: "ADJUST",
        businessAnchorId: primeId,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: COOP_REPAIR_SOURCE,
          displayKind: "fee_exempt_repair",
          displayLabel: "협력 수수료 면제 정리",
          amount: fee,
          feeRateAppliedWas: j.meta?.feeRateApplied,
          labFeeTotal,
          primeLabAnchorId: primeId,
          purchasePayeeId: payeeId,
        },
        lines: [
          {
            accountCode: "LAB_SETTLEMENT_CREDIT",
            ownerRole: "requestor",
            ownerId: primeId,
            amount: -fee,
            amountExcludingVat: -fee,
            vatAmount: 0,
            creditKind: "SETTLEMENT",
            refType: "PRACTICE_TRANSFER",
            refId: transferId,
            meta: {
              source: COOP_REPAIR_SOURCE,
              displayLabel: "협력 수수료 면제 정리",
            },
          },
          {
            accountCode: "LAB_SETTLEMENT_CREDIT",
            ownerRole: "requestor",
            ownerId: payeeId,
            amount: fee,
            amountExcludingVat: fee,
            vatAmount: 0,
            creditKind: "SETTLEMENT",
            refType: "PRACTICE_TRANSFER",
            refId: transferId,
            meta: {
              source: COOP_REPAIR_SOURCE,
              displayLabel: "협력 수수료 면제 환급",
            },
          },
        ],
      });

      await LedgerJournal.updateOne(
        { journalId: j.journalId },
        {
          $set: {
            "meta.platformFee": 0,
            "meta.feeRateApplied": 0,
            "meta.purchaseAmount": labFeeTotal,
            "meta.labSettlementAmount": labFeeTotal,
          },
        },
      );

      await PracticeTransfer.updateOne(
        { _id: transferId },
        {
          $set: {
            "billing.feeRateApplied": 0,
            "billing.platformFeeRateApplied": 0,
          },
          $inc: {
            // 수수료 잔여가 abutsRevenue에 들어가 있던 경우 차감
            "billing.abutsRevenueAmount": -fee,
          },
        },
      );
      // abutsRevenueAmount floor at 0
      await PracticeTransfer.updateOne(
        { _id: transferId, "billing.abutsRevenueAmount": { $lt: 0 } },
        { $set: { "billing.abutsRevenueAmount": 0 } },
      );
    }

    // ── 4) 잔액 재집계 ────────────────────────────────────────
    if (apply && ownerIds.size > 0) {
      for (const id of ownerIds) {
        await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: id });
      }
    }
    summary.balanceOwners = [...ownerIds];

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await disconnectDb();
  }
}

main().catch(async (err) => {
  console.error("[repair-ptx-event-fee-exemption] failed", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
