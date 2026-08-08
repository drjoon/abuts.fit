// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/pages/admin/support/AdminChatManagement.tsx
// - web/frontend/src/features/chat/components/MessageReply.tsx
// - web/frontend/src/features/chat/components/chatReactions.ts
import { useMemo, useState } from "react";
import { Reply, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";
import type { ChatMessage, ChatMessageReaction } from "@/shared/hooks/useChatRooms";
import { MessageReply } from "@/features/chat/components/MessageReply";
import { CHAT_REACTION_EMOJIS } from "@/features/chat/components/chatReactions";

export type ChatBubbleAttachment = {
  fileId?: string;
  fileName: string;
  fileSize?: number;
  s3Key?: string;
  s3Url?: string;
};

type ChatMessageBubbleProps = {
  message: ChatMessage;
  isMine: boolean;
  currentUserId?: string | null;
  formatTime: (createdAt: string) => string;
  showSenderName?: boolean;
  compact?: boolean;
  onReply?: (message: ChatMessage) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void | Promise<void>;
  onOpenAttachment?: (file: ChatBubbleAttachment) => void | Promise<void>;
  formatFileSize?: (size: number) => string;
};

type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export const chatMessageDomId = (messageId: string) =>
  `chat-msg-${String(messageId || "").trim()}`;

const HIGHLIGHT_CLASS = "chat-msg-flash";
const HIGHLIGHT_MS = 1600;

export const scrollToChatMessage = (messageId: string) => {
  const id = String(messageId || "").trim();
  if (!id) return false;

  const el = document.getElementById(chatMessageDomId(id));
  if (!el) return false;

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove(HIGHLIGHT_CLASS);
  // reflow so animation can restart
  void el.offsetWidth;
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
  }, HIGHLIGHT_MS);
  return true;
};

const normalizeReplyTo = (message: ChatMessage) => {
  const raw = message.replyTo;
  if (!raw) return null;
  if (typeof raw === "string") {
    const id = String(raw || "").trim();
    if (!id) return null;
    return {
      _id: id,
      sender: { name: "원본 메시지", role: "" },
      content: "원본 메시지로 이동",
    };
  }
  if (raw.isDeleted) {
    return {
      _id: String(raw._id || ""),
      sender: { name: "알 수 없음", role: "" },
      content: "삭제된 메시지입니다.",
    };
  }
  return {
    _id: String(raw._id || ""),
    sender: {
      name: String(raw.sender?.name || "알 수 없음").trim() || "알 수 없음",
      role: String(raw.sender?.role || "").trim(),
    },
    content: String(raw.content || "").trim() || "(내용 없음)",
  };
};

const groupReactions = (
  reactions: ChatMessageReaction[] | undefined,
  currentUserId: string,
): ReactionGroup[] => {
  const map = new Map<string, ReactionGroup>();
  for (const row of Array.isArray(reactions) ? reactions : []) {
    const emoji = String(row?.emoji || "").trim();
    if (!emoji) continue;
    const uid = String(row?.userId || "").trim();
    const prev = map.get(emoji) || { emoji, count: 0, reactedByMe: false };
    prev.count += 1;
    if (currentUserId && uid === currentUserId) prev.reactedByMe = true;
    map.set(emoji, prev);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
};

export function ChatMessageBubble({
  message,
  isMine,
  currentUserId,
  formatTime,
  showSenderName = true,
  compact = false,
  onReply,
  onToggleReaction,
  onOpenAttachment,
  formatFileSize,
}: ChatMessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const senderName = String(message.sender?.name || "알 수 없음").trim();
  const myId = String(currentUserId || "").trim();
  const replyPreview = normalizeReplyTo(message);
  const reactionGroups = useMemo(
    () => groupReactions(message.reactions, myId),
    [message.reactions, myId],
  );

  const canInteract = typeof onReply === "function" || typeof onToggleReaction === "function";
  const replyTargetId = String(replyPreview?._id || "").trim();
  const canJumpToReply = Boolean(replyTargetId) && replyPreview?.content !== "삭제된 메시지입니다.";

  const handleToggle = (emoji: string) => {
    if (!onToggleReaction) return;
    void onToggleReaction(String(message._id), emoji);
    setPickerOpen(false);
  };

  const handleJumpToReply = () => {
    if (!canJumpToReply) return;
    scrollToChatMessage(replyTargetId);
  };

  return (
    <div
      id={chatMessageDomId(String(message._id || ""))}
      className={cn(
        "group flex w-full min-w-0 scroll-mt-4 rounded-lg transition-[box-shadow,background-color]",
        isMine ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative w-fit max-w-[min(80%,100%)] min-w-0 flex flex-col gap-1",
          isMine ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "min-w-0 max-w-full rounded-lg px-3.5 py-2.5 shadow-sm",
            compact ? "text-xs sm:text-sm" : "text-sm",
            isMine ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {showSenderName ? (
            <p className="opacity-80 mb-1 font-medium break-words">{senderName}</p>
          ) : null}
          <p className={cn("opacity-70 mb-1", compact ? "text-[10px]" : "")}>
            {formatTime(message.createdAt)}
          </p>

          {replyPreview ? (
            <button
              type="button"
              onClick={handleJumpToReply}
              disabled={!canJumpToReply}
              className={cn(
                "mb-2 block w-full min-w-0 rounded border-l-2 px-2 py-1 text-left transition-opacity",
                isMine
                  ? "border-primary-foreground/50 bg-primary-foreground/10"
                  : "border-blue-500 bg-background/60",
                canJumpToReply
                  ? "cursor-pointer hover:opacity-90"
                  : "cursor-default opacity-80",
              )}
              aria-label="원본 메시지로 이동"
              title={canJumpToReply ? "원본 메시지로 이동" : undefined}
            >
              <MessageReply replyTo={replyPreview} embedded />
            </button>
          ) : null}

          <p className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug">
            {message.content}
          </p>

          {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
            <div className="mt-2 space-y-1">
              {message.attachments.map((file, idx) => {
                const fileName = String(file?.fileName || "첨부파일").trim();
                const fileSizeNum = Number(file?.fileSize || 0);
                const sizeLabel =
                  typeof formatFileSize === "function"
                    ? formatFileSize(fileSizeNum)
                    : fileSizeNum > 0
                      ? `${fileSizeNum} B`
                      : "";
                const s3Key = String(file?.s3Key || "").trim();
                const canOpen = typeof onOpenAttachment === "function" && (s3Key || file?.s3Url);

                return canOpen ? (
                  <button
                    key={`${message._id}:file:${idx}`}
                    type="button"
                    onClick={() =>
                      void onOpenAttachment({
                        fileId: file?.fileId,
                        fileName,
                        fileSize: fileSizeNum,
                        s3Key,
                        s3Url: String(file?.s3Url || "").trim(),
                      })
                    }
                    className="block w-full rounded border border-current/20 px-2 py-1 text-xs text-left underline-offset-2 hover:underline"
                  >
                    {fileName}
                    {sizeLabel ? ` · ${sizeLabel}` : ""}
                  </button>
                ) : (
                  <div
                    key={`${message._id}:file:${idx}`}
                    className="rounded border border-current/20 px-2 py-1 text-xs"
                  >
                    {fileName}
                    {sizeLabel ? ` · ${sizeLabel}` : ""}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {reactionGroups.length > 0 ? (
          <div
            className={cn(
              "flex flex-wrap gap-1 max-w-full",
              isMine ? "justify-end" : "justify-start",
            )}
          >
            {reactionGroups.map((group) => (
              <button
                key={`${message._id}:rx:${group.emoji}`}
                type="button"
                disabled={!onToggleReaction}
                onClick={() => handleToggle(group.emoji)}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs bg-background shadow-sm transition-colors",
                  group.reactedByMe
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-border text-foreground hover:bg-muted",
                  !onToggleReaction && "cursor-default",
                )}
                aria-label={`${group.emoji} 리액션 ${group.count}개`}
              >
                <span>{group.emoji}</span>
                <span className="tabular-nums text-[10px]">{group.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {canInteract ? (
          <div
            className={cn(
              "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
              isMine ? "flex-row-reverse" : "flex-row",
            )}
          >
            {typeof onReply === "function" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onReply(message)}
                aria-label="답글"
                title="답글"
              >
                <Reply className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            {typeof onToggleReaction === "function" ? (
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="리액션"
                    title="리액션"
                  >
                    <SmilePlus className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1.5" align={isMine ? "end" : "start"}>
                  <div className="flex items-center gap-0.5">
                    {CHAT_REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="h-8 w-8 rounded-md text-base hover:bg-muted"
                        onClick={() => handleToggle(emoji)}
                        aria-label={`${emoji} 리액션`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
