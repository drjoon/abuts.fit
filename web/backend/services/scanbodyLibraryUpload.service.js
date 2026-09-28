// 스캔바디 라이브러리 업로드 흐름(보안).
// 1) 브라우저가 크기가 고정된 presigned POST로 원본을 S3 격리 경로에 올린다. API 서버를 거치지 않는다.
//    오늘(KST) 검사 추정이 $1을 넘으면 여기서 막는다.
// 2) GuardDuty Malware Protection for S3가 검사해 GuardDutyMalwareScanStatus 태그를 붙인다.
//    NO_THREATS_FOUND만 연다. 위협·검사 불가는 거절하고 원본을 지운다. 위협이면 올린 사용자를 차단 목록에 넣는다.
// 3) 워커 스레드가 압축을 제한 안에서 풀고 형상을 새로 만든다(scanbodyLibraryImport.service.js).
// 4) 형상은 해시 키(gzip)로 저장하고, 같은 소유자·시스템 이름의 라이브러리에 합친다.
// 검사 대기는 서버 타이머와 브라우저 폴링(GET) 둘 다 진행시킨다. 처리 시작은 상태 전환으로 한 번만 잡는다.
// SCANBODY_MALWARE_SCAN=guardduty|off (기본: production만 guardduty).
// related files:
// - web/backend/models/scanbodyLibraryUpload.model.js
// - web/backend/services/scanbodyLibraryImport.worker.js
// - web/backend/services/abutmentTemplateUpload.service.js (같은 검사 예산·차단 목록)
// - web/backend/services/uploadBlocklist.service.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import crypto from "crypto";
import { gzipSync } from "zlib";
import { Worker } from "worker_threads";
import { Types } from "mongoose";
import ScanbodyLibrary from "../models/scanbodyLibrary.model.js";
import ScanbodyLibraryUpload from "../models/scanbodyLibraryUpload.model.js";
import AbutmentTemplateUpload from "../models/abutmentTemplateUpload.model.js";
import { ApiError } from "../utils/ApiError.js";
import { blockUploader } from "./uploadBlocklist.service.js";
import {
  deleteFileFromS3,
  getObjectBufferFromS3,
  getObjectTagsFromS3,
  createUploadPost,
  headObjectSizeInS3,
  objectExistsInS3,
  putObjectToS3,
} from "../utils/s3.utils.js";
import { SCANBODY_UPLOAD_LIMITS } from "./scanbodyLibraryImport.service.js";

export const SCANBODY_S3_PREFIX = "scanbody-library";
const QUARANTINE_PREFIX = `${SCANBODY_S3_PREFIX}/quarantine/`;
const SCAN_TIMEOUT_MS = 20 * 60 * 1000;
const PROCESS_STALE_MS = 15 * 60 * 1000;
const WORKER_TIMEOUT_MS = 3 * 60 * 1000;
const HOURLY_UPLOAD_LIMIT = 40;
// GuardDuty Malware Protection for S3는 용량·건수로 과금되고 하루 한도가 없다.
// us-east는 $0.09/GB·$0.215/1,000건(2025-02). ap-south-1이 더 비쌀 수 있어 단가를 높게 잡아
// 오늘(KST) 추정이 $1을 넘기 전에 격리 경로 업로드를 막는다.
const SCAN_DAILY_USD = 1;
const SCAN_USD_PER_GB = 0.15;
const SCAN_USD_PER_1000 = 0.3;
/** presigned POST의 content-length-range는 파일+폼 전체라, 필드 여유분만큼만 더 허락한다. */
const POST_SLACK_BYTES = 16 * 1024;
const RESERVATION_MS = 20 * 60 * 1000;
const TERMINAL = new Set(["done", "rejected", "failed"]);
export const SCAN_REJECT_MESSAGE = {
  THREATS_FOUND: "악성코드가 발견되어 거절했습니다. 원본은 지웠습니다.",
  UNSUPPORTED: "악성코드 검사를 할 수 없는 파일입니다. 암호가 걸렸거나 너무 큰 압축 파일이면 풀어서 나눠 올려 주세요.",
  ACCESS_DENIED: "악성코드 검사를 마치지 못했습니다. 관리자에게 알려 주세요.",
  FAILED: "악성코드 검사를 마치지 못했습니다. 잠시 뒤 다시 올려 주세요.",
};

export function scanbodyMalwareScanMode() {
  const raw = String(process.env.SCANBODY_MALWARE_SCAN || "").trim().toLowerCase();
  if (raw === "off" || raw === "guardduty") return raw;
  return process.env.NODE_ENV === "production" ? "guardduty" : "off";
}

export function uploadView(job) {
  return {
    id: String(job._id),
    fileName: job.fileName,
    size: job.size || job.declaredSize || 0,
    status: job.status,
    scanStatus: job.scanStatus || "",
    message: job.message || "",
    notes: job.notes || [],
    libraries: (job.libraries || []).map((row) => ({
      libraryId: row.libraryId ? String(row.libraryId) : null,
      systemName: row.systemName,
      source: row.source,
      kitCount: row.kitCount,
      partCount: row.partCount,
    })),
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  };
}

function kstDayStart() {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00+09:00`);
}

function scanCostUsd(bytes, objects) {
  return (bytes / 1e9) * SCAN_USD_PER_GB + (objects / 1000) * SCAN_USD_PER_1000;
}

/** 신청만 하고 안 올린 건은 예약을 풀고, 실제로 올라간 건은 지운 뒤에도 오늘 용량에 남긴다. */
async function settleStaleReservations() {
  const stale = await ScanbodyLibraryUpload.find({
    status: "uploading",
    createdAt: { $lt: new Date(Date.now() - RESERVATION_MS) },
  })
    .select({ quarantineKey: 1 })
    .limit(30)
    .lean();
  for (const row of stale) {
    const size = (await headObjectSizeInS3(row.quarantineKey)) || 0;
    const updated = await ScanbodyLibraryUpload.updateOne(
      { _id: row._id, status: "uploading" },
      {
        $set: {
          status: "failed",
          size,
          finishedAt: new Date(),
          message: "업로드가 끝나지 않아 취소했습니다.",
        },
      },
    );
    if (updated.modifiedCount && size > 0) void deleteFileFromS3(row.quarantineKey);
  }
}

/** 심플어벗 템플릿은 관리자가 열어 볼 때(격리 경로 복사) 검사 비용이 든다. */
async function templateScanUsage() {
  const [row] = await AbutmentTemplateUpload.aggregate([
    { $match: { scanStartedAt: { $gte: kstDayStart() } } },
    { $group: { _id: null, bytes: { $sum: "$size" }, count: { $sum: 1 } } },
  ]);
  return { bytes: row?.bytes || 0, count: row?.count || 0 };
}

/** 오늘(KST) 라이브러리·템플릿 검사 추정 + 이번 건이 $1을 넘으면 429. */
export async function assertDailyScanBudget(declaredSize) {
  await settleStaleReservations();
  const templates = await templateScanUsage();
  const [used] = await ScanbodyLibraryUpload.aggregate([
    { $match: { createdAt: { $gte: kstDayStart() } } },
    {
      $project: {
        bytes: {
          $cond: [
            { $gt: ["$size", 0] },
            "$size",
            { $cond: [{ $eq: ["$status", "uploading"] }, "$declaredSize", 0] },
          ],
        },
        hit: { $cond: [{ $or: [{ $gt: ["$size", 0] }, { $eq: ["$status", "uploading"] }] }, 1, 0] },
      },
    },
    { $group: { _id: null, bytes: { $sum: "$bytes" }, count: { $sum: "$hit" } } },
  ]);
  const next = scanCostUsd(
    (used?.bytes || 0) + templates.bytes + declaredSize,
    (used?.count || 0) + templates.count + 1,
  );
  if (next > SCAN_DAILY_USD) {
    throw new ApiError(429, "오늘 악성코드 검사 한도(하루 $1)에 도달했습니다. 내일 다시 올려 주세요.");
  }
}

export async function createScanbodyUpload({ ownerAnchorId, userId, fileName, size }) {
  const name = String(fileName || "").trim().slice(0, 200);
  if (!/\.(dme|zip)$/i.test(name)) throw new ApiError(400, ".dme 또는 .zip 파일만 올릴 수 있습니다.");
  const declaredSize = Number(size);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) throw new ApiError(400, "파일 크기가 올바르지 않습니다.");
  if (declaredSize > SCANBODY_UPLOAD_LIMITS.maxUploadBytes) {
    throw new ApiError(400, `파일이 너무 큽니다(최대 ${SCANBODY_UPLOAD_LIMITS.maxUploadBytes / 1024 / 1024}MB).`);
  }
  const recent = await ScanbodyLibraryUpload.countDocuments({
    uploadedBy: userId,
    createdAt: { $gte: new Date(Date.now() - 3600 * 1000) },
  });
  if (recent >= HOURLY_UPLOAD_LIMIT) throw new ApiError(429, "업로드가 너무 많습니다. 한 시간 뒤 다시 올려 주세요.");
  if (scanbodyMalwareScanMode() === "guardduty") await assertDailyScanBudget(declaredSize);

  const _id = new Types.ObjectId();
  const quarantineKey = `${QUARANTINE_PREFIX}${_id}.bin`;
  const contentType = "application/octet-stream";
  const [{ url, fields }, job] = await Promise.all([
    createUploadPost(quarantineKey, { contentType, contentLength: declaredSize, slackBytes: POST_SLACK_BYTES }),
    ScanbodyLibraryUpload.create({ _id, ownerAnchorId, uploadedBy: userId, fileName: name, declaredSize, quarantineKey }),
  ]);
  return { job, uploadUrl: url, fields };
}

async function finish(jobId, status, fields, quarantineKey) {
  const job = await ScanbodyLibraryUpload.findByIdAndUpdate(
    jobId,
    { $set: { status, finishedAt: new Date(), ...fields } },
    { new: true },
  ).lean();
  if (quarantineKey) void deleteFileFromS3(quarantineKey);
  return job;
}

export async function completeScanbodyUpload(job) {
  if (job.status !== "uploading") return job;
  const size = await headObjectSizeInS3(job.quarantineKey);
  if (size == null) throw new ApiError(400, "파일이 올라가지 않았습니다. 다시 올려 주세요.");
  if (size > SCANBODY_UPLOAD_LIMITS.maxUploadBytes || size > job.declaredSize + POST_SLACK_BYTES) {
    return finish(job._id, "rejected", { size, message: "파일 크기가 신청과 다릅니다." }, job.quarantineKey);
  }
  const next = await ScanbodyLibraryUpload.findOneAndUpdate(
    { _id: job._id, status: "uploading" },
    { $set: { status: "scanning", size, scanStartedAt: new Date() } },
    { new: true },
  ).lean();
  if (!next) return ScanbodyLibraryUpload.findById(job._id).lean();
  if (scanbodyMalwareScanMode() === "off") return advanceScanbodyUpload(next);
  watch(String(next._id));
  return next;
}

/** 검사 결과를 확인해 다음 단계로 넘긴다. 처리는 기다리지 않고 시작만 한다. */
export async function advanceScanbodyUpload(jobOrId) {
  const job =
    typeof jobOrId === "object" && jobOrId?._id
      ? jobOrId
      : await ScanbodyLibraryUpload.findById(jobOrId).lean();
  if (!job || TERMINAL.has(job.status) || job.status === "uploading") return job;

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
      console.error("[scanbody-upload] tag read failed", { jobId: String(job._id), error: error?.message });
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
        console.warn("[scanbody-upload] threat found", {
          jobId: String(job._id),
          ownerAnchorId: job.ownerAnchorId ? String(job.ownerAnchorId) : null,
          uploadedBy: String(job.uploadedBy),
        });
        void blockUploader({
          userId: job.uploadedBy,
          businessAnchorId: job.ownerAnchorId,
          reason: "GuardDuty가 스캔바디 라이브러리 업로드에서 악성코드를 찾았습니다.",
          source: "guardduty",
          uploadKind: "library",
          uploadId: job._id,
          fileName: job.fileName,
        }).catch((error) => {
          console.error("[scanbody-upload] blocklist failed", { jobId: String(job._id), error: error?.message });
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

  const claimed = await ScanbodyLibraryUpload.findOneAndUpdate(
    { _id: job._id, status: "scanning" },
    { $set: { status: "processing", processingAt: new Date(), scanStatus } },
    { new: true },
  ).lean();
  if (!claimed) return ScanbodyLibraryUpload.findById(job._id).lean();
  void processUpload(claimed).catch((error) => {
    console.error("[scanbody-upload] process crashed", { jobId: String(claimed._id), error: error?.message });
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
        const job = await advanceScanbodyUpload(jobId);
        if (job?.status === "scanning") return tick(Math.min(wait * 1.5, 30_000));
      } catch (error) {
        console.error("[scanbody-upload] watch failed", { jobId, error: error?.message });
      }
      watchers.delete(jobId);
    }, wait);
    timer.unref?.();
  };
  tick(delay);
}

function parseInWorker(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scanbodyLibraryImport.worker.js", import.meta.url), {
      workerData: { buffer, fileName },
      resourceLimits: { maxOldGenerationSizeMb: 2048 },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("worker timeout"));
    }, WORKER_TIMEOUT_MS);
    worker.once("message", (msg) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(msg);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  const run = async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function storePart(part) {
  const s3Key = `${SCANBODY_S3_PREFIX}/${part.hash}.stl`;
  if (!(await objectExistsInS3(s3Key))) {
    await putObjectToS3(s3Key, gzipSync(Buffer.from(part.stl)), {
      contentType: "model/stl",
      contentEncoding: "gzip",
    });
  }
  return s3Key;
}

async function mergeLibrary({ ownerAnchorId, userId, lib, keys }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const existing = await ScanbodyLibrary.findOne({ ownerAnchorId, systemName: lib.systemName });
      const doc = existing ?? new ScanbodyLibrary({ ownerAnchorId, systemName: lib.systemName, source: lib.source });
      const parts = new Map((doc.parts || []).map((part) => [part.partId, part.toObject?.() ?? part]));
      for (const part of lib.parts) {
        parts.set(part.hash, {
          partId: part.hash,
          name: part.name,
          partClass: "scanAbutment",
          format: "stl",
          hash: part.hash,
          s3Key: keys.get(part.hash),
          size: part.stl.length,
        });
      }
      const kits = new Map((doc.kits || []).map((kit) => [kit.kitId, kit.toObject?.() ?? kit]));
      for (const kit of lib.kits) {
        kits.set(kit.kitId, {
          kitId: kit.kitId,
          name: kit.name,
          implantPartId: null,
          scanAbutmentPartIds: kit.scanAbutmentPartIds,
          screwPartId: null,
          basePartId: null,
          blankPartId: null,
          catalogIds: kits.get(kit.kitId)?.catalogIds ?? [],
        });
      }
      const union = (a, b) => [...new Set([...(a || []), ...(b || [])].filter(Boolean))];
      doc.parts = [...parts.values()];
      doc.kits = [...kits.values()];
      doc.fileNames = union(doc.fileNames, lib.fileNames);
      doc.containerVersions = union(doc.containerVersions, lib.containerVersions).sort();
      doc.uploadedBy = userId;
      // 공용으로 올린 기공소 라이브러리가 바뀌면 다시 검토받는다.
      if (ownerAnchorId && doc.isPublic) {
        doc.isPublic = false;
        doc.reviewedBy = null;
        doc.reviewedAt = null;
      }
      await doc.save();
      return doc;
    } catch (error) {
      const retryable = error?.name === "VersionError" || error?.code === 11000;
      if (!retryable || attempt >= 4) throw error;
    }
  }
}

async function processUpload(job) {
  const quarantineKey = job.quarantineKey;
  let buffer;
  try {
    buffer = await getObjectBufferFromS3(quarantineKey);
  } catch (error) {
    console.error("[scanbody-upload] read failed", { jobId: String(job._id), error: error?.message });
    return finish(job._id, "failed", { message: "올린 파일을 읽지 못했습니다. 다시 올려 주세요." }, quarantineKey);
  }
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  let parsed;
  try {
    parsed = await parseInWorker(buffer, job.fileName);
  } catch (error) {
    console.error("[scanbody-upload] worker failed", { jobId: String(job._id), error: error?.message });
    return finish(job._id, "failed", { sha256, message: "파일을 해석하지 못했습니다. 나눠서 다시 올려 주세요." }, quarantineKey);
  }
  if (!parsed.ok) {
    if (!parsed.input) console.error("[scanbody-upload] parse error", { jobId: String(job._id), error: parsed.message });
    return finish(
      job._id,
      parsed.input ? "rejected" : "failed",
      { sha256, message: parsed.input ? parsed.message : "파일을 해석하지 못했습니다." },
      quarantineKey,
    );
  }

  try {
    const unique = new Map();
    for (const lib of parsed.libraries) for (const part of lib.parts) unique.set(part.hash, part);
    const keys = new Map();
    await mapLimit([...unique.values()], 8, async (part) => {
      keys.set(part.hash, await storePart(part));
    });
    const libraries = [];
    await mapLimit(parsed.libraries, 4, async (lib) => {
      const doc = await mergeLibrary({ ownerAnchorId: job.ownerAnchorId, userId: job.uploadedBy, lib, keys });
      libraries.push({
        libraryId: doc._id,
        systemName: lib.systemName,
        source: lib.source,
        kitCount: lib.kits.length,
        partCount: lib.parts.length,
      });
    });
    libraries.sort((a, b) => a.systemName.localeCompare(b.systemName));
    return finish(
      job._id,
      "done",
      { sha256, libraries, notes: parsed.notes.slice(0, 50), message: "" },
      quarantineKey,
    );
  } catch (error) {
    console.error("[scanbody-upload] store failed", { jobId: String(job._id), error: error?.message });
    return finish(job._id, "failed", { sha256, message: "라이브러리를 저장하지 못했습니다. 다시 올려 주세요." }, quarantineKey);
  }
}
