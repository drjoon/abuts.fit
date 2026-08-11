// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/pages/requestor/referralGroups/RequestorReferralPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/modules/chat/chat.routes.js
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/modules/files/file.routes.js
// - web/backend/controllers/files/file.controller.js
// - web/frontend/src/shared/hooks/useUploadWithProgressToast.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-11: 디자인 페이지 삭제 — DesignQueueSection을 의뢰수신 UI에 통합(기간필터 공유).
// - 2026-08-11: 기공소 의뢰수신 — 발신/수신 탭 제거·항상 수신. 디자인 큐를 의뢰수신으로 편입.
// - 2026-08-11: 치과 기공의뢰 — 발신/수신 탭 제거·항상 발신.
// - 2026-08-11: 사이드메뉴 딥링크용 ?mode=send|receive 동기화.
// - 2026-08-11: 기공소 기공의뢰수신 — 내역 카드 제거·검색/뱃지를 의뢰수신으로 통합·제목 삭제.
// - 2026-08-11: 치과초대 우측 상단(9:3)·의뢰수신 상단 필터左/검색右.
// - 2026-08-11: 치과 링크 전달 — 파일전송(/p) → 기공소 소개코드 가입 링크.
// - 2026-08-11: 상단 뱃지에 포장.발송·추적관리 추가(기공 파이프라인 UI).
// - 2026-08-11: 디자인 큐 빈 목록일 때 하단 전송 내역 영역 미렌더(중복 제거).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { Building2, Copy, Download, Link2, Search, Send, X } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import {
  REQUESTOR_KIND_LABEL,
  REQUESTOR_SERVICE_LABEL,
} from "@/shared/business/requestorCapabilities";
import { PracticeFileTransferPage } from "@/pages/practice/PracticeFileTransferPage";
import { DesignQueueSection } from "@/pages/requestor/design/DesignQueueSection";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  formatToothWorksForDisplay,
  parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
  parseToothWorks,
  serializeToothWorks,
} from "@/shared/practice/transferMemo";
import type { ReactNode } from "react";

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
  rawTransferMemo: string;
  orderDate: string;
  arrivalDate: string;
  prosthesisTypes: string[];
  toothWorksSummary: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  requestorReadAt: string | null;
  isDownloaded: boolean;
  requestorDownloadedAt: string | null;
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

type PracticeTransferSettingsPayload = {
  promoNoticeDismissedAt?: string | null;
};

const PAGE_SIZE = 10; // 2열 x 5행
const PRACTICE_TRANSFER_PROMO_TITLE = "무료 서비스로도 이용 가능!";
const PRACTICE_TRANSFER_PROMO_DESC =
  "사업자등록증 없이도 무료 서비스로 기공의뢰서를 주고할 수 있습니다.";

const formatDateTime = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

const formatToothWorksSummary = (raw: string, options?: { multiline?: boolean }) =>
  formatToothWorksForDisplay(parseToothWorks(raw), options);

const parsePracticeTransferMemoMeta = (rawMemo: string) => {
  const parsed = parsePracticeTransferMemoMetaShared(rawMemo);
  return {
    orderDate: parsed.orderDate,
    arrivalDate: parsed.arrivalDate,
    prosthesisTypes: parsed.prosthesisTypes,
    toothWorksSummary: serializeToothWorks(parsed.toothWorks),
    memo: parsed.memo,
  };
};

const getTransferDisplayStatus = (transfer: {
  status?: string;
  isRead?: boolean;
  isDownloaded?: boolean;
  requestorDownloadedAt?: string | null;
}) => {
  const rawStatus = String(transfer.status || "").trim().toLowerCase();
  if (
    Boolean(transfer.isDownloaded) ||
    Boolean(String(transfer.requestorDownloadedAt || "").trim()) ||
    rawStatus === "downloaded" ||
    rawStatus === "다운로드완료"
  ) {
    return "다운로드완료" as const;
  }

  return transfer.isRead ? ("수신완료" as const) : ("발송완료" as const);
};

export default function RequestorPracticePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    loading,
    canSendTransfer,
    canReceiveTransfer,
    kind,
    designAccessEnabled,
  } = useRequestorBusinessAccess();
  const modeParam = searchParams.get("mode");

  useEffect(() => {
    if (loading) return;
    const desired = kind === "lab" ? "receive" : "send";
    if (modeParam === desired) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", desired);
    setSearchParams(nextParams, { replace: true });
  }, [kind, loading, modeParam, searchParams, setSearchParams]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">불러오는 중...</div>
    );
  }

  // 기공소: 항상 수신만. 지정 기공소 디자인 큐도 의뢰수신에 통합 표시.
  if (kind === "lab") {
    if (!canReceiveTransfer && !designAccessEnabled) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg">역할·서비스 선택 필요</CardTitle>
              <CardDescription>
                기공의뢰서 이용을 위해 설정 &gt; 사업자에서{" "}
                {REQUESTOR_KIND_LABEL.lab} 역할과{" "}
                {REQUESTOR_SERVICE_LABEL.free}를 선택해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => navigate("/dashboard/settings?tab=business")}
              >
                사업자 설정으로 이동
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <RequestorPracticeReceivePage
        showDesignQueue={designAccessEnabled}
        showTransfers={canReceiveTransfer}
      />
    );
  }

  // 치과: 항상 발신만.
  if (!canSendTransfer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-lg">역할·서비스 선택 필요</CardTitle>
            <CardDescription>
              기공의뢰서 이용을 위해 설정 &gt; 사업자에서{" "}
              {REQUESTOR_KIND_LABEL.practice} 역할과{" "}
              {REQUESTOR_SERVICE_LABEL.free}를 선택해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/dashboard/settings?tab=business")}
            >
              사업자 설정으로 이동
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PracticeFileTransferPage />;
}

function RequestorPracticeReceivePage({
  roleSwitcher,
  showDesignQueue = false,
  showTransfers = true,
}: {
  roleSwitcher?: ReactNode;
  /** 지정 기공소: 디자인+생산 준비 큐를 의뢰수신에 통합 */
  showDesignQueue?: boolean;
  /** 무료 기공의뢰서 수신 목록 표시 */
  showTransfers?: boolean;
}) {
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
  const [statusFilter, setStatusFilter] = useState<
    "all" | "발송완료" | "수신완료" | "다운로드완료" | "포장.발송" | "추적관리"
  >("all");
  const [practiceLinkCopied, setPracticeLinkCopied] = useState(false);
  const [practiceMessageCopied, setPracticeMessageCopied] = useState(false);
  const [promoNoticeVisible, setPromoNoticeVisible] = useState(false);
  const [promoNoticeSaving, setPromoNoticeSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<ReceivedPracticeTransfer | null>(null);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [chatError, setChatError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatReplyTo, setChatReplyTo] = useState<{
    _id: string;
    sender: { name: string; role: string };
    content: string;
  } | null>(null);
  const [chatAttachedFiles, setChatAttachedFiles] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [transferCardsMaxHeightPx, setTransferCardsMaxHeightPx] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const transferCardsGridRef = useRef<HTMLDivElement | null>(null);
  const realtimeReloadTimerRef = useRef<number | null>(null);
  const chatRoomResolveSeqRef = useRef(0);

  const {
    messages,
    loading: chatLoading,
    sendMessage,
    toggleReaction,
    prefetchMessages,
    setMessages: setChatMessages,
  } = useChatMessages({
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

  const loadPromoNoticeSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "GET",
        token,
      });
      if (!res.ok) return;

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferSettingsPayload)
          : null;

      const dismissed = String(payload?.promoNoticeDismissedAt || "").trim().length > 0;
      setPromoNoticeVisible(!dismissed);
    } catch {
      // ignore
    }
  }, [token]);

  const handleDismissPromoNotice = useCallback(async () => {
    if (!token || promoNoticeSaving) return;
    setPromoNoticeSaving(true);
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "POST",
        token,
        jsonBody: { promoNoticeDismissedAt: new Date().toISOString() },
      });
      if (!res.ok) {
        const body = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
        throw new Error(String(body.message || "안내 저장에 실패했습니다."));
      }
      setPromoNoticeVisible(false);
    } catch (error) {
      toast({
        title: "안내 숨김 실패",
        description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setPromoNoticeSaving(false);
    }
  }, [promoNoticeSaving, toast, token]);

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

        const parsedMemo = parsePracticeTransferMemoMeta(String(r.transferMemo || ""));
        const requestorDownloadedAt = r.requestorDownloadedAt
          ? String(r.requestorDownloadedAt)
          : null;
        const rawStatus = String(r.status || "").trim().toLowerCase();

        return {
          _id: String(r._id || "").trim(),
          transferId: String(r.transferId || "").trim(),
          targetLabName: String(r.targetLabName || "").trim(),
          transferMemo: parsedMemo.memo,
          rawTransferMemo: String(r.transferMemo || "").trim(),
          orderDate: String(r.orderDate || parsedMemo.orderDate || "").trim(),
          arrivalDate: String(r.arrivalDate || parsedMemo.arrivalDate || "").trim(),
          prosthesisTypes: parsedMemo.prosthesisTypes,
          toothWorksSummary: parsedMemo.toothWorksSummary,
          status: String(r.status || "active").trim(),
          createdAt: String(r.createdAt || "").trim(),
          updatedAt: String(r.updatedAt || "").trim(),
          isRead: Boolean(r.isRead),
          requestorReadAt: r.requestorReadAt ? String(r.requestorReadAt) : null,
          isDownloaded:
            Boolean(r.isDownloaded) ||
            Boolean(requestorDownloadedAt) ||
            rawStatus === "downloaded" ||
            rawStatus === "다운로드완료",
          requestorDownloadedAt,
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
    async (nextPage: number, append: boolean, options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent === true;

      if (append) setLoadingMore(true);
      else if (!silent) setLoading(true);
      if (!append && !silent) setError("");

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
          if (!append && !silent) {
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
        if (!append && !silent) {
          setTransfers([]);
          setError("치과 전송 내역 조회 중 오류가 발생했습니다.");
          setHasMore(false);
          setPage(1);
        }
      } finally {
        if (append) setLoadingMore(false);
        else if (!silent) setLoading(false);
      }
    },
    [emitUnreadBadgeRefresh, mapTransferRows, parseTransfersBody, token],
  );

  const loadFirstPage = useCallback(
    async (options?: { silent?: boolean }) => {
      setHasMore(false);
      setPage(1);
      await fetchTransferPage(1, false, options);
    },
    [fetchTransferPage],
  );

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
    void loadPromoNoticeSettings();
  }, [loadPromoNoticeSettings, token]);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      const transferId = String(payload.transferId || "").trim();
      const action = String(payload.action || "").trim().toLowerCase();
      const unreadCount = Number(payload.unreadCount || 0);
      const status = String(payload.status || "").trim();
      const statusLower = status.toLowerCase();
      const isRemovedEvent =
        action === "canceled" ||
        action === "cancelled" ||
        action === "deleted" ||
        action === "removed" ||
        action === "purged" ||
        statusLower === "canceled" ||
        statusLower === "cancelled" ||
        statusLower === "deleted" ||
        statusLower === "removed" ||
        status === "취소";
      const requestorReadAt = payload.requestorReadAt
        ? String(payload.requestorReadAt)
        : null;
      const requestorDownloadedAt = payload.requestorDownloadedAt
        ? String(payload.requestorDownloadedAt)
        : null;

      if (type === "practice:transfer-updated" && transferId) {
        if (isRemovedEvent) {
          setTransfers((prev) => prev.filter((row) => row.transferId !== transferId));
          setSelectedTransfer((prev) => {
            if (!prev || prev.transferId !== transferId) return prev;
            return null;
          });
          setDialogOpen(false);
        } else {
          setTransfers((prev) =>
            prev.map((row) => {
              if (row.transferId !== transferId) return row;
              return {
                ...row,
                status: status || row.status,
                isRead:
                  action === "read" || action === "downloaded"
                    ? true
                    : row.isRead,
                requestorReadAt:
                  action === "read" || action === "downloaded"
                    ? requestorReadAt || row.requestorReadAt
                    : row.requestorReadAt,
                isDownloaded:
                  action === "downloaded"
                    ? true
                    : row.isDownloaded,
                requestorDownloadedAt:
                  action === "downloaded"
                    ? requestorDownloadedAt || row.requestorDownloadedAt
                    : row.requestorDownloadedAt,
              };
            }),
          );

          setSelectedTransfer((prev) => {
            if (!prev || prev.transferId !== transferId) return prev;
            return {
              ...prev,
              status: status || prev.status,
              isRead: action === "read" || action === "downloaded" ? true : prev.isRead,
              requestorReadAt:
                action === "read" || action === "downloaded"
                  ? requestorReadAt || prev.requestorReadAt
                  : prev.requestorReadAt,
              isDownloaded: action === "downloaded" ? true : prev.isDownloaded,
              requestorDownloadedAt:
                action === "downloaded"
                  ? requestorDownloadedAt || prev.requestorDownloadedAt
                  : prev.requestorDownloadedAt,
            };
          });
        }
      }

      if (Number.isFinite(unreadCount) && unreadCount >= 0) {
        emitUnreadBadgeRefresh(unreadCount);
      }

      const shouldReload =
        type === "practice:transfer-created" ||
        isRemovedEvent ||
        !transferId;

      if (shouldReload) {
        if (realtimeReloadTimerRef.current) {
          window.clearTimeout(realtimeReloadTimerRef.current);
        }
        realtimeReloadTimerRef.current = window.setTimeout(() => {
          void loadFirstPage({ silent: true });
        }, 140);
      }
    },
  });

  useEffect(() => {
    return () => {
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
    };
  }, []);

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

  const baseFilteredTransfers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();

    const periodFiltered = transfers.filter((t) => {
      const rawStatus = String(t.status || "").trim().toLowerCase();
      if (["canceled", "cancelled", "deleted", "removed", "취소"].includes(rawStatus)) {
        return false;
      }

      const ts = new Date(t.createdAt).getTime();
      if (!Number.isFinite(ts) || ts <= 0) return true;
      const created = new Date(ts);
      const diffDays = (now.getTime() - ts) / (24 * 60 * 60 * 1000);

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
      const statusLabel = getTransferDisplayStatus(t);
      const blob = [
        t.transferId,
        t.practice.businessName,
        t.practice.userName,
        t.transferMemo,
        t.orderDate,
        t.arrivalDate,
        t.prosthesisTypes.join(" "),
        t.toothWorksSummary,
        statusLabel,
        fileText,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }, [period, search, transfers]);

  const statusCounts = useMemo(() => {
    const counts = baseFilteredTransfers.reduce(
      (acc, transfer) => {
        const status = getTransferDisplayStatus(transfer);
        if (status === "다운로드완료") acc.downloaded += 1;
        else if (status === "수신완료") acc.read += 1;
        else acc.sent += 1;
        return acc;
      },
      { sent: 0, read: 0, downloaded: 0, shipping: 0, tracking: 0 },
    );
    // 포장.발송·추적관리는 기공 파이프라인 UI 슬롯(집계 연동 전).
    return counts;
  }, [baseFilteredTransfers]);

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "all") return baseFilteredTransfers;
    return baseFilteredTransfers.filter((transfer) => getTransferDisplayStatus(transfer) === statusFilter);
  }, [baseFilteredTransfers, statusFilter]);

  const sortedFilteredTransfers = useMemo(() => {
    const latestChatTsByTransferId = new Map<string, number>();
    for (const room of rooms) {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) continue;
      const lastTs = new Date(String(room.lastMessageAt || "")).getTime();
      if (Number.isFinite(lastTs) && lastTs > 0) {
        latestChatTsByTransferId.set(transferId, lastTs);
      }
    }

    return [...filteredTransfers].sort((a, b) => {
      const aChatTs = Number(latestChatTsByTransferId.get(a.transferId) || 0);
      const bChatTs = Number(latestChatTsByTransferId.get(b.transferId) || 0);
      const aCreatedTs = new Date(a.createdAt).getTime();
      const bCreatedTs = new Date(b.createdAt).getTime();
      const aSortTs = aChatTs > 0 ? aChatTs : Number(aCreatedTs || 0);
      const bSortTs = bChatTs > 0 ? bChatTs : Number(bCreatedTs || 0);
      return bSortTs - aSortTs;
    });
  }, [filteredTransfers, rooms]);

  const selectedTransferDisplayMemo = useMemo(
    () =>
      String(
        parsePracticeTransferMemoMetaShared(String(selectedTransfer?.rawTransferMemo || "")).memo ||
          "",
      ).trim(),
    [selectedTransfer?.rawTransferMemo],
  );

  const selectedTransferPatientName = useMemo(() => {
    const fromMemo = String(
      parsePracticeTransferMemoMetaShared(String(selectedTransfer?.rawTransferMemo || ""))
        .patientName || "",
    ).trim();
    if (fromMemo) return fromMemo;
    const fromFiles = (selectedTransfer?.files || [])
      .map((file) => String(file.patientName || "").trim())
      .find(Boolean);
    return fromFiles || "";
  }, [selectedTransfer?.files, selectedTransfer?.rawTransferMemo]);

  const selectedTransferToothWorks = useMemo(
    () =>
      parsePracticeTransferMemoMetaShared(String(selectedTransfer?.rawTransferMemo || ""))
        .toothWorks,
    [selectedTransfer?.rawTransferMemo],
  );

  const recalculateTransferCardsMaxHeight = useCallback(() => {
    const grid = transferCardsGridRef.current;
    if (!grid) {
      setTransferCardsMaxHeightPx(null);
      return;
    }

    const cardEls = Array.from(grid.querySelectorAll<HTMLElement>("[data-transfer-card='true']"));
    if (cardEls.length === 0) {
      setTransferCardsMaxHeightPx(null);
      return;
    }

    const gridStyle = window.getComputedStyle(grid);
    const rowGap = Number.parseFloat(gridStyle.rowGap || "0") || 0;
    const templateColumns = String(gridStyle.gridTemplateColumns || "");
    const repeatMatch = templateColumns.match(/repeat\((\d+),/);
    const columnCount = repeatMatch
      ? Number(repeatMatch[1] || 1)
      : templateColumns
          .split(" ")
          .map((token) => token.trim())
          .filter(Boolean).length || 1;

    const targetRows = columnCount >= 2 ? 3 : 6;

    const rowMaxHeightByTop = new Map<number, number>();
    for (const card of cardEls) {
      const top = card.offsetTop;
      const h = card.offsetHeight;
      const prev = rowMaxHeightByTop.get(top) || 0;
      if (h > prev) rowMaxHeightByTop.set(top, h);
    }

    const rowTops = [...rowMaxHeightByTop.keys()].sort((a, b) => a - b);
    const visibleRowCount = Math.min(targetRows, rowTops.length);
    const visibleRowsHeight = rowTops
      .slice(0, visibleRowCount)
      .reduce((sum, top) => sum + Number(rowMaxHeightByTop.get(top) || 0), 0);
    const totalGapHeight = Math.max(0, visibleRowCount - 1) * rowGap;

    setTransferCardsMaxHeightPx(Math.ceil(visibleRowsHeight + totalGapHeight));
  }, []);

  useEffect(() => {
    recalculateTransferCardsMaxHeight();

    const grid = transferCardsGridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      recalculateTransferCardsMaxHeight();
    });

    observer.observe(grid);
    for (const child of Array.from(grid.children)) {
      observer.observe(child);
    }

    window.addEventListener("resize", recalculateTransferCardsMaxHeight);
    return () => {
      window.removeEventListener("resize", recalculateTransferCardsMaxHeight);
      observer.disconnect();
    };
  }, [recalculateTransferCardsMaxHeight, sortedFilteredTransfers]);

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

  const markTransferDownloaded = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return;
      if (transfer.isDownloaded || transfer.requestorDownloadedAt) return;

      try {
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-downloaded`,
          method: "POST",
          token,
        });

        if (!res.ok) return;

        const body = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : body;
        const readAt = data.requestorReadAt ? String(data.requestorReadAt) : transfer.requestorReadAt || new Date().toISOString();
        const downloadedAt = data.requestorDownloadedAt
          ? String(data.requestorDownloadedAt)
          : transfer.requestorDownloadedAt || new Date().toISOString();
        const unreadCount = Number(data.unreadCount || 0);

        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? {
                  ...row,
                  isRead: true,
                  requestorReadAt: readAt,
                  isDownloaded: true,
                  requestorDownloadedAt: downloadedAt,
                }
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev && (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? {
                ...prev,
                isRead: true,
                requestorReadAt: readAt,
                isDownloaded: true,
                requestorDownloadedAt: downloadedAt,
              }
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
      const resolveSeq = ++chatRoomResolveSeqRef.current;

      setSelectedTransfer(transfer);
      setDialogOpen(true);
      setChatError("");
      setChatAttachedFiles([]);
      setActiveChatRoom(null);
      setChatMessages([]);
      void markTransferRead(transfer);

      const transferId = String(transfer.transferId || "").trim();
      const cachedRoom = rooms.find(
        (room) => String(room.relatedPracticeTransferId?.transferId || "").trim() === transferId,
      );
      if (cachedRoom?._id) {
        void prefetchMessages(cachedRoom._id);
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setActiveChatRoom(cachedRoom);
        return;
      }

      try {
        const res = await apiFetch<unknown>({
          path: `/api/chats/practice/transfer-room/${encodeURIComponent(transfer.transferId)}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          if (resolveSeq !== chatRoomResolveSeqRef.current) return;
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
        if (room?._id) {
          void prefetchMessages(room._id);
        }
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setActiveChatRoom(room);
      } catch {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setChatError("치과 채팅방 조회 중 오류가 발생했습니다.");
      }
    },
    [markTransferRead, prefetchMessages, rooms, setChatMessages, token],
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

        if (selectedTransfer) {
          void markTransferDownloaded(selectedTransfer);
        }
      } catch {
        toast({
          title: "다운로드 실패",
          description: "다운로드 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [markTransferDownloaded, selectedTransfer, toast, token],
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

      const sent = await sendMessage(text, attachments, {
        replyTo: chatReplyTo?._id || null,
      });
      if (sent) {
        setChatDraft("");
        setChatReplyTo(null);
        setChatAttachedFiles([]);
      }
    } finally {
      setChatSending(false);
    }
  }, [
    activeChatRoom?._id,
    chatAttachedFiles,
    chatDraft,
    chatReplyTo?._id,
    chatSending,
    sendMessage,
    uploadFilesWithToast,
  ]);

  const referralCode = String(user?.referralCode || "")
    .trim()
    .toUpperCase();
  const referralSignupLink = referralCode
    ? `${window.location.origin}/signup/referral?ref=${encodeURIComponent(referralCode)}`
    : "";

  const handleCopyPracticeDropzoneLink = async () => {
    if (!referralSignupLink) {
      toast({
        title: "복사 실패",
        description: "소개 코드를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(referralSignupLink);
      setPracticeLinkCopied(true);
      setTimeout(() => setPracticeLinkCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "가입 링크가 복사되었습니다.",
        duration: 2000,
      });
    } catch {
      toast({
        title: "복사 실패",
        description: "브라우저 권한을 확인해주세요.",
        variant: "destructive",
      });
    }
  };

  const handleCopyPracticeMessage = async () => {
    if (!referralSignupLink) {
      toast({
        title: "복사 실패",
        description: "소개 코드를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    const message = `안녕하세요 🙂 아래 링크로 어벗츠에 가입해 주시면 기공의뢰서를 더 쉽고 빠르게 보낼 수 있습니다.\n${referralSignupLink}`;
    try {
      await navigator.clipboard.writeText(message);
      setPracticeMessageCopied(true);
      setTimeout(() => setPracticeMessageCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "가입 안내 문구가 복사되었습니다.",
        duration: 2000,
      });
    } catch {
      toast({
        title: "복사 실패",
        description: "브라우저 권한을 확인해주세요.",
        variant: "destructive",
      });
    }
  };



  const inviteLinkCard = (
    <Card className="h-fit">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">치과에 가입 링크 전달</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCopyPracticeDropzoneLink()}
            disabled={!referralSignupLink}
            className="h-8 gap-1.5 bg-primary-strong text-white hover:bg-primary-strong"
          >
            {practiceLinkCopied ? (
              <>
                <Copy className="h-4 w-4" />
                복사됨
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                링크 복사
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCopyPracticeMessage()}
            disabled={!referralSignupLink}
            className="h-8 gap-1.5 bg-primary-strong text-white hover:bg-primary-strong"
          >
            {practiceMessageCopied ? (
              <>
                <Copy className="h-4 w-4" />
                복사됨
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                안내 복사
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const transferSearchAndBadges = (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          presets={["thisMonth", "lastMonth"]}
          className="shrink-0"
        />
        <div className="relative w-full md:max-w-md md:ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="전송ID, 치과명, 파일명, 환자명 검색"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "발송완료" ? "all" : "발송완료"))}
          aria-pressed={statusFilter === "발송완료"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "발송완료"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            발송 {statusCounts.sent}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "수신완료" ? "all" : "수신완료"))}
          aria-pressed={statusFilter === "수신완료"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "수신완료"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            수신 {statusCounts.read}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() =>
            setStatusFilter((prev) => (prev === "다운로드완료" ? "all" : "다운로드완료"))
          }
          aria-pressed={statusFilter === "다운로드완료"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "다운로드완료"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            다운로드 {statusCounts.downloaded}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "포장.발송" ? "all" : "포장.발송"))}
          aria-pressed={statusFilter === "포장.발송"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "포장.발송"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            포장.발송 {statusCounts.shipping}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "추적관리" ? "all" : "추적관리"))}
          aria-pressed={statusFilter === "추적관리"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "추적관리"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            추적관리 {statusCounts.tracking}건
          </Badge>
        </button>
      </div>
    </div>
  );

  const transferListBody = (
    <>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {!error && !showDesignQueue && sortedFilteredTransfers.length === 0 ? (
        <div className="text-sm text-muted-foreground">표시할 의뢰가 없습니다.</div>
      ) : null}

      <div
        className="overflow-y-auto pr-1"
        style={transferCardsMaxHeightPx ? { maxHeight: `${transferCardsMaxHeightPx}px` } : undefined}
      >
        <div ref={transferCardsGridRef} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sortedFilteredTransfers.map((transfer) => {
            const chatUnreadCount = unreadByTransferId.get(transfer.transferId) || 0;
            const toothWorksPreview = formatToothWorksSummary(transfer.toothWorksSummary);
            return (
              <button
                key={transfer._id || transfer.transferId}
                type="button"
                onClick={() => void openTransferDialog(transfer)}
                className="w-full rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-muted/20"
                data-transfer-card="true"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{transfer.transferId}</span>
                    {chatUnreadCount > 0 ? (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 justify-center px-1 text-[11px] leading-none"
                      >
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(transfer.createdAt)}
                    </span>
                    {(() => {
                      const displayStatus = getTransferDisplayStatus(transfer);
                      return (
                        <Badge
                          variant={displayStatus === "발송완료" ? "destructive" : "secondary"}
                          className={cn(
                            "shrink-0 whitespace-nowrap",
                            displayStatus === "다운로드완료"
                              ? "bg-primary-soft text-primary-strong hover:bg-primary-soft"
                              : "",
                          )}
                        >
                          {displayStatus}
                        </Badge>
                      );
                    })()}
                  </div>
                </div>

                <div className="mt-2 text-sm text-muted-foreground">
                  치과: {transfer.practice.businessName || "-"}
                  {transfer.practice.userName ? ` · 담당자 ${transfer.practice.userName}` : ""}
                </div>

                <p className="mt-2 text-xs text-muted-foreground truncate">
                  파일 {transfer.fileCount}개
                  {transfer.orderDate ? ` · 주문 ${transfer.orderDate}` : ""}
                  {transfer.arrivalDate ? ` · 도착 ${transfer.arrivalDate}` : ""}
                  {toothWorksPreview
                    ? ` · 치아별 ${toothWorksPreview}`
                    : transfer.prosthesisTypes.length
                      ? ` · 형태 ${transfer.prosthesisTypes.join(", ")}`
                      : ""}
                  {String(transfer.transferMemo || "").trim()
                    ? ` · 메모: ${String(transfer.transferMemo || "").replace(/\s+/g, " ").trim()}`
                    : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {!error && hasMore ? (
        <div ref={loadMoreRef} className="py-4 text-center text-xs text-muted-foreground">
          {loadingMore ? "더 불러오는 중..." : "아래로 스크롤하면 더 불러옵니다."}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {showDesignQueue && !showTransfers ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                presets={["thisMonth", "lastMonth"]}
                className="shrink-0"
              />
            </div>
            <DesignQueueSection />
          </div>
        ) : null}

        {showTransfers ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-start">
          {promoNoticeVisible ? (
            <Alert className="relative flex flex-col items-center justify-center border-primary-muted bg-primary-soft text-primary-strong text-center xl:col-span-9">
              <button
                type="button"
                onClick={() => void handleDismissPromoNotice()}
                disabled={promoNoticeSaving}
                className="absolute right-3 top-3 rounded p-1 text-primary-strong hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="안내 닫기"
              >
                <X className="h-4 w-4" />
              </button>
              <AlertTitle className="text-[1.3125rem] leading-snug">{PRACTICE_TRANSFER_PROMO_TITLE}</AlertTitle>
              <AlertDescription className="text-[1.3125rem] leading-snug">{PRACTICE_TRANSFER_PROMO_DESC}</AlertDescription>
            </Alert>
          ) : null}

          <div
            className={cn(
              "xl:col-span-3 xl:col-start-10",
              promoNoticeVisible ? "xl:row-start-1" : "order-first xl:order-none xl:row-start-1",
            )}
          >
            {inviteLinkCard}
          </div>

          <Card className="xl:col-span-9 xl:col-start-1">
            <CardHeader className="space-y-3">
              {roleSwitcher ? (
                <div className="flex flex-wrap items-center gap-3">{roleSwitcher}</div>
              ) : null}
              {transferSearchAndBadges}
            </CardHeader>
            <CardContent className={showDesignQueue ? "space-y-4 pt-0" : undefined}>
              {showDesignQueue ? <DesignQueueSection /> : null}
              {showDesignQueue && !error && sortedFilteredTransfers.length === 0
                ? null
                : transferListBody}
            </CardContent>
          </Card>
        </div>
        ) : null}
      </div>

      {showTransfers ? (
      <PracticeTransferDetailChatDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            chatRoomResolveSeqRef.current += 1;
            setSelectedTransfer(null);
            setActiveChatRoom(null);
            setChatMessages([]);
            setChatDraft("");
            setChatReplyTo(null);
            setChatAttachedFiles([]);
            setChatError("");
          }
        }}
        title="의뢰 상세 · 치과 채팅"
        conversationTitle="치과와의 소통"
        summaryItems={[
          { label: "전송ID", value: selectedTransfer?.transferId || "-" },
          { label: "전송시각", value: selectedTransfer ? formatDateTime(selectedTransfer.createdAt) : "-" },
          { label: "치과", value: selectedTransfer?.practice.businessName || "-" },
          { label: "담당자", value: selectedTransfer?.practice.userName || "-" },
          { label: "환자명", value: selectedTransferPatientName || "-" },
          { label: "주문일", value: selectedTransfer?.orderDate || "-" },
          { label: "도착일", value: selectedTransfer?.arrivalDate || "-" },
        ] satisfies PracticeTransferDialogSummaryItem[]}
        memo={selectedTransferDisplayMemo}
        toothWorks={selectedTransferToothWorks}
        toothWorksKey={selectedTransfer?.transferId || "requestor-transfer"}
        filesLabel="전송 파일"
        files={
          (selectedTransfer?.files || []).map((file) => ({
            id: file.id,
            fileName: file.originalName,
            size: Number(file.size || 0),
            s3Key: String(file.s3Key || "").trim(),
          })) satisfies PracticeTransferDialogFileItem[]
        }
        onDownloadAllFiles={() => void handleDownloadAllFiles()}
        onDownloadTransferFile={(file) =>
          void handleDownload({
            id: file.id,
            patientName: "",
            tooth: "",
            originalName: file.fileName,
            mimetype: "",
            size: file.size,
            s3Key: file.s3Key,
          })
        }
        chatLoading={chatLoading}
        chatError={String(chatError || "")}
        chatMessages={messages}
        isMyMessage={(senderId) => senderId === String(user?.id || "")}
        currentUserId={String(user?.id || "").trim()}
        formatChatTime={formatDateTime}
        formatFileSize={formatBytes}
        onDownloadChatAttachment={handleDownloadChatAttachment}
        chatBottomRef={chatBottomRef}
        chatAttachedFiles={chatAttachedFiles}
        onRemoveAttachedChatFile={handleRemoveAttachedChatFile}
        onAttachChatFiles={handleAttachChatFiles}
        attachmentInputId="requestor-practice-chat-attachment-input"
        chatDraft={chatDraft}
        onChangeChatDraft={setChatDraft}
        onSendChatMessage={() => void handleSendChat()}
        replyTo={chatReplyTo}
        onReplyToMessage={(message) => {
          setChatReplyTo({
            _id: String(message._id),
            sender: {
              name: String(message.sender?.name || "").trim() || "알 수 없음",
              role: String(message.sender?.role || "").trim(),
            },
            content: String(message.content || "").trim() || "(내용 없음)",
          });
        }}
        onCancelReply={() => setChatReplyTo(null)}
        onToggleReaction={(messageId, emoji) => void toggleReaction(messageId, emoji)}
        composerPlaceholder="치과에 전달할 내용을 입력하세요"
        inputDisabled={chatLoading || chatSending || !activeChatRoom?._id}
        sendDisabled={
          chatLoading ||
          chatSending ||
          !activeChatRoom?._id ||
          (!chatDraft.trim() && chatAttachedFiles.length === 0)
        }
      />
      ) : null}
    </div>
  );
}
