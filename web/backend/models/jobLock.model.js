// related files:
// - web/backend/rules.md
// - web/backend/utils/distributedJobLock.js
// - web/backend/services/reviewApprovalQueue.service.js
// - web/backend/controllers/requests/shipping.TrackingPoller.js
// - web/backend/jobs/dummyCncWorker.js
// - web/backend/jobs/dailyReferralSnapshotWorker.js
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

const JobLock =
  mongoose.models.JobLock || mongoose.model("JobLock", jobLockSchema);

export default JobLock;
