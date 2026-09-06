// related files:
// - web/frontend/src/features/remoteSupport/remoteSupportApi.ts
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RemoteSupportMessage } from "@/features/remoteSupport/remoteSupportApi";
import { getSocket } from "@/shared/realtime/socket";
import { remoteSupportApi } from "@/features/remoteSupport/remoteSupportApi";
import { useAuthStore } from "@/store/useAuthStore";

type Props = {
  sessionId: string;
  initialMessages?: RemoteSupportMessage[];
  compact?: boolean;
};

function senderName(msg: RemoteSupportMessage) {
  if (typeof msg.senderId === "object" && msg.senderId) {
    return msg.senderId.name || "사용자";
  }
  return "사용자";
}

function senderId(msg: RemoteSupportMessage) {
  if (typeof msg.senderId === "object" && msg.senderId) {
    return String(msg.senderId._id || "");
  }
  return String(msg.senderId || "");
}

export function RemoteSupportChat({
  sessionId,
  initialMessages = [],
  compact = false,
}: Props) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<RemoteSupportMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const myId = String(user?.id || user?._id || "");

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChat = (payload: unknown) => {
      const msg = payload as RemoteSupportMessage;
      if (!msg || msg.sessionId !== sessionId) return;
      setMessages((prev) => {
        if (msg._id && prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    };
    socket.on("remote-support:chat", onChat);
    return () => {
      socket.off("remote-support:chat", onChat);
    };
  }, [sessionId]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await remoteSupportApi.postMessage(token, sessionId, content);
      setText("");
    } catch (err) {
      console.warn("[remote-support] chat send failed:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={
        compact
          ? "flex h-64 flex-col rounded-md border border-border bg-card"
          : "flex h-full min-h-[240px] flex-col rounded-md border border-border bg-card"
      }
    >
      <div className="border-b border-border px-3 py-2 text-sm font-medium">
        지원 채팅
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 ? (
          <p className="text-muted-foreground">메시지를 남겨 주세요.</p>
        ) : (
          messages.map((m, idx) => {
            const mine = senderId(m) === myId;
            return (
              <div
                key={m._id || `${idx}-${m.createdAt}`}
                className={mine ? "text-right" : "text-left"}
              >
                <div className="text-[11px] text-muted-foreground">
                  {senderName(m)}
                </div>
                <div
                  className={
                    mine
                      ? "inline-block max-w-[90%] rounded-md bg-primary px-2 py-1 text-primary-foreground"
                      : "inline-block max-w-[90%] rounded-md bg-muted px-2 py-1"
                  }
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지 입력"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="button" disabled={sending || !text.trim()} onClick={() => void send()}>
          전송
        </Button>
      </div>
    </div>
  );
}
