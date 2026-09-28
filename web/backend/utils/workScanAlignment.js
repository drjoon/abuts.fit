// 작업 스캔 모델 정렬 메타데이터(production.workScanAlignment)와 기공소 작업 중 표시(production.workScanEditing).
// 업로드 직후 자동 정렬 잡과 AI 디자인 저장이 같은 규칙으로 읽고 쓴다.
// related files:
// - web/backend/services/workScanAutoAlign.service.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/workScanAlignment.ts

export const WORK_SCAN_ALIGN_SOURCES = ["auto", "ai-design"];
/** AI 디자인은 1분마다 표시를 갱신한다. 두 번 놓쳐도 작업 중으로 본다. */
export const WORK_SCAN_EDITING_TTL_MS = 3 * 60 * 1000;

export function workScanFileKeys(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.file?.s3Key || row?.s3Key || "").trim())
    .filter(Boolean);
}

export function sameKeySet(a, b) {
  const left = new Set((Array.isArray(a) ? a : []).map((key) => String(key || "").trim()).filter(Boolean));
  const right = new Set((Array.isArray(b) ? b : []).map((key) => String(key || "").trim()).filter(Boolean));
  if (left.size !== right.size) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}

/** 기록된 정렬이 지금 작업 스캔에 대한 것인지. 작업 스캔이 바뀌면 자동으로 무효다. */
export function currentWorkScanAlignment(production) {
  const p = production && typeof production === "object" ? production : {};
  const alignment = p.workScanAlignment;
  if (!alignment || typeof alignment !== "object") return null;
  const keys = workScanFileKeys(p.labWorkScanFiles);
  if (keys.length === 0 || !sameKeySet(alignment.fileKeys, keys)) return null;
  return alignment;
}

export function toWorkScanAlignmentApi(production) {
  const alignment = currentWorkScanAlignment(production);
  if (!alignment) return null;
  const source = String(alignment.source || "").trim();
  return {
    upper: Boolean(alignment.upper),
    lower: Boolean(alignment.lower),
    source: WORK_SCAN_ALIGN_SOURCES.includes(source) ? source : null,
    alignedAt: alignment.alignedAt ? new Date(alignment.alignedAt).toISOString() : null,
  };
}

export function buildWorkScanAlignment({ upper, lower, source, alignedBy = null, rows, at = new Date() }) {
  return {
    upper: Boolean(upper),
    lower: Boolean(lower),
    source,
    alignedAt: at,
    alignedBy: alignedBy || null,
    fileKeys: workScanFileKeys(rows),
  };
}

/** 기공소가 AI 디자인을 열어 두었는지. */
export function isWorkScanEditingActive(production, now = Date.now()) {
  const editing = production?.workScanEditing;
  if (!editing || typeof editing !== "object") return false;
  const at = new Date(editing.at || 0).getTime();
  return Number.isFinite(at) && now - at <= WORK_SCAN_EDITING_TTL_MS;
}
