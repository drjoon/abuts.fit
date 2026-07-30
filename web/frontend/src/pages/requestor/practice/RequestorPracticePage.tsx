// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/pages/requestor/referralGroups/RequestorReferralPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/modules/chat/chat.routes.js
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/modules/files/file.routes.js
// - web/backend/controllers/files/file.controller.js
// - web/frontend/src/shared/hooks/useUploadWithProgressToast.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { onAppEvent } from "@/shared/realtime/socket";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { Building2, Copy, Download, Link2, Search, Send } from "lucide-react";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";

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
  orderDate: string;
  arrivalDate: string;
  prosthesisTypes: string[];
  toothWorksSummary: string;
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

type ParsedToothWorkSummaryItem = {
  toothNumber: string;
  prosthesisType: string;
  customAbutment: boolean;
  bridgeLinkedTeeth: string[];
};

const parseToothWorksSummary = (value: string): ParsedToothWorkSummaryItem[] =>
  String(value || "")
    .split("|")
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const [toothRaw, ...rest] = chunk.split("=");
      const toothNumber = String(toothRaw || "").trim();
      const rhs = String(rest.join("=") || "").trim();
      if (!rhs) {
        return {
          toothNumber,
          prosthesisType: "",
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
        };
      }

      const linkedMatch = rhs.match(/\(([^)]+)\)\s*$/);
      const linkedRaw = linkedMatch ? linkedMatch[1] : "";
      let withoutLinked = linkedMatch ? rhs.replace(/\(([^)]+)\)\s*$/, "").trim() : rhs;

      let customAbutment = false;
      if (withoutLinked.startsWith("커스텀어벗+")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("커스텀어벗+", "").trim();
      }
      if (withoutLinked.includes("+커스텀어벗")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("+커스텀어벗", "").trim();
      }

      const prosthesisType = withoutLinked;
      const bridgeLinkedTeeth = linkedRaw
        ? linkedRaw
            .split("-")
            .map((v) => String(v || "").trim())
            .filter((v) => v && v !== toothNumber)
        : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
      };
    })
    .filter((row) => row.toothNumber && row.prosthesisType);

const formatToothWorksSummary = (raw: string, options?: { multiline?: boolean }) => {
  const rows = parseToothWorksSummary(raw);
  if (!rows.length) return "";

  const formattedRows = rows.map((row) => {
    const details: string[] = [];

    for (const token of String(row.prosthesisType || "")
      .split("+")
      .map((v) => v.trim())
      .filter(Boolean)) {
      details.push(token);
    }

    if (row.customAbutment) {
      details.push("커스텀어벗");
    }

    if (row.bridgeLinkedTeeth.length > 0) {
      details.push(`연결 ${[row.toothNumber, ...row.bridgeLinkedTeeth].join("-")}`);
    }

    return `${row.toothNumber}번: ${details.join(" · ")}`;
  });

  return options?.multiline ? formattedRows.join("\n") : formattedRows.join(" / ");
};

const parsePracticeTransferMemoMeta = (rawMemo: string) => {
  const source = String(rawMemo || "").trim();
  const lines = source.split(/\r?\n/);
  const memoLines: string[] = [];
  let orderDate = "";
  let arrivalDate = "";
  let prosthesisTypes: string[] = [];
  let toothWorksSummary = "";

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      memoLines.push("");
      continue;
    }

    const orderMatch = trimmed.match(/^\[\s*주문일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/);
    if (orderMatch) {
      orderDate = orderMatch[1];
      continue;
    }

    const arrivalMatch = trimmed.match(/^\[\s*도착일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/);
    if (arrivalMatch) {
      arrivalDate = arrivalMatch[1];
      continue;
    }

    const defaultDaysMatch = trimmed.match(/^\[\s*도착기본일수\s*:\s*\d{1,3}\s*\]$/);
    if (defaultDaysMatch) {
      continue;
    }

    const prosthesisCatalogMatch = trimmed.match(/^\[\s*보철물형태목록\s*:\s*(.+)\]$/);
    if (prosthesisCatalogMatch) {
      prosthesisTypes = String(prosthesisCatalogMatch[1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    const legacyProsthesisMatch = trimmed.match(/^\[\s*보철물형태\s*:\s*(.+)\]$/);
    if (legacyProsthesisMatch) {
      prosthesisTypes = String(legacyProsthesisMatch[1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    const toothWorksMatch = trimmed.match(/^\[\s*치아보철\s*:\s*(.+)\]$/);
    if (toothWorksMatch) {
      toothWorksSummary = String(toothWorksMatch[1] || "").trim();
      continue;
    }

    memoLines.push(line);
  }

  return {
    orderDate,
    arrivalDate,
    prosthesisTypes,
    toothWorksSummary,
    memo: memoLines.join("\n").replace(/^\s+|\s+$/g, ""),
  };
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
  const [practiceLinkCopied, setPracticeLinkCopied] = useState(false);
  const [practiceMessageCopied, setPracticeMessageCopied] = useState(false);

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
  const chatRoomResolveSeqRef = useRef(0);

  const {
    messages,
    loading: chatLoading,
    sendMessage,
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

        return {
          _id: String(r._id || "").trim(),
          transferId: String(r.transferId || "").trim(),
          targetLabName: String(r.targetLabName || "").trim(),
          transferMemo: parsedMemo.memo,
          orderDate: parsedMemo.orderDate,
          arrivalDate: parsedMemo.arrivalDate,
          prosthesisTypes: parsedMemo.prosthesisTypes,
          toothWorksSummary: parsedMemo.toothWorksSummary,
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
        t.orderDate,
        t.arrivalDate,
        t.prosthesisTypes.join(" "),
        t.toothWorksSummary,
        String(t.status || "") === "canceled" ? "취소" : "발송완료",
        t.isRead ? "수신완료" : "수신전",
        fileText,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }, [period, search, transfers]);

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

  const selectedTransferDisplayMemo = useMemo(() => {
    const plainMemo = String(selectedTransfer?.transferMemo || "").trim();
    const formattedToothWorks = formatToothWorksSummary(
      String(selectedTransfer?.toothWorksSummary || ""),
      { multiline: true },
    );

    const sections: string[] = [];
    if (plainMemo) sections.push(plainMemo);
    if (formattedToothWorks) {
      sections.push(`치아보철\n${formattedToothWorks}`);
    }

    return sections.join("\n\n").trim();
  }, [selectedTransfer]);

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

  const labId = String(user?.businessAnchorId || "").trim();
  const practiceLinkQuery = new URLSearchParams();
  if (labId) practiceLinkQuery.set("l", labId);
  const practiceDropzoneLink = `${window.location.origin}/p${
    practiceLinkQuery.toString() ? `?${practiceLinkQuery.toString()}` : ""
  }`;

  const handleCopyPracticeDropzoneLink = async () => {
    try {
      await navigator.clipboard.writeText(practiceDropzoneLink);
      setPracticeLinkCopied(true);
      setTimeout(() => setPracticeLinkCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "치과 파일전송 링크가 복사되었습니다.",
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
    const message = `안녕하세요 🙂 아래 링크에서 구강 스캔 파일을 보내주세요.\n링크를 열면 기공소가 자동 선택됩니다.\n${practiceDropzoneLink}`;
    try {
      await navigator.clipboard.writeText(message);
      setPracticeMessageCopied(true);
      setTimeout(() => setPracticeMessageCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "전송 안내 문구가 복사되었습니다.",
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



  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <CardTitle className="text-xl">치과 전송 내역</CardTitle>
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
                <PeriodFilter value={period} onChange={setPeriod} className="shrink-0" />
              </div>
            </CardHeader>
            <CardContent>
              {error ? <div className="text-sm text-destructive">{error}</div> : null}
              {!error && loading ? <div className="text-sm text-muted-foreground">불러오는 중...</div> : null}
              {!error && !loading && sortedFilteredTransfers.length === 0 ? (
                <div className="text-sm text-muted-foreground">표시할 치과 전송 내역이 없습니다.</div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {sortedFilteredTransfers.map((transfer) => {
                  const chatUnreadCount = unreadByTransferId.get(transfer.transferId) || 0;
                  const toothWorksPreview = formatToothWorksSummary(transfer.toothWorksSummary);
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
                          <Badge
                            variant={transfer.isRead ? "secondary" : "destructive"}
                            className="shrink-0 whitespace-nowrap"
                          >
                            {transfer.isRead ? "수신완료" : "수신전"}
                          </Badge>
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

              {!error && hasMore ? (
                <div ref={loadMoreRef} className="py-4 text-center text-xs text-muted-foreground">
                  {loadingMore ? "더 불러오는 중..." : "아래로 스크롤하면 더 불러옵니다."}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="h-fit border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">치과 초대 링크</CardTitle>
              <CardDescription>
                치과에 이 링크를 보내면 파일 전송 화면이 바로 열리고, 우리 기공소가 자동 선택됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="rounded-md border bg-background p-2.5">
                  <p className="text-xs font-mono break-all text-muted-foreground">
                    {practiceDropzoneLink}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyPracticeDropzoneLink()}
                    className="h-8 gap-1.5"
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
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyPracticeMessage()}
                    className="h-8 gap-1.5"
                  >
                    {practiceMessageCopied ? (
                      <>
                        <Copy className="h-4 w-4" />
                        복사됨
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        안내문구 복사
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
            setChatAttachedFiles([]);
            setChatError("");
          }
        }}
        title="의뢰 상세 · 치과 채팅"
        conversationTitle="치과와의 소통"
        summaryItems={[
          { label: "전송ID", value: selectedTransfer?.transferId || "-" },
          {
            label: "전송시각",
            value: selectedTransfer ? formatDateTime(selectedTransfer.createdAt) : "-",
          },
          { label: "치과", value: selectedTransfer?.practice.businessName || "-" },
          { label: "담당자", value: selectedTransfer?.practice.userName || "-" },
          { label: "주문일", value: selectedTransfer?.orderDate || "-" },
          { label: "도착일", value: selectedTransfer?.arrivalDate || "-" },
        ] satisfies PracticeTransferDialogSummaryItem[]}
        memo={selectedTransferDisplayMemo}
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
        composerPlaceholder="치과에 전달할 내용을 입력하세요"
        inputDisabled={chatLoading || chatSending || !activeChatRoom?._id}
        sendDisabled={
          chatLoading ||
          chatSending ||
          !activeChatRoom?._id ||
          (!chatDraft.trim() && chatAttachedFiles.length === 0)
        }
      />
    </div>
  );
}
