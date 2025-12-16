import { Check, CheckCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ReadBy {
  userId: string;
  readAt: string;
}

interface MessageReadReceiptProps {
  readBy?: ReadBy[];
  senderId: string;
  currentUserId: string;
  participantCount?: number;
}

export function MessageReadReceipt({
  readBy = [],
  senderId,
  currentUserId,
  participantCount = 2,
}: MessageReadReceiptProps) {
  // 본인이 보낸 메시지가 아니면 읽음 표시 안 함
  if (senderId !== currentUserId) {
    return null;
  }

  const othersReadCount = readBy.filter(
    (r) => r.userId !== currentUserId
  ).length;
  const isReadByOthers = othersReadCount > 0;
  const allRead = othersReadCount >= participantCount - 1;

  const formatReadTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString("ko-KR");
  };

  const readByOthers = readBy.filter((r) => r.userId !== currentUserId);
  const tooltipContent =
    readByOthers.length > 0
      ? readByOthers.map((r) => formatReadTime(r.readAt)).join(", ")
      : "읽지 않음";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center">
            {isReadByOthers ? (
              <CheckCheck
                className={`w-4 h-4 ${
                  allRead ? "text-blue-500" : "text-gray-400"
                }`}
              />
            ) : (
              <Check className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {isReadByOthers
              ? `읽음 (${othersReadCount}명) - ${tooltipContent}`
              : "읽지 않음"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
