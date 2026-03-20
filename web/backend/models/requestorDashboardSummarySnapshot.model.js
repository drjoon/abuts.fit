import mongoose from "mongoose";

const stageSummaryItemSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "",
    },
    label: {
      type: String,
      default: "",
    },
    count: {
      type: Number,
      default: 0,
    },
    percent: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const recentRequestItemSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      default: null,
    },
    requestId: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
    },
    manufacturerStage: {
      type: String,
      default: "",
    },
    date: {
      type: String,
      default: "",
    },
    estimatedShipYmd: {
      type: String,
      default: null,
    },
    originalEstimatedShipYmd: {
      type: String,
      default: null,
    },
    nextEstimatedShipYmd: {
      type: String,
      default: null,
    },
    patientName: {
      type: String,
      default: "",
    },
    tooth: {
      type: String,
      default: "",
    },
    caseInfos: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    requestor: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    deliveryInfoRef: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    price: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    createdAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const requestorDashboardSummarySnapshotSchema = new mongoose.Schema(
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
    periodKey: {
      type: String,
      required: true,
      index: true,
    },
    stats: {
      totalRequests: { type: Number, default: 0 },
      totalRequestsChange: { type: String, default: "+0%" },
      inProgress: { type: Number, default: 0 },
      inProgressChange: { type: String, default: "+0%" },
      inCam: { type: Number, default: 0 },
      inCamChange: { type: String, default: "+0%" },
      inProduction: { type: Number, default: 0 },
      inProductionChange: { type: String, default: "+0%" },
      inPacking: { type: Number, default: 0 },
      inPackingChange: { type: String, default: "+0%" },
      inShipping: { type: Number, default: 0 },
      inShippingBoxes: { type: Number, default: 0 },
      inShippingChange: { type: String, default: "+0%" },
      inTracking: { type: Number, default: 0 },
      inTrackingBoxes: { type: Number, default: 0 },
      inTrackingChange: { type: String, default: "+0%" },
      canceled: { type: Number, default: 0 },
      canceledChange: { type: String, default: "+0%" },
      tracking: { type: Number, default: 0 },
      doneOrCanceled: { type: Number, default: 0 },
      doneOrCanceledChange: { type: String, default: "+0%" },
    },
    manufacturingSummary: {
      totalActive: { type: Number, default: 0 },
      stages: {
        type: [stageSummaryItemSchema],
        default: [],
      },
    },
    recentRequests: {
      type: [recentRequestItemSchema],
      default: [],
    },
    computedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

requestorDashboardSummarySnapshotSchema.index(
  { businessAnchorId: 1, ymd: 1, periodKey: 1 },
  { unique: true },
);

const RequestorDashboardSummarySnapshot = mongoose.model(
  "RequestorDashboardSummarySnapshot",
  requestorDashboardSummarySnapshotSchema,
);

export default RequestorDashboardSummarySnapshot;
