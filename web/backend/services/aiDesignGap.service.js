// 조정값으로 바꾸지 못한 커스텀어벗 요청을 남기고, 관리자 홈에서 확인 대기만 보여 준다.
// related files:
// - web/backend/models/aiDesignGap.model.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/backend/controllers/admin/admin.aiDesignGap.controller.js
import { Types } from "mongoose";
import AiDesignGap from "../models/aiDesignGap.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";

const LIST_LIMIT = 50;

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

export async function recordAiDesignGap(input) {
  const message = clean(input?.message, 500);
  if (!message) return null;
  const transferId = clean(input?.transferId, 80);
  const anchorRaw = clean(input?.practiceBusinessAnchorId, 40);
  const anchorId = Types.ObjectId.isValid(anchorRaw) ? anchorRaw : null;
  if (transferId) {
    const existing = await AiDesignGap.findOne({
      transferId,
      message,
      reviewedAt: null,
      manualChoice: null,
    }).lean();
    if (existing?._id) return existing;
  }
  let practiceName = clean(input?.practiceName, 80);
  if (anchorId && !practiceName) {
    const anchor = await BusinessAnchor.findById(anchorId).select({ name: 1 }).lean();
    practiceName = clean(anchor?.name, 80);
  }
  const userRaw = clean(input?.userId, 40);
  return AiDesignGap.create({
    practiceBusinessAnchorId: anchorId,
    practiceName,
    userId: Types.ObjectId.isValid(userRaw) ? userRaw : null,
    transferId,
    patientName: clean(input?.patientName, 40),
    toothNumber: clean(input?.toothNumber, 8),
    message,
    reply: clean(input?.reply, 600),
  });
}

export async function findAiDesignGap(gapId) {
  if (!Types.ObjectId.isValid(String(gapId || ""))) return null;
  return AiDesignGap.findById(gapId);
}

export async function setAiDesignGapChoice(gap, choice) {
  if (!gap || (choice !== "yes" && choice !== "no")) return { gap: null, already: false };
  if (gap.manualChoice === "yes" || gap.manualChoice === "no") {
    return { gap, already: true };
  }
  gap.manualChoice = choice;
  await gap.save();
  return { gap, already: false };
}

function viewGap(row) {
  return {
    id: String(row._id),
    practiceName: String(row.practiceName || "").trim() || "계정 없음",
    transferId: String(row.transferId || "").trim(),
    patientName: String(row.patientName || "").trim(),
    toothNumber: String(row.toothNumber || "").trim(),
    message: String(row.message || "").trim(),
    reply: String(row.reply || "").trim(),
    manualChoice: row.manualChoice === "yes" || row.manualChoice === "no" ? row.manualChoice : null,
    createdAt: row.createdAt || null,
  };
}

export async function listOpenAiDesignGaps() {
  const rows = await AiDesignGap.find({ reviewedAt: null })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean();
  const ids = rows.map((row) => row.practiceBusinessAnchorId).filter(Boolean);
  const anchors = ids.length
    ? await BusinessAnchor.find({ _id: { $in: ids } })
        .select({ name: 1 })
        .lean()
    : [];
  const nameById = new Map(anchors.map((row) => [String(row._id), String(row.name || "").trim()]));
  const items = rows.map((row) => {
    const view = viewGap(row);
    const named = nameById.get(String(row.practiceBusinessAnchorId || ""));
    if (named) view.practiceName = named;
    return view;
  });
  return { count: items.length, items };
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

/** 의뢰자 디자인 프리뷰에 넘길 치식·스캔. */
export async function loadAiDesignGapPreview(gapId) {
  if (!Types.ObjectId.isValid(String(gapId || ""))) return null;
  const gap = await AiDesignGap.findById(gapId).select({ transferId: 1, patientName: 1 }).lean();
  if (!gap) return null;
  const transferId = String(gap.transferId || "").trim();
  if (!transferId) return null;
  const transfer = await PracticeTransfer.findOne({ transferId })
    .select({
      transferId: 1,
      toothWorks: 1,
      files: 1,
      "production.labWorkScanFiles": 1,
    })
    .lean();
  if (!transfer) return null;
  return {
    transferId: String(transfer.transferId || transferId),
    patientName: String(gap.patientName || "").trim(),
    toothWorks: Array.isArray(transfer.toothWorks) ? transfer.toothWorks : [],
    files: mapStoredFiles(transfer.files),
    workScanFiles: mapStoredFiles(transfer.production?.labWorkScanFiles),
  };
}

export async function reviewAiDesignGap(gapId) {
  if (!Types.ObjectId.isValid(String(gapId || ""))) return listOpenAiDesignGaps();
  await AiDesignGap.updateOne(
    { _id: gapId, reviewedAt: null },
    { $set: { reviewedAt: new Date() } },
  );
  return listOpenAiDesignGaps();
}
