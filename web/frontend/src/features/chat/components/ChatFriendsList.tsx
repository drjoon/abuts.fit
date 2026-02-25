import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, Star } from "lucide-react";
import { Friend } from "./types";
import { mockFriends } from "./mockData";
import { AddFriendModal } from "./AddFriendModal";

interface ChatFriendsListProps {
  onSelectFriend: (friend: Friend) => void;
}

const getRoleBadgeColor = (role: string) => {
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
      return "사업자";
    case "manufacturer":
      return "제작사";
    case "admin":
      return "어벗츠.핏";
    default:
      return "사용자";
  }
};

export const ChatFriendsList = ({ onSelectFriend }: ChatFriendsListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);

  const filteredFriends = mockFriends.filter((friend) =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const favoriteFriends = filteredFriends.filter((friend) => friend.isFavorite);
  const regularFriends = filteredFriends.filter((friend) => !friend.isFavorite);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 헤더 */}
      <div className="p-3 sm:p-4 border-b bg-muted/30">
        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            placeholder="이름으로 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 sm:pl-10 pr-10 sm:pr-12 bg-background/50 text-sm sm:text-base h-8 sm:h-10"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAddFriend(true)}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 sm:h-8 sm:w-8 p-0"
          >
            <UserPlus className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      {/* 친구 목록 */}
      <div className="flex-1 overflow-y-auto">
        {/* 즐겨찾기 */}
        {favoriteFriends.length > 0 && (
          <div className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <Star className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500" />
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                즐겨찾기
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {favoriteFriends.length}
              </span>
            </div>
            <div className="space-y-1 sm:space-y-2">
              {favoriteFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onSelectFriend(friend)}
                >
                  <div className="relative">
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                      <AvatarFallback className="text-xs sm:text-sm">
                        {friend.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-background ${
                        friend.isOnline ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="font-medium text-xs sm:text-sm truncate">
                        {friend.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${getRoleBadgeColor(friend.role)}`}
                      >
                        {getRoleLabel(friend.role)}
                      </Badge>
                    </div>
                    {friend.statusMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 sm:mt-1">
                        {friend.statusMessage}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 일반 친구 */}
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              친구
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              {regularFriends.length}
            </span>
          </div>
          <div className="space-y-1 sm:space-y-2">
            {regularFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => onSelectFriend(friend)}
              >
                <div className="relative">
                  <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                    <AvatarFallback className="text-xs sm:text-sm">
                      {friend.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-background ${
                      friend.isOnline ? "bg-green-500" : "bg-gray-400"
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <span className="font-medium text-xs sm:text-sm truncate">
                      {friend.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getRoleBadgeColor(friend.role)}`}
                    >
                      {getRoleLabel(friend.role)}
                    </Badge>
                  </div>
                  {friend.statusMessage && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5 sm:mt-1">
                      {friend.statusMessage}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AddFriendModal open={showAddFriend} onOpenChange={setShowAddFriend} />
    </div>
  );
};
