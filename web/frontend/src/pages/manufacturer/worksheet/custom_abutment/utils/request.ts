// change-log:
// - 2026-09-04: isRhinoWorkPending — 원본이 .stl일 때만(구강스캔 .ply 고스트 블러 방지).
// - 2026-09-03: isRhinoWorkPending — 취소·원본 STL 없음 고스트 블러 방지. CANCELLED/FAILED면 해제.
// - 2026-08-22: isAnySampleRequest는 UI/크레딧 표시용 — 직경 요약·공정 탭 차단에 쓰지 않음.
// - 2026-08-17: PTX 직납 치과 연락처 resolve (스냅샷 우선, 없으면 practice BA live).
// - 2026-08-21: Rhino filled STL SSOT — `caseInfos.stlFile`(legacy `camFile` 폴백). NC는 `ncFile`.
// - 2026-08-13: 준비 탭 라이노 완료 SSOT — `caseInfos.camFile.s3Key`(2-filled). 없으면 카드 블러·클릭 차단.
// - 2026-08-03: 준비 탭 카드 미표시 버그 수정 - `deriveStageForFilter`의 request 단계 정규화를 `준비` 단일값으로 통일.
// - 2026-08-03: manufacturerStage request 단계 레거시 값(`의뢰`, `request`) 의존을 제거하고 `준비` 기준으로 정리.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/bg/bg.controller.js
import type { RequestBase } from "@/types/request";
import { getDeadlineSemanticClasses } from "@/shared/ui/semanticStatus";

export type ManufacturerRequest = RequestBase & {
  referenceIds?: string[];
  mailboxAddress?: string | null;
  requestorBusiness?: unknown;
  requestor?:
    | (RequestBase["requestor"] & {
        business?: string;
        requestSettings?: {
          hexVerificationResultHex?: "STL모델대로" | "헥스30도회전" | null;
          designSoftware?: string | null;
          exoCadVersion?: string | null;
        } | null;
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
      exoCadVersion?: string | null;
      hexVerificationSample?: boolean | null;
      hexVerificationResultHex?: "STL모델대로" | "헥스30도회전" | null;
      anodizingEnabled?: boolean | null;
      wideSplitEnabled?: boolean | null;
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
  designClaim?: {
    claimedBy?: string | { _id?: string } | null;
    claimedByName?: string | null;
    claimedAt?: string | null;
    deadlineAt?: string | null;
    claimHours?: number | null;
  } | null;
  designClaimMeta?: {
    active?: boolean;
    mine?: boolean;
    peerBusy?: boolean;
    claimable?: boolean;
    remainingMs?: number | null;
    warn?: boolean;
  } | null;
  designClaimPeerBusy?: boolean;
  designClaimClaimable?: boolean;
  designClaimMine?: boolean;
  designClaimRemainingMs?: number | null;
  designClaimWarn?: boolean;
  shippingReceiver?: PracticeDirectShippingContact | null;
  partnerBilling?: {
    relatedPracticeTransferId?: string | { _id?: string } | null;
    practiceBusinessAnchorId?:
      | string
      | {
          _id?: string;
          name?: string;
          metadata?: {
            companyName?: string;
            phoneNumber?: string;
            representativeName?: string;
            address?: string;
            addressDetail?: string;
            zipCode?: string;
          } | null;
        }
      | null;
  } | null;
};

export type PracticeDirectShippingContact = {
  name?: string | null;
  phone?: string | null;
  contactName?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  zipCode?: string | null;
  /** 포장.발송 진입 스냅샷이면 true (카드 배송 섹션 표시용) */
  fromSnapshot?: boolean;
};

/**
 * PTX는 기공소 수취 — 치과 직납 연락처를 쓰지 않는다.
 * (레거시 스냅샷/practice BA 표시 중단)
 */
export function resolvePracticeDirectShippingContact(
  req?: ManufacturerRequest | null,
): PracticeDirectShippingContact | null {
  if (!req) return null;
  const pb = req.partnerBilling;
  const relatedId = String(
    (pb?.relatedPracticeTransferId as { _id?: string })?._id ||
      pb?.relatedPracticeTransferId ||
      "",
  ).trim();
  const practiceRaw = pb?.practiceBusinessAnchorId;
  const practiceId = String(
    (practiceRaw && typeof practiceRaw === "object"
      ? (practiceRaw as { _id?: string })._id
      : practiceRaw) || "",
  ).trim();
  if (relatedId || practiceId) return null;
  return null;
}

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
  // UI 뱃지·샘플만 삭제 등. 직경 요약/공정 탭 노출 차단에 쓰지 말 것
  // (작업용 샘플은 정식 의뢰와 동일 흐름 — useDiameterQueue / requestFiltering SSOT).
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

/** caseInfos.productMode SSOT: 커스텀어벗 생산 vs 디자인+생산 */
export const PRODUCT_MODE = {
  CUSTOM_ABUTMENT: "custom_abutment",
  DESIGN_CUSTOM_ABUTMENT: "design_custom_abutment",
} as const;

export type ProductMode =
  (typeof PRODUCT_MODE)[keyof typeof PRODUCT_MODE];

export const resolveProductMode = (
  req?: ManufacturerRequest | null,
): ProductMode => {
  const raw = String(req?.caseInfos?.productMode || "").trim();
  if (raw === PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT) {
    return PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT;
  }
  return PRODUCT_MODE.CUSTOM_ABUTMENT;
};

export const isDesignCustomAbutmentRequest = (
  req?: ManufacturerRequest | null,
) => resolveProductMode(req) === PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT;

/**
 * Rhino(2-filled) filled STL 메타.
 * SSOT: caseInfos.stlFile. Legacy: caseInfos.camFile (동일 의미 미러/폴백).
 * NC(Esprit)는 caseInfos.ncFile — camFile ≠ NC.
 */
export type FilledStlFileMeta = {
  fileName?: string;
  originalName?: string;
  fileType?: string;
  fileSize?: number;
  filePath?: string;
  s3Key?: string;
  s3Url?: string;
  uploadedAt?: string;
};

const hasFilledStlMeta = (file?: FilledStlFileMeta | null) =>
  Boolean(
    String(file?.s3Key || "").trim() ||
      String(file?.filePath || "").trim() ||
      String(file?.fileName || "").trim(),
  );

/** stlFile 우선, 없으면 legacy camFile. s3Key 있는 쪽을 스텁보다 우선. */
export const resolveFilledStlFile = (
  caseInfos?: {
    stlFile?: FilledStlFileMeta | null;
    camFile?: FilledStlFileMeta | null;
  } | null,
): FilledStlFileMeta | null => {
  const stl = caseInfos?.stlFile;
  const legacy = caseInfos?.camFile;
  const stlHasKey = Boolean(String(stl?.s3Key || "").trim());
  const legacyHasKey = Boolean(String(legacy?.s3Key || "").trim());
  if (stlHasKey) return stl || null;
  if (legacyHasKey) return legacy || null;
  if (hasFilledStlMeta(stl)) return stl || null;
  if (hasFilledStlMeta(legacy)) return legacy || null;
  return stl || legacy || null;
};

/** Filled STL(2-filled) 존재 = 라이노 작업 완료 SSOT */
export const hasFilledStl = (req?: ManufacturerRequest | null) =>
  Boolean(String(resolveFilledStlFile(req?.caseInfos)?.s3Key || "").trim());

/**
 * 낙관적 패치용 — stlFile SSOT + legacy camFile 미러.
 * clear 시 둘 다 undefined.
 */
export const patchFilledStlFile = (
  fileMeta: FilledStlFileMeta | undefined | null,
): { stlFile: FilledStlFileMeta | undefined; camFile: FilledStlFileMeta | undefined } => {
  if (fileMeta == null) {
    return { stlFile: undefined, camFile: undefined };
  }
  return { stlFile: fileMeta, camFile: fileMeta };
};

/**
 * 제조사 생산 준비 카드: filled STL 수신 전.
 * 디자인+생산 큐는 DesignRequestTransferView를 쓰므로 WorksheetCardGrid 준비 탭에서만 판정한다.
 * CANCELLED/FAILED(생성 중단)·취소 단계·원본 어벗 STL 없음(고스트/구강스캔)이면 블러를 띄우지 않는다.
 */
export const isRhinoWorkPending = (
  req?: ManufacturerRequest | null,
  tabStage?: string,
) => {
  if (String(tabStage || "").trim() !== "request") return false;
  if (String(req?.manufacturerStage || "").trim() === "취소") return false;
  if (hasFilledStl(req)) return false;
  const status = String(req?.productionSchedule?.stlPreload?.status || "")
    .trim()
    .toUpperCase();
  if (status === "CANCELLED" || status === "FAILED") return false;
  // 어벗 STL만 Rhino 대상. 구강스캔(.ply 등)이 primary에 남은 레거시는 고스트 블러 금지.
  const file = req?.caseInfos?.file;
  const name = String(
    file?.filePath || file?.fileName || file?.originalName || "",
  )
    .trim()
    .toLowerCase();
  const hasOriginalStl =
    name.endsWith(".stl") &&
    Boolean(
      String(file?.s3Key || "").trim() ||
        String(file?.filePath || "").trim() ||
        String(file?.fileName || "").trim() ||
        String(file?.originalName || "").trim(),
    );
  if (!hasOriginalStl) return false;
  return true;
};

// change-log (getDeadlineInfo):
// - 2026-08-10: 마감 경과 문구 "출고일 지남" → "출고시간 지남".
// - 2026-08-10: 마감 1시간 미만(remainingMs>0)은 "출고시간 지남"이 아니라 "출고 0시간전".
// - 2026-08-06: 남은시간 뱃지 문구 "출고 N일 N시간" → "출고 N일전"(+시간).
// - 2026-08-06: 남은시간 뱃지 문구 "마감 …" → "출고 …".
// - 2026-08-06: createdAt 필수 조건 제거. 큐 아이템처럼 estimatedShipYmd만 있어도 마감 뱃지 계산.
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

export { getReviewBadgeClassName } from "@/shared/ui/semanticStatus";

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
  if (opts?.isCamStage) return "가공";
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
  createdAt?: string | Date | null,
  estimatedShipYmd?: string | null,
): DeadlineInfo | null => {
  // createdAt은 호출 호환용으로 유지. 마감 계산은 estimatedShipYmd(당일 16:00 KST)만 사용.
  void createdAt;
  if (!estimatedShipYmd) {
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
    // 16:00 KST 이후만 "출고시간 지남". 그 전(1시간 미만 포함)은 남은 시간으로 표시.
    if (remainingMs <= 0) return "출고시간 지남";

    const hours = Math.max(0, Math.floor(hoursRemaining));
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;

    if (days > 0) {
      return restHours > 0
        ? `출고 ${days}일전 ${restHours}시간`
        : `출고 ${days}일전`;
    }

    // 1시간 미만(0 ≤ floor < 1) → "출고 0시간전"
    return `출고 ${restHours}시간전`;
  };

  const getColorClasses = (
    hoursRemaining: number,
  ): { border: string; badge: string } =>
    getDeadlineSemanticClasses(hoursRemaining);

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
  const saved = String(req.manufacturerStage || "").trim();
  if (!saved) return "준비";

  const lower = saved.toLowerCase();

  // manufacturerStage request 단계 SSOT는 "준비" 단일값으로 사용
  if (saved === "준비") {
    return "준비";
  }

  // 가공 계열
  if (saved === "가공") {
    return "가공";
  }

  // 세척/패킹
  if (saved === "세척.패킹") {
    return "세척.패킹";
  }

  // 포장/발송 계열
  if (
    saved === "포장.발송" ||
    saved === "배송대기" ||
    saved === "배송중" ||
    lower === "shipping"
  ) {
    return "포장.발송";
  }

  // 추적 계열
  if (saved === "완료" || saved === "배송완료" || lower === "tracking") {
    return "추적관리";
  }

  return saved;
};

export const stageOrder: Record<string, number> = {
  의뢰: 0,
  준비: 0, // legacy alias for compatibility
  가공: 1,
  "세척.패킹": 2,
  "포장.발송": 3,
  추적관리: 4,
};

export const getAcceptByStage = (stage: string) => {
  switch (stage) {
    case "준비":
    case "의뢰": // legacy support
      return ".filled.stl";
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

export type WorksheetTabStage =
  | "request"
  | "machining"
  | "packing"
  | "shipping"
  | "tracking"
  | "rnd"
  | "unmachinable"
  | "cam";

const WORKSHEET_STAGE_QUERY_ALIASES: Record<
  "request" | "machining" | "packing" | "shipping" | "tracking",
  string[]
> = {
  request: ["준비"],
  machining: ["가공"],
  packing: ["세척.패킹"],
  shipping: [
    "포장.발송",
    "발송",
    "shipping",
    "delivery",
    "배송대기",
    "배송중",
  ],
  tracking: ["추적관리", "tracking", "완료", "배송완료"],
};

const dedupeStrings = (values: string[]) => {
  const set = new Set<string>();
  for (const raw of values) {
    const v = String(raw || "").trim();
    if (v) set.add(v);
  }
  return [...set];
};

export const getWorksheetStageFilterForTab = (
  tabStageRaw: WorksheetTabStage | string,
  showCompleted: boolean,
): string[] => {
  const tabStage = String(tabStageRaw || "").trim();
  const normalizedTab =
    tabStage === "cam" ? ("machining" as const) : (tabStage as WorksheetTabStage);

  if (normalizedTab === "rnd" || normalizedTab === "unmachinable") {
    return [];
  }

  const stageFlow: Array<"request" | "machining" | "packing" | "shipping" | "tracking"> = [
    "request",
    "machining",
    "packing",
    "shipping",
    "tracking",
  ];

  const idx = stageFlow.indexOf(
    normalizedTab as (typeof stageFlow)[number],
  );
  if (idx === -1) return [];

  if (!showCompleted) {
    return WORKSHEET_STAGE_QUERY_ALIASES[stageFlow[idx]];
  }

  const merged: string[] = [];
  for (let i = idx; i < stageFlow.length; i += 1) {
    merged.push(...WORKSHEET_STAGE_QUERY_ALIASES[stageFlow[i]]);
  }
  return dedupeStrings(merged);
};
