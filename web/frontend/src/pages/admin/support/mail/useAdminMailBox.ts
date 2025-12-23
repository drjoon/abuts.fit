import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDownloadUrl,
  fetchMail,
  fetchMails,
  type MailItem,
} from "@/features/admin/mail/mailApi";
import { useToast } from "@/hooks/use-toast";

export type MailTab = "inbox" | "sent" | "compose";

export const useAdminMailBox = () => {
  const { toast } = useToast();

  const [tab, setTab] = useState<MailTab>("inbox");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");

  const [q, setQ] = useState("");
  const queryRef = useRef<string>("");

  const [cursor, setCursor] = useState<{
    cursorCreatedAt?: string;
    cursorId?: string;
  } | null>(null);
  const cursorRef = useRef<{
    cursorCreatedAt?: string;
    cursorId?: string;
  } | null>(null);

  const [mails, setMails] = useState<MailItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    queryRef.current = q;
  }, [q]);

  useEffect(() => {
    if (tab === "inbox") setDirection("inbound");
    if (tab === "sent") setDirection("outbound");
  }, [tab]);

  const loadList = useCallback(
    async (reset = false) => {
      try {
        setListLoading(true);
        const params = {
          direction: direction || undefined,
          q: queryRef.current || undefined,
          ...(reset ? {} : cursorRef.current || {}),
        };
        const res = await fetchMails(params);
        setMails((prev) => (reset ? res.data : [...prev, ...res.data]));
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
      }
    },
    [direction, toast]
  );

  useEffect(() => {
    cursorRef.current = null;
    setCursor(null);
    setMails([]);
    setSelectedId(null);
    setSelected(null);
    loadList(true);
  }, [direction, loadList]);

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
    (id: string) => {
      setSelectedId(id);
      setSelected(null);
      loadDetail(id);
    },
    [loadDetail]
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

  return {
    tab,
    setTab,
    q,
    setQ,
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
  };
};
