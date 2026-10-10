// related files:
// - web/backend/services/abutmentStl/pipeline.js
// - web/backend/services/abutmentStl/jsPrimary.service.js
// - web/backend/services/hexVerificationSample.service.js (복사샘플 클론 형식)
//
// 기공소(businessAnchor)마다 원본 STL을 JS 파이프라인에 돌려, 원본에 메워진 면적(스크류홀·단차 보정)이
// 큰 순서로 N건을 고른다. --create 를 주면 고른 건을 「제조사-준비」 복사샘플로 만든다(테스트 DB·S3 쓰기).
//
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/abutment-stl-js/pick-js-samples.js [--per-lab 3] [--candidates 40] [--create]
//   취소: ... pick-js-samples.js --remove   (만든 샘플을 삭제)
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import "../../bootstrap/env.js";
import { getMongoUri } from "../db/_mongo.js";
import Request from "../../models/request.model.js";
import { getObjectBufferFromS3, uploadFileToS3 } from "../../utils/s3.utils.js";
import { resolveAbutmentStlInputs } from "../../services/abutmentStl/abutmentStlInputs.js";
import { runAbutmentStlPipelineInWorker } from "../../services/abutmentStl/runPipelineInWorker.js";
import { parseStl } from "../../services/abutmentStl/meshCore.js";
import { assessFinishLineQuality } from "../../utils/finishLineQuality.js";
import { applyFilledStlFileToCaseInfos } from "../../utils/filledStlFile.js";
import { ensureLotNumberForMachining } from "../../controllers/requests/utils.js";

const args = process.argv.slice(2);
const argValue = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i < 0 ? d : args[i + 1] ?? d;
};
const perLab = Number(argValue("per-lab", "3"));
const candidates = Number(argValue("candidates", "40"));
const concurrency = Number(argValue("concurrency", "3"));
const create = args.includes("--create");
const remove = args.includes("--remove");
const outDir = path.resolve("../../.tmp-abuts-align/js-samples");
fs.mkdirSync(outDir, { recursive: true });
const scoresFile = path.join(outDir, "scores.json");
const createdFile = path.join(outDir, "created.json");
const SAMPLE_MEMO_PREFIX = "JS 파이프라인 샘플";

await mongoose.connect(getMongoUri());
console.log("db:", mongoose.connection.name);
const col = mongoose.connection.db.collection("requests");

if (remove) {
  const rows = JSON.parse(fs.readFileSync(createdFile, "utf8"));
  for (const r of rows) {
    await col.deleteOne({ requestId: r.sampleRequestId, source: "manufacturer_sample" });
    console.log("removed", r.sampleRequestId);
  }
  await mongoose.disconnect();
  process.exit(0);
}

/** 출력 STL에서 원본 삼각형 수 이후(패치·솔리드)의 면적. */
function addedArea(outputBuffer, bodyTriangleCount) {
  const { positions } = parseStl(outputBuffer);
  const total = Math.floor(positions.length / 9);
  let area = 0;
  for (let t = bodyTriangleCount; t < total; t += 1) {
    const o = t * 9;
    const ux = positions[o + 3] - positions[o], uy = positions[o + 4] - positions[o + 1], uz = positions[o + 5] - positions[o + 2];
    const wx = positions[o + 6] - positions[o], wy = positions[o + 7] - positions[o + 1], wz = positions[o + 8] - positions[o + 2];
    area += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  return { area, triangles: total - bodyTriangleCount };
}

function usable(js) {
  if (!js?.outputBuffer?.length) return "empty";
  if (js.align?.ok === false) return "align";
  const pts = js.finishLine?.points;
  if (!Array.isArray(pts) || pts.length < 4) return "finishline";
  if (assessFinishLineQuality(pts).defective) return "finishline-quality";
  if (!js.stlMetadata) return "metadata";
  if (!(Number(js.diameter?.max) > 0)) return "diameter";
  return null;
}

async function scoreOne(doc) {
  const ci = doc.caseInfos || {};
  const [input, inputs] = await Promise.all([getObjectBufferFromS3(ci.file.s3Key), resolveAbutmentStlInputs(ci)]);
  const js = await runAbutmentStlPipelineInWorker(input, {
    targetDiameter: inputs.targetDiameter,
    implantProfile: inputs.implantProfile,
  });
  const bad = usable(js);
  const add = addedArea(js.outputBuffer, js.bodyTriangleCount);
  return {
    requestId: doc.requestId,
    ok: !bad,
    badReason: bad,
    addedArea: Number(add.area.toFixed(2)),
    addedTriangles: add.triangles,
    screwhole: js.screwhole?.reason || null,
    fillSteps: js.fillSteps ? { ok: js.fillSteps.ok ?? null, reason: js.fillSteps.reason ?? null } : null,
    js,
  };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = await fn(items[i]);
        } catch (e) {
          out[i] = { requestId: items[i].requestId, ok: false, badReason: String(e?.message || e) };
        }
      }
    }),
  );
  return out;
}

if (!create) {
  const labs = await mongoose.connection.db.collection("businessanchors").find({ businessType: "requestor" }).toArray();
  const result = [];
  for (const lab of labs) {
    const docs = await col
      .find(
        {
          businessAnchorId: lab._id,
          requestCategory: { $nin: ["rnd_sample", "copied_sample", "dummy_sample"] },
          manufacturerStage: { $ne: "취소" },
          "caseInfos.file.s3Key": { $regex: /\.stl$/i },
        },
        { projection: { requestId: 1, caseInfos: 1, createdAt: 1 } },
      )
      .sort({ createdAt: -1 })
      .toArray();
    const seen = new Set();
    const uniq = docs.filter((d) => (seen.has(d.caseInfos.file.s3Key) ? false : seen.add(d.caseInfos.file.s3Key)));
    if (!uniq.length) continue;
    const pickFrom = uniq.slice(0, candidates);
    console.log(`[${lab.name}] 원본 ${uniq.length}건 중 ${pickFrom.length}건 평가`);
    const scored = await pool(pickFrom, concurrency, scoreOne);
    const good = scored.filter((s) => s.ok).sort((a, b) => b.addedArea - a.addedArea);
    const top = good.slice(0, perLab);
    for (const s of top) {
      fs.writeFileSync(path.join(outDir, `${s.requestId}.js.filled.stl`), s.js.outputBuffer);
    }
    console.log(
      top.map((s) => `  ${s.requestId} +${s.addedArea}mm² (${s.addedTriangles}tri)`).join("\n") || "  (사용 가능한 결과 없음)",
    );
    result.push({
      labId: String(lab._id),
      labName: lab.name,
      evaluated: scored.length,
      usable: good.length,
      picks: top.map(({ js, ...rest }) => rest),
      all: scored.map(({ js, ...rest }) => rest),
    });
  }
  fs.writeFileSync(scoresFile, JSON.stringify(result, null, 2));
  console.log("saved", scoresFile);
  await mongoose.disconnect();
  process.exit(0);
}

// --- create ---
const picks = JSON.parse(fs.readFileSync(scoresFile, "utf8"));
const created = fs.existsSync(createdFile) ? JSON.parse(fs.readFileSync(createdFile, "utf8")) : [];
for (const lab of picks) {
  for (const p of lab.picks) {
    if (created.some((c) => c.sourceRequestId === p.requestId)) {
      console.log("skip(이미 생성)", p.requestId);
      continue;
    }
    const source = await Request.findOne({ requestId: p.requestId }).lean();
    if (!source) continue;
    const ci = JSON.parse(JSON.stringify(source.caseInfos || {}));
    delete ci.stlFile;
    delete ci.camFile;
    delete ci.ncFile;
    delete ci.cuffBlend;
    const now = new Date();
    const stages = ["request", "cam", "machining", "packing", "shipping", "tracking"];
    ci.reviewByStage = Object.fromEntries(
      stages.map((s) => [s, { status: "PENDING", updatedAt: s === "request" ? now : null, updatedBy: null, reason: "" }]),
    );
    const memo = `${SAMPLE_MEMO_PREFIX} · 원본 ${source.requestId}`;
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
      rnd: { doneAt: null, doneBy: null, doneFromStage: null, memo, memoUpdatedAt: now, memoUpdatedBy: null },
      price: { amount: 0, baseAmount: 0, discountAmount: 0, currency: "KRW", rule: "manufacturer_sample", paidAmount: 0, bonusAmount: 0 },
      statusHistory: [{ status: SAMPLE_MEMO_PREFIX, note: `원본 의뢰 ${source.requestId} JS 파이프라인 확인용`, updatedBy: null, updatedAt: now }],
    });
    await ensureLotNumberForMachining(clone);
    await clone.save();

    const buf = fs.readFileSync(path.join(outDir, `${p.requestId}.js.filled.stl`));
    // 같은 입력으로 메타를 다시 계산한다(저장해 둔 결과에는 buffer만 있음).
    const inputs = await resolveAbutmentStlInputs(source.caseInfos);
    const js = await runAbutmentStlPipelineInWorker(await getObjectBufferFromS3(source.caseInfos.file.s3Key), {
      targetDiameter: inputs.targetDiameter,
      implantProfile: inputs.implantProfile,
    });
    const base = String(source.caseInfos?.file?.filePath || source.caseInfos?.file?.originalName || "input.stl")
      .replace(/[^a-zA-Z0-9._\-가-힣]/g, "_")
      .replace(/\.stl$/i, "");
    const key = `requests/${clone.requestId}/2-filled/${base}.filled.stl`;
    const up = await uploadFileToS3(js.outputBuffer.length ? js.outputBuffer : buf, key, "application/octet-stream");
    const fileMeta = {
      fileName: `${base}.filled.stl`,
      fileType: "application/octet-stream",
      fileSize: js.outputBuffer.length,
      filePath: `${base}.filled.stl`,
      s3Key: up.key,
      s3Url: up.location,
      uploadedAt: now,
    };
    const m = js.stlMetadata || {};
    const $set = {
      "caseInfos.stlFile": fileMeta,
      "caseInfos.camFile": fileMeta,
      "caseInfos.finishLine": js.finishLine,
      "caseInfos.maxDiameter": m.maxDiameter,
      "caseInfos.connectionDiameter": m.connectionDiameter,
      "caseInfos.totalLength": m.totalLength,
      "caseInfos.l1": m.l1,
      "caseInfos.taperAngle": m.taperAngle,
      "caseInfos.tiltAxisVector": m.tiltAxisVector,
      "caseInfos.frontPoint": m.frontPoint,
      "caseInfos.stlMetadataUpdatedAt": now,
      "productionSchedule.stlPreload": { status: "READY", updatedAt: now },
    };
    if (m.taperGuide) $set["caseInfos.taperGuide"] = m.taperGuide;
    if (m.lotEngravingSite) $set["caseInfos.lotEngravingSite"] = m.lotEngravingSite;
    if (js.hexRotation) {
      $set["caseInfos.hexRotation"] = { ...(source.caseInfos?.hexRotation || {}), ...js.hexRotation };
    }
    await col.updateOne({ _id: clone._id }, { $set });
    created.push({
      lab: lab.labName,
      sourceRequestId: source.requestId,
      sampleRequestId: clone.requestId,
      addedArea: p.addedArea,
      s3Key: up.key,
    });
    fs.writeFileSync(createdFile, JSON.stringify(created, null, 2));
    console.log("created", lab.labName, source.requestId, "->", clone.requestId);
  }
}
await mongoose.disconnect();
