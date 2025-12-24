import mongoose from "../mongoose.js";

const jobLockSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    lockedUntil: { type: Date, default: null, index: true },
    owner: { type: String, default: "" },
    lastLockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("JobLock", jobLockSchema);
