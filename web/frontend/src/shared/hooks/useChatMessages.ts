// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/backend/modules/chat/chat.routes.js
// - web/backend/controllers/chats/chat.controller.js
// change-log:
// - 2026-10-07: 작업파일-표시-*.png 첨부에 openWorkFiles를 정규화한다.
// - 2026-10-04: 메시지 전송 낙관적 UI — API(~1.5s) 전에 말풍선 즉시 표시.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { ChatMessage } from "./useChatRooms";
import { chatAttachmentOpensWorkFiles } from "@/shared/chat/chatOpenWorkFiles";

const isOptimisticMessageId = (id: unknown) =>
  String(id || "").startsWith("optimistic:");

/** 저장된 openWorkFiles·파일명으로 작업 파일 첨부를 정규화한다. */
const withOpenWorkFilesFlag = <
  T extends { fileName?: string; openWorkFiles?: boolean },
>(
  row: T,
): T =>
  chatAttachmentOpensWorkFiles(row) ? { ...row, openWorkFiles: true } : row;

const normalizeChatMessage = (message: ChatMessage): ChatMessage => {
  const list = Array.isArray(message.attachments) ? message.attachments : null;
  if (!list?.length) return message;
  let changed = false;
  const attachments = list.map((row) => {
    const next = withOpenWorkFilesFlag(row);
    if (next !== row && next.openWorkFiles && !row.openWorkFiles) changed = true;
    return next;
  });
  return changed ? { ...message, attachments } : message;
};

const normalizeChatMessages = (rows: ChatMessage[]) =>
  (Array.isArray(rows) ? rows : []).map(normalizeChatMessage);

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

const getMessageSortTime = (message: ChatMessage) => {
  const ts = new Date(String(message?.createdAt || "")).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const sortMessagesChronologically = (rows: ChatMessage[]) => {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.sort((a, b) => {
    const tDiff = getMessageSortTime(a) - getMessageSortTime(b);
    if (tDiff !== 0) return tDiff;
    return String(a?._id || "").localeCompare(String(b?._id || ""));
  });
};

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
    messages: sortMessagesChronologically(messages),
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

        const nextMessages = sortMessagesChronologically(
          normalizeChatMessages(res.data.data.messages || []),
        );
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
        openWorkFiles?: boolean;
      }>,
      options?: { replyTo?: string | null },
    ) => {
      const normalizedContent = String(content || "").trim();
      const normalizedAttachments = Array.isArray(attachments)
        ? attachments.filter((row) => String(row?.fileName || "").trim())
        : [];
      const replyToId = String(options?.replyTo || "").trim() || null;

      if (!token || !roomId) return null;
      if (!normalizedContent && normalizedAttachments.length === 0) return null;

      const senderId = String(
        user?.id || (user as { _id?: string } | null)?._id || "",
      ).trim();
      if (!senderId) return null;

      const nowIso = new Date().toISOString();
      const optimisticId = `optimistic:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const attachmentRows = normalizedAttachments.map((row) =>
        withOpenWorkFilesFlag({
          fileId: row.fileId,
          fileName: row.fileName,
          fileType: row.fileType,
          fileSize: row.fileSize,
          s3Key: row.s3Key,
          s3Url: row.s3Url,
          uploadedAt: nowIso,
          openWorkFiles: row.openWorkFiles,
        }),
      );

      let optimisticReplyTo: ChatMessage["replyTo"] = replyToId;
      setMessages((prev) => {
        if (replyToId) {
          const target = prev.find((m) => String(m._id) === replyToId);
          if (target) {
            optimisticReplyTo = {
              _id: String(target._id),
              content: String(target.content || ""),
              sender: target.sender
                ? {
                    _id: String(target.sender._id || ""),
                    name: String(target.sender.name || ""),
                    role: String(target.sender.role || ""),
                  }
                : null,
            };
          }
        }

        const optimistic: ChatMessage = {
          _id: optimisticId,
          roomId: String(roomId),
          sender: {
            _id: senderId,
            name: String(user?.name || "").trim() || "나",
            role: String(user?.role || "").trim(),
          },
          messageKind: "user",
          content:
            normalizedContent ||
            (attachmentRows.length ? "파일 첨부" : ""),
          attachments: attachmentRows,
          replyTo: optimisticReplyTo,
          reactions: [],
          readBy: [{ userId: senderId, readAt: nowIso }],
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const next = [...prev, optimistic];
        writeCachedMessages(
          String(roomId || "").trim(),
          userCacheId,
          next,
          pagination,
        );
        return next;
      });
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, Number(prev.total || 0) + 1),
      }));

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
            ...(replyToId ? { replyTo: replyToId } : {}),
          },
        });

        if (res.ok && res.data?.success) {
          const confirmed = res.data.data;
          setMessages((prev) => {
            if (!confirmed?._id) {
              return prev.filter((m) => String(m._id) !== optimisticId);
            }
            const withoutOptimistic = prev.filter(
              (m) =>
                String(m._id) !== optimisticId &&
                String(m._id) !== String(confirmed._id),
            );
            const merged = sortMessagesChronologically([
              ...withoutOptimistic,
              confirmed,
            ]);
            writeCachedMessages(
              String(roomId || "").trim(),
              userCacheId,
              merged,
              pagination,
            );
            return merged;
          });
          return confirmed;
        }

        throw new Error(res.data?.message || "메시지 전송에 실패했습니다.");
      } catch (e: unknown) {
        setMessages((prev) => {
          const next = prev.filter((m) => String(m._id) !== optimisticId);
          writeCachedMessages(
            String(roomId || "").trim(),
            userCacheId,
            next,
            pagination,
          );
          return next;
        });
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, Number(prev.total || 0) - 1),
        }));
        toast({
          title: "전송 실패",
          description: e instanceof Error ? e.message : "메시지 전송 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      }
    },
    [pagination, roomId, toast, token, user, userCacheId],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const mid = String(messageId || "").trim();
      const normalizedEmoji = String(emoji || "").trim();
      if (!token || !roomId || !mid || !normalizedEmoji) return null;

      try {
        const res = await apiFetch<{
          success: boolean;
          data: { messageId: string; roomId: string; reactions: ChatMessage["reactions"] };
          message?: string;
        }>({
          path: `/api/chats/rooms/${roomId}/messages/${mid}/reactions`,
          method: "POST",
          token,
          jsonBody: { emoji: normalizedEmoji },
        });

        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "리액션 처리에 실패했습니다.");
        }

        const nextReactions = Array.isArray(res.data.data?.reactions)
          ? res.data.data.reactions
          : [];

        setMessages((prev) => {
          const next = prev.map((m) =>
            String(m._id) === mid ? { ...m, reactions: nextReactions } : m,
          );
          writeCachedMessages(String(roomId || "").trim(), userCacheId, next, pagination);
          return next;
        });

        return nextReactions;
      } catch (e: unknown) {
        toast({
          title: "리액션 실패",
          description: e instanceof Error ? e.message : "리액션 처리 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      }
    },
    [pagination, roomId, toast, token, userCacheId],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const mid = String(messageId || "").trim();
      if (!token || !roomId || !mid) return false;

      try {
        const res = await apiFetch<{
          success: boolean;
          message?: string;
          data?: { messageId?: string; roomId?: string };
        }>({
          path: `/api/chats/rooms/${roomId}/messages/${mid}`,
          method: "DELETE",
          token,
        });

        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "메시지 삭제에 실패했습니다.");
        }

        setMessages((prev) => {
          const next = prev.filter((m) => String(m._id) !== mid);
          writeCachedMessages(
            String(roomId || "").trim(),
            userCacheId,
            next,
            pagination,
          );
          return next;
        });
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, Number(prev.total || 0) - 1),
        }));
        return true;
      } catch (e: unknown) {
        toast({
          title: "삭제 실패",
          description:
            e instanceof Error ? e.message : "메시지 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
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
      setMessages(sortMessagesChronologically(cached.messages || []));
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

  useAppEventListener({
    enabled: Boolean(roomId),
    eventTypes: [
      "chat:message-created",
      "chat:reaction-updated",
      "chat:message-deleted",
    ],
    deferWhenEditing: false,
    requireVisible: false,
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const eventRoomId = String(payload.roomId || "").trim();
      if (!eventRoomId || eventRoomId !== String(roomId || "").trim()) return;

      if (type === "chat:message-deleted") {
        const messageId = String(payload.messageId || "").trim();
        if (!messageId) return;
        setMessages((prev) => {
          if (!prev.some((m) => String(m._id) === messageId)) return prev;
          const next = prev.filter((m) => String(m._id) !== messageId);
          writeCachedMessages(
            String(roomId || "").trim(),
            userCacheId,
            next,
            pagination,
          );
          return next;
        });
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, Number(prev.total || 0) - 1),
        }));
        return;
      }

      if (type === "chat:reaction-updated") {
        const messageId = String(payload.messageId || "").trim();
        if (!messageId) return;
        const nextReactions = Array.isArray(payload.reactions)
          ? (payload.reactions as NonNullable<ChatMessage["reactions"]>)
          : [];

        setMessages((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            if (String(m._id) !== messageId) return m;
            changed = true;
            return { ...m, reactions: nextReactions };
          });
          if (!changed) return prev;
          writeCachedMessages(String(roomId || "").trim(), userCacheId, next, pagination);
          return next;
        });
        return;
      }

      const messageRaw =
        payload.message && typeof payload.message === "object"
          ? normalizeChatMessage(payload.message as ChatMessage)
          : null;
      if (!messageRaw?._id) return;

      const senderId = String(messageRaw.sender?._id || payload.senderId || "").trim();
      const isMine = senderId ? myIdCandidates.has(senderId) : false;

      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(messageRaw._id))) {
          // 확인된 id가 오면 같은 내용의 낙관적 행만 걷어낸다.
          if (!isMine) return prev;
          const cleaned = prev.filter(
            (m) =>
              String(m._id) === String(messageRaw._id) ||
              !isOptimisticMessageId(m._id) ||
              String(m.content || "") !== String(messageRaw.content || ""),
          );
          if (cleaned.length === prev.length) return prev;
          writeCachedMessages(
            String(roomId || "").trim(),
            userCacheId,
            cleaned,
            pagination,
          );
          return cleaned;
        }

        const withoutOptimistic = isMine
          ? prev.filter(
              (m) =>
                !isOptimisticMessageId(m._id) ||
                String(m.content || "") !== String(messageRaw.content || ""),
            )
          : prev;
        const next = sortMessagesChronologically([
          ...withoutOptimistic,
          messageRaw,
        ]);
        writeCachedMessages(String(roomId || "").trim(), userCacheId, next, pagination);
        return next;
      });

      if (!isMine) {
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, Number(prev.total || 0) + 1),
        }));
      }
    },
  });

  return {
    messages,
    loading,
    error,
    pagination,
    fetchMessages,
    prefetchMessages,
    sendMessage,
    toggleReaction,
    deleteMessage,
    setMessages,
  };
};
