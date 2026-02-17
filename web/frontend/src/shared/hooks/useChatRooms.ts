import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";

export interface ChatRoomParticipant {
  _id: string;
  name: string;
  email: string;
  role: "requestor" | "manufacturer" | "admin";
  organization?: string;
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
  readBy?: Array<{
    userId: string;
    readAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

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
  lastMessageAt: string;
  status: "active" | "suspended" | "monitored";
  unreadCount?: number;
  lastMessage?: ChatMessage;
  createdAt: string;
  updatedAt: string;
}

export const useChatRooms = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e: any) {
      const errorMsg =
        e?.message || "채팅방 목록을 불러오는 중 오류가 발생했습니다.";
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
      } catch (e: any) {
        toast({
          title: "오류",
          description: e?.message || "채팅방 생성 중 오류가 발생했습니다.",
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

  return {
    rooms,
    loading,
    error,
    fetchRooms,
    createOrGetChatRoom,
  };
};
