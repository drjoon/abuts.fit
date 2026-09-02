/**
 * 치과 기공의뢰 — 최근 전송 목록 매핑·그룹·필터 SSOT.
 * 상단 5뱃지: 의뢰 / 취소 / 수락 / 거절 / 어벗 (출고·리메이크 삭제).
 * 취소=작업취소+휴지통(취소). 거절=기공소 지정 거부. 어벗=CA 디자인 업로드(+제조 출고 단계).
 * 수락=의뢰수락 + 파일 없는 작업완료(비CA). 채팅 unread는 상태 뱃지별 합산.
 * 자동매칭(공개 풀)은 공정상 의뢰 — 뱃지 집계·「의뢰」필터에 포함.
 * 2026-09-02: 5뱃지 재구성·거절 분리·어벗=CA designFiles.
 *
 * related files:
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
 * - web/frontend/src/pages/practice/components/PracticeStatusFilterBadges.tsx
 * - web/frontend/src/store/usePeriodStore.ts
 */
import { type ChatRoom } from "@/shared/hooks/useChatRooms";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { periodToRange } from "@/store/usePeriodStore";
import { toKstYmd, toKstYmdLoose } from "@/shared/date/kst";
import {
  extractTransferMemoFromMessage as extractTransferMemoFromMessageShared,
  formatToothNumbersForCard,
  parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
  stripPracticeTransferMessageEnvelope,
} from "@/shared/practice/transferMemo";
import {
  parsePracticeTransferFeeQuote,
  type PracticeTransferFeeQuote,
} from "@/shared/practice/practiceTransferFeeQuote";
import {
  parsePracticeLabRatingPublic,
  formatPracticeTargetLabLabel,
  type PracticeLabRatingPublic,
} from "@/shared/practice/practiceLabRating";

/** GET /api/practice/transfers/my 기본 페이지 크기. 사이드바·전체보기 모달 공유. */
export const PRACTICE_MY_TRANSFERS_PAGE_SIZE = 30;

export type PracticeRecentTransferFileItem = {
  fileName: string;
  s3Key: string;
  size: number;
};

export type PracticeRecentRequestItem = {
  id: string;
  requestMongoId: string;
  createdAt: string;
  requestDate: string;
  patientName: string;
  patientKey: string;
  toothNumbers: string[];
  targetLab: string;
  targetLabAnchorId: string;
  matchingMode?: "direct" | "auto";
  status: string;
  createdAtTs: number;
  transferId: string;
  orderDate: string;
  arrivalDate: string;
  /** 누적 주문일(마지막=최종·재주문일). 없으면 [orderDate] */
  orderDates?: string[];
  /** 누적 치과도착일(마지막=최종·재도착일). 없으면 [arrivalDate] */
  arrivalDates?: string[];
  transferMemo: string;
  rawTransferMemo: string;
  /** 레거시·검색용 대표 파일(보통 files[0]) */
  fileName: string;
  fileS3Key: string;
  fileSize: number;
  /** 의뢰 원본 첨부 전체(스캔·쉐이드 포토 등). /my files[] SSOT */
  files?: PracticeRecentTransferFileItem[];
  resultFiles?: PracticeRecentTransferFileItem[];
  designFiles?: PracticeRecentTransferFileItem[];
  hasCustomAbutment?: boolean;
  productionConfirmedAt?: string | null;
  /** 연동 커스텀어벗 Request 한진 배송 요약 */
  abutmentDeliveryInfo?: {
    carrier?: string;
    shippedAt?: string;
    pickedUpAt?: string;
    deliveredAt?: string;
    relatedCount?: number;
    manufacturerStages?: string[];
    tracking?: {
      lastStatusCode?: string;
      lastStatusText?: string;
      lastLocation?: string;
      lastEventAt?: string;
      lastSyncedAt?: string;
    };
    events?: Array<{
      statusCode?: string;
      statusText?: string;
      occurredAt?: string;
      location?: string;
    }>;
  } | null;
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
  designReadyAt?: string | null;
  designFileCount?: number;
  practiceDesignConfirmedAt?: string | null;
  labDesignConfirmedAt?: string | null;
  feeQuote?: PracticeTransferFeeQuote | null;
  remakeFeeQuote?: PracticeTransferFeeQuote | null;
  isRemake?: boolean;
  remakeSourceTransferId?: string;
  canRateLab?: boolean;
  labRating?: PracticeLabRatingPublic | null;
  performingLabAnchorId?: string | null;
  handledByCertifiedPartner?: boolean;
  /** API toothWorks 스냅샷(후속 보철 append 등 memo보다 우선) */
  toothWorks?: Array<Record<string, unknown>>;
  prosthesisFollowUps?: import("@/shared/practice/prosthesisFollowUp").ProsthesisFollowUpRecord[];
  requestorDownloadedAt?: string | null;
  requestorAcceptedAt?: string | null;
};

export type PracticeRecentTransferItem = {
  id: string;
  transferId: string;
  deleteTargetLabel: string;
  createdAt: string;
  createdAtTs: number;
  requestDate: string;
  targetLab: string;
  orderDate: string;
  arrivalDate: string;
  /** 누적 주문일(마지막=최종·재주문일). 캘린더 다중 표시·연결용 */
  orderDates?: string[];
  /** 누적 치과도착일(마지막=최종·재도착일). 캘린더 다중 표시·연결용 */
  arrivalDates?: string[];
  status: string;
  fileCount: number;
  patientCount: number;
  requestIds: string[];
  transferMongoIds: string[];
  fileNames: string[];
  files: PracticeRecentTransferFileItem[];
  resultFiles?: PracticeRecentTransferFileItem[];
  designFiles?: PracticeRecentTransferFileItem[];
  hasCustomAbutment?: boolean;
  productionConfirmedAt?: string | null;
  /** 연동 커스텀어벗 Request 한진 배송 요약 */
  abutmentDeliveryInfo?: {
    carrier?: string;
    shippedAt?: string;
    pickedUpAt?: string;
    deliveredAt?: string;
    relatedCount?: number;
    manufacturerStages?: string[];
    tracking?: {
      lastStatusCode?: string;
      lastStatusText?: string;
      lastLocation?: string;
      lastEventAt?: string;
      lastSyncedAt?: string;
    };
    events?: Array<{
      statusCode?: string;
      statusText?: string;
      occurredAt?: string;
      location?: string;
    }>;
  } | null;
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
  designReadyAt?: string | null;
  designFileCount?: number;
  practiceDesignConfirmedAt?: string | null;
  labDesignConfirmedAt?: string | null;
  transferMemo: string;
  rawTransferMemo?: string;
  /** 목록 카드·검색용 FDI 치아번호(예: ["11","21"]) */
  toothNumbers?: string[];
  unreadCount: number;
  searchBlob: string;
  targetLabAnchorId?: string;
  matchingMode?: "direct" | "auto";
  feeQuote?: PracticeTransferFeeQuote | null;
  remakeFeeQuote?: PracticeTransferFeeQuote | null;
  isRemake?: boolean;
  remakeSourceTransferId?: string;
  canRateLab?: boolean;
  labRating?: PracticeLabRatingPublic | null;
  performingLabAnchorId?: string | null;
  handledByCertifiedPartner?: boolean;
  /** 임시저장 카드용(사이드바·휴지통) */
  practiceUserId?: string;
  practiceUserLabel?: string;
  isMineDraft?: boolean;
  draftPatientName?: string;
  /** 임시저장 — 기공소·첨부 없음 */
  draftIncomplete?: boolean;
  /** 임시저장 — KST 1일+ 미갱신(깜빡임) */
  draftStaleHighlight?: boolean;
  prosthesisFollowUps?: import("@/shared/practice/prosthesisFollowUp").ProsthesisFollowUpRecord[];
  toothWorks?: Array<Record<string, unknown>>;
  requestorDownloadedAt?: string | null;
  requestorAcceptedAt?: string | null;
};

export type PracticeRecentStatusFilter =
  | "all"
  | "발송완료"
  | "취소"
  | "의뢰수락"
  | "거부"
  | "작업완료";

export type PracticeRecentStatusFilterKey = Exclude<PracticeRecentStatusFilter, "all">;

export type PracticeRecentStatusCounts = {
  sent: number;
  canceled: number;
  accepted: number;
  rejected: number;
  /** CA 어벗 디자인 업로드(+제조 출고 단계) */
  abutment: number;
};

/** 전체보기 기본 ON — 5상태 전부. 「기본」 리셋도 이 집합. */
export const PRACTICE_RECENT_DEFAULT_ON_STATUS_FILTERS: readonly PracticeRecentStatusFilterKey[] =
  ["발송완료", "취소", "의뢰수락", "거부", "작업완료"];

export const createPracticeRecentStatusFilterSet = (
  keys: readonly PracticeRecentStatusFilterKey[] = PRACTICE_RECENT_DEFAULT_ON_STATUS_FILTERS,
) => new Set<PracticeRecentStatusFilterKey>(keys);

/** 독립 다중 on/off: 키를 Set에 추가/제거. 전부 off(빈 Set) 허용. */
export const togglePracticeRecentStatusFilter = (
  prev: ReadonlySet<PracticeRecentStatusFilterKey>,
  key: PracticeRecentStatusFilterKey,
) => {
  const next = new Set<PracticeRecentStatusFilterKey>(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export const isPracticeRecentStatusFilterDefault = (
  selected: ReadonlySet<PracticeRecentStatusFilterKey>,
) => {
  if (selected.size !== PRACTICE_RECENT_DEFAULT_ON_STATUS_FILTERS.length) return false;
  return PRACTICE_RECENT_DEFAULT_ON_STATUS_FILTERS.every((k) => selected.has(k));
};

/** CA 어벗 디자인 업로드 또는 제조 출고 단계 → 「어벗」뱃지 */
export const isPracticeRecentAbutmentBadgeStatus = (
  transfer: {
    status?: unknown;
    designFileCount?: unknown;
    designFiles?: unknown;
    designReadyAt?: unknown;
  },
) => {
  const status = String(transfer.status || "").trim();
  if (status === "생산진행" || status === "포장.발송") return true;
  const designN = Math.max(
    Number(transfer.designFileCount || 0) || 0,
    Array.isArray(transfer.designFiles) ? transfer.designFiles.length : 0,
  );
  if (designN > 0 || Boolean(transfer.designReadyAt)) return true;
  return false;
};

export const practiceTransferMatchesStatusFilters = (
  transfer: {
    status?: unknown;
    designFileCount?: unknown;
    designFiles?: unknown;
    designReadyAt?: unknown;
  },
  selected: ReadonlySet<PracticeRecentStatusFilterKey>,
) => {
  if (selected.size === 0) return false;

  const status = String(transfer.status || "").trim();
  const isAbutment = isPracticeRecentAbutmentBadgeStatus(transfer);

  if (selected.has("거부") && isPracticeRecentRejectBadgeStatus(status)) return true;
  if (selected.has("취소") && isPracticeRecentCancelBadgeStatus(status)) return true;
  if (selected.has("작업완료") && isAbutment) return true;
  if (
    selected.has("의뢰수락") &&
    !isAbutment &&
    (status === "의뢰수락" ||
      status === "다운로드완료" ||
      status === "작업완료")
  ) {
    return true;
  }
  if (selected.has("발송완료")) {
    return (
      status === "발송완료" ||
      status === "수신완료" ||
      status === "자동매칭" ||
      (status !== "의뢰수락" &&
        status !== "다운로드완료" &&
        status !== "작업완료" &&
        status !== "생산진행" &&
        status !== "취소" &&
        status !== "거부" &&
        status !== "작업취소" &&
        status !== "포장.발송")
    );
  }
  return false;
};

const PRACTICE_OUTBOUND_MFG_STAGES = new Set([
  "포장.발송",
  "발송",
  "추적관리",
  "shipping",
  "tracking",
]);

/** 연동 CA 포장.발송·택배 → 출고. API manufacturerStage 보강용. */
export const isPracticeRecentAbutmentOutbound = (
  abutmentDeliveryInfo: PracticeRecentRequestItem["abutmentDeliveryInfo"] | null | undefined,
) => {
  const di = abutmentDeliveryInfo;
  if (!di) return false;
  if (di.shippedAt || di.pickedUpAt || di.deliveredAt) return true;
  if (String(di.tracking?.lastStatusText || "").trim()) return true;
  const stages = Array.isArray(di.manufacturerStages) ? di.manufacturerStages : [];
  return stages.some((s) => PRACTICE_OUTBOUND_MFG_STAGES.has(String(s || "").trim()));
};

/** 목록 매핑용 표시 단계 — API stage + 배송·디자인 파일 보강 */
export const resolvePracticeRecentDisplayStatus = (row: {
  manufacturerStage?: unknown;
  status?: unknown;
  abutmentDeliveryInfo?: PracticeRecentRequestItem["abutmentDeliveryInfo"] | null;
  designFiles?: unknown;
  designFileCount?: unknown;
  designReadyAt?: unknown;
  resultFiles?: unknown;
  productionConfirmedAt?: unknown;
  skipDesignConfirm?: unknown;
}) => {
  if (isPracticeRecentAbutmentOutbound(row.abutmentDeliveryInfo)) {
    return "생산진행";
  }
  const apiStage = toStatusLabel(row.manufacturerStage || row.status);
  if (apiStage === "생산진행" || apiStage === "포장.발송") return apiStage;

  const designN = Math.max(
    Array.isArray(row.designFiles) ? row.designFiles.length : 0,
    Number(row.designFileCount || 0) || 0,
  );
  const resultN = Array.isArray(row.resultFiles) ? row.resultFiles.length : 0;
  const hasFiles =
    designN > 0 || resultN > 0 || Boolean(row.designReadyAt);
  if (
    hasFiles &&
    (apiStage === "의뢰수락" ||
      apiStage === "다운로드완료" ||
      apiStage === "작업완료" ||
      apiStage === "생산진행")
  ) {
    if (
      row.productionConfirmedAt &&
      row.skipDesignConfirm === false &&
      apiStage !== "의뢰수락"
    ) {
      return "생산진행";
    }
    return "작업완료";
  }
  return apiStage;
};

/** 최근전송 상단 5뱃지 — 라벨·집계키·빠른툴팁 SSOT. */
export const PRACTICE_RECENT_STATUS_BADGES = [
  {
    filter: "발송완료",
    label: "의뢰",
    countKey: "sent",
    tooltip: "치과에서 기공의뢰서 전송 후(자동매칭 공개 풀 포함)",
  },
  {
    filter: "취소",
    label: "취소",
    countKey: "canceled",
    tooltip: "기공소 작업취소, 또는 휴지통으로 옮긴 취소 건",
  },
  {
    filter: "의뢰수락",
    label: "수락",
    countKey: "accepted",
    tooltip: "기공소 수락 후(파일 없는 작업완료 포함)",
  },
  {
    filter: "거부",
    label: "거절",
    countKey: "rejected",
    tooltip: "기공소에서 지정 의뢰를 거절한 후",
  },
  {
    filter: "작업완료",
    label: "어벗",
    countKey: "abutment",
    tooltip: "커스텀 어벗 디자인 업로드 후(제조 출고 단계 포함)",
  },
] as const satisfies ReadonlyArray<{
  filter: Exclude<PracticeRecentStatusFilter, "all">;
  label: string;
  countKey: keyof PracticeRecentStatusCounts;
  tooltip: string;
}>;

/** 취소 뱃지·필터 — 작업취소 + 휴지통(취소). 거절(거부)은 별도. */
export const isPracticeRecentCancelBadgeStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "작업취소" || s === "취소";
};

/** 거절 뱃지·필터 — 기공소 지정 거부 */
export const isPracticeRecentRejectBadgeStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "거부";
};

const extractLabNameFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*기공소\s*:\s*([^\]]+)\]/);
  return String(matched?.[1] || "").trim();
};

const extractTransferIdFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*전송ID\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const extractTransferMemoFromMessage = (message: string) =>
  extractTransferMemoFromMessageShared(message, { includeDateSummary: false });

const normalizePatientNameKey = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";

  let normalized = raw;
  try {
    normalized = normalized.normalize("NFC");
  } catch {
    // ignore
  }

  const stripped = normalized
    .replace(/\.(stl|ply|obj)$/i, "")
    .replace(/[_\-\s]*#?\d{1,2}(?:[_\-\s]\d+)?$/, "")
    .trim();

  return (stripped || normalized).toLowerCase();
};

/** 치과 휴지통(기공소 지정 거부·치과 취소). 작업취소는 제외 */
export const isPracticeTransferTrashStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "취소" || s === "거부";
};

/** 기공소 취소·거부 후 치과 조치 대기(최근전송 「취소」 뱃지·알림) */
export const isPracticeTransferActionNeededStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "작업취소";
};

export const toStatusLabel = (manufacturerStage: unknown) => {
  const raw = String(manufacturerStage || "").trim();
  const lowered = raw.toLowerCase();
  if (!raw) return "발송완료";

  if (raw === "취소") return "취소";
  if (raw === "거부") return "거부";
  if (raw === "작업취소") return "작업취소";
  if (raw === "발송완료") return "발송완료";
  if (raw === "수신완료") return "수신완료";
  if (raw === "의뢰수락" || raw === "다운로드완료") return "의뢰수락";
  if (raw === "자동매칭") return "자동매칭";
  if (raw === "하청대기") return "하청대기";
  if (raw === "작업완료") return "작업완료";
  if (raw === "생산진행") return "생산진행";
  if (raw === "포장.발송") return "포장.발송";
  if (raw === "추적관리") return "추적관리";

  if (raw === "수신전" || raw === "확인전") return "발송완료";
  if (raw === "확인") return "수신완료";
  if (lowered === "downloaded" || lowered === "accepted") return "의뢰수락";
  if (raw.includes("전달완료") || raw.includes("배송완료")) return "수신완료";
  if (raw.includes("의뢰") || raw.includes("접수") || raw.includes("대기")) return "발송완료";

  return "발송완료";
};

/** 목록/카드 뱃지 라벨 — 상단 필터(의뢰·취소·수락·거절·어벗)와 동일 문구 */
export const toStatusBadgeLabel = (
  status: unknown,
  opts?: {
    designFileCount?: unknown;
    designFiles?: unknown;
    designReadyAt?: unknown;
  },
) => {
  const s = String(status || "").trim();
  if (!s) return "-";
  if (s === "발송완료" || s === "수신완료" || s === "자동매칭" || s === "하청대기") {
    return "의뢰";
  }
  if (s === "거부") return "거절";
  if (s === "작업취소" || s === "취소") return "취소";
  if (
    isPracticeRecentAbutmentBadgeStatus({
      status: s,
      designFileCount: opts?.designFileCount,
      designFiles: opts?.designFiles,
      designReadyAt: opts?.designReadyAt,
    })
  ) {
    return "어벗";
  }
  if (s === "의뢰수락" || s === "다운로드완료" || s === "작업완료") return "수락";
  return s;
};

export const canDeletePracticeTransferByStatus = (status: unknown) => {
  const s = String(status || "").trim();
  if (s === "임시저장") return true;
  return (
    s === "발송완료" ||
    s === "수신완료" ||
    s === "자동매칭" ||
    s === "하청대기" ||
    s === "작업취소"
  );
};

/** 수락 전(의뢰)만 치과가 내용 수정 가능. 작업취소는 기공소 재선택 경로. */
export const canEditPracticeTransferByStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "발송완료" || s === "수신완료" || s === "자동매칭";
};

const toDateLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const toDayLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const mapApiFileItems = (raw: unknown): PracticeRecentTransferFileItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const nested =
        item.file && typeof item.file === "object"
          ? (item.file as Record<string, unknown>)
          : null;
      return {
        fileName: String(
          item.originalName ||
            item.fileName ||
            nested?.originalName ||
            nested?.name ||
            "",
        ).trim(),
        s3Key: String(item.s3Key || nested?.s3Key || nested?.key || "").trim(),
        size: Number(item.size ?? nested?.size ?? 0),
      };
    })
    .filter((f) => f.fileName && f.s3Key);
};

/** request row → 의뢰 파일 목록. files[] 우선, 없으면 단건 fileName 폴백 */
export const collectPracticeRequestFiles = (
  req: Pick<
    PracticeRecentRequestItem,
    "files" | "fileName" | "fileS3Key" | "fileSize"
  >,
): PracticeRecentTransferFileItem[] => {
  const fromList = Array.isArray(req.files)
    ? req.files.filter((f) => f?.fileName && f?.s3Key)
    : [];
  if (fromList.length > 0) return fromList;
  const fileName = String(req.fileName || "").trim();
  const s3Key = String(req.fileS3Key || "").trim();
  if (!fileName || !s3Key) return [];
  return [{ fileName, s3Key, size: Number(req.fileSize || 0) }];
};

const mergeFileItemsByS3Key = (
  existing: PracticeRecentTransferFileItem[] | undefined,
  incoming: PracticeRecentTransferFileItem[] | undefined,
) => {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(existing) ? existing : [];
  }
  const byKey = new Map((existing || []).map((f) => [f.s3Key, f] as const));
  for (const f of incoming) {
    if (f.s3Key) byKey.set(f.s3Key, f);
  }
  return Array.from(byKey.values());
};

export const mapMyPracticeTransferApiRows = (
  list: unknown[],
): PracticeRecentRequestItem[] =>
  list
    .map((raw) => {
      const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const ci =
        r.caseInfos && typeof r.caseInfos === "object"
          ? (r.caseInfos as Record<string, unknown>)
          : {};
      const newSystemRequest =
        ci.newSystemRequest && typeof ci.newSystemRequest === "object"
          ? (ci.newSystemRequest as Record<string, unknown>)
          : {};

      const message = String(newSystemRequest.message || r.description || "").trim();
      const practiceRouting =
        ci.practiceRouting && typeof ci.practiceRouting === "object"
          ? (ci.practiceRouting as Record<string, unknown>)
          : {};
      const targetLabAnchorId = String(
        practiceRouting.targetLabAnchorId || r.targetLabAnchorId || "",
      ).trim();
      const matchingMode =
        String(practiceRouting.matchingMode || r.matchingMode || "").trim() === "auto"
          ? "auto"
          : "direct";
      const targetLabFromRouting = String(
        practiceRouting.targetLabName || r.targetLabName || "",
      ).trim();
      const handledByCertifiedPartner = Boolean(
        r.handledByCertifiedPartner ||
          (practiceRouting as { handledByCertifiedPartner?: unknown })
            .handledByCertifiedPartner,
      );
      const targetLabRaw =
        matchingMode === "auto"
          ? "어벗츠기공소"
          : targetLabFromRouting || extractLabNameFromMessage(message) || "-";
      const targetLab = formatPracticeTargetLabLabel({
        targetLab: targetLabRaw,
        handledByCertifiedPartner,
      });
      const createdAtRaw = String(r.createdAt || "");
      const strippedTransferMemo = stripPracticeTransferMessageEnvelope(message);
      const parsedMemo = parsePracticeTransferMemoMetaShared(strippedTransferMemo);
      const transferMemo = extractTransferMemoFromMessage(message);
      const toothWorksFromApi = Array.isArray(r.toothWorks) ? r.toothWorks : [];
      const toothNumbersLabel = formatToothNumbersForCard([
        ...toothWorksFromApi,
        ...(Array.isArray(parsedMemo.toothWorks) ? parsedMemo.toothWorks : []),
        String(ci.tooth || "").trim(),
      ]);
      const toothNumbers = toothNumbersLabel
        ? toothNumbersLabel.split(",").filter(Boolean)
        : [];
      const orderDate = String(r.orderDate || parsedMemo.orderDate || "").trim();
      const arrivalDate = String(r.arrivalDate || parsedMemo.arrivalDate || "").trim();
      const orderDatesRaw = Array.isArray(r.orderDates)
        ? (r.orderDates as unknown[])
            .map((d) => String(d || "").trim())
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        : [];
      const orderDates =
        orderDatesRaw.length > 0
          ? orderDatesRaw.includes(orderDate) || !orderDate
            ? orderDatesRaw
            : [...orderDatesRaw, orderDate]
          : orderDate
            ? [orderDate]
            : [];
      const arrivalDatesRaw = Array.isArray(r.arrivalDates)
        ? (r.arrivalDates as unknown[])
            .map((d) => String(d || "").trim())
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        : [];
      const arrivalDates =
        arrivalDatesRaw.length > 0
          ? arrivalDatesRaw.includes(arrivalDate) || !arrivalDate
            ? arrivalDatesRaw
            : [...arrivalDatesRaw, arrivalDate]
          : arrivalDate
            ? [arrivalDate]
            : [];
      const fileObj =
        ci.file && typeof ci.file === "object" ? (ci.file as Record<string, unknown>) : {};

      const patientName = String(ci.patientName || "").trim() || "-";
      const requestId = String(r.requestId || r._id || "").trim();
      const requestMongoId = String(r.practiceTransferId || r._id || "").trim();
      const filesFromApi = mapApiFileItems(r.files);
      const legacyFileName = String(fileObj.originalName || fileObj.name || "").trim();
      const legacyS3Key = String(fileObj.s3Key || "").trim();
      const legacySize = Number(fileObj.size || 0);
      const files =
        filesFromApi.length > 0
          ? filesFromApi
          : legacyFileName && legacyS3Key
            ? [
                {
                  fileName: legacyFileName,
                  s3Key: legacyS3Key,
                  size: legacySize,
                },
              ]
            : [];
      const primaryFile = files[0];
      const resultFiles = mapApiFileItems(r.resultFiles);
      const productionRaw =
        r.production && typeof r.production === "object"
          ? (r.production as Record<string, unknown>)
          : null;
      const designFiles = mapApiFileItems(productionRaw?.designFiles);

      return {
        id: requestId,
        requestMongoId,
        createdAt: toDateLabel(createdAtRaw),
        requestDate: toDayLabel(createdAtRaw),
        patientName,
        patientKey: normalizePatientNameKey(patientName),
        toothNumbers,
        targetLab,
        targetLabAnchorId: matchingMode === "auto" ? "" : targetLabAnchorId,
        matchingMode,
        status: resolvePracticeRecentDisplayStatus({
          manufacturerStage: r.manufacturerStage,
          abutmentDeliveryInfo:
            r.abutmentDeliveryInfo && typeof r.abutmentDeliveryInfo === "object"
              ? (r.abutmentDeliveryInfo as PracticeRecentRequestItem["abutmentDeliveryInfo"])
              : null,
          designFiles,
          designFileCount: productionRaw?.designFileCount,
          designReadyAt: productionRaw?.designReadyAt,
          resultFiles,
          productionConfirmedAt: productionRaw?.confirmedAt,
          skipDesignConfirm: productionRaw?.skipDesignConfirm !== false,
        }),
        createdAtTs: new Date(createdAtRaw).getTime(),
        transferId:
          String(r.transferId || "").trim() ||
          extractTransferIdFromMessage(message),
        orderDate,
        orderDates,
        arrivalDate,
        arrivalDates,
        transferMemo,
        rawTransferMemo: strippedTransferMemo,
        fileName: primaryFile?.fileName || "",
        fileS3Key: primaryFile?.s3Key || "",
        fileSize: Number(primaryFile?.size || 0),
        files,
        resultFiles,
        designFiles,
        hasCustomAbutment: Boolean(r.hasCustomAbutment),
        productionConfirmedAt: productionRaw?.confirmedAt
          ? String(productionRaw.confirmedAt)
          : null,
        abutmentDeliveryInfo:
          r.abutmentDeliveryInfo && typeof r.abutmentDeliveryInfo === "object"
            ? (r.abutmentDeliveryInfo as PracticeRecentRequestItem["abutmentDeliveryInfo"])
            : null,
        skipDesignConfirm: productionRaw?.skipDesignConfirm !== false,
        skipJig: Boolean(productionRaw?.skipJig),
        designReadyAt: productionRaw?.designReadyAt
          ? String(productionRaw.designReadyAt)
          : null,
        designFileCount: Math.max(
          Number(productionRaw?.designFileCount || 0),
          designFiles.length,
        ),
        practiceDesignConfirmedAt: productionRaw?.practiceDesignConfirmedAt
          ? String(productionRaw.practiceDesignConfirmedAt)
          : null,
        labDesignConfirmedAt: productionRaw?.labDesignConfirmedAt
          ? String(productionRaw.labDesignConfirmedAt)
          : null,
        feeQuote: parsePracticeTransferFeeQuote(r.feeQuote),
        remakeFeeQuote: parsePracticeTransferFeeQuote(
          (r.feeQuote && typeof r.feeQuote === "object"
            ? (r.feeQuote as Record<string, unknown>).remakeFeeQuote
            : null) ?? r.remakeFeeQuote,
        ),
        isRemake: Boolean(
          r.isRemake ||
            (r.remake &&
              typeof r.remake === "object" &&
              (String((r.remake as { sourceTransferId?: unknown }).sourceTransferId || "").trim() ||
                String(
                  (r.remake as { sourceTransferMongoId?: unknown }).sourceTransferMongoId || "",
                ).trim())) ||
            (r.feeQuote &&
              typeof r.feeQuote === "object" &&
              (r.feeQuote as { isRemake?: boolean }).isRemake),
        ),
        remakeSourceTransferId: String(
          (r.remake && typeof r.remake === "object"
            ? (r.remake as { sourceTransferId?: string }).sourceTransferId
            : r.remakeSourceTransferId) || "",
        ).trim(),
        canRateLab: Boolean(r.canRateLab),
        labRating: parsePracticeLabRatingPublic(r.labRating),
        performingLabAnchorId:
          String(r.performingLabAnchorId || "").trim() || null,
        handledByCertifiedPartner,
        toothWorks: toothWorksFromApi,
        prosthesisFollowUps: Array.isArray(r.prosthesisFollowUps)
          ? (r.prosthesisFollowUps as PracticeRecentRequestItem["prosthesisFollowUps"])
          : [],
        requestorDownloadedAt: r.requestorDownloadedAt
          ? String(r.requestorDownloadedAt)
          : r.requestorAcceptedAt
            ? String(r.requestorAcceptedAt)
            : null,
        requestorAcceptedAt: r.requestorAcceptedAt
          ? String(r.requestorAcceptedAt)
          : r.requestorDownloadedAt
            ? String(r.requestorDownloadedAt)
            : null,
      };
    })
    .filter((item) => Boolean(item.id))
    .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

export type ProsthesisFollowUpRecentRequestPatch = {
  transferId: string;
  toothWorks?: PracticeRecentRequestItem["toothWorks"];
  prosthesisFollowUps?: PracticeRecentRequestItem["prosthesisFollowUps"];
  arrivalDate?: string;
  arrivalDates?: string[];
  orderDate?: string;
  orderDates?: string[];
  billing?: { total?: number; labFeeTotal?: number };
  billingDelta?: { total?: number; labFeeTotal?: number };
};

export const isProsthesisFollowUpRealtimeAction = (action: unknown): boolean => {
  const normalized = String(action || "").trim().toLowerCase();
  return (
    normalized === "prosthesis-follow-up" ||
    normalized === "prosthesis-follow-up-cancel" ||
    normalized === "prosthesis-follow-up-update"
  );
};

export const prosthesisFollowUpPatchFromRealtimePayload = (
  payload: Record<string, unknown>,
): ProsthesisFollowUpRecentRequestPatch | null => {
  const transferId = String(payload.transferId || "").trim();
  if (!transferId || !isProsthesisFollowUpRealtimeAction(payload.action)) {
    return null;
  }
  const billingRaw =
    payload.billing && typeof payload.billing === "object"
      ? (payload.billing as { total?: unknown; labFeeTotal?: unknown })
      : null;
  return {
    transferId,
    toothWorks: Array.isArray(payload.toothWorks)
      ? (payload.toothWorks as PracticeRecentRequestItem["toothWorks"])
      : undefined,
    prosthesisFollowUps: Array.isArray(payload.prosthesisFollowUps)
      ? (payload.prosthesisFollowUps as PracticeRecentRequestItem["prosthesisFollowUps"])
      : undefined,
    arrivalDate: payload.arrivalDate != null ? String(payload.arrivalDate).trim() : undefined,
    arrivalDates: Array.isArray(payload.arrivalDates)
      ? payload.arrivalDates.map((d) => String(d || "").trim()).filter(Boolean)
      : undefined,
    orderDate: payload.orderDate != null ? String(payload.orderDate).trim() : undefined,
    orderDates: Array.isArray(payload.orderDates)
      ? payload.orderDates.map((d) => String(d || "").trim()).filter(Boolean)
      : undefined,
    billing: billingRaw
      ? {
          total: Number(billingRaw.total || 0),
          labFeeTotal: Number(billingRaw.labFeeTotal || 0),
        }
      : undefined,
  };
};

export const patchPracticeRecentRequestProsthesisFollowUp = (
  row: PracticeRecentRequestItem,
  patch: ProsthesisFollowUpRecentRequestPatch,
): PracticeRecentRequestItem => {
  const transferId = String(patch.transferId || "").trim();
  if (!transferId || String(row.transferId || "").trim() !== transferId) {
    return row;
  }

  const next: PracticeRecentRequestItem = { ...row };
  if (Array.isArray(patch.toothWorks)) next.toothWorks = patch.toothWorks;
  if (Array.isArray(patch.prosthesisFollowUps)) {
    next.prosthesisFollowUps = patch.prosthesisFollowUps;
  }
  if (Array.isArray(patch.arrivalDates) && patch.arrivalDates.length > 0) {
    next.arrivalDates = [...patch.arrivalDates];
    next.arrivalDate =
      patch.arrivalDate ||
      patch.arrivalDates[patch.arrivalDates.length - 1] ||
      next.arrivalDate;
  } else if (patch.arrivalDate) {
    next.arrivalDate = patch.arrivalDate;
  }
  if (Array.isArray(patch.orderDates) && patch.orderDates.length > 0) {
    next.orderDates = [...patch.orderDates];
    next.orderDate =
      patch.orderDate || patch.orderDates[patch.orderDates.length - 1] || next.orderDate;
  } else if (patch.orderDate) {
    next.orderDate = patch.orderDate;
  }

  if (patch.billing && next.feeQuote) {
    next.feeQuote = {
      ...next.feeQuote,
      labFeeTotal: Math.max(0, Number(patch.billing.labFeeTotal || 0)),
      total: Math.max(0, Number(patch.billing.total || 0)),
    };
  } else if (patch.billingDelta && next.feeQuote) {
    next.feeQuote = {
      ...next.feeQuote,
      labFeeTotal:
        Math.max(0, Number(next.feeQuote.labFeeTotal || 0)) +
        Math.max(0, Number(patch.billingDelta.labFeeTotal || 0)),
      total:
        Math.max(0, Number(next.feeQuote.total || 0)) +
        Math.max(0, Number(patch.billingDelta.total || 0)),
    };
  }

  return next;
};

/** 열린 의뢰상세에 목록 재조회 row를 병합(의뢰·작업 파일·생산 메타·견적). */
export const mergeOpenPracticeTransferFromRequestRows = (
  prev: PracticeRecentTransferItem,
  openRows: PracticeRecentRequestItem[],
): PracticeRecentTransferItem => {
  if (openRows.length === 0) return prev;
  const openRow = openRows[0];
  const mergedRequestFiles = openRows.reduce<PracticeRecentTransferFileItem[]>(
    (acc, row) => mergeFileItemsByS3Key(acc, collectPracticeRequestFiles(row)),
    Array.isArray(prev.files) ? prev.files : [],
  );
  const mergedResultFiles = openRows.reduce<PracticeRecentTransferFileItem[]>(
    (acc, row) => mergeFileItemsByS3Key(acc, row.resultFiles),
    [],
  );
  const mergedDesignFiles = openRows.reduce<PracticeRecentTransferFileItem[]>(
    (acc, row) => mergeFileItemsByS3Key(acc, row.designFiles),
    [],
  );
  const nextDesignFileCount = Math.max(
    ...openRows.map((row) => Number(row.designFileCount || 0)),
    mergedDesignFiles.length,
  );
  const nextFee = openRow.feeQuote;
  const keepBilled = prev.feeQuote?.billed && (!nextFee || !nextFee.billed);
  return {
    ...prev,
    status: openRow.status || prev.status,
    orderDate: openRow.orderDate || prev.orderDate,
    orderDates:
      Array.isArray(openRow.orderDates) && openRow.orderDates.length > 0
        ? [...openRow.orderDates]
        : prev.orderDates,
    arrivalDate: openRow.arrivalDate || prev.arrivalDate,
    arrivalDates:
      Array.isArray(openRow.arrivalDates) && openRow.arrivalDates.length > 0
        ? [...openRow.arrivalDates]
        : prev.arrivalDates,
    files: mergedRequestFiles,
    fileCount: mergedRequestFiles.length,
    fileNames: mergedRequestFiles.map((f) => f.fileName).filter(Boolean),
    resultFiles: mergedResultFiles,
    designFiles: mergedDesignFiles,
    designFileCount: nextDesignFileCount,
    designReadyAt:
      openRows.find((r) => r.designReadyAt)?.designReadyAt || prev.designReadyAt || null,
    practiceDesignConfirmedAt:
      openRows.find((r) => r.practiceDesignConfirmedAt)?.practiceDesignConfirmedAt ||
      prev.practiceDesignConfirmedAt ||
      null,
    labDesignConfirmedAt:
      openRows.find((r) => r.labDesignConfirmedAt)?.labDesignConfirmedAt ||
      prev.labDesignConfirmedAt ||
      null,
    productionConfirmedAt:
      openRows.find((r) => r.productionConfirmedAt)?.productionConfirmedAt ||
      prev.productionConfirmedAt ||
      null,
    abutmentDeliveryInfo:
      openRows.find((r) => r.abutmentDeliveryInfo)?.abutmentDeliveryInfo ||
      prev.abutmentDeliveryInfo ||
      null,
    skipDesignConfirm:
      openRows.some((r) => r.skipDesignConfirm === false)
        ? false
        : prev.skipDesignConfirm !== false,
    skipJig: openRows.some((r) => r.skipJig === false)
      ? false
      : Boolean(prev.skipJig || openRows.some((r) => r.skipJig)),
    hasCustomAbutment:
      prev.hasCustomAbutment || openRows.some((r) => Boolean(r.hasCustomAbutment)),
    canRateLab: prev.canRateLab || openRows.some((r) => Boolean(r.canRateLab)),
    labRating:
      openRows.find((r) => r.labRating)?.labRating || prev.labRating || null,
    performingLabAnchorId:
      openRows.find((r) => r.performingLabAnchorId)?.performingLabAnchorId ||
      prev.performingLabAnchorId ||
      null,
    handledByCertifiedPartner:
      Boolean(prev.handledByCertifiedPartner) ||
      openRows.some((r) => Boolean(r.handledByCertifiedPartner)),
    toothWorks:
      openRows.find((r) => Array.isArray(r.toothWorks) && r.toothWorks.length > 0)
        ?.toothWorks ||
      prev.toothWorks ||
      [],
    prosthesisFollowUps:
      openRows.find(
        (r) => Array.isArray(r.prosthesisFollowUps) && r.prosthesisFollowUps.length > 0,
      )?.prosthesisFollowUps ||
      prev.prosthesisFollowUps ||
      [],
    requestorDownloadedAt:
      openRows.find((r) => String(r.requestorDownloadedAt || r.requestorAcceptedAt || "").trim())
        ?.requestorDownloadedAt ||
      openRows.find((r) => String(r.requestorAcceptedAt || "").trim())?.requestorAcceptedAt ||
      prev.requestorDownloadedAt ||
      prev.requestorAcceptedAt ||
      null,
    requestorAcceptedAt:
      openRows.find((r) => String(r.requestorAcceptedAt || r.requestorDownloadedAt || "").trim())
        ?.requestorAcceptedAt ||
      openRows.find((r) => String(r.requestorDownloadedAt || "").trim())?.requestorDownloadedAt ||
      prev.requestorAcceptedAt ||
      prev.requestorDownloadedAt ||
      null,
    matchingMode: openRow.matchingMode || prev.matchingMode,
    ...(keepBilled ? {} : nextFee ? { feeQuote: nextFee } : {}),
    ...(openRow.remakeFeeQuote ? { remakeFeeQuote: openRow.remakeFeeQuote } : {}),
  };
};

export type PracticeRecentDateAnchor = "createdAt" | "orderDate" | "arrivalDate";

export const resolvePracticeRequestAnchorYmd = (
  request: {
    createdAtTs?: number;
    requestDate?: string;
    orderDate?: string;
    arrivalDate?: string;
  },
  dateKey: PracticeRecentDateAnchor = "createdAt",
): string | null => {
  if (dateKey === "orderDate") return toKstYmdLoose(request.orderDate);
  if (dateKey === "arrivalDate") return toKstYmdLoose(request.arrivalDate);
  const fromTs = Number(request.createdAtTs || 0);
  if (Number.isFinite(fromTs) && fromTs > 0) return toKstYmd(fromTs);
  return toKstYmdLoose(request.requestDate);
};

export const filterRequestsByPeriodAndSearch = (
  requests: PracticeRecentRequestItem[],
  period: PeriodFilterValue,
  searchTerm: string,
  options?: {
    customStartDate?: string;
    customEndDate?: string;
    dateKey?: PracticeRecentDateAnchor;
    /** true면 기간 없이 검색만 적용 */
    skipPeriod?: boolean;
  },
) => {
  const query = searchTerm.trim().toLowerCase();
  const dateKey = options?.dateKey || "createdAt";

  const periodFiltered = options?.skipPeriod
    ? requests
    : (() => {
        const range = periodToRange(period, {
          customStartDate: options?.customStartDate ?? "",
          customEndDate: options?.customEndDate ?? "",
        });
        const startYmd = toKstYmd(range.startDate) || "";
        const endYmd = toKstYmd(range.endDate) || "";
        return requests.filter((request) => {
          const ymd = resolvePracticeRequestAnchorYmd(request, dateKey);
          if (!ymd) return false;
          if (startYmd && ymd < startYmd) return false;
          if (endYmd && ymd > endYmd) return false;
          return true;
        });
      })();

  if (!query) return periodFiltered;

  return periodFiltered.filter((request) => {
    const searchableText = [
      request.id,
      request.transferId,
      request.createdAt,
      request.requestDate,
      request.patientName,
      request.toothNumbers.join(" "),
      request.targetLab,
      request.orderDate,
      request.arrivalDate,
      request.status,
      request.fileName,
      ...(Array.isArray(request.files)
        ? request.files.map((f) => f.fileName)
        : []),
      request.transferMemo,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(query);
  });
};

export const groupPracticeRecentRequests = (
  requests: PracticeRecentRequestItem[],
  chatRooms: ChatRoom[],
): PracticeRecentTransferItem[] => {
  const unreadByTransferId = new Map<string, number>();
  const latestChatTsByTransferId = new Map<string, number>();
  for (const room of chatRooms) {
    const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
    if (!transferId) continue;
    unreadByTransferId.set(transferId, Number(room.unreadCount || 0));

    const lastTs = new Date(String(room.lastMessageAt || "")).getTime();
    if (Number.isFinite(lastTs) && lastTs > 0) {
      latestChatTsByTransferId.set(transferId, lastTs);
    }
  }

  const byKey = new Map<
    string,
    PracticeRecentTransferItem & {
      _statuses: Set<string>;
      _patients: Set<string>;
      _toothNumbers: Set<string>;
      _requestIds: Set<string>;
      _transferMongoIds: Set<string>;
      _files: Map<string, PracticeRecentTransferFileItem>;
    }
  >();

  const mergeToothNumbers = (
    into: Set<string>,
    numbers: string[] | undefined,
  ) => {
    for (const n of numbers || []) {
      const tooth = String(n || "").trim();
      if (/^[1-4][1-8]$/.test(tooth)) into.add(tooth);
    }
  };

  const toothNumbersFromSet = (set: Set<string>) => {
    const label = formatToothNumbersForCard(Array.from(set));
    return label ? label.split(",").filter(Boolean) : [];
  };

  for (const req of requests) {
    const minuteBucket = Math.floor(Number(req.createdAtTs || 0) / (60 * 1000));
    const fallbackKey = `${minuteBucket}|${String(req.targetLab || "-")}`;
    const key = req.transferId || fallbackKey;

    const patientKey = String(req.patientKey || "").trim();
    const existing = byKey.get(key);
    if (!existing) {
      const initialPatients = new Set<string>();
      if (patientKey) initialPatients.add(patientKey);

      const requestIds = new Set<string>([req.id]);
      const transferMongoIds = new Set<string>();
      if (req.requestMongoId) transferMongoIds.add(req.requestMongoId);
      const files = new Map<string, PracticeRecentTransferFileItem>();
      for (const file of collectPracticeRequestFiles(req)) {
        files.set(file.s3Key, file);
      }
      const unreadCount = Number(unreadByTransferId.get(req.transferId) || 0);
      const fileList = Array.from(files.values());
      const toothNumberSet = new Set<string>();
      mergeToothNumbers(toothNumberSet, req.toothNumbers);
      byKey.set(key, {
        id: req.id,
        transferId: req.transferId || "-",
        deleteTargetLabel: req.transferId || req.id,
        createdAt: req.createdAt,
        createdAtTs: req.createdAtTs,
        requestDate: req.requestDate,
        targetLab: req.targetLab,
        orderDate: req.orderDate,
        orderDates: Array.isArray(req.orderDates) ? [...req.orderDates] : undefined,
        arrivalDate: req.arrivalDate,
        arrivalDates: Array.isArray(req.arrivalDates) ? [...req.arrivalDates] : undefined,
        status: req.status,
        fileCount: fileList.length,
        patientCount: Math.max(1, initialPatients.size),
        requestIds: [req.id],
        transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
        fileNames: fileList.map((f) => f.fileName).filter(Boolean),
        files: fileList,
        resultFiles: Array.isArray(req.resultFiles) ? [...req.resultFiles] : [],
        designFiles: Array.isArray(req.designFiles) ? [...req.designFiles] : [],
        hasCustomAbutment: Boolean(req.hasCustomAbutment),
        productionConfirmedAt: req.productionConfirmedAt || null,
        abutmentDeliveryInfo: req.abutmentDeliveryInfo || null,
        skipDesignConfirm: req.skipDesignConfirm !== false,
        skipJig: Boolean(req.skipJig),
        designReadyAt: req.designReadyAt || null,
        designFileCount: Math.max(
          Number(req.designFileCount || 0),
          Array.isArray(req.designFiles) ? req.designFiles.length : 0,
        ),
        practiceDesignConfirmedAt: req.practiceDesignConfirmedAt || null,
        labDesignConfirmedAt: req.labDesignConfirmedAt || null,
        transferMemo: req.transferMemo,
        rawTransferMemo: req.rawTransferMemo,
        toothNumbers: toothNumbersFromSet(toothNumberSet),
        targetLabAnchorId: req.targetLabAnchorId,
        matchingMode: req.matchingMode,
        feeQuote: req.feeQuote || null,
        remakeFeeQuote: req.remakeFeeQuote || req.feeQuote?.remakeFeeQuote || null,
        isRemake: Boolean(req.isRemake),
        remakeSourceTransferId: req.remakeSourceTransferId || "",
        canRateLab: Boolean(req.canRateLab),
        labRating: req.labRating || null,
        performingLabAnchorId: req.performingLabAnchorId || null,
        handledByCertifiedPartner: Boolean(req.handledByCertifiedPartner),
        toothWorks: Array.isArray(req.toothWorks) ? [...req.toothWorks] : [],
        prosthesisFollowUps: Array.isArray(req.prosthesisFollowUps)
          ? [...req.prosthesisFollowUps]
          : [],
        requestorDownloadedAt: String(
          req.requestorDownloadedAt || req.requestorAcceptedAt || "",
        ).trim() || null,
        requestorAcceptedAt: String(
          req.requestorAcceptedAt || req.requestorDownloadedAt || "",
        ).trim() || null,
        unreadCount,
        searchBlob: [
          req.id,
          req.createdAt,
          req.requestDate,
          req.patientName,
          req.toothNumbers.join(" "),
          req.targetLab,
          req.orderDate,
          req.arrivalDate,
          req.status,
          req.transferMemo,
          req.transferId,
          ...fileList.map((f) => f.fileName),
        ]
          .join(" ")
          .toLowerCase(),
        _statuses: new Set([req.status]),
        _patients: initialPatients,
        _toothNumbers: toothNumberSet,
        _requestIds: requestIds,
        _transferMongoIds: transferMongoIds,
        _files: files,
      });
      continue;
    }

    for (const file of collectPracticeRequestFiles(req)) {
      existing._files.set(file.s3Key, file);
    }
    existing.files = Array.from(existing._files.values());
    existing.fileNames = existing.files.map((f) => f.fileName).filter(Boolean);
    existing.fileCount = existing.files.length;
    if (patientKey) {
      existing._patients.add(patientKey);
    }
    existing.patientCount = Math.max(1, existing._patients.size);
    mergeToothNumbers(existing._toothNumbers, req.toothNumbers);
    existing.toothNumbers = toothNumbersFromSet(existing._toothNumbers);
    existing._requestIds.add(req.id);
    existing.requestIds = Array.from(existing._requestIds);
    if (req.requestMongoId) {
      existing._transferMongoIds.add(req.requestMongoId);
      existing.transferMongoIds = Array.from(existing._transferMongoIds);
    }
    existing._statuses.add(req.status);
    if (!existing.rawTransferMemo && req.rawTransferMemo) {
      existing.rawTransferMemo = req.rawTransferMemo;
    }
    if (!existing.transferMemo && req.transferMemo) {
      existing.transferMemo = req.transferMemo;
    }
    if (!existing.orderDate && req.orderDate) {
      existing.orderDate = req.orderDate;
    }
    if (Array.isArray(req.orderDates) && req.orderDates.length > 0) {
      existing.orderDates = [...req.orderDates];
      existing.orderDate =
        req.orderDates[req.orderDates.length - 1] || existing.orderDate;
    }
    if (!existing.arrivalDate && req.arrivalDate) {
      existing.arrivalDate = req.arrivalDate;
    }
    if (Array.isArray(req.arrivalDates) && req.arrivalDates.length > 0) {
      existing.arrivalDates = [...req.arrivalDates];
      existing.arrivalDate =
        req.arrivalDates[req.arrivalDates.length - 1] || existing.arrivalDate;
    }
    if (Array.isArray(req.resultFiles) && req.resultFiles.length > 0) {
      existing.resultFiles = mergeFileItemsByS3Key(existing.resultFiles, req.resultFiles);
    }
    if (Array.isArray(req.designFiles) && req.designFiles.length > 0) {
      existing.designFiles = mergeFileItemsByS3Key(existing.designFiles, req.designFiles);
    }
    if (req.hasCustomAbutment) existing.hasCustomAbutment = true;
    if (req.abutmentDeliveryInfo) {
      existing.abutmentDeliveryInfo = req.abutmentDeliveryInfo;
    }
    if (Array.isArray(req.toothWorks) && req.toothWorks.length > 0) {
      existing.toothWorks = [...req.toothWorks];
    }
    if (Array.isArray(req.prosthesisFollowUps) && req.prosthesisFollowUps.length > 0) {
      existing.prosthesisFollowUps = [...req.prosthesisFollowUps];
    }
    const reqAcceptedAt = String(
      req.requestorDownloadedAt || req.requestorAcceptedAt || "",
    ).trim();
    if (reqAcceptedAt) {
      existing.requestorDownloadedAt = reqAcceptedAt;
      existing.requestorAcceptedAt = reqAcceptedAt;
    }
    if (req.skipDesignConfirm === false) existing.skipDesignConfirm = false;
    if (req.skipJig === false) existing.skipJig = false;
    else if (req.skipJig) existing.skipJig = true;
    if (req.designReadyAt) existing.designReadyAt = req.designReadyAt;
    {
      const nextDesignCount = Math.max(
        Number(req.designFileCount || 0),
        Array.isArray(req.designFiles) ? req.designFiles.length : 0,
        Array.isArray(existing.designFiles) ? existing.designFiles.length : 0,
      );
      if (nextDesignCount > Number(existing.designFileCount || 0)) {
        existing.designFileCount = nextDesignCount;
      }
    }
    if (req.practiceDesignConfirmedAt) {
      existing.practiceDesignConfirmedAt = req.practiceDesignConfirmedAt;
    }
    if (req.labDesignConfirmedAt) {
      existing.labDesignConfirmedAt = req.labDesignConfirmedAt;
    }
    // 수락·청구 후 확정 feeQuote가 오면 예산 구간 견적을 덮어쓴다.
    if (req.feeQuote) {
      if (!existing.feeQuote || req.feeQuote.billed || !existing.feeQuote.billed) {
        existing.feeQuote = req.feeQuote;
      }
    }
    if (!existing.remakeFeeQuote && req.remakeFeeQuote) {
      existing.remakeFeeQuote = req.remakeFeeQuote;
    }
    if (req.isRemake) existing.isRemake = true;
    if (!existing.remakeSourceTransferId && req.remakeSourceTransferId) {
      existing.remakeSourceTransferId = req.remakeSourceTransferId;
    }
    if (!existing.targetLabAnchorId && req.targetLabAnchorId) {
      existing.targetLabAnchorId = req.targetLabAnchorId;
    }
    if (!existing.matchingMode && req.matchingMode) {
      existing.matchingMode = req.matchingMode;
    }
    if (req.canRateLab) existing.canRateLab = true;
    if (req.labRating) existing.labRating = req.labRating;
    if (req.performingLabAnchorId) {
      existing.performingLabAnchorId = req.performingLabAnchorId;
    }
    if (req.handledByCertifiedPartner) {
      existing.handledByCertifiedPartner = true;
      existing.targetLab = formatPracticeTargetLabLabel({
        targetLab: String(existing.targetLab || "")
          .replace(/\s·\s인증 협력 기공소에서 처리$/, "")
          .trim(),
        handledByCertifiedPartner: true,
      });
    }
    if (req.productionConfirmedAt) {
      existing.productionConfirmedAt = req.productionConfirmedAt;
    }
    if (req.createdAtTs > existing.createdAtTs) {
      existing.createdAtTs = req.createdAtTs;
      existing.createdAt = req.createdAt;
      existing.requestDate = req.requestDate;
    }

    existing.unreadCount = Number(unreadByTransferId.get(existing.transferId) || 0);

    existing.searchBlob = `${existing.searchBlob} ${[
      req.patientName,
      req.toothNumbers.join(" "),
      req.id,
      req.orderDate,
      req.arrivalDate,
      req.transferMemo,
      req.fileName,
      ...collectPracticeRequestFiles(req).map((f) => f.fileName),
    ].join(" ")}`.toLowerCase();
    if (!existing.transferId || existing.transferId === "-") {
      existing.deleteTargetLabel = req.id;
    }

    const statusSet = existing._statuses;
    if (statusSet.size === 1) {
      existing.status = [...statusSet][0] || existing.status;
    } else if (statusSet.has("생산진행")) {
      existing.status = "생산진행";
    } else if (statusSet.has("작업완료")) {
      existing.status = "작업완료";
    } else if (statusSet.has("발송완료")) {
      existing.status = "발송완료";
    } else if (statusSet.has("수신완료")) {
      existing.status = "수신완료";
    } else if (statusSet.has("의뢰수락") || statusSet.has("다운로드완료")) {
      existing.status = "의뢰수락";
    } else if (statusSet.has("작업취소")) {
      existing.status = "작업취소";
    } else if (statusSet.has("거부")) {
      existing.status = "거부";
    } else if (statusSet.has("취소")) {
      existing.status = "취소";
    } else {
      existing.status = "발송완료";
    }
  }

  return [...byKey.values()]
    .map(
      ({
        _statuses: _s,
        _patients: _p,
        _toothNumbers: _tn,
        _requestIds: _r,
        _transferMongoIds: _tm,
        _files: _f,
        ...row
      }) => ({
      ...row,
      files: Array.isArray(row.files) ? row.files : [],
      fileNames: Array.isArray(row.fileNames) ? row.fileNames : [],
      deleteTargetLabel:
        row.transferId && row.transferId !== "-"
          ? row.transferId
          : row.id,
    }))
    .sort((a, b) => {
      const aChatTs = Number(latestChatTsByTransferId.get(a.transferId) || 0);
      const bChatTs = Number(latestChatTsByTransferId.get(b.transferId) || 0);
      const aSortTs = aChatTs > 0 ? aChatTs : Number(a.createdAtTs || 0);
      const bSortTs = bChatTs > 0 ? bChatTs : Number(b.createdAtTs || 0);
      return bSortTs - aSortTs;
    });
};

const emptyPracticeRecentStatusCounts = (): PracticeRecentStatusCounts => ({
  sent: 0,
  canceled: 0,
  accepted: 0,
  rejected: 0,
  abutment: 0,
});

const bumpPracticeRecentStatusCount = (
  acc: PracticeRecentStatusCounts,
  transfer: {
    status?: unknown;
    designFileCount?: unknown;
    designFiles?: unknown;
    designReadyAt?: unknown;
  },
  delta: number,
) => {
  if (delta <= 0) return;
  const status = String(transfer.status || "").trim();
  if (isPracticeRecentRejectBadgeStatus(status)) {
    acc.rejected += delta;
    return;
  }
  if (isPracticeRecentCancelBadgeStatus(status)) {
    acc.canceled += delta;
    return;
  }
  if (isPracticeRecentAbutmentBadgeStatus(transfer)) {
    acc.abutment += delta;
    return;
  }
  if (
    status === "의뢰수락" ||
    status === "다운로드완료" ||
    status === "작업완료"
  ) {
    acc.accepted += delta;
    return;
  }
  // 발송완료·수신완료·자동매칭(공개 풀) → 의뢰
  acc.sent += delta;
};

export const computeGroupedStatusCounts = (
  groupedTransfers: PracticeRecentTransferItem[],
): PracticeRecentStatusCounts =>
  groupedTransfers.reduce((acc, request) => {
    bumpPracticeRecentStatusCount(acc, request, 1);
    return acc;
  }, emptyPracticeRecentStatusCounts());

/** 상태 뱃지별 채팅 unread 합. */
export const computeGroupedStatusUnreadCounts = (
  groupedTransfers: PracticeRecentTransferItem[],
): PracticeRecentStatusCounts =>
  groupedTransfers.reduce((acc, request) => {
    const unread = Math.max(0, Number(request.unreadCount || 0));
    if (unread <= 0) return acc;
    bumpPracticeRecentStatusCount(acc, request, unread);
    return acc;
  }, emptyPracticeRecentStatusCounts());

export const filterGroupedTransfersByStatus = (
  groupedTransfers: PracticeRecentTransferItem[],
  statusFilter: PracticeRecentStatusFilter | ReadonlySet<PracticeRecentStatusFilterKey>,
) => {
  if (statusFilter instanceof Set) {
    return groupedTransfers.filter((transfer) =>
      practiceTransferMatchesStatusFilters(transfer, statusFilter),
    );
  }
  // 레거시 단일 필터: all = 기본 ON 세트(6상태 전부)
  if (statusFilter === "all") {
    return groupedTransfers.filter((transfer) =>
      practiceTransferMatchesStatusFilters(
        transfer,
        createPracticeRecentStatusFilterSet(),
      ),
    );
  }
  return groupedTransfers.filter((transfer) =>
    practiceTransferMatchesStatusFilters(
      transfer,
      createPracticeRecentStatusFilterSet([statusFilter]),
    ),
  );
};
