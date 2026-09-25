// related files:
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/models/businessAnchor.model.js
//
// 하청 수수료 기본값 5% → 10%.
// devops payoutRates.subcontractFeeRate 가 없거나 구 기본(0.05)일 때만 갱신.
// 관리자가 다른 %로 저장한 값은 유지.
//
// Usage:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/migrate-subcontract-fee-10pct.js [--dry-run]
import "../../bootstrap/env.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { DEFAULT_SUBCONTRACT_FEE_RATE } from "../../services/creditRevenuePolicy.service.js";
import { connectDb, disconnectDb } from "./_mongo.js";

const PREV_DEFAULT_RATE = 0.05;

function isUnsetOrPrevDefault(rate) {
  if (rate == null) return true;
  const n = Number(rate);
  if (!Number.isFinite(n)) return true;
  return Math.abs(n - PREV_DEFAULT_RATE) < 1e-9;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await connectDb();
  const docs = await BusinessAnchor.find({ businessType: "devops" })
    .select({ name: 1, payoutRates: 1 })
    .lean();

  let updated = 0;
  let skipped = 0;
  for (const doc of docs) {
    const current = doc?.payoutRates?.subcontractFeeRate;
    if (!isUnsetOrPrevDefault(current)) {
      skipped += 1;
      console.log("[migrate-subcontract-fee-10pct] skip custom", {
        id: String(doc._id),
        rate: current,
      });
      continue;
    }
    updated += 1;
    console.log("[migrate-subcontract-fee-10pct] set", {
      id: String(doc._id),
      from: current == null ? null : Number(current),
      to: DEFAULT_SUBCONTRACT_FEE_RATE,
      dryRun,
    });
    if (dryRun) continue;
    await BusinessAnchor.updateOne(
      { _id: doc._id },
      {
        $set: {
          "payoutRates.subcontractFeeRate": DEFAULT_SUBCONTRACT_FEE_RATE,
          "payoutRates.updatedAt": new Date(),
        },
      },
    );
  }

  console.log("[migrate-subcontract-fee-10pct] done", {
    devops: docs.length,
    updated,
    skipped,
    dryRun,
  });
  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[migrate-subcontract-fee-10pct] failed", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
