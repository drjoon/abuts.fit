// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
// change-log:
// - 2026-09-09: reconcileFilledStlRegenerationPending — Rhino 타 서버 완료 후 폴링 정지.
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

export function hasFilledStlRegenerationPending(requestId?: unknown) {
  if (requestId != null) {
    const id = normalizeRequestId(requestId);
    return Boolean(id && pendingFilled.has(id));
  }
  return pendingFilled.size > 0;
}

export function isNcRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  return Boolean(id && pendingNc.has(id));
}

/**
 * 목록 refetch 후: filled 수신·단계 이탈 건은 pending에서 제거.
 * (Rhino가 다른 BACKEND_BASE로 완료 통지해도 폴링이 멈추도록)
 */
export function reconcileFilledStlRegenerationPending(
  requests: Array<{
    requestId?: unknown;
    manufacturerStage?: unknown;
    caseInfos?: { stlFile?: { s3Key?: unknown }; camFile?: { s3Key?: unknown } };
  }>,
) {
  if (pendingFilled.size === 0) return;
  const byId = new Map<string, (typeof requests)[number]>();
  for (const req of requests || []) {
    const id = normalizeRequestId(req?.requestId);
    if (id) byId.set(id, req);
  }
  for (const id of [...pendingFilled]) {
    const req = byId.get(id);
    if (!req) {
      pendingFilled.delete(id);
      continue;
    }
    if (String(req?.manufacturerStage || "").trim() === "취소") {
      pendingFilled.delete(id);
      continue;
    }
    const filledKey = String(
      req?.caseInfos?.stlFile?.s3Key || req?.caseInfos?.camFile?.s3Key || "",
    ).trim();
    if (filledKey) pendingFilled.delete(id);
  }
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

