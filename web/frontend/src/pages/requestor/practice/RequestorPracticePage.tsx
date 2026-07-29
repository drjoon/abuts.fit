// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/socket.ts
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/modules/chat/chat.routes.js
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/modules/files/file.routes.js
// - web/backend/controllers/files/file.controller.js
// - web/frontend/src/shared/hooks/useUploadWithProgressToast.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { onAppEvent } from "@/shared/realtime/socket";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { Building2, Download, MessageSquare, Paperclip, Search, Send, X } from "lucide-react";

type ReceivedPracticeFile = {
  id: string;
  patientName: string;
  tooth: string;
  originalName: string;
  mimetype: string;
  size: number;
  s3Key: string;
};

type ReceivedPracticeTransfer = {
  _id: string;
  transferId: string;
  targetLabName: string;
  transferMemo: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  requestorReadAt: string | null;
  practice: {
    businessName: string;
    userName: string;
  };
  fileCount: number;
  files: ReceivedPracticeFile[];
};

type ReceivedTransfersResponse = {
  transfers: unknown[];
  unreadCount: number;
  pagination?: {
    page?: number;
    limit?: number;
    count?: number;
    total?: number;
    hasMore?: boolean;
  };
};

const PAGE_SIZE = 10; // 2열 x 5행

const formatDateTime = (value: unknown) => {
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

const formatBytes = (bytes: number) => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
};

export default function RequestorPracticePage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const { rooms } = useChatRooms();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const [transfers, setTransfers] = useState<ReceivedPracticeTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<ReceivedPracticeTransfer | null>(null);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [chatError, setChatError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatAttachedFiles, setChatAttachedFiles] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const realtimeReloadTimerRef = useRef<number | null>(null);

  const { messages, loading: chatLoading, sendMessage } = useChatMessages({
    roomId: activeChatRoom?._id,
    autoFetch: dialogOpen,
  });

  const unreadByTransferId = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) continue;
      map.set(transferId, Number(room.unreadCount || 0));
    }
    return map;
  }, [rooms]);

  const emitUnreadBadgeRefresh = useCallback((nextUnreadCount?: number) => {
    window.dispatchEvent(
      new CustomEvent("abuts:practice-transfers:unread-updated", {
        detail: {
          unreadCount:
            Number.isFinite(Number(nextUnreadCount)) && Number(nextUnreadCount) >= 0
              ? Number(nextUnreadCount)
              : undefined,
        },
      }),
    );
  }, []);

  const parseTransfersBody = useCallback((raw: unknown): ReceivedTransfersResponse => {
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const data =
      body.data && typeof body.data === "object"
        ? (body.data as Record<string, unknown>)
        : body;

    const transfers = Array.isArray(data.transfers) ? data.transfers : [];
    const unreadCount = Number(data.unreadCount || 0);
    const pagination =
      data.pagination && typeof data.pagination === "object"
        ? (data.pagination as Record<string, unknown>)
        : undefined;

    return {
      transfers,
      unreadCount,
      pagination: pagination
        ? {
            page: Number(pagination.page || 0),
            limit: Number(pagination.limit || 0),
            count: Number(pagination.count || 0),
            total: Number(pagination.total || 0),
            hasMore: Boolean(pagination.hasMore),
          }
        : undefined,
    };
  }, []);

  const mapTransferRows = useCallback((rows: unknown[]) => {
    const mapped: ReceivedPracticeTransfer[] = rows
      .map((row) => {
        const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const practiceRaw =
          r.practice && typeof r.practice === "object"
            ? (r.practice as Record<string, unknown>)
            : {};
        const filesRaw = Array.isArray(r.files) ? r.files : [];

        const files: ReceivedPracticeFile[] = filesRaw
          .map((f, idx) => {
            const item = f && typeof f === "object" ? (f as Record<string, unknown>) : {};
            return {
              id: String(item.id || `${String(r._id || "")}:${idx + 1}`),
              patientName: String(item.patientName || "").trim(),
              tooth: String(item.tooth || "").trim(),
              originalName: String(item.originalName || "").trim(),
              mimetype: String(item.mimetype || "application/octet-stream").trim(),
              size: Number(item.size || 0),
              s3Key: String(item.s3Key || "").trim(),
            };
          })
          .filter((f) => f.originalName && f.s3Key);

        return {
          _id: String(r._id || "").trim(),
          transferId: String(r.transferId || "").trim(),
          targetLabName: String(r.targetLabName || "").trim(),
          transferMemo: String(r.transferMemo || "").trim(),
          status: String(r.status || "active").trim(),
          createdAt: String(r.createdAt || "").trim(),
          updatedAt: String(r.updatedAt || "").trim(),
          isRead: Boolean(r.isRead),
          requestorReadAt: r.requestorReadAt ? String(r.requestorReadAt) : null,
          practice: {
            businessName: String(practiceRaw.businessName || "").trim(),
            userName: String(practiceRaw.userName || "").trim(),
          },
          fileCount: Number(r.fileCount || files.length || 0),
          files,
        };
      })
      .filter((x) => x.transferId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return mapped;
  }, []);

  const fetchTransferPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!token) return;

      if (append) setLoadingMore(true);
      else setLoading(true);
      if (!append) setError("");

      try {
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/received?page=${nextPage}&limit=${PAGE_SIZE}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          if (!append) {
            setTransfers([]);
            setError(String(body.message || "치과 전송 내역 조회에 실패했습니다."));
            setHasMore(false);
            setPage(1);
          }
          return;
        }

        const parsed = parseTransfersBody(res.data);
        const mapped = mapTransferRows(parsed.transfers);

        setTransfers((prev) => {
          if (!append) return mapped;
          const merged = [...prev];
          const existingIds = new Set(prev.map((x) => x._id || x.transferId));
          for (const row of mapped) {
            const key = row._id || row.transferId;
            if (!existingIds.has(key)) {
              merged.push(row);
              existingIds.add(key);
            }
          }
          return merged;
        });

        setPage(nextPage);

        const paginationHasMore = parsed.pagination?.hasMore;
        if (typeof paginationHasMore === "boolean") {
          setHasMore(paginationHasMore);
        } else {
          setHasMore(mapped.length === PAGE_SIZE);
        }

        emitUnreadBadgeRefresh(parsed.unreadCount);
      } catch {
        if (!append) {
          setTransfers([]);
          setError("치과 전송 내역 조회 중 오류가 발생했습니다.");
          setHasMore(false);
          setPage(1);
        }
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [emitUnreadBadgeRefresh, mapTransferRows, parseTransfersBody, token],
  );

  const loadFirstPage = useCallback(async () => {
    setHasMore(false);
    setPage(1);
    await fetchTransferPage(1, false);
  }, [fetchTransferPage]);

  useEffect(() => {
    if (!token) {
      setTransfers([]);
      setError("로그인이 필요합니다.");
      setHasMore(false);
      return;
    }
    void loadFirstPage();
  }, [loadFirstPage, token]);

  useEffect(() => {
    if (!token) return;

    const unsubscribe = onAppEvent((evt) => {
      const type = String(evt?.type || "").trim();
      if (type !== "practice:transfer-created" && type !== "practice:transfer-updated") return;

      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      const transferId = String(payload.transferId || "").trim();
      const action = String(payload.action || "").trim();
      const unreadCount = Number(payload.unreadCount || 0);
      const status = String(payload.status || "").trim();
      const requestorReadAt = payload.requestorReadAt
        ? String(payload.requestorReadAt)
        : null;

      if (type === "practice:transfer-updated" && transferId) {
        setTransfers((prev) =>
          prev.map((row) => {
            if (row.transferId !== transferId) return row;
            return {
              ...row,
              status: status || row.status,
              isRead:
                action === "read"
                  ? true
                  : row.isRead,
              requestorReadAt:
                action === "read"
                  ? requestorReadAt || row.requestorReadAt
                  : row.requestorReadAt,
            };
          }),
        );

        setSelectedTransfer((prev) => {
          if (!prev || prev.transferId !== transferId) return prev;
          return {
            ...prev,
            status: status || prev.status,
            isRead: action === "read" ? true : prev.isRead,
            requestorReadAt:
              action === "read" ? requestorReadAt || prev.requestorReadAt : prev.requestorReadAt,
          };
        });
      }

      if (Number.isFinite(unreadCount) && unreadCount >= 0) {
        emitUnreadBadgeRefresh(unreadCount);
      }

      const shouldReload =
        type === "practice:transfer-created" ||
        action === "canceled" ||
        !transferId;

      if (shouldReload) {
        if (realtimeReloadTimerRef.current) {
          window.clearTimeout(realtimeReloadTimerRef.current);
        }
        realtimeReloadTimerRef.current = window.setTimeout(() => {
          void loadFirstPage();
        }, 140);
      }
    });

    return () => {
      unsubscribe?.();
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
    };
  }, [emitUnreadBadgeRefresh, loadFirstPage, token]);

  useEffect(() => {
    if (!dialogOpen) return;
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dialogOpen, messages]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        void fetchTransferPage(page + 1, true);
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchTransferPage, hasMore, loading, loadingMore, page]);

  const filteredTransfers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();

    const periodFiltered = transfers.filter((t) => {
      const ts = new Date(t.createdAt).getTime();
      if (!Number.isFinite(ts) || ts <= 0) return true;
      const created = new Date(ts);
      const diffDays = (now.getTime() - ts) / (24 * 60 * 60 * 1000);

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

    return periodFiltered.filter((t) => {
      const fileText = t.files
        .map((f) => `${f.originalName} ${f.patientName} ${f.tooth}`)
        .join(" ")
        .toLowerCase();
      const blob = [
        t.transferId,
        t.practice.businessName,
        t.practice.userName,
        t.transferMemo,
        String(t.status || "") === "canceled" ? "취소" : "발송완료",
        t.isRead ? "수신완료" : "수신전",
        fileText,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }, [period, search, transfers]);

  const markTransferRead = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token || transfer.isRead) return;

      try {
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-read`,
          method: "POST",
          token,
        });

        if (!res.ok) return;

        const body = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : body;
        const readAt = data.requestorReadAt ? String(data.requestorReadAt) : new Date().toISOString();
        const unreadCount = Number(data.unreadCount || 0);

        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? { ...row, isRead: true, requestorReadAt: readAt }
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev && (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? { ...prev, isRead: true, requestorReadAt: readAt }
            : prev,
        );

        emitUnreadBadgeRefresh(unreadCount);
      } catch {
        // ignore
      }
    },
    [emitUnreadBadgeRefresh, token],
  );

  const openTransferDialog = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return;

      setSelectedTransfer(transfer);
      setDialogOpen(true);
      setChatError("");
      setChatAttachedFiles([]);
      setActiveChatRoom(null);
      void markTransferRead(transfer);

      try {
        const res = await apiFetch<unknown>({
          path: `/api/chats/practice/transfer-room/${encodeURIComponent(transfer.transferId)}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          const body = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
          setChatError(String(body.message || "치과 채팅방을 열 수 없습니다."));
          return;
        }

        const body =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        const room =
          body.data && typeof body.data === "object"
            ? (body.data as ChatRoom)
            : null;
        setActiveChatRoom(room);
      } catch {
        setChatError("치과 채팅방 조회 중 오류가 발생했습니다.");
      }
    },
    [markTransferRead, token],
  );

  const handleDownload = useCallback(
    async (file: ReceivedPracticeFile) => {
      if (!token || !file.s3Key) return;

      try {
        const downloadPath = `/api/files/s3/download?key=${encodeURIComponent(file.s3Key)}&fileName=${encodeURIComponent(file.originalName || "download")}&_ts=${Date.now()}`;
        const resp = await fetch(downloadPath, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!resp.ok) {
          throw new Error("다운로드 응답이 올바르지 않습니다.");
        }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = String(file.originalName || "download").trim() || "download";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast({
          title: "다운로드 실패",
          description: "다운로드 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [toast, token],
  );

  const handleDownloadAllFiles = useCallback(async () => {
    const files = Array.isArray(selectedTransfer?.files) ? selectedTransfer.files : [];
    if (!files.length) return;

    await Promise.all(files.map((file) => handleDownload(file)));
  }, [handleDownload, selectedTransfer]);

  const handleDownloadChatAttachment = useCallback(
    async (attachment: {
      fileName?: string;
      fileSize?: number;
      s3Key?: string;
      s3Url?: string;
    }) => {
      if (!token) return;

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
            Authorization: `Bearer ${token}`,
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
    [toast, token],
  );

  const handleAttachChatFiles = useCallback((inputFiles: FileList | null) => {
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
  }, []);

  const handleRemoveAttachedChatFile = useCallback((idx: number) => {
    setChatAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSendChat = useCallback(async () => {
    const text = chatDraft.trim();
    const files = [...chatAttachedFiles];
    if ((!text && files.length === 0) || !activeChatRoom?._id || chatSending) return;

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

      const sent = await sendMessage(text, attachments);
      if (sent) {
        setChatDraft("");
        setChatAttachedFiles([]);
      }
    } finally {
      setChatSending(false);
    }
  }, [activeChatRoom?._id, chatAttachedFiles, chatDraft, chatSending, sendMessage, uploadFilesWithToast]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl">치과 전송 내역</CardTitle>
            <Button variant="outline" onClick={() => void loadFirstPage()} disabled={loading || loadingMore}>
              새로고침
            </Button>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                placeholder="전송ID, 치과명, 파일명, 환자명 검색"
              />
            </div>
            <PeriodFilter value={period} onChange={setPeriod} />
          </div>
        </CardHeader>
        <CardContent>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {!error && loading ? <div className="text-sm text-muted-foreground">불러오는 중...</div> : null}
          {!error && !loading && filteredTransfers.length === 0 ? (
            <div className="text-sm text-muted-foreground">표시할 치과 전송 내역이 없습니다.</div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredTransfers.map((transfer) => {
              const chatUnreadCount = unreadByTransferId.get(transfer.transferId) || 0;
              return (
                <button
                  key={transfer._id || transfer.transferId}
                  type="button"
                  onClick={() => void openTransferDialog(transfer)}
                  className="w-full rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-muted/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{transfer.transferId}</span>

                      <Badge variant={transfer.isRead ? "secondary" : "destructive"}>
                        {transfer.isRead ? "수신완료" : "수신전"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(transfer.createdAt)}</span>
                  </div>

                  <div className="mt-2 text-sm text-muted-foreground">
                    치과: {transfer.practice.businessName || "-"}
                    {transfer.practice.userName ? ` · 담당자 ${transfer.practice.userName}` : ""}
                    {user?.companyName ? ` → ${user.companyName}` : ""}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>파일 {transfer.fileCount}개</span>
                    {chatUnreadCount > 0 ? <span>채팅 미확인 {chatUnreadCount}</span> : null}
                    {transfer.transferMemo ? <span>메모: {transfer.transferMemo}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>

          {!error && hasMore ? (
            <div ref={loadMoreRef} className="py-4 text-center text-xs text-muted-foreground">
              {loadingMore ? "더 불러오는 중..." : "아래로 스크롤하면 더 불러옵니다."}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedTransfer(null);
            setActiveChatRoom(null);
            setChatDraft("");
            setChatAttachedFiles([]);
            setChatError("");
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-6xl p-0 overflow-hidden max-h-[86vh] flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              의뢰 상세 · 치과 채팅
            </DialogTitle>
          </DialogHeader>

          {!selectedTransfer ? null : (
            <div className="px-5 py-4 flex-1 min-h-0 overflow-hidden">
              <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm min-h-0 overflow-y-auto space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground">전송ID</p>
                      <p className="font-medium break-words">{selectedTransfer.transferId || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">전송시각</p>
                      <p className="font-medium">{formatDateTime(selectedTransfer.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">치과</p>
                      <p className="font-medium break-words">{selectedTransfer.practice.businessName || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">담당자</p>
                      <p className="font-medium break-words">{selectedTransfer.practice.userName || "-"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-muted-foreground">의뢰 메모</p>
                    <p className="mt-1 font-medium whitespace-pre-wrap break-words max-h-24 overflow-y-auto pr-1">
                      {selectedTransfer.transferMemo || "-"}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted-foreground">전송 파일 ({selectedTransfer.files.length}개)</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDownloadAllFiles()}
                        disabled={!selectedTransfer.files.length}
                      >
                        전체 다운로드
                      </Button>
                    </div>
                    <div className="mt-2 max-h-56 overflow-y-auto pr-1 space-y-1">
                      {selectedTransfer.files.length ? (
                        selectedTransfer.files.map((file) => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => void handleDownload(file)}
                            className="block w-full text-left rounded border px-2 py-1 text-xs hover:bg-muted/50"
                          >
                            {file.originalName} · {formatBytes(file.size)}
                          </button>
                        ))
                      ) : (
                        <p className="font-medium">-</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border min-h-0 flex flex-col overflow-hidden">
                  <div className="px-3 py-2 border-b text-sm text-muted-foreground">치과와의 소통</div>

                  <div className="flex-1 px-3 py-3 overflow-y-auto">
                    <div className="space-y-2">
                      {chatLoading ? (
                        <div className="text-center text-xs text-muted-foreground py-4">메시지를 불러오는 중...</div>
                      ) : null}
                      {!chatLoading && chatError ? (
                        <div className="text-center text-xs text-destructive py-4">{chatError}</div>
                      ) : null}
                      {!chatLoading && !chatError && messages.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-4">아직 메시지가 없습니다.</div>
                      ) : null}

                      {messages.map((m) => {
                        const isMine = String(m.sender?._id || "") === String(user?.id || "");
                        return (
                          <div key={m._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                                isMine ? "bg-primary text-primary-foreground" : "bg-muted"
                              }`}
                            >
                              <p className="opacity-80 mb-1 font-medium">{m.sender?.name || "-"}</p>
                              <p className="opacity-70 mb-1">{formatDateTime(m.createdAt)}</p>
                              <p className="whitespace-pre-wrap break-words">{m.content}</p>
                              {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                                <div className="mt-2 space-y-1">
                                  {m.attachments.map((file, idx) => {
                                    const fileName = String(file?.fileName || "첨부파일").trim();
                                    const fileSize = formatBytes(Number(file?.fileSize || 0));
                                    return (
                                      <button
                                        key={`${m._id}:file:${idx}`}
                                        type="button"
                                        onClick={() =>
                                          void handleDownloadChatAttachment({
                                            fileName,
                                            fileSize: Number(file?.fileSize || 0),
                                            s3Key: String(file?.s3Key || "").trim(),
                                            s3Url: String(file?.s3Url || "").trim(),
                                          })
                                        }
                                        className="block w-full rounded border border-current/20 px-2 py-1 text-[11px] text-left hover:underline"
                                      >
                                        {fileName} · {fileSize}
                                      </button>
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
                  </div>

                  <div className="border-t px-3 pt-3 pb-4 space-y-2">
                    {chatAttachedFiles.length > 0 ? (
                      <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto pr-1">
                        {chatAttachedFiles.map((file, idx) => (
                          <span
                            key={`${file.name}:${file.size}:${file.lastModified}:${idx}`}
                            className="inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-xs"
                          >
                            <span className="truncate max-w-[14rem]">{file.name}</span>
                            <span className="text-muted-foreground">{formatBytes(file.size)}</span>
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
                      placeholder="치과에 전달할 내용을 입력하세요"
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendChat();
                        }
                      }}
                      disabled={chatSending || !activeChatRoom?._id}
                    />

                    <div className="flex items-center justify-between">
                      <div>
                        <input
                          id="requestor-practice-chat-attachment-input"
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
                              "requestor-practice-chat-attachment-input",
                            ) as HTMLInputElement | null;
                            input?.click();
                          }}
                          disabled={chatSending || !activeChatRoom?._id}
                          aria-label="파일 첨부"
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      </div>

                      <Button
                        onClick={() => void handleSendChat()}
                        disabled={
                          chatSending ||
                          !activeChatRoom?._id ||
                          (!chatDraft.trim() && chatAttachedFiles.length === 0)
                        }
                      >
                        <Send className="mr-1 h-4 w-4" />
                        전송
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
