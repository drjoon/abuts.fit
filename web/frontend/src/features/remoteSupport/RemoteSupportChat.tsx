// related files:
// - web/frontend/src/features/remoteSupport/remoteSupportApi.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RemoteSupportMessage } from "@/features/remoteSupport/remoteSupportApi";
import { remoteSupportApi } from "@/features/remoteSupport/remoteSupportApi";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import {
  ChatSoundMenu,
  useRegisterChatSoundViewing,
} from "@/shared/chat/ChatSoundControls";
import { remoteSupportChatSoundTarget } from "@/shared/chat/chatSoundPrefs";

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

function appendMessage(
  prev: RemoteSupportMessage[],
  msg: RemoteSupportMessage,
) {
  if (msg._id && prev.some((m) => m._id === msg._id)) return prev;
  return [...prev, msg];
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
  const soundTarget = remoteSupportChatSoundTarget(sessionId);

  useRegisterChatSoundViewing(soundTarget, Boolean(sessionId));

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Backend notifies via app-event (type: remote-support:chat), not a raw socket event.
  useAppEventListener({
    enabled: Boolean(sessionId),
    eventTypes: ["remote-support:chat"],
    // Chat must update while the input is focused / tab is in background.
    requireVisible: false,
    deferWhenEditing: false,
    onMatch: (evt) => {
      const msg = (evt.data || {}) as RemoteSupportMessage;
      if (!msg?.content || msg.sessionId !== sessionId) return;
      setMessages((prev) => appendMessage(prev, msg));
    },
  });

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const sent = await remoteSupportApi.postMessage(token, sessionId, content);
      setMessages((prev) => appendMessage(prev, sent));
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-medium">지원 채팅</div>
        <ChatSoundMenu targetId={soundTarget || null} />
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
