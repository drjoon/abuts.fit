// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
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
      unique: true,
      index: true,
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
  },
  { timestamps: true },
);

practiceTransferDraftSchema.index({ practiceUserId: 1, updatedAt: -1 });

const PracticeTransferDraft = mongoose.model(
  "PracticeTransferDraft",
  practiceTransferDraftSchema,
);

export default PracticeTransferDraft;
