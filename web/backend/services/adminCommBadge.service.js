// related files:
// - web/backend/controllers/admin/adminCommBadges.controller.js
// - web/backend/socket.js
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// change-log:
// - 2026-09-18: member/finance/tax 액션대기 절대 count emit · 메일 delta 유지.
// - 2026-09-18: 관리자 채널(메일·채팅 등) unread 배지 소켓 emit 헬퍼.
import User from "../models/user.model.js";
import ChargeOrder from "../models/chargeOrder.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
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

/**
 * 절대값으로 배지 설정 (액션 큐용).
 * @param {string} key
 * @param {number} count
 */
export function emitAdminCommBadgeCount(key, count) {
  if (!key) return;
  const n = Math.max(0, Number(count) || 0);
  emitAppEventToRoles(["admin"], "comm:badge-update", {
    key,
    count: n,
  });
}

/** 수신함 미읽음 메일 배지 (±N) — 전 관리자 공유 inbox */
export function emitMailUnreadBadge(delta) {
  emitAdminCommBadgeToRoles("mail", delta);
}

/** 승인 대기 사용자: approvedAt 없음 · 삭제되지 않음 */
export const MEMBER_PENDING_FILTER = {
  approvedAt: null,
  deletedAt: null,
};

/** 크레딧 충전 관리자 승인 대기 (UI canAct 와 동일) */
export const FINANCE_CHARGE_PENDING_FILTER = {
  adminApprovalStatus: "PENDING",
  status: { $nin: ["CANCELED", "EXPIRED"] },
};

/** 세금계산서 승인 대기 */
export const TAX_PENDING_FILTER = {
  status: "PENDING_APPROVAL",
  $or: [{ kind: { $exists: false } }, { kind: "NORMAL" }],
};

export async function countMemberPending() {
  return User.countDocuments(MEMBER_PENDING_FILTER);
}

export async function countFinanceChargePending() {
  return ChargeOrder.countDocuments(FINANCE_CHARGE_PENDING_FILTER);
}

export async function countTaxPending() {
  return TaxInvoiceDraft.countDocuments(TAX_PENDING_FILTER);
}

export async function emitMemberPendingBadge() {
  const count = await countMemberPending();
  emitAdminCommBadgeCount("member", count);
  return count;
}

export async function emitFinancePendingBadge() {
  const count = await countFinanceChargePending();
  emitAdminCommBadgeCount("finance", count);
  return count;
}

export async function emitTaxPendingBadge() {
  const count = await countTaxPending();
  emitAdminCommBadgeCount("tax", count);
  return count;
}

export function scheduleMemberPendingBadgeEmit() {
  void emitMemberPendingBadge().catch((err) => {
    console.error("[adminCommBadge] member emit failed:", err?.message || err);
  });
}

export function scheduleFinancePendingBadgeEmit() {
  void emitFinancePendingBadge().catch((err) => {
    console.error(
      "[adminCommBadge] finance emit failed:",
      err?.message || err,
    );
  });
}

export function scheduleTaxPendingBadgeEmit() {
  void emitTaxPendingBadge().catch((err) => {
    console.error("[adminCommBadge] tax emit failed:", err?.message || err);
  });
}
