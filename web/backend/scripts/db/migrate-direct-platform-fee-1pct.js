// related files:
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/rules.md
//
// 관리자 초기값 시드: 플랫폼 사용료 2% + 이벤트 off(실효 0%).
// 이미 커스텀 %(≠0·≠0.01·≠0.02·≠0.05)로 저장한 경우(on/off 무관)는 건드리지 않음.
//
// Usage:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/migrate-direct-platform-fee-1pct.js [--dry-run]
import "../../bootstrap/env.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  DEFAULT_DIRECT_PLATFORM_FEE_ENABLED,
  DEFAULT_DIRECT_PLATFORM_FEE_RATE,
} from "../../services/creditRevenuePolicy.service.js";
import { connectDb, disconnectDb } from "./_mongo.js";

const LEGACY_DEFAULT_RATE = 0.05;

function isPolicyOrLegacyRate(rate) {
  if (rate == null) return true;
  const n = Number(rate);
  if (!Number.isFinite(n)) return true;
  return (
    Math.abs(n) < 1e-9 ||
    Math.abs(n - 0.01) < 1e-9 ||
    Math.abs(n - LEGACY_DEFAULT_RATE) < 1e-9 ||
    Math.abs(n - DEFAULT_DIRECT_PLATFORM_FEE_RATE) < 1e-9
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { mongoUri } = await connectDb();
  console.log("[migrate-direct-platform-fee-1pct] connected", {
    dryRun,
    mongoUriMasked: String(mongoUri || "").replace(/\/\/(.*)@/, "//***@"),
  });

  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ _id: 1, name: 1, payoutRates: 1 })
    .lean();

  if (!devops?._id) {
    console.log("[migrate-direct-platform-fee-1pct] no devops BA; skip");
    await disconnectDb();
    return;
  }

  const rates = devops.payoutRates || {};
  const enabledRaw = rates.directPlatformFeeEnabled;
  const rateRaw = rates.directPlatformFeeRate;

  const $set = {};
  let reason = "";

  if (enabledRaw === true && !isPolicyOrLegacyRate(rateRaw)) {
    reason = "skip_intentional_on_with_custom_rate";
  } else if (enabledRaw === false && !isPolicyOrLegacyRate(rateRaw)) {
    reason = "skip_intentional_off_with_custom_rate";
  } else {
    $set["payoutRates.directPlatformFeeEnabled"] =
      DEFAULT_DIRECT_PLATFORM_FEE_ENABLED;
    $set["payoutRates.directPlatformFeeRate"] =
      DEFAULT_DIRECT_PLATFORM_FEE_RATE;
    $set["payoutRates.updatedAt"] = new Date();
    reason =
      enabledRaw === true
        ? "seed_event_off_initial_2pct"
        : "seed_event_off_initial_2pct";
  }

  console.log("[migrate-direct-platform-fee-1pct] plan", {
    devopsId: String(devops._id),
    name: devops.name,
    before: {
      directPlatformFeeEnabled: enabledRaw,
      directPlatformFeeRate: rateRaw,
    },
    reason,
    $set,
  });

  if (!dryRun && Object.keys($set).length > 0) {
    await BusinessAnchor.updateOne({ _id: devops._id }, { $set });
    console.log("[migrate-direct-platform-fee-1pct] updated");
  } else if (dryRun) {
    console.log("[migrate-direct-platform-fee-1pct] dry-run only");
  } else {
    console.log("[migrate-direct-platform-fee-1pct] no changes");
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error("[migrate-direct-platform-fee-1pct] failed", err);
  process.exitCode = 1;
});
