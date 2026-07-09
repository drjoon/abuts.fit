import mongoose from "mongoose";

const pricingSsotMismatchItemSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: "",
    },
    businessType: {
      type: String,
      default: "",
    },
    requestCount: {
      type: Number,
      default: 0,
    },
    snapshotCount: {
      type: Number,
      default: 0,
    },
    gap: {
      type: Number,
      default: 0,
    },
    snapshotComputedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const pricingSsotHealthSnapshotSchema = new mongoose.Schema(
  {
    ymd: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    range: {
      startYmd: {
        type: String,
        required: true,
      },
      endYmd: {
        type: String,
        required: true,
      },
    },
    checkedSnapshotCount: {
      type: Number,
      default: 0,
    },
    mismatchCount: {
      type: Number,
      default: 0,
    },
    mismatches: {
      type: [pricingSsotMismatchItemSchema],
      default: [],
    },
    success: {
      type: Boolean,
      default: true,
    },
    checkedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

const PricingSsotHealthSnapshot = mongoose.model(
  "PricingSsotHealthSnapshot",
  pricingSsotHealthSnapshotSchema,
);

export default PricingSsotHealthSnapshot;
