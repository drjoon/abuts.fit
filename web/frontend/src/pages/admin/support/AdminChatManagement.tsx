// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/chats/chat.controller.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - 2026-08-13: 채팅 첨부 다운로드 프로그레스바.
// - 2026-08-27: 채팅 이미지 썸네일·미리보기(authToken).
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Search } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import type { ChatRoom } from "@/shared/hooks/useChatRooms";
import { cn } from "@/shared/ui/cn";
import { useToast } from "@/shared/hooks/use-toast";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import {
  ChatComposer,
  type RequestPickItem,
} from "@/features/chat/components/ChatComposer";
import {
  ChatMessageBubble,
  type ChatBubbleAttachment,
} from "@/features/chat/components/ChatMessageBubble";
import { buildChatReactionUserNameById } from "@/features/chat/components/chatReactions";
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-primary-muted/50 text-primary-strong border-primary-muted">
          활성
        </Badge>
      );
    case "completed":
      return <Badge variant="secondary">완료</Badge>;
    case "monitored":
      return (
        <Badge className="bg-accent-muted/50 text-accent-strong border-accent-muted">
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
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

const CHAT_LIST_VISIBLE_COUNT = 6;
const CHAT_LIST_ROW_HEIGHT_PX = 64;
const CHAT_LIST_ROW_GAP_PX = 8;
const CHAT_LIST_CONTAINER_PADDING_PX = 16;

const getConversationTargetTitle = (room: ChatRoom) => {
  const targets = (room.participants || [])
    .filter((p: any) => p?.role !== "admin")
    .map((p: any) => {
      const business = String(p?.business || "").trim();
      const name = String(p?.name || "").trim();
      const base = business || name;
      if (!base) return "";
      if (business && name && business !== name) {
        return `${business}(${name})`;
      }
      return base;
    })
    .filter(Boolean);

  if (targets.length > 0) {
    return `${targets.join(", ")}`;
  }

  return room.relatedRequestId?.requestId || room.title || "채팅";
};

export const AdminChatManagement = () => {
  const { token, user } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const initialUnreadOnly = searchParams.get("unread") === "1";
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(initialUnreadOnly);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [replyTo, setReplyTo] = useState<{
    _id: string;
    sender: { name: string; role: string };
    content: string;
  } | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [requestPicks, setRequestPicks] = useState<RequestPickItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const chatUploads = useBackgroundTempUpload({ token });
  const { downloadingKeys, downloadProgressByKey, downloadS3File } =
    useS3FileDownload(token);

  const {
    messages: activeMessages,
    loading: messagesLoading,
    error: messagesError,
    sendMessage,
    toggleReaction,
  } = useChatMessages({ roomId: selectedChatId || undefined, autoFetch: true });

// change-log:
  // - 2026-08-03: Hook dependency fixes — wrapped fetchRooms in useCallback and adjusted effects to include stable deps.
  const fetchRooms = useCallback(async () => {
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
        e?.message || "채팅방 목록을 불러오는 중 오류가 발생했습니다.",
      );
    } finally {
      setRoomsLoading(false);
    }
  }, [token, selectedStatus]);

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matches = rooms.filter((room) => {
      if (unreadOnly && Number(room.unreadCount || 0) <= 0) {
        return false;
      }
      if (!q) return true;

      const title =
        room.relatedRequestId?.title || room.title || room.roomType || "";
      const requestId = room.relatedRequestId?.requestId || "";
      const participantsText = (room.participants || [])
        .map((p: any) => `${p.name} ${p.business || ""} ${p.email}`)
        .join(" ");

      return `${title} ${requestId} ${participantsText}`
        .toLowerCase()
        .includes(q);
    });

    return matches.sort((a, b) => {
      const aTime = new Date(String(a.lastMessageAt || "")).getTime() || 0;
      const bTime = new Date(String(b.lastMessageAt || "")).getTime() || 0;
      return bTime - aTime;
    });
  }, [rooms, searchQuery, unreadOnly]);

  const activeChat = selectedChatId
    ? rooms.find((chat) => chat._id === selectedChatId) || null
    : null;

  const reactionUserNameById = useMemo(
    () =>
      buildChatReactionUserNameById({
        participants: activeChat?.participants,
        messages: activeMessages,
      }),
    [activeChat?.participants, activeMessages],
  );

  useEffect(() => {
    if (!activeChat) return;
    if (messagesLoading) return;
    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeChat, messagesLoading, activeMessages?.length]);

  useEffect(() => {
    chatUploads.clear();
  }, [selectedChatId, chatUploads.clear]);

  useEffect(() => {
    if (filteredChats.length === 0) {
      setSelectedChatId(null);
      return;
    }
    const hasCurrent =
      !!selectedChatId && filteredChats.some((chat) => chat._id === selectedChatId);
    if (!hasCurrent) {
      setSelectedChatId(filteredChats[0]?._id || null);
    }
  }, [filteredChats, selectedChatId]);

  useEffect(() => {
    const loadPicks = async () => {
      if (!token || !activeChat) {
        setRequestPicks([]);
        return;
      }

      const requestorId = String(
        activeChat.participants?.find((p) => p.role === "requestor")?._id || "",
      ).trim();

      const fallbackRid = String(
        (activeChat as any)?.relatedRequestId?.requestId || "",
      ).trim();

      if (!requestorId) {
        setRequestPicks(fallbackRid ? [{ requestId: fallbackRid }] : []);
        return;
      }

      try {
        const qs = new URLSearchParams();
        qs.set("page", "1");
        qs.set("limit", "20");
        qs.set("requestorId", requestorId);
        const res = await apiFetch<any>({
          path: `/api/admin/requests?${qs.toString()}`,
          method: "GET",
          token,
        });
        if (!res.ok) throw new Error("의뢰 목록을 불러오지 못했습니다.");

        const body = res.data || {};
        const data = (body as any)?.data || body;
        const list: any[] = Array.isArray(data?.requests) ? data.requests : [];
        const picks: RequestPickItem[] = list
          .map((r) => {
            const ci = r?.caseInfos || {};
            return {
              requestId: String(r?.requestId || "").trim(),
              patientName: String(ci?.patientName || "").trim(),
              tooth: String(ci?.tooth || "").trim(),
            };
          })
          .filter((x) => !!x.requestId);

        if (picks.length > 0) {
          setRequestPicks(picks);
        } else {
          setRequestPicks(fallbackRid ? [{ requestId: fallbackRid }] : []);
        }
      } catch {
        setRequestPicks(fallbackRid ? [{ requestId: fallbackRid }] : []);
      }
    };

    void loadPicks();
  }, [token, activeChat]);

  const handleUpdateStatus = async (
    status: "active" | "monitored" | "suspended",
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
    if (!selectedChatId || isSending) return;

    const text = messageInput.trim();
    if (!text && chatUploads.items.length === 0) return;

    setIsSending(true);
    try {
      let attachments = toChatMessageAttachments([]);
      if (chatUploads.items.length > 0) {
        const uploaded = await chatUploads.ensureUploaded();
        attachments = toChatMessageAttachments(uploaded);
        if (!attachments.length) {
          throw new Error("파일 업로드에 실패했습니다.");
        }
      }

      const content = text || (attachments.length ? "파일 첨부" : "");
      if (!content.trim()) return;

      await sendMessage(content, attachments, {
        replyTo: replyTo?._id || null,
      });
      setMessageInput("");
      setReplyTo(null);
      chatUploads.clear();
    } catch (e: any) {
      toast({
        title: "업로드 실패",
        description: e?.message || "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const insertRequestId = (requestId: string) => {
    const tokenText = `[의뢰ID:${requestId}]`;
    setMessageInput((prev) => {
      const base = prev || "";
      if (!base.trim()) return tokenText;
      if (base.includes(tokenText)) return base;
      return `${base.trim()} ${tokenText}`;
    });
  };

  const openAttachment = async (a: ChatBubbleAttachment) => {
    const s3Key = String(a?.s3Key || "").trim();
    if (s3Key && token) {
      await downloadS3File({
        s3Key,
        fileName: String(a?.fileName || "첨부파일").trim() || "첨부파일",
        busyKey: s3Key,
      });
      return;
    }

    const fileId = String(a?.fileId || "").trim();
    const direct = String(a?.s3Url || "").trim();

    if (!fileId || !token) {
      if (direct) window.open(direct, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      const res = await apiFetch<any>({
        path: `/api/files/${fileId}/download-url`,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("파일을 열 수 없습니다.");
      const body = res.data || {};
      const url = (body as any)?.data?.url || (body as any)?.url;
      if (!url) throw new Error("파일을 열 수 없습니다.");
      window.open(String(url), "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({
        title: "파일 열기 실패",
        description: e?.message || "파일을 열 수 없습니다.",
        variant: "destructive",
      });
      if (direct) window.open(direct, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-gradient-subtle p-4">
      <div className="max-w-7xl w-full mx-auto space-y-6 flex flex-col flex-1 min-h-0">
        {/* Header */}

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 flex-1 min-h-0">
          <Card className="flex flex-col overflow-hidden min-h-0 h-full">
            <CardHeader className="space-y-3 shrink-0">
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
                <Button
                  variant={unreadOnly ? "default" : "outline"}
                  onClick={() => setUnreadOnly((prev) => !prev)}
                  size="sm"
                >
                  미확인만
                </Button>
              </div>
              {roomsError && (
                <div className="text-sm text-destructive">{roomsError}</div>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              <ScrollArea
                className="h-full"
                style={{
                  maxHeight: `${
                    CHAT_LIST_VISIBLE_COUNT * CHAT_LIST_ROW_HEIGHT_PX +
                    (CHAT_LIST_VISIBLE_COUNT - 1) * CHAT_LIST_ROW_GAP_PX +
                    CHAT_LIST_CONTAINER_PADDING_PX
                  }px`,
                }}
              >
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
                      const title = getConversationTargetTitle(chat);
                      const subtitle =
                        chat.relatedRequestId?.title ||
                        chat.lastMessage?.content ||
                        "";
                      return (
                        <button
                          key={chat._id}
                          type="button"
                          onClick={() => {
                            setSelectedChatId(chat._id);
                            setReplyTo(null);
                          }}
                          className={cn(
                            "w-full h-16 text-left rounded-lg border px-3 py-2 transition-colors",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted",
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
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {subtitle}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5">
                              {Number(chat.unreadCount || 0) > 0 && (
                                <Badge className="bg-primary-soft text-primary-strong border-primary-muted">
                                  미확인 {Number(chat.unreadCount || 0).toLocaleString()}
                                </Badge>
                              )}
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

          <Card className="overflow-hidden flex flex-col">
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
                        (p: any) =>
                          `${p.name}${p.business ? `(${p.business})` : ""}`,
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
            <CardContent className="p-0 flex-1 flex flex-col min-h-0">
              <div className="flex-1 border-t min-h-0">
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
                          <div key={msg._id} className="mb-3">
                            <ChatMessageBubble
                              message={msg}
                              isMine={isMine}
                              currentUserId={String(user?.id || "").trim()}
                              authToken={token}
                              formatTime={formatTime}
                              reactionUserNameById={reactionUserNameById}
                              onReply={(message) => {
                                setReplyTo({
                                  _id: String(message._id),
                                  sender: {
                                    name:
                                      String(message.sender?.name || "").trim() ||
                                      "알 수 없음",
                                    role: String(message.sender?.role || "").trim(),
                                  },
                                  content:
                                    String(message.content || "").trim() ||
                                    "(내용 없음)",
                                });
                              }}
                              onToggleReaction={(messageId, emoji) =>
                                void toggleReaction(messageId, emoji)
                              }
                              downloadingFileKeys={downloadingKeys}
                              downloadProgressByKey={downloadProgressByKey}
                              onOpenAttachment={(file) => void openAttachment(file)}
                            />
                          </div>
                        );
                      })}
                    {activeChat && messagesError && (
                      <p className="text-sm text-destructive text-center py-2">
                        {messagesError}
                      </p>
                    )}

                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              </div>

              <ChatComposer
                draft={messageInput}
                onDraftChange={setMessageInput}
                onSend={() => void handleSendAdminMessage()}
                placeholder="어벗츠.핏 이름으로 메시지를 입력하세요"
                disabled={!activeChat}
                isSending={isSending}
                pendingUploads={chatUploads.items}
                onPickFiles={chatUploads.addFiles}
                onRemovePendingFile={chatUploads.removeItem}
                onRetryPendingFile={chatUploads.retryItem}
                requestPicks={requestPicks}
                onInsertRequestId={insertRequestId}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
