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

export function isNcRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  return Boolean(id && pendingNc.has(id));
}

/** Next Up / 예약 관리 「CAM 생성 중」블러 SSOT */
export function isCamGenerationOverlayPending(opts: {
  requestId?: unknown;
  hasNc?: boolean;
  ncPreloadStatus?: unknown;
}) {
  if (opts?.hasNc === true) return false;
  const rid = normalizeRequestId(opts?.requestId);
  if (rid && pendingNc.has(rid)) return true;
  const status = String(opts?.ncPreloadStatus || "")
    .trim()
    .toUpperCase();
  if (status === "GENERATING") return true;
  // 생성 중단·실패 후에는 NC 없어도 블러를 띄우지 않는다.
  if (status === "CANCELLED" || status === "FAILED") return false;
  // NC 없음(재생성 중·크래시 stuck 포함)
  return opts?.hasNc === false;
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

