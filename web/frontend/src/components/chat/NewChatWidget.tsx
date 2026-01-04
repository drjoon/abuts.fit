import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, X, Minimize2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import type { ChatRoom } from "@/shared/hooks/useChatRooms";
import { useToast } from "@/shared/hooks/use-toast";
import {
  useS3TempUpload,
  type TempUploadedFile,
} from "@/shared/hooks/useS3TempUpload";
import {
  ChatComposer,
  type RequestPickItem,
} from "@/components/chat/ChatComposer";

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
  const [isSending, setIsSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<TempUploadedFile[]>([]);
  const [requestPicks, setRequestPicks] = useState<RequestPickItem[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const didRefreshUnreadRef = useRef(false);
  const { uploadFiles } = useS3TempUpload({ token });

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
            body?.message || "지원 채팅방을 불러오지 못했습니다."
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
  }, [supportRoomDisabled, user, isAuthenticated, token]);

  const roomId = room?._id;
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendMessage,
  } = useChatMessages({ roomId, autoFetch: true });

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const raf = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, isMinimized, messages.length, messagesLoading]);

  const myIdCandidates = useMemo(() => {
    const ids = [user?.mockUserId, user?.id]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [user?.mockUserId, user?.id]);

  useEffect(() => {
    if (isOpen) return;
    didRefreshUnreadRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    if (isOpen) return;
    if (supportRoomDisabled) return;

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
  }, [token, isAuthenticated, isOpen, supportRoomDisabled]);

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
      const sent = await sendMessage(content, attachments);
      if (sent) {
        setDraft("");
        setPendingFiles([]);
        setRoom((prev) => (prev ? { ...prev, unreadCount: 0 } : prev));
      }
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
    setDraft((prev) => {
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
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
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
                          const ts = formatChatTs((m as any)?.createdAt);
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
                                {ts && (
                                  <div className="mb-1 text-[10px] opacity-70">
                                    {ts}
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap leading-snug">
                                  {m.content}
                                </div>
                                {Array.isArray(m.attachments) &&
                                  m.attachments.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {m.attachments.map((a, idx) => (
                                        <button
                                          key={`${m._id}-att-${idx}`}
                                          type="button"
                                          onClick={() => void openAttachment(a)}
                                          className={`block text-xs underline ${
                                            isMine
                                              ? "text-primary-foreground/90"
                                              : "text-foreground"
                                          }`}
                                        >
                                          {a.fileName}
                                        </button>
                                      ))}
                                    </div>
                                  )}
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
                    pendingFiles={pendingFiles}
                    onPickFiles={(files) => void handlePickFiles(files)}
                    onRemovePendingFile={removePendingFile}
                    requestPicks={requestPicks}
                    onInsertRequestId={
                      user.role === "requestor" ? insertRequestId : undefined
                    }
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
