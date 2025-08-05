import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Paperclip, Smile } from "lucide-react";
import { ChatRoom, Message } from "./types";
import { mockMessages } from "./mockData";
import { useAuthStore } from "@/store/useAuthStore";

interface ChatConversationProps {
  room: ChatRoom;
  onBack: () => void;
}

const getRoleColor = (role: string) => {
  switch (role) {
    case "requestor":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "manufacturer":
      return "bg-green-100 text-green-800 border-green-200";
    case "admin":
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getRoleLabel = (role: string) => {
  switch (role) {
    case "requestor":
      return "기공소";
    case "manufacturer":
      return "제작사";
    case "admin":
      return "어벗츠.핏";
    default:
      return "사용자";
  }
};

export const ChatConversation = ({ room, onBack }: ChatConversationProps) => {
  const { user } = useAuthStore();
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(
    mockMessages[room.id] || []
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !user) return;

    const message: Message = {
      id: `msg-${Date.now()}`,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      content: newMessage,
      timestamp: new Date(),
      isRead: false,
    };

    setMessages((prev) => [...prev, message]);
    setNewMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const messageDate = new Date(date);

    if (messageDate.toDateString() === today.toDateString()) {
      return "오늘";
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return "어제";
    }

    return messageDate.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [date: string]: Message[] } = {};

    messages.forEach((message) => {
      const dateKey = message.timestamp.toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(message);
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 헤더 */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b bg-muted/30">
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
          className="p-1 h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        <div className="text-center flex-1 min-w-0">
          <h3 className="font-semibold text-base sm:text-lg truncate">
            {room.title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {room.isGroup ? `${room.participants.length}명` : "1:1 채팅"}
          </p>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {Object.entries(messageGroups).map(([dateKey, dayMessages]) => (
          <div key={dateKey}>
            {/* 날짜 구분선 */}
            <div className="flex items-center justify-center my-6">
              <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                {formatDate(new Date(dateKey))}
              </div>
            </div>

            {/* 해당 날짜의 메시지들 */}
            {dayMessages.map((message, index) => {
              const isMyMessage = message.senderId === user?.id;
              const prevMessage = index > 0 ? dayMessages[index - 1] : null;
              const nextMessage =
                index < dayMessages.length - 1 ? dayMessages[index + 1] : null;

              const showAvatar =
                !isMyMessage &&
                (!nextMessage ||
                  nextMessage.senderId !== message.senderId ||
                  nextMessage.timestamp.getTime() -
                    message.timestamp.getTime() >
                    300000); // 5분

              const showName =
                !isMyMessage &&
                room.isGroup &&
                (!prevMessage ||
                  prevMessage.senderId !== message.senderId ||
                  message.timestamp.getTime() -
                    prevMessage.timestamp.getTime() >
                    300000); // 5분

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isMyMessage ? "justify-end" : "justify-start"
                  } mb-2`}
                >
                  <div
                    className={`flex items-end gap-2 max-w-[70%] ${
                      isMyMessage ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* 아바타 */}
                    {!isMyMessage && (
                      <div className="w-8">
                        {showAvatar ? (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {message.senderName[0]}
                            </AvatarFallback>
                          </Avatar>
                        ) : null}
                      </div>
                    )}

                    <div
                      className={`flex flex-col ${
                        isMyMessage ? "items-end" : "items-start"
                      }`}
                    >
                      {/* 발신자 이름 */}
                      {showName && (
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-xs font-medium">
                            {message.senderName}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getRoleColor(
                              message.senderRole
                            )}`}
                          >
                            {getRoleLabel(message.senderRole)}
                          </Badge>
                        </div>
                      )}

                      {/* 메시지 버블 */}
                      <div
                        className={`flex items-end gap-2 ${
                          isMyMessage ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        <div
                          className={`px-3 py-2 rounded-2xl max-w-full break-words ${
                            isMyMessage
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">
                            {message.content}
                          </p>

                          {/* 첨부파일 */}
                          {message.attachments &&
                            message.attachments.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {message.attachments.map((file, fileIndex) => (
                                  <div
                                    key={fileIndex}
                                    className="flex items-center gap-2 p-2 bg-background/20 rounded text-xs"
                                  >
                                    <Paperclip className="h-3 w-3" />
                                    <span className="truncate">{file}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>

                        {/* 시간 */}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="p-3 sm:p-4 border-t bg-muted/30">
        <div className="flex items-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="mb-1 h-8 w-8 sm:h-9 sm:w-9 p-0"
          >
            <Paperclip className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>

          <div className="flex-1 min-h-[32px] sm:min-h-[40px] max-h-32">
            <Input
              placeholder="메시지를 입력하세요..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              className="resize-none text-sm sm:text-base"
            />
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="mb-1 h-8 w-8 sm:h-9 sm:w-9 p-0"
          >
            <Smile className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>

          <Button
            size="sm"
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="mb-1 h-8 sm:h-9 px-2 sm:px-3"
          >
            <Send className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
