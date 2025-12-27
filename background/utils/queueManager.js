import PopbillQueue from "../models/popbillQueue.model.js";

const LOCK_TTL_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000; // 최대 백오프 30분
const MAX_RETRY_WINDOW_MS = 6 * 60 * 60 * 1000; // 생성 후 6시간 넘으면 재시도 중단

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

export async function enqueueEasyFinBankCheck({
  jobID,
  bankCode,
  accountNumber,
  scheduledFor,
}) {
  return enqueueTask({
    taskType: "EASYFIN_BANK_CHECK",
    uniqueKey: `easyfin_check:${jobID}:${Date.now()}`,
    payload: { jobID, bankCode, accountNumber },
    priority: 5,
    maxAttempts: 20,
    scheduledFor,
  });
}

export async function acquireNextTask({ taskTypes = [], workerId }) {
  const now = new Date();

  const query = {
    status: "PENDING",
    $or: [{ scheduledFor: null }, { scheduledFor: { $lte: now } }],
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
  };

  if (taskTypes.length > 0) {
    query.taskType = { $in: taskTypes };
  }

  const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS);

  const task = await PopbillQueue.findOneAndUpdate(
    query,
    {
      $set: {
        status: "PROCESSING",
        processingStartedAt: now,
        lockedBy: workerId,
        lockedUntil,
        lastAttemptAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    {
      sort: { priority: -1, createdAt: 1 },
      new: true,
    }
  );

  return task;
}

export async function completeTask({ taskId, result = null }) {
  const now = new Date();

  await PopbillQueue.updateOne(
    { _id: taskId },
    {
      $set: {
        status: "COMPLETED",
        completedAt: now,
        result,
        error: null,
        lockedBy: null,
        lockedUntil: null,
      },
    }
  );
}

export async function failTask({ taskId, error, shouldRetry = true }) {
  const now = new Date();
  const task = await PopbillQueue.findById(taskId);

  if (!task) return;

  const errorData = {
    message: error?.message || String(error),
    code: error?.code || "UNKNOWN",
    stack: error?.stack || "",
  };

  const elapsedMs = now - (task.createdAt || now);
  const retryWindowExceeded = elapsedMs > MAX_RETRY_WINDOW_MS;

  if (
    !shouldRetry ||
    task.attemptCount >= task.maxAttempts ||
    retryWindowExceeded
  ) {
    await PopbillQueue.updateOne(
      { _id: taskId },
      {
        $set: {
          status: "FAILED",
          failedAt: now,
          error: errorData,
          lockedBy: null,
          lockedUntil: null,
        },
      }
    );
  } else {
    const retryDelayMs = Math.min(
      MAX_RETRY_DELAY_MS,
      Math.pow(2, task.attemptCount) * 1000
    );
    const scheduledFor = new Date(now.getTime() + retryDelayMs);

    await PopbillQueue.updateOne(
      { _id: taskId },
      {
        $set: {
          status: "PENDING",
          scheduledFor,
          error: errorData,
          lockedBy: null,
          lockedUntil: null,
        },
      }
    );
  }
}

export async function releaseStuckTasks() {
  const now = new Date();

  const result = await PopbillQueue.updateMany(
    {
      status: "PROCESSING",
      lockedUntil: { $lte: now },
    },
    {
      $set: {
        status: "PENDING",
        lockedBy: null,
        lockedUntil: null,
      },
    }
  );

  return { released: result.modifiedCount };
}

export async function getQueueStats() {
  const stats = await PopbillQueue.aggregate([
    {
      $group: {
        _id: { taskType: "$taskType", status: "$status" },
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {};
  for (const s of stats) {
    const taskType = s._id.taskType;
    const status = s._id.status;
    if (!result[taskType]) result[taskType] = {};
    result[taskType][status] = s.count;
  }

  return result;
}
