// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDownloadUrl,
  fetchMail,
  fetchMails,
  fetchInboundMailUnreadStats,
  fetchScheduledMailCount,
  markAsRead,
  markAsUnread,
  moveToSpam,
  restoreToInbox,
  restoreToSent,
  trashMail,
  type MailItem,
} from "@/features/admin/mail/mailApi";
import { useToast } from "@/shared/hooks/use-toast";
import { onAppEvent } from "@/shared/realtime/socket";

export type MailTab =
  | "inbox"
  | "sent"
  | "trash"
  | "spam"
  | "scheduled"
  | "compose";

export const useAdminMailBox = (options?: { initialUnreadOnly?: boolean }) => {
  const { toast } = useToast();

  const [tab, setTab] = useState<MailTab>("inbox");
  const [direction, setDirection] = useState<"inbound" | "outbound" | null>(
    "inbound"
  );
  const [folder, setFolder] = useState<"inbox" | "sent" | "trash" | "spam">(
    "inbox"
  );
  const [unreadOnly, setUnreadOnly] = useState(
    options?.initialUnreadOnly === true
  );

  const [q, setQ] = useState("");
  const queryRef = useRef<string>("");

  const [cursor, setCursor] = useState<{
    cursorCreatedAt?: string;
    cursorScheduledSendAt?: string;
    cursorId?: string;
  } | null>(null);
  const cursorRef = useRef<{
    cursorCreatedAt?: string;
    cursorScheduledSendAt?: string;
    cursorId?: string;
  } | null>(null);

  const [mails, setMails] = useState<MailItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [folderUnreadCounts, setFolderUnreadCounts] = useState({
    inbox: 0,
    spam: 0,
  });
  const [scheduledOnly, setScheduledOnly] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    queryRef.current = q;
  }, [q]);

  useEffect(() => {
    if (tab === "inbox") {
      setDirection("inbound");
      setFolder("inbox");
      setScheduledOnly(false);
    }
    if (tab === "sent") {
      setDirection("outbound");
      setFolder("sent");
      setScheduledOnly(false);
    }
    if (tab === "trash") {
      setDirection(null);
      setFolder("trash");
      setScheduledOnly(false);
    }
    if (tab === "spam") {
      setDirection(null);
      setFolder("spam");
      setScheduledOnly(false);
    }
    if (tab === "scheduled") {
      setDirection("outbound");
      setFolder("sent");
      setScheduledOnly(true);
    }
  }, [tab]);

  const refreshScheduledCount = useCallback(async () => {
    try {
      const count = await fetchScheduledMailCount();
      setScheduledCount(count);
    } catch {
      // 목록 조회 실패 토스트와 중복하지 않음
    }
  }, []);

  useEffect(() => {
    void refreshScheduledCount();
  }, [refreshScheduledCount]);

  const refreshFolderUnreadCounts = useCallback(async () => {
    try {
      const stats = await fetchInboundMailUnreadStats();
      setFolderUnreadCounts({
        inbox: stats.inbox,
        spam: stats.spam,
      });
    } catch {
      // silent — 목록 토스트와 중복하지 않음
    }
  }, []);

  useEffect(() => {
    void refreshFolderUnreadCounts();
  }, [refreshFolderUnreadCounts]);

  useEffect(() => {
    const unsub = onAppEvent((evt) => {
      if (String(evt?.type || "") !== "comm:badge-update") return;
      const key = (evt.data as { key?: string } | undefined)?.key;
      if (key === "mail") void refreshFolderUnreadCounts();
    });
    return unsub;
  }, [refreshFolderUnreadCounts]);

  const loadList = useCallback(
    async (reset = false) => {
      try {
        setListLoading(true);
        const cursor = reset ? null : cursorRef.current;
        const params = scheduledOnly
          ? {
              scheduled: true,
              q: queryRef.current || undefined,
              ...(cursor?.cursorScheduledSendAt
                ? {
                    cursorScheduledSendAt: cursor.cursorScheduledSendAt,
                    cursorId: cursor.cursorId,
                  }
                : {}),
            }
          : {
              direction: direction || undefined,
              folder: folder || undefined,
              q: queryRef.current || undefined,
              ...(cursor?.cursorCreatedAt
                ? {
                    cursorCreatedAt: cursor.cursorCreatedAt,
                    cursorId: cursor.cursorId,
                  }
                : {}),
            };
        const res = await fetchMails(params);
        let filtered = scheduledOnly
          ? res.data
          : folder
            ? res.data.filter((m) => m.folder === folder)
            : res.data;
        if (unreadOnly && folder === "inbox") {
          filtered = filtered.filter((m) => !m.isRead);
        }
        setMails((prev) => (reset ? filtered : [...prev, ...filtered]));
        cursorRef.current = res.nextCursor;
        setCursor(res.nextCursor);
      } catch (err: any) {
        toast({
          title: "메일 목록 조회 실패",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setListLoading(false);
        void refreshScheduledCount();
        void refreshFolderUnreadCounts();
      }
    },
    [
      direction,
      folder,
      scheduledOnly,
      unreadOnly,
      toast,
      refreshFolderUnreadCounts,
      refreshScheduledCount,
    ]
  );

  useEffect(() => {
    setSelectedId(null);
    setSelected(null);
    cursorRef.current = null;
    setCursor(null);
    loadList(true);
    void refreshScheduledCount();
  }, [folder, direction, scheduledOnly, unreadOnly, loadList, refreshScheduledCount]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        setDetailLoading(true);
        const data = await fetchMail(id);
        setSelected(data);
      } catch (err: any) {
        toast({
          title: "메일 조회 실패",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  const selectMail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setSelected(null);
      loadDetail(id);

      try {
        const mail = mails.find((m) => m._id === id);
        if (mail && !mail.isRead && mail.direction === "inbound") {
          await markAsRead(id);
          loadList(true);
        }
      } catch (err) {
        console.error("Failed to mark as read:", err);
      }
    },
    [loadDetail, mails, loadList]
  );

  const onSearch = useCallback(() => {
    queryRef.current = q;
    cursorRef.current = null;
    setCursor(null);
    setSelectedId(null);
    setSelected(null);
    loadList(true);
  }, [loadList, q]);

  const loadMore = useCallback(() => {
    loadList(false);
  }, [loadList]);

  const hasMore = useMemo(() => Boolean(cursor), [cursor]);

  const handleDownload = useCallback(
    async (s3Key: string) => {
      try {
        const { url } = await createDownloadUrl({ s3Key });
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err: any) {
        toast({
          title: "다운로드 실패",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const handleMarkAsRead = useCallback(
    async (id: string) => {
      try {
        await markAsRead(id);
        toast({ title: "읽음으로 표시했습니다" });
        loadList(true);
      } catch (err: any) {
        toast({
          title: "읽음 처리 실패",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast, loadList]
  );

  const handleMarkAsUnread = useCallback(
    async (id: string) => {
      try {
        await markAsUnread(id);
        toast({ title: "안읽음으로 표시했습니다" });
        setSelectedId(null);
        setSelected(null);
        loadList(true);
      } catch (err: any) {
        toast({
          title: "안읽음 처리 실패",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast, loadList]
  );

  const handleMoveToSpam = useCallback(
    async (id: string) => {
      try {
        await moveToSpam(id);
        toast({ title: "스팸함으로 이동했습니다" });
        setSelectedId(null);
        setSelected(null);
        loadList(true);
      } catch (err: any) {
        toast({
          title: "스팸 이동 실패",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast, loadList]
  );

  const handleTrash = useCallback(
    async (id: string) => {
      try {
        await trashMail(id);
        toast({ title: "휴지통으로 이동했습니다" });
        setSelectedId(null);
        setSelected(null);
        loadList(true);
      } catch (err: any) {
        toast({
          title: "삭제 실패",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast, loadList]
  );

  const handleRestoreToSent = useCallback(
    async (id: string) => {
      try {
        await restoreToSent(id);
        toast({ title: "발신함으로 복원했습니다" });
        setSelectedId(null);
        setSelected(null);
        loadList(true);
      } catch (err: any) {
        toast({
          title: "복원 실패",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast, loadList]
  );

  const handleRestoreToInbox = useCallback(
    async (id: string) => {
      try {
        await restoreToInbox(id);
        toast({ title: "수신함으로 이동했습니다" });
        setSelectedId(null);
        setSelected(null);
        loadList(true);
      } catch (err: any) {
        toast({
          title: "수신함 이동 실패",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast, loadList]
  );

  return {
    tab,
    setTab,
    q,
    setQ,
    folder,
    unreadOnly,
    setUnreadOnly,
    mails,
    listLoading,
    selectedId,
    selected,
    detailLoading,
    selectMail,
    onSearch,
    loadMore,
    hasMore,
    handleDownload,
    handleMarkAsRead,
    handleMarkAsUnread,
    handleMoveToSpam,
    handleRestoreToInbox,
    handleTrash,
    handleRestoreToSent,
    scheduledCount,
    refreshScheduledCount,
    folderUnreadCounts,
    refreshFolderUnreadCounts,
  };
};
