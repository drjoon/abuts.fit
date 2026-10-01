// 심플어벗·심플힐링 템플릿(.dcm·.stl·.ply·.obj) 업로드 흐름(보안). 원본은 API 서버를 거치지 않는다.
// 1) 브라우저가 .dcm에서 축·치수(meta)를 계산해 보내고, 크기가 고정된 presigned POST로 격리 경로(quarantine)에 올린다.
// 2) GuardDuty 태그 NO_THREATS_FOUND만 연다. 위협이면 거절·원본 삭제·올린 사용자 차단.
// 3) 워커 스레드가 시간·메모리 제한 안에서 해석해 STL을 새로 만들고 AbutmentTemplate을 등록한다. 원본은 지운다.
// 관리자 검토 없이 등록한다. 기공소 템플릿은 바로 공용이고, 관리자는 문제 있는 것을 내린다.
// 예전 흐름(보류 경로 hold → 관리자 「열어 보기」)으로 남은 pending_review 건은 approve/reject로 마저 처리한다.
// related files:
// - web/backend/models/abutmentTemplateUpload.model.js
// - web/backend/models/abutmentTemplate.model.js
// - web/backend/services/abutmentTemplateImport.worker.js
// - web/backend/services/scanbodyLibraryUpload.service.js (검사 모드·예산·거절 문구)
// - web/backend/services/uploadBlocklist.service.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import crypto from "crypto";
import { gzipSync } from "zlib";
import { Worker } from "worker_threads";
import { Types } from "mongoose";
import AbutmentTemplate, { ABUTMENT_TEMPLATE_KINDS } from "../models/abutmentTemplate.model.js";
import AbutmentTemplateUpload from "../models/abutmentTemplateUpload.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { emitAppEventToRoles } from "../socket.js";
import {
  copyObjectInS3,
  createUploadPost,
  deleteFileFromS3,
  getObjectBufferFromS3,
  getObjectTagsFromS3,
  headObjectSizeInS3,
  objectExistsInS3,
  putObjectToS3,
} from "../utils/s3.utils.js";
import {
  SCANBODY_S3_PREFIX,
  SCAN_REJECT_MESSAGE,
  assertDailyScanBudget,
  scanbodyMalwareScanMode,
} from "./scanbodyLibraryUpload.service.js";
import { blockUploader } from "./uploadBlocklist.service.js";
import { MESH_FILE_PATTERN } from "../utils/scanbodyGeometry.js";

const QUARANTINE_PREFIX = `${SCANBODY_S3_PREFIX}/quarantine/`;
export const TEMPLATE_MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const POST_SLACK_BYTES = 16 * 1024;
const HOURLY_UPLOAD_LIMIT = 30;
/** 검사·해석 대기열을 한 기공소가 채우지 못하게 한다. */
const PENDING_PER_OWNER_LIMIT = 40;
const RESERVATION_MS = 20 * 60 * 1000;
const REVIEW_EXPIRE_MS = 30 * 24 * 3600 * 1000;
const SCAN_TIMEOUT_MS = 20 * 60 * 1000;
const PROCESS_STALE_MS = 10 * 60 * 1000;
const WORKER_TIMEOUT_MS = 60 * 1000;
const TERMINAL = new Set(["done", "rejected", "failed"]);

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function vec3(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const out = value.map(Number);
  return out.every((v) => Number.isFinite(v) && Math.abs(v) <= 2000) ? out : null;
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 1000) / 1000 : 0;
}

/** 브라우저가 계산한 meta를 확인한다. 원본은 아직 열지 않았으니 여기 값만 믿는다. */
export function parseTemplateMeta(raw) {
  let meta = raw;
  if (!meta || typeof meta !== "object") {
    try {
      meta = JSON.parse(String(raw || ""));
    } catch {
      throw new ApiError(400, "템플릿 정보가 올바르지 않습니다.");
    }
  }
  const kind = text(meta?.kind);
  const diameter = text(meta?.diameter, 10);
  const height = text(meta?.height, 10).toUpperCase();
  if (!ABUTMENT_TEMPLATE_KINDS.includes(kind)) throw new ApiError(400, "심플어벗 종류가 올바르지 않습니다.");
  if (!/^\d+(\.\d+)?$/.test(diameter)) throw new ApiError(400, "직경이 올바르지 않습니다.");
  if (height && !/^[A-Z0-9]{1,4}$/.test(height)) throw new ApiError(400, "높이가 올바르지 않습니다.");
  const frame = {
    origin: vec3(meta?.frame?.origin),
    axis: vec3(meta?.frame?.axis),
    ref: vec3(meta?.frame?.ref),
  };
  if (!frame.origin || !frame.axis || !frame.ref) throw new ApiError(400, "템플릿 축 정보가 없습니다.");
  return {
    kind,
    diameter,
    height,
    frame,
    marginHeightMm: positive(meta?.marginHeightMm),
    maxDiameterMm: positive(meta?.maxDiameterMm),
    heightMm: positive(meta?.heightMm),
  };
}

export function templateUploadView(job, extra = {}) {
  return {
    id: String(job._id),
    fileName: job.fileName,
    size: job.size || job.declaredSize || 0,
    status: job.status,
    scanStatus: job.scanStatus || "",
    message: job.message || "",
    kind: job.meta?.kind || "",
    diameter: job.meta?.diameter || "",
    height: job.meta?.height || "",
    templateId: job.templateId ? String(job.templateId) : null,
    createdAt: job.createdAt,
    reviewedAt: job.reviewedAt || null,
    finishedAt: job.finishedAt || null,
    ...extra,
  };
}

/** 관리자 검토 화면: 올린 사람·사업자 정보를 붙인다. */
export async function templateReviewViews(jobs) {
  const userIds = [...new Set(jobs.map((job) => String(job.uploadedBy || "")).filter(Boolean))];
  const anchorIds = [
    ...new Set(
      jobs.flatMap((job) => [job.uploaderAnchorId, job.ownerAnchorId].filter(Boolean).map(String)),
    ),
  ];
  const [users, anchors] = await Promise.all([
    userIds.length ? User.find({ _id: { $in: userIds } }).select({ name: 1, email: 1 }).lean() : [],
    anchorIds.length ? BusinessAnchor.find({ _id: { $in: anchorIds } }).select({ name: 1 }).lean() : [],
  ]);
  const userById = new Map(users.map((row) => [String(row._id), row]));
  const anchorName = new Map(anchors.map((row) => [String(row._id), String(row.name || "")]));
  return jobs.map((job) => {
    const user = userById.get(String(job.uploadedBy || ""));
    const businessId = String(job.uploaderAnchorId || job.ownerAnchorId || "");
    return templateUploadView(job, {
      uploader: {
        userId: job.uploadedBy ? String(job.uploadedBy) : null,
        name: String(user?.name || ""),
        email: String(user?.email || ""),
        businessAnchorId: businessId || null,
        businessName: businessId ? (anchorName.get(businessId) ?? "") : "",
      },
      autoApproved: Boolean(job.autoApproved),
      reviewReason: job.reviewReason || "",
      markedMalicious: Boolean(job.markedMalicious),
    });
  });
}

export async function createTemplateUpload({ ownerAnchorId, userId, uploaderAnchorId, isAdmin, fileName, size, meta }) {
  const name = text(fileName, 200);
  if (!MESH_FILE_PATTERN.test(name)) throw new ApiError(400, ".dcm·.stl·.ply·.obj 파일만 올릴 수 있습니다.");
  const declaredSize = Number(size);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) throw new ApiError(400, "파일 크기가 올바르지 않습니다.");
  if (declaredSize > TEMPLATE_MAX_UPLOAD_BYTES) {
    throw new ApiError(400, `파일이 너무 큽니다(최대 ${TEMPLATE_MAX_UPLOAD_BYTES / 1024 / 1024}MB).`);
  }
  const parsedMeta = parseTemplateMeta(meta);
  const [recent, pending] = await Promise.all([
    AbutmentTemplateUpload.countDocuments({
      uploadedBy: userId,
      createdAt: { $gte: new Date(Date.now() - 3600 * 1000) },
    }),
    isAdmin
      ? 0
      : AbutmentTemplateUpload.countDocuments({
          ownerAnchorId,
          status: { $in: ["uploading", "scanning", "processing"] },
        }),
  ]);
  if (recent >= HOURLY_UPLOAD_LIMIT) throw new ApiError(429, "업로드가 너무 많습니다. 한 시간 뒤 다시 올려 주세요.");
  if (pending >= PENDING_PER_OWNER_LIMIT) {
    throw new ApiError(429, "검사 중인 템플릿이 많습니다. 끝난 뒤 다시 올려 주세요.");
  }
  if (scanbodyMalwareScanMode() === "guardduty") await assertDailyScanBudget(declaredSize);

  const _id = new Types.ObjectId();
  const quarantineKey = `${QUARANTINE_PREFIX}${_id}.bin`;
  const holdKey = "";
  const contentType = "application/octet-stream";
  const [{ url, fields }, job] = await Promise.all([
    createUploadPost(quarantineKey, {
      contentType,
      contentLength: declaredSize,
      slackBytes: POST_SLACK_BYTES,
    }),
    AbutmentTemplateUpload.create({
      _id,
      ownerAnchorId,
      uploadedBy: userId,
      uploaderAnchorId: uploaderAnchorId || null,
      fileName: name,
      declaredSize,
      meta: parsedMeta,
      holdKey,
      quarantineKey,
      autoApproved: true,
    }),
  ]);
  return { job, uploadUrl: url, fields };
}

const uploadedKey = (job) => job.holdKey || job.quarantineKey;

async function finish(jobId, status, fields, keyToDelete) {
  const job = await AbutmentTemplateUpload.findByIdAndUpdate(
    jobId,
    { $set: { status, finishedAt: new Date(), ...fields } },
    { new: true },
  ).lean();
  if (keyToDelete) void deleteFileFromS3(keyToDelete);
  return job;
}

export async function completeTemplateUpload(job) {
  if (job.status !== "uploading") return job;
  const key = uploadedKey(job);
  const size = await headObjectSizeInS3(key);
  if (size == null) throw new ApiError(400, "파일이 올라가지 않았습니다. 다시 올려 주세요.");
  if (size > TEMPLATE_MAX_UPLOAD_BYTES || size > job.declaredSize + POST_SLACK_BYTES) {
    return finish(job._id, "rejected", { size, message: "파일 크기가 신청과 다릅니다." }, key);
  }
  if (!job.autoApproved) {
    const next = await AbutmentTemplateUpload.findOneAndUpdate(
      { _id: job._id, status: "uploading" },
      { $set: { status: "pending_review", size, message: "" } },
      { new: true },
    ).lean();
    return next ?? AbutmentTemplateUpload.findById(job._id).lean();
  }
  const next = await AbutmentTemplateUpload.findOneAndUpdate(
    { _id: job._id, status: "uploading" },
    { $set: { status: "scanning", size, scanStartedAt: new Date() } },
    { new: true },
  ).lean();
  if (!next) return AbutmentTemplateUpload.findById(job._id).lean();
  if (scanbodyMalwareScanMode() === "off") return advanceTemplateUpload(next);
  watch(String(next._id));
  return next;
}

/** 관리자 「열어 보기」: 보류본을 격리 경로로 옮겨 검사를 시작한다. */
export async function approveTemplateUpload(jobId, adminId) {
  const job = await AbutmentTemplateUpload.findById(jobId).lean();
  if (!job) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  if (job.status !== "pending_review") throw new ApiError(409, "검토 대기 중인 업로드가 아닙니다.");
  if (scanbodyMalwareScanMode() === "guardduty") await assertDailyScanBudget(job.size || job.declaredSize);
  const claimed = await AbutmentTemplateUpload.findOneAndUpdate(
    { _id: job._id, status: "pending_review" },
    { $set: { status: "scanning", reviewedBy: adminId, reviewedAt: new Date(), scanStartedAt: new Date() } },
    { new: true },
  ).lean();
  if (!claimed) throw new ApiError(409, "검토 대기 중인 업로드가 아닙니다.");
  try {
    await copyObjectInS3(claimed.holdKey, claimed.quarantineKey);
  } catch (error) {
    console.error("[template-upload] copy to quarantine failed", { jobId: String(job._id), error: error?.message });
    await AbutmentTemplateUpload.updateOne(
      { _id: job._id, status: "scanning" },
      { $set: { status: "pending_review", reviewedBy: null, reviewedAt: null, scanStartedAt: null } },
    );
    throw new ApiError(502, "파일을 검사 경로로 옮기지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
  }
  void deleteFileFromS3(claimed.holdKey);
  if (scanbodyMalwareScanMode() === "off") return advanceTemplateUpload(claimed);
  watch(String(claimed._id));
  return claimed;
}

/** 관리자 「폐기」: 열지 않고 보류본을 지운다. 악성으로 표시하면 올린 사용자를 차단한다. */
export async function rejectTemplateUpload(jobId, { adminId, reason, malicious }) {
  const note = text(reason, 300);
  const job = await AbutmentTemplateUpload.findOneAndUpdate(
    { _id: jobId, status: "pending_review" },
    {
      $set: {
        status: "rejected",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewReason: note,
        markedMalicious: Boolean(malicious),
        finishedAt: new Date(),
        message: note ? `관리자가 폐기했습니다. (${note})` : "관리자가 폐기했습니다.",
      },
    },
    { new: true },
  ).lean();
  if (!job) {
    if (!(await AbutmentTemplateUpload.exists({ _id: jobId }))) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
    throw new ApiError(409, "검토 대기 중인 업로드가 아닙니다.");
  }
  if (job.holdKey && !(await deleteFileFromS3(job.holdKey))) {
    console.error("[template-upload] hold delete failed", { jobId: String(job._id), key: job.holdKey });
  }
  if (malicious) {
    await blockUploader({
      userId: job.uploadedBy,
      businessAnchorId: job.uploaderAnchorId || job.ownerAnchorId,
      reason: note || "관리자가 심플어벗 템플릿 업로드를 악성으로 폐기했습니다.",
      source: "admin",
      uploadKind: "template",
      uploadId: job._id,
      fileName: job.fileName,
      createdBy: adminId,
    });
  }
  return job;
}

/** 올리다 만 건·오래 검토되지 않은 건을 정리한다. 목록 조회 때 조금씩 돈다. */
export async function sweepStaleTemplateUploads() {
  const now = Date.now();
  const stale = await AbutmentTemplateUpload.find({
    $or: [
      { status: "uploading", createdAt: { $lt: new Date(now - RESERVATION_MS) } },
      { status: "pending_review", createdAt: { $lt: new Date(now - REVIEW_EXPIRE_MS) } },
    ],
  })
    .select({ status: 1, holdKey: 1, quarantineKey: 1 })
    .limit(30)
    .lean();
  for (const row of stale) {
    const updated = await AbutmentTemplateUpload.updateOne(
      { _id: row._id, status: row.status },
      {
        $set: {
          status: "failed",
          finishedAt: new Date(),
          message:
            row.status === "uploading"
              ? "업로드가 끝나지 않아 취소했습니다."
              : "30일 동안 검토되지 않아 지웠습니다. 다시 올려 주세요.",
        },
      },
    );
    if (updated.modifiedCount) void deleteFileFromS3(uploadedKey(row));
  }
}

/** 검사 결과를 확인해 다음 단계로 넘긴다. 처리는 기다리지 않고 시작만 한다. */
export async function advanceTemplateUpload(jobOrId) {
  const job =
    typeof jobOrId === "object" && jobOrId?._id
      ? jobOrId
      : await AbutmentTemplateUpload.findById(jobOrId).lean();
  if (!job || TERMINAL.has(job.status) || job.status === "uploading" || job.status === "pending_review") return job;

  if (job.status === "processing") {
    if (job.processingAt && Date.now() - new Date(job.processingAt).getTime() > PROCESS_STALE_MS) {
      return finish(job._id, "failed", { message: "처리가 끝나지 않았습니다. 다시 올려 주세요." }, job.quarantineKey);
    }
    return job;
  }

  let scanStatus = "SKIPPED";
  if (scanbodyMalwareScanMode() === "guardduty") {
    let tags = {};
    try {
      tags = await getObjectTagsFromS3(job.quarantineKey);
    } catch (error) {
      console.error("[template-upload] tag read failed", { jobId: String(job._id), error: error?.message });
    }
    scanStatus = String(tags.GuardDutyMalwareScanStatus || "");
    if (!scanStatus) {
      if (Date.now() - new Date(job.scanStartedAt || job.createdAt).getTime() > SCAN_TIMEOUT_MS) {
        return finish(
          job._id,
          "failed",
          { message: "악성코드 검사가 끝나지 않았습니다. 잠시 뒤 다시 올려 주세요." },
          job.quarantineKey,
        );
      }
      return job;
    }
    if (scanStatus !== "NO_THREATS_FOUND") {
      if (scanStatus === "THREATS_FOUND") {
        console.warn("[template-upload] threat found", {
          jobId: String(job._id),
          ownerAnchorId: job.ownerAnchorId ? String(job.ownerAnchorId) : null,
          uploadedBy: String(job.uploadedBy),
        });
        void blockUploader({
          userId: job.uploadedBy,
          businessAnchorId: job.uploaderAnchorId || job.ownerAnchorId,
          reason: "GuardDuty가 심플어벗 템플릿 업로드에서 악성코드를 찾았습니다.",
          source: "guardduty",
          uploadKind: "template",
          uploadId: job._id,
          fileName: job.fileName,
        }).catch((error) => {
          console.error("[template-upload] blocklist failed", { jobId: String(job._id), error: error?.message });
        });
      }
      return finish(
        job._id,
        "rejected",
        { scanStatus, message: SCAN_REJECT_MESSAGE[scanStatus] || SCAN_REJECT_MESSAGE.FAILED },
        job.quarantineKey,
      );
    }
  }

  const claimed = await AbutmentTemplateUpload.findOneAndUpdate(
    { _id: job._id, status: "scanning" },
    { $set: { status: "processing", processingAt: new Date(), scanStatus } },
    { new: true },
  ).lean();
  if (!claimed) return AbutmentTemplateUpload.findById(job._id).lean();
  void processTemplateUpload(claimed).catch((error) => {
    console.error("[template-upload] process crashed", { jobId: String(claimed._id), error: error?.message });
  });
  return claimed;
}

const watchers = new Set();

function watch(jobId, delay = 3000) {
  if (watchers.has(jobId)) return;
  watchers.add(jobId);
  const tick = (wait) => {
    const timer = setTimeout(async () => {
      try {
        const job = await advanceTemplateUpload(jobId);
        if (job?.status === "scanning") return tick(Math.min(wait * 1.5, 30_000));
      } catch (error) {
        console.error("[template-upload] watch failed", { jobId, error: error?.message });
      }
      watchers.delete(jobId);
    }, wait);
    timer.unref?.();
  };
  tick(delay);
}

/** 형상 파일 → STL. 시간을 넘기거나 메모리 한도에 걸리면 워커를 끊는다. */
function decodeInWorker(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./abutmentTemplateImport.worker.js", import.meta.url), {
      workerData: { buffer, fileName },
      resourceLimits: { maxOldGenerationSizeMb: 768, maxYoungGenerationSizeMb: 64 },
    });
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new Error("worker timeout")), WORKER_TIMEOUT_MS);
    worker.once("message", (msg) => done(resolve, msg));
    worker.once("error", (error) => done(reject, error));
    worker.once("exit", (code) => done(reject, new Error(`worker exited (${code})`)));
  });
}

async function processTemplateUpload(job) {
  const key = job.quarantineKey;
  let buffer;
  try {
    buffer = await getObjectBufferFromS3(key);
  } catch (error) {
    console.error("[template-upload] read failed", { jobId: String(job._id), error: error?.message });
    return finish(job._id, "failed", { message: "올린 파일을 읽지 못했습니다. 다시 올려 주세요." }, key);
  }
  if (buffer.length > TEMPLATE_MAX_UPLOAD_BYTES + POST_SLACK_BYTES) {
    return finish(job._id, "rejected", { message: "파일이 너무 큽니다." }, key);
  }
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  let decoded;
  try {
    decoded = await decodeInWorker(buffer, job.fileName);
  } catch (error) {
    console.error("[template-upload] worker failed", { jobId: String(job._id), error: error?.message });
    return finish(job._id, "failed", { sha256, message: "형상을 해석하지 못했습니다(시간·메모리 한도)." }, key);
  }
  if (!decoded.ok) {
    if (!decoded.input) console.error("[template-upload] decode error", { jobId: String(job._id), error: decoded.message });
    return finish(
      job._id,
      decoded.input ? "rejected" : "failed",
      { sha256, message: decoded.input ? decoded.message : "형상을 해석하지 못했습니다." },
      key,
    );
  }

  try {
    const stl = Buffer.from(decoded.stl.buffer, decoded.stl.byteOffset, decoded.stl.length);
    const s3Key = `${SCANBODY_S3_PREFIX}/${decoded.hash}.stl`;
    if (!(await objectExistsInS3(s3Key))) {
      await putObjectToS3(s3Key, gzipSync(stl), { contentType: "model/stl", contentEncoding: "gzip" });
    }
    const { kind, diameter, height, frame, marginHeightMm, maxDiameterMm, heightMm } = job.meta;
    const ownerAnchorId = job.ownerAnchorId ?? null;
    const spec = { ownerAnchorId, kind, diameter, height };
    const base = await AbutmentTemplate.findOne({ ...spec, forkOf: null }).lean();
    // 올린 기공소의 공용 템플릿은 다른 기공소가 쓰고 있다. 다시 올리면 그 기공소 사본만 바꾼다.
    const forkOf = ownerAnchorId && base?.isPublic ? base._id : null;
    const takenDown = Boolean(base?.reviewedAt) && !base?.isPublic;
    const template = await AbutmentTemplate.findOneAndUpdate(
      { ...spec, forkOf },
      {
        $set: {
          fileName: job.fileName,
          hash: decoded.hash,
          s3Key,
          size: stl.length,
          frame,
          marginHeightMm,
          maxDiameterMm,
          heightMm,
          uploadedBy: job.uploadedBy ?? null,
          ...(ownerAnchorId && !forkOf && !takenDown ? { isPublic: true } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    emitAppEventToRoles(["admin"], "scanbody:demand-updated", { at: new Date().toISOString() });
    return finish(job._id, "done", { sha256, templateId: template._id, message: "" }, key);
  } catch (error) {
    console.error("[template-upload] store failed", { jobId: String(job._id), error: error?.message });
    return finish(job._id, "failed", { sha256, message: "템플릿을 저장하지 못했습니다. 다시 올려 주세요." }, key);
  }
}
