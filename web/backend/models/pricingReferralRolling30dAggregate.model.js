// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";

const pricingReferralRolling30dAggregateSchema = new mongoose.Schema(
  {
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
    // 자정 스냅샷 시점에 확정한 건당 의뢰비(그날 하루 적용). utils/requestorUnitPricePolicy.js
    unitPrice: { type: Number, default: null },
    discountAmount: { type: Number, default: 0 },
    priceRule: {
      type: String,
      enum: ["intro_fixed", "volume_discount", "base_price", null],
      default: null,
    },
    introEndsYmd: { type: String, default: null },
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
