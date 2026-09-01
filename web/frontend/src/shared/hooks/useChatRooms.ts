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
  /** user(기본) | system(작업취소 등 상태 기록) */
  messageKind?: "user" | "system" | string;
  systemEvent?: string | null;
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
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/shared/hooks/useChatMessages.ts
// - web/backend/models/chatRoom.model.js
// - web/backend/controllers/chats/chat.controller.js
// change-log:
// - 2026-08-26: 휴지통 이동 시 전 인스턴스 공유 refresh(skipCache) — 사이드·최근의뢰 배지 즉시 동기화.
// - 2026-08-26: 휴지통 이동/복구/비우기 시 rooms 재조회로 최근의뢰·사이드 unread 즉시 반영.
// - 2026-08-20: 기공소 변경(lab-retargeted*) 시 방 목록 재조회로 이전 기공소 유령 unread 제거.
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

/** 페이지·사이드바 useChatRooms 인스턴스에 동일 갱신을 알린다. */
export const CHAT_ROOMS_REFRESH_EVENT = "abuts:chat-rooms:refresh";

export type ChatRoomsRefreshDetail = {
  action?: string;
  transferIds?: string[];
  transferMongoIds?: string[];
  skipCache?: boolean;
  /** false면 로컬 drop만(삭제 API 완료 전 stale 재조회 방지). 기본 true. */
  refetch?: boolean;
};

export function requestChatRoomsRefresh(detail: ChatRoomsRefreshDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ChatRoomsRefreshDetail>(CHAT_ROOMS_REFRESH_EVENT, {
      detail: {
        skipCache: true,
        ...detail,
      },
    }),
  );
}

const collectTransferKeysFromPayload = (payload: Record<string, unknown>) => {
  const mongoIds = new Set<string>();
  const transferIds = new Set<string>();
  const ownMongo = String(payload.transferMongoId || "").trim();
  const ownTransfer = String(payload.transferId || "").trim();
  if (ownMongo) mongoIds.add(ownMongo);
  if (ownTransfer) transferIds.add(ownTransfer);

  const fromArrays = [
    ...(Array.isArray(payload.transferMongoIds) ? payload.transferMongoIds : []),
    ...(Array.isArray(payload.transferIds) ? payload.transferIds : []),
  ];
  for (const raw of fromArrays) {
    const id = String(raw || "").trim();
    if (!id) continue;
    if (/^[a-f0-9]{24}$/i.test(id)) mongoIds.add(id);
    else transferIds.add(id);
  }

  const affected = Array.isArray(payload.affectedTransfers)
    ? payload.affectedTransfers
    : [];
  for (const row of affected) {
    if (!row || typeof row !== "object") {
      const asId = String(row || "").trim();
      if (!asId) continue;
      if (/^[a-f0-9]{24}$/i.test(asId)) mongoIds.add(asId);
      else transferIds.add(asId);
      continue;
    }
    const rec = row as { transferMongoId?: unknown; transferId?: unknown };
    const mid = String(rec.transferMongoId || "").trim();
    const tid = String(rec.transferId || "").trim();
    if (mid) mongoIds.add(mid);
    if (tid) transferIds.add(tid);
  }

  return { mongoIds, transferIds };
};

const dropRoomsForTransferKeys = (
  rooms: ChatRoom[],
  mongoIds: Set<string>,
  transferIds: Set<string>,
) => {
  if (mongoIds.size === 0 && transferIds.size === 0) return rooms;
  return rooms.filter((room) => {
    const related = room.relatedPracticeTransferId;
    const mid = String(related?._id || "").trim();
    const tid = String(related?.transferId || "").trim();
    if (mid && mongoIds.has(mid)) return false;
    if (tid && transferIds.has(tid)) return false;
    return true;
  });
};

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

  const fetchRooms = useCallback(
    async (opts?: { skipCache?: boolean }) => {
      if (!token) return;

      setLoading(true);
      setError(null);

      try {
        const res = await apiFetch<{ success: boolean; data: ChatRoom[] }>({
          path: "/api/chats/rooms",
          method: "GET",
          token,
          skipCache: Boolean(opts?.skipCache),
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
    },
    [token, toast],
  );

  const createOrGetChatRoom = useCallback(
    async (
      participantIds: string[],
      title?: string,
      relatedRequestId?: string,
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
          await fetchRooms({ skipCache: true });
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
    [token, toast, fetchRooms],
  );

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const scheduleFallbackReload = useCallback(
    (opts?: { skipCache?: boolean }) => {
      if (fallbackReloadTimerRef.current) {
        window.clearTimeout(fallbackReloadTimerRef.current);
      }
      fallbackReloadTimerRef.current = window.setTimeout(() => {
        void fetchRooms({ skipCache: opts?.skipCache !== false });
      }, 160);
    },
    [fetchRooms],
  );

  // 레이아웃·페이지 각각 useChatRooms — 삭제 직후 공유 이벤트로 둘 다 갱신.
  useEffect(() => {
    const onRefresh = (evt: Event) => {
      const detail =
        evt instanceof CustomEvent && evt.detail && typeof evt.detail === "object"
          ? (evt.detail as ChatRoomsRefreshDetail)
          : {};
      const action = String(detail.action || "").trim();
      if (action === "deleted" || action === "trash-emptied" || action === "purged") {
        const { mongoIds, transferIds } = collectTransferKeysFromPayload({
          transferIds: detail.transferIds,
          transferMongoIds: detail.transferMongoIds,
        });
        if (mongoIds.size > 0 || transferIds.size > 0) {
          setRooms((prev) => dropRoomsForTransferKeys(prev, mongoIds, transferIds));
        }
      }
      // 삭제 optimistic은 refetch:false — API 완료 전 stale rooms로 배지가 되살아나지 않게.
      if (detail.refetch === false) return;
      scheduleFallbackReload({ skipCache: detail.skipCache !== false });
    };
    window.addEventListener(CHAT_ROOMS_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(CHAT_ROOMS_REFRESH_EVENT, onRefresh);
    };
  }, [scheduleFallbackReload]);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: [
      "chat:message-created",
      "chat:room-read",
      "practice:transfer-updated",
    ],
    // 채팅은 입력 중에도 즉시 unread/lastMessage를 반영해도 폼 상태를 깨지 않으므로 defer를 비활성화한다.
    deferWhenEditing: false,
    requireVisible: false,
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      if (type === "practice:transfer-updated") {
        const action = String(payload.action || "").trim();
        if (
          action === "lab-retargeted-away" ||
          action === "lab-retargeted" ||
          action === "lab_retarget" ||
          action === "deleted" ||
          action === "restored" ||
          action === "trash-emptied" ||
          action === "purged"
        ) {
          if (
            action === "deleted" ||
            action === "trash-emptied" ||
            action === "purged"
          ) {
            const { mongoIds, transferIds } =
              collectTransferKeysFromPayload(payload);
            if (mongoIds.size > 0 || transferIds.size > 0) {
              setRooms((prev) =>
                dropRoomsForTransferKeys(prev, mongoIds, transferIds),
              );
            }
          }
          scheduleFallbackReload({ skipCache: true });
        }
        return;
      }

      if (type === "chat:message-created") {
        const roomId = String(payload.roomId || "").trim();
        if (!roomId) return;

        const message =
          payload.message && typeof payload.message === "object"
            ? (payload.message as ChatMessage)
            : null;
        const senderId = String(
          payload.senderId || message?.sender?._id || "",
        ).trim();
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
              lastMessageAt: String(
                message?.createdAt || room.lastMessageAt || "",
              ),
            };
          }),
        );

        if (!roomExists) {
          scheduleFallbackReload({ skipCache: true });
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
