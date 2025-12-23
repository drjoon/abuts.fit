import type { MailItem } from "@/features/admin/mail/mailApi";
import { Badge } from "@/components/ui/badge";

export const formatDateTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getDirectionBadge = (direction: MailItem["direction"]) => {
  if (direction === "inbound") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">수신</Badge>
    );
  }
  return (
    <Badge className="bg-purple-100 text-purple-700 border-purple-200">
      발신
    </Badge>
  );
};

export const getStatusBadge = (status: MailItem["status"]) => {
  switch (status) {
    case "received":
      return <Badge variant="secondary">수신완료</Badge>;
    case "sent":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          발송완료
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">실패</Badge>;
    case "pending":
    default:
      return <Badge variant="outline">대기</Badge>;
  }
};

export const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
