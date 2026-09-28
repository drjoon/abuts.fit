// related files:
// - web/backend/scripts/abutment-stl-js/compare-golden.js
// - web/backend/services/abutmentStl/abutmentStlInputs.js
// - bg/pc1/rhino-server/rules.md
//
// Rhino가 만든 2-filled와 DB 기준값(finishLine·hexRotation·메타)을 로컬 캐시에 받는다.
// 현재 정렬 모듈 버전으로 처리된 의뢰만 고른다. DB는 읽기만 한다.
//
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/abutment-stl-js/fetch-golden.js --limit 200
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../db/_mongo.js";
import { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import { resolveAbutmentStlInputs } from "../../services/abutmentStl/abutmentStlInputs.js";
import { GOLDEN_CACHE_DIR } from "./goldenCache.js";

const RHINO_ALIGN_MODULE_VERSION = "2026-08-18.connection-z-origin-v1";

function argValue(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const limit = Number(argValue("limit", "200"));
const moduleVersion = argValue("module-version", RHINO_ALIGN_MODULE_VERSION);

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await connectDb();
  const requests = mongoose.connection.db.collection("requests");
  const rows = await requests
    .find(
      {
        "caseInfos.file.s3Key": { $exists: true, $ne: "" },
        "caseInfos.stlFile.s3Key": { $exists: true, $ne: "" },
        "caseInfos.finishLine.points.2": { $exists: true },
        "caseInfos.hexRotation.moduleVersion": moduleVersion,
      },
      {
        projection: {
          requestId: 1,
          requestCategory: 1,
          createdAt: 1,
          caseInfos: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .toArray();

  const seen = new Set();
  const picked = [];
  for (const row of rows) {
    const key = String(row.caseInfos.stlFile.s3Key);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  console.log(
    `[fetch-golden] matched=${rows.length} unique=${seen.size} picked=${picked.length} moduleVersion=${moduleVersion}`,
  );

  await fs.mkdir(GOLDEN_CACHE_DIR, { recursive: true });
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of picked) {
    const ci = row.caseInfos || {};
    const dir = path.join(GOLDEN_CACHE_DIR, row.requestId);
    const inputPath = path.join(dir, "input.stl");
    const rhinoPath = path.join(dir, "rhino.filled.stl");
    const metaPath = path.join(dir, "meta.json");
    try {
      await fs.mkdir(dir, { recursive: true });
      if (!(await exists(inputPath))) {
        await fs.writeFile(inputPath, await getObjectBufferFromS3(ci.file.s3Key));
      }
      if (!(await exists(rhinoPath))) {
        await fs.writeFile(
          rhinoPath,
          await getObjectBufferFromS3(ci.stlFile.s3Key),
        );
      }
      const inputs = await resolveAbutmentStlInputs(ci);
      const meta = {
        requestId: row.requestId,
        requestMongoId: String(row._id),
        requestCategory: row.requestCategory || null,
        inputFileName: ci.file.filePath || ci.file.originalName || "",
        originalS3Key: ci.file.s3Key,
        rhinoFilledS3Key: ci.stlFile.s3Key,
        rhinoFilledUploadedAt: ci.stlFile.uploadedAt || null,
        inputs,
        rhino: {
          finishLine: ci.finishLine || null,
          hexRotation: ci.hexRotation || null,
          maxDiameter: ci.maxDiameter ?? null,
          connectionDiameter: ci.connectionDiameter ?? null,
          totalLength: ci.totalLength ?? null,
          l1: ci.l1 ?? null,
          taperAngle: ci.taperAngle ?? null,
          tiltAxisVector: ci.tiltAxisVector ?? null,
          frontPoint: ci.frontPoint ?? null,
          lotEngravingSite: ci.lotEngravingSite ?? null,
          stlMetadataUpdatedAt: ci.stlMetadataUpdatedAt || null,
        },
      };
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      fetched += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `[fetch-golden] ${row.requestId} failed: ${error?.message || error}`,
      );
      if (!(await exists(metaPath))) skipped += 1;
    }
  }
  console.log(
    `[fetch-golden] done fetched=${fetched} failed=${failed} skipped=${skipped} dir=${GOLDEN_CACHE_DIR}`,
  );
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
