// related files:
// - web/backend/services/abutmentStl/cuffBlend.service.js (applyCuffBlendToFilledStl)
// - web/backend/scripts/abutment-stl-js/verify-cuff-finishline.js
//
// 눈으로 확인할 샘플 의뢰를 골라 커프 이음 보정을 적용하고 「준비」 단계에 둔다. (테스트 DB·S3 쓰기)
// 적용 전 filled STL 원본은 .tmp-abuts-align/cuff-samples/<requestId>.stl 로 백업하고,
// 이전 단계는 restore.json에 남긴다. 되돌리기: --restore
//
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/abutment-stl-js/apply-cuff-samples.js --ids A,B,C
//   ... --restore
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import { getMongoUri } from "../db/_mongo.js";
import { getObjectBufferFromS3, putObjectToS3 } from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { applyCuffBlendToFilledStl } from "../../services/abutmentStl/cuffBlend.service.js";

const args = process.argv.slice(2);
const ids = (args[args.indexOf("--ids") + 1] || "").split(",").filter(Boolean);
const restore = args.includes("--restore");
const dir = path.resolve("../../.tmp-abuts-align/cuff-samples");
const restoreFile = path.join(dir, "restore.json");
fs.mkdirSync(dir, { recursive: true });

await mongoose.connect(getMongoUri());
console.log("db:", mongoose.connection.name);
const col = mongoose.connection.db.collection("requests");

if (restore) {
  const rows = JSON.parse(fs.readFileSync(restoreFile, "utf8"));
  for (const r of rows) {
    await putObjectToS3(r.s3Key, fs.readFileSync(path.join(dir, `${r.requestId}.stl`)), { contentType: "application/sla" });
    await col.updateOne(
      { requestId: r.requestId },
      { $set: { manufacturerStage: r.stage, "caseInfos.cuffBlend": r.cuffBlend ?? null } },
    );
    console.log("restored", r.requestId, r.stage);
  }
  await mongoose.disconnect();
  process.exit(0);
}

const rows = fs.existsSync(restoreFile) ? JSON.parse(fs.readFileSync(restoreFile, "utf8")) : [];
for (const requestId of ids) {
  const d = await col.findOne({ requestId }, { projection: { requestId: 1, manufacturerStage: 1, caseInfos: 1 } });
  const s3Key = resolveFilledStlFile(d?.caseInfos)?.s3Key;
  if (!d || !s3Key) {
    console.log(requestId, "filled STL 없음");
    continue;
  }
  const original = await getObjectBufferFromS3(s3Key);
  const bak = path.join(dir, `${requestId}.stl`);
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, original);
  const res = await applyCuffBlendToFilledStl({ s3Key, caseInfos: d.caseInfos, mode: "auto" });
  console.log(requestId, res.status, res.ok ? JSON.stringify(res.detail) : res.reason);
  if (!res.ok) continue;
  const now = new Date();
  const $set = { manufacturerStage: "준비", "caseInfos.cuffBlend": res.record, "caseInfos.stlMetadataUpdatedAt": now };
  for (const field of ["stlFile", "camFile"]) {
    if (String(d.caseInfos?.[field]?.s3Key || "").trim() === s3Key) {
      $set[`caseInfos.${field}.fileSize`] = res.fileSize;
      $set[`caseInfos.${field}.uploadedAt`] = now;
    }
  }
  await col.updateOne({ _id: d._id }, { $set });
  if (!rows.some((r) => r.requestId === requestId)) {
    rows.push({ requestId, s3Key, stage: d.manufacturerStage, cuffBlend: d.caseInfos?.cuffBlend ?? null });
  }
  fs.writeFileSync(restoreFile, JSON.stringify(rows, null, 2));
}
await mongoose.disconnect();
