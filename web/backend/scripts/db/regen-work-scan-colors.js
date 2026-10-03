// 검은 상악 작업 스캔을 원본에서 다시 정렬해 덮어쓴다(UV flag 복구 후).
// usage:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/regen-work-scan-colors.js <transferMongoId>
import crypto from "crypto";
import { Worker } from "worker_threads";
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  collectWorkScanAlignSources,
  emitWorkScanFilesChanged,
  hasAllWorkScanRoles,
  workScanAlignSourceKey,
} from "../../services/workScanAutoAlign.service.js";
import { buildWorkScanAlignment } from "../../utils/workScanAlignment.js";
import { getObjectBufferFromS3, putObjectToS3 } from "../../utils/s3.utils.js";

const transferId = String(process.argv[2] || "").trim();
if (!transferId) {
  console.error("usage: node scripts/db/regen-work-scan-colors.js <transferMongoId>");
  process.exit(1);
}

function runAlignWorker(inputs) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../services/workScanAutoAlign.worker.js", import.meta.url),
      {
        workerData: { inputs },
        transferList: inputs.map((row) => row.bytes.buffer),
        resourceLimits: { maxOldGenerationSizeMb: 2048 },
      },
    );
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn(value);
    };
    const timer = setTimeout(
      () => done(reject, new Error("정렬 시간 초과")),
      10 * 60 * 1000,
    );
    worker.once("message", (msg) => {
      if (msg?.ok) done(resolve, msg);
      else done(reject, new Error(msg?.message || "정렬 실패"));
    });
    worker.once("error", (error) => done(reject, error));
    worker.once("exit", (code) => {
      done(reject, new Error(`워커 종료 code=${code}`));
    });
  });
}

function colorStats(bytes, label) {
  const text = Buffer.from(bytes).toString("utf8");
  const m = text.match(/<VertexColorSet>([\s\S]*?)<\/VertexColorSet>/);
  if (!m) {
    console.log(label, "no VertexColorSet");
    return;
  }
  const raw = Buffer.from(m[1].replace(/\s+/g, ""), "base64");
  const vc = Number(text.match(/vertex_count="(\d+)"/)?.[1] || 0);
  let near = 0;
  let sum = 0;
  for (let i = 0; i < vc; i += 1) {
    const r = raw[i * 3 + 2];
    const g = raw[i * 3 + 1];
    const b = raw[i * 3];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
    if (luma < 15) near += 1;
  }
  console.log(
    label,
    "meanLuma",
    (sum / vc).toFixed(1),
    "nearBlack%",
    ((near / vc) * 100).toFixed(1),
  );
}

await connectDb();
const doc = await PracticeTransfer.findById(transferId)
  .select({
    transferId: 1,
    files: 1,
    practiceUserId: 1,
    practiceBusinessAnchorId: 1,
    targetLabAnchorId: 1,
    assigneeLabAnchorId: 1,
    "production.labWorkScanFiles": 1,
    "production.workScanAutoAlign": 1,
  })
  .lean();
if (!doc) {
  console.error("transfer not found");
  process.exit(1);
}

const sources = collectWorkScanAlignSources(doc.files);
if (!hasAllWorkScanRoles(sources)) {
  console.error("missing jaw roles", sources.map((s) => s.role));
  process.exit(1);
}

console.log(
  "sources",
  sources.map((s) => `${s.role}:${s.fileName}`),
);
const inputs = [];
for (const src of sources) {
  const buffer = await getObjectBufferFromS3(src.s3Key);
  const ownsBuffer =
    buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength;
  const bytes = ownsBuffer
    ? new Uint8Array(buffer.buffer, 0, buffer.byteLength)
    : Uint8Array.from(buffer);
  inputs.push({ role: src.role, fileName: src.fileName, bytes });
  console.log("downloaded", src.role, bytes.length);
}

const result = await runAlignWorker(inputs);
if (result.status !== "aligned" || !Array.isArray(result.files)) {
  console.error("align result", result);
  process.exit(1);
}
console.log("aligned moved=", result.moved, "files", result.files.length);

const uploadedAt = new Date();
const batchId = `work-scan-regen-${crypto.randomUUID()}`;
const rows = [];
for (let index = 0; index < result.files.length; index += 1) {
  const file = result.files[index];
  const key = `uploads/practice-transfers/${transferId}/work-scan-auto/${uploadedAt.getTime()}-${index}-${file.role}.dcm`;
  const body = Buffer.from(
    file.bytes.buffer,
    file.bytes.byteOffset,
    file.bytes.byteLength,
  );
  colorStats(body, file.role);
  await putObjectToS3(key, body);
  rows.push({
    patientName: "",
    tooth: "",
    scanRole: file.role,
    scanRoleSetBy: "filename",
    uploadBatchId: batchId,
    uploadedAt,
    file: {
      originalName: file.fileName,
      mimetype: "application/octet-stream",
      size: body.length,
      s3Key: key,
    },
  });
  console.log("uploaded", file.role, body.length, key);
}

const sourceKey = workScanAlignSourceKey(sources);
const alignment = buildWorkScanAlignment({
  upper: true,
  lower: true,
  source: "auto",
  rows,
  at: uploadedAt,
});

await PracticeTransfer.updateOne(
  { _id: transferId },
  {
    $set: {
      "production.labWorkScanFiles": rows,
      "production.workScanAlignment": alignment,
      "production.workScanAutoAlign.status": "done",
      "production.workScanAutoAlign.source": "upload",
      "production.workScanAutoAlign.sourceKey": sourceKey,
      "production.workScanAutoAlign.fileKeys": rows.map((row) => row.file.s3Key),
      "production.workScanAutoAlign.finishedAt": uploadedAt,
      "production.workScanAutoAlign.alignedAt": uploadedAt,
      "production.workScanAutoAlign.moved": Boolean(result.moved),
    },
  },
);

await emitWorkScanFilesChanged(doc, rows, alignment);
console.log("done", transferId);
await disconnectDb();
