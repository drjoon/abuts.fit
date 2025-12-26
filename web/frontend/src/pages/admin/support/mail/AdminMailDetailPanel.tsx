import type { MailItem } from "@/features/admin/mail/mailApi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Paperclip,
  Mail,
  MailOpen,
  AlertOctagon,
  Trash2,
} from "lucide-react";
import {
  formatBytes,
  formatDateTime,
  getDirectionBadge,
  getStatusBadge,
} from "./mailUi";

type Props = {
  selected: MailItem | null;
  detailLoading: boolean;
  onDownload: (s3Key: string) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAsUnread?: (id: string) => void;
  onMoveToSpam?: (id: string) => void;
  onTrash?: (id: string) => void;
};

export const AdminMailDetailPanel = ({
  selected,
  detailLoading,
  onDownload,
  onMarkAsRead,
  onMarkAsUnread,
  onMoveToSpam,
  onTrash,
}: Props) => {
  const selectedDate =
    selected?.createdAt || selected?.receivedAt || selected?.sentAt;

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-base">메일 상세</CardTitle>
        <CardDescription>
          {selected ? "선택한 메일의 내용을 확인합니다." : "메일을 선택하세요."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {detailLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Separator />
            <Skeleton className="h-[240px] w-full" />
          </div>
        ) : !selected ? (
          <div className="text-sm text-muted-foreground py-16 text-center">
            좌측에서 메일을 선택하세요.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getDirectionBadge(selected.direction)}
                  {getStatusBadge(selected.status)}
                  {selectedDate ? (
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(selectedDate)}
                    </span>
                  ) : null}
                </div>
                <div className="text-lg font-semibold">
                  {selected.subject || "(제목 없음)"}
                </div>
                <div className="text-sm text-muted-foreground">
                  <div>From: {selected.from || "-"}</div>
                  <div>To: {(selected.to || []).join(", ") || "-"}</div>
                  {selected.cc?.length ? (
                    <div>Cc: {selected.cc.join(", ")}</div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onMarkAsUnread &&
                selected.isRead &&
                selected.direction === "inbound" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => onMarkAsUnread(selected._id)}
                  >
                    <Mail className="h-4 w-4" />
                    안읽음
                  </Button>
                ) : null}
                {onMoveToSpam && selected.folder !== "spam" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => onMoveToSpam(selected._id)}
                  >
                    <AlertOctagon className="h-4 w-4" />
                    스팸
                  </Button>
                ) : null}
                {onTrash && selected.folder !== "trash" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => onTrash(selected._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </Button>
                ) : null}
              </div>
            </div>

            <Separator />

            <ScrollArea className="h-[300px]">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap pr-3">
                {selected.bodyText || selected.bodyHtml || "(본문 없음)"}
              </div>
            </ScrollArea>

            {selected.attachments?.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  첨부 ({selected.attachments.length})
                </div>
                <div className="space-y-2">
                  {selected.attachments.map((a, idx) => (
                    <div
                      key={`${a.s3Key || "att"}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm truncate">
                          {a.filename || a.s3Key || "(unnamed)"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(a.size)}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        disabled={!a.s3Key}
                        onClick={() => a.s3Key && onDownload(a.s3Key)}
                      >
                        <Download className="h-4 w-4" />
                        다운로드
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
