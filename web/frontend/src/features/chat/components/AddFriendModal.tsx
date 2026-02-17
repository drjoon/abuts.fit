import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus } from "lucide-react";
import { Friend } from "./types";

interface AddFriendModalProps {
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

// 검색 가능한 모든 사용자 (친구가 아닌 사용자들)
const mockSearchUsers: Friend[] = [
  {
    id: "6",
    name: "신동원",
    role: "manufacturer",
    isOnline: true,
    statusMessage: "맞춤형 크라운 전문"
  },
  {
    id: "7",
    name: "오지훈",
    role: "requestor",
    isOnline: false,
    statusMessage: "임플란트 기공"
  },
  {
    id: "8",
    name: "윤서현",
    role: "admin",
    isOnline: true,
    statusMessage: "어벗츠.핏 고객지원"
  },
  {
    id: "9",
    name: "조민재",
    role: "manufacturer",
    isOnline: true,
    statusMessage: "프리미엄 덴처 제작"
  },
  {
    id: "10",
    name: "한지원",
    role: "requestor",
    isOnline: false,
    statusMessage: "정밀 교정장치 전문"
  }
];

export const AddFriendModal = ({ open, onOpenChange }: AddFriendModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredUsers = mockSearchUsers.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.statusMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddFriend = (user: Friend) => {
    console.log('친구 추가:', user);
    // 실제 구현에서는 여기서 친구 추가 API 호출
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>친구 추가</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름 또는 상태메시지로 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* 사용자 목록 */}
          <div className="max-h-80 overflow-y-auto space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-sm">
                        {user.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                      user.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{user.name}</span>
                      <Badge variant="outline" className={`text-xs ${getRoleBadgeColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </Badge>
                    </div>
                    {user.statusMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {user.statusMessage}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddFriend(user)}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  추가
                </Button>
              </div>
            ))}

            {filteredUsers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">검색 결과가 없습니다</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};