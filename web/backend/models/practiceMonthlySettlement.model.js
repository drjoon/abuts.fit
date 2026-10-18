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
    /** 어벗츠 법인 이체액을 스토어(과세)와 커스텀어벗(면세)으로 나눈 값. */
    invoiceSplit: {
      storeSupplyAmount: { type: Number, default: 0, min: 0 },
      storeVatAmount: { type: Number, default: 0, min: 0 },
      storeTotalAmount: { type: Number, default: 0, min: 0 },
      abutmentAmount: { type: Number, default: 0, min: 0 },
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
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
