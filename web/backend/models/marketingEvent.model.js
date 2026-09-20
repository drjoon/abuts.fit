// related files:
// - web/backend/models/marketingEventApplication.model.js
// - web/backend/controllers/events/marketingEvent.controller.js
// - web/backend/modules/events/event.routes.js
import mongoose from "mongoose";

const marketingEventSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    /** draft=비공개, open=신청 가능, closed=마감 */
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "draft",
      index: true,
    },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    coverImageUrl: { type: String, default: "", trim: true },
    sortOrder: { type: Number, default: 0 },
    formConfig: {
      requirePractice: { type: Boolean, default: true },
      requireDealer: { type: Boolean, default: false },
      dealerHelpText: { type: String, default: "", trim: true },
    },
  },
  { timestamps: true },
);

marketingEventSchema.index({ status: 1, sortOrder: 1, createdAt: -1 });

const MarketingEvent =
  mongoose.models.MarketingEvent ||
  mongoose.model("MarketingEvent", marketingEventSchema);

export default MarketingEvent;
