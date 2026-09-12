// related files:
// - web/backend/services/practiceTransferRemakeCharge.service.js
// - web/backend/scripts/db/delete-remake-fee-chat-messages.js
//
// 리메이크비 무료 정책 — 기존 remakeCharges(청구·정산·billing 가산) 전부 취소.
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/cancel-all-remake-charges.js
//
// Apply: --apply
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { cancelPracticeTransferRemakeCharge } from "../../services/practiceTransferRemakeCharge.service.js";
import { practiceTransferNotDeletedMongoFilter } from "../../utils/practiceTransferStage.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await connectDb();

  const docs = await PracticeTransfer.find({
    ...practiceTransferNotDeletedMongoFilter(),
    remakeCharges: { $exists: true, $ne: [] },
  })
    .select({
      transferId: 1,
      remakeCharges: 1,
      billing: 1,
      practiceBusinessAnchorId: 1,
      practiceUserId: 1,
      targetLabAnchorId: 1,
      matchingMode: 1,
      autoMatch: 1,
      toothWorks: 1,
    })
    .lean(false);

  const plan = docs.map((doc) => {
    const charges = Array.isArray(doc.remakeCharges) ? doc.remakeCharges : [];
    const feeSum = charges.reduce((sum, row) => {
      const fee = Math.max(
        0,
        Math.round(
          Number(row?.billingDelta?.total ?? row?.billingDelta?.labFeeTotal ?? 0),
        ),
      );
      return sum + fee;
    }, 0);
    return {
      transferId: doc.transferId,
      chargeCount: charges.length,
      feeSum,
      charges: charges.map((row) => ({
        chargeIndex: row?.chargeIndex,
        source: row?.source,
        summaryLabel: row?.summaryLabel,
        fee: Math.max(
          0,
          Math.round(
            Number(
              row?.billingDelta?.total ?? row?.billingDelta?.labFeeTotal ?? 0,
            ),
          ),
        ),
        chargedAt: row?.chargedAt,
      })),
    };
  });

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        candidates: plan.length,
        feeTotal: plan.reduce((s, r) => s + r.feeSum, 0),
        plan,
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("dry-run only. re-run with --apply to cancel.");
    await disconnectDb();
    return;
  }

  const touched = new Set();
  let canceled = 0;
  let failed = 0;

  for (const doc of docs) {
    const charges = Array.isArray(doc.remakeCharges) ? [...doc.remakeCharges] : [];
    // 뒤에서부터 취소해 index 꼬임 방지
    const indices = charges
      .map((row) => Math.trunc(Number(row?.chargeIndex)))
      .filter((idx) => Number.isFinite(idx) && idx >= 0)
      .sort((a, b) => b - a);

    let working = doc;
    for (const chargeIndex of indices) {
      // eslint-disable-next-line no-await-in-loop
      const result = await cancelPracticeTransferRemakeCharge({
        transferDoc: working,
        chargeIndex,
        actorUserId: null,
      });
      if (!result.ok) {
        failed += 1;
        console.error(
          `[cancel-remake] FAIL ${doc.transferId} idx=${chargeIndex}`,
          result.reason || result.message,
        );
        continue;
      }
      canceled += 1;
      working = result.updated;
      const practiceId = String(working.practiceBusinessAnchorId || "").trim();
      const labId = String(working.targetLabAnchorId || "").trim();
      if (practiceId) touched.add(practiceId);
      if (labId) touched.add(labId);
      console.log(
        `[cancel-remake] OK ${doc.transferId} idx=${chargeIndex} fee=${Math.abs(Number(result.billingDelta?.total || 0))}`,
      );
    }
  }

  for (const ownerId of touched) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await emitCreditBalanceUpdatedToBusiness(ownerId);
    } catch {
      // best-effort
    }
  }

  const remain = await PracticeTransfer.countDocuments({
    ...practiceTransferNotDeletedMongoFilter(),
    remakeCharges: { $exists: true, $ne: [] },
  });

  console.log(
    JSON.stringify(
      { canceled, failed, remainWithCharges: remain, balanceTouched: touched.size },
      null,
      2,
    ),
  );
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
