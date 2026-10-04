// related files:
// - web/backend/socket.js
// - web/backend/services/labHelperAlarmWs.js
// - web/backend/modules/labHelper/labHelper.routes.js
// - bg/lab-cad-helper/win/Notify.cs
// change-log:
// - 2026-10-04: WS 구독자 push 우선 — 신규 헬퍼는 롱폴링 대신 소켓.
// - 2026-10-03: 대기자 없을 때 큐는 짧게만 — 브라우저 활성 중 쌓인 옛 알람 폭주 방지.
// - 2026-10-03: 기공소 헬퍼 PC 알람 — 유저별 wait queue. 브라우저 종료 후에도 헬퍼가 장기 폴링.

import { normalizeRequestorKind } from "../utils/requestorCapabilities.js";

/** 대기자 있을 때 포함 상한 (레거시 롱폴링) */
const MAX_QUEUE = 20;
/** 폴링 공백(수백 ms)용. WS·대기자 없을 때만 짧게 쌓는다. */
const MAX_QUEUE_WITHOUT_WAITER = 2;
const DEFAULT_WAIT_MS = 25_000;
const MAX_WAIT_MS = 30_000;

/**
 * @typedef {{
 *   queue: object[],
 *   waiters: Array<{ resolve: Function, timer: NodeJS.Timeout }>,
 *   sockets: Set<import('ws').WebSocket>,
 * }} LabHelperAlarmBucket
 */

/** @type {Map<string, LabHelperAlarmBucket>} */
const byUser = new Map();

/** FE·wait·WS 공통 — 기공소·치과 PC 헬퍼 알람. */
export function canUseLabHelperAlarm(user) {
  if (!user) return false;
  const role = String(user.role || "").trim();
  if (role === "internalLab") return true;
  if (role === "practice") return true;
  if (role === "requestor") {
    const kind = normalizeRequestorKind(user.requestorKind);
    return kind === "lab" || kind === "practice";
  }
  return false;
}

const getBucket = (userId) => {
  const id = String(userId || "").trim();
  if (!id) return null;
  let bucket = byUser.get(id);
  if (!bucket) {
    bucket = { queue: [], waiters: [], sockets: new Set() };
    byUser.set(id, bucket);
  }
  return bucket;
};

const trimQueue = (bucket) => {
  const hasLive =
    bucket.waiters.length > 0 || (bucket.sockets && bucket.sockets.size > 0);
  const max = hasLive ? MAX_QUEUE : MAX_QUEUE_WITHOUT_WAITER;
  while (bucket.queue.length > max) bucket.queue.shift();
};

const normalizeAlarm = (alarm) => {
  const type = String(alarm?.type || "").trim();
  if (!type) return null;
  return {
    type,
    practiceBusinessAnchorId:
      String(alarm?.practiceBusinessAnchorId || "").trim() || null,
    transferId: String(alarm?.transferId || "").trim() || null,
    title: String(alarm?.title || "").trim() || "어벗츠",
    body: String(alarm?.body || "").trim() || "새 알림",
    at: new Date().toISOString(),
  };
};

const sendSocketJson = (ws, payload) => {
  if (!ws || ws.readyState !== 1) return; // WebSocket.OPEN
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.warn("[labHelperAlarm] ws send failed", err?.message || err);
  }
};

const deliverToWaitersOrQueue = (bucket, alarm) => {
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
 * 헬퍼 알람 후보를 유저 큐/소켓에 넣는다.
 * WS 구독자가 있으면 push, 없으면 레거시 롱폴링 대기/짧은 큐.
 * @param {string} userId
 * @param {{ type: string, practiceBusinessAnchorId?: string|null, transferId?: string|null, title?: string, body?: string }} alarm
 */
export function enqueueLabHelperAlarm(userId, alarm) {
  const bucket = getBucket(userId);
  if (!bucket) return;
  const row = normalizeAlarm(alarm);
  if (!row) return;

  if (bucket.sockets.size > 0) {
    for (const ws of bucket.sockets) {
      sendSocketJson(ws, { type: "alarm", ok: true, alarm: row });
    }
    return;
  }

  deliverToWaitersOrQueue(bucket, row);
}

/**
 * 헬퍼 WS 연결 등록. 큐에 쌓인 알람을 즉시 flush.
 * @param {string} userId
 * @param {import('ws').WebSocket} ws
 */
export function subscribeLabHelperAlarmSocket(userId, ws) {
  const bucket = getBucket(userId);
  if (!bucket || !ws) return;
  bucket.sockets.add(ws);
  while (bucket.queue.length > 0) {
    const alarm = bucket.queue.shift();
    sendSocketJson(ws, { type: "alarm", ok: true, alarm });
  }
}

/**
 * @param {string} userId
 * @param {import('ws').WebSocket} ws
 */
export function unsubscribeLabHelperAlarmSocket(userId, ws) {
  const id = String(userId || "").trim();
  if (!id || !ws) return;
  const bucket = byUser.get(id);
  if (!bucket) return;
  bucket.sockets.delete(ws);
  if (
    bucket.sockets.size === 0 &&
    bucket.waiters.length === 0 &&
    bucket.queue.length === 0
  ) {
    byUser.delete(id);
  }
}

/**
 * 최대 waitMs 동안 알람을 기다린다. 없으면 null. (레거시 헬퍼 롱폴링)
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
      transferId: String(payload.transferId || "").trim() || null,
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
    const snippet = String(message?.content || "").trim();
    return {
      type: evt,
      practiceBusinessAnchorId: practiceId || null,
      transferId: String(payload.transferId || "").trim() || null,
      title: "새 채팅",
      body: snippet ? snippet.slice(0, 80) : "새 메시지가 도착했습니다.",
    };
  }

  return null;
}
