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

export async function enqueueTask({
  taskType,
  uniqueKey,
  payload,
  priority = 0,
  maxAttempts = 5,
  scheduledFor = null,
}) {
  const now = new Date();

  const existing = await PopbillQueue.findOne({ uniqueKey }).lean();
  if (existing) {
    if (existing.status === "COMPLETED") {
      return {
        enqueued: false,
        reason: "already_completed",
        taskId: existing._id,
      };
    }
    if (existing.status === "PENDING" || existing.status === "PROCESSING") {
      return {
        enqueued: false,
        reason: "already_pending",
        taskId: existing._id,
      };
    }
  }

  const task = await PopbillQueue.findOneAndUpdate(
    { uniqueKey },
    {
      $setOnInsert: {
        taskType,
        uniqueKey,
        payload,
        priority,
        maxAttempts,
        scheduledFor: scheduledFor || now,
        status: "PENDING",
        createdAt: now,
      },
    },
    { upsert: true, new: true }
  );

  return { enqueued: true, taskId: task._id };
}

export async function enqueueTaxInvoiceIssue({
  draftId,
  corpNum,
  priority = 10,
}) {
  const maxAttempts = 5;
  return enqueueTask({
    taskType: "TAX_INVOICE_ISSUE",
    uniqueKey: `tax_invoice_issue:${draftId}`,
    payload: { draftId, corpNum },
    priority,
    maxAttempts,
  });
}

export async function enqueueTaxInvoiceCancel({
  draftId,
  corpNum,
  mgtKey,
  priority = 10,
}) {
  const maxAttempts = 3;
  return enqueueTask({
    taskType: "TAX_INVOICE_CANCEL",
    uniqueKey: `tax_invoice_cancel:${draftId}`,
    payload: { draftId, corpNum, mgtKey },
    priority,
    maxAttempts,
  });
}

export async function enqueueBankWebhook({
  transactionId,
  payload,
  priority = 5,
}) {
  throw new Error("BANK_WEBHOOK은 웹 백엔드에서 직접 처리합니다.");
}

export async function enqueueNotificationKakao({
  receiptKey,
  payload,
  priority = 0,
}) {
  const maxAttempts = 3;
  return enqueueTask({
    taskType: "NOTIFICATION_KAKAO",
    uniqueKey: `notification_kakao:${receiptKey}`,
    payload,
    priority,
    maxAttempts,
  });
}

export async function enqueueNotificationSMS({
  receiptKey,
  payload,
  priority = 0,
}) {
  const maxAttempts = 3;
  return enqueueTask({
    taskType: "NOTIFICATION_SMS",
    uniqueKey: `notification_sms:${receiptKey}`,
    payload,
    priority,
    maxAttempts,
  });
}

export async function enqueueNotificationLMS({
  receiptKey,
  payload,
  priority = 0,
}) {
  const maxAttempts = 3;
  return enqueueTask({
    taskType: "NOTIFICATION_LMS",
    uniqueKey: `notification_lms:${receiptKey}`,
    payload,
    priority,
    maxAttempts,
  });
}

export async function enqueueEasyFinBankRequest({
  bankCode,
  accountNumber,
  startDate,
  endDate,
  priority = 5,
}) {
  // Unique key includes timestamp to allow multiple requests
  const uniqueKey = `easyfin_request:${bankCode}:${accountNumber}:${Date.now()}`;
  const maxAttempts = 5;
  return enqueueTask({
    taskType: "EASYFIN_BANK_REQUEST",
    uniqueKey,
    payload: { bankCode, accountNumber, startDate, endDate },
    priority,
    maxAttempts,
  });
}

export async function enqueueEasyFinBankCheck({
  jobID,
  bankCode,
  accountNumber,
  priority = 5,
  scheduledFor,
}) {
  const maxAttempts = 20; // 수집 완료까지 여러 번 시도
  return enqueueTask({
    taskType: "EASYFIN_BANK_CHECK",
    uniqueKey: `easyfin_check:${jobID}:${Date.now()}`, // 체크는 여러 번 수행될 수 있으므로 uniqueKey에 시간 포함
    payload: { jobID, bankCode, accountNumber },
    priority,
    maxAttempts,
    scheduledFor,
  });
}
