import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, MessageSquarePlus } from "lucide-react";
import { Friend } from "./types";
import { mockFriends } from "./mockData";

interface CreateChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getRoleBadgeColor = (role: string) => {
  switch (role) {
    case 'requestor': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'manufacturer': return 'bg-green-100 text-green-800 border-green-200';
    case 'admin': return 'bg-purple-100 text-purple-800 border-purple-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'requestor': return '기공소';
    case 'manufacturer': return '제작사'; 
    case 'admin': return '어벗츠.핏';
    default: return '사용자';
  }
};

export const CreateChatModal = ({ open, onOpenChange }: CreateChatModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  
  const filteredFriends = mockFriends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFriendSelect = (friendId: string, checked: boolean) => {
    if (checked) {
      setSelectedFriends(prev => [...prev, friendId]);
    } else {
      setSelectedFriends(prev => prev.filter(id => id !== friendId));
    }
  };

  const handleCreateChat = () => {
    if (selectedFriends.length === 0) return;

    const chatData = {
      participants: selectedFriends,
      groupName: selectedFriends.length > 1 ? groupName : undefined,
      isGroup: selectedFriends.length > 1
    };

    console.log('새 채팅방 생성:', chatData);
    // 실제 구현에서는 여기서 채팅방 생성 API 호출
    
    // 모달 닫기 및 상태 초기화
    onOpenChange(false);
    setSelectedFriends([]);
    setGroupName("");
    setSearchQuery("");
  };

  const isGroup = selectedFriends.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 채팅</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="친구 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* 그룹 이름 (다중 선택 시) */}
          {isGroup && (
            <Input
              placeholder="그룹 채팅방 이름 (선택사항)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          )}

          {/* 선택된 친구들 */}
          {selectedFriends.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-lg">
              {selectedFriends.map(friendId => {
                const friend = mockFriends.find(f => f.id === friendId);
                return friend ? (
                  <Badge key={friendId} variant="secondary" className="gap-1">
                    {friend.name}
                  </Badge>
                ) : null;
              })}
            </div>
          )}

          {/* 친구 목록 */}
          <div className="max-h-80 overflow-y-auto space-y-2">
            {filteredFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedFriends.includes(friend.id)}
                  onCheckedChange={(checked) => handleFriendSelect(friend.id, checked as boolean)}
                />
                
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm">
                      {friend.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                    friend.isOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{friend.name}</span>
                    <Badge variant="outline" className={`text-xs ${getRoleBadgeColor(friend.role)}`}>
                      {getRoleLabel(friend.role)}
                    </Badge>
                  </div>
                  {friend.statusMessage && (
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {friend.statusMessage}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {filteredFriends.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">친구가 없습니다</p>
              </div>
            )}
          </div>

          {/* 생성 버튼 */}
          <Button 
            onClick={handleCreateChat}
            disabled={selectedFriends.length === 0}
            className="w-full"
          >
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            {isGroup ? '그룹 채팅' : '1:1 채팅'} 시작
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};