import type { RequestBase } from "@/types/request";

export type ManufacturerRequest = RequestBase & {
  status1?: string;
  status2?: string;
  referenceIds?: string[];
};

export type ReviewStageKey =
  | "request"
  | "cam"
  | "machining"
  | "packaging"
  | "shipping"
  | "tracking";

export const getReviewStageKeyByTab = (opts: {
  isCamStage: boolean;
  isMachiningStage: boolean;
}): ReviewStageKey => {
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
  opts?: { isCamStage?: boolean; isMachiningStage?: boolean }
) => {
  const savedStage = (req.manufacturerStage || "").trim();
  if (savedStage) return savedStage;
  if (opts?.isMachiningStage) return "생산";
  if (opts?.isCamStage) return "CAM";
  return "의뢰";
};

export const deriveStageForFilter = (req: ManufacturerRequest) => {
  const saved = (req.manufacturerStage || "").trim();
  if (saved) return saved;
  const s1 = (req.status1 || "").trim();
  const s2 = (req.status2 || "").trim();
  const main = (req.status || "").trim();

  if (s1 === "가공") {
    if (s2 === "후") return "CAM";
    return "생산";
  }
  if (s1 === "세척/검사/포장") return "생산";
  if (s1 === "배송") return "발송";
  if (s1 === "완료") return "추적관리";
  if (main === "가공후") return "CAM";
  if (main === "세척/검사/포장") return "생산";
  return "의뢰";
};

export const stageOrder: Record<string, number> = {
  의뢰: 0,
  CAM: 1,
  생산: 2,
  발송: 3,
  추적관리: 4,
};

export const getAcceptByStage = (stage: string) => {
  switch (stage) {
    case "의뢰":
      return ".stl";
    case "CAM":
      return ".cam.stl";
    case "생산":
      return ".png,.jpg,.jpeg,.webp,.bmp";
    case "발송":
    case "추적관리":
      return ".png,.jpg,.jpeg,.webp,.bmp";
    default:
      return ".stl";
  }
};
