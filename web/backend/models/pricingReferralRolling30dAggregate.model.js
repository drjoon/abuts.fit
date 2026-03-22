import mongoose from "mongoose";

const pricingReferralRolling30dAggregateSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    ymd: {
      type: String,
      required: true,
      index: true,
    },
    startYmd: {
      type: String,
      required: true,
    },
    endYmd: {
      type: String,
      required: true,
    },
    groupMemberCount: {
      type: Number,
      default: 0,
    },
    groupTotalOrders30d: {
      type: Number,
      default: 0,
    },
    selfBusinessOrders30d: {
      type: Number,
      default: 0,
    },
    computedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

pricingReferralRolling30dAggregateSchema.index(
  { businessAnchorId: 1, ymd: 1 },
  { unique: true },
);

const PricingReferralRolling30dAggregate = mongoose.model(
  "PricingReferralRolling30dAggregate",
  pricingReferralRolling30dAggregateSchema,
);

export default PricingReferralRolling30dAggregate;
