// related files:
// - web/backend/rules.md
// - web/backend/models/jobLock.model.js
// - web/backend/services/reviewApprovalQueue.service.js
// - web/backend/controllers/requests/shipping.TrackingPoller.js
// - web/backend/jobs/dummyCncWorker.js
import JobLock from "../models/jobLock.model.js";

const DEFAULT_LEASE_MS = 120000;
const DEFAULT_HEARTBEAT_MS = 30000;

const toPositiveMs = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1000, Math.floor(parsed));
};

export async function acquireJobLock({
  name,
  ownerId,
  leaseMs = DEFAULT_LEASE_MS,
}) {
  const lockName = String(name || "").trim();
  const lockOwnerId = String(ownerId || "").trim();
  if (!lockName || !lockOwnerId) {
    return { acquired: false, reason: "invalid_input" };
  }

  const lease = toPositiveMs(leaseMs, DEFAULT_LEASE_MS);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lease);

  try {
    const lockDoc = await JobLock.findOneAndUpdate(
      {
        name: lockName,
        $or: [{ expiresAt: { $lte: now } }, { ownerId: lockOwnerId }],
      },
      {
        $set: {
          ownerId: lockOwnerId,
          heartbeatAt: now,
          expiresAt,
        },
        $setOnInsert: {
          name: lockName,
          acquiredAt: now,
        },
      },
      {
        new: true,
        upsert: true,
      },
    ).lean();

    return {
      acquired: Boolean(lockDoc && String(lockDoc.ownerId || "") === lockOwnerId),
      reason: null,
      lock: lockDoc || null,
    };
  } catch (error) {
    // 경쟁 삽입 중복키 에러는 락 미획득으로 처리
    if (Number(error?.code || 0) === 11000) {
      return { acquired: false, reason: "duplicate_race", lock: null };
    }
    throw error;
  }
}

export async function renewJobLock({
  name,
  ownerId,
  leaseMs = DEFAULT_LEASE_MS,
}) {
  const lockName = String(name || "").trim();
  const lockOwnerId = String(ownerId || "").trim();
  if (!lockName || !lockOwnerId) return false;

  const lease = toPositiveMs(leaseMs, DEFAULT_LEASE_MS);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lease);

  const result = await JobLock.updateOne(
    {
      name: lockName,
      ownerId: lockOwnerId,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        heartbeatAt: now,
        expiresAt,
      },
    },
  );

  return Number(result?.modifiedCount || 0) > 0;
}

export async function releaseJobLock({ name, ownerId }) {
  const lockName = String(name || "").trim();
  const lockOwnerId = String(ownerId || "").trim();
  if (!lockName || !lockOwnerId) return false;

  const result = await JobLock.deleteOne({
    name: lockName,
    ownerId: lockOwnerId,
  });

  return Number(result?.deletedCount || 0) > 0;
}

export async function runWithJobLock({
  name,
  ownerId,
  leaseMs = DEFAULT_LEASE_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  task,
  onLockMiss,
}) {
  const acquired = await acquireJobLock({ name, ownerId, leaseMs });
  if (!acquired?.acquired) {
    if (typeof onLockMiss === "function") {
      onLockMiss(acquired?.reason || "not_acquired");
    }
    return { acquired: false, reason: acquired?.reason || "not_acquired" };
  }

  const heartbeatIntervalMs = Math.min(
    Math.max(1000, toPositiveMs(heartbeatMs, DEFAULT_HEARTBEAT_MS)),
    Math.max(1000, Math.floor(toPositiveMs(leaseMs, DEFAULT_LEASE_MS) / 2)),
  );

  let heartbeatTimer = null;
  let lockLost = false;

  const heartbeat = async () => {
    try {
      const ok = await renewJobLock({ name, ownerId, leaseMs });
      if (!ok && !lockLost) {
        lockLost = true;
        console.warn("[DistributedJobLock] lock heartbeat lost", {
          name,
          ownerId,
        });
      }
    } catch (error) {
      if (!lockLost) {
        lockLost = true;
        console.warn("[DistributedJobLock] lock heartbeat failed", {
          name,
          ownerId,
          error: error?.message || String(error),
        });
      }
    }
  };

  heartbeatTimer = setInterval(() => {
    void heartbeat();
  }, heartbeatIntervalMs);
  if (typeof heartbeatTimer?.unref === "function") {
    heartbeatTimer.unref();
  }

  try {
    const result = await task();
    return { acquired: true, result, lockLost };
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    try {
      await releaseJobLock({ name, ownerId });
    } catch {
      // ignore release failure; lock expires by TTL
    }
  }
}
