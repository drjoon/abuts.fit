import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";

export interface ChatRoomParticipant {
  _id: string;
  name: string;
  email: string;
  role: "requestor" | "manufacturer" | "admin";
  organization?: string;
}

export interface ChatMessageReaction {
  emoji: string;
  userId: string;
  createdAt?: string;
}

export interface ChatMessageReplyTo {
  _id: string;
  content: string;
  isDeleted?: boolean;
  sender?: {
    _id?: string;
    name: string;
    role: string;
  } | null;
}

export interface ChatMessage {
  _id: string;
  roomId: string;
  sender: {
    _id: string;
    name: string;
    role: string;
  };
  content: string;
  attachments?: Array<{
    fileId?: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    s3Key: string;
    s3Url: string;
    uploadedAt: string;
  }>;
  replyTo?: ChatMessageReplyTo | string | null;
  reactions?: ChatMessageReaction[];
  readBy?: Array<{
    userId: string;
    readAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/shared/hooks/useChatMessages.ts
// - web/backend/models/chatRoom.model.js
// - web/backend/controllers/chats/chat.controller.js
export interface ChatRoom {
  _id: string;
  participants: ChatRoomParticipant[];
  roomType: "direct" | "group";
  title: string;
  relatedRequestId?: {
    _id: string;
    requestId: string;
    title: string;
  };
  relatedPracticeTransferId?: {
    _id: string;
    transferId: string;
  };
  lastMessageAt: string;
  status: "active" | "suspended" | "monitored";
  unreadCount?: number;
  lastMessage?: ChatMessage;
  createdAt: string;
  updatedAt: string;
}

export const useChatRooms = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fallbackReloadTimerRef = useRef<number | null>(null);
  const roomsRef = useRef<ChatRoom[]>([]);

  const myIdCandidates = useMemo(() => {
    const ids = [user?.id, (user as { _id?: string } | null)?._id]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [user]);

  const fetchRooms = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{ success: boolean; data: ChatRoom[] }>({
        path: "/api/chats/rooms",
        method: "GET",
        token,
      });

      if (res.ok && res.data?.success) {
        setRooms(res.data.data || []);
      } else {
        throw new Error("채팅방 목록 조회에 실패했습니다.");
      }
    } catch (e: unknown) {
      const errorMsg =
        e instanceof Error
          ? e.message
          : "채팅방 목록을 불러오는 중 오류가 발생했습니다.";
      setError(errorMsg);
      toast({
        title: "오류",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  const createOrGetChatRoom = useCallback(
    async (
      participantIds: string[],
      title?: string,
      relatedRequestId?: string
    ) => {
      if (!token) return null;

      try {
        const res = await apiFetch<{
          success: boolean;
          data: ChatRoom;
          message: string;
        }>({
          path: "/api/chats/rooms",
          method: "POST",
          token,
          jsonBody: {
            participantIds,
            title: title || "",
            relatedRequestId: relatedRequestId || null,
          },
        });

        if (res.ok && res.data?.success) {
          await fetchRooms();
          return res.data.data;
        } else {
          throw new Error(res.data?.message || "채팅방 생성에 실패했습니다.");
        }
      } catch (e: unknown) {
        toast({
          title: "오류",
          description:
            e instanceof Error ? e.message : "채팅방 생성 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      }
    },
    [token, toast, fetchRooms]
  );

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const scheduleFallbackReload = useCallback(() => {
    if (fallbackReloadTimerRef.current) {
      window.clearTimeout(fallbackReloadTimerRef.current);
    }
    fallbackReloadTimerRef.current = window.setTimeout(() => {
      void fetchRooms();
    }, 160);
  }, [fetchRooms]);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: ["chat:message-created", "chat:room-read"],
    // 채팅은 입력 중에도 즉시 unread/lastMessage를 반영해도 폼 상태를 깨지 않으므로 defer를 비활성화한다.
    deferWhenEditing: false,
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      if (type === "chat:message-created") {
        const roomId = String(payload.roomId || "").trim();
        if (!roomId) return;

        const message =
          payload.message && typeof payload.message === "object"
            ? (payload.message as ChatMessage)
            : null;
        const senderId = String(payload.senderId || message?.sender?._id || "").trim();
        const isMine = senderId ? myIdCandidates.has(senderId) : false;

        const roomExists = roomsRef.current.some(
          (room) => String(room._id || "") === roomId,
        );

        setRooms((prev) =>
          prev.map((room) => {
            if (String(room._id || "") !== roomId) return room;

            const prevUnread = Math.max(0, Number(room.unreadCount || 0));
            return {
              ...room,
              unreadCount: isMine ? prevUnread : prevUnread + 1,
              lastMessage: message || room.lastMessage,
              lastMessageAt: String(message?.createdAt || room.lastMessageAt || ""),
            };
          }),
        );

        if (!roomExists) {
          scheduleFallbackReload();
        }
        return;
      }

      if (type === "chat:room-read") {
        const roomId = String(payload.roomId || "").trim();
        const readerUserId = String(payload.userId || "").trim();
        if (!roomId || !readerUserId) return;
        if (!myIdCandidates.has(readerUserId)) return;

        setRooms((prev) =>
          prev.map((room) =>
            String(room._id || "") === roomId
              ? { ...room, unreadCount: 0 }
              : room,
          ),
        );
      }
    },
  });

  useEffect(() => {
    return () => {
      if (fallbackReloadTimerRef.current) {
        window.clearTimeout(fallbackReloadTimerRef.current);
        fallbackReloadTimerRef.current = null;
      }
    };
  }, []);

  return {
    rooms,
    loading,
    error,
    fetchRooms,
    createOrGetChatRoom,
  };
};
