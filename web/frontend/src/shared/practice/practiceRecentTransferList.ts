/**
 * 치과 기공의뢰 — 최근 전송 목록 매핑·그룹·필터 SSOT.
 * 상단 6뱃지 취소=기공소 작업취소. 치과 휴지통(status 취소)은 집계·필터에서 제외.
 */
import { type ChatRoom } from "@/shared/hooks/useChatRooms";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  extractTransferMemoFromMessage as extractTransferMemoFromMessageShared,
  parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
  stripPracticeTransferMessageEnvelope,
} from "@/shared/practice/transferMemo";

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
  status: string;
  createdAtTs: number;
  transferId: string;
  orderDate: string;
  arrivalDate: string;
  transferMemo: string;
  rawTransferMemo: string;
  fileName: string;
  fileS3Key: string;
  fileSize: number;
  resultFiles?: PracticeRecentTransferFileItem[];
  hasCustomAbutment?: boolean;
  productionConfirmedAt?: string | null;
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
  status: string;
  fileCount: number;
  patientCount: number;
  requestIds: string[];
  transferMongoIds: string[];
  fileNames: string[];
  files: PracticeRecentTransferFileItem[];
  resultFiles?: PracticeRecentTransferFileItem[];
  hasCustomAbutment?: boolean;
  productionConfirmedAt?: string | null;
  transferMemo: string;
  rawTransferMemo?: string;
  unreadCount: number;
  searchBlob: string;
};

export type PracticeRecentStatusFilter =
  | "all"
  | "발송완료"
  | "의뢰수락"
  | "작업완료"
  | "취소"
  | "포장.발송"
  | "추적관리";

export type PracticeRecentStatusCounts = {
  sent: number;
  accepted: number;
  completed: number;
  shipping: number;
  tracking: number;
  canceled: number;
};

/** 최근전송 상단 6뱃지 — 라벨·집계키·빠른툴팁 SSOT. 취소=기공소 작업취소(치과 휴지통 제외). */
export const PRACTICE_RECENT_STATUS_BADGES = [
  {
    filter: "발송완료",
    label: "의뢰",
    countKey: "sent",
    tooltip: "치과에서 기공의뢰서 전송 후",
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
    tooltip: "기공소에서 기공작업을 취소한 후",
  },
  {
    filter: "포장.발송",
    label: "발송",
    countKey: "shipping",
    tooltip: "완료된 기공물을 치과로 발송한 후 (완료 후 1일 경과시)",
  },
  {
    filter: "추적관리",
    label: "추적관리",
    countKey: "tracking",
    tooltip: "치과에서 기공물을 받은 후 (발송 후 1일 경과시)",
  },
] as const satisfies ReadonlyArray<{
  filter: Exclude<PracticeRecentStatusFilter, "all">;
  label: string;
  countKey: keyof PracticeRecentStatusCounts;
  tooltip: string;
}>;

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

export const toStatusLabel = (manufacturerStage: unknown) => {
  const raw = String(manufacturerStage || "").trim();
  const lowered = raw.toLowerCase();
  if (!raw) return "발송완료";

  if (raw === "취소") return "취소";
  if (raw === "작업취소") return "작업취소";
  if (raw === "발송완료") return "발송완료";
  if (raw === "수신완료") return "수신완료";
  if (raw === "의뢰수락" || raw === "다운로드완료") return "의뢰수락";
  if (raw === "자동매칭") return "자동매칭";
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

export const toStatusBadgeLabel = (status: unknown) => {
  const s = String(status || "").trim();
  if (s === "작업취소") return "취소";
  return s || "-";
};

export const canDeletePracticeTransferByStatus = (status: unknown) => {
  const s = String(status || "").trim();
  if (s === "임시저장") return true;
  return (
    s === "발송완료" ||
    s === "수신완료" ||
    s === "자동매칭" ||
    s === "작업취소"
  );
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
      const targetLabFromRouting = String(
        practiceRouting.targetLabName || r.targetLabName || "",
      ).trim();
      const targetLab = targetLabFromRouting || extractLabNameFromMessage(message) || "-";
      const toothRaw = String(ci.tooth || "").trim();
      const createdAtRaw = String(r.createdAt || "");
      const strippedTransferMemo = stripPracticeTransferMessageEnvelope(message);
      const parsedMemo = parsePracticeTransferMemoMetaShared(strippedTransferMemo);
      const transferMemo = extractTransferMemoFromMessage(message);
      const orderDate = String(r.orderDate || parsedMemo.orderDate || "").trim();
      const arrivalDate = String(r.arrivalDate || parsedMemo.arrivalDate || "").trim();
      const fileObj =
        ci.file && typeof ci.file === "object" ? (ci.file as Record<string, unknown>) : {};

      const patientName = String(ci.patientName || "").trim() || "-";
      const requestId = String(r.requestId || r._id || "").trim();
      const requestMongoId = String(r.practiceTransferId || r._id || "").trim();
      const resultFilesRaw = Array.isArray(r.resultFiles) ? r.resultFiles : [];
      const resultFiles: PracticeRecentTransferFileItem[] = resultFilesRaw
        .map((row) => {
          const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
          return {
            fileName: String(item.originalName || item.fileName || "").trim(),
            s3Key: String(item.s3Key || "").trim(),
            size: Number(item.size || 0),
          };
        })
        .filter((f) => f.fileName && f.s3Key);
      const productionRaw =
        r.production && typeof r.production === "object"
          ? (r.production as Record<string, unknown>)
          : null;

      return {
        id: requestId,
        requestMongoId,
        createdAt: toDateLabel(createdAtRaw),
        requestDate: toDayLabel(createdAtRaw),
        patientName,
        patientKey: normalizePatientNameKey(patientName),
        toothNumbers: toothRaw ? [toothRaw] : [],
        targetLab,
        targetLabAnchorId,
        status: toStatusLabel(r.manufacturerStage),
        createdAtTs: new Date(createdAtRaw).getTime(),
        transferId: extractTransferIdFromMessage(message),
        orderDate,
        arrivalDate,
        transferMemo,
        rawTransferMemo: strippedTransferMemo,
        fileName: String(fileObj.originalName || fileObj.name || "").trim(),
        fileS3Key: String(fileObj.s3Key || "").trim(),
        fileSize: Number(fileObj.size || 0),
        resultFiles,
        hasCustomAbutment: Boolean(r.hasCustomAbutment),
        productionConfirmedAt: productionRaw?.confirmedAt
          ? String(productionRaw.confirmedAt)
          : null,
      };
    })
    .filter((item) => Boolean(item.id))
    .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

export const filterRequestsByPeriodAndSearch = (
  requests: PracticeRecentRequestItem[],
  period: PeriodFilterValue,
  searchTerm: string,
) => {
  const query = searchTerm.trim().toLowerCase();

  const periodFiltered = requests.filter((request) => {
    if (!request.requestDate || request.requestDate === "-") return false;

    const createdTs = Number(request.createdAtTs || 0);
    if (!Number.isFinite(createdTs) || createdTs <= 0) return true;
    const created = new Date(createdTs);

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = (now.getTime() - createdTs) / dayMs;

    if (period === "30d") return diffDays <= 30;
    if (period === "90d") return diffDays <= 90;

    const y = now.getFullYear();
    const m = now.getMonth();
    const startThisMonth = new Date(y, m, 1, 0, 0, 0, 0);
    const startNextMonth = new Date(y, m + 1, 1, 0, 0, 0, 0);
    const startLastMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);

    if (period === "thisMonth") {
      return created >= startThisMonth && created < startNextMonth;
    }

    return created >= startLastMonth && created < startThisMonth;
  });

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
      if (req.fileName && req.fileS3Key) {
        files.set(req.fileS3Key, {
          fileName: req.fileName,
          s3Key: req.fileS3Key,
          size: Number(req.fileSize || 0),
        });
      }
      const unreadCount = Number(unreadByTransferId.get(req.transferId) || 0);
      const hasFile = Boolean(req.fileName && req.fileS3Key);
      byKey.set(key, {
        id: req.id,
        transferId: req.transferId || "-",
        deleteTargetLabel: req.transferId || req.id,
        createdAt: req.createdAt,
        createdAtTs: req.createdAtTs,
        requestDate: req.requestDate,
        targetLab: req.targetLab,
        orderDate: req.orderDate,
        arrivalDate: req.arrivalDate,
        status: req.status,
        fileCount: hasFile ? 1 : 0,
        patientCount: Math.max(1, initialPatients.size),
        requestIds: [req.id],
        transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
        fileNames: hasFile ? [req.fileName] : [],
        files: hasFile
          ? [{ fileName: req.fileName, s3Key: req.fileS3Key, size: Number(req.fileSize || 0) }]
          : [],
        resultFiles: Array.isArray(req.resultFiles) ? [...req.resultFiles] : [],
        hasCustomAbutment: Boolean(req.hasCustomAbutment),
        productionConfirmedAt: req.productionConfirmedAt || null,
        transferMemo: req.transferMemo,
        rawTransferMemo: req.rawTransferMemo,
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
          req.fileName,
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

    if (req.fileName && req.fileS3Key) {
      existing._files.set(req.fileS3Key, {
        fileName: req.fileName,
        s3Key: req.fileS3Key,
        size: Number(req.fileSize || 0),
      });
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
    if (!existing.arrivalDate && req.arrivalDate) {
      existing.arrivalDate = req.arrivalDate;
    }
    if (Array.isArray(req.resultFiles) && req.resultFiles.length > 0) {
      const byS3Key = new Map(
        (existing.resultFiles || []).map((f) => [f.s3Key, f] as const),
      );
      for (const f of req.resultFiles) {
        if (f.s3Key) byS3Key.set(f.s3Key, f);
      }
      existing.resultFiles = Array.from(byS3Key.values());
    }
    if (req.hasCustomAbutment) existing.hasCustomAbutment = true;
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

export const computeGroupedStatusCounts = (
  groupedTransfers: PracticeRecentTransferItem[],
): PracticeRecentStatusCounts =>
  groupedTransfers.reduce(
    (acc, request) => {
      const status = String(request.status || "").trim();
      if (status === "작업완료") {
        acc.completed += 1;
      } else if (status === "생산진행" || status === "포장.발송") {
        acc.shipping += 1;
      } else if (status === "추적관리") {
        acc.tracking += 1;
      } else if (status === "의뢰수락" || status === "다운로드완료") {
        acc.accepted += 1;
      } else if (status === "작업취소") {
        acc.canceled += 1;
      } else if (status === "자동매칭" || status === "취소") {
        // 치과 휴지통(취소)·자동매칭은 최근전송 뱃지 집계에서 제외
      } else {
        acc.sent += 1;
      }
      return acc;
    },
    { sent: 0, accepted: 0, completed: 0, shipping: 0, tracking: 0, canceled: 0 },
  );

export const filterGroupedTransfersByStatus = (
  groupedTransfers: PracticeRecentTransferItem[],
  statusFilter: PracticeRecentStatusFilter,
) => {
  if (statusFilter === "all") return groupedTransfers;
  return groupedTransfers.filter((transfer) => {
    const status = String(transfer.status || "").trim();
    if (statusFilter === "발송완료") {
      return (
        status === "발송완료" ||
        status === "수신완료" ||
        (status !== "의뢰수락" &&
          status !== "다운로드완료" &&
          status !== "작업완료" &&
          status !== "생산진행" &&
          status !== "자동매칭" &&
          status !== "취소" &&
          status !== "작업취소" &&
          status !== "포장.발송" &&
          status !== "추적관리")
      );
    }
    if (statusFilter === "포장.발송") {
      return status === "생산진행" || status === "포장.발송";
    }
    if (statusFilter === "의뢰수락") {
      return status === "의뢰수락" || status === "다운로드완료";
    }
    if (statusFilter === "취소") {
      return status === "작업취소";
    }
    return status === statusFilter;
  });
};
