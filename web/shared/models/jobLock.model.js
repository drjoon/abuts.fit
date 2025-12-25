import mongoose from "../mongoose.js";

const jobLockSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    lockUntil: { type: Date, default: null, index: true },
    lockOwner: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("JobLock", jobLockSchema);
