// related files:
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/rules.md
//
// 지정 거래 수수료: 레거시 기본(off + 5%) → on + 1%.
// 관리자가 커스텀 요율을 넣고 의도적으로 off 한 경우(≠0.05)는 건드리지 않음.
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

function isLegacyDefaultRate(rate) {
  if (rate == null) return true;
  const n = Number(rate);
  return Number.isFinite(n) && Math.abs(n - LEGACY_DEFAULT_RATE) < 1e-9;
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

  if (enabledRaw === true) {
    if (isLegacyDefaultRate(rateRaw) || rateRaw == null) {
      $set["payoutRates.directPlatformFeeRate"] =
        DEFAULT_DIRECT_PLATFORM_FEE_RATE;
      reason = "enabled_true_legacy_or_missing_rate→1pct";
    } else {
      reason = "skip_custom_enabled";
    }
  } else if (enabledRaw === false) {
    if (isLegacyDefaultRate(rateRaw) || rateRaw == null) {
      $set["payoutRates.directPlatformFeeEnabled"] =
        DEFAULT_DIRECT_PLATFORM_FEE_ENABLED;
      $set["payoutRates.directPlatformFeeRate"] =
        DEFAULT_DIRECT_PLATFORM_FEE_RATE;
      reason = "legacy_off_5pct→on_1pct";
    } else {
      reason = "skip_intentional_off_with_custom_rate";
    }
  } else {
    $set["payoutRates.directPlatformFeeEnabled"] =
      DEFAULT_DIRECT_PLATFORM_FEE_ENABLED;
    if (isLegacyDefaultRate(rateRaw) || rateRaw == null) {
      $set["payoutRates.directPlatformFeeRate"] =
        DEFAULT_DIRECT_PLATFORM_FEE_RATE;
    }
    reason = "unset→defaults";
  }

  if (Object.keys($set).length === 0) {
    console.log("[migrate-direct-platform-fee-1pct] no change", {
      devopsId: String(devops._id),
      reason,
      enabledRaw,
      rateRaw,
    });
    await disconnectDb();
    return;
  }

  $set["payoutRates.updatedAt"] = new Date();

  console.log("[migrate-direct-platform-fee-1pct] update", {
    devopsId: String(devops._id),
    reason,
    before: { enabledRaw, rateRaw },
    $set,
  });

  if (!dryRun) {
    await BusinessAnchor.updateOne({ _id: devops._id }, { $set });
  }

  await disconnectDb();
  console.log("[migrate-direct-platform-fee-1pct] done", { dryRun });
}

main().catch(async (err) => {
  console.error("[migrate-direct-platform-fee-1pct] failed", err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
