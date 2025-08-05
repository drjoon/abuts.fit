import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageSquare, X, Minimize2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { ChatFriendsList } from "./ChatFriendsList";
import { ChatRoomsList } from "./ChatRoomsList";
import { ChatConversation } from "./ChatConversation";
import { Friend, ChatRoom } from "./types";

type ViewMode = "friends" | "chats" | "conversation";

export const NewChatWidget = () => {
  const { isAuthenticated } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("chats");
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);

  const handleSelectFriend = (friend: Friend) => {
    // 1:1 채팅방 생성 또는 기존 채팅방으로 이동
    console.log("Selected friend:", friend);
    // 실제 구현에서는 여기서 채팅방을 생성하거나 찾아서 이동
  };

  const handleSelectRoom = (room: ChatRoom) => {
    setSelectedRoom(room);
    setViewMode("conversation");
  };

  const handleCreateGroup = () => {
    // 그룹 채팅 생성 모달 열기
    console.log("Create group chat");
  };

  const handleBackToRooms = () => {
    setSelectedRoom(null);
    setViewMode("chats");
  };

  if (!isAuthenticated) {
    return null; // 로그인하지 않은 사용자에게는 채팅 위젯을 표시하지 않음
  }

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
      {!isOpen ? (
        <Button
          size="lg"
          className="rounded-full h-12 w-12 sm:h-14 sm:w-14 shadow-elegant animate-pulse-glow"
          variant="hero"
          onClick={() => setIsOpen(true)}
        >
          <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
          {/* 읽지 않은 메시지 알림 */}
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
            3
          </span>
        </Button>
      ) : (
        <Card
          className={`
          w-[calc(100vw-2rem)] max-w-96 h-[calc(100vh-8rem)] max-h-[600px] sm:w-96 sm:h-[600px]
          border transition-all duration-300 bg-card overflow-hidden 
          ${isMinimized ? "h-12" : ""}
        `}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-3 sm:py-4 border-b bg-muted/50">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* 탭 */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={viewMode === "friends" ? "default" : "ghost"}
                  onClick={() => setViewMode("friends")}
                  disabled={viewMode === "conversation"}
                  className="text-xs sm:text-sm px-2 sm:px-3"
                >
                  친구
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "chats" ? "default" : "ghost"}
                  onClick={() => setViewMode("chats")}
                  disabled={viewMode === "conversation"}
                  className="text-xs sm:text-sm px-2 sm:px-3"
                >
                  채팅
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsMinimized(!isMinimized)}
                title="축소"
                className="h-8 w-8 p-0"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                title="닫기"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!isMinimized && (
            <div className="h-[calc(100%-3.5rem)] sm:h-[544px]">
              {viewMode === "friends" && (
                <ChatFriendsList onSelectFriend={handleSelectFriend} />
              )}

              {viewMode === "chats" && (
                <ChatRoomsList
                  onSelectRoom={handleSelectRoom}
                  onCreateGroup={handleCreateGroup}
                />
              )}

              {viewMode === "conversation" && selectedRoom && (
                <ChatConversation
                  room={selectedRoom}
                  onBack={handleBackToRooms}
                />
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
