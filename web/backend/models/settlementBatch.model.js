// related files:
// - web/backend/models/settlementBatchItem.model.js
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
import mongoose from "mongoose";

export const SETTLEMENT_BATCH_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
];

const settlementBatchSchema = new mongoose.Schema(
  {
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: SETTLEMENT_BATCH_STATUSES,
      default: "DRAFT",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    totalAmount: { type: Number, default: 0, min: 0 },
    itemCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

settlementBatchSchema.index(
  { periodStart: 1, periodEnd: 1 },
  { unique: true },
);

export default mongoose.model("SettlementBatch", settlementBatchSchema);
