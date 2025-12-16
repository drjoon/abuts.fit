import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { ChatMessage } from "./useChatRooms";

interface UseChatMessagesOptions {
  roomId?: string;
  autoFetch?: boolean;
}

export const useChatMessages = (options: UseChatMessagesOptions = {}) => {
  const { roomId, autoFetch = true } = options;
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    pages: 0,
  });

  const fetchMessages = useCallback(
    async (page = 1) => {
      if (!token || !roomId) return;

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
          path: `/api/chats/rooms/${roomId}/messages?page=${page}&limit=50`,
          method: "GET",
          token,
        });

        if (res.ok && res.data?.success) {
          setMessages(res.data.data.messages || []);
          setPagination(res.data.data.pagination);
        } else {
          throw new Error("메시지 조회에 실패했습니다.");
        }
      } catch (e: any) {
        const errorMsg =
          e?.message || "메시지를 불러오는 중 오류가 발생했습니다.";
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
    [token, roomId, toast]
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
      if (!token || !roomId || !content.trim()) return null;

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
            content: content.trim(),
            attachments: attachments || [],
          },
        });

        if (res.ok && res.data?.success) {
          setMessages((prev) => [...prev, res.data!.data]);
          return res.data.data;
        } else {
          throw new Error(res.data?.message || "메시지 전송에 실패했습니다.");
        }
      } catch (e: any) {
        toast({
          title: "전송 실패",
          description: e?.message || "메시지 전송 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      }
    },
    [token, roomId, toast]
  );

  useEffect(() => {
    if (autoFetch && roomId) {
      void fetchMessages();
    }
  }, [autoFetch, roomId, fetchMessages]);

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
