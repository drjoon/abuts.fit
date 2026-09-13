// change-log:
// - 2026-09-13: 관리자 스토어 사이드바 액션 대기 배지(PENDING·MATCHED·READY·SHIPPED).
// related files:
// - web/backend/controllers/admin/adminStore.controller.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/system/AdminStorePage.tsx
import StoreOrder from "../models/storeOrder.model.js";
import { emitAppEventToRoles } from "../socket.js";

/** AdminStorePage `orderNeedsAction` 과 동일. */
export const STORE_ADMIN_ACTION_FILTER = {
  $or: [
    { status: { $in: ["PENDING", "MATCHED"] } },
    {
      status: "PAID",
      fulfillmentStatus: { $in: ["READY", "SHIPPED"] },
    },
  ],
};

export async function countStoreOrdersNeedingAdminAction() {
  return StoreOrder.countDocuments(STORE_ADMIN_ACTION_FILTER);
}

/**
 * 관리자 사이드「스토어」배지 갱신. 응답 경로 밖 fire-and-forget.
 */
export async function emitStoreAdminActionBadge() {
  const actionCount = await countStoreOrdersNeedingAdminAction();
  emitAppEventToRoles(["admin"], "store:action-count", {
    actionCount: Math.max(0, Number(actionCount) || 0),
  });
  return actionCount;
}

export function scheduleStoreAdminActionBadgeEmit() {
  void emitStoreAdminActionBadge().catch((err) => {
    console.error("[storeAdminBadge] emit failed:", err?.message || err);
  });
}
