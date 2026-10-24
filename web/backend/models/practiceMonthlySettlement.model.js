// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/services/openBankingAdapter.service.js
// - web/backend/jobs/monthlyPracticeObSettlementWorker.js
// - web/backend/controllers/credits/practiceOpenBanking.controller.js
import mongoose from "mongoose";

const settlementLineSchema = new mongoose.Schema(
  {
    payeeKind: {
      type: String,
      enum: ["direct_lab", "abuts_corp"],
      required: true,
    },
    payeeAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    payeeName: {
      type: String,
      default: "",
      trim: true,
    },
    bankCode: {
      type: String,
      default: "",
      trim: true,
    },
    bankName: {
      type: String,
      default: "",
      trim: true,
    },
    accountNumber: {
      type: String,
      default: "",
      trim: true,
    },
    holderName: {
      type: String,
      default: "",
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    transferStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    failureReason: {
      type: String,
      default: "",
    },
    obTxId: {
      type: String,
      default: "",
    },
    transferredAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true },
);

const practiceMonthlySettlementSchema = new mongoose.Schema(
  {
    practiceAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    yearMonth: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "CONFIRMED",
        "EXECUTING",
        "COMPLETED",
        "PARTIAL_FAILED",
        "FAILED",
      ],
      default: "DRAFT",
      index: true,
    },
    lines: {
      type: [settlementLineSchema],
      default: [],
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    /** 어벗츠 법인 이체액. 스토어(과세)·커스텀어벗(면세)·기공사업부 기공(면세). */
    invoiceSplit: {
      storeSupplyAmount: { type: Number, default: 0, min: 0 },
      storeVatAmount: { type: Number, default: 0, min: 0 },
      storeTotalAmount: { type: Number, default: 0, min: 0 },
      abutmentAmount: { type: Number, default: 0, min: 0 },
      labDivisionAmount: { type: Number, default: 0, min: 0 },
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    /** 익월 1일 09:00 KST 안내 문자. */
    noticeAt: { type: Date, default: null },
    noticeSentAt: { type: Date, default: null },
    /** 1차 입금 영업일 12:00 KST 미납 재안내. */
    reminderAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    firstDueYmd: { type: String, default: "", trim: true },
    secondDueYmd: { type: String, default: "", trim: true },
    /** 1차까지 입금되면 기공소에 보내는 영업일. */
    labPayoutOnYmd: { type: String, default: "", trim: true },
    /** 입금 확인 시각 기준 실제 기공소 지급 예정일. */
    labPayoutDueYmd: { type: String, default: "", trim: true },
    /** 전액 확인 전 일부 입금. 전액이면 paymentReceivedAt을 쓴다. */
    amountReceived: { type: Number, default: 0, min: 0 },
    partialReceivedAt: { type: Date, default: null },
    paymentReceivedAt: { type: Date, default: null },
    labPayoutMarkedAt: { type: Date, default: null },
    reopenNoticeSentAt: { type: Date, default: null },
    /** 2차 입금일 다음 날 09:00 KST. 이 시각부터 미입금이면 신규 주문 정지. */
    scheduledTransferAt: {
      type: Date,
      default: null,
      index: true,
    },
    failedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

practiceMonthlySettlementSchema.index(
  { practiceAnchorId: 1, yearMonth: 1 },
  { unique: true },
);

export default mongoose.model(
  "PracticeMonthlySettlement",
  practiceMonthlySettlementSchema,
);
