// change-log:
// - 2026-08-03: 공정 표시 변경: 작업 공정 중 `의뢰` 단계의 화면 표기를 `준비`로 변경 (프론트 표시 레벨, DB 값은 미변경)
// - reason: 공정 명칭 변경(의뢰 -> 준비) 요구에 따른 표시 정규화
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import type { RequestBase } from "@/types/request";

export type ManufacturerRequest = RequestBase & {
  referenceIds?: string[];
  mailboxAddress?: string | null;
  requestorBusiness?: unknown;
  requestor?:
    | (RequestBase["requestor"] & {
        business?: string;
      })
    | null;
  business?: {
    _id?: string;
    name?: string;
    metadata?: unknown;
    shippingPolicy?: {
      weeklyBatchDays?: string[];
    };
    requestSettings?: {
      designSoftware?: string | null;
      anodizingEnabled?: boolean | null;
    } | null;
  } | null;
  deliveryInfoRef?: unknown;
  wasPickedUp?: boolean;
  pickupStatusCode?: string | null;
  pickupStatusText?: string | null;
  pickupCanceled?: boolean;
  deliveryMeta?: {
    wasPickedUp?: boolean;
    pickupStatusCode?: string | null;
    pickupStatusText?: string | null;
    pickupCanceled?: boolean;
    pickedUp?: boolean;
    delivered?: boolean;
  } | null;
  shippingLabelPrinted?: {
    printed?: boolean | null;
    printedAt?: string | null;
    mailboxAddress?: string | null;
    snapshotFingerprint?: string | null;
    snapshotCapturedAt?: string | null;
    snapshotRequestIds?: string[] | null;
  } | null;
  realtimeProgress?: {
    badge?: string | null;
    startedAt?: string | null;
    elapsedSeconds?: number | null;
    tone?: "blue" | "amber" | "slate" | "indigo" | "rose" | null;
  } | null;
};

export type ReviewStageKey =
  "request" | "cam" | "machining" | "packing" | "shipping" | "tracking";

// related files (request category SSOT):
// - web/backend/models/request.model.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
export const REQUEST_CATEGORY = {
  ORDER: "order",
  RND_SAMPLE: "rnd_sample",
  COPIED_SAMPLE: "copied_sample",
} as const;

export const resolveRequestCategory = (req?: ManufacturerRequest | null) => {
  const raw = String(req?.requestCategory || "").trim();
  if (raw === REQUEST_CATEGORY.RND_SAMPLE) return REQUEST_CATEGORY.RND_SAMPLE;
  if (raw === REQUEST_CATEGORY.COPIED_SAMPLE)
    return REQUEST_CATEGORY.COPIED_SAMPLE;
  return REQUEST_CATEGORY.ORDER;
};

export const isAnySampleRequest = (req?: ManufacturerRequest | null) => {
  const category = resolveRequestCategory(req);
  const source = String(req?.source || "").trim();
  return (
    category === REQUEST_CATEGORY.RND_SAMPLE ||
    category === REQUEST_CATEGORY.COPIED_SAMPLE ||
    source === "manufacturer_sample"
  );
};

export const isRndSampleRequest = (req?: ManufacturerRequest | null) => {
  const rawCategory = String(req?.requestCategory || "").trim();

  // SSOT: requestCategory가 있으면 해당 값을 최우선으로 따른다.
  if (rawCategory === REQUEST_CATEGORY.RND_SAMPLE) return true;
  if (rawCategory === REQUEST_CATEGORY.COPIED_SAMPLE) return false;

  // 레거시 호환: requestCategory 누락 문서만 source+rnd.doneAt 조합으로 판단
  const doneAt = Boolean(req?.rnd?.doneAt);
  if (!doneAt) return false;
  const source = String(req?.source || "").trim();
  return source === "manufacturer_sample";
};

export const isCopiedSampleRequest = (req?: ManufacturerRequest | null) => {
  return resolveRequestCategory(req) === REQUEST_CATEGORY.COPIED_SAMPLE;
};

export interface DeadlineInfo {
  remainingMs: number;
  remainingBusinessDays: number;
  displayText: string;
  borderClass: string;
  badgeClass: string;
}

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
  return "준비";
};

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = String(ymd)
    .split("-")
    .map((v) => Number(v));
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function ymdToUtcDate(ymd: string): Date | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function countHoursRemaining(now: Date, shipDateDeadline: Date): number {
  const diffMs = shipDateDeadline.getTime() - now.getTime();
  return diffMs / (1000 * 60 * 60);
}

export const getDeadlineInfo = (
  createdAt?: string | Date,
  estimatedShipYmd?: string,
): DeadlineInfo | null => {
  if (!createdAt || !estimatedShipYmd) {
    return null;
  }

  const now = new Date();

  // 마감 시각: estimatedShipYmd 16:00 KST
  // KST 16:00 = UTC 07:00 (UTC+9)
  const shipDateDeadline = ymdToUtcDate(estimatedShipYmd);
  if (!shipDateDeadline) {
    return null;
  }
  shipDateDeadline.setUTCHours(7, 0, 0, 0); // UTC 07:00 = KST 16:00

  const remainingMs = shipDateDeadline.getTime() - now.getTime();
  const totalHours = countHoursRemaining(now, shipDateDeadline);

  const formatTimeRemaining = (hoursRemaining: number): string => {
    if (remainingMs <= 0) return "마감됨";

    const hours = Math.max(0, Math.floor(hoursRemaining));
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;

    if (hours <= 0) {
      return "마감됨";
    }

    if (days > 0) {
      return `마감 ${days}일 ${restHours}시간`;
    }

    return `마감 ${restHours}시간`;
  };

  const getColorClasses = (
    hoursRemaining: number,
  ): { border: string; badge: string } => {
    if (hoursRemaining > 48) {
      return {
        border: "border-green-500 border-2",
        badge: "bg-green-50 text-green-700 border-green-200",
      };
    }
    if (hoursRemaining > 24) {
      return {
        border: "border-yellow-500 border-2",
        badge: "bg-yellow-50 text-yellow-700 border-yellow-200",
      };
    }
    if (hoursRemaining > 0) {
      return {
        border: "border-orange-500 border-2",
        badge: "bg-orange-50 text-orange-700 border-orange-200",
      };
    }
    return {
      border: "border-red-500 border-2",
      badge: "bg-red-50 text-red-700 border-red-200",
    };
  };

  const colors = getColorClasses(totalHours);

  return {
    remainingMs,
    remainingBusinessDays: Math.max(0, Math.floor(totalHours / 24)),
    displayText: formatTimeRemaining(totalHours),
    borderClass: colors.border,
    badgeClass: colors.badge,
  };
};

export const deriveStageForFilter = (req: ManufacturerRequest) => {
  const saved = (req.manufacturerStage || "").trim();
  if (saved) {
    switch (saved) {
      case "request":
      case "의뢰":
        return "준비";
      case "cam":
        return "CAM";
      case "machining":
        return "가공";
      case "세척.패킹":
      case "세척.포장":
      case "packing":
        // 레거시/신 명칭 모두 필터용 라벨은 "세척.패킹"으로 통일
        return "세척.패킹";
      case "포장.발송":
      case "배송대기":
      case "배송중":
      case "shipping":
        return "포장.발송";
      case "완료":
      case "배송완료":
      case "tracking":
        return "추적관리";
      default:
        return saved;
    }
  }
  return "준비";
};

export const stageOrder: Record<string, number> = {
  준비: 0,
  의뢰: 0, // legacy alias for compatibility
  CAM: 1,
  가공: 2,
  "세척.패킹": 3,
  "포장.발송": 4,
  추적관리: 5,
};

export const getAcceptByStage = (stage: string) => {
  switch (stage) {
    case "준비":
    case "의뢰": // legacy support
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
