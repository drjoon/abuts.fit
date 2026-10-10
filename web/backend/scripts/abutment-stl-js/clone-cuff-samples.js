// related files:
// - web/backend/scripts/abutment-stl-js/pick-js-samples.js (복사샘플 클론 형식)
// - web/backend/scripts/abutment-stl-js/apply-cuff-samples.js
// - web/backend/services/abutmentStl/cuffBlend.service.js (applyCuffBlendToFilledStl)
//
// 지정한 의뢰의 filled STL을 복사해 「제조사-준비」 복사샘플로 만들고, 복사본에만 커프 이음 보정을 시도한다.
// 원본 의뢰·S3는 건드리지 않는다. 보정이 manual-review 등으로 멈춰도 그 기록을 복사본에 남겨 준비 카드에서 보인다. (테스트 DB·S3 쓰기)
//
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/abutment-stl-js/clone-cuff-samples.js --ids A,B,C
//   삭제: ... clone-cuff-samples.js --remove
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import { getMongoUri } from "../db/_mongo.js";
import Request from "../../models/request.model.js";
import { getObjectBufferFromS3, uploadFileToS3 } from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { applyCuffBlendToFilledStl } from "../../services/abutmentStl/cuffBlend.service.js";
import { ensureLotNumberForMachining } from "../../controllers/requests/utils.js";

const args = process.argv.slice(2);
const idsAt = args.indexOf("--ids");
const ids = idsAt < 0 ? [] : (args[idsAt + 1] || "").split(",").filter(Boolean);
const remove = args.includes("--remove");
const outDir = path.resolve("../../.tmp-abuts-align/cuff-clones");
fs.mkdirSync(outDir, { recursive: true });
const createdFile = path.join(outDir, "created.json");
const MEMO = "커프 이음 확인 샘플";

await mongoose.connect(getMongoUri());
console.log("db:", mongoose.connection.name);
const col = mongoose.connection.db.collection("requests");
const created = fs.existsSync(createdFile) ? JSON.parse(fs.readFileSync(createdFile, "utf8")) : [];

if (remove) {
  for (const r of created) {
    await col.deleteOne({ requestId: r.sampleRequestId, source: "manufacturer_sample" });
    console.log("removed", r.sampleRequestId);
  }
  fs.writeFileSync(createdFile, "[]");
  await mongoose.disconnect();
  process.exit(0);
}

for (const requestId of ids) {
  if (created.some((c) => c.sourceRequestId === requestId)) {
    console.log("skip(이미 생성)", requestId);
    continue;
  }
  const source = await Request.findOne({ requestId }).lean();
  const filled = resolveFilledStlFile(source?.caseInfos);
  if (!source || !filled?.s3Key) {
    console.log(requestId, "filled STL 없음");
    continue;
  }
  const now = new Date();
  const ci = JSON.parse(JSON.stringify(source.caseInfos || {}));
  delete ci.stlFile;
  delete ci.camFile;
  delete ci.ncFile;
  delete ci.cuffBlend;
  delete ci.cuffProposal;
  const stages = ["request", "cam", "machining", "packing", "shipping", "tracking"];
  ci.reviewByStage = Object.fromEntries(
    stages.map((s) => [s, { status: "PENDING", updatedAt: s === "request" ? now : null, updatedBy: null, reason: "" }]),
  );
  const clone = new Request({
    title: source.title || "",
    description: source.description || "",
    referenceIds: [...(source.referenceIds || []), source.requestId].filter((v, i, a) => v && a.indexOf(v) === i),
    caseInfos: ci,
    requestor: source.requestor || null,
    businessAnchorId: source.businessAnchorId || null,
    caManufacturer: source.caManufacturer || null,
    manufacturerStage: "준비",
    source: "manufacturer_sample",
    requestCategory: "copied_sample",
    shippingMode: source.shippingMode || "normal",
    productionSchedule: {
      ...(source.productionSchedule ? JSON.parse(JSON.stringify(source.productionSchedule)) : {}),
      assignedMachine: null,
      queuePosition: null,
      machiningQty: 1,
      actualCamStart: null,
      scheduledShipPickup: null,
      scheduledPickupRequest: null,
    },
    timeline: { estimatedShipYmd: null, forceTodayShipment: false, actualCompletion: null },
    designCompletedAt: source.designCompletedAt || now,
    lotNumber: { material: String(source?.lotNumber?.material || "").trim() || null },
    assignedMachine: null,
    rnd: { doneAt: null, doneBy: null, doneFromStage: null, memo: `${MEMO} · 원본 ${source.requestId}`, memoUpdatedAt: now, memoUpdatedBy: null },
    price: { amount: 0, baseAmount: 0, discountAmount: 0, currency: "KRW", rule: "manufacturer_sample", paidAmount: 0, bonusAmount: 0 },
    statusHistory: [{ status: MEMO, note: `원본 의뢰 ${source.requestId} 커프 이음 확인용`, updatedBy: null, updatedAt: now }],
  });
  await ensureLotNumberForMachining(clone);
  await clone.save();

  const base = String(filled.filePath || filled.fileName || "input.filled.stl")
    .replace(/[^a-zA-Z0-9._\-가-힣]/g, "_")
    .replace(/\.filled\.stl$|\.stl$/i, "");
  const key = `requests/${clone.requestId}/2-filled/${base}.filled.stl`;
  const buf = await getObjectBufferFromS3(filled.s3Key);
  const up = await uploadFileToS3(buf, key, "application/octet-stream");
  const fileMeta = {
    fileName: `${base}.filled.stl`,
    fileType: "application/octet-stream",
    fileSize: buf.length,
    filePath: `${base}.filled.stl`,
    s3Key: up.key,
    s3Url: up.location,
    uploadedAt: now,
  };
  const copied = { ...ci, stlFile: fileMeta, camFile: fileMeta };
  const res = await applyCuffBlendToFilledStl({ s3Key: up.key, caseInfos: copied, mode: "auto" });
  const $set = {
    "caseInfos.stlFile": fileMeta,
    "caseInfos.camFile": fileMeta,
    "caseInfos.cuffBlend": res.record,
    "caseInfos.stlMetadataUpdatedAt": now,
    "productionSchedule.stlPreload": { status: "READY", updatedAt: now },
  };
  if (res.ok && res.fileSize) {
    $set["caseInfos.stlFile.fileSize"] = res.fileSize;
    $set["caseInfos.camFile.fileSize"] = res.fileSize;
  }
  await col.updateOne({ _id: clone._id }, { $set });
  created.push({ sourceRequestId: source.requestId, sampleRequestId: clone.requestId, status: res.status, s3Key: up.key });
  fs.writeFileSync(createdFile, JSON.stringify(created, null, 2));
  console.log("created", source.requestId, "->", clone.requestId, res.status, res.ok ? "" : res.reason);
}
await mongoose.disconnect();
