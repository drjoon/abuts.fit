import mongoose from "mongoose";

const manufacturerDailySettlementSnapshotSchema = new mongoose.Schema(
  {
    ymd: {
      type: String, // YYYY-MM-DD (KST)
      required: true,
      index: true,
    },
    manufacturerOrganization: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    earnRequestAmount: { type: Number, default: 0 },
    earnRequestCount: { type: Number, default: 0 },
    earnShippingAmount: { type: Number, default: 0 },
    earnShippingCount: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    payoutAmount: { type: Number, default: 0 },
    adjustAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

manufacturerDailySettlementSnapshotSchema.index(
  { manufacturerOrganization: 1, ymd: 1 },
  { unique: true },
);

export default mongoose.model(
  "ManufacturerDailySettlementSnapshot",
  manufacturerDailySettlementSnapshotSchema,
);
