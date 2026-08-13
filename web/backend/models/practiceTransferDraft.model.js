// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - 2026-08-14: 목록 조회용 (practiceBusinessAnchorId, deletedAt, updatedAt) index.
import mongoose from "mongoose";

const practiceTransferDraftFileSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
      index: true,
    },
    originalName: { type: String, required: true, trim: true },
    mimetype: { type: String, default: "application/octet-stream", trim: true },
    size: { type: Number, default: 0 },
    s3Key: { type: String, required: true, trim: true },
    location: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const practiceTransferDraftSchema = new mongoose.Schema(
  {
    practiceUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    practiceBusinessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    targetLabAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    targetLabName: { type: String, default: "", trim: true },
    transferMemo: { type: String, default: "", trim: true },
    files: {
      type: [practiceTransferDraftFileSchema],
      default: [],
    },
    // null이면 활성, 값이 있으면 휴지통(소프트 삭제)
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

// 사용자당 다중 활성 draft 허용(임시 저장 스냅샷 후 이어서 작성 시 새 건 생성).
practiceTransferDraftSchema.index({ practiceUserId: 1, deletedAt: 1, updatedAt: -1 });
practiceTransferDraftSchema.index({ practiceUserId: 1, updatedAt: -1 });
practiceTransferDraftSchema.index({ deletedAt: 1, updatedAt: -1 });
practiceTransferDraftSchema.index({
  practiceBusinessAnchorId: 1,
  deletedAt: 1,
  updatedAt: -1,
});

const PracticeTransferDraft = mongoose.model(
  "PracticeTransferDraft",
  practiceTransferDraftSchema,
);

export default PracticeTransferDraft;
