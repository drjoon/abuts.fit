import { useEffect, useMemo, useRef, useState } from "react";
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
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import type { ChatRoom } from "@/shared/hooks/useChatRooms";
import { cn } from "@/shared/ui/cn";
import { useToast } from "@/shared/hooks/use-toast";
import {
  useS3TempUpload,
  type TempUploadedFile,
} from "@/shared/hooks/useS3TempUpload";
import {
  ChatComposer,
  type RequestPickItem,
} from "@/features/chat/components/ChatComposer";

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
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

export const AdminChatManagement = () => {
  const { token, user } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [requestPicks, setRequestPicks] = useState<RequestPickItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<TempUploadedFile[]>([]);
  const { uploadFiles } = useS3TempUpload({ token });

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
        e?.message || "채팅방 목록을 불러오는 중 오류가 발생했습니다.",
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

  useEffect(() => {
    if (!activeChat) return;
    if (messagesLoading) return;
    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeChat?._id, messagesLoading, activeMessages?.length]);

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
    const attachments = pendingFiles
      .map((f) => {
        const fileId = String(f._id || "").trim();
        const s3Key = String(f.key || "").trim();
        const s3Url = String(f.location || "").trim();
        if (!s3Key || !s3Url) return null;
        return {
          fileId,
          fileName: String(f.originalName || "").trim(),
          fileType: String(f.mimetype || "").trim(),
          fileSize: Number(f.size || 0),
          s3Key,
          s3Url,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const content = text || (attachments.length ? "파일 첨부" : "");
    if (!content.trim()) return;

    setIsSending(true);
    try {
      await sendMessage(content, attachments);
      setMessageInput("");
      setPendingFiles([]);
    } finally {
      setIsSending(false);
    }
  };

  const handlePickFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      const uploaded = await uploadFiles(files);
      if (!uploaded.length) return;
      setPendingFiles((prev) => {
        const map = new Map<string, TempUploadedFile>();
        [...prev, ...uploaded].forEach((f) => {
          map.set(f._id, f);
        });
        return Array.from(map.values());
      });
    } catch (e: any) {
      toast({
        title: "업로드 실패",
        description: e?.message || "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const removePendingFile = (fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f._id !== fileId));
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

  const openAttachment = async (a: any) => {
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
    <div className="flex flex-col h-full min-h-0 bg-gradient-subtle p-6">
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
              </div>
              {roomsError && (
                <div className="text-sm text-destructive">{roomsError}</div>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
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
                        (p) =>
                          `${p.name}${
                            p.organization ? `(${p.organization})` : ""
                          }`,
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
                          <div
                            key={msg._id}
                            className={cn(
                              "flex mb-3",
                              isMine ? "justify-end" : "justify-start",
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm",
                                isMine
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted",
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
                              {Array.isArray(msg.attachments) &&
                                msg.attachments.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {msg.attachments.map(
                                      (a: any, idx: number) => (
                                        <button
                                          key={`${msg._id}-att-${idx}`}
                                          type="button"
                                          onClick={() => void openAttachment(a)}
                                          className={cn(
                                            "block text-xs underline",
                                            isMine
                                              ? "text-primary-foreground/90"
                                              : "text-foreground",
                                          )}
                                        >
                                          {a.fileName}
                                        </button>
                                      ),
                                    )}
                                  </div>
                                )}
                            </div>
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
                pendingFiles={pendingFiles}
                onPickFiles={(files) => void handlePickFiles(files)}
                onRemovePendingFile={removePendingFile}
                requestPicks={requestPicks}
                onInsertRequestId={insertRequestId}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
