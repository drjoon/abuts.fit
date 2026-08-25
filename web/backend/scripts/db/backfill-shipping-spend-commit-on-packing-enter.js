#!/usr/bin/env node
// related files:
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/scripts/db/_commitOccurredAt.js
//
// 포장.발송 진입 SSOT로 누락된 SHIPPING_SPEND_COMMIT 백필.
// (집하 시점 과금 레거시 구간에서 commit이 빠진 패키지 보정)
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/backfill-shipping-spend-commit-on-packing-enter.js
//   ... --apply
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import { pickShippingCommitOccurredAt } from "./_commitOccurredAt.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { commitShippingFeeForPackage } from "../../controllers/requests/common.review.helpers.js";
import { ensureShippingPackageForPickup } from "../../controllers/requests/shipping.Requestor.helpers.js";
import { isManufacturerSampleRequest } from "../../controllers/requests/mailbox.utils.js";

const APPLY = process.argv.includes("--apply");

function toId(value) {
  return String(value?._id || value || "").trim();
}

async function packageHasShippingCommit(packageId) {
  const pkgId = toId(packageId);
  if (!pkgId) return false;
  const spendUniqueKey = `shippingPackage:${pkgId}:shipping_fee`;
  const rows = await LedgerJournal.find({
    $or: [
      { idempotencyKey: `gl:${spendUniqueKey}` },
      {
        eventType: "SHIPPING_SPEND_COMMIT",
        refType: "SHIPPING_PACKAGE",
        refId: new mongoose.Types.ObjectId(pkgId),
      },
    ],
  })
    .select({ journalId: 1 })
    .limit(1)
    .lean();
  return rows.length > 0;
}

async function run() {
  await connectDb();
  console.log("[backfill-shipping-spend-commit] connected", { apply: APPLY });

  const stageFilter = { $in: ["포장.발송", "추적관리"] };
  const requests = await Request.find({
    manufacturerStage: stageFilter,
    requestCategory: { $in: ["order", "rnd_sample", "copied_sample"] },
  })
    .select({
      requestId: 1,
      requestCategory: 1,
      manufacturerStage: 1,
      mailboxAddress: 1,
      businessAnchorId: 1,
      shippingPackageId: 1,
      caseInfos: 1,
      productionSchedule: 1,
      createdAt: 1,
      partnerBilling: 1,
    })
    .lean();

  const billable = requests.filter((row) => !isManufacturerSampleRequest(row));
  console.log("[backfill-shipping-spend-commit] candidate requests", {
    total: requests.length,
    billable: billable.length,
  });

  const byPackage = new Map();
  const missingPackage = [];

  for (const req of billable) {
    let packageId = toId(req.shippingPackageId);
    if (!packageId) {
      missingPackage.push(req);
      continue;
    }
    const bucket = byPackage.get(packageId) || [];
    bucket.push(req);
    byPackage.set(packageId, bucket);
  }

  let linkedPackages = 0;
  for (const req of missingPackage) {
    if (!String(req.mailboxAddress || "").trim()) {
      console.warn("[skip] no mailbox", { requestId: req.requestId });
      continue;
    }
    if (!APPLY) {
      console.log("[dry-run] would create package for", req.requestId);
      continue;
    }
    try {
      const liveReq = await Request.findById(req._id);
      if (!liveReq) continue;
      const pkg = await ensureShippingPackageForPickup({
        requests: [liveReq],
        actorUserId: null,
      });
      if (!pkg?._id) continue;
      liveReq.shippingPackageId = pkg._id;
      await liveReq.save();
      packageId = toId(pkg._id);
      const bucket = byPackage.get(packageId) || [];
      bucket.push(liveReq.toObject ? liveReq.toObject() : req);
      byPackage.set(packageId, bucket);
      linkedPackages += 1;
    } catch (err) {
      console.error("[link-package-failed]", {
        requestId: req.requestId,
        message: err?.message || String(err),
      });
    }
  }

  let skippedExisting = 0;
  let posted = 0;
  let failed = 0;

  for (const [packageId, rows] of byPackage.entries()) {
    if (await packageHasShippingCommit(packageId)) {
      skippedExisting += 1;
      continue;
    }

    const pkg = await ShippingPackage.findById(packageId).lean();
    if (!pkg?._id) {
      console.warn("[skip] package missing", { packageId });
      continue;
    }

    const representative = rows[0];
    const occurredAt =
      pickShippingCommitOccurredAt(pkg, representative) ||
      pkg.createdAt ||
      representative?.createdAt ||
      new Date();

    console.log("[candidate]", {
      packageId,
      mailbox: pkg.mailboxAddress,
      shipDateYmd: pkg.shipDateYmd,
      requestCount: rows.length,
      sampleRequestId: representative?.requestId,
      occurredAt,
    });

    if (!APPLY) continue;

    try {
      const liveRows = await Request.find({
        _id: { $in: rows.map((r) => r._id).filter(Boolean) },
      });
      const result = await commitShippingFeeForPackage({
        pkg,
        requests: liveRows,
        mailboxAddress: pkg.mailboxAddress,
        actorUserId: null,
        throwOnInsufficient: false,
        occurredAt,
      });
      if (
        result?.didSpend ||
        result?.reason === "from_hold" ||
        result?.reason === "already_spent"
      ) {
        posted += 1;
      } else {
        console.warn("[no-spend]", {
          packageId,
          reason: result?.reason || "unknown",
        });
      }
    } catch (err) {
      failed += 1;
      console.error("[commit-failed]", {
        packageId,
        message: err?.message || String(err),
      });
    }
  }

  console.log("[backfill-shipping-spend-commit] done", {
    apply: APPLY,
    packages: byPackage.size,
    linkedPackages,
    skippedExisting,
    posted,
    failed,
  });

  await disconnectDb();
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => null);
  process.exit(1);
});
