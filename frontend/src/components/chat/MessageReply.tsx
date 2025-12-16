import { Reply, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReplyToMessage {
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
  compact?: boolean;
}

export function MessageReply({
  replyTo,
  onCancelReply,
  compact = false,
}: MessageReplyProps) {
  if (!replyTo) return null;

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-700";
      case "manufacturer":
        return "bg-blue-100 text-blue-700";
      case "requestor":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "관리자";
      case "manufacturer":
        return "제조사";
      case "requestor":
        return "의뢰자";
      default:
        return role;
    }
  };

  if (compact) {
    return (
      <div className="flex items-start gap-2 p-2 bg-gray-50 rounded border-l-2 border-blue-500 text-sm">
        <Reply className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-700">{replyTo.sender.name}</p>
          <p className="text-gray-600 truncate">{replyTo.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <Reply className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900">
            {replyTo.sender.name}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor(
              replyTo.sender.role
            )}`}
          >
            {getRoleLabel(replyTo.sender.role)}
          </span>
        </div>
        <p className="text-sm text-gray-700 line-clamp-2">{replyTo.content}</p>
      </div>
      {onCancelReply && (
        <Button size="sm" variant="ghost" onClick={onCancelReply}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
