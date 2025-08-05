import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, MessageSquarePlus, Users } from "lucide-react";
import { ChatRoom } from "./types";
import { mockChatRooms } from "./mockData";
import { CreateChatModal } from "./CreateChatModal";

interface ChatRoomsListProps {
  onSelectRoom: (room: ChatRoom) => void;
  onCreateGroup: () => void;
}

export const ChatRoomsList = ({ onSelectRoom, onCreateGroup }: ChatRoomsListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateChat, setShowCreateChat] = useState(false);

  const filteredRooms = mockChatRooms.filter(room =>
    room.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.participants.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return date.toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else if (diffInDays < 7) {
      return `${diffInDays}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', { 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 헤더 */}
      <div className="p-3 sm:p-4 border-b bg-muted/30">        
        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            placeholder="채팅방 이름, 참여자 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 sm:pl-10 pr-10 sm:pr-12 bg-background/50 text-sm sm:text-base h-8 sm:h-10"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCreateChat(true)}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 sm:h-8 sm:w-8 p-0"
          >
            <MessageSquarePlus className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      {/* 채팅방 목록 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-1 sm:p-2">
          {filteredRooms.map((room) => (
            <div
              key={room.id}
              className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => onSelectRoom(room)}
            >
              {/* 아바타 */}
              <div className="relative">
                {room.isGroup ? (
                  <div className="flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 bg-muted rounded-full">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                  </div>
                ) : (
                  <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
                    <AvatarFallback className="text-xs sm:text-sm">
                      {room.participants[0]?.name[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                )}
                
                {room.isGroup && (
                  <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center">
                    {room.participants.length}
                  </div>
                )}
              </div>

              {/* 채팅방 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-xs sm:text-sm truncate">{room.title}</h3>
                  <div className="flex items-center gap-1 sm:gap-2">
                    {room.lastMessage && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(room.lastMessage.timestamp)}
                      </span>
                    )}
                    {room.unreadCount > 0 && (
                      <Badge variant="destructive" className="text-xs min-w-[16px] h-4 sm:min-w-[20px] sm:h-5">
                        {room.unreadCount > 99 ? '99+' : room.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>

                {room.lastMessage && (
                  <div className="flex items-center gap-1">
                    {room.isGroup && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {room.lastMessage.senderName}:
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {room.lastMessage.content}
                    </p>
                  </div>
                )}

                {!room.lastMessage && (
                  <p className="text-xs text-muted-foreground">
                    새로운 채팅방입니다
                  </p>
                )}
              </div>
            </div>
          ))}

          {filteredRooms.length === 0 && (
            <div className="text-center py-6 sm:py-8">
              <p className="text-muted-foreground text-xs sm:text-sm">채팅방이 없습니다</p>
            </div>
          )}
        </div>
      </div>

      <CreateChatModal 
        open={showCreateChat} 
        onOpenChange={setShowCreateChat} 
      />
    </div>
  );
};