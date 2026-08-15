// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-08-14: /my 정렬용 compound index (anchor+createdAt+_id, legacy user).
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
      // 생성 시점 예산에 맞는 인증 기공소 스냅샷. 수신 목록은 이 배열만 본다(수가 재계산 없음).
      eligibleLabAnchorIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
          },
        ],
        default: undefined,
        index: true,
      },
      // 공개 풀에서 기공소가 「거부」한 앵커. 해당 기공소 수신함·클레임에서 제외.
      declinedLabAnchorIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
          },
        ],
        default: undefined,
        index: true,
      },
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
    // Abuts-first: 수락 시 Request 생성 → 어벗 디자인 → 기공소(·치과) 컨펌 → 생산
    production: {
      shippingMode: {
        type: String,
        enum: ["normal", "express", null],
        default: null,
      },
      // 전송 시점 스냅샷. 체크 UI 기본값은 계정 practiceTransferSettings.skipDesignConfirm(기본 true)
      skipDesignConfirm: { type: Boolean, default: true },
      // 어벗츠 디자인 완료 STL (design-handoff 미러). 기공소 다운로드·컨펌용
      designFiles: {
        type: [practiceTransferFileSchema],
        default: [],
      },
      designReadyAt: { type: Date, default: null },
      labDesignConfirmedAt: { type: Date, default: null },
      labDesignConfirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      practiceDesignConfirmedAt: { type: Date, default: null },
      practiceDesignConfirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      abutmentProductionStartedAt: { type: Date, default: null },
      // 크라운 작업완료 후 치과 「생산 진행」또는 skip 시 자동 확정
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
      // 거래처 여부(커스텀어벗 기공소 크레딧 차감). 플랫폼 수수료는 matchingMode=auto 때만.
      relationshipKind: {
        type: String,
        enum: ["active", "referred", "none"],
        default: "none",
      },
      feeRateApplied: { type: Number, default: 0 },
      // 기공수가 할증 배수(1=없음). 생성·수락 시점 스냅샷.
      labFeeMultiplier: { type: Number, default: 1, min: 1, max: 5 },
      labTradingPartnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LabTradingPartner",
        default: null,
      },
      labSettlementAmount: { type: Number, default: 0 },
      abutsRevenueAmount: { type: Number, default: 0 },
      // 에스크로: 생성 시 보류, 수락 시 금액 확정(billedAt), 작업완료 시 기공 지급(settledAt)
      heldAt: { type: Date, default: null },
      heldTotal: { type: Number, default: 0 },
      billedAt: { type: Date, default: null },
      settledAt: { type: Date, default: null },
      isRemake: { type: Boolean, default: false },
      // 자동매칭 기공비 예산 스냅샷 — 항목별 min/max (+ 선택적 합산 minLabFee/maxLabFee)
      autoMatchBudget: {
        type: mongoose.Schema.Types.Mixed,
        default: undefined,
      },
    },
    remake: {
      sourceTransferId: { type: String, default: "", trim: true, index: true },
      sourceTransferMongoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PracticeTransfer",
        default: null,
        index: true,
      },
      requestedAt: { type: Date, default: null },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
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
    // 기공소 「작업취소」(수락 해제). status=canceled(치과 휴지통)과 별개.
    workCanceledAt: {
      type: Date,
      default: null,
      index: true,
    },
    workCanceledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // 기공소 수락 전 「거부」(지정 기공소). 자동매칭 거부는 autoMatch.declinedLabAnchorIds.
    labRejectedAt: {
      type: Date,
      default: null,
      index: true,
    },
    labRejectedByLabAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
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
practiceTransferSchema.index({
  practiceBusinessAnchorId: 1,
  createdAt: -1,
  _id: -1,
});
practiceTransferSchema.index({
  practiceBusinessAnchorId: 1,
  practiceUserId: 1,
  createdAt: -1,
});
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
// 자동매칭 예산 적격 기공소 스냅샷(multikey) — 수신 목록 필터
practiceTransferSchema.index({
  matchingMode: 1,
  status: 1,
  "autoMatch.eligibleLabAnchorIds": 1,
  "autoMatch.deadlineAt": 1,
  "autoMatch.completedAt": 1,
});

const PracticeTransfer = mongoose.model("PracticeTransfer", practiceTransferSchema);

export default PracticeTransfer;
