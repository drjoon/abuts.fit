import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import type { ChatRoom } from "@/shared/hooks/useChatRooms";
import { cn } from "@/lib/utils";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          활성
        </Badge>
      );
    case "completed":
      return <Badge variant="secondary">완료</Badge>;
    case "monitored":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          모니터링
        </Badge>
      );
    case "suspended":
      return <Badge variant="destructive">일시정지</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const formatTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const AdminChatManagement = () => {
  const { token, user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const {
    messages: activeMessages,
    loading: messagesLoading,
    error: messagesError,
    sendMessage,
  } = useChatMessages({ roomId: selectedChatId || undefined, autoFetch: true });

  const fetchRooms = async () => {
    if (!token) return;
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("page", "1");
      qs.set("limit", "100");
      if (selectedStatus && selectedStatus !== "all") {
        qs.set("status", selectedStatus);
      }
      const res = await apiFetch<{
        success: boolean;
        data: { rooms: ChatRoom[] };
      }>({
        path: `/api/chats/rooms/all?${qs.toString()}`,
        method: "GET",
        token,
      });

      if (res.ok && res.data?.success) {
        setRooms(res.data.data.rooms || []);
      } else {
        throw new Error("채팅방 목록 조회에 실패했습니다.");
      }
    } catch (e: any) {
      setRoomsError(
        e?.message || "채팅방 목록을 불러오는 중 오류가 발생했습니다."
      );
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRooms();
  }, [token, selectedStatus]);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rooms.filter((room) => {
      if (!q) return true;
      const title =
        room.relatedRequestId?.title || room.title || room.roomType || "";
      const requestId = room.relatedRequestId?.requestId || "";
      const participantsText = (room.participants || [])
        .map((p) => `${p.name} ${p.organization || ""} ${p.email}`)
        .join(" ");

      return `${title} ${requestId} ${participantsText}`
        .toLowerCase()
        .includes(q);
    });
  }, [rooms, searchQuery]);

  const activeChat = selectedChatId
    ? rooms.find((chat) => chat._id === selectedChatId) || null
    : null;

  const handleUpdateStatus = async (
    status: "active" | "monitored" | "suspended"
  ) => {
    if (!token || !selectedChatId) return;
    setUpdatingStatus(true);
    try {
      const res = await apiFetch<{ success: boolean }>({
        path: `/api/chats/rooms/${selectedChatId}/status`,
        method: "PATCH",
        token,
        jsonBody: { status },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error("상태 변경에 실패했습니다.");
      }
      await fetchRooms();
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendAdminMessage = async () => {
    if (!selectedChatId || !messageInput.trim()) return;

    await sendMessage(messageInput.trim());
    setMessageInput("");
  };

  const leftHeightClass = "h-[calc(100vh-12rem)]";

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            채팅 관리
          </h1>
          <p className="text-muted-foreground">
            플랫폼 내 모든 채팅을 모니터링하고 관리하세요
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          <Card className={cn("overflow-hidden", leftHeightClass)}>
            <CardHeader className="space-y-3">
              {/* Search and Filter */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="의뢰ID/제목/참여자 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedStatus === "all" ? "default" : "outline"}
                  onClick={() => setSelectedStatus("all")}
                  size="sm"
                >
                  전체
                </Button>
                <Button
                  variant={selectedStatus === "active" ? "default" : "outline"}
                  onClick={() => setSelectedStatus("active")}
                  size="sm"
                >
                  활성
                </Button>
                <Button
                  variant={
                    selectedStatus === "monitored" ? "default" : "outline"
                  }
                  onClick={() => setSelectedStatus("monitored")}
                  size="sm"
                >
                  모니터링
                </Button>
                <Button
                  variant={
                    selectedStatus === "suspended" ? "default" : "outline"
                  }
                  onClick={() => setSelectedStatus("suspended")}
                  size="sm"
                >
                  정지
                </Button>
              </div>
              {roomsError && (
                <div className="text-sm text-destructive">{roomsError}</div>
              )}
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-132px)]">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-2">
                  {roomsLoading && (
                    <div className="text-sm text-muted-foreground p-2">
                      채팅방 목록을 불러오는 중입니다...
                    </div>
                  )}
                  {!roomsLoading && filteredChats.length === 0 && (
                    <div className="text-sm text-muted-foreground p-2">
                      채팅방이 없습니다.
                    </div>
                  )}
                  {!roomsLoading &&
                    filteredChats.map((chat) => {
                      const isSelected = chat._id === selectedChatId;
                      const title =
                        chat.relatedRequestId?.requestId ||
                        chat.title ||
                        "채팅";
                      const subtitle =
                        chat.relatedRequestId?.title ||
                        chat.lastMessage?.content ||
                        "";
                      return (
                        <button
                          key={chat._id}
                          type="button"
                          onClick={() => setSelectedChatId(chat._id)}
                          className={cn(
                            "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {title}
                              </div>
                              {subtitle && (
                                <div
                                  className={cn(
                                    "text-xs truncate mt-1",
                                    isSelected
                                      ? "text-primary-foreground/80"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {subtitle}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0">
                              {getStatusBadge(chat.status)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className={cn("overflow-hidden", leftHeightClass)}>
            <CardHeader className="space-y-2">
              <CardTitle className="text-base">
                {activeChat
                  ? activeChat.relatedRequestId?.requestId ||
                    activeChat.title ||
                    "채팅"
                  : "채팅방을 선택하세요"}
              </CardTitle>
              {activeChat?.relatedRequestId?.title && (
                <CardDescription className="truncate">
                  {activeChat.relatedRequestId.title}
                </CardDescription>
              )}
              {activeChat && (
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground truncate">
                    {(activeChat.participants || [])
                      .map(
                        (p) =>
                          `${p.name}${
                            p.organization ? `(${p.organization})` : ""
                          }`
                      )
                      .join(" · ")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!activeChat || updatingStatus}
                      onClick={() => handleUpdateStatus("active")}
                    >
                      활성
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!activeChat || updatingStatus}
                      onClick={() => handleUpdateStatus("monitored")}
                    >
                      모니터링
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!activeChat || updatingStatus}
                      onClick={() => handleUpdateStatus("suspended")}
                    >
                      정지
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-132px)] flex flex-col">
              <div className="flex-1 border-t">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {!activeChat && (
                      <div className="text-sm text-muted-foreground">
                        좌측에서 채팅방을 선택하면 대화가 표시됩니다.
                      </div>
                    )}
                    {activeChat && messagesLoading && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        메시지를 불러오는 중입니다.
                      </p>
                    )}
                    {activeChat &&
                      !messagesLoading &&
                      Array.isArray(activeMessages) &&
                      activeMessages.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          메시지가 없습니다.
                        </p>
                      )}
                    {activeChat &&
                      !messagesLoading &&
                      Array.isArray(activeMessages) &&
                      activeMessages.map((msg) => {
                        const isMine = msg.sender?.role === "admin";
                        return (
                          <div
                            key={msg._id}
                            className={cn(
                              "flex mb-3",
                              isMine ? "justify-end" : "justify-start"
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm",
                                isMine
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-xs">
                                  {msg.sender?.name || ""}
                                </span>
                                <span className="text-[10px] opacity-80">
                                  {formatTime(msg.createdAt)}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap leading-snug">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    {activeChat && messagesError && (
                      <p className="text-sm text-destructive text-center py-2">
                        {messagesError}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="border-t p-3">
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="어벗츠.핏 이름으로 메시지를 입력하세요"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendAdminMessage();
                      }
                    }}
                    disabled={!activeChat}
                  />
                  <Button
                    size="icon"
                    variant="default"
                    onClick={handleSendAdminMessage}
                    disabled={!activeChat || !messageInput.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
