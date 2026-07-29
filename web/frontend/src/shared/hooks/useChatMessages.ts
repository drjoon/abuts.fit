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

const INITIAL_PAGINATION = {
  total: 0,
  page: 1,
  limit: CHAT_PAGE_LIMIT,
  pages: 0,
};

export const useChatMessages = (options: UseChatMessagesOptions = {}) => {
  const { roomId, autoFetch = true } = options;
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const fetchSequenceRef = useRef(0);

  const myIdCandidates = useMemo(() => {
    const ids = [user?.id, (user as { _id?: string } | null)?._id]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [user]);

  const fetchMessages = useCallback(
    async (page = 1) => {
      const normalizedRoomId = String(roomId || "").trim();
      if (!normalizedRoomId) return;

      const currentSequence = ++fetchSequenceRef.current;
      setLoading(true);
      setError(null);

      try {
        const res = await apiFetch<{
          success: boolean;
          data: {
            messages: ChatMessage[];
            pagination: typeof pagination;
          };
        }>({
          path: `/api/chats/rooms/${normalizedRoomId}/messages?page=${page}&limit=${CHAT_PAGE_LIMIT}`,
          method: "GET",
          token,
        });

        if (currentSequence !== fetchSequenceRef.current) return;

        if (res.ok && res.data?.success) {
          setMessages(res.data.data.messages || []);
          setPagination(res.data.data.pagination || INITIAL_PAGINATION);
        } else {
          throw new Error("메시지 조회에 실패했습니다.");
        }
      } catch (e: unknown) {
        if (currentSequence !== fetchSequenceRef.current) return;
        const errorMsg =
          e instanceof Error
            ? e.message
            : "메시지를 불러오는 중 오류가 발생했습니다.";
        setError(errorMsg);
        toast({
          title: "오류",
          description: errorMsg,
          variant: "destructive",
        });
      } finally {
        if (currentSequence === fetchSequenceRef.current) {
          setLoading(false);
        }
      }
    },
    [roomId, toast, token]
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
            return [...prev, next];
          });
          return res.data.data;
        } else {
          throw new Error(res.data?.message || "메시지 전송에 실패했습니다.");
        }
      } catch (e: unknown) {
        toast({
          title: "전송 실패",
          description:
            e instanceof Error ? e.message : "메시지 전송 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      }
    },
    [token, roomId, toast]
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
    void fetchMessages();
  }, [autoFetch, roomId, fetchMessages]);

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
        return next;
      });

      if (!isMine) {
        setPagination((prev) => ({ ...prev, total: Math.max(0, Number(prev.total || 0) + 1) }));
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [myIdCandidates, roomId]);

  return {
    messages,
    loading,
    error,
    pagination,
    fetchMessages,
    sendMessage,
    setMessages,
  };
};
