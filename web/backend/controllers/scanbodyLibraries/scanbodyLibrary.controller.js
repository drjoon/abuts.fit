// 기공소 AI 디자인 — 스캔바디 라이브러리·심플어벗 템플릿 등록과 조회.
// 관리자가 올리면 공용(ownerAnchorId=null), 기공소가 올리면 그 기공소 것.
// 기공소 라이브러리·템플릿은 검사·해석을 통과하면 바로 isPublic(관리자 검토 없음). 관리자는 내리기만 한다.
// 공용은 다른 기공소가 쓰고 있어 기공소가 직접 고치거나 지우지 않는다. 고치면 그 기공소 사본(forkOf)이 생긴다.
// 라이브러리 업로드는 S3 격리 → GuardDuty 검사 → 서버 해석·형상 재생성(scanbodyLibraryUpload.service.js).
// 템플릿 .dcm은 S3 격리 → GuardDuty 검사 → 워커 해석(abutmentTemplateUpload.service.js).
// 원본은 저장하지 않고 좌표·면으로 새로 만든 STL만 둔다. 악성 업로더는 차단 목록(uploadBlocklist)으로 막는다.
// related files:
// - web/backend/models/scanbodyLibrary.model.js
// - web/backend/models/scanbodyLibraryUpload.model.js
// - web/backend/models/abutmentTemplate.model.js
// - web/backend/models/abutmentTemplateUpload.model.js
// - web/backend/models/uploadBlocklist.model.js
// - web/backend/services/scanbodyLibraryUpload.service.js
// - web/backend/services/abutmentTemplateUpload.service.js
// - web/backend/services/uploadBlocklist.service.js
// - web/backend/modules/scanbodyLibraries/scanbodyLibrary.routes.js
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
import { pipeline } from "stream";
import { Types } from "mongoose";
import ScanbodyLibrary from "../../models/scanbodyLibrary.model.js";
import ScanbodyLibraryUpload from "../../models/scanbodyLibraryUpload.model.js";
import AbutmentTemplate from "../../models/abutmentTemplate.model.js";
import AbutmentTemplateUpload from "../../models/abutmentTemplateUpload.model.js";
import UploadBlocklist from "../../models/uploadBlocklist.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { assertLabAnchor } from "../../utils/labTradingPartner.util.js";
import { getObjectStreamFromS3 } from "../../utils/s3.utils.js";
import {
  SCANBODY_S3_PREFIX,
  advanceScanbodyUpload,
  completeScanbodyUpload,
  createScanbodyUpload,
  scanbodyLibraryForkFor,
  uploadView,
} from "../../services/scanbodyLibraryUpload.service.js";
import {
  advanceTemplateUpload,
  approveTemplateUpload,
  completeTemplateUpload,
  createTemplateUpload,
  rejectTemplateUpload,
  sweepStaleTemplateUploads,
  templateReviewViews,
  templateUploadView,
} from "../../services/abutmentTemplateUpload.service.js";
import { assertUploaderNotBlocked } from "../../services/uploadBlocklist.service.js";
import {
  listLabUploadRequestKeys,
  listScanbodyDemand,
  setLabUploadRequested,
} from "../../services/scanbodyDemand.service.js";

const isAdmin = (req) => req.user?.role === "admin";

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function assertAdmin(req) {
  if (!isAdmin(req)) throw new ApiError(403, "관리자만 할 수 있습니다.");
}

function assertNotBlocked(req) {
  return assertUploaderNotBlocked({ userId: req.user?._id, businessAnchorId: req.user?.businessAnchorId });
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

/** 공용(어벗츠·다른 기공소·우리가 올려 공용이 된 것)을 기공소가 고치면 그 기공소 사본을 고친다. */
function canCopyEdit(req, doc) {
  return !isAdmin(req) && Boolean(viewerAnchorId(req)) && !canEdit(req, doc) && !doc.forkOf;
}

/** 이 기공소가 사본을 둔 공용 원본은 목록에서 뺀다(사본이 대신 보인다). */
function withoutForkedOriginals(req, docs) {
  if (isAdmin(req)) return docs;
  const anchorId = String(viewerAnchorId(req) || "");
  const forked = new Set(
    docs.filter((doc) => doc.forkOf && String(doc.ownerAnchorId) === anchorId).map((doc) => String(doc.forkOf)),
  );
  return forked.size > 0 ? docs.filter((doc) => !forked.has(String(doc._id))) : docs;
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

/** 사본을 만든 뒤 공용 원본에 새 키트·형상이 올라왔는지(제조사 새 버전 등). */
function isForkBehind(doc, base) {
  if (!doc.forkOf || !base?.contentUpdatedAt) return false;
  const baseline = doc.forkBaseContentAt || doc.createdAt;
  return !baseline || new Date(base.contentUpdatedAt) > new Date(baseline);
}

function libraryView(req, doc, names = new Map(), base = null) {
  const owner = doc.ownerAnchorId ? String(doc.ownerAnchorId) : null;
  return {
    id: String(doc._id),
    scope: scopeOf(req, doc),
    canEdit: canEdit(req, doc),
    canCopyEdit: canCopyEdit(req, doc),
    isPublic: Boolean(doc.isPublic),
    forkOf: doc.forkOf ? String(doc.forkOf) : null,
    forkBehind: isForkBehind(doc, base),
    /** 새 공용 시각. 기공소가 「나중에」를 누르면 이 값으로 기억해 다음 버전에 다시 묻는다. */
    baseContentUpdatedAt: doc.forkOf && base?.contentUpdatedAt ? base.contentUpdatedAt : null,
    ownerAnchorId: isAdmin(req) ? owner : null,
    ownerName: owner ? (names.get(owner) ?? "") : "",
    source: doc.source || "3shape",
    systemName: doc.systemName,
    fileNames: doc.fileNames || [],
    containerVersions: doc.containerVersions || [],
    manufacturers: doc.manufacturers || [],
    parts: (doc.parts || []).map((part) => ({
      partId: part.partId,
      name: part.name,
      partClass: part.partClass,
      format: part.format || "dcm",
      hash: part.hash,
      s3Key: part.s3Key,
      size: part.size,
      diameterMm: part.diameterMm ?? null,
      heightMm: part.heightMm ?? null,
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
    isPublic: Boolean(doc.isPublic),
    forkOf: doc.forkOf ? String(doc.forkOf) : null,
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
  const [libraries, templates, templateUploads, labUploadRequestKeys] = await Promise.all([
    ScanbodyLibrary.find(filter).sort({ systemName: 1 }).lean(),
    AbutmentTemplate.find(filter).sort({ kind: 1, diameter: 1, height: 1 }).lean(),
    listOwnTemplateUploads(req),
    listLabUploadRequestKeys(),
  ]);
  const names = await ownerNames(req, [...libraries, ...templates]);
  const libraryById = new Map(libraries.map((doc) => [String(doc._id), doc]));
  return res.status(200).json(
    new ApiResponse(200, {
      libraries: withoutForkedOriginals(req, libraries).map((doc) =>
        libraryView(req, doc, names, doc.forkOf ? libraryById.get(String(doc.forkOf)) : null),
      ),
      // 등록이 끝난 템플릿만. 검사 중인 건은 templateUploads로만 보이고 AI 디자인에 쓰지 않는다.
      templates: withoutForkedOriginals(req, templates).map((doc) => templateView(req, doc, names)),
      templateUploads,
      // 관리자가 기공소에 올려 달라고 표시한 규격. 나머지는 AI 디자인에서 「어벗츠가 준비 중」으로만 보인다.
      labUploadRequestKeys,
    }),
  );
});

// GET /api/scanbody-libraries/demand — 관리자: 의뢰에 쌓인 규격 중 공용 형상이 없는 것
export const listScanbodyDemandHandler = asyncHandler(async (req, res) => {
  assertAdmin(req);
  return res.status(200).json(new ApiResponse(200, await listScanbodyDemand()));
});

// PATCH /api/scanbody-libraries/demand/lab-request  { key, requested } — 관리자: 기공소에 올려 달라고 하기
export const setScanbodyDemandLabRequest = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const row = await setLabUploadRequested(text(req.body?.key, 300), req.body?.requested === true, req.user._id);
  if (!row) throw new ApiError(404, "규격을 찾을 수 없습니다.");
  return res.status(200).json(new ApiResponse(200, row));
});

function ownerFilter(ownerAnchorId) {
  return ownerAnchorId ? { ownerAnchorId } : { ownerAnchorId: null };
}

const TEMPLATE_UPLOAD_RECENT_MS = 14 * 24 * 3600 * 1000;

/** 내 기공소(관리자는 공용) 템플릿 업로드 중 끝나지 않았거나 최근에 끝난 것. 등록된 건은 템플릿 목록에 있다. */
async function listOwnTemplateUploads(req, ids = []) {
  const anchorId = viewerAnchorId(req);
  if (!isAdmin(req) && !anchorId) return [];
  const ownerAnchorId = isAdmin(req) ? null : new Types.ObjectId(anchorId);
  await sweepStaleTemplateUploads();
  const filter = {
    ...ownerFilter(ownerAnchorId),
    ...(ids.length > 0
      ? { _id: { $in: ids } }
      : {
          $or: [
            { status: { $in: ["pending_review", "scanning", "processing"] } },
            { status: { $in: ["rejected", "failed"] }, finishedAt: { $gte: new Date(Date.now() - TEMPLATE_UPLOAD_RECENT_MS) } },
          ],
        }),
  };
  const jobs = await AbutmentTemplateUpload.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  const advanced = await Promise.all(jobs.map((job) => advanceTemplateUpload(job)));
  return advanced.filter(Boolean).map((job) => templateUploadView(job));
}

async function findOwnUpload(req) {
  const id = String(req.params.uploadId || "");
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  const { ownerAnchorId } = await resolveOwner(req);
  const job = await ScanbodyLibraryUpload.findOne({ _id: id, ...ownerFilter(ownerAnchorId) }).lean();
  if (!job) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  return job;
}

// POST /api/scanbody-libraries/uploads  { fileName, size, manufacturer?, meshMeta? }
// meshMeta: 형상 한 개(.dcm·.stl·.ply·.obj)일 때 { frame, diameter, height }. manufacturer가 있어야 한다.
export const createLibraryUpload = asyncHandler(async (req, res) => {
  const { ownerAnchorId } = await resolveOwner(req);
  await assertNotBlocked(req);
  const { job, uploadUrl, fields } = await createScanbodyUpload({
    ownerAnchorId,
    userId: req.user._id,
    fileName: req.body?.fileName,
    size: req.body?.size,
    manufacturer: text(req.body?.manufacturer, 60),
    meshMeta: req.body?.meshMeta,
  });
  return res.status(201).json(new ApiResponse(201, { upload: uploadView(job), uploadUrl, fields }));
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
// 공용 라이브러리는 이 기공소 사본을 만들어 고친다. 응답은 사본이다(id가 바뀐다).
export const updateScanbodyKit = asyncHandler(async (req, res) => {
  const source = await ScanbodyLibrary.findOne({ _id: req.params.id, ...visibleFilter(req) });
  if (!source) throw new ApiError(404, "라이브러리를 찾을 수 없습니다.");
  let doc = source;
  if (canCopyEdit(req, source)) {
    doc = await scanbodyLibraryForkFor(new Types.ObjectId(viewerAnchorId(req)), source);
  } else if (!canEdit(req, source)) {
    throw new ApiError(403, "수정 권한이 없습니다.");
  }
  const kit = doc.kits.find((row) => row.kitId === req.params.kitId);
  if (!kit) throw new ApiError(404, "키트를 찾을 수 없습니다.");
  const raw = Array.isArray(req.body?.catalogIds) ? req.body.catalogIds : [];
  kit.catalogIds = [...new Set(raw.map((row) => text(row, 300)).filter(Boolean))].slice(0, 50);
  await doc.save();
  const names = await ownerNames(req, [doc]);
  return res.status(200).json(new ApiResponse(200, libraryView(req, doc.toObject(), names)));
});

// POST /api/scanbody-libraries/:id/rebase — 우리 사본을 새 공용으로 업데이트
// 공용에 있는 키트는 새 형상으로 바꾸고, 사본에서 고친 임플란트 연결은 남긴다. 사본에만 있는 키트도 남긴다.
export const rebaseScanbodyLibrary = asyncHandler(async (req, res) => {
  const doc = await ScanbodyLibrary.findById(req.params.id);
  if (!doc || !doc.forkOf || !isOwn(req, doc)) throw new ApiError(404, "우리 기공소 사본을 찾을 수 없습니다.");
  const base = await ScanbodyLibrary.findOne({ _id: doc.forkOf, ...visibleFilter(req) }).lean();
  if (!base) throw new ApiError(404, "공용 라이브러리를 찾을 수 없습니다.");
  const ownKits = new Map((doc.kits || []).map((kit) => [kit.kitId, kit.toObject?.() ?? kit]));
  const baseKitIds = new Set((base.kits || []).map((kit) => kit.kitId));
  const kits = [
    ...(base.kits || []).map((kit) => ({
      ...kit,
      catalogIds: ownKits.get(kit.kitId)?.catalogIds ?? kit.catalogIds ?? [],
    })),
    ...[...ownKits.values()].filter((kit) => !baseKitIds.has(kit.kitId)),
  ];
  const used = new Set(kits.flatMap((kit) => kit.scanAbutmentPartIds || []));
  const parts = new Map();
  for (const part of [...(doc.parts || []).map((row) => row.toObject?.() ?? row), ...(base.parts || [])]) {
    if (used.has(part.partId)) parts.set(part.partId, part);
  }
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])].filter(Boolean))];
  doc.kits = kits;
  doc.parts = [...parts.values()];
  doc.fileNames = union(base.fileNames, doc.fileNames);
  doc.containerVersions = union(base.containerVersions, doc.containerVersions).sort();
  doc.manufacturers = union(doc.manufacturers, base.manufacturers);
  doc.contentUpdatedAt = base.contentUpdatedAt ?? new Date();
  doc.forkBaseContentAt = base.contentUpdatedAt ?? new Date();
  await doc.save();
  return res.status(200).json(new ApiResponse(200, libraryView(req, doc.toObject(), new Map(), base)));
});

// PATCH /api/scanbody-libraries/:id/visibility  { isPublic } — 관리자 내리기·다시 올리기
// 내린 기록(reviewedAt)이 남아 있으면 기공소가 다시 올려도 공용으로 돌아가지 않는다.
export const updateScanbodyVisibility = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) throw new ApiError(403, "관리자만 공용으로 올리거나 내릴 수 있습니다.");
  const doc = await ScanbodyLibrary.findById(req.params.id);
  if (!doc) throw new ApiError(404, "라이브러리를 찾을 수 없습니다.");
  if (!doc.ownerAnchorId) throw new ApiError(400, "어벗츠 공용 라이브러리입니다.");
  const isPublic = req.body?.isPublic === true;
  doc.isPublic = isPublic;
  doc.reviewedBy = req.user._id;
  doc.reviewedAt = new Date();
  await doc.save();
  const names = await ownerNames(req, [doc]);
  return res.status(200).json(new ApiResponse(200, libraryView(req, doc.toObject(), names)));
});

// DELETE /api/scanbody-libraries/:id
export const deleteScanbodyLibrary = asyncHandler(async (req, res) => {
  const doc = await ScanbodyLibrary.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, "라이브러리를 찾을 수 없습니다.");
  if (!canEdit(req, doc)) {
    throw new ApiError(
      403,
      doc.isPublic || !doc.ownerAnchorId
        ? "공용 라이브러리는 다른 기공소도 써서 지울 수 없습니다. 문제가 있으면 어벗츠에 알려 주세요."
        : "삭제 권한이 없습니다.",
    );
  }
  await ScanbodyLibrary.deleteOne({ _id: doc._id });
  return res.status(200).json(new ApiResponse(200, { id: String(doc._id) }));
});

function parseIds(raw, max = 50) {
  return String(raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .slice(0, max);
}

async function findOwnTemplateUpload(req) {
  const id = String(req.params.uploadId || "");
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  const { ownerAnchorId } = await resolveOwner(req);
  const job = await AbutmentTemplateUpload.findOne({ _id: id, ...ownerFilter(ownerAnchorId) }).lean();
  if (!job) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  return job;
}

// POST /api/scanbody-libraries/templates/uploads  { fileName, size, meta }
// 원본은 브라우저가 presigned POST로 S3 보류 경로에 올린다. 서버는 열지 않는다.
export const createTemplateUploadHandler = asyncHandler(async (req, res) => {
  const { ownerAnchorId } = await resolveOwner(req);
  await assertNotBlocked(req);
  const anchorId = viewerAnchorId(req);
  const { job, uploadUrl, fields } = await createTemplateUpload({
    ownerAnchorId,
    userId: req.user._id,
    uploaderAnchorId: anchorId ? new Types.ObjectId(anchorId) : null,
    isAdmin: isAdmin(req),
    fileName: req.body?.fileName,
    size: req.body?.size,
    meta: req.body?.meta,
  });
  return res.status(201).json(new ApiResponse(201, { upload: templateUploadView(job), uploadUrl, fields }));
});

// POST /api/scanbody-libraries/templates/uploads/:uploadId/complete
export const completeTemplateUploadHandler = asyncHandler(async (req, res) => {
  const job = await completeTemplateUpload(await findOwnTemplateUpload(req));
  return res.status(200).json(new ApiResponse(200, templateUploadView(job)));
});

// GET /api/scanbody-libraries/templates/uploads?ids=a,b
export const listTemplateUploadsHandler = asyncHandler(async (req, res) => {
  await resolveOwner(req);
  const rows = await listOwnTemplateUploads(req, parseIds(req.query?.ids));
  return res.status(200).json(new ApiResponse(200, rows));
});

// GET /api/scanbody-libraries/templates/reviews?ids=a,b — 관리자 검토 대기열(+진행 중·최근 결정)
export const listTemplateReviews = asyncHandler(async (req, res) => {
  assertAdmin(req);
  await sweepStaleTemplateUploads();
  const ids = parseIds(req.query?.ids, 100);
  const filter =
    ids.length > 0
      ? { _id: { $in: ids } }
      : {
          autoApproved: false,
          $or: [
            { status: { $in: ["pending_review", "scanning", "processing"] } },
            { reviewedAt: { $gte: new Date(Date.now() - 3 * 24 * 3600 * 1000) } },
          ],
        };
  const jobs = await AbutmentTemplateUpload.find(filter).sort({ createdAt: 1 }).limit(200).lean();
  const advanced = (await Promise.all(jobs.map((job) => advanceTemplateUpload(job)))).filter(Boolean);
  return res.status(200).json(new ApiResponse(200, await templateReviewViews(advanced)));
});

// POST /api/scanbody-libraries/templates/uploads/:uploadId/approve — 「열어 보기」: 검사·해석 시작
export const approveTemplateUploadHandler = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const id = String(req.params.uploadId || "");
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  const job = await approveTemplateUpload(id, req.user._id);
  const [row] = await templateReviewViews([job]);
  return res.status(200).json(new ApiResponse(200, row));
});

// POST /api/scanbody-libraries/templates/uploads/:uploadId/reject  { reason, malicious } — 「폐기」
export const rejectTemplateUploadHandler = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const id = String(req.params.uploadId || "");
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "업로드를 찾을 수 없습니다.");
  const job = await rejectTemplateUpload(id, {
    adminId: req.user._id,
    reason: req.body?.reason,
    malicious: req.body?.malicious === true,
  });
  const [row] = await templateReviewViews([job]);
  return res.status(200).json(new ApiResponse(200, row));
});

// GET /api/scanbody-libraries/blocklist — 관리자: 활성 차단 목록
export const listUploadBlocklist = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const rows = await UploadBlocklist.find({ active: true }).sort({ createdAt: -1 }).limit(200).lean();
  const userIds = [...new Set(rows.flatMap((row) => [row.userId, row.createdBy]).filter(Boolean).map(String))];
  const anchorIds = [...new Set(rows.map((row) => row.businessAnchorId).filter(Boolean).map(String))];
  const [users, anchors] = await Promise.all([
    userIds.length ? User.find({ _id: { $in: userIds } }).select({ name: 1, email: 1 }).lean() : [],
    anchorIds.length ? BusinessAnchor.find({ _id: { $in: anchorIds } }).select({ name: 1 }).lean() : [],
  ]);
  const userById = new Map(users.map((row) => [String(row._id), row]));
  const anchorName = new Map(anchors.map((row) => [String(row._id), String(row.name || "")]));
  return res.status(200).json(
    new ApiResponse(
      200,
      rows.map((row) => {
        const user = userById.get(String(row.userId));
        return {
          id: String(row._id),
          userId: String(row.userId),
          userName: String(user?.name || ""),
          userEmail: String(user?.email || ""),
          businessAnchorId: row.businessAnchorId ? String(row.businessAnchorId) : null,
          businessName: row.businessAnchorId ? (anchorName.get(String(row.businessAnchorId)) ?? "") : "",
          reason: row.reason || "",
          source: row.source,
          uploadKind: row.uploadKind || "",
          fileName: row.fileName || "",
          createdByName: row.createdBy ? String(userById.get(String(row.createdBy))?.name || "") : "",
          createdAt: row.createdAt,
        };
      }),
    ),
  );
});

// DELETE /api/scanbody-libraries/blocklist/:id — 관리자: 차단 해제(기록은 남긴다)
export const unblockUploader = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const id = String(req.params.id || "");
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "차단 항목을 찾을 수 없습니다.");
  const row = await UploadBlocklist.findOneAndUpdate(
    { _id: id, active: true },
    { $set: { active: false, unblockedBy: req.user._id, unblockedAt: new Date() } },
    { new: true },
  ).lean();
  if (!row) throw new ApiError(404, "차단 항목을 찾을 수 없습니다.");
  return res.status(200).json(new ApiResponse(200, { id: String(row._id) }));
});

// DELETE /api/scanbody-libraries/templates/:id
export const deleteAbutmentTemplate = asyncHandler(async (req, res) => {
  const doc = await AbutmentTemplate.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, "템플릿을 찾을 수 없습니다.");
  if (!canEdit(req, doc)) {
    throw new ApiError(
      403,
      doc.isPublic || !doc.ownerAnchorId
        ? "공용 템플릿은 다른 기공소도 써서 지울 수 없습니다. 문제가 있으면 어벗츠에 알려 주세요."
        : "삭제 권한이 없습니다.",
    );
  }
  await AbutmentTemplate.deleteOne({ _id: doc._id });
  return res.status(200).json(new ApiResponse(200, { id: String(doc._id) }));
});

// PATCH /api/scanbody-libraries/templates/:id/visibility  { isPublic } — 관리자 내리기·다시 올리기
export const updateTemplateVisibility = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) throw new ApiError(403, "관리자만 공용으로 올리거나 내릴 수 있습니다.");
  const doc = await AbutmentTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, "템플릿을 찾을 수 없습니다.");
  if (!doc.ownerAnchorId) throw new ApiError(400, "어벗츠 공용 템플릿입니다.");
  doc.isPublic = req.body?.isPublic === true;
  doc.reviewedBy = req.user._id;
  doc.reviewedAt = new Date();
  await doc.save();
  const names = await ownerNames(req, [doc]);
  return res.status(200).json(new ApiResponse(200, templateView(req, doc.toObject(), names)));
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
  // pipeline이 S3·gunzip 오류와 클라이언트 중단 때 양쪽 스트림을 닫는다(S3 소켓을 남기지 않는다).
  pipeline(body, res, (error) => {
    if (!error || error.code === "ERR_STREAM_PREMATURE_CLOSE") return;
    console.error("[scanbody-library] geometry stream failed", { key, error: error?.message });
  });
});
