import os from "os";
import crypto from "crypto";
import JobLock from "../models/jobLock.model.js";

function buildDefaultOwnerId() {
  const host = os.hostname();
  const pid = process.pid;
  const rand = crypto.randomBytes(4).toString("hex");
  return `${host}:${pid}:${rand}`;
}

async function tryAcquireLock({ name, ownerId, ttlMs }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  // 1) 만료된 락을 원자적으로 인수
  const takeover = await JobLock.updateOne(
    { name, expiresAt: { $lte: now } },
    {
      $set: {
        ownerId,
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt,
      },
    }
  );
  if (takeover.modifiedCount === 1) {
    return true;
  }

  // 2) 락이 없다면 생성
  try {
    await JobLock.create({
      name,
      ownerId,
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt,
    });
    return true;
  } catch (e) {
    // 누군가 이미 생성/보유 중
    if (e && (e.code === 11000 || e.code === 11001)) {
      return false;
    }
    throw e;
  }
}

async function heartbeat({ name, ownerId, ttlMs }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const res = await JobLock.updateOne(
    { name, ownerId },
    { $set: { heartbeatAt: now, expiresAt } }
  );
  return res.modifiedCount === 1;
}

export async function waitForJobLockLeadership({
  name,
  ttlMs = 60_000,
  heartbeatMs = 20_000,
  retryMs = 5_000,
  ownerId = process.env.WORKER_INSTANCE_ID || buildDefaultOwnerId(),
  onLeadershipGained,
  onLeadershipLost,
}) {
  if (!name) throw new Error("JobLock name is required");

  while (true) {
    const ok = await tryAcquireLock({ name, ownerId, ttlMs }).catch((e) => {
      console.error(`[jobLock] acquire error name=${name}`, e);
      return false;
    });

    if (!ok) {
      console.log(
        `[jobLock] not leader. retrying in ${retryMs}ms (name=${name})`
      );
      await new Promise((r) => setTimeout(r, retryMs));
      continue;
    }

    console.log(`[jobLock] leadership acquired name=${name} owner=${ownerId}`);
    if (typeof onLeadershipGained === "function") {
      await onLeadershipGained();
    }

    const timer = setInterval(async () => {
      const alive = await heartbeat({ name, ownerId, ttlMs }).catch((e) => {
        console.error(`[jobLock] heartbeat error name=${name}`, e);
        return false;
      });
      if (!alive) {
        clearInterval(timer);
        console.error(
          `[jobLock] leadership lost name=${name} owner=${ownerId}`
        );
        if (typeof onLeadershipLost === "function") {
          try {
            await onLeadershipLost();
          } catch (e) {
            console.error("[jobLock] onLeadershipLost error", e);
          }
        }
        process.exit(1);
      }
    }, heartbeatMs);

    return {
      name,
      ownerId,
      stop: async () => {
        clearInterval(timer);
        await JobLock.deleteOne({ name, ownerId }).catch(() => {});
      },
    };
  }
}
