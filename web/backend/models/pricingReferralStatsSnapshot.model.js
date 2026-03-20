import mongoose from "mongoose";

const pricingReferralStatsSnapshotSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    leaderUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
  { businessId: 1, ymd: 1 },
  { unique: true, sparse: true },
);

pricingReferralStatsSnapshotSchema.index(
  { businessAnchorId: 1, ymd: 1 },
  { unique: true, sparse: true },
);

// 레거시 groupLeaderId_1_ymd_1 인덱스 제거 (마이그레이션 완료)
pricingReferralStatsSnapshotSchema.index(
  { groupLeaderId: 1, ymd: 1 },
  { sparse: true },
);

const PricingReferralStatsSnapshot = mongoose.model(
  "PricingReferralStatsSnapshot",
  pricingReferralStatsSnapshotSchema,
);

export default PricingReferralStatsSnapshot;
