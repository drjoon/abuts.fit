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
    // "direct"(지정 기공소) | "auto"(검증 기공소 공개 풀 · 선착순)
    matchingMode: {
      type: String,
      enum: ["direct", "auto"],
      default: "direct",
      index: true,
    },
    autoMatch: {
      claimedAt: { type: Date, default: null },
      deadlineAt: { type: Date, default: null, index: true },
      claimHours: { type: Number, default: null },
      completedAt: { type: Date, default: null, index: true },
      completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      releaseCount: { type: Number, default: 0 },
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
    // 기공소 작업완료 결과 파일 (의뢰 원본 files와 분리)
    resultFiles: {
      type: [practiceTransferFileSchema],
      default: [],
    },
    // 보철 치식(과금·표시). 전송 시점 스냅샷
    toothWorks: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // 치과 「생산 진행」 컨펌 + 커스텀어벗 → 어벗츠 자동의뢰 메타
    production: {
      shippingMode: {
        type: String,
        enum: ["normal", "express", null],
        default: null,
      },
      // 치과 전송 시 「디자인 컨펌 생략」— 기공소 작업완료 시 생산진행 자동
      skipDesignConfirm: { type: Boolean, default: false },
      confirmedAt: { type: Date, default: null, index: true },
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      relatedRequestIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Request",
          },
        ],
        default: [],
      },
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
    // requestor(수신 기공소) 의뢰수락 상태 SSOT
    // 레거시 필드명 requestorDownloadedAt 유지 (= 의뢰수락 시각)
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
// 자동매칭 공개 풀 조회
practiceTransferSchema.index({
  matchingMode: 1,
  status: 1,
  targetLabAnchorId: 1,
  "autoMatch.deadlineAt": 1,
  "autoMatch.completedAt": 1,
});

const PracticeTransfer = mongoose.model("PracticeTransfer", practiceTransferSchema);

export default PracticeTransfer;
