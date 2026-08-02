// related files:
// - web/backend/rules.md
// - web/backend/socket.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/credits/hooks/useAdminCreditPage.ts
import BusinessAnchor from "../models/businessAnchor.model.js";
import { emitAppEventToRoles } from "../socket.js";

export async function emitCreditBalanceUpdatedToBusiness({
  businessAnchorId,
  businessId,
  balanceDelta,
  reason,
  refId,
}) {
  const anchorId = String(businessAnchorId || "").trim();
  const id = String(businessId || "").trim();
  if (!anchorId && !id) return;

  const delta = Number(balanceDelta || 0);
  if (!Number.isFinite(delta) || delta === 0) return;

  const business = anchorId
    ? await BusinessAnchor.findById(anchorId)
        .select({ _id: 1 })
        .lean()
        .catch(() => null)
    : await BusinessAnchor.findById(id)
        .select({ _id: 1 })
        .lean()
        .catch(() => null);
  if (!business) return;

  const resolvedBusinessAnchorId = String(business._id || "").trim();
  if (!resolvedBusinessAnchorId) return;

  const payload = {
    businessAnchorId: resolvedBusinessAnchorId,
    balanceDelta: delta,
    reason: String(reason || "").trim() || null,
    refId: refId ? String(refId) : null,
  };

  // 실시간 발행 SSOT: 대상 role 전체 fan-out emit
  // 수신측은 현재 열려 있는 페이지에서만 이벤트를 반영한다.
  emitAppEventToRoles(["requestor", "admin"], "credit:balance-updated", payload);
}
