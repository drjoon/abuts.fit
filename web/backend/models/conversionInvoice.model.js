// related files:
// - web/backend/services/demoConversion.service.js
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/models/chargeOrder.model.js
import mongoose from "mongoose";

/**
 * 데모→실사용 전환 청구 스냅샷.
 * 입금은 ChargeOrder(선수금과 동일 파이프)로 받고, 매칭 시 워터폴 적용.
 */
const labRemittanceSchema = new mongoose.Schema(
  {
    labAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
    },
    labFee: { type: Number, default: 0, min: 0 },
    labToAbuts: { type: Number, default: 0, min: 0 },
    labNet: { type: Number, default: 0, min: 0 },
    practiceTransferIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "PracticeTransfer" }],
      default: [],
    },
    requestIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Request" }],
      default: [],
    },
  },
  { _id: false },
);

const conversionInvoiceSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    requestorKind: {
      type: String,
      enum: ["practice", "lab"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "CANCELED"],
      default: "PENDING",
      index: true,
    },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    /** ① 치과/기공소 → 어벗츠 이용분(데모 부채) */
    abutsUsage: { type: Number, default: 0, min: 0 },
    /** ② 치과→기공소 기공비 합(치과만) */
    practiceToLabTotal: { type: Number, default: 0, min: 0 },
    /** 데모 freeRequest 부채 절대값(정산 대상) */
    demoDebt: { type: Number, default: 0, min: 0 },
    prepaidMin: { type: Number, default: 0, min: 0 },
    minTotal: { type: Number, default: 0, min: 0 },
    labRemittances: { type: [labRemittanceSchema], default: [] },
    chargeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChargeOrder",
      default: null,
      index: true,
    },
    paidAt: { type: Date, default: null },
    paidChargeAmount: { type: Number, default: 0, min: 0 },
    prepaidCredited: { type: Number, default: 0, min: 0 },
    reason: { type: String, default: "" },
    quoteSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

conversionInvoiceSchema.index(
  { businessAnchorId: 1, status: 1 },
  { name: "conversion_invoice_anchor_status" },
);

export default mongoose.model("ConversionInvoice", conversionInvoiceSchema);
