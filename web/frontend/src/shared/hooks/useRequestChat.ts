import { useEffect, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

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
  const { token } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>(fallbackMessages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setMessages(fallbackMessages);
      return;
    }

    // Request.messages 기반 채팅은 정책상/설계상 제거됨
    setMessages(fallbackMessages);
    setError("의뢰 기반 채팅은 더 이상 지원되지 않습니다.");
  }, [requestId, fallbackMessages, token]);

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
      toast({
        title: "전송 불가",
        description: "의뢰 기반 채팅은 더 이상 지원되지 않습니다.",
        variant: "destructive",
      });
      return;
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
  };

  return {
    messages,
    loading,
    error,
    sendMessage,
    setMessages,
  };
};
