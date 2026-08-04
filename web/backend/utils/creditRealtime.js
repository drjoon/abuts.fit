// related files:
// - web/backend/rules.md
// - web/backend/socket.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/credits/hooks/useAdminCreditPage.ts
// - web/frontend/src/shared/realtime/creditBalanceEvent.ts
// - web/backend/controllers/requests/common.requests.controller.js
import BusinessAnchor from "../models/businessAnchor.model.js";
import { emitAppEventToRoles } from "../socket.js";

async function resolveBusinessAnchorId({ businessAnchorId, businessId }) {
  const anchorId = String(businessAnchorId || "").trim();
  if (anchorId) {
    // businessAnchorId가 직접 전달된 경우 우선 SSOT로 사용한다.
    return anchorId;
  }

  const id = String(businessId || "").trim();
  if (!id) return "";

  const business = await BusinessAnchor.findById(id)
    .select({ _id: 1 })
    .lean()
    .catch(() => null);

  return String(business?._id || "").trim();
}

export async function emitCreditBalanceUpdatedToBusiness({
  businessAnchorId,
  businessId,
  balanceDelta,
  reason,
  refId,
  forceEmit = false,
}) {
  const delta = Number(balanceDelta || 0);
  // forceEmit: 취소처럼 delta=0이어도 수신측 silent refetch를 유도할 때 사용
  if (!forceEmit && (!Number.isFinite(delta) || delta === 0)) return;

  const resolvedBusinessAnchorId = await resolveBusinessAnchorId({
    businessAnchorId,
    businessId,
  });
  if (!resolvedBusinessAnchorId) return;

  const payload = {
    businessAnchorId: resolvedBusinessAnchorId,
    balanceDelta: Number.isFinite(delta) ? delta : 0,
    reason: String(reason || "").trim() || null,
    refId: refId ? String(refId) : null,
    emittedAt: new Date().toISOString(),
  };

  // 실시간 발행 SSOT: 대상 role 전체 fan-out emit
  // 수신측은 현재 열려 있는 페이지에서만 이벤트를 반영한다.
  emitAppEventToRoles(["requestor", "admin"], "credit:balance-updated", payload);
}
