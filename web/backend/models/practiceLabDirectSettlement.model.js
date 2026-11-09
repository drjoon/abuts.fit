// related files:
// - web/backend/services/practiceLabDirectSettlement.service.js
// - web/backend/jobs/monthlyPracticeLabDirectSettlementWorker.js
//
// 치과 → 외부 기공소 기공비. 매월 1일 지난달 정산서.
// 플랫폼이 금액을 받아 다시 보내지 않는다.
import mongoose from "mongoose";

const lineSchema = new mongoose.Schema(
  {
    transferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PracticeTransfer",
      required: true,
    },
    patientLabel: { type: String, default: "", trim: true },
    originalAmount: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const editSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    kind: { type: String, default: "", trim: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const practiceLabDirectSettlementSchema = new mongoose.Schema(
  {
    practiceAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    labAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    yearMonth: { type: String, required: true, trim: true, index: true },
    practiceName: { type: String, default: "", trim: true },
    labName: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: [
        "OPEN",
        "ADJUSTED",
        "DEPOSIT_CONFIRMED",
        "INVOICE_ISSUED",
        "SELF_INVOICE",
      ],
      default: "OPEN",
      index: true,
    },
    lines: { type: [lineSchema], default: [] },
    originalTotal: { type: Number, required: true, min: 0, default: 0 },
    totalOverride: {
      type: Number,
      default: null,
      validate: {
        validator(value) {
          return value == null || (Number.isFinite(value) && value >= 0);
        },
        message: "총액은 0 이상의 정수입니다.",
      },
    },
    payableAmount: { type: Number, required: true, min: 0, default: 0 },
    edits: { type: [editSchema], default: [] },
    depositConfirmedAt: { type: Date, default: null },
    depositConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    taxInvoiceDraftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxInvoiceDraft",
      default: null,
    },
  },
  { timestamps: true },
);

practiceLabDirectSettlementSchema.index(
  { practiceAnchorId: 1, labAnchorId: 1, yearMonth: 1 },
  { unique: true },
);

export default mongoose.model(
  "PracticeLabDirectSettlement",
  practiceLabDirectSettlementSchema,
);
