import type { RequestBase } from "@/types/request";

export type ManufacturerRequest = RequestBase & {
  status2?: string;
  referenceIds?: string[];
};

export type ReviewStageKey =
  | "request"
  | "cam"
  | "machining"
  | "packing"
  | "shipping"
  | "tracking";

export const getReviewStageKeyByTab = (opts: {
  stage?: string;
  isCamStage: boolean;
  isMachiningStage: boolean;
}): ReviewStageKey => {
  const stage = String(opts.stage || "").trim();
  if (stage === "tracking") return "tracking";
  if (stage === "shipping") return "shipping";
  if (stage === "packing") return "packing";
  if (opts.isMachiningStage) return "machining";
  if (opts.isCamStage) return "cam";
  return "request";
};

export const getReviewLabel = (status?: string) => {
  const s = String(status || "").trim();
  if (s === "APPROVED") return "승인";
  if (s === "REJECTED") return "반려";
  return "검토전";
};

export const getReviewBadgeClassName = (status?: string) => {
  const s = String(status || "").trim();
  if (s === "APPROVED") {
    return "text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (s === "REJECTED") {
    return "text-[11px] px-2 py-0.5 bg-rose-50 text-rose-700 border-rose-200";
  }
  return "text-[11px] px-2 py-0.5 bg-slate-50 text-slate-700 border-slate-200";
};

export const getDiameterBucketIndex = (diameter?: number) => {
  if (diameter == null) return -1;
  if (diameter <= 6) return 0;
  if (diameter <= 8) return 1;
  if (diameter <= 10) return 2;
  return 3;
};

export const computeStageLabel = (
  req: ManufacturerRequest,
  opts?: { isCamStage?: boolean; isMachiningStage?: boolean },
) => {
  const savedStage = (req.manufacturerStage || "").trim();
  if (savedStage) return savedStage;
  if (opts?.isMachiningStage) return "가공";
  if (opts?.isCamStage) return "CAM";
  return "의뢰";
};

export const deriveStageForFilter = (req: ManufacturerRequest) => {
  const saved = (req.manufacturerStage || "").trim();
  if (saved) {
    switch (saved) {
      case "세척.패킹":
        // 레거시/신 명칭 모두 필터용 라벨은 "세척.패킹"으로 통일
        return "세척.패킹";
      case "포장.발송":
      case "배송대기":
      case "배송중":
        return "포장.발송";
      case "완료":
        return "추적관리";
      default:
        return saved;
    }
  }

  // Fallback: manufacturerStage가 비어 있고 status만 있는 경우, 새 표준 라벨만 처리
  const status = (req.status || "").trim();
  if (status === "세척.패킹") return "세척.패킹";
  if (status === "포장.발송") return "포장.발송";
  if (status === "추적관리" || status === "완료") return "추적관리";
  if (status === "가공") return "가공";
  if (status === "CAM") return "CAM";
  return "의뢰";
};

export const stageOrder: Record<string, number> = {
  의뢰: 0,
  CAM: 1,
  가공: 2,
  "세척.패킹": 3,
  "포장.발송": 4,
  추적관리: 5,
};

export const getAcceptByStage = (stage: string) => {
  switch (stage) {
    case "의뢰":
      return ".filled.stl";
    case "CAM":
      return ".nc";
    case "가공":
      return ".png,.jpg,.jpeg,.webp,.bmp";
    case "세척.패킹":
      return ".png,.jpg,.jpeg,.webp,.bmp";
    case "포장.발송":
    case "추적관리":
      return ".png,.jpg,.jpeg,.webp,.bmp";
    default:
      return ".stl";
  }
};
