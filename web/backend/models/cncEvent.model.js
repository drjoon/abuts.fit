import mongoose from "mongoose";

const cncEventSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    machineId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    sourceStep: {
      type: String,
      trim: true,
      index: true,
      required: true,
    },
    status: {
      type: String,
      trim: true,
      enum: ["success", "failed", "info"],
      default: "info",
      index: true,
    },
    eventType: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    message: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

cncEventSchema.index({ createdAt: -1 });

export default mongoose.model("CncEvent", cncEventSchema);
