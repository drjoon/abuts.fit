// 스캔바디 라이브러리 업로드 흐름(보안).
// 1) 브라우저가 크기가 고정된 presigned POST로 원본을 S3 격리 경로에 올린다. API 서버를 거치지 않는다.
//    오늘(KST) 검사 추정이 $1을 넘으면 여기서 막는다.
// 2) GuardDuty Malware Protection for S3가 검사해 GuardDutyMalwareScanStatus 태그를 붙인다.
//    NO_THREATS_FOUND만 연다. 위협·검사 불가는 거절하고 원본을 지운다. 위협이면 올린 사용자를 차단 목록에 넣는다.
// 3) 워커 스레드가 압축을 제한 안에서 풀고 형상을 새로 만든다(scanbodyLibraryImport.service.js).
// 4) 형상은 해시 키(gzip)로 병렬 저장하고, 새 시스템은 한 번에 넣는다. 이미 있는 시스템만 합친다.
//    기공소 업로드는 여기까지 통과하면 관리자 검토 없이 공용(isPublic)이 된다. 관리자는 내리기만 한다.
// 검사 대기는 서버 타이머와 브라우저 폴링(GET) 둘 다 진행시킨다. 처리 시작은 상태 전환으로 한 번만 잡는다.
// SCANBODY_MALWARE_SCAN=guardduty|off (기본: production만 guardduty).
// related files:
// - web/backend/models/scanbodyLibraryUpload.model.js
// - web/backend/services/scanbodyLibraryImport.worker.js
// - web/backend/services/abutmentTemplateUpload.service.js (같은 검사 예산·차단 목록)
// - web/backend/services/uploadBlocklist.service.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import crypto from "crypto";
import { promisify } from "util";
import { gzip } from "zlib";
import { Worker } from "worker_threads";
import { Types } from "mongoose";
import ScanbodyLibrary from "../models/scanbodyLibrary.model.js";
import { splitScanbodyCode } from "../utils/scanbodyLibraryIdentity.js";
import ScanbodyLibraryUpload from "../models/scanbodyLibraryUpload.model.js";
import AbutmentTemplateUpload from "../models/abutmentTemplateUpload.model.js";
import { ApiError } from "../utils/ApiError.js";
import { emitAppEventToRoles } from "../socket.js";
import { blockUploader } from "./uploadBlocklist.service.js";
import {
  deleteFileFromS3,
  getObjectBufferFromS3,
  getObjectTagsFromS3,
  createUploadPost,
  headObjectSizeInS3,
  putObjectToS3,
} from "../utils/s3.utils.js";
import { SCANBODY_UPLOAD_LIMITS, libraryFromCanonicalStl } from "./scanbodyLibraryImport.service.js";
import { MESH_FILE_PATTERN, LIBRARY_SHAPE_PATTERN, ScanbodyInputError } from "../utils/scanbodyGeometry.js";

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

function vec3(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const out = value.map(Number);
  return out.every((v) => Number.isFinite(v) && Math.abs(v) <= 2000) ? out : null;
}

/** 형상 한 개 업로드: 브라우저가 계산한 축과 의뢰 규격. 원본은 아직 열지 않았으니 범위만 확인한다. */
function parseMeshMeta(raw) {
  const frame = {
    origin: vec3(raw?.frame?.origin),
    axis: vec3(raw?.frame?.axis),
    ref: vec3(raw?.frame?.ref),
  };
  if (!frame.origin || !frame.axis || !frame.ref) throw new ApiError(400, "스캔바디 축 정보가 없습니다.");
  const diameter = String(raw?.diameter ?? "").trim().slice(0, 10);
  const height = String(raw?.height ?? "").trim().slice(0, 10);
  if (diameter && !/^\d+(\.\d+)?$/.test(diameter)) throw new ApiError(400, "직경이 올바르지 않습니다.");
  if (height && !/^[A-Za-z0-9.]{1,6}$/.test(height)) throw new ApiError(400, "높이가 올바르지 않습니다.");
  return { frame, diameter, height };
}

const SPEC_AXES = new Set(["", "auto", "x", "y", "z"]);
const SPEC_PLATFORM_ENDS = new Set(["", "auto", "min", "max"]);

/** 스캔바디 생성기 스펙(관리자 전용). 문자열 길이·선택지만 확인하고 의미 검증은 해석 단계에서 한다. */
function parseSpecMeta(raw) {
  const field = (value, max) => String(value ?? "").trim().slice(0, max);
  const axis = field(raw?.axis, 8).toLowerCase();
  const platformEnd = field(raw?.platformEnd, 8).toLowerCase();
  if (!SPEC_AXES.has(axis)) throw new ApiError(400, "축 선택이 올바르지 않습니다.");
  if (!SPEC_PLATFORM_ENDS.has(platformEnd)) throw new ApiError(400, "플랫폼 끝 선택이 올바르지 않습니다.");
  const spec = {
    maker: field(raw?.maker, 60),
    implantManufacturer: field(raw?.implantManufacturer, 60),
    brand: field(raw?.brand, 60),
    diameter: field(raw?.diameter, 20),
    height: field(raw?.height, 20),
    axis: axis === "auto" ? "" : axis,
    platformEnd: platformEnd === "auto" ? "" : platformEnd,
    localGenerated: raw?.localGenerated === true,
  };
  if (!spec.maker) throw new ApiError(400, "스캔바디 제조사를 입력해 주세요.");
  if (!spec.diameter) throw new ApiError(400, "직경을 입력해 주세요.");
  if (!spec.height) throw new ApiError(400, "높이를 입력해 주세요.");
  return spec;
}

export async function createScanbodyUpload({ ownerAnchorId, userId, fileName, size, manufacturer, meshMeta, specMeta }) {
  const name = String(fileName || "").trim().slice(0, 200);
  const parsedSpecMeta = specMeta != null ? parseSpecMeta(specMeta) : null;
  if (parsedSpecMeta?.localGenerated && !/\.stl$/i.test(name)) {
    throw new ApiError(400, "생성 결과는 STL만 올릴 수 있습니다.");
  }
  const maker = parsedSpecMeta ? parsedSpecMeta.maker : String(manufacturer || "").trim().slice(0, 60);
  const isOrderMesh = !parsedSpecMeta && MESH_FILE_PATTERN.test(name) && meshMeta != null;
  const isLibraryFile = /\.(dme|zip)$/i.test(name) || LIBRARY_SHAPE_PATTERN.test(name);
  if (!isOrderMesh && !isLibraryFile) {
    throw new ApiError(400, ".dme·.zip·.dcm·.stl·.stp 또는 의뢰 형상 파일만 올릴 수 있습니다.");
  }
  if (isOrderMesh && !maker) throw new ApiError(400, "형상 파일 한 개는 AI 디자인의 의뢰 스캔바디에서 올려 주세요.");
  const parsedMeshMeta = isOrderMesh ? parseMeshMeta(meshMeta) : null;
  const maxBytes = isOrderMesh || LIBRARY_SHAPE_PATTERN.test(name) ? SCANBODY_UPLOAD_LIMITS.maxEntryBytes : SCANBODY_UPLOAD_LIMITS.maxUploadBytes;
  const declaredSize = Number(size);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) throw new ApiError(400, "파일 크기가 올바르지 않습니다.");
  if (declaredSize > maxBytes) {
    throw new ApiError(400, `파일이 너무 큽니다(최대 ${maxBytes / 1024 / 1024}MB).`);
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
    ScanbodyLibraryUpload.create({
      _id,
      ownerAnchorId,
      uploadedBy: userId,
      fileName: name,
      manufacturer: maker,
      meshMeta: parsedMeshMeta,
      specMeta: parsedSpecMeta,
      declaredSize,
      quarantineKey,
    }),
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

function parseInWorker(buffer, fileName, meshMeta, specMeta = null) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scanbodyLibraryImport.worker.js", import.meta.url), {
      workerData: { buffer, fileName, meshMeta, specMeta },
      // t4g.small(2GB). 200MB 묶음을 풀 만큼만 두고, 넘치면 워커만 죽는다.
      resourceLimits: { maxOldGenerationSizeMb: 1024 },
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

const gzipAsync = promisify(gzip);
/** 여러 업로드가 동시에 형상을 넣어도 이 수만큼만 네트워크에 올린다. */
const PART_PUT_LIMIT = 24;
let partPutActive = 0;
const partPutQueue = [];
/** 같은 해시를 동시에 올리는 경우만 한 작업으로 묶는다. 끝나면 형상 버퍼를 붙잡지 않게 뺀다. */
const partStoreInflight = new Map();

function acquirePartPut() {
  if (partPutActive < PART_PUT_LIMIT) {
    partPutActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => partPutQueue.push(resolve));
}

function releasePartPut() {
  partPutActive -= 1;
  const next = partPutQueue.shift();
  if (next) {
    partPutActive += 1;
    next();
  }
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
  const hash = part.hash;
  const pending = partStoreInflight.get(hash);
  if (pending) return pending;
  const stl = part.stl;
  const s3Key = `${SCANBODY_S3_PREFIX}/${hash}.stl`;
  const task = (async () => {
    await acquirePartPut();
    try {
      const body = await gzipAsync(Buffer.isBuffer(stl) ? stl : Buffer.from(stl));
      await putObjectToS3(s3Key, body, {
        contentType: "model/stl",
        contentEncoding: "gzip",
      });
      return s3Key;
    } finally {
      releasePartPut();
    }
  })();
  partStoreInflight.set(hash, task);
  try {
    return await task;
  } finally {
    if (partStoreInflight.get(hash) === task) partStoreInflight.delete(hash);
  }
}

/**
 * 공용 라이브러리를 이 기공소가 고칠 때 쓰는 사본. 있으면 그것, 없으면 원본을 복사해 만든다.
 * 사본은 그 기공소만 보고 공용으로 올라가지 않는다. 원본을 쓰는 다른 기공소는 영향이 없다.
 */
export async function scanbodyLibraryForkFor(ownerAnchorId, source) {
  const existing = await ScanbodyLibrary.findOne({ ownerAnchorId, forkOf: source._id });
  if (existing) return existing;
  const plain = source.toObject?.() ?? source;
  try {
    return await ScanbodyLibrary.create({
      ownerAnchorId,
      forkOf: plain._id,
      systemName: plain.systemName,
      source: plain.source,
      fileNames: plain.fileNames || [],
      containerVersions: plain.containerVersions || [],
      manufacturers: plain.manufacturers || [],
      implantManufacturer: plain.implantManufacturer || "",
      brand: plain.brand || "",
      implantType: plain.implantType || "",
      parts: plain.parts || [],
      kits: plain.kits || [],
      contentUpdatedAt: plain.contentUpdatedAt ?? null,
      forkBaseContentAt: plain.contentUpdatedAt ?? plain.updatedAt ?? new Date(),
      isPublic: false,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return ScanbodyLibrary.findOne({ ownerAnchorId, forkOf: source._id });
  }
}

/** 올린 묶음이 기존 키트의 스캔바디 구성을 바꾸는지. 새 키트·새 형상·치수 보강만이면 false. */
function changesExistingKits(doc, lib) {
  const kits = new Map((doc.kits || []).map((kit) => [kit.kitId, kit]));
  return lib.kits.some((kit) => {
    const old = kits.get(kit.kitId);
    return Boolean(old) && (old.scanAbutmentPartIds || []).join(",") !== kit.scanAbutmentPartIds.join(",");
  });
}

/** 합친 뒤 문서가 달라지는지. 같은 파일을 다시 올리면 false라 저장을 건너뛴다. */
function libraryNeedsWrite(doc, lib, keys, manufacturer, ownerAnchorId) {
  if (doc.isNew || changesContent(doc, lib)) return true;
  const parts = new Map((doc.parts || []).map((part) => [part.partId, part]));
  if (
    lib.parts.some((part) => {
      const old = parts.get(part.hash);
      if (!old) return true;
      return (
        old.name !== part.name ||
        old.s3Key !== keys.get(part.hash) ||
        (old.diameterMm ?? null) !== (part.diameterMm ?? null) ||
        (old.heightMm ?? null) !== (part.heightMm ?? null) ||
        old.size !== part.stl.length
      );
    })
  ) {
    return true;
  }
  const kits = new Map((doc.kits || []).map((kit) => [kit.kitId, kit]));
  if (lib.kits.some((kit) => kits.get(kit.kitId)?.name !== kit.name)) return true;
  const grows = (current, extra) => {
    const before = new Set((current || []).filter(Boolean));
    return (extra || []).some((item) => item && !before.has(item));
  };
  if (grows(doc.fileNames, lib.fileNames) || grows(doc.containerVersions, lib.containerVersions)) return true;
  if (manufacturer && !(doc.manufacturers || []).includes(manufacturer)) return true;
  if (lib.implantManufacturer && !doc.implantManufacturer) return true;
  if (lib.brand && !doc.brand) return true;
  if (lib.implantType && !doc.implantType) return true;
  const kitsForMeta = new Map((doc.kits || []).map((kit) => [kit.kitId, kit]));
  if (lib.kits.some((kit) => kit.spec && !(kitsForMeta.get(kit.kitId)?.spec))) return true;
  const takenDown = Boolean(doc.reviewedAt) && !doc.isPublic;
  return Boolean(ownerAnchorId && !doc.forkOf && !takenDown && !doc.isPublic);
}

/** 올린 묶음에 새 형상·새 키트가 있거나 기존 키트 구성이 바뀌는지. 같은 파일을 다시 올리면 false. */
function changesContent(doc, lib) {
  const partIds = new Set((doc.parts || []).map((part) => part.partId));
  const kits = new Map((doc.kits || []).map((kit) => [kit.kitId, kit]));
  return (
    lib.parts.some((part) => !partIds.has(part.hash)) ||
    lib.kits.some((kit) => {
      const old = kits.get(kit.kitId);
      return !old || (old.scanAbutmentPartIds || []).join(",") !== kit.scanAbutmentPartIds.join(",");
    })
  );
}

/**
 * 합칠 대상. 기공소가 올린 공용 라이브러리를 다시 올려 기존 키트가 바뀌면(또는 이미 사본이 있으면) 그 기공소 사본에 합친다.
 * 새 키트·형상만 늘면 공용 원본에 합친다(다른 기공소가 쓰던 키트는 그대로).
 */
async function mergeTarget(ownerAnchorId, lib) {
  const base = await ScanbodyLibrary.findOne({ ownerAnchorId, systemName: lib.systemName, forkOf: null });
  if (!base) return new ScanbodyLibrary({ ownerAnchorId, systemName: lib.systemName, source: lib.source });
  if (!ownerAnchorId || !base.isPublic) return base;
  const fork = await ScanbodyLibrary.findOne({ ownerAnchorId, forkOf: base._id });
  if (fork) return fork;
  return changesExistingKits(base, lib) ? scanbodyLibraryForkFor(ownerAnchorId, base) : base;
}

async function mergeLibrary({ ownerAnchorId, userId, lib, keys, manufacturer }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const doc = await mergeTarget(ownerAnchorId, lib);
      if (!libraryNeedsWrite(doc, lib, keys, manufacturer, ownerAnchorId)) return doc;
      if (doc.isNew || changesContent(doc, lib)) doc.contentUpdatedAt = new Date();
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
          diameterMm: part.diameterMm ?? null,
          heightMm: part.heightMm ?? null,
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
          spec: kit.spec || kits.get(kit.kitId)?.spec || "",
          code: kit.code || kits.get(kit.kitId)?.code || "",
        });
      }
      const union = (a, b) => [...new Set([...(a || []), ...(b || [])].filter(Boolean))];
      doc.parts = [...parts.values()];
      doc.kits = [...kits.values()];
      doc.fileNames = union(doc.fileNames, lib.fileNames);
      doc.containerVersions = union(doc.containerVersions, lib.containerVersions).sort();
      const makers = [manufacturer, lib.implantManufacturer].filter(Boolean);
      if (makers.length) doc.manufacturers = union(doc.manufacturers, makers);
      if (lib.implantManufacturer && !doc.implantManufacturer) doc.implantManufacturer = lib.implantManufacturer;
      if (lib.brand && !doc.brand) doc.brand = lib.brand;
      if (lib.implantType && !doc.implantType) doc.implantType = lib.implantType;
      doc.uploadedBy = userId;
      // 악성코드 검사와 형상 재생성을 통과했으니 관리자 검토 없이 모두가 쓴다. 관리자가 내린 것·사본은 그대로 둔다.
      const takenDown = Boolean(doc.reviewedAt) && !doc.isPublic;
      if (ownerAnchorId && !doc.forkOf && !takenDown) doc.isPublic = true;
      await doc.save();
      return doc;
    } catch (error) {
      const retryable = error?.name === "VersionError" || error?.code === 11000;
      if (!retryable || attempt >= 4) throw error;
    }
  }
}

function duplicateKeyOnly(error) {
  const rows = error?.writeErrors;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.every((row) => Number(row?.code ?? row?.err?.code) === 11000);
  }
  return Number(error?.code) === 11000;
}

function newLibraryDoc({ ownerAnchorId, userId, lib, keys, manufacturer }) {
  return {
    ownerAnchorId: ownerAnchorId ?? null,
    forkOf: null,
    systemName: lib.systemName,
    source: lib.source,
    fileNames: [...(lib.fileNames || [])],
    containerVersions: [...(lib.containerVersions || [])].sort(),
    manufacturers: [...new Set([manufacturer, lib.implantManufacturer].filter(Boolean))],
    implantManufacturer: lib.implantManufacturer || "",
    brand: lib.brand || "",
    implantType: lib.implantType || "",
    parts: lib.parts.map((part) => ({
      partId: part.hash,
      name: part.name,
      partClass: "scanAbutment",
      format: "stl",
      hash: part.hash,
      s3Key: keys.get(part.hash),
      size: part.stl.length,
      diameterMm: part.diameterMm ?? null,
      heightMm: part.heightMm ?? null,
    })),
    kits: lib.kits.map((kit) => ({
      kitId: kit.kitId,
      name: kit.name,
      implantPartId: null,
      scanAbutmentPartIds: kit.scanAbutmentPartIds,
      screwPartId: null,
      basePartId: null,
      blankPartId: null,
      catalogIds: [],
      spec: kit.spec || "",
      code: kit.code || "",
    })),
    contentUpdatedAt: new Date(),
    isPublic: Boolean(ownerAnchorId),
    uploadedBy: userId,
  };
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 예전 코드 한 건(`BG41_LS`)을 방금 저장한 묶음에 넣고 지운다. 제조사·브랜드가 다르면 건드리지 않는다. */
async function absorbLegacyCodes(doc) {
  const family = String(doc.implantType || "").trim();
  if (!family || !doc._id) return;
  const pattern = new RegExp(
    `^${escapeRegex(family)}_(?:(?:LL|LS|CMFit)(?:_H\\d+(?:\\.\\d+)?)?|H\\d+(?:\\.\\d+)?)$`,
  );
  const siblings = await ScanbodyLibrary.find({
    ownerAnchorId: doc.ownerAnchorId ?? null,
    forkOf: doc.forkOf ?? null,
    _id: { $ne: doc._id },
    systemName: pattern,
  });
  const same = siblings.filter((row) => {
    if (row.implantManufacturer && doc.implantManufacturer && row.implantManufacturer !== doc.implantManufacturer) return false;
    if (row.brand && doc.brand && row.brand !== doc.brand) return false;
    return true;
  });
  if (same.length === 0) return;
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])].filter(Boolean))];
  const parts = new Map((doc.parts || []).map((part) => [part.partId, part.toObject?.() ?? part]));
  const kits = new Map((doc.kits || []).map((kit) => [kit.kitId, kit.toObject?.() ?? kit]));
  for (const sibling of same) {
    const code = splitScanbodyCode(sibling.systemName);
    for (const part of sibling.parts || []) parts.set(part.partId, part.toObject?.() ?? part);
    for (const kit of sibling.kits || []) {
      const plain = kit.toObject?.() ?? kit;
      const withCode = {
        ...plain,
        spec: plain.spec || code.spec,
        code: plain.code || code.code,
        name: plain.spec || code.spec || plain.name,
      };
      const prev = [...kits.values()].find((row) => row.code && row.code === withCode.code) || kits.get(withCode.kitId);
      if (!prev) kits.set(withCode.kitId, withCode);
      else if ((withCode.catalogIds || []).length > (prev.catalogIds || []).length) prev.catalogIds = withCode.catalogIds;
    }
    doc.fileNames = union(doc.fileNames, sibling.fileNames);
    doc.containerVersions = union(doc.containerVersions, sibling.containerVersions).sort();
    doc.manufacturers = union(doc.manufacturers, sibling.manufacturers);
  }
  doc.parts = [...parts.values()];
  doc.kits = [...kits.values()];
  await doc.save();
  await ScanbodyLibrary.deleteMany({ _id: { $in: same.map((row) => row._id) } });
}

function librarySummary(doc, lib) {
  return {
    libraryId: doc._id,
    systemName: lib.systemName,
    source: lib.source,
    kitCount: lib.kits.length,
    partCount: lib.parts.length,
  };
}

/**
 * 없는 시스템은 한 번에 넣고, 이미 있는 이름·한 묶음 안의 같은 이름만 기존 합치기를 탄다.
 * 동시에 같은 이름이 들어가면 그 건만 합치기로 넘긴다.
 */
async function saveParsedLibraries({ ownerAnchorId, userId, libraries, keys, manufacturer }) {
  const names = [...new Set(libraries.map((lib) => lib.systemName))];
  const existingRows =
    names.length === 0
      ? []
      : await ScanbodyLibrary.find({
          ownerAnchorId: ownerAnchorId ?? null,
          forkOf: null,
          systemName: { $in: names },
        })
          .select("systemName")
          .lean();
  const existing = new Set(existingRows.map((row) => row.systemName));
  const counts = new Map();
  for (const lib of libraries) counts.set(lib.systemName, (counts.get(lib.systemName) ?? 0) + 1);
  const fresh = [];
  const sequential = [];
  for (const lib of libraries) {
    if (existing.has(lib.systemName) || counts.get(lib.systemName) > 1) sequential.push(lib);
    else fresh.push(lib);
  }

  const byName = new Map();
  const mergeRows = (rows) =>
    mapLimit(rows, 8, async (lib) => {
      byName.set(
        lib.systemName,
        await mergeLibrary({
          ownerAnchorId,
          userId,
          lib,
          keys,
          manufacturer,
        }),
      );
    });

  let freshInserted = true;
  if (fresh.length > 0) {
    try {
      const inserted = await ScanbodyLibrary.insertMany(
        fresh.map((lib) => newLibraryDoc({ ownerAnchorId, userId, lib, keys, manufacturer })),
        { ordered: false },
      );
      fresh.forEach((lib, index) => {
        if (inserted[index]) byName.set(lib.systemName, inserted[index]);
      });
    } catch (error) {
      if (!duplicateKeyOnly(error)) throw error;
      freshInserted = false;
    }
  }
  await mergeRows(sequential);
  if (!freshInserted) await mergeRows(fresh);

  const saved = libraries.map((lib) => {
    const doc = byName.get(lib.systemName);
    if (!doc) throw new Error(`library was not saved: ${lib.systemName}`);
    return doc;
  });
  for (const doc of saved) await absorbLegacyCodes(doc);
  return libraries.map((lib) => {
    const doc = byName.get(lib.systemName);
    return librarySummary(doc, lib);
  });
}

async function processUpload(job) {
  const quarantineKey = job.quarantineKey;
  const started = Date.now();
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
    if (job.specMeta?.localGenerated) {
      const built = libraryFromCanonicalStl(buffer, job.specMeta);
      parsed = { ok: true, libraries: built.libraries, notes: built.notes };
    } else {
      parsed = await parseInWorker(
        buffer,
        job.fileName,
        job.meshMeta ? { ...job.meshMeta, manufacturer: job.manufacturer } : null,
        job.specMeta || null,
      );
    }
  } catch (error) {
    if (error instanceof ScanbodyInputError) {
      return finish(job._id, "rejected", { sha256, message: error.message }, quarantineKey);
    }
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

  const parsedAt = Date.now();
  try {
    const unique = new Map();
    for (const lib of parsed.libraries) for (const part of lib.parts) unique.set(part.hash, part);
    const keys = new Map();
    await Promise.all(
      [...unique.values()].map(async (part) => {
        keys.set(part.hash, await storePart(part));
      }),
    );
    const storedAt = Date.now();
    const libraries = await saveParsedLibraries({
      ownerAnchorId: job.ownerAnchorId,
      userId: job.uploadedBy,
      libraries: parsed.libraries,
      keys,
      manufacturer: job.manufacturer || "",
    });
    libraries.sort((a, b) => a.systemName.localeCompare(b.systemName));
    console.log("[scanbody-upload] registered", {
      jobId: String(job._id),
      parts: unique.size,
      libraries: libraries.length,
      readParseMs: parsedAt - started,
      storeMs: storedAt - parsedAt,
      saveMs: Date.now() - storedAt,
    });
    emitAppEventToRoles(["admin"], "scanbody:demand-updated", { at: new Date().toISOString() });
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
