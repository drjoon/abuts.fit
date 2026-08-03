// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
export const normalizeStageValue = (manufacturerStage?: string): string => {
  const stage = String(manufacturerStage || "").trim();

  if (stage === "취소") return "cancel";

  if (["tracking", "추적관리"].includes(stage)) {
    return "tracking";
  }
  if (["shipping", "포장.발송"].includes(stage)) {
    return "shipping";
  }
  if (["packing", "세척.패킹"].includes(stage)) {
    return "packing";
  }
  if (["machining", "가공"].includes(stage)) {
    return "machining";
  }
  if (["cam", "CAM"].includes(stage)) {
    // 작업 공정 변경: CAM 표시는 제거하고 가공 단계로 정규화한다.
    return "machining";
  }
  if (["준비"].includes(stage)) {
    return "request";
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
