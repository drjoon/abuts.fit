// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/designClaimRealtime.js
// - web/backend/models/practiceTransfer.model.js
//
// 자동매칭 어벗츠 우선창 소켓: 생성 시 priority labs만 emit → priorityUntil에 나머지 emit.
// 정합성 SSOT는 DB priorityUntil(목록/클레임). 타이머는 UX best-effort.
import PracticeTransfer from "../models/practiceTransfer.model.js";
import {
  isAutoMatchMode,
  isAutoMatchOpenPool,
  normalizeLabAnchorIdList,
} from "./practiceTransferAutoMatchCore.js";

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingTimers = new Map();

const MAX_SCHEDULE_MS = 48 * 60 * 60 * 1000;
const TIMER_REASON = "priority-ended";

function timerKey(transferMongoId) {
  return `${String(transferMongoId || "").trim()}:${TIMER_REASON}`;
}

export function clearAutoMatchPriorityTimers(transferMongoId) {
  const id = String(transferMongoId || "").trim();
  if (!id) return;
  const key = timerKey(id);
  const handle = pendingTimers.get(key);
  if (handle) clearTimeout(handle);
  pendingTimers.delete(key);
}

/**
 * @param {object} args
 * @param {(payload: object, opts: { eligibleLabAnchorIds?: string[] }) => Promise<void>|void} args.emitPoolCreated
 */
export function scheduleAutoMatchPriorityOpen({
  transferMongoId,
  priorityUntil,
  realtimePayload,
  remainingLabAnchorIds,
  emitPoolCreated,
}) {
  const id = String(transferMongoId || "").trim();
  if (!id || typeof emitPoolCreated !== "function") return;

  clearAutoMatchPriorityTimers(id);

  const untilMs = priorityUntil
    ? new Date(priorityUntil).getTime()
    : NaN;
  if (!Number.isFinite(untilMs)) return;

  const delayMs = untilMs - Date.now();
  const labIds = normalizeLabAnchorIdList(remainingLabAnchorIds);
  if (!labIds.length) return;

  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    void Promise.resolve(
      emitPoolCreated(realtimePayload, { eligibleLabAnchorIds: labIds }),
    ).catch((err) => {
      console.warn(
        "[practiceTransferAutoMatchRealtime] immediate open emit failed",
        err?.message || err,
      );
    });
    return;
  }

  if (delayMs > MAX_SCHEDULE_MS) return;

  const handle = setTimeout(async () => {
    pendingTimers.delete(timerKey(id));
    try {
      const doc = await PracticeTransfer.findById(id)
        .select({
          _id: 1,
          matchingMode: 1,
          status: 1,
          targetLabAnchorId: 1,
          autoMatch: 1,
        })
        .lean();
      if (!doc || !isAutoMatchMode(doc)) return;
      if (!isAutoMatchOpenPool(doc)) return;

      await emitPoolCreated(realtimePayload, {
        eligibleLabAnchorIds: labIds,
      });
    } catch (error) {
      console.warn("[practiceTransferAutoMatchRealtime] scheduled emit failed", {
        transferMongoId: id,
        error: error?.message,
      });
    }
  }, delayMs);

  pendingTimers.set(timerKey(id), handle);
}

/**
 * 생성 직후: priority labs만 emit + 나머지 예약.
 * 우선창 없으면 전원 emit.
 */
export async function notifyAutoMatchPoolCreatedWithPriority({
  transfer,
  realtimePayload,
  eligibleLabAnchorIds,
  emitPoolCreated,
}) {
  if (typeof emitPoolCreated !== "function") return;

  const transferMongoId = String(transfer?._id || "").trim();
  const eligible = normalizeLabAnchorIdList(
    eligibleLabAnchorIds ?? transfer?.autoMatch?.eligibleLabAnchorIds,
  );
  const priority = normalizeLabAnchorIdList(
    transfer?.autoMatch?.priorityLabAnchorIds,
  );
  const priorityUntil = transfer?.autoMatch?.priorityUntil || null;
  const priorityActive =
    Boolean(priority.length) &&
    Boolean(priorityUntil) &&
    new Date(priorityUntil).getTime() > Date.now();

  if (!priorityActive) {
    clearAutoMatchPriorityTimers(transferMongoId);
    await emitPoolCreated(realtimePayload, {
      eligibleLabAnchorIds: eligible,
    });
    return;
  }

  const prioritySet = new Set(priority);
  const remaining = eligible.filter((id) => !prioritySet.has(id));

  await emitPoolCreated(realtimePayload, {
    eligibleLabAnchorIds: priority,
  });

  scheduleAutoMatchPriorityOpen({
    transferMongoId,
    priorityUntil,
    realtimePayload,
    remainingLabAnchorIds: remaining,
    emitPoolCreated,
  });
}

/**
 * 우선창 조기 종료 후 타 기공소 emit (거부·작업취소 재공개).
 */
export async function notifyAutoMatchPriorityOpenedEarly({
  transfer,
  realtimePayload,
  excludeLabAnchorIds = [],
  emitPoolCreated,
}) {
  if (typeof emitPoolCreated !== "function") return;

  const transferMongoId = String(transfer?._id || "").trim();
  clearAutoMatchPriorityTimers(transferMongoId);

  const eligible = normalizeLabAnchorIdList(
    transfer?.autoMatch?.eligibleLabAnchorIds,
  );
  const declined = new Set(
    normalizeLabAnchorIdList(transfer?.autoMatch?.declinedLabAnchorIds),
  );
  const excluded = new Set([
    ...declined,
    ...normalizeLabAnchorIdList(excludeLabAnchorIds),
  ]);
  const remaining = eligible.filter((id) => !excluded.has(id));
  if (!remaining.length) return;

  await emitPoolCreated(realtimePayload, {
    eligibleLabAnchorIds: remaining,
  });
}
