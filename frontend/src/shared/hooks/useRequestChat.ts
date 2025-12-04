import { useEffect, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";

export type ChatSenderRole = "requestor" | "manufacturer" | "admin";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ChatSenderRole;
  content: string;
  timestamp: Date;
}

interface UseRequestChatOptions {
  requestId?: string;
  fallbackMessages?: ChatMessage[];
  currentUserId?: string;
  currentUserRole?: ChatSenderRole;
  currentUserName?: string;
}

export const mapApiMessagesToChatMessages = (
  apiMessages: any[] | undefined | null
): ChatMessage[] => {
  if (!apiMessages || !Array.isArray(apiMessages)) return [];
  return apiMessages.map((m, index) => {
    const sender: any = m.sender || {};
    const createdAt = m.createdAt ? new Date(m.createdAt) : new Date();
    return {
      id: m._id || m.id || String(index),
      senderId: sender._id || String(sender.id || ""),
      senderName: sender.name || "알 수 없음",
      senderRole: (sender.role as ChatSenderRole) || "requestor",
      content: m.content || "",
      timestamp: createdAt,
    } as ChatMessage;
  });
};

export const useRequestChat = ({
  requestId,
  fallbackMessages = [],
  currentUserId,
  currentUserRole = "requestor",
  currentUserName,
}: UseRequestChatOptions) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>(fallbackMessages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setMessages(fallbackMessages);
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/requests/${requestId}`);
        if (!res.ok) {
          throw new Error("의뢰 메시지 조회에 실패했습니다.");
        }
        const body = await res.json();
        const requestData = body?.data || body;
        const apiMessages = requestData?.messages ?? [];
        setMessages(mapApiMessagesToChatMessages(apiMessages));
      } catch (e: any) {
        setError(e?.message || "메시지 조회 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void fetchMessages();
  }, [requestId, fallbackMessages]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const baseSenderId = currentUserId || "";
    const baseSenderRole: ChatSenderRole = currentUserRole;
    const baseSenderName =
      currentUserName ||
      (baseSenderRole === "requestor"
        ? "의뢰자"
        : baseSenderRole === "manufacturer"
        ? "제작사"
        : "어벗츠.핏");

    if (requestId) {
      try {
        const res = await fetch(`/api/requests/${requestId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: content.trim() }),
        });

        const body = await res.json().catch(() => null);
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "메시지 전송에 실패했습니다.");
        }

        const updatedRequest = body?.data || {};
        const apiMessages = updatedRequest?.messages ?? [];
        setMessages(mapApiMessagesToChatMessages(apiMessages));

        toast({
          title: "메시지가 전송되었습니다",
          description: "상대방이 곧 응답할 예정입니다.",
        });
        return;
      } catch (e: any) {
        toast({
          title: "전송 실패",
          description: e?.message || "메시지 전송 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return;
      }
    }

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      senderId: baseSenderId,
      senderName: baseSenderName,
      senderRole: baseSenderRole,
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);

    toast({
      title: "메시지가 전송되었습니다",
      description: "상대방이 곧 응답할 예정입니다.",
    });
  };

  return {
    messages,
    loading,
    error,
    sendMessage,
    setMessages,
  };
};
