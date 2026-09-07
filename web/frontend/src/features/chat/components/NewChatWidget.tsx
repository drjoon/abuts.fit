// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/utils/partnerChat.util.js
// change-log:
// - 2026-09-07: 채팅 알림음 메뉴(이 채팅/전체) + 열람 중 스킵 등록.
// - 2026-09-07: 파트너 DM unread — chat:message-created 실시간 배지 반영.
// - 2026-09-07: 채팅 의뢰ID 클릭 → 작업현황(채팅) 열기.
// - 2026-09-07: 인박스 검색 필터·기존 roomId 즉시 오픈·목록 캐시(저지연).
// - 2026-09-07: 인박스 — 고객지원 + 기공소↔치과 파트너 DM(의뢰건 무관).
// - 2026-08-13: 채팅 첨부 다운로드 프로그레스바.
// - 2026-08-27: 채팅 이미지 썸네일·미리보기(authToken).
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Headphones, MessageSquare, Search, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import type { ChatRoom } from "@/shared/hooks/useChatRooms";
import { useToast } from "@/shared/hooks/use-toast";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import {
  ChatComposer,
  CHAT_CASE_MENTION_PLACEHOLDER,
  type RequestPickItem,
} from "@/features/chat/components/ChatComposer";
import {
  ChatMessageBubble,
  type ChatBubbleAttachment,
} from "@/features/chat/components/ChatMessageBubble";
import { buildChatReactionUserNameById } from "@/features/chat/components/chatReactions";
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";
import { normalizeRequestorKind } from "@/shared/business/requestorCapabilities";
import { requestOpenPracticeTransferChat } from "@/shared/practice/openPracticeTransferChat";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import {
  ChatSoundGlobalToggle,
  ChatSoundMenu,
  useRegisterChatSoundViewing,
} from "@/shared/chat/ChatSoundControls";

type InboxView = "list" | "thread";
type ThreadKind = "support" | "partner";

type PartnerCounterpart = {
  counterpartAnchorId: string;
  counterpartName: string;
  counterpartKind: "practice" | "lab";
  labAnchorId: string;
  practiceAnchorId: string;
  roomId: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
};

const COUNTERPARTS_TTL_MS = 30_000;

const stubRoomFromId = (roomId: string, title: string): ChatRoom =>
  ({
    _id: roomId,
    participants: [],
    roomType: "direct",
    title,
    lastMessageAt: new Date().toISOString(),
    status: "active",
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as ChatRoom;

export const NewChatWidget = () => {
  const { user, isAuthenticated, token } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [inboxView, setInboxView] = useState<InboxView>("list");
  const [threadKind, setThreadKind] = useState<ThreadKind>("support");
  const [activeCounterpartAnchorId, setActiveCounterpartAnchorId] =
    useState<string>("");
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [threadTitle, setThreadTitle] = useState("어벗츠.핏 고객지원");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportRoomDisabled, setSupportRoomDisabled] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [counterparts, setCounterparts] = useState<PartnerCounterpart[]>([]);
  const [partnerChatEnabled, setPartnerChatEnabled] = useState(false);
  const [listFilter, setListFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{
    _id: string;
    sender: { name: string; role: string };
    content: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [requestPicks, setRequestPicks] = useState<RequestPickItem[]>([]);
  const [requestPicksLoading, setRequestPicksLoading] = useState(false);
  const requestPicksLoadedForRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const didRefreshUnreadRef = useRef(false);
  const counterpartsFetchedAtRef = useRef(0);
  const counterpartsInFlightRef = useRef<Promise<void> | null>(null);
  const supportRoomIdRef = useRef<string>("");
  const counterpartsRef = useRef<PartnerCounterpart[]>([]);
  const inboxViewRef = useRef<InboxView>(inboxView);
  const isOpenRef = useRef(isOpen);
  const activeRoomIdRef = useRef<string>("");
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const chatUploads = useBackgroundTempUpload({ token });
  const { downloadingKeys, downloadProgressByKey, downloadS3File } =
    useS3FileDownload(token);

  counterpartsRef.current = counterparts;
  inboxViewRef.current = inboxView;
  isOpenRef.current = isOpen;

  const canUsePartnerChat = useMemo(() => {
    const role = String(user?.role || "").trim();
    if (role === "practice" || role === "internalLab") return true;
    if (role !== "requestor") return false;
    const kind = normalizeRequestorKind(user?.requestorKind);
    return kind === "practice" || kind === "lab";
  }, [user?.role, user?.requestorKind]);

  const partnerSectionLabel =
    normalizeRequestorKind(user?.requestorKind) === "lab" ||
    user?.role === "internalLab"
      ? "거래 치과"
      : "거래 기공소";

  useEffect(() => {
    const onOpen = (evt?: Event) => {
      const custom = evt as CustomEvent | undefined;
      const detail: any = custom?.detail || {};
      const prefill = typeof detail?.prefill === "string" ? detail.prefill : "";
      if (prefill) {
        setDraft(prefill);
      }
      const wantSupport = Boolean(detail?.support);
      setInboxView(wantSupport || prefill ? "thread" : "list");
      if (wantSupport || prefill) {
        setThreadKind("support");
        setThreadTitle("어벗츠.핏 고객지원");
        setRoom(null);
      }
      setIsOpen(true);
    };
    window.addEventListener("abuts:open-support-chat", onOpen);
    window.addEventListener("abuts:open-partner-chat", onOpen);
    return () => {
      window.removeEventListener("abuts:open-support-chat", onOpen);
      window.removeEventListener("abuts:open-partner-chat", onOpen);
    };
  }, []);

  const loadSupportUnread = async () => {
    if (!token || supportRoomDisabled) return 0;
    try {
      const roomRes = await apiFetch<any>({
        path: "/api/chats/support-room",
        method: "GET",
        token,
      });
      if (!roomRes.ok) {
        if ([401, 403, 404].includes(roomRes.status)) {
          setSupportRoomDisabled(true);
        }
        return 0;
      }
      const roomBody = roomRes.data || {};
      const roomData = (roomBody as any)?.data || roomBody;
      const supportId = String(roomData?._id || "").trim();
      if (supportId) supportRoomIdRef.current = supportId;
      const count =
        typeof roomData?.unreadCount === "number" ? roomData.unreadCount : 0;
      setSupportUnread(count);
      return count;
    } catch {
      return 0;
    }
  };

  const loadCounterparts = async (opts?: { force?: boolean }) => {
    if (!token || !canUsePartnerChat) {
      setPartnerChatEnabled(false);
      setCounterparts([]);
      return;
    }
    const now = Date.now();
    if (
      !opts?.force &&
      counterpartsFetchedAtRef.current > 0 &&
      now - counterpartsFetchedAtRef.current < COUNTERPARTS_TTL_MS
    ) {
      return;
    }
    if (counterpartsInFlightRef.current) {
      await counterpartsInFlightRef.current;
      return;
    }

    const run = (async () => {
      setListLoading(true);
      try {
        const res = await apiFetch<any>({
          path: "/api/chats/partner-counterparts",
          method: "GET",
          token,
        });
        if (!res.ok) {
          setPartnerChatEnabled(false);
          setCounterparts([]);
          return;
        }
        const body = res.data || {};
        const data = (body as any)?.data || body;
        const items: PartnerCounterpart[] = Array.isArray(data?.items)
          ? data.items.map((row: any) => ({
              counterpartAnchorId: String(row?.counterpartAnchorId || "").trim(),
              counterpartName:
                String(row?.counterpartName || "").trim() || "상대",
              counterpartKind:
                row?.counterpartKind === "lab" ? "lab" : "practice",
              labAnchorId: String(row?.labAnchorId || "").trim(),
              practiceAnchorId: String(row?.practiceAnchorId || "").trim(),
              roomId: row?.roomId ? String(row.roomId) : null,
              unreadCount: Math.max(0, Number(row?.unreadCount || 0)),
              lastMessageAt: row?.lastMessageAt
                ? String(row.lastMessageAt)
                : null,
            }))
          : [];
        setPartnerChatEnabled(true);
        setCounterparts(items.filter((x) => x.counterpartAnchorId));
        counterpartsFetchedAtRef.current = Date.now();
      } catch {
        setPartnerChatEnabled(false);
        setCounterparts([]);
      } finally {
        setListLoading(false);
        counterpartsInFlightRef.current = null;
      }
    })();

    counterpartsInFlightRef.current = run;
    await run;
  };

  // 배지용 — 마운트 1회 + 60s 폴링. 닫을 때마다 강제 재조회하지 않음.
  useEffect(() => {
    if (!user || !isAuthenticated || !token) return;
    void loadSupportUnread();
    void loadCounterparts();
  }, [user?.id, isAuthenticated, token, canUsePartnerChat, supportRoomDisabled]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (typeof window !== "undefined" && !window.document.hasFocus()) return;
      if (isOpen && inboxView === "thread") return;
      await Promise.all([
        loadSupportUnread(),
        loadCounterparts({ force: true }),
      ]);
    };
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [
    token,
    isAuthenticated,
    isOpen,
    inboxView,
    canUsePartnerChat,
    supportRoomDisabled,
  ]);

  useEffect(() => {
    if (!isOpen) {
      setInboxView("list");
      setRoom(null);
      setDraft("");
      setReplyTo(null);
      setError(null);
      setListFilter("");
      didRefreshUnreadRef.current = false;
      return;
    }
    // 열 때 TTL 내면 캐시 사용, 만료 시에만 갱신
    void loadCounterparts();
    window.setTimeout(() => filterInputRef.current?.focus(), 50);
  }, [isOpen]);

  const loadRequestPicksLazy = async (opts?: {
    thread?: ThreadKind;
    counterpartAnchorId?: string;
    counterpartName?: string;
    force?: boolean;
  }) => {
    if (!token || !user) {
      setRequestPicks([]);
      return;
    }
    const kind = opts?.thread || threadKind;
    const counterpartId = String(
      opts?.counterpartAnchorId || activeCounterpartAnchorId || "",
    ).trim();
    const counterpartName = String(opts?.counterpartName || "").trim();
    const cacheKey =
      kind === "partner"
        ? `partner:${counterpartId || counterpartName || "all"}`
        : `support:${String(user.id || "")}`;
    if (
      !opts?.force &&
      requestPicksLoadedForRef.current === cacheKey &&
      requestPicks.length > 0
    ) {
      return;
    }

    setRequestPicksLoading(true);
    try {
      const isLab =
        user.role === "internalLab" ||
        normalizeRequestorKind(user.requestorKind) === "lab";

      if (kind === "support") {
        if (
          user.role !== "requestor" &&
          user.role !== "practice" &&
          user.role !== "internalLab"
        ) {
          setRequestPicks([]);
          return;
        }
      }

      // /my → data.requests, /received → data.transfers
      const path = isLab
        ? "/api/practice/transfers/received?page=1&limit=80"
        : "/api/practice/transfers/my?page=1&limit=80";
      const res = await apiFetch<any>({ path, method: "GET", token });
      if (!res.ok) {
        setRequestPicks([]);
        return;
      }
      const body = res.data || {};
      const data = (body as any)?.data || body;
      const list: any[] = Array.isArray(data?.transfers)
        ? data.transfers
        : Array.isArray(data?.requests)
          ? data.requests
          : [];

      const normalizeAnchor = (raw: unknown) => {
        if (raw && typeof raw === "object" && (raw as { _id?: unknown })._id) {
          return String((raw as { _id: unknown })._id || "").trim();
        }
        return String(raw || "").trim();
      };

      const rows = list.map((row) => {
        const transferId = String(row?.transferId || "").trim();
        const patientName = String(
          row?.patientName ||
            row?.caseInfos?.patientName ||
            row?.files?.[0]?.patientName ||
            "",
        ).trim();
        const tooth = String(
          row?.toothSummary ||
            row?.tooth ||
            row?.caseInfos?.tooth ||
            (Array.isArray(row?.toothNumbers)
              ? row.toothNumbers.filter(Boolean).join(",")
              : "") ||
            row?.files?.[0]?.tooth ||
            "",
        ).trim();
        const labAnchor = normalizeAnchor(
          row?.performingLabAnchorId ||
            row?.assigneeLabAnchorId ||
            row?.targetLabAnchorId ||
            row?.caseInfos?.practiceRouting?.targetLabAnchorId ||
            row?.targetLab?._id,
        );
        const labName = String(
          row?.targetLabName ||
            row?.caseInfos?.practiceRouting?.targetLabName ||
            row?.targetLab ||
            "",
        ).trim();
        const practiceAnchor = normalizeAnchor(
          row?.practiceBusinessAnchorId || row?.practice?._id,
        );
        return {
          requestId: transferId,
          patientName,
          tooth,
          labAnchor,
          labName,
          practiceAnchor,
        };
      });

      const filtered = rows.filter((x) => {
        if (!x.requestId || x.requestId === "-") return false;
        if (kind !== "partner" || (!counterpartId && !counterpartName)) {
          return true;
        }
        if (isLab) {
          if (counterpartId && x.practiceAnchor === counterpartId) return true;
          return false;
        }
        // 치과 → 기공소: 앵커 우선, 이름 보조(자동매칭 마스킹 대비)
        if (counterpartId && x.labAnchor && x.labAnchor === counterpartId) {
          return true;
        }
        if (
          counterpartName &&
          x.labName &&
          x.labName.replace(/\s+/g, "") === counterpartName.replace(/\s+/g, "")
        ) {
          return true;
        }
        return false;
      });

      // transferId 기준 중복 제거(/my 가상 row는 파일마다 복제될 수 있음)
      const seen = new Set<string>();
      const picks: RequestPickItem[] = [];
      for (const row of filtered) {
        if (seen.has(row.requestId)) continue;
        seen.add(row.requestId);
        picks.push({
          requestId: row.requestId,
          patientName: row.patientName,
          tooth: row.tooth,
        });
        if (picks.length >= 40) break;
      }

      setRequestPicks(picks);
      requestPicksLoadedForRef.current = cacheKey;
    } catch {
      setRequestPicks([]);
    } finally {
      setRequestPicksLoading(false);
    }
  };

  useEffect(() => {
    const loadThread = async () => {
      if (!user || !isAuthenticated || !isOpen) return;
      if (inboxView !== "thread") return;
      if (threadKind !== "support") return;
      if (supportRoomDisabled) return;

      setLoading(true);
      setError(null);
      try {
        const roomRes = await apiFetch<any>({
          path: "/api/chats/support-room",
          method: "GET",
          token,
        });
        if (!roomRes.ok) {
          const body: any = roomRes.data || {};
          const message = String(
            body?.message || "지원 채팅방을 불러오지 못했습니다.",
          );
          if ([401, 403, 404].includes(roomRes.status)) {
            setSupportRoomDisabled(true);
          }
          throw new Error(message);
        }
        const roomBody = roomRes.data || {};
        const roomData = (roomBody as any)?.data || roomBody;
        const supportId = String((roomData as any)?._id || "").trim();
        if (supportId) supportRoomIdRef.current = supportId;
        setRoom(roomData as ChatRoom);
        setThreadTitle("어벗츠.핏 고객지원");
        setSupportUnread(
          typeof roomData?.unreadCount === "number" ? roomData.unreadCount : 0,
        );
        // 의뢰 픽커는 critical path 밖
        void loadRequestPicksLazy({ thread: "support" });
      } catch (e: any) {
        setError(e?.message || "지원 채팅을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void loadThread();
  }, [
    isOpen,
    inboxView,
    threadKind,
    supportRoomDisabled,
    user,
    isAuthenticated,
    token,
  ]);

  const roomId = room?._id;
  activeRoomIdRef.current = String(roomId || "").trim();

  useRegisterChatSoundViewing(
    roomId,
    Boolean(isOpen && inboxView === "thread" && roomId),
  );

  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendMessage,
    toggleReaction,
  } = useChatMessages({
    roomId: inboxView === "thread" ? roomId : undefined,
    autoFetch: inboxView === "thread",
  });

  useEffect(() => {
    if (!isOpen || inboxView !== "thread") return;
    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, inboxView, messages.length, messagesLoading]);

  const myIdCandidates = useMemo(() => {
    const ids = [(user as any)?.mockUserId, user?.id]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [(user as any)?.mockUserId, user?.id]);

  const myKindIsLab =
    normalizeRequestorKind(user?.requestorKind) === "lab" ||
    String(user?.role || "").trim() === "internalLab";

  useAppEventListener({
    enabled: Boolean(token && isAuthenticated),
    eventTypes: ["chat:message-created", "chat:room-read"],
    deferWhenEditing: false,
    requireVisible: false,
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const eventRoomId = String(payload.roomId || "").trim();
      if (!eventRoomId) return;

      if (type === "chat:room-read") {
        const readerUserId = String(payload.userId || "").trim();
        if (!readerUserId || !myIdCandidates.has(readerUserId)) return;
        if (supportRoomIdRef.current === eventRoomId) {
          setSupportUnread(0);
        }
        setCounterparts((prev) =>
          prev.map((row) =>
            row.roomId === eventRoomId ? { ...row, unreadCount: 0 } : row,
          ),
        );
        return;
      }

      if (type !== "chat:message-created") return;

      // 의뢰건 작업현황 채팅은 FAB(파트너/고객지원) 배지와 무관
      const transferId = String(
        payload.relatedPracticeTransferId || "",
      ).trim();
      if (transferId) return;

      const message =
        payload.message && typeof payload.message === "object"
          ? (payload.message as { createdAt?: string; sender?: { _id?: string } })
          : null;
      const senderId = String(
        payload.senderId || message?.sender?._id || "",
      ).trim();
      const isMine = senderId ? myIdCandidates.has(senderId) : false;
      if (isMine) return;

      const viewingThis =
        isOpenRef.current &&
        inboxViewRef.current === "thread" &&
        activeRoomIdRef.current === eventRoomId;
      if (viewingThis) return;

      const lastAt = String(
        message?.createdAt || payload.timestamp || "",
      ).trim();
      const labAnchor = String(payload.relatedLabAnchorId || "").trim();
      const practiceAnchor = String(
        payload.relatedPracticeAnchorId || "",
      ).trim();
      const counterpartAnchorId = myKindIsLab ? practiceAnchor : labAnchor;

      const matchedPartner = counterpartsRef.current.some((row) => {
        if (row.roomId && row.roomId === eventRoomId) return true;
        return Boolean(
          counterpartAnchorId &&
            row.counterpartAnchorId === counterpartAnchorId,
        );
      });

      if (matchedPartner) {
        setCounterparts((prev) =>
          prev.map((row) => {
            const byRoom = row.roomId && row.roomId === eventRoomId;
            const byAnchor =
              counterpartAnchorId &&
              row.counterpartAnchorId === counterpartAnchorId;
            if (!byRoom && !byAnchor) return row;
            return {
              ...row,
              roomId: eventRoomId,
              unreadCount: Math.max(0, Number(row.unreadCount || 0)) + 1,
              lastMessageAt: lastAt || row.lastMessageAt,
            };
          }),
        );
        return;
      }

      if (supportRoomIdRef.current && supportRoomIdRef.current === eventRoomId) {
        setSupportUnread((prev) => Math.max(0, Number(prev || 0)) + 1);
        return;
      }

      // 첫 메시지·캐시에 roomId 없음 → 목록/지원 unread 재조회
      counterpartsFetchedAtRef.current = 0;
      void loadCounterparts({ force: true });
      void loadSupportUnread();
    },
  });

  const reactionUserNameById = useMemo(
    () =>
      buildChatReactionUserNameById({
        participants: room?.participants,
        messages,
      }),
    [room?.participants, messages],
  );

  useEffect(() => {
    if (!isOpen || inboxView !== "thread" || !roomId || !token) return;
    if (messagesLoading) return;
    if (didRefreshUnreadRef.current) return;
    if (threadKind === "support") {
      setSupportUnread(0);
      didRefreshUnreadRef.current = true;
      return;
    }
    setCounterparts((prev) =>
      prev.map((row) =>
        row.roomId === roomId ? { ...row, unreadCount: 0 } : row,
      ),
    );
    didRefreshUnreadRef.current = true;
  }, [isOpen, inboxView, roomId, messagesLoading, token, threadKind]);

  const filteredCounterparts = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    if (!q) return counterparts;
    return counterparts.filter((row) => {
      const name = String(row.counterpartName || "").toLowerCase();
      const kindLabel = row.counterpartKind === "lab" ? "기공소" : "치과";
      return name.includes(q) || kindLabel.includes(q);
    });
  }, [counterparts, listFilter]);

  const partnerUnreadTotal = useMemo(
    () =>
      counterparts.reduce(
        (sum, row) => sum + Math.max(0, Number(row.unreadCount || 0)),
        0,
      ),
    [counterparts],
  );

  const totalUnread = supportUnread + partnerUnreadTotal;

  const openSupportThread = () => {
    setThreadKind("support");
    setActiveCounterpartAnchorId("");
    setThreadTitle("어벗츠.핏 고객지원");
    setRoom(null);
    setError(null);
    setReplyTo(null);
    setDraft("");
    setRequestPicks([]);
    requestPicksLoadedForRef.current = "";
    didRefreshUnreadRef.current = false;
    setInboxView("thread");
  };

  const openPartnerThread = async (item: PartnerCounterpart) => {
    if (!token) return;
    const title = item.counterpartName || "상대";
    setThreadKind("partner");
    setActiveCounterpartAnchorId(item.counterpartAnchorId);
    setThreadTitle(title);
    setError(null);
    setReplyTo(null);
    setDraft("");
    setRequestPicks([]);
    requestPicksLoadedForRef.current = "";
    didRefreshUnreadRef.current = false;
    setInboxView("thread");
    void loadRequestPicksLazy({
      thread: "partner",
      counterpartAnchorId: item.counterpartAnchorId,
      counterpartName: title,
    });

    // 이미 방이 있으면 partner-room 대기 없이 메시지 로드 시작
    if (item.roomId) {
      setRoom(stubRoomFromId(item.roomId, title));
      setLoading(false);
      setCounterparts((prev) =>
        prev.map((row) =>
          row.counterpartAnchorId === item.counterpartAnchorId
            ? { ...row, unreadCount: 0 }
            : row,
        ),
      );
      // 참여자 합류·메타는 백그라운드
      void apiFetch<any>({
        path: `/api/chats/partner-room?counterpartAnchorId=${encodeURIComponent(item.counterpartAnchorId)}&counterpartName=${encodeURIComponent(title)}`,
        method: "GET",
        token,
      }).then((res) => {
        if (!res.ok) return;
        const body = res.data || {};
        const roomData = (body as any)?.data || body;
        if (roomData?._id) {
          setRoom(roomData as ChatRoom);
          setCounterparts((prev) =>
            prev.map((row) =>
              row.counterpartAnchorId === item.counterpartAnchorId
                ? {
                    ...row,
                    roomId: String(roomData._id),
                    unreadCount: 0,
                  }
                : row,
            ),
          );
        }
      });
      return;
    }

    setRoom(null);
    setLoading(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/chats/partner-room?counterpartAnchorId=${encodeURIComponent(item.counterpartAnchorId)}&counterpartName=${encodeURIComponent(title)}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(
          String(body?.message || "파트너 채팅방을 열지 못했습니다."),
        );
      }
      const body = res.data || {};
      const roomData = (body as any)?.data || body;
      setRoom(roomData as ChatRoom);
      setThreadTitle(
        String(roomData?.counterpartName || title).trim() || "상대",
      );
      counterpartsFetchedAtRef.current = 0;
      setCounterparts((prev) =>
        prev.map((row) =>
          row.counterpartAnchorId === item.counterpartAnchorId
            ? {
                ...row,
                roomId: String(roomData?._id || row.roomId || ""),
                unreadCount: 0,
              }
            : row,
        ),
      );
    } catch (e: any) {
      setError(e?.message || "파트너 채팅을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const backToList = () => {
    setInboxView("list");
    setRoom(null);
    setError(null);
    setReplyTo(null);
    setDraft("");
    didRefreshUnreadRef.current = false;
    window.setTimeout(() => filterInputRef.current?.focus(), 50);
  };

  if (!isAuthenticated || !user || user.role === "admin") {
    return null;
  }

  const handleSend = async () => {
    if (!roomId || isSending) return;
    const text = draft.trim();
    if (!text && chatUploads.items.length === 0) return;

    setIsSending(true);
    try {
      let attachments = toChatMessageAttachments([]);
      if (chatUploads.items.length > 0) {
        const uploaded = await chatUploads.ensureUploaded();
        attachments = toChatMessageAttachments(uploaded);
        if (!attachments.length) {
          throw new Error("파일 업로드에 실패했습니다.");
        }
      }

      const content = text || (attachments.length ? "파일 첨부" : "");
      if (!content.trim()) return;

      const sent = await sendMessage(content, attachments, {
        replyTo: replyTo?._id || null,
      });
      if (sent) {
        setDraft("");
        setReplyTo(null);
        chatUploads.clear();
        setRoom((prev) => (prev ? { ...prev, unreadCount: 0 } : prev));
        if (threadKind === "support") setSupportUnread(0);
      }
    } catch (e: any) {
      toast({
        title: "업로드 실패",
        description: e?.message || "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const insertRequestId = (_requestId: string) => {
    // 실제 삽입·$ 치환은 ChatComposer.insertCaseToken이 처리한다.
  };

  const openRequestWorkStatus = (requestId: string) => {
    const transferId = String(requestId || "").trim();
    if (!transferId) return;
    setIsOpen(false);

    const path = String(location.pathname || "");
    const onTransfersPage =
      path.includes("practice-transfers") ||
      path.startsWith("/practice/");

    if (onTransfersPage) {
      requestOpenPracticeTransferChat(transferId, { panel: "chat" });
      return;
    }

    const kind = normalizeRequestorKind(user?.requestorKind);
    const isLab =
      kind === "lab" ||
      String(user?.role || "").trim() === "internalLab";
    const mode = isLab ? "receive" : "send";
    const role = String(user?.role || "").trim();
    const base =
      role === "practice"
        ? "/practice/dashboard"
        : `/dashboard/practice-transfers?mode=${mode}`;
    const sep = base.includes("?") ? "&" : "?";
    navigate(
      `${base}${sep}openTransfer=${encodeURIComponent(transferId)}`,
    );
  };

  const openAttachment = async (a: ChatBubbleAttachment) => {
    const s3Key = String(a?.s3Key || "").trim();
    if (s3Key && token) {
      await downloadS3File({
        s3Key,
        fileName: String(a?.fileName || "첨부파일").trim() || "첨부파일",
        busyKey: s3Key,
      });
      return;
    }

    const fileId = String(a?.fileId || "").trim();
    const direct = String(a?.s3Url || "").trim();

    if (!fileId || !token) {
      if (direct) window.open(direct, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      const res = await apiFetch<any>({
        path: `/api/files/${fileId}/download-url`,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("파일을 열 수 없습니다.");
      const body = res.data || {};
      const url = (body as any)?.data?.url || (body as any)?.url;
      if (!url) throw new Error("파일을 열 수 없습니다.");
      window.open(String(url), "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({
        title: "파일 열기 실패",
        description: e?.message || "파일을 열 수 없습니다.",
        variant: "destructive",
      });
      if (direct) window.open(direct, "_blank", "noopener,noreferrer");
    }
  };

  const formatChatTs = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  const headerTitle =
    inboxView === "list" ? "채팅" : threadTitle || "채팅";

  const filterQuery = listFilter.trim().toLowerCase();
  const showSupportInFilter =
    !filterQuery ||
    "어벗츠.핏 고객지원".includes(filterQuery) ||
    "고객지원".includes(filterQuery) ||
    "support".includes(filterQuery);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 sm:bottom-6 sm:right-6"
        data-guide-tour="partner_chat_fab"
      >
        {!isOpen ? (
          <Button
            size="lg"
            className="relative rounded-full h-12 w-12 sm:h-14 sm:w-14 shadow-elegant animate-pulse-glow"
            variant="hero"
            onClick={() => setIsOpen(true)}
            aria-label="채팅 열기"
          >
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] leading-none rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </Button>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <Card
              className={`
                w-[min(100vw-2rem,24rem)] max-w-[calc(100vw-2rem)] h-[min(calc(100vh-6rem),600px)] sm:w-96 sm:max-w-none sm:h-[600px]
                border transition-all duration-300 bg-card overflow-hidden
              `}
            >
              <div className="flex items-center justify-between px-3 sm:px-4 py-3 sm:py-4 border-b bg-muted/50">
                <div className="flex items-center gap-1 min-w-0">
                  {inboxView === "thread" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={backToList}
                      title="목록"
                      className="h-8 w-8 p-0 shrink-0"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="text-sm font-medium truncate">{headerTitle}</div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <ChatSoundGlobalToggle />
                  {inboxView === "thread" && roomId ? (
                    <ChatSoundMenu targetId={roomId} />
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsOpen(false)}
                    title="닫기"
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="h-[calc(100%-3.5rem)] sm:h-[544px] flex flex-col">
                {inboxView === "list" ? (
                  <>
                    <div className="px-3 pt-2 pb-1 border-b bg-background">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={filterInputRef}
                          value={listFilter}
                          onChange={(e) => setListFilter(e.target.value)}
                          placeholder={`${partnerSectionLabel} 이름 검색`}
                          className="h-9 pl-8 pr-8 text-sm"
                          aria-label="채팅 상대 검색"
                        />
                        {listFilter.trim() ? (
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setListFilter("")}
                            aria-label="검색어 지우기"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 sm:p-3 space-y-1">
                        {showSupportInFilter && (
                          <button
                            type="button"
                            className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted/70 transition-colors"
                            onClick={openSupportThread}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Headphones className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium truncate">
                                어벗츠.핏 고객지원
                              </span>
                              <span className="block text-xs text-muted-foreground truncate">
                                문의·장애·이용 안내
                              </span>
                            </span>
                            {supportUnread > 0 && (
                              <span className="shrink-0 bg-destructive text-destructive-foreground text-[10px] leading-none rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                                {supportUnread > 99 ? "99+" : supportUnread}
                              </span>
                            )}
                          </button>
                        )}

                        {partnerChatEnabled && (
                          <div className="pt-2 pb-1 px-3 text-[11px] font-medium text-muted-foreground">
                            {partnerSectionLabel}
                            {listFilter.trim()
                              ? ` · ${filteredCounterparts.length}건`
                              : counterparts.length > 0
                                ? ` · ${counterparts.length}건`
                                : ""}
                          </div>
                        )}

                        {listLoading && counterparts.length === 0 && (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                            거래처 목록을 불러오는 중…
                          </div>
                        )}

                        {partnerChatEnabled &&
                          !listLoading &&
                          counterparts.length === 0 && (
                            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                              아직 채팅할 거래처가 없습니다.
                              <br />
                              거래처 등록 또는 의뢰 이력이 있으면 여기에
                              표시됩니다.
                            </div>
                          )}

                        {partnerChatEnabled &&
                          counterparts.length > 0 &&
                          filteredCounterparts.length === 0 && (
                            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                              검색 결과가 없습니다.
                            </div>
                          )}

                        {filteredCounterparts.map((item) => (
                          <button
                            key={item.counterpartAnchorId}
                            type="button"
                            className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted/70 transition-colors"
                            onClick={() => void openPartnerThread(item)}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                              <MessageSquare className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium truncate">
                                {item.counterpartName}
                              </span>
                              <span className="block text-xs text-muted-foreground truncate">
                                {item.counterpartKind === "lab"
                                  ? "기공소"
                                  : "치과"}
                                {item.lastMessageAt
                                  ? ` · ${formatChatTs(item.lastMessageAt)}`
                                  : " · 새 대화"}
                              </span>
                            </span>
                            {item.unreadCount > 0 && (
                              <span className="shrink-0 bg-destructive text-destructive-foreground text-[10px] leading-none rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                                {item.unreadCount > 99
                                  ? "99+"
                                  : item.unreadCount}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto">
                      <ScrollArea className="h-full">
                        <div className="p-3 sm:p-4 space-y-2">
                          {(loading || messagesLoading) && (
                            <div className="text-center text-xs text-muted-foreground py-4">
                              채팅을 불러오는 중입니다...
                            </div>
                          )}

                          {(error || messagesError) &&
                            !(loading || messagesLoading) && (
                              <div className="text-center text-xs text-destructive py-2">
                                {error || messagesError}
                              </div>
                            )}

                          {messages.map((m) => {
                            const senderId = String(m.sender?._id || "").trim();
                            const isMine = myIdCandidates.has(senderId);
                            return (
                              <ChatMessageBubble
                                key={m._id}
                                message={m}
                                isMine={isMine}
                                currentUserId={String(user?.id || "").trim()}
                                authToken={token}
                                formatTime={formatChatTs}
                                showSenderName={false}
                                compact
                                reactionUserNameById={reactionUserNameById}
                                onOpenRequestId={openRequestWorkStatus}
                                onReply={(message) => {
                                  setReplyTo({
                                    _id: String(message._id),
                                    sender: {
                                      name:
                                        String(
                                          message.sender?.name || "",
                                        ).trim() || "알 수 없음",
                                      role: String(
                                        message.sender?.role || "",
                                      ).trim(),
                                    },
                                    content:
                                      String(message.content || "").trim() ||
                                      "(내용 없음)",
                                  });
                                }}
                                onToggleReaction={(messageId, emoji) =>
                                  void toggleReaction(messageId, emoji)
                                }
                                downloadingFileKeys={downloadingKeys}
                                downloadProgressByKey={downloadProgressByKey}
                                onOpenAttachment={(file) =>
                                  void openAttachment(file)
                                }
                              />
                            );
                          })}

                          {messages.length === 0 &&
                            !(loading || messagesLoading) &&
                            !error && (
                              <div className="text-center text-xs text-muted-foreground py-6">
                                아직 메시지가 없습니다.
                              </div>
                            )}

                          <div ref={bottomRef} />
                        </div>
                      </ScrollArea>
                    </div>

                    <ChatComposer
                      draft={draft}
                      onDraftChange={setDraft}
                      onSend={() => void handleSend()}
                      placeholder={CHAT_CASE_MENTION_PLACEHOLDER}
                      disabled={!roomId}
                      isSending={isSending}
                      pendingUploads={chatUploads.items}
                      onPickFiles={chatUploads.addFiles}
                      onRemovePendingFile={chatUploads.removeItem}
                      onRetryPendingFile={chatUploads.retryItem}
                      requestPicks={requestPicks}
                      requestPicksLoading={requestPicksLoading}
                      onRequestPicksNeeded={() =>
                        void loadRequestPicksLazy({
                          thread: threadKind,
                          counterpartAnchorId: activeCounterpartAnchorId,
                          counterpartName:
                            threadKind === "partner" ? threadTitle : undefined,
                          force: requestPicks.length === 0,
                        })
                      }
                      onInsertRequestId={insertRequestId}
                      replyTo={replyTo}
                      onCancelReply={() => setReplyTo(null)}
                    />
                  </>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
};
