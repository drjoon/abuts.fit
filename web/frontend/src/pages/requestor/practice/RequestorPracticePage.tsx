// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/modules/chat/chat.routes.js
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/modules/files/file.routes.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { Building2, Download, MessageSquare, Search, Send } from "lucide-react";

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
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

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
        const res = await apiFetch<unknown>({
          path: `/api/files/s3/${encodeURIComponent(file.s3Key)}/download-url`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          const body = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
          toast({
            title: "다운로드 실패",
            description: String(body.message || "다운로드 링크를 생성할 수 없습니다."),
            variant: "destructive",
          });
          return;
        }

        const body =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : {};
        const url = String(data.url || body.url || "").trim();
        if (!url) {
          toast({
            title: "다운로드 실패",
            description: "다운로드 링크를 생성할 수 없습니다.",
            variant: "destructive",
          });
          return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
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
    if (!selectedTransfer) return;
    for (const file of selectedTransfer.files) {
      await handleDownload(file);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }, [handleDownload, selectedTransfer]);

  const handleSendChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || !activeChatRoom?._id || chatSending) return;

    setChatSending(true);
    try {
      const sent = await sendMessage(text);
      if (sent) {
        setChatDraft("");
      }
    } finally {
      setChatSending(false);
    }
  }, [activeChatRoom?._id, chatDraft, chatSending, sendMessage]);

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
            setChatError("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {selectedTransfer?.transferId || "치과 전송"} · {selectedTransfer?.practice.businessName || "-"}
            </DialogTitle>
          </DialogHeader>

          {!selectedTransfer ? null : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">전송 파일</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDownloadAllFiles()}
                      disabled={!selectedTransfer.files.length}
                    >
                      <Download className="mr-1 h-4 w-4" />
                      전체 다운로드
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    전송일시: {formatDateTime(selectedTransfer.createdAt)}
                  </div>
                  {selectedTransfer.transferMemo ? (
                    <div className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-2">
                      {selectedTransfer.transferMemo}
                    </div>
                  ) : null}

                  <ScrollArea className="h-[300px] rounded-md border p-2">
                    <div className="space-y-2">
                      {selectedTransfer.files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-3 rounded-md border p-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{file.originalName}</div>
                            <div className="text-xs text-muted-foreground">
                              환자: {file.patientName || "-"} · 치아: {file.tooth || "-"} · {formatBytes(file.size)}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => void handleDownload(file)}>
                            <Download className="mr-1 h-4 w-4" />
                            다운로드
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    치과 소통
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {chatError ? <div className="text-sm text-destructive">{chatError}</div> : null}
                  {!chatError && !activeChatRoom ? (
                    <div className="text-sm text-muted-foreground">채팅방을 불러오는 중입니다...</div>
                  ) : null}

                  <ScrollArea className="h-[260px] rounded-md border p-2">
                    <div className="space-y-2">
                      {chatLoading ? (
                        <div className="text-xs text-muted-foreground">메시지를 불러오는 중...</div>
                      ) : null}
                      {messages.map((m) => {
                        const isMine = String(m.sender?._id || "") === String(user?.id || "");
                        return (
                          <div
                            key={m._id}
                            className={`max-w-[90%] rounded-md px-3 py-2 text-sm ${
                              isMine
                                ? "ml-auto bg-primary text-primary-foreground"
                                : "mr-auto bg-muted text-foreground"
                            }`}
                          >
                            <div className="mb-1 text-[11px] opacity-70">{m.sender?.name || "-"}</div>
                            <div className="whitespace-pre-wrap break-words">{m.content}</div>
                            <div className="mt-1 text-[10px] opacity-70">{formatDateTime(m.createdAt)}</div>
                          </div>
                        );
                      })}
                      <div ref={chatBottomRef} />
                    </div>
                  </ScrollArea>

                  <div className="space-y-2">
                    <Textarea
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      placeholder="치과에 전달할 내용을 입력하세요"
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button onClick={() => void handleSendChat()} disabled={!chatDraft.trim() || chatSending}>
                        <Send className="mr-1 h-4 w-4" />
                        전송
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
