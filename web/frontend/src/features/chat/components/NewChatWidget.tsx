// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - 2026-08-13: 채팅 첨부 다운로드 프로그레스바.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, X, Minimize2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import type { ChatRoom } from "@/shared/hooks/useChatRooms";
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
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";

type ViewMode = "chats";

export const NewChatWidget = () => {
  const { user, isAuthenticated, token } = useAuthStore();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewMode] = useState<ViewMode>("chats");
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportRoomDisabled, setSupportRoomDisabled] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{
    _id: string;
    sender: { name: string; role: string };
    content: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [requestPicks, setRequestPicks] = useState<RequestPickItem[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const didRefreshUnreadRef = useRef(false);
  const chatUploads = useBackgroundTempUpload({ token });
  const { downloadingKeys, downloadProgressByKey, downloadS3File } =
    useS3FileDownload(token);

  useEffect(() => {
    const onOpen = (evt?: Event) => {
      const custom = evt as CustomEvent | undefined;
      const detail: any = custom?.detail || {};
      const prefill = typeof detail?.prefill === "string" ? detail.prefill : "";
      if (prefill) {
        setDraft(prefill);
      }
      setIsMinimized(false);
      setIsOpen(true);
    };
    window.addEventListener("abuts:open-support-chat", onOpen);
    return () => window.removeEventListener("abuts:open-support-chat", onOpen);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user || !isAuthenticated) return;
      if (!isOpen) return;
      if (supportRoomDisabled) return;
      setLoading(true);
      setError(null);

      try {
        const roomRes = await apiFetch<any>({
          path: "/api/chats/support-room",
          method: "GET",
          token,
        });
        if (!roomRes.ok) {
          const body: any = roomRes.data || {};
          const message = String(
            body?.message || "지원 채팅방을 불러오지 못했습니다.",
          );
          if ([401, 403, 404].includes(roomRes.status)) {
            setSupportRoomDisabled(true);
          }
          throw new Error(message);
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
  }, [isOpen, supportRoomDisabled, user, isAuthenticated, token]);

  const roomId = room?._id;
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendMessage,
    toggleReaction,
  } = useChatMessages({ roomId, autoFetch: true });

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, isMinimized, messages.length, messagesLoading]);

  const myIdCandidates = useMemo(() => {
    const ids = [(user as any)?.mockUserId, user?.id]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [(user as any)?.mockUserId, user?.id]);

  useEffect(() => {
    if (isOpen) return;
    didRefreshUnreadRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    if (isOpen) return;
    if (supportRoomDisabled) return;
    if (!roomId) return;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (typeof window !== "undefined" && !window.document.hasFocus()) return;
      try {
        const roomRes = await apiFetch<any>({
          path: "/api/chats/support-room",
          method: "GET",
          token,
        });
        if (!roomRes.ok) {
          if ([401, 403, 404].includes(roomRes.status)) {
            setSupportRoomDisabled(true);
          }
          return;
        }
        const roomBody = roomRes.data || {};
        const roomData = (roomBody as any)?.data || roomBody;
        setRoom(roomData as ChatRoom);
      } catch {
        // ignore
      }
    };

    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [roomId, token, isAuthenticated, isOpen, supportRoomDisabled]);

  useEffect(() => {
    const refreshRoomUnread = async () => {
      if (!isOpen || !roomId || !token) return;
      if (messagesLoading) return;
      if (supportRoomDisabled) return;
      if (didRefreshUnreadRef.current) return;
      try {
        const roomRes = await apiFetch<any>({
          path: "/api/chats/support-room",
          method: "GET",
          token,
        });
        if (!roomRes.ok) return;
        const roomBody = roomRes.data || {};
        const roomData = (roomBody as any)?.data || roomBody;
        setRoom(roomData as ChatRoom);
        didRefreshUnreadRef.current = true;
      } catch {
        // ignore
      }
    };

    void refreshRoomUnread();
  }, [isOpen, roomId, messagesLoading, supportRoomDisabled, token]);

  const title = useMemo(() => {
    return "어벗츠.핏 고객지원";
  }, []);

  const formatChatTs = (iso?: string) => {
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

  if (!isAuthenticated || !user || user.role === "admin") {
    return null;
  }

  const totalUnread =
    typeof (room as any)?.unreadCount === "number"
      ? (room as any).unreadCount
      : 0;

  const handleSend = async () => {
    if (!roomId || isSending) return;
    const text = draft.trim();
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

      const sent = await sendMessage(content, attachments, {
        replyTo: replyTo?._id || null,
      });
      if (sent) {
        setDraft("");
        setReplyTo(null);
        chatUploads.clear();
        setRoom((prev) => (prev ? { ...prev, unreadCount: 0 } : prev));
      }
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
    setDraft((prev) => {
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
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setIsOpen(false)}
        />
      )}

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
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] leading-none rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </Button>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
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
                          const senderId = String(m.sender?._id || "").trim();
                          const isMine = myIdCandidates.has(senderId);
                          return (
                            <ChatMessageBubble
                              key={m._id}
                              message={m}
                              isMine={isMine}
                              currentUserId={String(user?.id || "").trim()}
                              formatTime={formatChatTs}
                              showSenderName={false}
                              compact
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
                          );
                        })}

                        {messages.length === 0 &&
                          !(loading || messagesLoading) && (
                            <div className="text-center text-xs text-muted-foreground py-6">
                              아직 메시지가 없습니다.
                            </div>
                          )}

                        <div ref={bottomRef} />
                      </div>
                    </ScrollArea>
                  </div>

                  <ChatComposer
                    draft={draft}
                    onDraftChange={setDraft}
                    onSend={() => void handleSend()}
                    placeholder="문의 내용을 입력하세요"
                    disabled={!roomId}
                    isSending={isSending}
                    pendingUploads={chatUploads.items}
                    onPickFiles={chatUploads.addFiles}
                    onRemovePendingFile={chatUploads.removeItem}
                    onRetryPendingFile={chatUploads.retryItem}
                    requestPicks={requestPicks}
                    onInsertRequestId={
                      user.role === "requestor" ? insertRequestId : undefined
                    }
                    replyTo={replyTo}
                    onCancelReply={() => setReplyTo(null)}
                  />
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
};
