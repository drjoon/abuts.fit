/**
 * 치과병의원(practice) 파일전송 페이지.
 *
 * 목적:
 * - 제출 후 바로 도달하는 홈 화면 제공
 * - 상단: 기간필터 + 요약(좌 2x2) + 최근 의뢰(우)
 * - 하단: 스캔 전송 섹션이 남은 영역을 채움
 * - 최근 전송 카드 클릭 시 의뢰 정보 + 기공소 채팅 모달 제공
 *
 * related files:
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 * - web/frontend/src/shared/hooks/useChatRooms.ts
 * - web/frontend/src/shared/hooks/useChatMessages.ts
 * - web/backend/modules/chat/chat.routes.js
 * - web/backend/controllers/chats/chat.controller.js
 * - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * - web/backend/modules/files/file.routes.js
 * - web/backend/controllers/files/file.controller.js
 * - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
 * - web/frontend/src/shared/realtime/socket.ts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  ClipboardList,
  Search,
  Trash2,
  ChevronsUpDown,
  Check,
  MessageSquare,
  Paperclip,
  Download,
  Send,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/shared/ui/cn";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PRACTICE_ACCEPTED_HINT,
  getBusinessLabel,
  usePracticeTransferStep1,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { onAppEvent } from "@/shared/realtime/socket";

type RecentRequestItem = {
  id: string; // 전송 내 파일 row 식별자(표시/그룹/optimistic 삭제용)
  requestMongoId: string; // PracticeTransfer _id (삭제 API 호출용)
  createdAt: string;
  requestDate: string;
  patientName: string;
  patientKey: string;
  toothNumbers: string[];
  targetLab: string;
  status: string;
  createdAtTs: number;
  transferId: string;
  transferMemo: string;
  fileName: string;
  fileS3Key: string;
  fileSize: number;
};

type TransferFileItem = {
  fileName: string;
  s3Key: string;
  size: number;
};

type RecentTransferItem = {
  id: string;
  transferId: string;
  deleteTargetLabel: string;
  createdAt: string;
  createdAtTs: number;
  requestDate: string;
  targetLab: string;
  status: string;
  fileCount: number;
  patientCount: number;
  requestIds: string[];
  transferMongoIds: string[];
  fileNames: string[];
  files: TransferFileItem[];
  transferMemo: string;
  unreadCount: number;
  searchBlob: string;
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

const extractTransferMemoFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  if (!raw) return "";

  return raw
    .split(/\r?\n/)
    .map((line) =>
      String(line || "")
        .replace(/\[\s*기공소\s*:[^\]]*\]/gi, "")
        .replace(/\[\s*전송ID\s*:[^\]]*\]/gi, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
};

const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const normalizePatientNameKey = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";

  let normalized = raw;
  try {
    normalized = normalized.normalize("NFC");
  } catch {
    // ignore
  }

  // 파일명 fallback으로 들어온 환자명 끝 치아 suffix(_47_0, -36-1 등) 제거
  const stripped = normalized
    .replace(/\.(stl|ply|obj)$/i, "")
    .replace(/[_\-\s]*#?\d{1,2}(?:[_\-\s]\d+)?$/, "")
    .trim();

  return (stripped || normalized).toLowerCase();
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

const toStatusLabel = (manufacturerStage: unknown) => {
  const raw = String(manufacturerStage || "").trim();
  if (!raw) return "수신전";

  // 정확값 우선
  if (raw === "취소") return "취소";
  if (raw === "발송완료") return "발송완료";
  if (raw === "수신전") return "수신전";
  if (raw === "수신완료") return "수신완료";

  // 레거시/과거 데이터 호환
  if (raw === "확인전") return "수신전";
  if (raw === "확인") return "수신완료";
  if (raw.includes("전달완료") || raw.includes("배송완료")) return "수신완료";
  if (raw.includes("의뢰") || raw.includes("접수") || raw.includes("대기")) return "수신전";

  return "발송완료";
};

const formatChatTs = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const formatFileSize = (bytes: number) => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
};

export const PracticeFileTransferPage = () => {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const authToken = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [recentRequestsLoading, setRecentRequestsLoading] = useState(false);
  const [recentRequestsError, setRecentRequestsError] = useState("");
  const [selectedTransfer, setSelectedTransfer] = useState<RecentTransferItem | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatAttachedFiles, setChatAttachedFiles] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetTransfer, setDeleteTargetTransfer] = useState<RecentTransferItem | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const realtimeReloadTimerRef = useRef<number | null>(null);
  const {
    files,
    totalSizeMb,
    selectedLab,
    setSelectedLab,
    requestMemo,
    setRequestMemo,
    labSearch,
    setLabSearch,
    labSearchResults,
    labOpen,
    setLabOpen,
    labSearching,
    recentLabs,
    recentLabsInitialized,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
    rememberLab,
  } = usePracticeTransferStep1();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token: authToken });
  const { rooms: chatRooms } = useChatRooms();

  const {
    messages: chatMessages,
    loading: chatMessagesLoading,
    error: chatMessagesError,
    sendMessage,
  } = useChatMessages({ roomId: activeChatRoom?._id, autoFetch: transferDialogOpen });

  const loadRecentRequests = useCallback(async () => {
    if (!authToken) {
      setRecentRequests([]);
      setRecentRequestsError("로그인이 필요합니다.");
      return;
    }

    setRecentRequestsLoading(true);
    setRecentRequestsError("");
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/my?page=1&limit=100",
        method: "GET",
        token: authToken,
      });

      if (!res.ok) {
        const body =
          res.data && typeof res.data === "object"
            ? (res.data as { message?: string })
            : {};
        setRecentRequests([]);
        setRecentRequestsError(
          String(body.message || "최근 전송 내역을 불러올 권한이 없습니다."),
        );
        return;
      }

      const body = res.data;
      const data =
        body && typeof body === "object" && "data" in (body as Record<string, unknown>)
          ? (body as { data?: unknown }).data
          : body;
      const list =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { requests?: unknown }).requests)
          ? ((data as { requests: unknown[] }).requests ?? [])
          : [];

      const mapped: RecentRequestItem[] = list
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
          const targetLab = extractLabNameFromMessage(message);
          const toothRaw = String(ci.tooth || "").trim();
          const createdAtRaw = String(r.createdAt || "");
          const transferMemo = extractTransferMemoFromMessage(message);
          const fileObj =
            ci.file && typeof ci.file === "object"
              ? (ci.file as Record<string, unknown>)
              : {};

          const patientName = String(ci.patientName || "").trim() || "-";
          const requestId = String(r.requestId || r._id || "").trim();
          const requestMongoId = String(r.practiceTransferId || r._id || "").trim();

          return {
            id: requestId,
            requestMongoId,
            createdAt: toDateLabel(createdAtRaw),
            requestDate: toDayLabel(createdAtRaw),
            patientName,
            patientKey: normalizePatientNameKey(patientName),
            toothNumbers: toothRaw ? [toothRaw] : [],
            targetLab: targetLab || "-",
            status: toStatusLabel(r.manufacturerStage),
            createdAtTs: new Date(createdAtRaw).getTime(),
            transferId: extractTransferIdFromMessage(message),
            transferMemo,
            fileName: String(fileObj.originalName || fileObj.name || "").trim(),
            fileS3Key: String(fileObj.s3Key || "").trim(),
            fileSize: Number(fileObj.size || 0),
          };
        })
        .filter((item) => Boolean(item.id) && String(item.status || "").trim() !== "취소")
        .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

      setRecentRequests(mapped);
    } catch {
      setRecentRequests([]);
      setRecentRequestsError("최근 전송 내역 조회 중 오류가 발생했습니다.");
    } finally {
      setRecentRequestsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void loadRecentRequests();
  }, [loadRecentRequests]);

  const filteredRecentRequests = useMemo(() => {
    const query = requestSearchTerm.trim().toLowerCase();

    const periodFiltered = recentRequests.filter((request) => {
      if (!request.requestDate || request.requestDate === "-") return false;

      const createdTs = Number(request.createdAtTs || 0);
      if (!Number.isFinite(createdTs) || createdTs <= 0) return true;
      const created = new Date(createdTs);

      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;
      const diffDays = (now.getTime() - createdTs) / dayMs;

      if (period === "7d") return diffDays <= 7;
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
        request.createdAt,
        request.requestDate,
        request.patientName,
        request.toothNumbers.join(" "),
        request.targetLab,
        request.status,
        request.fileName,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [recentRequests, requestSearchTerm, period]);

  const groupedTransfers = useMemo(() => {
    const unreadByTransferId = new Map<string, number>();
    for (const room of chatRooms) {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) continue;
      unreadByTransferId.set(transferId, Number(room.unreadCount || 0));
    }

    const byKey = new Map<
      string,
      RecentTransferItem & {
        _statuses: Set<string>;
        _patients: Set<string>;
        _requestIds: Set<string>;
        _transferMongoIds: Set<string>;
        _files: Map<string, TransferFileItem>;
      }
    >();

    for (const req of filteredRecentRequests) {
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
        const files = new Map<string, TransferFileItem>();
        if (req.fileName && req.fileS3Key) {
          files.set(req.fileS3Key, {
            fileName: req.fileName,
            s3Key: req.fileS3Key,
            size: Number(req.fileSize || 0),
          });
        }
        const unreadCount = Number(unreadByTransferId.get(req.transferId) || 0);
        byKey.set(key, {
          id: req.id,
          transferId: req.transferId || "-",
          deleteTargetLabel: req.transferId || req.id,
          createdAt: req.createdAt,
          createdAtTs: req.createdAtTs,
          requestDate: req.requestDate,
          targetLab: req.targetLab,
          status: req.status,
          fileCount: 1,
          patientCount: Math.max(1, initialPatients.size),
          requestIds: [req.id],
          transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
          fileNames: req.fileName ? [req.fileName] : [],
          files: req.fileName && req.fileS3Key
            ? [{ fileName: req.fileName, s3Key: req.fileS3Key, size: Number(req.fileSize || 0) }]
            : [],
          transferMemo: req.transferMemo,
          unreadCount,
          searchBlob: [
            req.id,
            req.createdAt,
            req.requestDate,
            req.patientName,
            req.toothNumbers.join(" "),
            req.targetLab,
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

      existing.fileCount += 1;
      if (patientKey) {
        existing._patients.add(patientKey);
      }
      existing.patientCount = Math.max(1, existing._patients.size);
      existing._statuses.add(req.status);
      existing._requestIds.add(req.id);
      existing.requestIds = Array.from(existing._requestIds);
      if (req.requestMongoId) {
        existing._transferMongoIds.add(req.requestMongoId);
      }
      existing.transferMongoIds = Array.from(existing._transferMongoIds);
      if (req.fileName && req.fileS3Key) {
        existing._files.set(req.fileS3Key, {
          fileName: req.fileName,
          s3Key: req.fileS3Key,
          size: Number(req.fileSize || 0),
        });
      }
      existing.files = Array.from(existing._files.values());
      existing.fileNames = existing.files.map((f) => f.fileName).filter(Boolean);

      if (!existing.transferMemo && req.transferMemo) {
        existing.transferMemo = req.transferMemo;
      }
      if (req.createdAtTs > existing.createdAtTs) {
        existing.createdAtTs = req.createdAtTs;
        existing.createdAt = req.createdAt;
        existing.requestDate = req.requestDate;
      }

      existing.unreadCount = Number(unreadByTransferId.get(existing.transferId) || 0);

      existing.searchBlob = `${existing.searchBlob} ${[req.patientName, req.toothNumbers.join(" "), req.id, req.transferMemo, req.fileName].join(" ")}`.toLowerCase();
      if (!existing.transferId || existing.transferId === "-") {
        existing.deleteTargetLabel = req.id;
      }

      const statusSet = existing._statuses;
      if (statusSet.size === 1) {
        existing.status = [...statusSet][0] || existing.status;
      } else if (statusSet.has("수신전")) {
        existing.status = "수신전";
      } else if (statusSet.has("수신완료")) {
        existing.status = "수신완료";
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
      .sort((a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0));
  }, [filteredRecentRequests, chatRooms]);

  const statusCounts = useMemo(() => {
    return groupedTransfers.reduce(
      (acc, request) => {
        const status = String(request.status || "").trim();
        if (status === "수신완료") {
          acc.delivered += 1;
        } else if (status === "수신전") {
          acc.waiting += 1;
        } else {
          acc.sent += 1;
        }
        return acc;
      },
      { sent: 0, waiting: 0, delivered: 0 },
    );
  }, [groupedTransfers]);

  const extractDataFromResponse = <T,>(raw: unknown): T | null => {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as { data?: unknown };
    if (payload.data === undefined) return raw as T;
    return payload.data as T;
  };

  const asApiMessagePayload = (value: unknown) => {
    if (!value || typeof value !== "object") return {} as { message?: string };
    return value as { message?: string };
  };

  const myIdCandidates = useMemo(() => {
    const ids = [authUser?.id, (authUser as { _id?: string } | null)?._id]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [authUser]);

  const handleOpenTransferDialog = async (transfer: RecentTransferItem) => {
    setSelectedTransfer(transfer);
    setTransferDialogOpen(true);
    setChatDraft("");
    setChatAttachedFiles([]);
    setActiveChatRoom(null);
    setChatError("");

    if (!authToken) {
      setChatError("로그인이 필요합니다.");
      return;
    }

    const transferId = String(transfer.transferId || "").trim();
    if (!transferId || transferId === "-") {
      setChatError("전송 ID를 확인할 수 없어 채팅방을 열 수 없습니다.");
      return;
    }

    setChatLoading(true);
    try {
      const res = await apiFetch<unknown>({
        path: `/api/chats/practice/transfer-room/${encodeURIComponent(transferId)}`,
        method: "GET",
        token: authToken,
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "채팅방을 불러오지 못했습니다."));
      }

      const payload = extractDataFromResponse<ChatRoom>(res.data);
      if (!payload?._id) {
        throw new Error("채팅방 정보가 올바르지 않습니다.");
      }

      setActiveChatRoom(payload);
      setChatError("");
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : "채팅방을 불러오는 중 오류가 발생했습니다.",
      );
    } finally {
      setChatLoading(false);
    }
  };

  const handleCloseTransferDialog = () => {
    setTransferDialogOpen(false);
    setSelectedTransfer(null);
    setActiveChatRoom(null);
    setChatDraft("");
    setChatAttachedFiles([]);
    setChatError("");
  };

  const handleSendChatMessage = async () => {
    if (!activeChatRoom?._id || chatSending) return;

    const content = String(chatDraft || "").trim();
    const files = [...chatAttachedFiles];
    if (!content && files.length === 0) return;

    setChatSending(true);
    try {
      let attachments: Array<{
        fileId?: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        s3Key: string;
        s3Url: string;
      }> = [];

      if (files.length > 0) {
        const uploadedFiles: TempUploadedFile[] = await uploadFilesWithToast(files);
        attachments = uploadedFiles
          .map((f) => ({
            fileId: String(f._id || "").trim() || undefined,
            fileName: String(f.originalName || "").trim(),
            fileType: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
            fileSize: Number(f.size || 0),
            s3Key: String(f.key || "").trim(),
            s3Url: String(f.location || "").trim(),
          }))
          .filter((row) => row.fileName && row.s3Key);
      }

      const sent = await sendMessage(content, attachments);
      if (sent) {
        setChatDraft("");
        setChatAttachedFiles([]);
      }
    } finally {
      setChatSending(false);
    }
  };

  const handleDownloadTransferFile = useCallback(
    async (file: TransferFileItem) => {
      if (!authToken) return;
      const fileName = String(file?.fileName || "첨부파일").trim() || "첨부파일";
      const s3Key = String(file?.s3Key || "").trim();
      if (!s3Key) {
        toast({
          title: "다운로드 실패",
          description: "파일 키를 확인할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const downloadPath = `/api/files/s3/download?key=${encodeURIComponent(s3Key)}&fileName=${encodeURIComponent(fileName)}&_ts=${Date.now()}`;
        const resp = await fetch(downloadPath, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!resp.ok) {
          throw new Error("전송 파일 다운로드 응답이 올바르지 않습니다.");
        }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast({
          title: "다운로드 실패",
          description: "전송 파일 다운로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [authToken, toast],
  );

  const handleDownloadAllTransferFiles = useCallback(async () => {
    const files = Array.isArray(selectedTransfer?.files) ? selectedTransfer.files : [];
    if (!files.length) return;

    await Promise.all(files.map((file) => handleDownloadTransferFile(file)));
  }, [handleDownloadTransferFile, selectedTransfer]);

  const handleDownloadChatAttachment = useCallback(
    async (attachment: {
      fileName?: string;
      fileSize?: number;
      s3Key?: string;
      s3Url?: string;
    }) => {
      if (!authToken) return;

      const rawName = String(attachment?.fileName || "첨부파일").trim() || "첨부파일";
      const s3Key = String(attachment?.s3Key || "").trim();
      if (!s3Key) {
        toast({
          title: "다운로드 실패",
          description: "첨부파일 키를 확인할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const downloadPath = `/api/files/s3/download?key=${encodeURIComponent(s3Key)}&fileName=${encodeURIComponent(rawName)}&_ts=${Date.now()}`;
        const resp = await fetch(downloadPath, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!resp.ok) {
          throw new Error("첨부파일 다운로드 응답이 올바르지 않습니다.");
        }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = rawName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast({
          title: "다운로드 실패",
          description: "첨부파일 다운로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [authToken, toast],
  );

  const handleAttachChatFiles = (inputFiles: FileList | null) => {
    const nextFiles = Array.from(inputFiles || []);
    if (!nextFiles.length) return;

    setChatAttachedFiles((prev) => {
      const map = new Map<string, File>();
      for (const f of [...prev, ...nextFiles]) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        if (!map.has(key)) map.set(key, f);
      }
      return [...map.values()];
    });
  };

  const handleRemoveAttachedChatFile = (idx: number) => {
    setChatAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAskDeleteTransfer = (transfer: RecentTransferItem) => {
    setDeleteTargetTransfer(transfer);
    setDeleteConfirmOpen(true);
  };

  const handleCancelDeleteTransfer = () => {
    if (deletingTransfer) return;
    setDeleteConfirmOpen(false);
    setDeleteTargetTransfer(null);
  };

  const handleConfirmDeleteTransfer = async () => {
    if (deletingTransfer) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    const target = deleteTargetTransfer;
    const requestIds = Array.isArray(target?.requestIds)
      ? target!.requestIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const transferIds = target?.transferId && target.transferId !== "-" ? [target.transferId] : [];
    const transferMongoIds = Array.isArray(target?.transferMongoIds)
      ? target!.transferMongoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!target || (transferIds.length === 0 && transferMongoIds.length === 0)) {
      toast({
        title: "삭제할 전송건이 없습니다",
        variant: "destructive",
      });
      setDeleteConfirmOpen(false);
      setDeleteTargetTransfer(null);
      return;
    }

    setDeletingTransfer(true);

    const deletedSet = new Set(requestIds);
    const previousRecentRequests = recentRequests;

    // optimistic UI: 서버 응답 전 목록에서 즉시 제거
    setRecentRequests((prev) => prev.filter((row) => !deletedSet.has(row.id)));
    setDeleteConfirmOpen(false);
    setDeleteTargetTransfer(null);

    try {
      // related files:
      // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
      // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
      // practice 전용 배치 취소 라우트 사용 (PracticeTransfer SSOT)
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/cancel-batch",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferIds,
          transferMongoIds,
        },
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "전송 의뢰 내역 삭제(취소)에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: { successCount?: number; failedIds?: string[] } })
          : {};
      const data = body.data || {};
      const successCount = Number(data.successCount || 0);
      const failedIds = (Array.isArray(data.failedIds) ? data.failedIds : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean);

      if (successCount <= 0) {
        // 전건 실패 시 optimistic 변경 롤백
        setRecentRequests(previousRecentRequests);
        toast({
          title: "삭제 실패",
          description: "삭제 가능한 단계(의뢰/CAM)인지 확인해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "의뢰 내역 삭제 완료",
          description:
            failedIds.length > 0
              ? `${successCount}건 삭제, ${failedIds.length}건은 단계/권한 제한으로 삭제되지 않았습니다.`
              : `${successCount}건 삭제되었습니다.`,
        });

        // 부분 실패면 서버 기준으로 재동기화(실패 건을 다시 표시)
        if (failedIds.length > 0) {
          void loadRecentRequests();
        }
      }

    } catch (error) {
      // 통신/서버 오류 시 optimistic 변경 롤백
      setRecentRequests(previousRecentRequests);
      toast({
        title: "삭제 실패",
        description:
          error instanceof Error
            ? error.message
            : "전송 의뢰 내역 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeletingTransfer(false);
    }
  };

  useEffect(() => {
    if (!transferDialogOpen || !activeChatRoom?._id) return;
    const raf = window.requestAnimationFrame(() => {
      chatBottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [transferDialogOpen, activeChatRoom?._id, chatMessages.length, chatMessagesLoading]);

  useEffect(() => {
    if (!authToken) return;

    const unsubscribeAppEvent = onAppEvent((evt) => {
      const type = String(evt?.type || "").trim();
      if (type !== "practice:transfer-created" && type !== "practice:transfer-updated") return;

      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
      }
      realtimeReloadTimerRef.current = window.setTimeout(() => {
        void loadRecentRequests();
      }, 160);
    });

    return () => {
      unsubscribeAppEvent?.();
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
    };
  }, [authToken, loadRecentRequests]);

  const handleSubmitPracticeRequest = async () => {
    if (requestSubmitting) return;

    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        description: "다시 로그인 후 시도해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!files.length) {
      toast({
        title: "파일이 필요합니다",
        description: "최소 1개 STL, PLY, OBJ 파일을 업로드해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedLab?._id) {
      toast({
        title: "기공소를 선택해주세요",
        variant: "destructive",
      });
      return;
    }

    if (!String(requestMemo || "").trim()) {
      toast({
        title: "의뢰 메모를 입력해주세요",
        variant: "destructive",
      });
      return;
    }

    setRequestSubmitting(true);
    try {
      const uploadedTempFiles: TempUploadedFile[] = await uploadFilesWithToast(files);

      const clinicName = String(
        (authUser as { business?: string } | null)?.business || authUser?.name || "",
      ).trim();
      const transferId = makeTransferId();
      const transferMemo = String(requestMemo || "").trim();
      const caseInfosPayload = files.map((file, index) => {
        const tempFile = uploadedTempFiles[index];
        const parsed = parseFilenameWithRules(file.name);
        const dotIndex = file.name.lastIndexOf(".");
        const baseName = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
        const fallbackPatientName = String(baseName || `케이스 ${index + 1}`).trim();
        const patientName = String(parsed.patientName || fallbackPatientName).trim();
        const tooth = String(parsed.tooth || "").trim();

        return {
          clinicName,
          patientName,
          tooth,
          workType: "abutment",
          designSoftware: "3Shape",
          file: {
            originalName: tempFile.originalName,
            size: tempFile.size,
            mimetype: tempFile.mimetype,
            s3Key: tempFile.key,
          },
          newSystemRequest: {
            requested: true,
            manufacturer: "",
            brand: "",
            family: "",
            message: `[기공소: ${String(selectedLab?.name || "")}] ${transferMemo}\n[전송ID: ${transferId}]`,
            free: true,
            tag: "practice_file_transfer",
          },
          // related files:
          // - web/backend/models/practiceTransfer.model.js
          // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
          // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
          // practice 제출은 PracticeTransfer SSOT로 저장 (Request 컬렉션 경유 금지)
          practiceRouting: {
            targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
            targetLabName: String(selectedLab?.name || "").trim(),
          },
        };
      });

      const submitRes = await apiFetch<unknown>({
        path: "/api/practice/transfers",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferId,
          targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
          targetLabName: String(selectedLab?.name || "").trim(),
          transferMemo,
          caseInfos: caseInfosPayload,
        },
      });
      if (!submitRes.ok) {
        const body = asApiMessagePayload(submitRes.data);
        throw new Error(String(body?.message || "전송 제출에 실패했습니다."));
      }

      rememberLab(selectedLab);
      await clearAllFiles();
      setRequestMemo("");

      toast({
        title: "전송 제출 완료",
        description: "전송이 정상 접수되었습니다.",
      });
      navigate("/practice/dashboard");
    } catch (error) {
      toast({
        title: "전송 제출 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setRequestSubmitting(false);
    }
  };

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="h-full min-h-0"
    >
      <div className="h-full min-h-0 p-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UploadCloud className="h-4 w-4 text-blue-600" />
                구강 스캔 전송
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-xl border border-dashed bg-background p-4 text-center">
                    <p className="text-base font-semibold">파일을 드래그 & 드롭하세요</p>
                    <p className="mt-1 text-sm text-muted-foreground">{PRACTICE_ACCEPTED_HINT}</p>
                    <div className="mt-3">
                      <input
                        id="practice-file-transfer-input"
                        type="file"
                        accept=".stl,.ply,.obj"
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          const nextFiles = Array.from(e.target.files || []);
                          if (nextFiles.length) handleIncomingFiles(nextFiles);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const input = document.getElementById(
                            "practice-file-transfer-input",
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                      >
                        파일 선택
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold">
                        총 {files.length}개 파일 · 약 {totalSizeMb}MB
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => void clearAllFiles()}
                        disabled={files.length === 0}
                      >
                        전체삭제
                      </Button>
                    </div>
                    {files.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                        아직 추가된 파일이 없습니다.
                      </div>
                    ) : (
                      <div className="mt-3 max-h-[18.5rem] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 gap-2 auto-rows-[4.25rem]">
                          {files.map((file, index) => (
                            <div
                              key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                              className="flex h-[4.25rem] items-center justify-between rounded-md border px-2.5 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-medium">{file.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(file.size / (1024 * 1024)).toFixed(2)}MB
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => removeFile(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-base font-semibold">의뢰 접수</p>

                  <div className="mt-3 space-y-2">
                    <Label className="text-sm">기공소 선택</Label>
                    <Popover open={labOpen} onOpenChange={setLabOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={labOpen}
                          className="h-11 w-full justify-between text-base"
                        >
                          <span className="truncate">
                            {selectedLab
                              ? getBusinessLabel(selectedLab)
                              : "기공소를 검색해서 선택하세요"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="기공소 검색 (사업자명/대표자명/사업자번호/주소)"
                            value={labSearch}
                            onValueChange={(v) => {
                              setLabSearch(v);
                            }}
                          />
                          <CommandList>
                            {!recentLabsInitialized ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">불러오는 중...</div>
                            ) : null}

                            {recentLabs.length > 0 ? (
                              <CommandGroup heading="최근 전송한 기공소">
                                {recentLabs.map((b) => {
                                  const selected = selectedLab?._id === b._id;
                                  const rep = String(b.representativeName || "").trim();
                                  const bn = String(b.businessNumber || "").trim();
                                  const addr = String(b.address || "").trim();
                                  const meta = [
                                    rep ? `대표: ${rep}` : "",
                                    bn ? `사업자: ${bn}` : "",
                                    addr || "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ");
                                  const searchValue = [b.name, rep, bn, addr]
                                    .filter(Boolean)
                                    .join(" ");

                                  return (
                                    <CommandItem
                                      key={`recent-${b._id}`}
                                      value={searchValue}
                                      onSelect={() => {
                                        setSelectedLab(b);
                                        setLabOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selected ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <div className="min-w-0">
                                        <div className="truncate text-base font-medium">
                                          {getBusinessLabel(b)}
                                        </div>
                                        {meta ? (
                                          <div className="truncate text-sm text-muted-foreground">
                                            {meta}
                                          </div>
                                        ) : null}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            ) : (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                최근 전송한 기공소가 없습니다.
                              </div>
                            )}

                            <CommandSeparator />

                            <CommandGroup heading="기공소 검색">
                              {labSearching ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">검색 중...</div>
                              ) : labSearch.trim() ? (
                                labSearchResults.length > 0 ? (
                                  labSearchResults.map((b) => {
                                    const selected = selectedLab?._id === b._id;
                                    const rep = String(b.representativeName || "").trim();
                                    const bn = String(b.businessNumber || "").trim();
                                    const addr = String(b.address || "").trim();
                                    const meta = [
                                      rep ? `대표: ${rep}` : "",
                                      bn ? `사업자: ${bn}` : "",
                                      addr || "",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ");
                                    const searchValue = [b.name, rep, bn, addr]
                                      .filter(Boolean)
                                      .join(" ");

                                    return (
                                      <CommandItem
                                        key={b._id}
                                        value={searchValue}
                                        onSelect={() => {
                                          setSelectedLab(b);
                                          setLabOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            selected ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        <div className="min-w-0">
                                          <div className="truncate text-base font-medium">
                                            {getBusinessLabel(b)}
                                          </div>
                                          {meta ? (
                                            <div className="truncate text-sm text-muted-foreground">
                                              {meta}
                                            </div>
                                          ) : null}
                                        </div>
                                      </CommandItem>
                                    );
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">
                                    검색 결과가 없습니다.
                                  </div>
                                )
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  검색어를 입력하면 기공소를 찾을 수 있습니다.
                                </div>
                              )}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="mt-3 space-y-2">
                    <Label htmlFor="practice-file-transfer-request-memo" className="text-sm">
                      의뢰 메모
                    </Label>
                    <Textarea
                      id="practice-file-transfer-request-memo"
                      value={requestMemo}
                      onChange={(e) => setRequestMemo(e.target.value)}
                      placeholder="예: #36 커스텀 어버트먼트, 마진 라인 메모..."
                      className="min-h-36 text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => void handleSubmitPracticeRequest()}
                  disabled={requestSubmitting}
                >
                  {requestSubmitting ? "파일 보내는 중..." : "파일 보내기"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              최근 전송 내역
            </CardTitle>
            <CardDescription className="space-y-2">
              <div className="flex items-center justify-start">
                <PeriodFilter value={period} onChange={setPeriod} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">발송완료 {statusCounts.sent}건</Badge>
                <Badge variant="outline">수신전 {statusCounts.waiting}건</Badge>
                <Badge variant="outline">수신완료 {statusCounts.delivered}건</Badge>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="의뢰일/치아번호/기공소/파일명/전송ID 검색"
                  className="h-9 pl-9"
                  value={requestSearchTerm}
                  onChange={(event) => setRequestSearchTerm(event.target.value)}
                />
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRequestsLoading ? (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                최근 전송 내역을 불러오는 중입니다...
              </div>
            ) : recentRequestsError ? (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-destructive">
                {recentRequestsError}
              </div>
            ) : groupedTransfers.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                검색 조건에 맞는 의뢰 내역이 없습니다.
              </div>
            ) : (
              groupedTransfers.map((transfer) => (
                <button
                  key={`${transfer.id}:${transfer.createdAt}`}
                  type="button"
                  className="w-full rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3 text-left hover:bg-muted/40"
                  onClick={() => void handleOpenTransferDialog(transfer)}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{transfer.transferId !== "-" ? transfer.transferId : transfer.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {transfer.createdAt} · {transfer.targetLab}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      파일 {transfer.fileCount}개
                      {String(transfer.transferMemo || "").trim()
                        ? ` · ${String(transfer.transferMemo || "").replace(/\s+/g, " ").trim()}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <Badge variant="outline" className="whitespace-nowrap">{transfer.status}</Badge>
                    <div className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAskDeleteTransfer(transfer);
                        }}
                        aria-label="의뢰 내역 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {transfer.unreadCount > 0 ? (
                        <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white leading-none">
                          {transfer.unreadCount > 99 ? "99+" : transfer.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
        </div>

        <Dialog open={transferDialogOpen} onOpenChange={(open) => (open ? setTransferDialogOpen(true) : handleCloseTransferDialog())}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[86vh] flex flex-col">
            <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                의뢰 상세 · 기공소 채팅
              </DialogTitle>
            </DialogHeader>

            <div className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-hidden">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm grid grid-cols-2 gap-3 max-h-[13rem] overflow-y-auto">
                <div>
                  <p className="text-muted-foreground">전송ID</p>
                  <p className="font-medium break-words">{selectedTransfer?.transferId && selectedTransfer.transferId !== "-" ? selectedTransfer.transferId : selectedTransfer?.id || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">전송시각</p>
                  <p className="font-medium">{selectedTransfer?.createdAt || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">기공소</p>
                  <p className="font-medium break-words">{selectedTransfer?.targetLab || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">의뢰 메모</p>
                  <p className="font-medium whitespace-pre-wrap break-words max-h-20 overflow-y-auto pr-1">
                    {selectedTransfer?.transferMemo || "-"}
                  </p>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground">파일 ({selectedTransfer?.fileCount || 0}개)</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDownloadAllTransferFiles()}
                      disabled={!selectedTransfer?.files?.length}
                    >
                      전체 다운로드
                    </Button>
                  </div>
                  {selectedTransfer?.files?.length ? (
                    <div className="mt-1 max-h-32 overflow-y-auto pr-1 space-y-1">
                      {selectedTransfer.files.map((file, idx) => (
                        <button
                          key={`${file.s3Key}:${idx}`}
                          type="button"
                          onClick={() => void handleDownloadTransferFile(file)}
                          className="block w-full text-left rounded border px-2 py-1 text-xs hover:bg-muted/50"
                        >
                          {file.fileName} · {formatFileSize(Number(file.size || 0))}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="font-medium">-</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border h-[24rem] max-h-[24rem] min-h-0 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b text-sm text-muted-foreground">
                  기공소와의 소통
                </div>

                <ScrollArea className="flex-1 px-3 py-3">
                  <div className="space-y-2">
                    {chatLoading || chatMessagesLoading ? (
                      <div className="text-center text-xs text-muted-foreground py-4">
                        채팅을 불러오는 중입니다...
                      </div>
                    ) : null}

                    {!chatLoading && !chatMessagesLoading && (chatError || chatMessagesError) ? (
                      <div className="text-center text-xs text-destructive py-4">
                        {chatError || chatMessagesError}
                      </div>
                    ) : null}

                    {!chatLoading && !chatMessagesLoading && !chatError && !chatMessagesError && chatMessages.length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground py-4">
                        아직 메시지가 없습니다.
                      </div>
                    ) : null}

                    {chatMessages.map((message) => {
                      const senderId = String(message.sender?._id || "").trim();
                      const isMine = myIdCandidates.has(senderId);
                      const senderName = String(message.sender?.name || "알 수 없음").trim();
                      return (
                        <div
                          key={message._id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                          >
                            <p className="opacity-80 mb-1 font-medium">{senderName}</p>
                            <p className="opacity-70 mb-1">{formatChatTs(message.createdAt)}</p>
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                {message.attachments.map((file, idx) => {
                                  const fileName = String(file?.fileName || "첨부파일").trim();
                                  const fileSize = formatFileSize(Number(file?.fileSize || 0));
                                  const s3Key = String(file?.s3Key || "").trim();
                                  return s3Key ? (
                                    <button
                                      key={`${message._id}:file:${idx}`}
                                      type="button"
                                      onClick={() =>
                                        void handleDownloadChatAttachment({
                                          fileName,
                                          fileSize: Number(file?.fileSize || 0),
                                          s3Key,
                                          s3Url: String(file?.s3Url || "").trim(),
                                        })
                                      }
                                      className="block w-full rounded border border-current/20 px-2 py-1 text-[11px] text-left underline-offset-2 hover:underline"
                                    >
                                      {fileName} · {fileSize}
                                    </button>
                                  ) : (
                                    <div
                                      key={`${message._id}:file:${idx}`}
                                      className="rounded border border-current/20 px-2 py-1 text-[11px]"
                                    >
                                      {fileName} · {fileSize}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatBottomRef} />
                  </div>
                </ScrollArea>

                <div className="border-t px-3 pt-3 pb-4 sm:px-4 sm:pt-4 sm:pb-6 space-y-2">
                  {chatAttachedFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto pr-1">
                      {chatAttachedFiles.map((file, idx) => (
                        <span
                          key={`${file.name}:${file.size}:${file.lastModified}:${idx}`}
                          className="inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-xs"
                        >
                          <span className="truncate max-w-[14rem] sm:max-w-[18rem]">{file.name}</span>
                          <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                          <button
                            type="button"
                            className="opacity-70 hover:opacity-100"
                            onClick={() => handleRemoveAttachedChatFile(idx)}
                            aria-label="첨부파일 제거"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <Textarea
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="문의 내용을 입력하세요"
                    className="resize-none flex-1"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendChatMessage();
                      }
                    }}
                    disabled={chatLoading || chatSending || !activeChatRoom?._id}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <input
                        id="practice-transfer-chat-attachment-input"
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          handleAttachChatFiles(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => {
                          const input = document.getElementById(
                            "practice-transfer-chat-attachment-input",
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                        disabled={chatLoading || chatSending || !activeChatRoom?._id}
                        aria-label="파일 첨부"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </div>

                    <Button
                      type="button"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => void handleSendChatMessage()}
                      disabled={
                        chatLoading ||
                        chatSending ||
                        !activeChatRoom?._id ||
                        (!String(chatDraft || "").trim() && chatAttachedFiles.length === 0)
                      }
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteConfirmOpen}
          title="이 전송 의뢰 내역을 삭제할까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                삭제 대상: {deleteTargetTransfer?.transferId && deleteTargetTransfer.transferId !== "-"
                  ? deleteTargetTransfer.transferId
                  : deleteTargetTransfer?.id || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                첨부된 파일 {deleteTargetTransfer?.fileCount || 0}개를 삭제합니다.
              </div>
            </div>
          }
          confirmLabel={deletingTransfer ? "삭제 중..." : "삭제"}
          cancelLabel="취소"
          onConfirm={handleConfirmDeleteTransfer}
          onCancel={handleCancelDeleteTransfer}
        />
      </div>
    </PageFileDropZone>
  );
};
