#!/usr/bin/env node
// related files:
// - web/backend/utils/manufacturerLedgerDisplay.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/models/shippingPackage.model.js
//
// 1) 패키지 businessAnchorId ≠ 소속 의뢰 BA → 패키지 BA를 의뢰 BA로 맞춤
// 2) 한 패키지에 여러 BA 의뢰가 섞임 → 패키지 BA만 남기고,
//    다른 BA 의뢰는 별도 패키지로 분리(배송비 저널은 추가하지 않음)
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/backfill-shipping-package-ba-from-requests.js
//   ... --apply
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

const APPLY = process.argv.includes("--apply");

function toId(value) {
  return String(value?._id || value || "").trim();
}

async function run() {
  await connectDb();
  console.log("[backfill-shipping-package-ba] connected", { apply: APPLY });

  const packages = await ShippingPackage.find({})
    .select({
      businessAnchorId: 1,
      mailboxAddress: 1,
      shipDateYmd: 1,
      requestIds: 1,
      shippingFeeSupply: 1,
      shippingFeeVat: 1,
      createdBy: 1,
    })
    .lean();

  const requestIds = [
    ...new Set(
      packages.flatMap((pkg) =>
        (Array.isArray(pkg.requestIds) ? pkg.requestIds : []).map(toId),
      ),
    ),
  ].filter(Boolean);

  const requests = requestIds.length
    ? await Request.find({ _id: { $in: requestIds } })
        .select({ businessAnchorId: 1, requestId: 1, shippingPackageId: 1 })
        .lean()
    : [];
  const requestById = new Map(requests.map((r) => [toId(r._id), r]));

  const mismatchFixes = [];
  const splitFixes = [];

  for (const pkg of packages) {
    const pkgBa = toId(pkg.businessAnchorId);
    const rows = (Array.isArray(pkg.requestIds) ? pkg.requestIds : [])
      .map((id) => {
        const req = requestById.get(toId(id));
        if (!req) return null;
        return {
          requestId: toId(req._id),
          requestCode: req.requestId,
          ba: toId(req.businessAnchorId),
        };
      })
      .filter(Boolean);

    if (!rows.length) continue;

    const byBa = new Map();
    for (const row of rows) {
      if (!row.ba) continue;
      const list = byBa.get(row.ba) || [];
      list.push(row);
      byBa.set(row.ba, list);
    }

    if (byBa.size <= 1) {
      const onlyBa = [...byBa.keys()][0] || "";
      if (onlyBa && pkgBa && onlyBa !== pkgBa) {
        mismatchFixes.push({
          packageId: toId(pkg._id),
          shipDateYmd: pkg.shipDateYmd,
          mailboxAddress: pkg.mailboxAddress,
          fromBa: pkgBa,
          toBa: onlyBa,
        });
      }
      continue;
    }

    const keepBa =
      (pkgBa && byBa.has(pkgBa) && pkgBa) ||
      [...byBa.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    const keepIds = (byBa.get(keepBa) || []).map((row) => row.requestId);
    const foreign = [...byBa.entries()].filter(([ba]) => ba !== keepBa);

    splitFixes.push({
      packageId: toId(pkg._id),
      shipDateYmd: pkg.shipDateYmd,
      mailboxAddress: pkg.mailboxAddress,
      keepBa,
      keepIds,
      fromBa: pkgBa,
      foreign: foreign.map(([ba, list]) => ({
        ba,
        requestIds: list.map((row) => row.requestId),
        requestCodes: list.map((row) => row.requestCode),
      })),
      fee: pkg.shippingFeeSupply,
      vat: pkg.shippingFeeVat,
      createdBy: pkg.createdBy || null,
    });
  }

  const anchorIds = [
    ...new Set(
      [
        ...mismatchFixes.flatMap((row) => [row.fromBa, row.toBa]),
        ...splitFixes.flatMap((row) => [
          row.keepBa,
          row.fromBa,
          ...row.foreign.map((f) => f.ba),
        ]),
      ].filter(Boolean),
    ),
  ];
  const anchors = anchorIds.length
    ? await BusinessAnchor.find({ _id: { $in: anchorIds } })
        .select({ name: 1 })
        .lean()
    : [];
  const nameById = new Map(anchors.map((a) => [toId(a._id), a.name]));

  console.log("[backfill-shipping-package-ba] packages", packages.length);
  console.log(
    "[backfill-shipping-package-ba] ba-mismatch",
    mismatchFixes.length,
  );
  console.log("[backfill-shipping-package-ba] mixed-ba-split", splitFixes.length);

  for (const row of mismatchFixes.slice(0, 20)) {
    console.log("  mismatch", {
      ...row,
      fromName: nameById.get(row.fromBa) || null,
      toName: nameById.get(row.toBa) || null,
    });
  }
  for (const row of splitFixes.slice(0, 20)) {
    console.log("  split", {
      packageId: row.packageId,
      ymd: row.shipDateYmd,
      mb: row.mailboxAddress,
      keepBa: nameById.get(row.keepBa) || row.keepBa,
      keepCount: row.keepIds.length,
      foreign: row.foreign.map((f) => ({
        ba: nameById.get(f.ba) || f.ba,
        count: f.requestIds.length,
        codes: f.requestCodes,
      })),
    });
  }

  if (!APPLY) {
    console.log(
      "[backfill-shipping-package-ba] dry-run only. Re-run with --apply to mutate.",
    );
    await disconnectDb();
    return;
  }

  const collection = ShippingPackage.collection;
  const indexes = await collection.indexes();
  const legacyUniques = indexes.filter((idx) => {
    if (!idx?.unique || !idx?.key) return false;
    const keys = Object.keys(idx.key);
    const hasDay = idx.key.shipDateYmd === 1;
    const hasMailbox = idx.key.mailboxAddress === 1;
    if (!hasDay || !hasMailbox) return false;
    // 레거시 businessId 유니크, 또는 BA+일+칸 유니크(같은 날 재집하 금지) 제거.
    // recipientFingerprint 포함 복합 유니크는 유지.
    if (idx.key.recipientFingerprint) return false;
    return (
      idx.key.businessId === 1 ||
      idx.key.businessAnchorId === 1 ||
      keys.includes("businessId") ||
      keys.includes("businessAnchorId")
    );
  });
  for (const idx of legacyUniques) {
    console.log(
      "[backfill-shipping-package-ba] drop blocking unique index",
      idx.name,
    );
    await collection.dropIndex(idx.name);
  }
  // 모델 SSOT: non-unique 복합 인덱스 보장
  await collection.createIndex(
    { businessAnchorId: 1, shipDateYmd: 1, mailboxAddress: 1 },
    { name: "businessAnchorId_1_shipDateYmd_1_mailboxAddress_1" },
  );

  let updatedMismatch = 0;
  for (const row of mismatchFixes) {
    const result = await ShippingPackage.updateOne(
      { _id: row.packageId },
      { $set: { businessAnchorId: row.toBa } },
    );
    if (result.modifiedCount) updatedMismatch += 1;
  }

  let splitPackages = 0;
  let stripped = 0;
  for (const row of splitFixes) {
    const pkgDoc = await ShippingPackage.findById(row.packageId).lean();
    const currentIds = (Array.isArray(pkgDoc?.requestIds) ? pkgDoc.requestIds : []).map(
      toId,
    );
    const keepSet = new Set(row.keepIds);
    const alreadyStripped = row.keepIds.every((id) => currentIds.includes(id)) &&
      currentIds.every((id) => keepSet.has(id));

    if (row.fromBa !== row.keepBa) {
      await ShippingPackage.updateOne(
        { _id: row.packageId },
        { $set: { businessAnchorId: row.keepBa } },
      );
    }
    if (!alreadyStripped) {
      await ShippingPackage.updateOne(
        { _id: row.packageId },
        {
          $set: {
            requestIds: row.keepIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      );
    }
    stripped += 1;

    for (const foreign of row.foreign) {
      let created = await ShippingPackage.findOne({
        businessAnchorId: foreign.ba,
        shipDateYmd: row.shipDateYmd,
        mailboxAddress: row.mailboxAddress,
      });
      if (!created) {
        created = await ShippingPackage.create({
          businessAnchorId: foreign.ba,
          shipDateYmd: row.shipDateYmd,
          mailboxAddress: row.mailboxAddress,
          requestIds: foreign.requestIds.map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
          shippingFeeSupply: row.fee ?? 3500,
          shippingFeeVat: row.vat ?? 0,
          createdBy: row.createdBy,
        });
        splitPackages += 1;
      } else {
        await ShippingPackage.updateOne(
          { _id: created._id },
          {
            $addToSet: {
              requestIds: {
                $each: foreign.requestIds.map(
                  (id) => new mongoose.Types.ObjectId(id),
                ),
              },
            },
          },
        );
      }
      await Request.updateMany(
        { _id: { $in: foreign.requestIds } },
        { $set: { shippingPackageId: created._id } },
      );
    }
  }

  console.log("[backfill-shipping-package-ba] updatedMismatch", updatedMismatch);
  console.log("[backfill-shipping-package-ba] strippedPackages", stripped);
  console.log("[backfill-shipping-package-ba] createdSplitPackages", splitPackages);

  // 패키지 requestIds에서 빠진 채 shippingPackageId만 남은 orphan 정리 + 분리 패키지 생성
  const allPkgs = await ShippingPackage.find({})
    .select({ businessAnchorId: 1, mailboxAddress: 1, shipDateYmd: 1, requestIds: 1, shippingFeeSupply: 1, shippingFeeVat: 1, createdBy: 1 })
    .lean();
  const memberSetByPkg = new Map(
    allPkgs.map((pkg) => [
      toId(pkg._id),
      new Set((pkg.requestIds || []).map(toId)),
    ]),
  );
  const orphanReqs = await Request.find({
    shippingPackageId: { $ne: null },
  })
    .select({
      businessAnchorId: 1,
      requestId: 1,
      shippingPackageId: 1,
      mailboxAddress: 1,
    })
    .lean();

  const orphans = orphanReqs.filter((req) => {
    const pkgId = toId(req.shippingPackageId);
    const members = memberSetByPkg.get(pkgId);
    if (!members) return true;
    return !members.has(toId(req._id));
  });

  console.log("[backfill-shipping-package-ba] orphan-request-links", orphans.length);

  let orphanRepaired = 0;
  for (const req of orphans) {
    const ba = toId(req.businessAnchorId);
    const stalePkg = allPkgs.find((pkg) => toId(pkg._id) === toId(req.shippingPackageId));
    const shipDateYmd = stalePkg?.shipDateYmd || "";
    const mailboxAddress =
      String(req.mailboxAddress || stalePkg?.mailboxAddress || "").trim();
    if (!ba || !shipDateYmd || !mailboxAddress) {
      await Request.updateOne(
        { _id: req._id },
        { $set: { shippingPackageId: null } },
      );
      orphanRepaired += 1;
      continue;
    }
    let created = await ShippingPackage.findOne({
      businessAnchorId: ba,
      shipDateYmd,
      mailboxAddress,
    });
    if (!created) {
      created = await ShippingPackage.create({
        businessAnchorId: ba,
        shipDateYmd,
        mailboxAddress,
        requestIds: [req._id],
        shippingFeeSupply: stalePkg?.shippingFeeSupply ?? 3500,
        shippingFeeVat: stalePkg?.shippingFeeVat ?? 0,
        createdBy: stalePkg?.createdBy || null,
      });
      splitPackages += 1;
    } else {
      await ShippingPackage.updateOne(
        { _id: created._id },
        { $addToSet: { requestIds: req._id } },
      );
    }
    await Request.updateOne(
      { _id: req._id },
      { $set: { shippingPackageId: created._id } },
    );
    orphanRepaired += 1;
  }
  console.log("[backfill-shipping-package-ba] orphanRepaired", orphanRepaired);
  console.log(
    "[backfill-shipping-package-ba] createdSplitPackages(final)",
    splitPackages,
  );
  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[backfill-shipping-package-ba] failed", err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
