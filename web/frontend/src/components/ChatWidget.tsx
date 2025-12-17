import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Send,
  Paperclip,
  X,
  Minimize2,
  Plus,
  ArrowLeft,
  Search,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "requestor" | "manufacturer" | "admin";
  content: string;
  timestamp: Date;
  attachments?: string[];
}

interface ChatRoom {
  id: string;
  participants: string[];
  title: string;
  lastMessage?: Message;
  unreadCount: number;
}

// Mock data
const mockChatRooms: ChatRoom[] = [
  {
    id: "room-1",
    participants: ["1", "2", "3"],
    title: "상악 우측 제1대구치 임플란트 프로젝트",
    lastMessage: {
      id: "msg-1",
      senderId: "2",
      senderName: "박영희",
      senderRole: "manufacturer",
      content:
        "3D 모델링 파일을 확인했습니다. 내일까지 견적서를 보내드리겠습니다.",
      timestamp: new Date("2024-01-15T14:30:00"),
    },
    unreadCount: 2,
  },
  {
    id: "room-2",
    participants: ["1", "3"],
    title: "하악 좌측 제2소구치 임플란트 문의",
    lastMessage: {
      id: "msg-2",
      senderId: "3",
      senderName: "어벗츠.핏",
      senderRole: "admin",
      content: "추가 문의사항이 있으시면 언제든 연락주세요.",
      timestamp: new Date("2024-01-15T10:15:00"),
    },
    unreadCount: 0,
  },
];

// Mock colleagues data
const mockColleagues = [
  { id: "3", name: "홍길동", role: "어벗츠.핏", isOnline: true },
  { id: "1", name: "김철수", role: "기공소", isOnline: true },
  { id: "2", name: "박영희", role: "제작사", isOnline: false },
  { id: "4", name: "이민수", role: "제작사", isOnline: true },
  { id: "5", name: "정수현", role: "기공소", isOnline: false },
];

// Mock all public accounts
const mockAllAccounts = [
  { id: "3", name: "홍길동", role: "어벗츠.핏", isOnline: true },
  { id: "1", name: "김철수", role: "기공소", isOnline: true },
  { id: "2", name: "박영희", role: "제작사", isOnline: false },
  { id: "4", name: "이민수", role: "제작사", isOnline: true },
  { id: "5", name: "정수현", role: "기공소", isOnline: false },
  { id: "6", name: "조영수", role: "제작사", isOnline: true },
  { id: "7", name: "윤미정", role: "기공소", isOnline: false },
  { id: "8", name: "강대호", role: "제작사", isOnline: true },
  { id: "9", name: "송지은", role: "어벗츠.핏", isOnline: true },
  { id: "10", name: "최민호", role: "기공소", isOnline: false },
];

const mockMessages: { [roomId: string]: Message[] } = {
  "room-1": [
    {
      id: "msg-1",
      senderId: "1",
      senderName: "김철수",
      senderRole: "requestor",
      content:
        "안녕하세요. 상악 우측 제1대구치 임플란트 어벗먼트 제작을 의뢰드립니다.",
      timestamp: new Date("2024-01-15T09:00:00"),
    },
    {
      id: "msg-2",
      senderId: "2",
      senderName: "박영희",
      senderRole: "manufacturer",
      content:
        "안녕하세요! 의뢰 내용을 확인했습니다. 3D 스캔 파일을 첨부해 주시겠어요?",
      timestamp: new Date("2024-01-15T09:15:00"),
    },
    {
      id: "msg-3",
      senderId: "1",
      senderName: "김철수",
      senderRole: "requestor",
      content: "3D 스캔 파일을 첨부합니다.",
      timestamp: new Date("2024-01-15T10:30:00"),
      attachments: ["scan_model_001.stl"],
    },
    {
      id: "msg-4",
      senderId: "3",
      senderName: "어벗츠.핏",
      senderRole: "admin",
      content:
        "업로드된 파일을 검토했습니다. 품질에 문제없습니다. 제작 진행해 주세요.",
      timestamp: new Date("2024-01-15T11:00:00"),
    },
    {
      id: "msg-5",
      senderId: "2",
      senderName: "박영희",
      senderRole: "manufacturer",
      content:
        "3D 모델링 파일을 확인했습니다. 내일까지 견적서를 보내드리겠습니다.",
      timestamp: new Date("2024-01-15T14:30:00"),
    },
  ],
};

export const ChatWidget = () => {
  const { user, isAuthenticated } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<{ [roomId: string]: Message[] }>(
    mockMessages
  );
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [displayedAccounts, setDisplayedAccounts] = useState(5);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedRoom]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedRoom || !user) return;

    const message: Message = {
      id: `msg-${Date.now()}`,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      content: newMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => ({
      ...prev,
      [selectedRoom]: [...(prev[selectedRoom] || []), message],
    }));
    setNewMessage("");
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "requestor":
        return "bg-primary/10 text-primary";
      case "manufacturer":
        return "bg-accent/10 text-accent";
      case "admin":
        return "bg-destructive/10 text-destructive";
      default:
        return "bg-muted";
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "기공소":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "제작사":
        return "bg-green-100 text-green-800 border-green-200";
      case "어벗츠.핏":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="lg"
          className="rounded-full h-14 w-14 shadow-elegant"
          variant="hero"
          disabled
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      </div>
    );
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
          {mockChatRooms.some((room) => room.unreadCount > 0) && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {mockChatRooms.reduce((sum, room) => sum + room.unreadCount, 0)}
            </span>
          )}
        </Button>
      ) : (
        <Card
          className={`
          w-[calc(100vw-2rem)] max-w-96 h-[calc(100vh-8rem)] max-h-[500px] sm:w-96 sm:h-[500px]
          border transition-all duration-300 bg-card 
          ${isMinimized ? "h-12" : ""}
        `}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 border-b bg-muted/50">
            <CardTitle className="text-base sm:text-lg truncate pr-2">
              {selectedRoom
                ? mockChatRooms.find((r) => r.id === selectedRoom)?.title
                : "채팅"}
            </CardTitle>
            <div className="flex items-center space-x-1 sm:space-x-2">
              {selectedRoom && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedRoom(null)}
                  title="뒤로가기"
                  className="h-8 w-8 p-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
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
                onClick={() => setShowAllAccounts(true)}
                title="전체 계정 보기"
                className="h-8 w-8 p-0"
              >
                <Plus className="h-4 w-4" />
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
          </CardHeader>

          {!isMinimized && (
            <CardContent className="p-0 flex flex-col h-[calc(100%-3.5rem)] sm:h-[456px]">
              {!selectedRoom ? (
                <div className="flex-1 p-3 sm:p-4">
                  {!showNewChatModal && !showAllAccounts && (
                    <div className="space-y-2">
                      {mockChatRooms.map((room) => (
                        <div
                          key={room.id}
                          className="p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-background"
                          onClick={() => setSelectedRoom(room.id)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium text-sm truncate">
                              {room.title}
                            </div>
                            {room.unreadCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {room.unreadCount}
                              </Badge>
                            )}
                          </div>
                          {room.lastMessage && (
                            <div className="text-xs text-muted-foreground truncate">
                              {room.lastMessage.senderName}:{" "}
                              {room.lastMessage.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 전체 계정 보기 모달 */}
                  {showAllAccounts && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">새 채팅 시작</h3>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowAllAccounts(false);
                            setSearchQuery("");
                            setDisplayedAccounts(5);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <Input
                        placeholder="이름으로 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full"
                      />

                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {mockAllAccounts
                          .filter((account) =>
                            account.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase())
                          )
                          .slice(0, displayedAccounts)
                          .map((account) => (
                            <div
                              key={account.id}
                              className="flex items-center justify-between p-2 border rounded-lg cursor-pointer hover:bg-muted/50"
                            >
                              <div className="flex items-center space-x-2">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    account.isOnline
                                      ? "bg-green-500"
                                      : "bg-gray-400"
                                  }`}
                                />
                                <span className="text-sm">{account.name}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-xs border ${getRoleBadgeColor(
                                    account.role
                                  )}`}
                                >
                                  {account.role}
                                </Badge>
                              </div>
                            </div>
                          ))}

                        {mockAllAccounts.filter((account) =>
                          account.name
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase())
                        ).length > displayedAccounts && (
                          <div className="text-center py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDisplayedAccounts((prev) => prev + 5)
                              }
                            >
                              더 보기
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 새 채팅 모달 */}
                  {showNewChatModal && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 p-4">
                      <div className="bg-card p-4 rounded-lg border shadow-sm w-full max-w-sm max-h-72 overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-medium">새 채팅 시작</h3>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowNewChatModal(false)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {mockColleagues.map((colleague) => (
                            <div
                              key={colleague.id}
                              className="flex items-center justify-between p-2 border rounded-lg cursor-pointer hover:bg-muted/50"
                            >
                              <div className="flex items-center space-x-2">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    colleague.isOnline
                                      ? "bg-green-500"
                                      : "bg-gray-400"
                                  }`}
                                />
                                <span className="text-sm">
                                  {colleague.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-xs border ${getRoleBadgeColor(
                                    colleague.role
                                  )}`}
                                >
                                  {colleague.role}
                                </Badge>
                              </div>
                            </div>
                          ))}

                          <div className="border-t pt-2 mt-2">
                            <div
                              className="flex items-center space-x-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setShowNewChatModal(false);
                                setShowSearchModal(true);
                              }}
                            >
                              <Search className="h-4 w-4" />
                              <span className="text-sm">찾기</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 찾기 모달 */}
                  {showSearchModal && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 p-4">
                      <div className="bg-card p-4 rounded-lg border shadow-sm w-full max-w-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-medium">계정 찾기</h3>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowSearchModal(false)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-3">
                          <Input
                            placeholder="이름 또는 이메일로 검색..."
                            className="w-full"
                          />
                          <Button className="w-full" size="sm">
                            <Search className="h-4 w-4 mr-2" />
                            검색
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {(messages[selectedRoom] || []).map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.senderId === user?.id
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex items-start space-x-2 max-w-[80%] ${
                            message.senderId === user?.id
                              ? "flex-row-reverse space-x-reverse"
                              : ""
                          }`}
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {message.senderName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-xs font-medium">
                                {message.senderName}
                              </span>
                              <Badge
                                className={`text-xs ${getRoleColor(
                                  message.senderRole
                                )}`}
                              >
                                {getRoleLabel(message.senderRole)}
                              </Badge>
                            </div>
                            <div
                              className={`p-2 rounded-lg text-sm ${
                                message.senderId === user?.id
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              {message.content}
                              {message.attachments && (
                                <div className="mt-2 text-xs">
                                  {message.attachments.map((file, index) => (
                                    <div
                                      key={index}
                                      className="flex items-center space-x-1"
                                    >
                                      <Paperclip className="h-3 w-3" />
                                      <span>{file}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {message.timestamp.toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-4 border-t border-border">
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="ghost">
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Input
                        placeholder="메시지를 입력하세요..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) =>
                          e.key === "Enter" && handleSendMessage()
                        }
                        className="flex-1"
                      />
                      <Button size="sm" onClick={handleSendMessage}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
};
