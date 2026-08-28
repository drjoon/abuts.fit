/**
 * 치과 기공의뢰 — 최근 전송 목록 매핑·그룹·필터 SSOT.
 * 상단 6뱃지 취소=작업취소·휴지통(취소·거부). 리메이크는 발송 건 재의뢰 플래그(파이프라인과 병행).
 * 전체보기 모달 취소 뱃지=작업취소·휴지통(취소·거부). 채팅 unread는 상태 뱃지별 합산.
 * 자동매칭(공개 풀)은 공정상 의뢰 — 뱃지 집계·「의뢰」필터에 포함. 카드 뱃지 문구도「의뢰」(수락 후「수락」).
 * 표시명만 UI 마스킹.
 * 2026-08-21: 전체보기 취소 뱃지에 휴지통(취소·거부) 포함 + 상태 뱃지별 unread 합.
 * 2026-08-21: 상단 상태 뱃지 다중 표시 on/off — 켠 항목만 캘린더 표시(기본 전부 ON).
 * 2026-08-23: 기본 ON에 취소(휴지통·작업취소) 포함 — 다른 상태와 동일.
 * 2026-08-17: transferId API 필드 우선 매핑(메시지 파싱 폴백) — 채팅 unread 카드 배지 정합.
 * 2026-08-14: 전체보기 모달은 사이드바와 같은 GET /my 1페이지를 재사용(중복 요청 제거).
 * 2026-08-14: 자동매칭 → 의뢰 집계/필터·뱃지 라벨. matchingMode=auto 기공소명 UI 마스킹.
 * 2026-08-16: 작업 파일(designFiles·resultFiles)·생산 메타를 사이드바·전체보기 공통 매핑.
 * 2026-08-19: 기간 필터는 periodToRange(커스텀 시작~끝) + 주문일/치과도착일 앵커.
 * 2026-08-28: 의뢰 파일 — PracticeTransfer.files[] 전부 매핑(STL·PLY·이미지 등). caseInfos.file 단건 폴백만.
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
};

export type PracticeRecentStatusFilter =
  | "all"
  | "발송완료"
  | "의뢰수락"
  | "작업완료"
  | "취소"
  | "포장.발송"
  | "리메이크";

export type PracticeRecentStatusFilterKey = Exclude<PracticeRecentStatusFilter, "all">;

export type PracticeRecentStatusCounts = {
  sent: number;
  accepted: number;
  completed: number;
  shipping: number;
  remake: number;
  canceled: number;
};

/** 전체보기 기본 ON — 6상태 전부. 「기본」 리셋도 이 집합. */
export const PRACTICE_RECENT_DEFAULT_ON_STATUS_FILTERS: readonly PracticeRecentStatusFilterKey[] =
  ["발송완료", "의뢰수락", "작업완료", "취소", "포장.발송", "리메이크"];

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

export const practiceTransferMatchesStatusFilters = (
  transfer: { status?: unknown; isRemake?: boolean },
  selected: ReadonlySet<PracticeRecentStatusFilterKey>,
) => {
  if (selected.size === 0) return false;

  const status = String(transfer.status || "").trim();
  if (selected.has("리메이크") && transfer.isRemake) return true;
  if (selected.has("취소") && isPracticeRecentCancelBadgeStatus(status)) return true;
  if (selected.has("의뢰수락") && (status === "의뢰수락" || status === "다운로드완료")) {
    return true;
  }
  if (
    selected.has("작업완료") &&
    status === "작업완료"
  ) {
    return true;
  }
  if (
    selected.has("포장.발송") &&
    (status === "생산진행" || status === "포장.발송")
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

export const PRACTICE_REMAKE_BADGE_CLASS =
  "border-amber-400/80 bg-amber-50 text-amber-800 hover:bg-amber-50";

export const canRemakePracticeTransferByStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "생산진행" || s === "포장.발송";
};

/** 최근전송 상단 6뱃지 — 라벨·집계키·빠른툴팁 SSOT. 취소=작업취소+휴지통(취소·거부). */
export const PRACTICE_RECENT_STATUS_BADGES = [
  {
    filter: "발송완료",
    label: "의뢰",
    countKey: "sent",
    tooltip: "치과에서 기공의뢰서 전송 후(자동매칭 공개 풀 포함)",
  },
  {
    filter: "의뢰수락",
    label: "수락",
    countKey: "accepted",
    tooltip: "기공소에서 기공의뢰서 확인 후 작업을 수락한 후",
  },
  {
    filter: "작업완료",
    label: "완료",
    countKey: "completed",
    tooltip: "기공소에서 기공작업을 완료한 뒤 관련 파일을 업로드한 후",
  },
  {
    filter: "취소",
    label: "취소",
    countKey: "canceled",
    tooltip:
      "기공소 작업취소·지정 거부, 또는 휴지통으로 옮긴 취소 건(채팅 미확인 포함)",
  },
  {
    filter: "포장.발송",
    label: "발송",
    countKey: "shipping",
    tooltip: "완료된 기공물을 치과로 발송한 후 (완료 후 1일 경과시)",
  },
  {
    filter: "리메이크",
    label: "리메이크",
    countKey: "remake",
    tooltip: "발송된 기공물을 리메이크 의뢰한 후. 의뢰부터 발송까지 다시 진행됩니다.",
  },
] as const satisfies ReadonlyArray<{
  filter: Exclude<PracticeRecentStatusFilter, "all">;
  label: string;
  countKey: keyof PracticeRecentStatusCounts;
  tooltip: string;
}>;

/** 전체보기 취소 뱃지·필터 — 작업취소 + 휴지통(취소·거부) */
export const isPracticeRecentCancelBadgeStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "작업취소" || s === "취소" || s === "거부";
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

/** 목록/카드 뱃지 라벨 — 상단 필터(의뢰·수락·완료·취소·발송)와 동일 문구 */
export const toStatusBadgeLabel = (status: unknown) => {
  const s = String(status || "").trim();
  if (!s) return "-";
  if (s === "발송완료" || s === "수신완료" || s === "자동매칭" || s === "하청대기") return "의뢰";
  if (s === "의뢰수락" || s === "다운로드완료") return "수락";
  if (s === "작업완료") return "완료";
  if (s === "작업취소" || s === "취소") return "취소";
  if (s === "거부") return "거부";
  if (s === "생산진행" || s === "포장.발송") return "발송";
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
      const toothRaw = String(ci.tooth || "").trim();
      const createdAtRaw = String(r.createdAt || "");
      const strippedTransferMemo = stripPracticeTransferMessageEnvelope(message);
      const parsedMemo = parsePracticeTransferMemoMetaShared(strippedTransferMemo);
      const transferMemo = extractTransferMemoFromMessage(message);
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
        toothNumbers: toothRaw ? [toothRaw] : [],
        targetLab,
        targetLabAnchorId: matchingMode === "auto" ? "" : targetLabAnchorId,
        matchingMode,
        status: toStatusLabel(r.manufacturerStage),
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
      };
    })
    .filter((item) => Boolean(item.id))
    .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

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
      _requestIds: Set<string>;
      _transferMongoIds: Set<string>;
      _files: Map<string, PracticeRecentTransferFileItem>;
    }
  >();

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
    .map(({ _statuses: _s, _patients: _p, _requestIds: _r, _transferMongoIds: _tm, _files: _f, ...row }) => ({
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
  accepted: 0,
  completed: 0,
  shipping: 0,
  remake: 0,
  canceled: 0,
});

const bumpPracticeRecentStatusCount = (
  acc: PracticeRecentStatusCounts,
  status: string,
  delta: number,
) => {
  if (delta <= 0) return;
  if (status === "작업완료") {
    acc.completed += delta;
  } else if (status === "생산진행" || status === "포장.발송") {
    acc.shipping += delta;
  } else if (status === "의뢰수락" || status === "다운로드완료") {
    acc.accepted += delta;
  } else if (isPracticeRecentCancelBadgeStatus(status)) {
    acc.canceled += delta;
  } else {
    // 발송완료·수신완료·자동매칭(공개 풀) → 의뢰
    acc.sent += delta;
  }
};

export const computeGroupedStatusCounts = (
  groupedTransfers: PracticeRecentTransferItem[],
): PracticeRecentStatusCounts =>
  groupedTransfers.reduce((acc, request) => {
    const status = String(request.status || "").trim();
    bumpPracticeRecentStatusCount(acc, status, 1);
    if (request.isRemake) acc.remake += 1;
    return acc;
  }, emptyPracticeRecentStatusCounts());

/** 상태 뱃지별 채팅 unread 합(리메이크는 플래그 건 합산, 다른 버킷과 병행). */
export const computeGroupedStatusUnreadCounts = (
  groupedTransfers: PracticeRecentTransferItem[],
): PracticeRecentStatusCounts =>
  groupedTransfers.reduce((acc, request) => {
    const unread = Math.max(0, Number(request.unreadCount || 0));
    if (unread <= 0) return acc;
    const status = String(request.status || "").trim();
    bumpPracticeRecentStatusCount(acc, status, unread);
    if (request.isRemake) acc.remake += unread;
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
