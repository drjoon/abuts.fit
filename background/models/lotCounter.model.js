import mongoose from "mongoose";

const lotCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, default: "global", index: true },
    seq: { type: Number, required: true, default: -1 },
  },
  { timestamps: true }
);

lotCounterSchema.index({ key: 1 }, { unique: true });

const LotCounter = mongoose.model("LotCounter", lotCounterSchema);

export default LotCounter;
