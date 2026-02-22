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
    return "cam";
  }
  if (["request", "의뢰"].includes(stage)) {
    return "request";
  }
  throw new Error("Invalid stage");
};

export const normalizeStageLabel = (manufacturerStage?: string): string => {
  const s = normalizeStageValue(manufacturerStage);
  if (s === "request") return "의뢰";
  if (s === "cam") return "CAM";
  if (s === "machining") return "가공";
  if (s === "packing") return "세척.패킹";
  if (s === "shipping") return "포장.발송";
  if (s === "tracking") return "추적관리";
  if (s === "cancel") return "취소";
  throw new Error("Invalid stage");
};

// Helper for generic request objects (like from APIs)
export const getNormalizedStage = (requestLike: any): string => {
  return normalizeStageValue(requestLike?.manufacturerStage);
};

export const getNormalizedStageLabel = (requestLike: any): string => {
  return normalizeStageLabel(requestLike?.manufacturerStage);
};

const STAGE_ORDER_MAP: Record<string, number> = {
  request: 0,
  의뢰: 0,
  cam: 1,
  CAM: 1,
  machining: 2,
  가공: 2,
  packing: 3,
  "세척.패킹": 3,
  shipping: 3,
  "포장.발송": 3,
  tracking: 4,
  추적관리: 4,
};

export const getNormalizedStageOrder = (requestLike: any): number => {
  const stage = String(requestLike?.manufacturerStage || "").trim();
  const normalized = getNormalizedStage(requestLike);
  return STAGE_ORDER_MAP[stage] ?? STAGE_ORDER_MAP[normalized] ?? 0;
};
