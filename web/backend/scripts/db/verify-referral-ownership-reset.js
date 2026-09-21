#!/usr/bin/env node
// related files:
// - web/backend/services/referralOwnershipReset.service.js
// - web/backend/scripts/db/_mongo.js
/**
 * 소개 귀속 90일 리셋 dry-run 검증.
 *
 * cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/verify-referral-ownership-reset.js
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import { resetExpiredReferralOwnerships } from "../../services/referralOwnershipReset.service.js";

async function main() {
  await connectDb();
  const result = await resetExpiredReferralOwnerships({
    dryRun: true,
    limit: 2000,
  });
  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        scanned: result.scanned,
        wouldReset: result.reset,
        skipped: result.skipped,
        errors: result.errors,
        cutoffAt: result.cutoffAt,
        sampleAnchorIds: (result.resetAnchorIds || []).slice(0, 10),
        exhausted: result.exhausted,
      },
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
    /* ignore */
  }
  process.exit(1);
});
