// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/scripts/db/_mongo.js
/**
 * 기존 데모 치과: 잔여 DEMO_CREDIT 회수·grant 취소. demoMode는 유지(신규 규칙: 0원+PTX 마이너스).
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/clawback-legacy-demo-credit.js
 *
 * Dry-run (default): 변경 없이 대상만 출력.
 * Apply: APPLY=1 ...
 */
import mongoose from "mongoose";
import {
  assertSafeToMutateDb,
  getMongoUri,
} from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import { clawBackLegacyDemoCreditGrant } from "../../controllers/businesses/business.demoMode.util.js";
import {
  getBusinessCreditBalanceSnapshot,
  upsertBusinessCreditBalanceFromLedger,
} from "../../services/creditBalance.service.js";

async function main() {
  const apply = ["1", "true", "yes"].includes(
    String(process.env.APPLY || "")
      .trim()
      .toLowerCase(),
  );
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  console.log("apply", apply);

  await mongoose.connect(uri);

  const grants = await FreeCreditGrant.find({
    type: "DEMO_CREDIT",
    isOverride: false,
    canceledAt: null,
  })
    .select({
      _id: 1,
      businessAnchorId: 1,
      businessNumber: 1,
      amount: 1,
      grantJournalId: 1,
    })
    .lean();

  console.log("active DEMO_CREDIT grants", grants.length);

  let clawed = 0;
  let canceled = 0;
  let skipped = 0;
  let errors = 0;

  for (const grant of grants) {
    const anchorId = grant.businessAnchorId;
    if (!anchorId) {
      skipped += 1;
      console.log("skip grant without anchor", String(grant._id));
      continue;
    }

    const anchor = await BusinessAnchor.findById(anchorId)
      .select({
        name: 1,
        demoMode: 1,
        demoModeExitedAt: 1,
        requestorKind: 1,
      })
      .lean();

    if (!anchor) {
      skipped += 1;
      console.log("skip missing anchor", String(anchorId));
      continue;
    }

    // 이미 실사용 전환된 사업자: grant만 정리(잔고 회수는 exit 시 했을 수 있음)
    const stillDemo =
      Boolean(anchor.demoMode) && !anchor.demoModeExitedAt;

    const before = await getBusinessCreditBalanceSnapshot({
      businessAnchorId: anchorId,
    });

    console.log("target", {
      grantId: String(grant._id),
      anchorId: String(anchorId),
      name: anchor.name,
      stillDemo,
      freeRequestBefore: before.freeRequestCredit,
      grantAmount: grant.amount,
    });

    if (!apply) {
      skipped += 1;
      continue;
    }

    try {
      const { clawedBack, clawJournalId } = await clawBackLegacyDemoCreditGrant({
        businessAnchorId: anchorId,
        reason: "데모 크레딧 정책 변경(0원 시작)",
        freeRequestCredit: before.freeRequestCredit,
      });

      const now = new Date();
      await FreeCreditGrant.updateOne(
        { _id: grant._id, canceledAt: null },
        {
          $set: {
            canceledAt: now,
            cancelReason: "데모 크레딧 정책 변경(0원 시작)",
            cancelJournalId: clawJournalId ? String(clawJournalId) : null,
          },
        },
      );
      canceled += 1;
      if (clawedBack > 0) clawed += 1;

      await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: anchorId,
      });

      const after = await getBusinessCreditBalanceSnapshot({
        businessAnchorId: anchorId,
      });
      console.log("done", {
        clawedBack,
        freeRequestAfter: after.freeRequestCredit,
        demoMode: stillDemo,
      });
    } catch (e) {
      errors += 1;
      console.error("failed", String(anchorId), e?.message || e);
    }
  }

  console.log("summary", { clawed, canceled, skipped, errors, apply });
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
