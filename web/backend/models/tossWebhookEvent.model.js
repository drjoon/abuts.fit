import mongoose from "mongoose";

const tossWebhookEventSchema = new mongoose.Schema(
  {
    transmissionId: { type: String, required: true, unique: true, index: true },
    transmissionTime: { type: String, default: "" },
    retriedCount: { type: Number, default: 0 },

    eventType: { type: String, default: "" },
    orderId: { type: String, default: "", index: true },
    transactionKey: { type: String, default: "" },
    status: { type: String, default: "" },

    rawBody: { type: mongoose.Schema.Types.Mixed, default: null },
    processedAt: { type: Date, default: null },
    processStatus: {
      type: String,
      enum: ["RECEIVED", "PROCESSED", "IGNORED", "FAILED"],
      default: "RECEIVED",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("TossWebhookEvent", tossWebhookEventSchema);
