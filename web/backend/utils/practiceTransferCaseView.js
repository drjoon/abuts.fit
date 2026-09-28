// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferShare.controller.js
// - web/backend/utils/practiceTransferChatAccess.js
// - web/backend/models/practiceTransferShareLink.model.js
// - web/frontend/src/shared/share/caseShareTypes.ts
// - 2026-09-28: 케이스 3D 공유 — 의뢰 참여자(치과·원청·협력·하청) 판정과 뷰 페이로드.
// - 2026-09-28: 공유 링크 접근 판정(resolveCaseShareAccess) — 공개 범위·만료·차단.
import { createHash } from "crypto";
import { Types } from "mongoose";
import User from "../models/user.model.js";
import {
  canJoinPracticeTransferAsLabPeer,
  canJoinPracticeTransferAsPracticePeer,
} from "./practiceTransferChatAccess.js";

export const PRACTICE_TRANSFER_CASE_VIEW_SELECT = {
  _id: 1,
  transferId: 1,
  status: 1,
  practiceUserId: 1,
  practiceBusinessAnchorId: 1,
  targetLabAnchorId: 1,
  targetLabName: 1,
  assigneeLabAnchorId: 1,
  assigneeLabName: 1,
  assigneeKind: 1,
  toothWorks: 1,
  files: 1,
  resultFiles: 1,
  "production.designFiles": 1,
  "production.labWorkScanFiles": 1,
  createdAt: 1,
};

const SHAREABLE_EXT_RE = /\.(stl|ply|obj|dcm|mtl|jpe?g|png|webp|bmp)$/i;
const MODEL_EXT_RE = /\.(stl|ply|obj|dcm)$/i;

export const buildTransferLookupFilter = (rawTransferKey) => {
  const value = String(rawTransferKey || "").trim();
  if (!value) return null;
  if (Types.ObjectId.isValid(value)) {
    return {
      $or: [{ transferId: value }, { _id: new Types.ObjectId(value) }],
    };
  }
  return { transferId: value };
};

const loadPracticePeerIdsIfNeeded = async (user, transferDoc) => {
  if (String(transferDoc?.practiceBusinessAnchorId || "").trim()) return [];
  const anchorId = String(user?.businessAnchorId || "").trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return [];
  const rows = await User.find({
    businessAnchorId: new Types.ObjectId(anchorId),
    role: { $in: ["practice", "requestor"] },
    active: true,
  })
    .select({ _id: 1 })
    .lean();
  return rows.map((row) => String(row?._id || ""));
};

/**
 * 케이스 뷰어 접근. 채팅 참여 판정과 같은 SSOT.
 * practice=치과 측, lab=원청(target)·수행(assignee, 협력·하청), admin.
 * 자동매칭 공개 풀에서 아직 작업시작하지 않은 기공소는 포함하지 않는다.
 */
export const resolvePracticeTransferCaseViewerSide = async (user, transferDoc) => {
  if (!user || !transferDoc) return null;
  const role = String(user.role || "").trim();
  if (role === "admin") return "admin";

  const base = {
    currentUserId: user._id,
    currentUserRole: role,
    currentUserBusinessAnchorId: user.businessAnchorId,
    transferDoc,
  };
  if (canJoinPracticeTransferAsLabPeer(base)) return "lab";

  const peerIds = await loadPracticePeerIdsIfNeeded(user, transferDoc);
  if (canJoinPracticeTransferAsPracticePeer({ ...base, peerIds })) {
    return "practice";
  }
  return null;
};

export const isPracticeTransferRemoved = (transferDoc) => {
  const status = String(transferDoc?.status || "").trim();
  return status === "deleted" || status === "canceled";
};

/**
 * 공유 링크를 지금 이 사용자가 볼 수 있는지.
 * 차단·만료·의뢰 삭제면 소유자도 못 본다(소유자는 공유 창에서 차단 해제·기간 연장).
 * accounts·participants는 로그인이 필요하다(비로그인이면 401 login_required).
 * maskPatient: 의뢰 관계자가 아니면 환자명을 가린다.
 */
export const resolveCaseShareAccess = async ({
  link,
  transferDoc,
  user = null,
  now = Date.now(),
}) => {
  if (!link) return { ok: false, status: 404, reason: "not_found" };
  if (link.blockedAt) return { ok: false, status: 410, reason: "blocked" };
  if (new Date(link.expiresAt).getTime() <= now) {
    return { ok: false, status: 410, reason: "expired" };
  }
  if (!transferDoc || isPracticeTransferRemoved(transferDoc)) {
    return { ok: false, status: 410, reason: "removed" };
  }

  const side = user ? await resolvePracticeTransferCaseViewerSide(user, transferDoc) : null;
  const granted = { ok: true, status: 200, maskPatient: !side };
  const visibility = String(link.visibility || "public");
  if (visibility === "public") return granted;
  if (!user) return { ok: false, status: 401, reason: "login_required" };

  const userId = String(user._id || "");
  if (userId && userId === String(link.createdBy || "")) return granted;
  if (String(user.role || "") === "admin") return granted;

  if (visibility === "accounts") {
    const allowed = (link.allowedUserIds || []).some((id) => String(id) === userId);
    return allowed ? granted : { ok: false, status: 403, reason: "not_allowed" };
  }
  return side ? granted : { ok: false, status: 403, reason: "not_allowed" };
};

export const caseFileKeyForS3Key = (s3Key) =>
  createHash("sha256").update(String(s3Key || "")).digest("hex").slice(0, 24);

const toCaseFile = (entry, meta) => {
  const s3Key = String(entry?.file?.s3Key || "").trim();
  const fileName = String(entry?.file?.originalName || "").trim();
  if (!s3Key || !fileName || !SHAREABLE_EXT_RE.test(fileName)) return null;
  return {
    fileKey: caseFileKeyForS3Key(s3Key),
    s3Key,
    fileName,
    size: Number(entry?.file?.size || 0),
    isModel: MODEL_EXT_RE.test(fileName),
    scanRole: String(entry?.scanRole || "").trim(),
    tooth: String(entry?.tooth || "").trim(),
    uploadedAt: entry?.uploadedAt || null,
    ...meta,
  };
};

/** 의뢰 파일 전체를 공유 뷰 순서(디자인 → 스캔)로 편다. s3Key 포함. */
export const listPracticeTransferCaseFiles = (transferDoc) => {
  const sections = [
    { rows: transferDoc?.resultFiles, meta: { group: "design", kind: "prosthesis" } },
    {
      rows: transferDoc?.production?.designFiles,
      meta: { group: "design", kind: "abutment" },
    },
    { rows: transferDoc?.files, meta: { group: "scan", kind: "request" } },
    {
      rows: transferDoc?.production?.labWorkScanFiles,
      meta: { group: "scan", kind: "workScan" },
    },
  ];
  const seen = new Set();
  const out = [];
  for (const section of sections) {
    for (const entry of Array.isArray(section.rows) ? section.rows : []) {
      const row = toCaseFile(entry, section.meta);
      if (!row || seen.has(row.fileKey)) continue;
      seen.add(row.fileKey);
      out.push(row);
    }
  }
  return out;
};

export const maskPatientName = (name) => {
  const chars = Array.from(String(name || "").trim());
  if (chars.length === 0) return "";
  if (chars.length === 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
};

const listCaseTeeth = (transferDoc) => {
  const rows = Array.isArray(transferDoc?.toothWorks) ? transferDoc.toothWorks : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const tooth = String(row?.toothNumber || row?.tooth || "").trim();
    if (!tooth || seen.has(tooth)) continue;
    seen.add(tooth);
    out.push({
      tooth,
      prosthesisType: String(row?.prosthesisType || row?.type || "").trim(),
    });
  }
  return out;
};

const firstPatientName = (transferDoc) => {
  for (const entry of Array.isArray(transferDoc?.files) ? transferDoc.files : []) {
    const name = String(entry?.patientName || "").trim();
    if (name) return name;
  }
  return "";
};

/**
 * 뷰어 페이로드.
 * mode=internal — 의뢰 참여자. s3Key·참여 기공소 포함.
 * mode=public — 공유 링크. s3Key·참여 기공소 없음. 환자명은 maskPatient(기본 true)면 가린다.
 */
export const buildPracticeTransferCaseView = (
  transferDoc,
  { mode = "internal", practiceName = "", maskPatient } = {},
) => {
  const isPublic = mode === "public";
  const shouldMask = maskPatient ?? isPublic;
  const patientName = firstPatientName(transferDoc);
  const files = listPracticeTransferCaseFiles(transferDoc).map((row) => {
    if (!isPublic) return row;
    const { s3Key: _s3Key, ...rest } = row;
    return rest;
  });

  const view = {
    transferId: String(transferDoc?.transferId || "").trim(),
    patientName: shouldMask ? maskPatientName(patientName) : patientName,
    teeth: listCaseTeeth(transferDoc),
    files,
  };
  if (isPublic) return view;

  const assigneeKind = String(transferDoc?.assigneeKind || "").trim();
  return {
    ...view,
    transferMongoId: String(transferDoc?._id || ""),
    participants: {
      practiceName: String(practiceName || "").trim(),
      primeLabName: String(transferDoc?.targetLabName || "").trim(),
      assigneeLabName: String(transferDoc?.assigneeLabName || "").trim(),
      assigneeKind:
        assigneeKind === "cooperation" || assigneeKind === "subcontract"
          ? assigneeKind
          : null,
    },
  };
};
