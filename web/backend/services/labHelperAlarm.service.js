// related files:
// - web/backend/socket.js
// - web/backend/modules/labHelper/labHelper.routes.js
// - bg/lab-cad-helper/win/Notify.cs
// change-log:
// - 2026-10-03: 기공소 헬퍼 PC 알람 — 유저별 wait queue. 브라우저 종료 후에도 헬퍼가 장기 폴링.

const MAX_QUEUE = 20;
const DEFAULT_WAIT_MS = 25_000;
const MAX_WAIT_MS = 30_000;

/** @type {Map<string, { queue: object[], waiters: Array<{ resolve: Function, timer: NodeJS.Timeout }> }>} */
const byUser = new Map();

const getBucket = (userId) => {
  const id = String(userId || "").trim();
  if (!id) return null;
  let bucket = byUser.get(id);
  if (!bucket) {
    bucket = { queue: [], waiters: [] };
    byUser.set(id, bucket);
  }
  return bucket;
};

const trimQueue = (bucket) => {
  while (bucket.queue.length > MAX_QUEUE) bucket.queue.shift();
};

const deliver = (bucket, alarm) => {
  const waiter = bucket.waiters.shift();
  if (waiter) {
    clearTimeout(waiter.timer);
    waiter.resolve(alarm);
    return;
  }
  bucket.queue.push(alarm);
  trimQueue(bucket);
};

/**
 * 헬퍼 알람 후보를 유저 큐에 넣는다.
 * @param {string} userId
 * @param {{ type: string, practiceBusinessAnchorId?: string|null, title?: string, body?: string }} alarm
 */
export function enqueueLabHelperAlarm(userId, alarm) {
  const bucket = getBucket(userId);
  if (!bucket) return;
  const type = String(alarm?.type || "").trim();
  if (!type) return;
  const row = {
    type,
    practiceBusinessAnchorId:
      String(alarm?.practiceBusinessAnchorId || "").trim() || null,
    title: String(alarm?.title || "").trim() || "어벗츠",
    body: String(alarm?.body || "").trim() || "새 알림",
    at: new Date().toISOString(),
  };
  deliver(bucket, row);
}

/**
 * 최대 waitMs 동안 알람을 기다린다. 없으면 null.
 * @param {string} userId
 * @param {number} [waitMs]
 * @returns {Promise<object|null>}
 */
export function waitForLabHelperAlarm(userId, waitMs = DEFAULT_WAIT_MS) {
  const bucket = getBucket(userId);
  if (!bucket) return Promise.resolve(null);

  if (bucket.queue.length > 0) {
    return Promise.resolve(bucket.queue.shift());
  }

  const ms = Math.min(
    MAX_WAIT_MS,
    Math.max(1000, Number(waitMs) || DEFAULT_WAIT_MS),
  );

  return new Promise((resolve) => {
    const entry = {
      resolve: (alarm) => {
        resolve(alarm || null);
      },
      timer: setTimeout(() => {
        const idx = bucket.waiters.indexOf(entry);
        if (idx >= 0) bucket.waiters.splice(idx, 1);
        resolve(null);
      }, ms),
    };
    bucket.waiters.push(entry);
  });
}

/** app-event → 헬퍼 알람 후보로 변환. 해당 없으면 null. */
export function labHelperAlarmFromAppEvent(type, data, { recipientUserId } = {}) {
  const evt = String(type || "").trim();
  const payload =
    data && typeof data === "object" ? /** @type {Record<string, unknown>} */ (data) : {};
  const recipient = String(recipientUserId || "").trim();

  if (evt === "practice:transfer-created") {
    const practiceId = String(
      payload.practiceBusinessAnchorId || payload.practiceAnchorId || "",
    ).trim();
    const clinic = String(
      payload.practiceName ||
        payload.clinicName ||
        (payload.practice &&
        typeof payload.practice === "object" &&
        /** @type {any} */ (payload.practice).businessName) ||
        "",
    ).trim();
    const patient = String(payload.patientName || "").trim();
    const bodyParts = [clinic || "치과", patient].filter(Boolean);
    return {
      type: evt,
      practiceBusinessAnchorId: practiceId || null,
      title: "새 기공의뢰",
      body: bodyParts.length ? bodyParts.join(" · ") : "새 기공의뢰가 도착했습니다.",
    };
  }

  if (evt === "chat:message-created") {
    const message =
      payload.message && typeof payload.message === "object"
        ? /** @type {Record<string, unknown>} */ (payload.message)
        : null;
    if (String(message?.messageKind || "").trim() === "system") return null;
    const senderId = String(
      payload.senderId ||
        (message?.sender && typeof message.sender === "object"
          ? /** @type {any} */ (message.sender)._id
          : "") ||
        "",
    ).trim();
    if (senderId && recipient && senderId === recipient) return null;
    const practiceId = String(
      payload.relatedPracticeAnchorId || payload.practiceBusinessAnchorId || "",
    ).trim();
    return {
      type: evt,
      practiceBusinessAnchorId: practiceId || null,
      title: "새 채팅",
      body: "새 메시지가 도착했습니다.",
    };
  }

  return null;
}
