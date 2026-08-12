// related files:
// - web/backend/rules.md
// - web/backend/services/businessLicenseOcr.service.js
// - web/backend/controllers/ai/ai.controller.js
// - web/backend/models/businessAnchor.model.js
//
// 이미 사업자등록증 이미지를 업로드했지만 metadata(상호/대표자/주소/업태/종목 등)가
// 비어있는 BusinessAnchor를 재-OCR하여 백필한다. 사용자가 이미 채운 값은 덮어쓰지 않는다.
// 실행: node web/backend/scripts/db/backfill-business-anchor-metadata.js [--dry-run] [--limit=100]
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import { extractBusinessLicenseFields } from "../../services/businessLicenseOcr.service.js";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

function isMetadataIncomplete(metadata) {
  const m = metadata || {};
  return (
    !String(m.companyName || "").trim() ||
    !String(m.representativeName || "").trim() ||
    !String(m.address || "").trim() ||
    !String(m.businessType || "").trim() ||
    !String(m.businessItem || "").trim()
  );
}

async function backfillBusinessAnchorMetadata() {
  await connectDb();

  try {
    const query = {
      "businessLicense.s3Key": { $exists: true, $ne: "" },
    };

    let cursor = BusinessAnchor.find(query).lean().cursor();
    let processed = 0;
    let updated = 0;
    let skippedComplete = 0;
    let skippedNoImage = 0;
    let failed = 0;

    for await (const anchor of cursor) {
      if (limit && processed >= limit) break;

      if (!isMetadataIncomplete(anchor.metadata)) {
        skippedComplete++;
        continue;
      }

      processed++;
      const anchorId = String(anchor._id);
      const s3Key = String(anchor.businessLicense?.s3Key || "").trim();
      if (!s3Key) {
        skippedNoImage++;
        continue;
      }

      try {
        const buffer = await getObjectBufferFromS3(s3Key);
        if (!buffer || buffer.length === 0) {
          skippedNoImage++;
          console.warn(`[backfill-business-anchor-metadata] empty buffer for ${anchorId} (${s3Key})`);
          continue;
        }

        const { ok, extracted, normalizedBusinessNumber } =
          await extractBusinessLicenseFields(buffer);

        if (!ok) {
          failed++;
          console.warn(`[backfill-business-anchor-metadata] OCR parse failed for ${anchorId}`);
          continue;
        }

        const metadata = anchor.metadata || {};
        const $set = {};
        // 사용자가 이미 채운 필드는 덮어쓰지 않는다 (빈 값만 백필)
        if (!String(metadata.companyName || "").trim() && extracted.companyName) {
          $set["metadata.companyName"] = extracted.companyName;
        }
        if (
          !String(metadata.representativeName || "").trim() &&
          extracted.representativeName
        ) {
          $set["metadata.representativeName"] = extracted.representativeName;
        }
        if (!String(metadata.address || "").trim() && extracted.address) {
          $set["metadata.address"] = extracted.address;
        }
        if (!String(metadata.phoneNumber || "").trim() && extracted.phoneNumber) {
          $set["metadata.phoneNumber"] = extracted.phoneNumber;
        }
        if (!String(metadata.email || "").trim() && extracted.email) {
          $set["metadata.email"] = extracted.email;
        }
        if (!String(metadata.businessType || "").trim() && extracted.businessType) {
          $set["metadata.businessType"] = extracted.businessType;
        }
        if (!String(metadata.businessItem || "").trim() && extracted.businessItem) {
          $set["metadata.businessItem"] = extracted.businessItem;
        }
        if (!String(metadata.startDate || "").trim() && extracted.startDate) {
          $set["metadata.startDate"] = extracted.startDate;
        }
        // 사업자번호(businessNumberNormalized)는 unique 키라서 이미 존재하는 값과
        // 충돌할 수 있으므로 이 백필에서는 절대 건드리지 않는다.

        if (Object.keys($set).length === 0) {
          skippedComplete++;
          continue;
        }

        if (!isDryRun) {
          await BusinessAnchor.updateOne({ _id: anchor._id }, { $set });
        }
        updated++;
        console.log(
          `[backfill-business-anchor-metadata] ${isDryRun ? "(dry-run) " : ""}updated ${anchorId}`,
          Object.keys($set),
        );
      } catch (err) {
        failed++;
        console.error(
          `[backfill-business-anchor-metadata] failed for ${anchorId}`,
          err?.message || err,
        );
      }
    }

    console.log("[backfill-business-anchor-metadata] done", {
      processed,
      updated,
      skippedComplete,
      skippedNoImage,
      failed,
      dryRun: isDryRun,
    });
  } finally {
    await disconnectDb();
  }
}

backfillBusinessAnchorMetadata().catch((error) => {
  console.error("[backfill-business-anchor-metadata] fatal error", error);
  process.exit(1);
});
