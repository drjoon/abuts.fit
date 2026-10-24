// 기공의뢰 담당 기사. 작업시작을 누른 계정이 기본이고, 수행 기공소가 바꿀 수 있다.
import User from "../models/user.model.js";
import {
  canLabOperatePracticeTransferWork,
  resolvePerformingLabAnchorId,
} from "./practiceTransferAutoMatchCore.js";

export function labTechnicianAssignFields(user, now = new Date()) {
  return {
    labTechnicianUserId: user?._id || null,
    labTechnicianName: String(user?.name || "").trim(),
    labTechnicianSetAt: now,
  };
}

export function labTechnicianClearFields() {
  return {
    labTechnicianUserId: null,
    labTechnicianName: "",
    labTechnicianSetAt: null,
  };
}

export function applyLabTechnicianFields(doc, fields) {
  if (!doc || !fields) return doc;
  doc.labTechnicianUserId = fields.labTechnicianUserId ?? null;
  doc.labTechnicianName = fields.labTechnicianName ?? "";
  doc.labTechnicianSetAt = fields.labTechnicianSetAt ?? null;
  return doc;
}

/** 작업이 시작된 건의 담당. 명시 지정이 없으면 작업시작 계정. */
export function resolveLabTechnician(doc) {
  if (!doc?.requestorDownloadedAt || doc.workCanceledAt) return null;
  const explicitId = doc.labTechnicianUserId
    ? String(doc.labTechnicianUserId)
    : "";
  const fallbackId = doc.requestorDownloadedBy
    ? String(doc.requestorDownloadedBy)
    : "";
  const userId = explicitId || fallbackId;
  if (!userId) return null;
  return {
    userId,
    name: String(doc.labTechnicianName || "").trim(),
  };
}

export function toLabTechnicianApi(doc) {
  const view = resolveLabTechnician(doc);
  if (!view) return { labTechnician: null };
  return {
    labTechnician: {
      userId: view.userId,
      name: view.name,
    },
  };
}

/** 수행 기공소 소속만 담당 기사를 바꾼다. 원청이 하청 건을 볼 때는 불가. */
export function canViewerAssignLabTechnician(doc, viewerLabAnchorId) {
  if (!resolveLabTechnician(doc)) return false;
  const viewer = String(viewerLabAnchorId || "").trim();
  const performing = String(resolvePerformingLabAnchorId(doc) || "").trim();
  if (!viewer || !performing || viewer !== performing) return false;
  return canLabOperatePracticeTransferWork(doc, viewer);
}

/** 이름 스냅샷이 없는 레거시 — 목록 한 번에 이름을 채운다. 저장하지 않는다. */
export async function hydrateLabTechnicianNames(docs) {
  const list = Array.isArray(docs) ? docs : [];
  const missing = [];
  for (const doc of list) {
    const view = resolveLabTechnician(doc);
    if (view?.userId && !view.name) missing.push(view.userId);
  }
  if (!missing.length) return list;
  const rows = await User.find({ _id: { $in: [...new Set(missing)] } })
    .select({ name: 1 })
    .lean();
  const names = new Map(
    rows.map((row) => [String(row._id), String(row.name || "").trim()]),
  );
  for (const doc of list) {
    const view = resolveLabTechnician(doc);
    if (!view?.userId || view.name) continue;
    doc.labTechnicianName = names.get(view.userId) || "";
  }
  return list;
}
