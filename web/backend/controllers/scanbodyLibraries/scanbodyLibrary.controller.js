// 기공소 AI 디자인 — 스캔바디 라이브러리·심플어벗 템플릿 등록과 조회.
// 관리자가 올리면 공용(ownerAnchorId=null), 기공소가 올리면 그 기공소 것. 관리자가 검토해 isPublic으로 승격한다.
// 라이브러리 업로드는 S3 격리 → GuardDuty 검사 → 서버 해석·형상 재생성(scanbodyLibraryUpload.service.js).
// 템플릿 .dcm도 원본을 저장하지 않고 좌표·면으로 새로 만든 STL만 둔다.
// related files:
// - web/backend/models/scanbodyLibrary.model.js
// - web/backend/models/scanbodyLibraryUpload.model.js
// - web/backend/models/abutmentTemplate.model.js
// - web/backend/services/scanbodyLibraryUpload.service.js
// - web/backend/modules/scanbodyLibraries/scanbodyLibrary.routes.js
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
import { gzipSync } from "zlib";
import { Types } from "mongoose";
import ScanbodyLibrary from "../../models/scanbodyLibrary.model.js";
import ScanbodyLibraryUpload from "../../models/scanbodyLibraryUpload.model.js";
import AbutmentTemplate, { ABUTMENT_TEMPLATE_KINDS } from "../../models/abutmentTemplate.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { assertLabAnchor } from "../../utils/labTradingPartner.util.js";
import {
  ScanbodyInputError,
  canonicalStlHash,
  encodeCanonicalStl,
  trianglesFromHps,
} from "../../utils/scanbodyGeometry.js";
import { getObjectStreamFromS3, objectExistsInS3, putObjectToS3 } from "../../utils/s3.utils.js";
import {
  SCANBODY_S3_PREFIX,
  advanceScanbodyUpload,
  completeScanbodyUpload,
  createScanbodyUpload,
  uploadView,
} from "../../services/scanbodyLibraryUpload.service.js";

const isAdmin = (req) => req.user?.role === "admin";

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function parseJsonField(raw, label) {
  if (raw && typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    throw new ApiError(400, `${label} 정보가 올바르지 않습니다.`);
  }
}

function viewerAnchorId(req) {
  const id = String(req.user?.businessAnchorId || "").trim();
  return id && Types.ObjectId.isValid(id) ? id : null;
}

/** 등록 주체. 관리자=공용, 기공소=자기 앵커. */
async function resolveOwner(req) {
  if (isAdmin(req)) return { ownerAnchorId: null };
  const anchorId = viewerAnchorId(req);
  if (!anchorId) throw new ApiError(403, "기공소 계정만 등록할 수 있습니다.");
  if (req.user?.role !== "internalLab" && !(await assertLabAnchor(anchorId))) {
    throw new ApiError(403, "기공소 계정만 등록할 수 있습니다.");
  }
  return { ownerAnchorId: new Types.ObjectId(anchorId) };
}

/** 관리자는 검토를 위해 전부 본다. 기공소는 공용·승격·자기 것. */
function visibleFilter(req) {
  if (isAdmin(req)) return {};
  const anchorId = viewerAnchorId(req);
  const shared = [{ ownerAnchorId: null }, { isPublic: true }];
  if (!anchorId) return { $or: shared };
  return { $or: [...shared, { ownerAnchorId: new Types.ObjectId(anchorId) }] };
}

function isOwn(req, doc) {
  return Boolean(doc.ownerAnchorId) && String(doc.ownerAnchorId) === String(viewerAnchorId(req) || "");
}

function canEdit(req, doc) {
  if (isAdmin(req)) return true;
  return isOwn(req, doc) && !doc.isPublic;
}

/** 보는 사람 기준: 자기 기공소 것만 "lab", 나머지(어벗츠·승격)는 "public". 관리자는 소유 기준. */
function scopeOf(req, doc) {
  if (isAdmin(req)) return doc.ownerAnchorId ? "lab" : "public";
  return isOwn(req, doc) ? "lab" : "public";
}

async function ownerNames(req, docs) {
  if (!isAdmin(req)) return new Map();
  const ids = [...new Set(docs.map((doc) => doc.ownerAnchorId && String(doc.ownerAnchorId)).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const anchors = await BusinessAnchor.find({ _id: { $in: ids } }).select({ name: 1 }).lean();
  return new Map(anchors.map((row) => [String(row._id), String(row.name || "")]));
}

function libraryView(req, doc, names = new Map()) {
  const owner = doc.ownerAnchorId ? String(doc.ownerAnchorId) : null;
  return {
    id: String(doc._id),
    scope: scopeOf(req, doc),
    canEdit: canEdit(req, doc),
    isPublic: Boolean(doc.isPublic),
    ownerAnchorId: isAdmin(req) ? owner : null,
    ownerName: owner ? (names.get(owner) ?? "") : "",
    source: doc.source || "3shape",
    systemName: doc.systemName,
    fileNames: doc.fileNames || [],
    containerVersions: doc.containerVersions || [],
    parts: (doc.parts || []).map((part) => ({
      partId: part.partId,
      name: part.name,
      partClass: part.partClass,
      format: part.format || "dcm",
      hash: part.hash,
      s3Key: part.s3Key,
      size: part.size,
    })),
    kits: (doc.kits || []).map((kit) => ({
      kitId: kit.kitId,
      name: kit.name,
      implantPartId: kit.implantPartId,
      scanAbutmentPartIds: kit.scanAbutmentPartIds || [],
      screwPartId: kit.screwPartId,
      basePartId: kit.basePartId,
      blankPartId: kit.blankPartId,
      catalogIds: kit.catalogIds || [],
    })),
    updatedAt: doc.updatedAt,
  };
}

function templateView(req, doc, names = new Map()) {
  const owner = doc.ownerAnchorId ? String(doc.ownerAnchorId) : null;
  return {
    id: String(doc._id),
    scope: scopeOf(req, doc),
    canEdit: canEdit(req, doc),
    ownerName: owner ? (names.get(owner) ?? "") : "",
    kind: doc.kind,
    diameter: doc.diameter,
    height: doc.height,
    fileName: doc.fileName,
    hash: doc.hash,
    s3Key: doc.s3Key,
    size: doc.size,
    frame: doc.frame,
    marginHeightMm: doc.marginHeightMm,
    maxDiameterMm: doc.maxDiameterMm,
    heightMm: doc.heightMm,
    updatedAt: doc.updatedAt,
  };
}

// GET /api/scanbody-libraries
export const listScanbodyLibraries = asyncHandler(async (req, res) => {
  const filter = visibleFilter(req);
  const [libraries, templates] = await Promise.all([
    ScanbodyLibrary.find(filter).sort({ systemName: 1 }).lean(),
    AbutmentTemplate.find(filter).sort({ kind: 1, diameter: 1, height: 1 }).lean(),
  ]);
  const names = await ownerNames(req, [...libraries, ...templates]);
  return res.status(200).json(
    new ApiResponse(200, {
      libraries: libraries.map((doc) => libraryView(req, doc, names)),
      templates: templates.map((doc) => templateView(req, doc, names)),
    }),
  );
});

function ownerFilter(ownerAnchorId) {
  return ownerAnchorId ? { ownerAnchorId } : { ownerAnchorId: null };
}

async function findOwnUpload(req) {
  const id = String(req.params.uploadId || "");
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  const { ownerAnchorId } = await resolveOwner(req);
  const job = await ScanbodyLibraryUpload.findOne({ _id: id, ...ownerFilter(ownerAnchorId) }).lean();
  if (!job) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  return job;
}

// POST /api/scanbody-libraries/uploads  { fileName, size }
export const createLibraryUpload = asyncHandler(async (req, res) => {
  const { ownerAnchorId } = await resolveOwner(req);
  const { job, uploadUrl, contentType } = await createScanbodyUpload({
    ownerAnchorId,
    userId: req.user._id,
    fileName: req.body?.fileName,
    size: req.body?.size,
  });
  return res.status(201).json(new ApiResponse(201, { upload: uploadView(job), uploadUrl, contentType }));
});

// POST /api/scanbody-libraries/uploads/:uploadId/complete
export const completeLibraryUpload = asyncHandler(async (req, res) => {
  const job = await completeScanbodyUpload(await findOwnUpload(req));
  return res.status(200).json(new ApiResponse(200, uploadView(job)));
});

// GET /api/scanbody-libraries/uploads?ids=a,b
export const listLibraryUploads = asyncHandler(async (req, res) => {
  const { ownerAnchorId } = await resolveOwner(req);
  const ids = String(req.query?.ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .slice(0, 50);
  const filter = { ...ownerFilter(ownerAnchorId), ...(ids.length > 0 ? { _id: { $in: ids } } : {}) };
  const jobs = await ScanbodyLibraryUpload.find(filter).sort({ createdAt: -1 }).limit(20).lean();
  const advanced = await Promise.all(jobs.map((job) => advanceScanbodyUpload(job)));
  return res.status(200).json(new ApiResponse(200, advanced.filter(Boolean).map(uploadView)));
});

// PATCH /api/scanbody-libraries/:id/kits/:kitId  { catalogIds }
export const updateScanbodyKit = asyncHandler(async (req, res) => {
  const doc = await ScanbodyLibrary.findById(req.params.id);
  if (!doc) throw new ApiError(404, "라이브러리를 찾을 수 없습니다.");
  if (!canEdit(req, doc)) throw new ApiError(403, "수정 권한이 없습니다.");
  const kit = doc.kits.find((row) => row.kitId === req.params.kitId);
  if (!kit) throw new ApiError(404, "키트를 찾을 수 없습니다.");
  const raw = Array.isArray(req.body?.catalogIds) ? req.body.catalogIds : [];
  kit.catalogIds = [...new Set(raw.map((row) => text(row, 300)).filter(Boolean))].slice(0, 50);
  await doc.save();
  const names = await ownerNames(req, [doc]);
  return res.status(200).json(new ApiResponse(200, libraryView(req, doc.toObject(), names)));
});

// PATCH /api/scanbody-libraries/:id/visibility  { isPublic } — 관리자 검토
export const updateScanbodyVisibility = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) throw new ApiError(403, "관리자만 공용으로 올리거나 내릴 수 있습니다.");
  const doc = await ScanbodyLibrary.findById(req.params.id);
  if (!doc) throw new ApiError(404, "라이브러리를 찾을 수 없습니다.");
  if (!doc.ownerAnchorId) throw new ApiError(400, "어벗츠 공용 라이브러리입니다.");
  const isPublic = req.body?.isPublic === true;
  doc.isPublic = isPublic;
  doc.reviewedBy = isPublic ? req.user._id : null;
  doc.reviewedAt = isPublic ? new Date() : null;
  await doc.save();
  const names = await ownerNames(req, [doc]);
  return res.status(200).json(new ApiResponse(200, libraryView(req, doc.toObject(), names)));
});

// DELETE /api/scanbody-libraries/:id
export const deleteScanbodyLibrary = asyncHandler(async (req, res) => {
  const doc = await ScanbodyLibrary.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, "라이브러리를 찾을 수 없습니다.");
  if (!canEdit(req, doc)) throw new ApiError(403, "삭제 권한이 없습니다.");
  await ScanbodyLibrary.deleteOne({ _id: doc._id });
  return res.status(200).json(new ApiResponse(200, { id: String(doc._id) }));
});

function vec3(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const out = value.map(Number);
  return out.every(Number.isFinite) ? out : null;
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0;
}

/** 템플릿 .dcm → 새로 만든 STL(스캐너 좌표 그대로). */
async function storeTemplateGeometry(buffer) {
  let stl;
  try {
    stl = encodeCanonicalStl(trianglesFromHps(buffer), { maxAbsMm: 2000 });
  } catch (error) {
    if (error instanceof ScanbodyInputError) throw new ApiError(400, error.message);
    throw error;
  }
  const hash = canonicalStlHash(stl);
  const s3Key = `${SCANBODY_S3_PREFIX}/${hash}.stl`;
  if (!(await objectExistsInS3(s3Key))) {
    await putObjectToS3(s3Key, gzipSync(stl), { contentType: "model/stl", contentEncoding: "gzip" });
  }
  return { hash, s3Key, size: stl.length };
}

// POST /api/scanbody-libraries/templates (multipart: meta, file)
export const upsertAbutmentTemplate = asyncHandler(async (req, res) => {
  const { ownerAnchorId } = await resolveOwner(req);
  const meta = parseJsonField(req.body?.meta, "템플릿");
  const kind = text(meta?.kind);
  const diameter = text(meta?.diameter, 10);
  const height = text(meta?.height, 10).toUpperCase();
  if (!ABUTMENT_TEMPLATE_KINDS.includes(kind)) throw new ApiError(400, "심플어벗 종류가 올바르지 않습니다.");
  if (!/^\d+(\.\d+)?$/.test(diameter)) throw new ApiError(400, "직경이 올바르지 않습니다.");
  const frame = {
    origin: vec3(meta?.frame?.origin),
    axis: vec3(meta?.frame?.axis),
    ref: vec3(meta?.frame?.ref),
  };
  if (!frame.origin || !frame.axis || !frame.ref) throw new ApiError(400, "템플릿 축 정보가 없습니다.");
  const file = req.file;
  if (!file) throw new ApiError(400, "템플릿 형상 파일이 없습니다.");

  const geometry = await storeTemplateGeometry(file.buffer);
  const doc = await AbutmentTemplate.findOneAndUpdate(
    { ownerAnchorId, kind, diameter, height },
    {
      $set: {
        fileName: text(file.originalname, 200),
        ...geometry,
        frame,
        marginHeightMm: positive(meta?.marginHeightMm),
        maxDiameterMm: positive(meta?.maxDiameterMm),
        heightMm: positive(meta?.heightMm),
        uploadedBy: req.user?._id ?? null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return res.status(200).json(new ApiResponse(200, templateView(req, doc)));
});

// DELETE /api/scanbody-libraries/templates/:id
export const deleteAbutmentTemplate = asyncHandler(async (req, res) => {
  const doc = await AbutmentTemplate.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, "템플릿을 찾을 수 없습니다.");
  if (!canEdit(req, doc)) throw new ApiError(403, "삭제 권한이 없습니다.");
  await AbutmentTemplate.deleteOne({ _id: doc._id });
  return res.status(200).json(new ApiResponse(200, { id: String(doc._id) }));
});

// GET /api/scanbody-libraries/file?key=scanbody-library/<hash>.stl
export const downloadScanbodyGeometry = asyncHandler(async (req, res) => {
  const key = text(req.query?.key, 300);
  if (!new RegExp(`^${SCANBODY_S3_PREFIX}/[0-9a-f]{64}\\.(stl|dcm)$`).test(key)) {
    throw new ApiError(400, "Invalid key");
  }
  const filter = visibleFilter(req);
  const [library, template] = await Promise.all([
    ScanbodyLibrary.exists({ ...filter, "parts.s3Key": key }),
    AbutmentTemplate.exists({ ...filter, s3Key: key }),
  ]);
  if (!library && !template) throw new ApiError(404, "형상을 찾을 수 없습니다.");
  const { body, contentLength } = await getObjectStreamFromS3(key);
  if (!body) throw new ApiError(404, "형상을 찾을 수 없습니다.");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "attachment");
  // 해시 키라 내용이 바뀌지 않는다.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  if (contentLength > 0) res.setHeader("Content-Length", String(contentLength));
  body.pipe(res);
});
