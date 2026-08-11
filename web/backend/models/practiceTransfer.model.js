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
    // 보철 치식(과금·표시). 전송 시점 스냅샷
    toothWorks: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    billing: {
      labFeeTotal: { type: Number, default: 0 },
      abutmentRetailTotal: { type: Number, default: 0 },
      abutmentQty: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      isTradingPartner: { type: Boolean, default: false },
      // "active"(거래처, 0%) | "referred"(소개, labReferredFeeRate) | "none"(그 외, nonPartnerFeeRate)
      relationshipKind: {
        type: String,
        enum: ["active", "referred", "none"],
        default: "none",
      },
      feeRateApplied: { type: Number, default: 0 },
      labTradingPartnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LabTradingPartner",
        default: null,
      },
      labSettlementAmount: { type: Number, default: 0 },
      abutsRevenueAmount: { type: Number, default: 0 },
      billedAt: { type: Date, default: null },
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
    // requestor(수신 기공소) 다운로드 상태 SSOT
    requestorDownloadedAt: {
      type: Date,
      default: null,
      index: true,
    },
    requestorDownloadedBy: {
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
practiceTransferSchema.index({ practiceBusinessAnchorId: 1, createdAt: -1 });
practiceTransferSchema.index({ transferId: 1, practiceUserId: 1 }, { unique: true });
// received-unread-count 폴링: targetLab + unread + status
practiceTransferSchema.index({
  targetLabAnchorId: 1,
  status: 1,
  requestorReadAt: 1,
});

const PracticeTransfer = mongoose.model("PracticeTransfer", practiceTransferSchema);

export default PracticeTransfer;
