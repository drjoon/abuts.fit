// related files:
// - web/backend/models/labOralScanCase.model.js
// - web/backend/modules/labOralScanCases/labOralScanCase.routes.js
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// 기공소 「커스텀어벗 의뢰하기」 스캔 케이스 CRUD.
import { Types } from "mongoose";
import LabOralScanCase from "../../models/labOralScanCase.model.js";
import {
  canReceivePracticeTransfer,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

function makeCaseId() {
  return `LOSC-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeFiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const s3Key = String(row?.s3Key || "").trim();
      const originalName = String(row?.originalName || row?.name || "").trim();
      if (!s3Key || !originalName) return null;
      return {
        patientName: String(row?.patientName || "").trim(),
        tooth: String(row?.tooth || "").trim(),
        scanRole: ["upper", "lower", "bite", "other"].includes(String(row?.scanRole || ""))
          ? String(row.scanRole)
          : "",
        originalName,
        mimetype: String(row?.mimetype || "application/octet-stream").trim(),
        size: Math.max(0, Number(row?.size) || 0),
        s3Key,
        uploadedAt: row?.uploadedAt ? new Date(row.uploadedAt) : new Date(),
      };
    })
    .filter(Boolean);
}

async function assertLabActor(req) {
  const userId = String(req.user?._id || "").trim();
  const labAnchorId = String(req.user?.businessAnchorId || "").trim();
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return { error: { status: 401, message: "인증이 필요합니다." } };
  }
  if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) {
    return { error: { status: 400, message: "기공소 사업자 정보가 필요합니다." } };
  }
  const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
  if (privileged) {
    return { userId, labAnchorId, privileged: true };
  }
  if (req.user?.role !== "requestor" && req.user?.role !== "lab") {
    return { error: { status: 403, message: "기공소만 이용할 수 있습니다." } };
  }
  const anchor = await BusinessAnchor.findById(labAnchorId)
    .select({ requestorKind: 1, requestorCapabilities: 1, requestorServices: 1 })
    .lean();
  const profile = resolveRequestorProfile({
    anchorKind: anchor?.requestorKind,
    anchorServices: anchor?.requestorServices,
    anchorCaps: anchor?.requestorCapabilities,
    userKind: req.user?.requestorKind,
    userServices: req.user?.requestorServices,
    userCaps: req.user?.requestorCapabilities,
    userRole: req.user?.role,
    businessVerified: Boolean(req.user?.businessVerified),
  });
  if (!canReceivePracticeTransfer(profile) && profile?.kind !== "lab") {
    return { error: { status: 403, message: "기공소만 이용할 수 있습니다." } };
  }
  return { userId, labAnchorId, privileged: false };
}

function caseToApi(doc) {
  if (!doc) return null;
  return {
    caseId: String(doc.caseId || ""),
    clinicName: String(doc.clinicName || ""),
    patientName: String(doc.patientName || ""),
    memo: String(doc.memo || ""),
    toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
    caseInfos: doc.caseInfos || null,
    files: Array.isArray(doc.files) ? doc.files : [],
    status: String(doc.status || "draft"),
    relatedRequestIds: Array.isArray(doc.production?.relatedRequestIds)
      ? doc.production.relatedRequestIds.map(String)
      : [],
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

/** POST /api/lab/oral-scan-cases */
export async function createLabOralScanCase(req, res) {
  try {
    const actor = await assertLabActor(req);
    if (actor.error) {
      return res.status(actor.error.status).json({
        success: false,
        message: actor.error.message,
      });
    }

    const clinicName = String(req.body?.clinicName || "").trim();
    const patientName = String(req.body?.patientName || "").trim();
    const memo = String(req.body?.memo || "").trim();
    const toothWorks = Array.isArray(req.body?.toothWorks) ? req.body.toothWorks : [];
    const files = normalizeFiles(req.body?.files);
    const caseInfos =
      req.body?.caseInfos && typeof req.body.caseInfos === "object"
        ? req.body.caseInfos
        : undefined;

    if (!patientName) {
      return res.status(400).json({ success: false, message: "환자명을 입력해 주세요." });
    }
    if (toothWorks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "커스텀어벗 치식을 선택해 주세요.",
      });
    }
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "구강 스캔 파일을 첨부해 주세요.",
      });
    }

    let caseId = makeCaseId();
    for (let i = 0; i < 5; i += 1) {
      const exists = await LabOralScanCase.exists({ caseId });
      if (!exists) break;
      caseId = makeCaseId();
    }

    const doc = await LabOralScanCase.create({
      caseId,
      labBusinessAnchorId: actor.labAnchorId,
      createdByUserId: actor.userId,
      clinicName,
      patientName,
      memo,
      toothWorks,
      caseInfos,
      files,
      status: "designing",
    });

    return res.status(201).json({
      success: true,
      data: caseToApi(doc),
    });
  } catch (error) {
    console.error("[labOralScanCase] create", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "케이스 생성에 실패했습니다.",
    });
  }
}

/** GET /api/lab/oral-scan-cases/:caseId */
export async function getLabOralScanCase(req, res) {
  try {
    const actor = await assertLabActor(req);
    if (actor.error) {
      return res.status(actor.error.status).json({
        success: false,
        message: actor.error.message,
      });
    }
    const caseId = String(req.params?.caseId || "").trim();
    if (!caseId) {
      return res.status(400).json({ success: false, message: "케이스 ID가 필요합니다." });
    }
    const doc = await LabOralScanCase.findOne({ caseId }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "케이스를 찾을 수 없습니다." });
    }
    if (
      !actor.privileged &&
      String(doc.labBusinessAnchorId || "") !== String(actor.labAnchorId)
    ) {
      return res.status(403).json({ success: false, message: "이 케이스를 볼 수 없습니다." });
    }
    return res.json({ success: true, data: caseToApi(doc) });
  } catch (error) {
    console.error("[labOralScanCase] get", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "케이스 조회에 실패했습니다.",
    });
  }
}

/** GET /api/lab/oral-scan-cases?status=designing */
export async function listLabOralScanCases(req, res) {
  try {
    const actor = await assertLabActor(req);
    if (actor.error) {
      return res.status(actor.error.status).json({
        success: false,
        message: actor.error.message,
      });
    }
    const status = String(req.query?.status || "").trim();
    const filter = { labBusinessAnchorId: actor.labAnchorId };
    if (status) filter.status = status;
    else filter.status = { $in: ["draft", "designing"] };

    const rows = await LabOralScanCase.find(filter)
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    return res.json({
      success: true,
      data: rows.map(caseToApi),
    });
  } catch (error) {
    console.error("[labOralScanCase] list", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "케이스 목록 조회에 실패했습니다.",
    });
  }
}

/** PATCH /api/lab/oral-scan-cases/:caseId */
export async function patchLabOralScanCase(req, res) {
  try {
    const actor = await assertLabActor(req);
    if (actor.error) {
      return res.status(actor.error.status).json({
        success: false,
        message: actor.error.message,
      });
    }
    const caseId = String(req.params?.caseId || "").trim();
    if (!caseId) {
      return res.status(400).json({ success: false, message: "케이스 ID가 필요합니다." });
    }
    const doc = await LabOralScanCase.findOne({ caseId });
    if (!doc) {
      return res.status(404).json({ success: false, message: "케이스를 찾을 수 없습니다." });
    }
    if (
      !actor.privileged &&
      String(doc.labBusinessAnchorId || "") !== String(actor.labAnchorId)
    ) {
      return res.status(403).json({ success: false, message: "이 케이스를 수정할 수 없습니다." });
    }
    if (String(doc.status || "") === "confirmed") {
      return res.status(409).json({
        success: false,
        message: "이미 생산 의뢰된 케이스는 수정할 수 없습니다.",
      });
    }

    if (req.body?.clinicName != null) {
      doc.clinicName = String(req.body.clinicName || "").trim();
    }
    if (req.body?.patientName != null) {
      doc.patientName = String(req.body.patientName || "").trim();
    }
    if (req.body?.memo != null) {
      doc.memo = String(req.body.memo || "").trim();
    }
    if (Array.isArray(req.body?.toothWorks)) {
      doc.toothWorks = req.body.toothWorks;
    }
    if (req.body?.caseInfos && typeof req.body.caseInfos === "object") {
      doc.caseInfos = req.body.caseInfos;
    }
    if (Array.isArray(req.body?.files)) {
      doc.files = normalizeFiles(req.body.files);
    }
    if (req.body?.status === "cancelled") {
      doc.status = "cancelled";
    } else if (doc.status === "draft") {
      doc.status = "designing";
    }

    await doc.save();
    return res.json({ success: true, data: caseToApi(doc) });
  } catch (error) {
    console.error("[labOralScanCase] patch", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "케이스 수정에 실패했습니다.",
    });
  }
}
