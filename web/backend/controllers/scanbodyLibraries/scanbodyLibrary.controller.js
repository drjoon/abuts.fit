// 기공소 AI 디자인 — 스캔바디 라이브러리(.dme)·심플어벗 템플릿 등록과 조회.
// 관리자가 올리면 공용(ownerAnchorId=null), 기공소가 올리면 그 기공소 것.
// `.dme` 해석(ZIP·Materials.xml)은 브라우저가 하고, 서버는 부품 .dcm 저장과 메타만 맡는다.
// related files:
// - web/backend/models/scanbodyLibrary.model.js
// - web/backend/models/abutmentTemplate.model.js
// - web/backend/modules/scanbodyLibraries/scanbodyLibrary.routes.js
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
import crypto from "crypto";
import { Types } from "mongoose";
import ScanbodyLibrary, { SCANBODY_PART_CLASSES } from "../../models/scanbodyLibrary.model.js";
import AbutmentTemplate, { ABUTMENT_TEMPLATE_KINDS } from "../../models/abutmentTemplate.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { assertLabAnchor } from "../../utils/labTradingPartner.util.js";
import {
  getObjectStreamFromS3,
  objectExistsInS3,
  uploadFileToS3,
} from "../../utils/s3.utils.js";

const S3_PREFIX = "scanbody-library";

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

/** 브라우저(dmeLibrary.ts)와 같은 규칙: HPS 꼭짓점·면 base64를 해시한다. 재저장해도 형상이 같으면 같은 값. */
export function hashDcmGeometry(buffer) {
  const xml = buffer.toString("utf8");
  if (/<HPS[\s>]/i.test(xml)) {
    const vertices = /<Vertices\b[^>]*>([\s\S]*?)<\/Vertices>/i.exec(xml)?.[1];
    const facets = /<Facets\b[^>]*>([\s\S]*?)<\/Facets>/i.exec(xml)?.[1];
    if (vertices && facets) {
      return crypto
        .createHash("sha256")
        .update(`${vertices.replace(/\s+/g, "")}|${facets.replace(/\s+/g, "")}`)
        .digest("hex");
    }
  }
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** 등록 주체. 관리자=공용, 기공소=자기 앵커. */
async function resolveOwner(req) {
  if (req.user?.role === "admin") return { ownerAnchorId: null };
  const anchorId = String(req.user?.businessAnchorId || "").trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) {
    throw new ApiError(403, "기공소 계정만 등록할 수 있습니다.");
  }
  if (req.user?.role !== "internalLab" && !(await assertLabAnchor(anchorId))) {
    throw new ApiError(403, "기공소 계정만 등록할 수 있습니다.");
  }
  return { ownerAnchorId: new Types.ObjectId(anchorId) };
}

function visibleFilter(req) {
  if (req.user?.role === "admin") return { ownerAnchorId: null };
  const anchorId = String(req.user?.businessAnchorId || "").trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return { ownerAnchorId: null };
  return { $or: [{ ownerAnchorId: null }, { ownerAnchorId: new Types.ObjectId(anchorId) }] };
}

function canEdit(req, doc) {
  const owner = doc.ownerAnchorId ? String(doc.ownerAnchorId) : null;
  if (req.user?.role === "admin") return owner === null;
  return owner !== null && owner === String(req.user?.businessAnchorId || "");
}

async function storeGeometry(buffer) {
  const hash = hashDcmGeometry(buffer);
  const s3Key = `${S3_PREFIX}/${hash}.dcm`;
  if (!(await objectExistsInS3(s3Key))) {
    await uploadFileToS3(buffer, s3Key, "application/octet-stream");
  }
  return { hash, s3Key, size: buffer.length };
}

function libraryView(req, doc) {
  return {
    id: String(doc._id),
    scope: doc.ownerAnchorId ? "lab" : "public",
    canEdit: canEdit(req, doc),
    systemName: doc.systemName,
    fileNames: doc.fileNames || [],
    containerVersions: doc.containerVersions || [],
    parts: (doc.parts || []).map((part) => ({
      partId: part.partId,
      name: part.name,
      partClass: part.partClass,
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

function templateView(req, doc) {
  return {
    id: String(doc._id),
    scope: doc.ownerAnchorId ? "lab" : "public",
    canEdit: canEdit(req, doc),
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
  return res.status(200).json(
    new ApiResponse(200, {
      libraries: libraries.map((doc) => libraryView(req, doc)),
      templates: templates.map((doc) => templateView(req, doc)),
    }),
  );
});

function normalizeKit(raw) {
  const ids = (value) =>
    [...new Set((Array.isArray(value) ? value : []).map((row) => text(row, 300)).filter(Boolean))];
  return {
    kitId: text(raw?.kitId),
    name: text(raw?.name),
    implantPartId: text(raw?.implantPartId) || null,
    scanAbutmentPartIds: ids(raw?.scanAbutmentPartIds),
    screwPartId: text(raw?.screwPartId) || null,
    basePartId: text(raw?.basePartId) || null,
    blankPartId: text(raw?.blankPartId) || null,
    catalogIds: ids(raw?.catalogIds),
  };
}

// POST /api/scanbody-libraries/dme (multipart: meta, files[])
export const importDmeLibrary = asyncHandler(async (req, res) => {
  const { ownerAnchorId } = await resolveOwner(req);
  const meta = parseJsonField(req.body?.meta, "라이브러리");
  const systemName = text(meta?.systemName);
  if (!systemName) throw new ApiError(400, "임플란트 시스템 이름이 없습니다.");

  const files = new Map((req.files || []).map((file) => [file.originalname, file]));
  const rawParts = Array.isArray(meta?.parts) ? meta.parts : [];
  if (rawParts.length === 0) throw new ApiError(400, "부품이 없습니다.");

  const stored = await Promise.all(
    rawParts.map(async (raw) => {
      const file = files.get(text(raw?.file, 300));
      if (!file) throw new ApiError(400, `${text(raw?.name) || "부품"} 형상 파일이 없습니다.`);
      const geometry = await storeGeometry(file.buffer);
      const partClass = SCANBODY_PART_CLASSES.includes(raw?.partClass) ? raw.partClass : "other";
      return { partId: text(raw?.partId), name: text(raw?.name), partClass, ...geometry };
    }),
  );
  const kits = (Array.isArray(meta?.kits) ? meta.kits : [])
    .map(normalizeKit)
    .filter((kit) => kit.kitId);

  const existing = await ScanbodyLibrary.findOne({ ownerAnchorId, systemName });
  const doc = existing ?? new ScanbodyLibrary({ ownerAnchorId, systemName });
  const parts = new Map((doc.parts || []).map((part) => [part.partId, part.toObject?.() ?? part]));
  for (const part of stored) if (part.partId) parts.set(part.partId, part);
  const prevKits = new Map((doc.kits || []).map((kit) => [kit.kitId, kit.toObject?.() ?? kit]));
  for (const kit of kits) {
    const prev = prevKits.get(kit.kitId);
    prevKits.set(kit.kitId, {
      ...kit,
      catalogIds: kit.catalogIds.length > 0 ? kit.catalogIds : (prev?.catalogIds ?? []),
    });
  }
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])].map((row) => text(row)).filter(Boolean))];
  doc.parts = [...parts.values()];
  doc.kits = [...prevKits.values()];
  doc.fileNames = union(doc.fileNames, meta?.fileNames);
  doc.containerVersions = union(doc.containerVersions, meta?.containerVersions).sort();
  doc.uploadedBy = req.user?._id ?? null;
  await doc.save();

  return res
    .status(existing ? 200 : 201)
    .json(new ApiResponse(existing ? 200 : 201, libraryView(req, doc.toObject())));
});

// PATCH /api/scanbody-libraries/:id/kits/:kitId  { catalogIds }
export const updateScanbodyKit = asyncHandler(async (req, res) => {
  const doc = await ScanbodyLibrary.findById(req.params.id);
  if (!doc) throw new ApiError(404, "라이브러리를 찾을 수 없습니다.");
  if (!canEdit(req, doc)) throw new ApiError(403, "수정 권한이 없습니다.");
  const kit = doc.kits.find((row) => row.kitId === req.params.kitId);
  if (!kit) throw new ApiError(404, "키트를 찾을 수 없습니다.");
  kit.catalogIds = normalizeKit({ kitId: kit.kitId, catalogIds: req.body?.catalogIds }).catalogIds;
  await doc.save();
  return res.status(200).json(new ApiResponse(200, libraryView(req, doc.toObject())));
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

  const geometry = await storeGeometry(file.buffer);
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

// GET /api/scanbody-libraries/file?key=scanbody-library/<hash>.dcm
export const downloadScanbodyGeometry = asyncHandler(async (req, res) => {
  const key = text(req.query?.key, 300);
  if (!key.startsWith(`${S3_PREFIX}/`)) throw new ApiError(400, "Invalid key");
  const filter = visibleFilter(req);
  const [library, template] = await Promise.all([
    ScanbodyLibrary.exists({ ...filter, "parts.s3Key": key }),
    AbutmentTemplate.exists({ ...filter, s3Key: key }),
  ]);
  if (!library && !template) throw new ApiError(404, "형상을 찾을 수 없습니다.");
  const { body, contentLength } = await getObjectStreamFromS3(key);
  if (!body) throw new ApiError(404, "형상을 찾을 수 없습니다.");
  res.setHeader("Content-Type", "application/octet-stream");
  // 해시 키라 내용이 바뀌지 않는다.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  if (contentLength > 0) res.setHeader("Content-Length", String(contentLength));
  body.pipe(res);
});
