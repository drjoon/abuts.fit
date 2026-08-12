// related files:
// - web/backend/models/settlementBatch.model.js
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
import mongoose from "mongoose";

export const SETTLEMENT_BATCH_ITEM_ROLES = [
  "lab",
  "manufacturer",
  "salesman",
  "devops",
];
export const SETTLEMENT_BATCH_ITEM_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "EXCLUDED_NO_ACCOUNT",
  "PAID",
  "CANCELLED",
];

const settlementBatchItemSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SettlementBatch",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: SETTLEMENT_BATCH_ITEM_ROLES,
      required: true,
      index: true,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    accountCode: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    payoutAccount: {
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      holderName: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: SETTLEMENT_BATCH_ITEM_STATUSES,
      default: "PENDING",
      index: true,
    },
    journalId: { type: String, default: null, index: true },
    invoiceDraftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxInvoiceDraft",
      default: null,
    },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

settlementBatchItemSchema.index(
  { batchId: 1, businessAnchorId: 1, accountCode: 1 },
  { unique: true },
);

export default mongoose.model("SettlementBatchItem", settlementBatchItemSchema);
