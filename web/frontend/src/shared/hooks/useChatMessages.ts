// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/socket.ts
// - web/backend/modules/chat/chat.routes.js
// - web/backend/controllers/chats/chat.controller.js
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { onAppEvent } from "@/shared/realtime/socket";
import { ChatMessage } from "./useChatRooms";

interface UseChatMessagesOptions {
  roomId?: string;
  autoFetch?: boolean;
}

const CHAT_PAGE_LIMIT = 30;
const CHAT_MESSAGES_SWR_MS = 2000;

type ChatPagination = {
  total: number;
  page: number;
  limit: number;
  pages: number;
};

type CachedMessagesEntry = {
  messages: ChatMessage[];
  pagination: ChatPagination;
  cachedAt: number;
};

const CHAT_MESSAGES_CACHE = new Map<string, CachedMessagesEntry>();

const INITIAL_PAGINATION: ChatPagination = {
  total: 0,
  page: 1,
  limit: CHAT_PAGE_LIMIT,
  pages: 0,
};

const makeCacheKey = (roomId: string, userCacheId: string) =>
  `chat-messages:${String(userCacheId || "anon").trim()}:${String(roomId || "").trim()}:p1:l${CHAT_PAGE_LIMIT}`;

const readCachedMessages = (roomId: string, userCacheId: string) => {
  const cacheKey = makeCacheKey(roomId, userCacheId);
  const hit = CHAT_MESSAGES_CACHE.get(cacheKey);
  if (!hit) return null;
  return hit;
};

const writeCachedMessages = (
  roomId: string,
  userCacheId: string,
  messages: ChatMessage[],
  pagination: ChatPagination,
) => {
  const cacheKey = makeCacheKey(roomId, userCacheId);
  CHAT_MESSAGES_CACHE.set(cacheKey, {
    messages: Array.isArray(messages) ? messages : [],
    pagination: pagination || INITIAL_PAGINATION,
    cachedAt: Date.now(),
  });
};

export const useChatMessages = (options: UseChatMessagesOptions = {}) => {
  const { roomId, autoFetch = true } = options;
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<ChatPagination>(INITIAL_PAGINATION);
  const fetchSequenceRef = useRef(0);

  const myIdCandidates = useMemo(() => {
    const ids = [user?.id, (user as { _id?: string } | null)?._id]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [user]);

  const userCacheId = useMemo(() => {
    return String(user?.id || (user as { _id?: string } | null)?._id || "anon").trim() || "anon";
  }, [user]);

  const fetchMessagesForRoom = useCallback(
    async ({
      targetRoomId,
      page = 1,
      sequence,
      silent = false,
      toastOnError = true,
      applyToState = true,
    }: {
      targetRoomId: string;
      page?: number;
      sequence?: number;
      silent?: boolean;
      toastOnError?: boolean;
      applyToState?: boolean;
    }) => {
      const normalizedRoomId = String(targetRoomId || "").trim();
      if (!normalizedRoomId || !token) return null;

      const activeSequence = Number.isFinite(Number(sequence)) ? Number(sequence) : null;
      const shouldGuardBySequence = activeSequence !== null;

      if (!silent && applyToState) {
        setLoading(true);
      }
      if (applyToState) {
        setError(null);
      }

      try {
        const res = await apiFetch<{
          success: boolean;
          data: {
            messages: ChatMessage[];
            pagination: ChatPagination;
          };
        }>({
          path: `/api/chats/rooms/${normalizedRoomId}/messages?page=${page}&limit=${CHAT_PAGE_LIMIT}`,
          method: "GET",
          token,
        });

        if (shouldGuardBySequence && activeSequence !== fetchSequenceRef.current) return null;

        if (!res.ok || !res.data?.success) {
          throw new Error("메시지 조회에 실패했습니다.");
        }

        const nextMessages = res.data.data.messages || [];
        const nextPagination = res.data.data.pagination || INITIAL_PAGINATION;

        writeCachedMessages(normalizedRoomId, userCacheId, nextMessages, nextPagination);

        if (applyToState) {
          setMessages(nextMessages);
          setPagination(nextPagination);
        }

        return {
          messages: nextMessages,
          pagination: nextPagination,
        };
      } catch (e: unknown) {
        if (shouldGuardBySequence && activeSequence !== fetchSequenceRef.current) return null;

        const errorMsg =
          e instanceof Error ? e.message : "메시지를 불러오는 중 오류가 발생했습니다.";

        if (applyToState) {
          setError(errorMsg);
        }

        if (toastOnError) {
          toast({
            title: "오류",
            description: errorMsg,
            variant: "destructive",
          });
        }

        return null;
      } finally {
        if (!silent && applyToState) {
          if (!shouldGuardBySequence || activeSequence === fetchSequenceRef.current) {
            setLoading(false);
          }
        }
      }
    },
    [token, toast, userCacheId],
  );

  const fetchMessages = useCallback(
    async (page = 1, options?: { silent?: boolean; toastOnError?: boolean }) => {
      const normalizedRoomId = String(roomId || "").trim();
      if (!normalizedRoomId) return null;

      const currentSequence = ++fetchSequenceRef.current;
      return fetchMessagesForRoom({
        targetRoomId: normalizedRoomId,
        page,
        sequence: currentSequence,
        silent: Boolean(options?.silent),
        toastOnError: options?.toastOnError ?? true,
        applyToState: true,
      });
    },
    [fetchMessagesForRoom, roomId],
  );

  const prefetchMessages = useCallback(
    async (targetRoomId?: string) => {
      const normalizedRoomId = String(targetRoomId || roomId || "").trim();
      if (!normalizedRoomId) return;

      const cached = readCachedMessages(normalizedRoomId, userCacheId);
      if (cached && Date.now() - cached.cachedAt <= CHAT_MESSAGES_SWR_MS) {
        return;
      }

      await fetchMessagesForRoom({
        targetRoomId: normalizedRoomId,
        page: 1,
        silent: true,
        toastOnError: false,
        applyToState: String(roomId || "").trim() === normalizedRoomId,
      });
    },
    [fetchMessagesForRoom, roomId, userCacheId],
  );

  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Array<{
        fileId?: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        s3Key: string;
        s3Url: string;
      }>
    ) => {
      const normalizedContent = String(content || "").trim();
      const normalizedAttachments = Array.isArray(attachments)
        ? attachments.filter((row) => String(row?.fileName || "").trim())
        : [];

      if (!token || !roomId) return null;
      if (!normalizedContent && normalizedAttachments.length === 0) return null;

      try {
        const res = await apiFetch<{
          success: boolean;
          data: ChatMessage;
          message: string;
        }>({
          path: `/api/chats/rooms/${roomId}/messages`,
          method: "POST",
          token,
          jsonBody: {
            content: normalizedContent,
            attachments: normalizedAttachments,
          },
        });

        if (res.ok && res.data?.success) {
          setMessages((prev) => {
            const next = res.data!.data;
            if (!next?._id) return prev;
            if (prev.some((m) => String(m._id) === String(next._id))) return prev;
            const merged = [...prev, next];
            writeCachedMessages(String(roomId || "").trim(), userCacheId, merged, pagination);
            return merged;
          });
          return res.data.data;
        }

        throw new Error(res.data?.message || "메시지 전송에 실패했습니다.");
      } catch (e: unknown) {
        toast({
          title: "전송 실패",
          description: e instanceof Error ? e.message : "메시지 전송 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      }
    },
    [pagination, roomId, toast, token, userCacheId],
  );

  useEffect(() => {
    const normalizedRoomId = String(roomId || "").trim();

    // room 전환 시 이전 대화 잔상을 즉시 제거하고, 이전 fetch 응답은 무시
    fetchSequenceRef.current += 1;
    setMessages([]);
    setError(null);
    setPagination(INITIAL_PAGINATION);
    setLoading(false);

    if (!normalizedRoomId || !autoFetch) return;

    const cached = readCachedMessages(normalizedRoomId, userCacheId);
    if (cached) {
      setMessages(cached.messages || []);
      setPagination(cached.pagination || INITIAL_PAGINATION);

      // SWR: 캐시를 즉시 보여주고, 백그라운드에서 최신화
      void fetchMessagesForRoom({
        targetRoomId: normalizedRoomId,
        page: 1,
        sequence: fetchSequenceRef.current,
        silent: true,
        toastOnError: false,
        applyToState: true,
      });
      return;
    }

    void fetchMessages(1, { silent: false, toastOnError: true });
  }, [autoFetch, roomId, fetchMessages, fetchMessagesForRoom, userCacheId]);

  useEffect(() => {
    if (!roomId) return;

    const unsubscribe = onAppEvent((evt) => {
      const type = String(evt?.type || "").trim();
      if (type !== "chat:message-created") return;

      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const eventRoomId = String(payload.roomId || "").trim();
      if (!eventRoomId || eventRoomId !== String(roomId || "").trim()) return;

      const messageRaw =
        payload.message && typeof payload.message === "object"
          ? (payload.message as ChatMessage)
          : null;
      if (!messageRaw?._id) return;

      const senderId = String(messageRaw.sender?._id || payload.senderId || "").trim();
      const isMine = senderId ? myIdCandidates.has(senderId) : false;

      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(messageRaw._id))) return prev;
        const next = [...prev, messageRaw];
        writeCachedMessages(String(roomId || "").trim(), userCacheId, next, pagination);
        return next;
      });

      if (!isMine) {
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, Number(prev.total || 0) + 1),
        }));
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [myIdCandidates, pagination, roomId, userCacheId]);

  return {
    messages,
    loading,
    error,
    pagination,
    fetchMessages,
    prefetchMessages,
    sendMessage,
    setMessages,
  };
};
