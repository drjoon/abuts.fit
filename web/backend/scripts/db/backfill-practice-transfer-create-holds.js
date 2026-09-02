// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/services/practiceTransferBilling.service.js
// - .cursor/rules/mongodb-uri-test.mdc
//
// 수락 전(requestorDownloadedAt null)인데 billing.heldAt이 없는 PracticeTransfer에
// 생성 시점 hold를 보강한다. (2026-09-02 create-hold 제거 창에서 생긴 건)
//
// Usage (TEST DB):
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/backfill-practice-transfer-create-holds.js
//   ... --apply
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { holdPracticeTransferCredits } from "../../services/practiceTransferBilling.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  return { apply: args.includes("--apply") };
}

async function main() {
  const { apply } = parseArgs(process.argv);
  await connectDb();
  try {
    const docs = await PracticeTransfer.find({
      status: { $nin: ["deleted", "canceled"] },
      requestorDownloadedAt: null,
      workCanceledAt: null,
      $or: [
        { "billing.heldAt": null },
        { "billing.heldAt": { $exists: false } },
      ],
      "billing.total": { $gt: 0 },
    })
      .select({
        transferId: 1,
        practiceBusinessAnchorId: 1,
        toothWorks: 1,
        billing: 1,
      })
      .lean();

    console.log(
      `[backfill-ptx-create-holds] candidates=${docs.length} apply=${apply}`,
    );

    let ok = 0;
    let skipped = 0;
    let failed = 0;
    for (const doc of docs) {
      const total = Math.max(0, Math.round(Number(doc.billing?.total || 0)));
      const lab = Math.max(0, Math.round(Number(doc.billing?.labFeeTotal || 0)));
      const abut = Math.max(
        0,
        Math.round(Number(doc.billing?.abutmentRetailTotal || 0)),
      );
      console.log(
        `  ${doc.transferId} total=${total} lab=${lab} abut=${abut}`,
      );
      if (!apply) continue;

      try {
        const holdResult = await holdPracticeTransferCredits({
          transfer: doc,
          toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
          holdAmount: total,
          holdLabAmount: lab,
          holdAbutmentAmount: abut,
          actorUserId: null,
          skipExistingHoldCheck: false,
        });
        if (
          !(
            holdResult?.held ||
            holdResult?.reason === "already_held" ||
            holdResult?.reason === "zero_fee"
          )
        ) {
          failed += 1;
          console.warn(
            `    FAIL reason=${holdResult?.reason || "unknown"}`,
          );
          continue;
        }
        if (holdResult?.reason === "already_held") {
          skipped += 1;
          continue;
        }
        if (holdResult?.reason === "zero_fee") {
          skipped += 1;
          continue;
        }

        const heldAt = new Date();
        const heldBilling = {
          ...(doc.billing && typeof doc.billing === "object" ? doc.billing : {}),
          heldAt,
          heldTotal: Number(holdResult.heldTotal || total),
          heldLabTotal: Number(holdResult.heldLabTotal ?? lab),
          heldAbutmentTotal: Number(holdResult.heldAbutmentTotal ?? abut),
          heldDesignFeeTotal: Number(holdResult.heldDesignFeeTotal || 0),
          heldShippingLabTotal: Number(holdResult.heldShippingLabTotal || 0),
          heldShippingAbutsTotal: Number(
            holdResult.heldShippingAbutsTotal || 0,
          ),
          holdFromPaid: Number(holdResult.fromPaid || 0),
          holdFromFreeRequest: Number(holdResult.fromFreeRequest || 0),
          holdFromFreeShipping: Number(holdResult.fromFreeShipping || 0),
        };
        await PracticeTransfer.updateOne(
          { _id: doc._id },
          { $set: { billing: heldBilling } },
        );
        if (Number(holdResult.heldTotal || 0) > 0 && doc.practiceBusinessAnchorId) {
          try {
            await emitCreditBalanceUpdatedToBusiness({
              businessAnchorId: doc.practiceBusinessAnchorId,
              balanceDelta: -Number(holdResult.heldTotal || 0),
              reason: "practice_transfer_hold_backfill",
              refId: doc._id,
            });
          } catch {
            // ignore realtime
          }
        }
        ok += 1;
        console.log(`    OK heldTotal=${holdResult.heldTotal}`);
      } catch (err) {
        failed += 1;
        console.warn(`    FAIL ${err?.message || err}`);
      }
    }

    console.log(
      `[backfill-ptx-create-holds] done ok=${ok} skipped=${skipped} failed=${failed}`,
    );
    if (!apply) {
      console.log("Dry run only. Re-run with --apply to write holds.");
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
