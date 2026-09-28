// 의뢰 상악·하악·바이트가 모두 올라오면 AI 디자인 모델 정렬(바이트에 악궁 맞춤 + 교합 원점)을
// 백그라운드로 돌려 작업 스캔(production.labWorkScanFiles)에 넣는다. 치과·기공소 모두 작업 파일로 본다.
// 기공소가 직접 저장한 작업 스캔이 있으면 덮지 않는다.
// related files:
// - web/backend/jobs/workScanAutoAlignWorker.js
// - web/backend/services/workScanAutoAlign.worker.js
// - web/backend/services/oralScanPair.service.js
// - web/frontend/src/shared/practice/workScanAutoAlign.ts
import crypto from "crypto";
import { Worker } from "worker_threads";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import { emitAppEventToUser } from "../socket.js";
import {
  resolvePracticeUserIdsByAnchor,
  resolveRequestorUserIdsByAnchor,
} from "../utils/chatRealtimeRecipients.js";
import {
  isAbutsWorkScanFileName,
  resolveStoredScanRole,
} from "../utils/oralScanRole.js";
import { getObjectBufferFromS3, putObjectToS3 } from "../utils/s3.utils.js";

const STATE = "production.workScanAutoAlign";
const JAW_ROLES = ["upper", "lower", "bite"];
const MESH_EXT = /\.(stl|ply|obj|dcm)$/i;
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
const LEASE_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const WORKER_TIMEOUT_MS = Number(
  process.env.WORK_SCAN_AUTO_ALIGN_TIMEOUT_MS || 10 * 60 * 1000,
);
const WORKER_HEAP_MB = Number(process.env.WORK_SCAN_AUTO_ALIGN_HEAP_MB || 2048);
const QUIET = { timestamps: false };

let onQueued = null;

/** 잡 루프가 대기열 알림을 받는다. */
export function setWorkScanAutoAlignWake(fn) {
  onQueued = typeof fn === "function" ? fn : null;
}

/** 의뢰 파일이 바뀐 뒤 호출한다. 응답은 기다리지 않는다. */
export function queueWorkScanAutoAlign(transferMongoId) {
  const id = String(transferMongoId || "").trim();
  if (!id) return;
  void PracticeTransfer.updateOne(
    { _id: id },
    {
      $set: {
        [`${STATE}.status`]: "pending",
        [`${STATE}.queuedAt`]: new Date(),
        [`${STATE}.attempts`]: 0,
      },
    },
    QUIET,
  )
    .then(() => onQueued?.())
    .catch((error) => {
      console.warn("[work-scan-auto-align] queue failed", id, error?.message || error);
    });
}

/** 상태가 없는 기존 의뢰를 모두 대기열에 넣는다. 여러 인스턴스가 같이 돌려도 한 번만 들어간다. */
export async function backfillWorkScanAutoAlignQueue() {
  const result = await PracticeTransfer.updateMany(
    {
      status: "active",
      "files.0": { $exists: true },
      [STATE]: { $exists: false },
    },
    {
      $set: {
        [STATE]: { status: "pending", queuedAt: new Date(), attempts: 0 },
      },
    },
    QUIET,
  );
  return Number(result?.modifiedCount || 0);
}

const fileName = (row) => String(row?.file?.originalName || "").trim();
const fileKey = (row) => String(row?.file?.s3Key || "").trim();

/** AI 디자인이 여는 의뢰 스캔과 같은 집합. 작업 DCM·그 외 역할은 뺀다. 이름·크기가 같으면 하나만. */
export function collectWorkScanAlignSources(files) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(files) ? files : []) {
    const name = fileName(row);
    const key = fileKey(row);
    if (!name || !key || !MESH_EXT.test(name) || isAbutsWorkScanFileName(name)) continue;
    const size = Number(row?.file?.size || 0);
    const dedupe = `${name.normalize("NFC")}\0${size}`;
    if (seen.has(dedupe)) continue;
    const { scanRole } = resolveStoredScanRole({
      originalName: name,
      scanRole: row?.scanRole,
      scanRoleSetBy: row?.scanRoleSetBy,
    });
    if (!JAW_ROLES.includes(scanRole)) continue;
    seen.add(dedupe);
    out.push({ role: scanRole, fileName: name, s3Key: key, size });
  }
  return out;
}

export function workScanAlignSourceKey(sources) {
  return sources
    .map((row) => `${row.role}:${row.s3Key}`)
    .sort()
    .join("|");
}

export function hasAllWorkScanRoles(sources) {
  const roles = new Set(sources.map((row) => row.role));
  return JAW_ROLES.every((role) => roles.has(role));
}

function runAlignWorker(inputs) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./workScanAutoAlign.worker.js", import.meta.url), {
      workerData: { inputs },
      transferList: inputs.map((row) => row.bytes.buffer),
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn(value);
    };
    const timer = setTimeout(
      () => done(reject, new Error("정렬 시간이 초과되었습니다.")),
      WORKER_TIMEOUT_MS,
    );
    worker.once("message", (msg) => {
      if (msg?.ok) done(resolve, msg);
      else done(reject, new Error(msg?.message || "정렬에 실패했습니다."));
    });
    worker.once("error", (error) => done(reject, error));
    worker.once("exit", (code) => {
      done(reject, new Error(`정렬 워커가 종료되었습니다(code ${code}).`));
    });
  });
}

function toWorkScanApiFiles(rows) {
  return rows.map((item, idx) => ({
    id: `work-scan::${idx + 1}`,
    patientName: String(item?.patientName || "").trim(),
    tooth: String(item?.tooth || "").trim(),
    originalName: fileName(item),
    mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
    size: Number(item?.file?.size || 0),
    s3Key: fileKey(item),
    scanRole: String(item?.scanRole || "").trim() || null,
    scanRoleSetBy: String(item?.scanRoleSetBy || "").trim() || null,
    uploadedAt: item?.uploadedAt ? new Date(item.uploadedAt).toISOString() : null,
  }));
}

async function emitWorkScanFilesChanged(doc, rows) {
  const payload = {
    action: "work-scan-auto-aligned",
    transferId: String(doc.transferId || "").trim(),
    transferMongoId: String(doc._id || "").trim(),
    targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
    practiceUserId: String(doc.practiceUserId || "").trim() || null,
    workScanFiles: toWorkScanApiFiles(rows),
  };
  const labAnchorIds = [
    ...new Set(
      [doc.targetLabAnchorId, doc.assigneeLabAnchorId]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  const [practiceUserIds, ...labUserIds] = await Promise.all([
    resolvePracticeUserIdsByAnchor(doc.practiceBusinessAnchorId),
    ...labAnchorIds.map((id) => resolveRequestorUserIdsByAnchor(id)),
  ]);
  const userIds = new Set(
    [...practiceUserIds, doc.practiceUserId, ...labUserIds.flat()]
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  for (const userId of userIds) {
    emitAppEventToUser(userId, "practice:transfer-updated", payload);
  }
}

async function claimNext() {
  const now = new Date();
  const runId = crypto.randomUUID();
  const doc = await PracticeTransfer.findOneAndUpdate(
    {
      $or: [
        { [`${STATE}.status`]: "pending" },
        {
          [`${STATE}.status`]: "running",
          [`${STATE}.leaseUntil`]: { $lt: now },
          [`${STATE}.attempts`]: { $lt: MAX_ATTEMPTS },
        },
      ],
    },
    {
      $set: {
        [`${STATE}.status`]: "running",
        [`${STATE}.runId`]: runId,
        [`${STATE}.startedAt`]: now,
        [`${STATE}.leaseUntil`]: new Date(now.getTime() + LEASE_MS),
      },
      $inc: { [`${STATE}.attempts`]: 1 },
    },
    {
      new: true,
      sort: { [`${STATE}.queuedAt`]: -1 },
      projection: {
        transferId: 1,
        status: 1,
        files: 1,
        practiceUserId: 1,
        practiceBusinessAnchorId: 1,
        targetLabAnchorId: 1,
        assigneeLabAnchorId: 1,
        "production.labWorkScanFiles": 1,
        [STATE]: 1,
      },
      ...QUIET,
    },
  ).lean();
  return doc ? { doc, runId } : null;
}

async function processClaimed({ doc, runId }) {
  const id = doc._id;
  const state = doc.production?.workScanAutoAlign || {};
  const existing = Array.isArray(doc.production?.labWorkScanFiles)
    ? doc.production.labWorkScanFiles
    : [];
  const autoKeys = new Set(Array.isArray(state.fileKeys) ? state.fileKeys : []);
  const labSaved = existing.some((row) => !autoKeys.has(fileKey(row)));
  const sources = collectWorkScanAlignSources(doc.files);
  const sourceKey = workScanAlignSourceKey(sources);

  const finish = async (fields, rows = null) => {
    const set = {
      [`${STATE}.finishedAt`]: new Date(),
      [`${STATE}.leaseUntil`]: null,
      [`${STATE}.reason`]: null,
      [`${STATE}.error`]: null,
    };
    for (const [key, value] of Object.entries(fields)) set[`${STATE}.${key}`] = value;
    if (rows) set["production.labWorkScanFiles"] = rows;
    const result = await PracticeTransfer.updateOne(
      { _id: id, [`${STATE}.status`]: "running", [`${STATE}.runId`]: runId },
      { $set: set },
      QUIET,
    );
    const applied = Number(result?.modifiedCount || 0) > 0;
    if (applied && rows) {
      void emitWorkScanFilesChanged(doc, rows).catch((error) => {
        console.warn("[work-scan-auto-align] emit failed", String(id), error?.message || error);
      });
    }
    return applied;
  };
  // 예전 의뢰 파일로 맞춘 작업 스캔은 새 의뢰 파일과 어긋나므로 뺀다.
  const staleAutoRows =
    !labSaved && existing.length > 0 && state.sourceKey !== sourceKey ? [] : null;

  if (String(doc.status || "active") !== "active") {
    return finish({ status: "skipped", reason: "inactive", sourceKey });
  }
  if (labSaved) {
    return finish({ status: "skipped", reason: "lab-work", sourceKey });
  }
  if (!hasAllWorkScanRoles(sources)) {
    return finish({ status: "incomplete", sourceKey, fileKeys: [] }, staleAutoRows);
  }
  if (state.sourceKey === sourceKey && existing.length > 0) {
    return finish({ status: "done", sourceKey });
  }
  if (sources.some((row) => row.size > MAX_SOURCE_BYTES)) {
    return finish(
      { status: "failed", reason: "too-large", sourceKey, fileKeys: [] },
      staleAutoRows,
    );
  }

  try {
    const inputs = await Promise.all(
      sources.map(async (row) => {
        const buffer = await getObjectBufferFromS3(row.s3Key);
        if (!buffer?.length) throw new Error(`스캔을 읽지 못했습니다: ${row.fileName}`);
        const bytes = new Uint8Array(buffer.length);
        bytes.set(buffer);
        return { role: row.role, fileName: row.fileName, bytes };
      }),
    );
    const startedAt = Date.now();
    const result = await runAlignWorker(inputs);
    const ms = Date.now() - startedAt;
    if (result.status !== "aligned") {
      console.info("[work-scan-auto-align]", String(id), result.status, { ms });
      return finish({ status: result.status, sourceKey, fileKeys: [], ms }, staleAutoRows);
    }

    const uploadedAt = new Date();
    const batchId = `work-scan-auto-${runId}`;
    const rows = await Promise.all(
      result.files.map(async (file, index) => {
        const key = `uploads/practice-transfers/${String(id)}/work-scan-auto/${uploadedAt.getTime()}-${index}-${file.role}.dcm`;
        const body = Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
        await putObjectToS3(key, body);
        return {
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
        };
      }),
    );
    console.info("[work-scan-auto-align]", String(id), "aligned", {
      ms,
      moved: Boolean(result.moved),
      files: rows.map((row) => row.file.originalName),
    });
    return finish(
      {
        status: "done",
        sourceKey,
        fileKeys: rows.map((row) => row.file.s3Key),
        alignedAt: uploadedAt,
        moved: Boolean(result.moved),
        ms,
      },
      rows,
    );
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    console.warn("[work-scan-auto-align] failed", String(id), message);
    return finish({ status: "failed", sourceKey, error: message, fileKeys: [] }, staleAutoRows);
  }
}

/** 대기열에서 하나를 맡아 처리한다. 맡을 것이 없으면 false. */
export async function runNextWorkScanAutoAlign() {
  const claimed = await claimNext();
  if (!claimed) return false;
  await processClaimed(claimed);
  return true;
}
