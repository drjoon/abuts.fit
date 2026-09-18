// related files:
// - web/backend/controllers/admin/adminCommBadges.controller.js
// - web/backend/socket.js
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// change-log:
// - 2026-09-18: 관리자 채널(메일·채팅 등) unread 배지 소켓 emit 헬퍼.
import { emitAppEventToRoles, emitAppEventToUser } from "../socket.js";

/**
 * @param {string} key
 * @param {number} delta
 */
export function emitAdminCommBadgeToRoles(key, delta) {
  const n = Number(delta);
  if (!key || !Number.isFinite(n) || n === 0) return;
  emitAppEventToRoles(["admin"], "comm:badge-update", {
    key,
    delta: n,
  });
}

/**
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @param {string} key
 * @param {number} delta
 */
export function emitAdminCommBadgeToUser(userId, key, delta) {
  const id = String(userId || "").trim();
  const n = Number(delta);
  if (!id || !key || !Number.isFinite(n) || n === 0) return;
  emitAppEventToUser(id, "comm:badge-update", {
    key,
    delta: n,
  });
}

/** 수신함 미읽음 메일 배지 (±N) — 전 관리자 공유 inbox */
export function emitMailUnreadBadge(delta) {
  emitAdminCommBadgeToRoles("mail", delta);
}
