import mongoose from "mongoose";

const PopbillQueueSchema = new mongoose.Schema(
  {
    taskType: {
      type: String,
      enum: [
        "TAX_INVOICE_ISSUE",
        "TAX_INVOICE_CANCEL",
        "NOTIFICATION_KAKAO",
        "NOTIFICATION_SMS",
        "NOTIFICATION_LMS",
        "EASYFIN_BANK_REQUEST",
        "EASYFIN_BANK_CHECK",
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    uniqueKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
      min: 1,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    error: {
      message: String,
      code: String,
      stack: String,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    scheduledFor: {
      type: Date,
      default: null,
      index: true,
    },
    lockedBy: {
      type: String,
      default: null,
    },
    lockedUntil: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

PopbillQueueSchema.index({ status: 1, priority: -1, createdAt: 1 });
PopbillQueueSchema.index({ status: 1, scheduledFor: 1 });
PopbillQueueSchema.index({ taskType: 1, status: 1 });
PopbillQueueSchema.index({ lockedUntil: 1 });

const PopbillQueue = mongoose.model(
  "PopbillQueue",
  PopbillQueueSchema,
  "PopbillQueue"
);

export default PopbillQueue;
