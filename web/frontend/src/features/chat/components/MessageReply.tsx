// related files:
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/features/chat/components/ChatComposer.tsx
// - web/frontend/rules.md
import { Reply, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { getRequestorRoleBadgeLabel } from "@/shared/business/requestorCapabilities";
import { getRoleBadgeClassName } from "@/shared/ui/semanticStatus";

export interface ReplyToMessage {
  _id: string;
  sender: {
    name: string;
    role: string;
  };
  content: string;
}

interface MessageReplyProps {
  replyTo: ReplyToMessage | null;
  onCancelReply?: () => void;
  /** bubble 내부 인용 / composer 미리보기 */
  compact?: boolean;
  /** bubble 배경에 맞춰 투명 스타일 */
  embedded?: boolean;
  className?: string;
}

export function MessageReply({
  replyTo,
  onCancelReply,
  compact = false,
  embedded = false,
  className,
}: MessageReplyProps) {
  if (!replyTo) return null;


  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "관리자";
      case "manufacturer":
        return "제조사";
      case "requestor":
        return getRequestorRoleBadgeLabel("lab");
      case "practice":
        return getRequestorRoleBadgeLabel("practice");
      default:
        return role;
    }
  };

  if (compact || embedded) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 text-xs sm:text-sm min-w-0",
          !embedded && "p-2 bg-gray-50 rounded border-l-2 border-primary",
          embedded && "min-w-0",
          className,
        )}
      >
        {!embedded ? <Reply className="w-3.5 h-3.5 opacity-60 flex-shrink-0 mt-0.5" /> : null}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate opacity-90">{replyTo.sender.name}</p>
          <p className="truncate opacity-80">{replyTo.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-3 bg-primary-soft rounded-lg border border-primary-muted",
        className,
      )}
    >
      <Reply className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900">{replyTo.sender.name}</span>
          {replyTo.sender.role ? (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeClassName(
                replyTo.sender.role,
              )}`}
            >
              {getRoleLabel(replyTo.sender.role)}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-gray-700 line-clamp-2">{replyTo.content}</p>
      </div>
      {onCancelReply ? (
        <Button size="sm" variant="ghost" onClick={onCancelReply} aria-label="답글 취소">
          <X className="w-4 h-4" />
        </Button>
      ) : null}
    </div>
  );
}
