import type { KeyboardEvent } from "react";
import type { MailItem } from "@/features/admin/mail/mailApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Paperclip, RefreshCw, Search } from "lucide-react";
import { formatDateTime, getDirectionBadge, getStatusBadge } from "./mailUi";

type Props = {
  q: string;
  setQ: (v: string) => void;
  loading: boolean;
  mails: MailItem[];
  selectedId: string | null;
  onSearch: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  onSelect: (id: string) => void;
  variant: "inbox" | "sent";
};

export const AdminMailListPanel = ({
  q,
  setQ,
  loading,
  mails,
  selectedId,
  onSearch,
  onLoadMore,
  hasMore,
  onSelect,
  variant,
}: Props) => {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSearch();
  };

  return (
    <Card className="lg:col-span-2">
      <CardContent className="space-y-3 mt-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-2.5" />
            <Input
              className="pl-8"
              placeholder="제목/본문 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <Button variant="secondary" onClick={onSearch} disabled={loading}>
            검색
          </Button>
          <Button
            variant="outline"
            onClick={onSearch}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            새로고침
          </Button>
        </div>

        <Separator />

        <ScrollArea className="h-[520px]">
          <div className="space-y-2 pr-3">
            {loading && mails.length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : mails.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">
                메일이 없습니다.
              </div>
            ) : (
              mails.map((mail) => {
                const active = selectedId === mail._id;
                const secondary =
                  variant === "inbox"
                    ? `From: ${mail.from || "-"}`
                    : `To: ${(mail.to || []).join(", ") || "-"}`;

                return (
                  <button
                    key={mail._id}
                    type="button"
                    className={cn(
                      "w-full text-left rounded-md border p-3 transition-colors",
                      active ? "bg-muted" : "hover:bg-muted/50"
                    )}
                    onClick={() => onSelect(mail._id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getDirectionBadge(mail.direction)}
                        {getStatusBadge(mail.status)}
                        {!mail.isRead && mail.direction === "inbound" ? (
                          <Badge variant="default" className="text-xs">
                            새 메일
                          </Badge>
                        ) : null}
                        {mail.attachments?.length ? (
                          <Badge variant="outline" className="gap-1">
                            <Paperclip className="h-3 w-3" />
                            {mail.attachments.length}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(
                          mail.createdAt || mail.receivedAt || mail.sentAt
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "mt-2 text-sm truncate",
                        !mail.isRead && mail.direction === "inbound"
                          ? "font-bold"
                          : "font-medium"
                      )}
                    >
                      {mail.subject || "(제목 없음)"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {secondary}
                    </div>
                  </button>
                );
              })
            )}

            {hasMore ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={loading}
                onClick={onLoadMore}
              >
                더 불러오기
              </Button>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
