import mongoose from "mongoose";

const pricingReferralStatsSnapshotSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    groupLeaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
  { groupLeaderId: 1, ymd: 1 },
  { unique: true, partialFilterExpression: { ownerUserId: null } },
);

pricingReferralStatsSnapshotSchema.index(
  { ownerUserId: 1, ymd: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerUserId: { $type: "objectId" } },
  },
);

const PricingReferralStatsSnapshot = mongoose.model(
  "PricingReferralStatsSnapshot",
  pricingReferralStatsSnapshotSchema,
);

export default PricingReferralStatsSnapshot;
