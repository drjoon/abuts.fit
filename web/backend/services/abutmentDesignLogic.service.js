// 확정 디자인의 원점 대비 차이를 남기고, 관리자 확인 뒤에만 생성 보정으로 쓴다.
// related files:
// - web/backend/services/abutmentDesignLogic.core.js
// - web/backend/models/abutmentDesignLogic.model.js
// - web/backend/controllers/ai/abutmentDesignLogic.controller.js
// - web/backend/controllers/admin/admin.abutmentDesignLogic.controller.js
import { gzipSync } from "zlib";
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import {
  AbutmentDesignChange,
  AbutmentDesignGenerationRule,
  AbutmentDesignLogicRule,
} from "../models/abutmentDesignLogic.model.js";
import {
  combineToothPatches,
  mergeRulePatch,
  summarizeChanges,
  teethFromSnapshotRows,
} from "./abutmentDesignLogic.core.js";
import { deleteFileFromS3, getObjectBufferFromS3, putObjectToS3 } from "../utils/s3.utils.js";

export { teethFromSnapshotRows };

const INLINE_MAX = 32 * 1024;

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function viewChange(row) {
  return {
    id: String(row._id),
    transferId: String(row.transferId || ""),
    patientName: String(row.patientName || ""),
    practiceName: String(row.practiceName || ""),
    editorName: String(row.editorName || ""),
    lines: Array.isArray(row.lines) ? row.lines.map((line) => String(line || "")).filter(Boolean) : [],
    toothNumbers: Array.isArray(row.toothNumbers) ? row.toothNumbers.map((tooth) => String(tooth || "")) : [],
    updatedAt: row.updatedAt || null,
  };
}

function storedParams(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) continue;
    out[key] = n;
  }
  return out;
}

function storedPose(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const key of ["tiltLabialDeg", "tiltMesialDeg"]) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n === 0) continue;
    out[key] = n;
  }
  return out;
}

export async function listActiveGenerationRules(userId) {
  const uid = Types.ObjectId.isValid(String(userId || "")) ? String(userId) : "";
  const [legacy, modern] = await Promise.all([
    AbutmentDesignLogicRule.find().select({ toothKind: 1, axis: 1, delta: 1 }).lean(),
    AbutmentDesignGenerationRule.find(
      uid
        ? { $or: [{ scope: "global" }, { scope: "user", userId: uid }] }
        : { scope: "global" },
    )
      .select({ toothKind: 1, scope: 1, params: 1, pose: 1 })
      .lean(),
  ]);
  const rules = legacy
    .filter((row) => Number.isFinite(Number(row.delta)) && row.delta !== 0 && row.axis)
    .map((row) => ({
      toothKind: row.toothKind,
      axis: row.axis,
      delta: row.delta,
    }));
  for (const row of modern) {
    const params = storedParams(row.params);
    const pose = storedPose(row.pose);
    if (Object.keys(params).length === 0 && Object.keys(pose).length === 0) continue;
    rules.push({
      toothKind: row.toothKind,
      scope: row.scope,
      ...(Object.keys(params).length > 0 ? { params } : {}),
      ...(Object.keys(pose).length > 0 ? { pose } : {}),
    });
  }
  return rules;
}

export async function listPendingDesignChanges() {
  const rows = await AbutmentDesignChange.find({ status: "pending" })
    .sort({ updatedAt: -1 })
    .limit(40)
    .lean();
  const items = rows.map(viewChange);
  return { count: items.length, items };
}

function payloadDocument(summary) {
  return {
    teeth: summary.teeth.map((row) => ({
      toothNumber: row.toothNumber,
      toothKind: row.toothKind,
      baselineParams: row.baselineParams,
      finalParams: row.finalParams,
      ...(row.gumball ? { gumball: row.gumball } : {}),
      lines: row.lines,
      patch: row.patch,
    })),
  };
}

async function writePayload(transferId, summary, previousKey) {
  const body = payloadDocument(summary);
  const json = JSON.stringify(body);
  const bytes = Buffer.byteLength(json);
  if (bytes <= INLINE_MAX) {
    if (previousKey) void deleteFileFromS3(previousKey).catch(() => {});
    return { payload: body, s3Key: "", bytes };
  }
  const key = `ai/abutment-design-changes/${transferId}.json.gz`;
  try {
    await putObjectToS3(key, gzipSync(Buffer.from(json)), {
      contentType: "application/json",
      contentEncoding: "gzip",
    });
    return { payload: null, s3Key: key, bytes };
  } catch (error) {
    console.warn("[abutment-design-logic] s3 payload failed", error?.message || error);
    if (bytes > 1_500_000) throw error;
    return { payload: body, s3Key: "", bytes };
  }
}

async function readPayload(doc) {
  if (doc?.payload && typeof doc.payload === "object") return doc.payload;
  const key = String(doc?.s3Key || "").trim();
  if (!key) return { teeth: [] };
  const buf = await getObjectBufferFromS3(key);
  const parsed = JSON.parse(Buffer.from(buf).toString("utf8"));
  return parsed && typeof parsed === "object" ? parsed : { teeth: [] };
}

export async function recordGenerationEdits(input) {
  const transferId = clean(input?.transferId, 80);
  const anchorRaw = clean(input?.practiceBusinessAnchorId, 40);
  const anchorId = Types.ObjectId.isValid(anchorRaw) ? anchorRaw : null;
  if (!transferId || !anchorId) return { recorded: 0 };
  const summary = summarizeChanges(input?.teeth);
  const pending = await AbutmentDesignChange.findOne({ transferId, status: "pending" });
  if (summary.teeth.length === 0) {
    if (pending) {
      if (pending.s3Key) void deleteFileFromS3(pending.s3Key).catch(() => {});
      await pending.deleteOne();
    }
    return { recorded: 0 };
  }
  const userRaw = clean(input?.userId, 40);
  const userId = Types.ObjectId.isValid(userRaw) ? userRaw : null;
  let practiceName = clean(input?.practiceName, 80);
  if (!practiceName) {
    const anchor = await BusinessAnchor.findById(anchorId).select({ name: 1 }).lean();
    practiceName = clean(anchor?.name, 80);
  }
  const stored = await writePayload(transferId, summary, pending?.s3Key || "");
  const action =
    input?.action === "manual" ? "manual" : input?.action === "save" ? "save" : "confirm";
  const fields = {
    transferId,
    userId,
    practiceBusinessAnchorId: anchorId,
    practiceName,
    editorName: clean(input?.editorName, 40),
    patientName: clean(input?.patientName, 40),
    action,
    status: "pending",
    lines: summary.lines,
    toothNumbers: summary.teeth.map((row) => row.toothNumber),
    payload: stored.payload,
    s3Key: stored.s3Key,
    bytes: stored.bytes,
    decidedAt: null,
    decidedBy: null,
  };
  if (pending) {
    pending.set(fields);
    await pending.save();
  } else {
    await AbutmentDesignChange.create(fields);
  }
  return { recorded: summary.teeth.length };
}

async function mergeOneRule(scope, userId, patch) {
  const owner = scope === "user" ? userId : null;
  const query = { scope, toothKind: patch.toothKind, userId: owner };
  const current = await AbutmentDesignGenerationRule.findOne(query).select({ params: 1, pose: 1 }).lean();
  const merged = mergeRulePatch(current, patch);
  if (Object.keys(merged.params).length === 0 && Object.keys(merged.pose).length === 0) return;
  await AbutmentDesignGenerationRule.updateOne(
    query,
    { $set: { params: merged.params, pose: merged.pose, userId: owner } },
    { upsert: true },
  );
}

export async function applyDesignChange(changeId, scope, actorId) {
  if (!Types.ObjectId.isValid(String(changeId || ""))) return { list: await listPendingDesignChanges() };
  if (scope !== "user" && scope !== "global") {
    return { error: "적용 대상을 고르세요.", list: await listPendingDesignChanges() };
  }
  const doc = await AbutmentDesignChange.findOne({ _id: changeId, status: "pending" });
  if (!doc) return { list: await listPendingDesignChanges() };
  if (scope === "user" && !doc.userId) {
    return { error: "편집한 사용자를 알 수 없습니다.", list: await listPendingDesignChanges() };
  }
  const payload = await readPayload(doc);
  const teeth = Array.isArray(payload?.teeth) ? payload.teeth : [];
  for (const patch of combineToothPatches(teeth)) {
    await mergeOneRule(scope, doc.userId, patch);
  }
  doc.status = scope;
  doc.decidedAt = new Date();
  doc.decidedBy = Types.ObjectId.isValid(String(actorId || "")) ? actorId : null;
  await doc.save();
  return { list: await listPendingDesignChanges() };
}

export async function dismissDesignChange(changeId, actorId) {
  if (!Types.ObjectId.isValid(String(changeId || ""))) return listPendingDesignChanges();
  const doc = await AbutmentDesignChange.findOne({ _id: changeId, status: "pending" });
  if (!doc) return listPendingDesignChanges();
  doc.status = "dismissed";
  doc.decidedAt = new Date();
  doc.decidedBy = Types.ObjectId.isValid(String(actorId || "")) ? actorId : null;
  await doc.save();
  return listPendingDesignChanges();
}

function mapStoredFiles(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const file = row?.file && typeof row.file === "object" ? row.file : {};
      const fileName = String(file.originalName || "").trim();
      const s3Key = String(file.s3Key || "").trim();
      if (!fileName || !s3Key) return null;
      return {
        fileName,
        s3Key,
        size: Number(file.size || 0),
        scanRole: String(row?.scanRole || "").trim() || null,
        uploadedAt: row?.uploadedAt || null,
      };
    })
    .filter(Boolean);
}

export async function loadGenerationLogicPreview(transferId, patientName, changeId) {
  const id = clean(transferId, 80);
  if (!id) return null;
  const transfer = await PracticeTransfer.findOne({ transferId: id })
    .select({
      transferId: 1,
      toothWorks: 1,
      files: 1,
      "production.labWorkScanFiles": 1,
    })
    .lean();
  if (!transfer) return null;
  let change = null;
  if (Types.ObjectId.isValid(String(changeId || ""))) {
    change = await AbutmentDesignChange.findOne({ _id: changeId, transferId: id, status: "pending" });
  }
  if (!change) {
    change = await AbutmentDesignChange.findOne({ transferId: id, status: "pending" }).sort({ updatedAt: -1 });
  }
  let originTeeth = [];
  let lines = [];
  if (change) {
    const payload = await readPayload(change);
    originTeeth = (Array.isArray(payload?.teeth) ? payload.teeth : [])
      .map((tooth) => ({
        toothNumber: String(tooth?.toothNumber || ""),
        baselineParams: tooth?.baselineParams && typeof tooth.baselineParams === "object" ? tooth.baselineParams : {},
      }))
      .filter((tooth) => tooth.toothNumber);
    lines = Array.isArray(change.lines) ? change.lines : [];
  }
  return {
    transferId: String(transfer.transferId || id),
    patientName: clean(patientName, 40),
    toothWorks: Array.isArray(transfer.toothWorks) ? transfer.toothWorks : [],
    files: mapStoredFiles(transfer.files),
    workScanFiles: mapStoredFiles(transfer.production?.labWorkScanFiles),
    changeId: change ? String(change._id) : "",
    lines,
    originTeeth,
  };
}
