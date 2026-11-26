// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useMachiningBoard.ts
// change-log:
// - 2026-11-26: NC pending도 타임스탬프·reconcile — 완료 소켓 유실 시 「CAM 생성중」고착 방지.
// - 2026-10-24: filled 재생성 pending은 12초가 지나면 오버레이·폴링에서 뺀다.
// - 2026-09-09: reconcileFilledStlRegenerationPending — Rhino 타 서버 완료 후 폴링 정지.
export const STL_WORK_PENDING_TIMEOUT_MS = 12_000;
/** in-memory NC pending이 오버레이만으로 남기지 않는 상한(실제 CAM은 수분 가능 → DB status/폴링이 SSOT) */
export const NC_WORK_PENDING_TIMEOUT_MS = 15 * 60_000;

const pendingFilled = new Map<string, number>();
const pendingNc = new Map<string, number>();

function pruneFilledPending(now = Date.now()) {
  for (const [id, started] of pendingFilled) {
    if (now - started > STL_WORK_PENDING_TIMEOUT_MS) pendingFilled.delete(id);
  }
}

function pruneNcPending(now = Date.now()) {
  for (const [id, started] of pendingNc) {
    if (now - started > NC_WORK_PENDING_TIMEOUT_MS) pendingNc.delete(id);
  }
}

const normalizeRequestId = (requestId: unknown) =>
  String(requestId || "").trim();

export function markFilledStlRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  if (id) pendingFilled.set(id, Date.now());
}

export function markNcRegenerationPending(requestId: unknown) {
  const id = normalizeRequestId(requestId);
  if (id) pendingNc.set(id, Date.now());
}

export function hasFilledStlRegenerationPending(requestId?: unknown, now = Date.now()) {
  pruneFilledPending(now);
  if (requestId != null) {
    const id = normalizeRequestId(requestId);
    return Boolean(id && pendingFilled.has(id));
  }
  return pendingFilled.size > 0;
}

export function isNcRegenerationPending(requestId: unknown, now = Date.now()) {
  pruneNcPending(now);
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
  pruneFilledPending();
  if (pendingFilled.size === 0) return;
  const byId = new Map<string, (typeof requests)[number]>();
  for (const req of requests || []) {
    const id = normalizeRequestId(req?.requestId);
    if (id) byId.set(id, req);
  }
  for (const id of [...pendingFilled.keys()]) {
    const req = byId.get(id);
    if (!req) {
      pendingFilled.delete(id);
      continue;
    }
    if (String(req?.manufacturerStage || "").trim() === "취소") {
      pendingFilled.delete(id);
      continue;
    }
    const preload = String(
      (req as { productionSchedule?: { stlPreload?: { status?: unknown } } })
        ?.productionSchedule?.stlPreload?.status || "",
    )
      .trim()
      .toUpperCase();
    if (preload === "FAILED" || preload === "CANCELLED") {
      pendingFilled.delete(id);
      continue;
    }
    const filledKey = String(
      req?.caseInfos?.stlFile?.s3Key || req?.caseInfos?.camFile?.s3Key || "",
    ).trim();
    if (filledKey) pendingFilled.delete(id);
  }
}

type NcReconcileRow = {
  requestId?: unknown;
  ncFile?: { s3Key?: unknown } | null;
  caseInfos?: { ncFile?: { s3Key?: unknown } | null };
  ncPreload?: { status?: unknown } | null;
  productionSchedule?: { ncPreload?: { status?: unknown } | null };
};

function resolveNcS3Key(row: NcReconcileRow) {
  return String(
    row?.ncFile?.s3Key || row?.caseInfos?.ncFile?.s3Key || "",
  ).trim();
}

function resolveNcPreloadStatus(row: NcReconcileRow) {
  return String(
    row?.ncPreload?.status ||
      row?.productionSchedule?.ncPreload?.status ||
      "",
  )
    .trim()
    .toUpperCase();
}

/**
 * 큐/목록 refetch 후: NC 수신·중단·실패 건은 in-memory pending에서 제거.
 * (register-file 성공 후 stage-changed 소켓만 빠졌을 때 폴링이 멈추도록)
 */
export function reconcileNcRegenerationPending(rows: NcReconcileRow[]) {
  pruneNcPending();
  if (pendingNc.size === 0) return;
  const byId = new Map<string, NcReconcileRow>();
  for (const row of rows || []) {
    const id = normalizeRequestId(row?.requestId);
    if (id) byId.set(id, row);
  }
  for (const id of [...pendingNc.keys()]) {
    const row = byId.get(id);
    if (!row) {
      pendingNc.delete(id);
      continue;
    }
    const status = resolveNcPreloadStatus(row);
    if (status === "FAILED" || status === "CANCELLED") {
      pendingNc.delete(id);
      continue;
    }
    if (resolveNcS3Key(row)) pendingNc.delete(id);
  }
}

/** Next Up / 예약 관리 「작업중」오버레이 표시 SSOT (블러 없음·옅은 틴트) */
export function isCamGenerationOverlayPending(opts: {
  requestId?: unknown;
  hasNc?: boolean;
  ncPreloadStatus?: unknown;
}) {
  // NC가 있으면 완료 — DB GENERATING 잔류·in-memory pending보다 우선
  if (opts?.hasNc === true) return false;
  const rid = normalizeRequestId(opts?.requestId);
  if (rid && isNcRegenerationPending(rid)) return true;
  const status = String(opts?.ncPreloadStatus || "")
    .trim()
    .toUpperCase();
  if (status === "GENERATING" || status === "UPLOADING") return true;
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
