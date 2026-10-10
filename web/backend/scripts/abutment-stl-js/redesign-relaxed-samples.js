// related files:
// - web/backend/services/abutmentStl/cuffBlend.js (planCuffRedesign 완화 옵션)
// - web/backend/services/abutmentStl/cuffBlend.service.js (blendOptions)
// - web/backend/scripts/abutment-stl-js/clone-cuff-samples.js
//
// 복사 샘플의 filled STL에 제한을 푼 Re(재디자인)를 적용한다. 원본 의뢰는 건드리지 않는다. (테스트 DB·S3 쓰기)
// 완화: 접시 판정 생략, 피니시라인 보호·최소 띠·벽 두께·범위 이탈 허용 축소, 안쪽으로 접힌 위 끝은 수직으로 붙임, 못 읽은 열 보간.
//
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/abutment-stl-js/redesign-relaxed-samples.js --ids SAMPLE_A,SAMPLE_B
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import { getMongoUri } from "../db/_mongo.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { applyCuffBlendToFilledStl } from "../../services/abutmentStl/cuffBlend.service.js";

const args = process.argv.slice(2);
const idsAt = args.indexOf("--ids");
const ids = idsAt < 0 ? [] : (args[idsAt + 1] || "").split(",").filter(Boolean);

export const RELAXED_REDESIGN_OPTIONS = {
  flatAngleDeg: 85,
  skipFlatCheck: true,
  monotonicEnd: true,
  fillMissing: true,
  fillMissingMaxRatio: 0.5,
  flProtectMm: 0.05,
  minBandMm: 0.03,
  minWallMm: 0.1,
  maxOvershootMm: 0.2,
};

await mongoose.connect(getMongoUri());
console.log("db:", mongoose.connection.name);
const col = mongoose.connection.db.collection("requests");
for (const requestId of ids) {
  const d = await col.findOne({ requestId, source: "manufacturer_sample" }, { projection: { caseInfos: 1 } });
  const s3Key = resolveFilledStlFile(d?.caseInfos)?.s3Key;
  if (!d || !s3Key) {
    console.log(requestId, "복사 샘플이 아니거나 filled STL 없음");
    continue;
  }
  const res = await applyCuffBlendToFilledStl({
    s3Key,
    caseInfos: d.caseInfos,
    mode: "redesign",
    blendOptions: RELAXED_REDESIGN_OPTIONS,
  });
  console.log(requestId, res.status, res.ok ? JSON.stringify(res.detail) : res.reason);
  if (!res.ok) continue;
  const now = new Date();
  const $set = { "caseInfos.cuffBlend": res.record, "caseInfos.stlMetadataUpdatedAt": now };
  for (const field of ["stlFile", "camFile"]) {
    if (String(d.caseInfos?.[field]?.s3Key || "").trim() === s3Key) {
      $set[`caseInfos.${field}.fileSize`] = res.fileSize;
      $set[`caseInfos.${field}.uploadedAt`] = now;
    }
  }
  await col.updateOne({ _id: d._id }, { $set });
}
await mongoose.disconnect();
