import "../../bootstrap/env.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { connectDb, disconnectDb } from "./_mongo.js";

const DEFAULT_RATES = {
  manufacturerRate: 0.6,
  devopsRate: 0.1,
  salesmanRate: 0.1,
  adminRate: 0.2,
};

function clampRate(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function normalizeRates(rawRates) {
  const raw = rawRates || {};

  const manufacturerRate = clampRate(
    raw.manufacturerRate,
    DEFAULT_RATES.manufacturerRate,
  );

  // 새 정책 기준: 개발운영사/영업자 기본 10%를 명시적으로 저장
  // (영업자 미소개 케이스는 런타임 분기 규칙 65/25/10 적용)
  const devopsRate = clampRate(raw.devopsRate, DEFAULT_RATES.devopsRate);
  const salesmanRate = clampRate(raw.salesmanRate, DEFAULT_RATES.salesmanRate);

  // adminRate는 나머지 우선 계산, 비정상일 때만 기본값 사용
  const remainderAdmin = 1 - manufacturerRate - devopsRate - salesmanRate;
  const adminRate =
    remainderAdmin >= 0 && remainderAdmin <= 1
      ? remainderAdmin
      : clampRate(raw.adminRate, DEFAULT_RATES.adminRate);

  const total = manufacturerRate + devopsRate + salesmanRate + adminRate;
  if (total <= 0) {
    return {
      ...DEFAULT_RATES,
      totalRate: 1,
      isFallbackDefault: true,
    };
  }

  // 합계 오차 보정(정규화)
  return {
    manufacturerRate: round4(manufacturerRate / total),
    devopsRate: round4(devopsRate / total),
    salesmanRate: round4(salesmanRate / total),
    adminRate: round4(adminRate / total),
    totalRate: 1,
    isFallbackDefault: false,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { mongoUri } = await connectDb();
  console.log("[migrate-payout-rates] connected", {
    dryRun,
    mongoUriMasked: String(mongoUri || "").replace(/\/\/(.*)@/, "//***@"),
  });

  const query = {
    $or: [
      { "payoutRates.baseCommissionRate": { $exists: true } },
      { "payoutRates.salesmanDirectRate": { $exists: true } },
      { "payoutRates.devopsRate": { $exists: false } },
      { "payoutRates.salesmanRate": { $exists: false } },
      { "payoutRates.adminRate": { $exists: false } },
      { businessType: "devops" },
    ],
  };

  const anchors = await BusinessAnchor.find(query)
    .select({ _id: 1, businessType: 1, name: 1, payoutRates: 1 })
    .lean();

  let updated = 0;
  let skipped = 0;

  for (const anchor of anchors) {
    const normalized = normalizeRates(anchor?.payoutRates || {});
    const nextRates = {
      manufacturerRate: normalized.manufacturerRate,
      devopsRate: normalized.devopsRate,
      salesmanRate: normalized.salesmanRate,
      adminRate: normalized.adminRate,
      updatedAt: new Date(),
    };

    const current = anchor?.payoutRates || {};
    const same =
      round4(Number(current.manufacturerRate || -1)) === nextRates.manufacturerRate &&
      round4(Number(current.devopsRate || -1)) === nextRates.devopsRate &&
      round4(Number(current.salesmanRate || -1)) === nextRates.salesmanRate &&
      round4(Number(current.adminRate || -1)) === nextRates.adminRate;

    if (same) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      await BusinessAnchor.updateOne(
        { _id: anchor._id },
        {
          $set: {
            payoutRates: nextRates,
          },
        },
      );
    }

    updated += 1;

    console.log("[migrate-payout-rates] migrated", {
      anchorId: String(anchor._id),
      businessType: String(anchor.businessType || ""),
      name: String(anchor.name || ""),
      before: {
        manufacturerRate: current.manufacturerRate,
        baseCommissionRate: current.baseCommissionRate,
        salesmanDirectRate: current.salesmanDirectRate,
        devopsRate: current.devopsRate,
        salesmanRate: current.salesmanRate,
        adminRate: current.adminRate,
      },
      after: nextRates,
    });
  }

  console.log("[migrate-payout-rates] done", {
    scanned: anchors.length,
    updated,
    skipped,
    dryRun,
  });
}

main()
  .catch((error) => {
    console.error("[migrate-payout-rates] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
