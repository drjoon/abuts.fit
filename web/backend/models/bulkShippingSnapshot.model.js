// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/requests/shipping.Requestor.helpers.js
// change-log:
// - 2026-08-19: 출고예정 모달용 디자인SW·아노·생산모드·임플란트 스냅샷 필드.
import mongoose from "mongoose";

const bulkShippingSnapshotItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: "",
    },
    mongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      default: null,
    },
    title: {
      type: String,
      default: "",
    },
    clinic: {
      type: String,
      default: "",
    },
    patient: {
      type: String,
      default: "",
    },
    tooth: {
      type: String,
      default: "",
    },
    diameter: {
      type: String,
      default: "",
    },
    designSoftware: {
      type: String,
      default: "",
    },
    anodizingEnabled: {
      type: Boolean,
      default: null,
    },
    productMode: {
      type: String,
      default: "",
    },
    implantManufacturer: {
      type: String,
      default: "",
    },
    implantBrand: {
      type: String,
      default: "",
    },
    implantFamily: {
      type: String,
      default: "",
    },
    implantType: {
      type: String,
      default: "",
    },
    stage: {
      type: String,
      default: "",
    },
    stageKey: {
      type: String,
      default: "",
    },
    stageLabel: {
      type: String,
      default: "",
    },
    shippingMode: {
      type: String,
      default: "normal",
    },
    requestedShipDate: {
      type: Date,
      default: null,
    },
    estimatedShipYmd: {
      type: String,
      default: "",
    },
    originalEstimatedShipYmd: {
      type: String,
      default: "",
    },
    nextEstimatedShipYmd: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const bulkShippingSnapshotSchema = new mongoose.Schema(
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
    pre: {
      type: [bulkShippingSnapshotItemSchema],
      default: [],
    },
    post: {
      type: [bulkShippingSnapshotItemSchema],
      default: [],
    },
    waiting: {
      type: [bulkShippingSnapshotItemSchema],
      default: [],
    },
    computedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

bulkShippingSnapshotSchema.index({ businessAnchorId: 1, ymd: 1 }, { unique: true });

const BulkShippingSnapshot = mongoose.model(
  "BulkShippingSnapshot",
  bulkShippingSnapshotSchema,
);

export default BulkShippingSnapshot;
