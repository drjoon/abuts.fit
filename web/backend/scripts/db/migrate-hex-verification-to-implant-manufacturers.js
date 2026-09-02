// related files:
// - web/backend/utils/designSoftwareHex.js
// - web/backend/models/user.model.js
// - web/backend/controllers/admin/admin.hexVerification.controller.js
// change-log:
// - 2026-09-03: 계정 단일 hexVerificationResultHex → 임플란트 제조사별 hexByImplantManufacturer 시드
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/migrate-hex-verification-to-implant-manufacturers.js
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  CNC_HEX_IMPLANT_MANUFACTURERS,
  normalizeHexVerificationResultHex,
} from "../../utils/designSoftwareHex.js";

const buildRowsFromLegacy = (verifiedHex, verifiedAt, verifiedBy) =>
  CNC_HEX_IMPLANT_MANUFACTURERS.map((manufacturer) => ({
    manufacturer,
    applyHex30: verifiedHex === "헥스30도회전",
    verifiedHex,
    verifiedAt: verifiedAt || null,
    verifiedBy: verifiedBy || null,
  }));

async function migrateCollection(Model, label) {
  const cursor = Model.find({
    "requestSettings.hexVerificationResultHex": {
      $in: ["STL모델대로", "헥스30도회전", "0", "30"],
    },
  })
    .select({
      _id: 1,
      "requestSettings.hexVerificationResultHex": 1,
      "requestSettings.hexVerificationCompletedAt": 1,
      "requestSettings.hexVerificationCompletedBy": 1,
      "requestSettings.hexByImplantManufacturer": 1,
    })
    .cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const rs = doc.requestSettings || {};
    const verifiedHex = normalizeHexVerificationResultHex(
      rs.hexVerificationResultHex,
    );
    if (!verifiedHex) {
      skipped += 1;
      continue;
    }

    const existing = Array.isArray(rs.hexByImplantManufacturer)
      ? rs.hexByImplantManufacturer
      : [];
    const alreadyHasVerified = existing.some((row) =>
      Boolean(normalizeHexVerificationResultHex(row?.verifiedHex)),
    );
    if (alreadyHasVerified && existing.length >= CNC_HEX_IMPLANT_MANUFACTURERS.length) {
      skipped += 1;
      continue;
    }

    const rows = buildRowsFromLegacy(
      verifiedHex,
      rs.hexVerificationCompletedAt,
      rs.hexVerificationCompletedBy,
    );

    await Model.updateOne(
      { _id: doc._id },
      {
        $set: {
          "requestSettings.hexByImplantManufacturer": rows,
          "requestSettings.updatedAt": new Date(),
        },
      },
    );
    updated += 1;
  }

  console.log(`[db] migrate-hex-by-implant (${label})`, {
    scanned,
    updated,
    skipped,
  });
  return { scanned, updated, skipped };
}

async function main() {
  await connectDb();
  try {
    await migrateCollection(User, "User");
    await migrateCollection(BusinessAnchor, "BusinessAnchor");
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[db] migrate-hex-verification-to-implant-manufacturers failed", err);
  process.exitCode = 1;
});
