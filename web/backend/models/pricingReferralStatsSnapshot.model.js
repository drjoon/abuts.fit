import mongoose from "mongoose";

const pricingReferralStatsSnapshotSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    ymd: {
      type: String,
      required: true,
      index: true,
    },
    groupMemberCount: {
      type: Number,
      default: 1,
    },
    groupTotalOrders: {
      type: Number,
      default: 0,
    },
    selfBusinessOrders: {
      type: Number,
      default: 0,
    },
    computedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

pricingReferralStatsSnapshotSchema.index(
  { businessAnchorId: 1, ymd: 1 },
  { unique: true, sparse: true },
);

const PricingReferralStatsSnapshot = mongoose.model(
  "PricingReferralStatsSnapshot",
  pricingReferralStatsSnapshotSchema,
);

export default PricingReferralStatsSnapshot;
