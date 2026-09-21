// related files:
// - web/backend/models/marketingEvent.model.js
// - web/backend/controllers/events/marketingEvent.controller.js
import mongoose from "mongoose";

const placeSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true },
    representativeName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false },
);

const marketingEventApplicationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketingEvent",
      required: true,
      index: true,
    },
    eventSlug: { type: String, required: true, trim: true, index: true },
    /** 로그인한 신청자(있으면) */
    applicantUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /** 치과 */
    practice: { type: placeSnapshotSchema, default: () => ({}) },
    /** 원장명 (치과 대표와 별도 기입) */
    directorName: { type: String, default: "", trim: true },
    /** 지역 재료상 (옵션) */
    dealer: { type: placeSnapshotSchema, default: () => ({}) },
    /** 구강 스캔 사용 여부 */
    usesOralScan: { type: Boolean, default: false, index: true },
    applicantPhone: { type: String, default: "", trim: true },
    applicantEmail: { type: String, default: "", trim: true },
    memo: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["received", "reviewed", "fulfilled", "rejected"],
      default: "received",
      index: true,
    },
    adminNote: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

marketingEventApplicationSchema.index({ eventId: 1, createdAt: -1 });
marketingEventApplicationSchema.index({
  eventSlug: 1,
  "practice.name": 1,
  createdAt: -1,
});

const MarketingEventApplication =
  mongoose.models.MarketingEventApplication ||
  mongoose.model("MarketingEventApplication", marketingEventApplicationSchema);

export default MarketingEventApplication;
