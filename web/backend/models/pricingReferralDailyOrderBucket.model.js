import mongoose from "mongoose";

const pricingReferralDailyOrderBucketSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    shipDateYmd: {
      type: String,
      required: true,
      index: true,
    },
    requestIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Request",
        },
      ],
      default: [],
    },
    requestCount: {
      type: Number,
      default: 0,
    },
    packageIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ShippingPackage",
        },
      ],
      default: [],
    },
    computedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

pricingReferralDailyOrderBucketSchema.index(
  { businessAnchorId: 1, shipDateYmd: 1 },
  { unique: true },
);

const PricingReferralDailyOrderBucket = mongoose.model(
  "PricingReferralDailyOrderBucket",
  pricingReferralDailyOrderBucketSchema,
);

export default PricingReferralDailyOrderBucket;
