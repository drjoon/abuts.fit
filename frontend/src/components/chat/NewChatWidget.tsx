import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MessageSquare, X, Minimize2, Send, Paperclip } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import type { ChatRoom } from "@/shared/hooks/useChatRooms";

type ViewMode = "chats";

type RequestPickItem = {
  requestId: string;
  patientName: string;
  tooth: string;
};

export const NewChatWidget = () => {
  const { user, isAuthenticated, token } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewMode] = useState<ViewMode>("chats");
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [requestPicks, setRequestPicks] = useState<RequestPickItem[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user || !isAuthenticated) return;
      setLoading(true);
      setError(null);

      try {
        const roomRes = await apiFetch<any>({
          path: "/api/chats/support-room",
          method: "GET",
          token,
        });
        if (!roomRes.ok) {
          throw new Error("지원 채팅방을 불러오지 못했습니다.");
        }
        const roomBody = roomRes.data || {};
        const roomData = (roomBody as any)?.data || roomBody;
        setRoom(roomData as ChatRoom);

        if (user.role === "requestor") {
          const reqRes = await apiFetch<any>({
            path: "/api/requests/my?limit=20",
            method: "GET",
            token,
          });
          const reqBody = reqRes.data || {};
          const reqData = (reqBody as any)?.data || reqBody;
          const list: any[] = Array.isArray(reqData?.requests)
            ? reqData.requests
            : [];
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
          setRequestPicks(picks);
        } else {
          setRequestPicks([]);
        }
      } catch (e: any) {
        setError(e?.message || "지원 채팅을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user, isAuthenticated, token]);

  const roomId = room?._id;
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendMessage,
  } = useChatMessages({ roomId, autoFetch: true });

  const title = useMemo(() => {
    return "어벗츠.핏 고객지원";
  }, []);

  if (!isAuthenticated || !user || user.role === "admin") {
    return null;
  }

  const totalUnread =
    typeof (room as any)?.unreadCount === "number"
      ? (room as any).unreadCount
      : 0;

  const handleSend = async () => {
    if (!roomId) return;
    const content = draft.trim();
    if (!content) return;
    await sendMessage(content);
    setDraft("");
  };

  const insertRequestId = (requestId: string) => {
    const tokenText = `[의뢰ID:${requestId}]`;
    setDraft((prev) => {
      const base = prev || "";
      if (!base.trim()) return tokenText;
      if (base.includes(tokenText)) return base;
      return `${base.trim()} ${tokenText}`;
    });
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        {!isOpen ? (
          <Button
            size="lg"
            className="rounded-full h-12 w-12 sm:h-14 sm:w-14 shadow-elegant animate-pulse-glow"
            variant="hero"
            onClick={() => setIsOpen(true)}
          >
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
            {/* 읽지 않은 메시지 알림 (간단히 의뢰 개수 기준) */}
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
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
                <div className="text-sm font-medium truncate">{title}</div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2">
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
              <div className="h-[calc(100%-3.5rem)] sm:h-[544px] flex flex-col">
                <>
                  <div className="flex-1 overflow-y-auto">
                    <ScrollArea className="h-full">
                      <div className="p-3 sm:p-4 space-y-2">
                        {(loading || messagesLoading) && (
                          <div className="text-center text-xs text-muted-foreground py-4">
                            채팅을 불러오는 중입니다...
                          </div>
                        )}

                        {(error || messagesError) &&
                          !(loading || messagesLoading) && (
                            <div className="text-center text-xs text-destructive py-2">
                              {error || messagesError}
                            </div>
                          )}

                        {messages.map((m) => {
                          const isMine =
                            m.sender?._id === (user?.mockUserId || user?.id);
                          return (
                            <div
                              key={m._id}
                              className={`flex ${
                                isMine ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`max-w-[80%] rounded-lg px-3 py-2 text-xs sm:text-sm ${
                                  isMine
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                {m.content}
                              </div>
                            </div>
                          );
                        })}

                        {messages.length === 0 &&
                          !(loading || messagesLoading) && (
                            <div className="text-center text-xs text-muted-foreground py-6">
                              아직 메시지가 없습니다.
                            </div>
                          )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="border-t px-3 pt-3 pb-4 sm:px-4 sm:pt-4 sm:pb-6">
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="문의 내용을 입력하세요"
                        className="resize-none flex-1"
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSend();
                          }
                        }}
                      />
                      <div className="flex flex-col gap-2">
                        {user.role === "requestor" ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-10 w-10"
                                disabled={requestPicks.length === 0}
                              >
                                <Paperclip className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-2" align="end">
                              <div className="space-y-1">
                                {requestPicks.map((r) => (
                                  <button
                                    key={r.requestId}
                                    type="button"
                                    className="w-full text-left rounded px-2 py-1 text-xs hover:bg-muted"
                                    onClick={() => insertRequestId(r.requestId)}
                                  >
                                    <div className="font-medium">
                                      {r.requestId}
                                    </div>
                                    <div className="text-muted-foreground truncate">
                                      {r.patientName}
                                      {r.tooth ? ` / ${r.tooth}` : ""}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div className="h-10 w-10" />
                        )}
                        <Button
                          type="button"
                          size="icon"
                          onClick={() => void handleSend()}
                          disabled={!draft.trim() || !roomId}
                          className="shrink-0 h-10 w-10"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
};
