// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
const pendingFilled = new Set<string>();
const pendingNc = new Set<string>();

const normalizeRequestId = (requestId: unknown) =>
  String(requestId || "").trim();

export function markFilledStlRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  if (id) pendingFilled.add(id);
}

export function markNcRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  if (id) pendingNc.add(id);
}

export function consumeFilledStlRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  if (!id || !pendingFilled.has(id)) return false;
  pendingFilled.delete(id);
  return true;
}

export function consumeNcRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  if (!id || !pendingNc.has(id)) return false;
  pendingNc.delete(id);
  return true;
}

