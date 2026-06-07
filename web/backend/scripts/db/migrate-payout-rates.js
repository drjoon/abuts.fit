import "../../bootstrap/env.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { connectDb, disconnectDb } from "./_mongo.js";

const DEFAULT_RATES = {
  manufacturerRate: 0.6,
  devopsRate: 0.1,
  salesmanRate: 0.1,
  adminRate: 0.2,
};

const NO_SALESMAN_RATES = {
  manufacturerRate: 0.65,
  devopsRate: 0.1,
  salesmanRate: 0,
  adminRate: 0.25,
};

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function getTargetRatesForAnchor(anchor, referrerTypeByAnchorId) {
  // requestor는 referredByAnchorId를 실제 조회해 케이스별 적용
  if (String(anchor?.businessType || "") === "requestor") {
    const referredByAnchorId = anchor?.referredByAnchorId
      ? String(anchor.referredByAnchorId)
      : "";
    const referrerType = referredByAnchorId
      ? String(referrerTypeByAnchorId.get(referredByAnchorId) || "")
      : "";

    // rules.md 2.4: 영업자 소개가 있는 경우(기본)
    if (referrerType === "salesman") {
      return {
        ...DEFAULT_RATES,
        reason: "requestor_referred_by_salesman",
      };
    }

    // rules.md 2.4: 영업자 소개 없이 가입한 의뢰자 주문건
    return {
      ...NO_SALESMAN_RATES,
      reason: referredByAnchorId
        ? `requestor_referred_by_non_salesman(${referrerType || "unknown"})`
        : "requestor_without_referrer",
    };
  }

  // requestor 외 사업자는 기본값으로 정렬
  return {
    ...DEFAULT_RATES,
    reason: "non_requestor_default",
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
    payoutRates: { $exists: true },
  };

  const anchors = await BusinessAnchor.find(query)
    .select({
      _id: 1,
      businessType: 1,
      name: 1,
      referredByAnchorId: 1,
      payoutRates: 1,
    })
    .lean();

  const referrerTypeByAnchorId = new Map(
    anchors.map((a) => [String(a._id), String(a.businessType || "")]),
  );

  let updated = 0;
  let skipped = 0;

  for (const anchor of anchors) {
    const normalized = getTargetRatesForAnchor(anchor, referrerTypeByAnchorId);
    const nextRates = {
      manufacturerRate: normalized.manufacturerRate,
      devopsRate: normalized.devopsRate,
      salesmanRate: normalized.salesmanRate,
      adminRate: normalized.adminRate,
      updatedAt: new Date(),
    };

    const current = anchor?.payoutRates || {};
    const same =
      round4(Number(current.manufacturerRate || -1)) ===
        nextRates.manufacturerRate &&
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
      referrerAnchorId: anchor?.referredByAnchorId
        ? String(anchor.referredByAnchorId)
        : null,
      referrerType: anchor?.referredByAnchorId
        ? String(
            referrerTypeByAnchorId.get(String(anchor.referredByAnchorId)) || "",
          )
        : null,
      reason: normalized.reason,
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
