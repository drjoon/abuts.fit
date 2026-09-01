// change-log:
// - 2026-09-02: packing manufacturerStage SSOT는 세척.패킹만(레거시 세척.포장/packing/cleaning 제거).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/requests/AdminRequestMonitoring.tsx
export const normalizeStageValue = (manufacturerStage?: string): string => {
  const stage = String(manufacturerStage || "").trim();
  const lower = stage.toLowerCase();

  // 빈값·레거시(의뢰/request)는 request 단계 SSOT(준비)로 승격
  if (!stage || stage === "준비" || stage === "의뢰" || lower === "request") {
    return "request";
  }

  if (stage === "취소" || lower === "cancel") return "cancel";

  if (
    ["tracking", "추적관리", "완료", "배송완료"].includes(stage) ||
    lower === "tracking"
  ) {
    return "tracking";
  }
  if (
    ["shipping", "포장.발송", "배송대기", "배송중"].includes(stage) ||
    lower === "shipping"
  ) {
    return "shipping";
  }
  if (stage === "세척.패킹") {
    return "packing";
  }
  if (["machining", "가공"].includes(stage) || lower === "machining") {
    return "machining";
  }
  if (["cam", "CAM"].includes(stage) || lower === "cam") {
    // 작업 공정 변경: CAM 표시는 제거하고 가공 단계로 정규화한다.
    return "machining";
  }
  throw new Error("Invalid stage");
};

export const normalizeStageLabel = (manufacturerStage?: string): string => {
  const s = normalizeStageValue(manufacturerStage);
  if (s === "request") return "준비";

  if (s === "machining") return "가공";
  if (s === "packing") return "세척.패킹";
  if (s === "shipping") return "포장.발송";
  if (s === "tracking") return "추적관리";
  if (s === "cancel") return "취소";
  throw new Error("Invalid stage");
};

export const normalizeStageLabelSafe = (manufacturerStage?: string): string => {
  try {
    return normalizeStageLabel(manufacturerStage);
  } catch {
    return String(manufacturerStage || "").trim();
  }
};

/** 관리자 모니터링·집계용: 알 수 없는 값도 request 단계 SSOT(준비)로 승격 */
export const normalizeMonitoringStageLabel = (
  manufacturerStage?: string,
): string => {
  try {
    return normalizeStageLabel(manufacturerStage);
  } catch {
    return "준비";
  }
};

export const getMonitoringStageLabel = (requestLike: unknown): string => {
  const m =
    requestLike && typeof requestLike === "object"
      ? (requestLike as Record<string, unknown>)["manufacturerStage"]
      : undefined;
  return normalizeMonitoringStageLabel(
    typeof m === "string" ? m : undefined,
  );
};

// Helper for generic request objects (like from APIs)
export const getNormalizedStage = (requestLike: unknown): string => {
  const m = requestLike && typeof requestLike === "object"
    ? (requestLike as Record<string, unknown>)["manufacturerStage"]
    : undefined;
  return normalizeStageValue(typeof m === "string" ? m : undefined);
};

export const getNormalizedStageLabel = (requestLike: unknown): string => {
  const m = requestLike && typeof requestLike === "object"
    ? (requestLike as Record<string, unknown>)["manufacturerStage"]
    : undefined;
  return normalizeStageLabel(typeof m === "string" ? m : undefined);
};

export const getNormalizedStageLabelSafe = (requestLike: unknown): string => {
  const m = requestLike && typeof requestLike === "object"
    ? (requestLike as Record<string, unknown>)["manufacturerStage"]
    : undefined;
  return normalizeStageLabelSafe(typeof m === "string" ? m : undefined);
};

const STAGE_ORDER_MAP: Record<string, number> = {
  request: 0,

  준비: 0,
  cam: 1,
  CAM: 1,
  machining: 1,
  가공: 1,
  packing: 2,
  "세척.패킹": 2,
  shipping: 3,
  "포장.발송": 3,
  tracking: 4,
  추적관리: 4,
};

export const getNormalizedStageOrder = (requestLike: unknown): number => {
  const m = requestLike && typeof requestLike === "object"
    ? (requestLike as Record<string, unknown>)["manufacturerStage"]
    : undefined;
  const stage = String(typeof m === "string" ? m : "").trim();
  const normalized = getNormalizedStage(requestLike);
  return STAGE_ORDER_MAP[stage] ?? STAGE_ORDER_MAP[normalized] ?? 0;
};
