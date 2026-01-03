import mongoose from "mongoose";

const jobLockSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    ownerId: {
      type: String,
      required: true,
      trim: true,
    },
    acquiredAt: {
      type: Date,
      required: true,
    },
    heartbeatAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

jobLockSchema.index({ name: 1 }, { unique: true });
jobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const JobLock = mongoose.model("JobLock", jobLockSchema);

export default JobLock;
