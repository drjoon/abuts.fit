// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/admin/credits/hooks/useAdminCreditPage.ts
// - web/backend/utils/creditRealtime.js
import type { AppEventMessage } from "@/shared/realtime/socket";

export type CreditBalanceUpdatedPayload = {
  businessAnchorId?: string | null;
  balanceDelta?: number | null;
  reason?: string | null;
  refId?: string | null;
  emittedAt?: string | null;
};

const toPayload = (evt: AppEventMessage): CreditBalanceUpdatedPayload => {
  if (!evt?.data || typeof evt.data !== "object") return {};
  return evt.data as CreditBalanceUpdatedPayload;
};

export const getCreditEventBusinessAnchorId = (evt: AppEventMessage) =>
  String(toPayload(evt)?.businessAnchorId || "").trim();

export const isCreditEventForBusiness = (
  evt: AppEventMessage,
  businessAnchorId: string | null | undefined,
) => {
  const eventBusinessAnchorId = getCreditEventBusinessAnchorId(evt);
  const targetBusinessAnchorId = String(businessAnchorId || "").trim();
  if (!eventBusinessAnchorId || !targetBusinessAnchorId) return false;
  return eventBusinessAnchorId === targetBusinessAnchorId;
};
