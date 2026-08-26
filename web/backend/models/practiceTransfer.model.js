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
    // abuts UI 발신 경로에서는 필수. source=3shape(외부 Communicate)는 미가입 치과 허용.
    practiceUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function requiredPracticeUserId() {
        return String(this.source || "abuts") !== "3shape";
      },
      index: true,
      default: null,
    },
    practiceBusinessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    // abuts | 3shape (스캐너 Inbox 수신)
    source: {
      type: String,
      enum: ["abuts", "3shape"],
      default: "abuts",
      index: true,
      trim: true,
    },
    externalCaseId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    externalPractice: {
      name: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true, lowercase: true },
      communicateId: { type: String, default: "", trim: true },
    },
    // 구강스캔 출처 CAD 힌트(hex 정책 등과 별개 스냅샷)
    designSoftware: {
      type: String,
      default: "",
      trim: true,
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
    // 경로 B 수행 기공소(하청). 원청은 targetLab(어벗츠)로 고정.
    assigneeLabAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    assigneeLabName: {
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
      // 치과 별점 하한·상한 스냅샷(지정 의뢰 포함). 하청 풀·지정 게이트에 사용.
      minLabRating: { type: Number, default: undefined, min: 1, max: 5 },
      maxLabRating: { type: Number, default: undefined, min: 1, max: 5 },
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
      subcontractPoolOpen: { type: Boolean, default: false },
      // 어벗츠기공소(internalLab) 우선창: 생성 시 적격이면 +30분. 하청 전환·거부·작업취소 시 조기 종료.
      priorityUntil: { type: Date, default: null, index: true },
      priorityLabAnchorIds: {
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
    // active | deleted(치과 의뢰 삭제·휴지통) | canceled(레거시 휴지통, deleted와 동일)
    // 기공소 작업취소는 status를 바꾸지 않고 workCanceledAt만 사용.
    status: {
      type: String,
      enum: ["active", "deleted", "canceled"],
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
      // 신속처리(의뢰+2영업일·기공/어벗 할증). 일반 건은 묶음출고만.
      rushProcessing: { type: Boolean, default: false },
      // 전송 시점 스냅샷. 체크 UI 기본값은 계정 practiceTransferSettings.skipDesignConfirm(기본 true)
      skipDesignConfirm: { type: Boolean, default: true },
      // 레거시(2026-08-22 옵션 삭제): production.skipJig — 「지그 제작 불필요」UI/계정 설정 제거.
      // 필드는 구 스냅샷 호환용. 신규 의뢰는 쓰지 않음. 기공소→치과 배송은 무료.
      skipJig: { type: Boolean, default: true },
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
      labAbutmentTotal: { type: Number, default: 0 },
      labAbutmentPending: { type: Boolean, default: false },
      abutmentRetailTotal: { type: Number, default: 0 },
      abutmentQty: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      /** 기공수가「배송비」(기공비 hold에 합산). 견적 표시와 분리용. */
      labShippingFee: { type: Number, default: 0 },
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
      // 신속처리 할증(1 | 1.5). 기공비·어벗츠 모두. 생성 스냅샷.
      rushFeeMultiplier: { type: Number, default: 1, min: 1, max: 2 },
      labTradingPartnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LabTradingPartner",
        default: null,
      },
      labSettlementAmount: { type: Number, default: 0 },
      abutsRevenueAmount: { type: Number, default: 0 },
      // 에스크로: 생성 시 보류(기공소몫/어벗츠몫 분리), 수락 시 금액 확정(billedAt),
      // 기공소 발송=labSettledAt, 제조사 발송=abutmentSettledAt. settledAt=둘 다(해당분만) 완료.
      heldAt: { type: Date, default: null },
      heldTotal: { type: Number, default: 0 },
      heldLabTotal: { type: Number, default: 0 },
      heldAbutmentTotal: { type: Number, default: 0 },
      heldShippingLabTotal: { type: Number, default: 0 },
      heldShippingAbutsTotal: { type: Number, default: 0 },
      billedAt: { type: Date, default: null },
      settledAt: { type: Date, default: null },
      labSettledAt: { type: Date, default: null },
      abutmentSettledAt: { type: Date, default: null },
      isRemake: { type: Boolean, default: false },
      // 자동매칭 기공비 스냅샷 — v4 고정수가(stars/feeMultiplier/items min=max) 또는 레거시 밴드
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
    // 기공소 「작업취소」(수락 해제). status=deleted(치과 의뢰 삭제)과 별개.
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
    // 치과 의뢰 삭제(휴지통) 시각. 필드명은 레거시(status=deleted|canceled 공용).
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
practiceTransferSchema.index(
  { source: 1, externalCaseId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "3shape",
      externalCaseId: { $type: "string", $gt: "" },
    },
  },
);
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
