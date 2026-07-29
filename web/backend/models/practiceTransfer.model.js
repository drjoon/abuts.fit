// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import mongoose from "mongoose";

const practiceTransferFileSchema = new mongoose.Schema(
  {
    patientName: { type: String, default: "", trim: true },
    tooth: { type: String, default: "", trim: true },
    file: {
      originalName: { type: String, required: true, trim: true },
      mimetype: { type: String, default: "application/octet-stream", trim: true },
      size: { type: Number, default: 0 },
      s3Key: { type: String, required: true, trim: true },
    },
  },
  { _id: false },
);

const practiceTransferSchema = new mongoose.Schema(
  {
    transferId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    practiceUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    targetLabName: {
      type: String,
      default: "",
      trim: true,
    },
    transferMemo: {
      type: String,
      default: "",
      trim: true,
    },
    tag: {
      type: String,
      default: "practice_file_transfer",
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "canceled"],
      default: "active",
      index: true,
    },
    files: {
      type: [practiceTransferFileSchema],
      default: [],
    },
    // requestor(수신 기공소) 확인 상태 SSOT
    requestorReadAt: {
      type: Date,
      default: null,
      index: true,
    },
    requestorReadBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    canceledAt: {
      type: Date,
      default: null,
    },
    canceledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

practiceTransferSchema.index({ practiceUserId: 1, createdAt: -1 });
practiceTransferSchema.index({ transferId: 1, practiceUserId: 1 }, { unique: true });

const PracticeTransfer = mongoose.model("PracticeTransfer", practiceTransferSchema);

export default PracticeTransfer;
