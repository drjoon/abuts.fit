// related files:
// - web/frontend/src/shared/practice/practiceTransferBookmarks.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/backend/controllers/practiceTransfers/practiceTransferBookmark.controller.js
// - 2026-09-14: 의뢰상세 평가 왼쪽 북마크 토글(낙관적 패치).
// - 2026-09-14: POST에 jsonBody 사용·실패 시 낙관적 패치 롤백.
import { useState, type MouseEvent } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

type PracticeTransferBookmarkControlProps = {
  /** PracticeTransfer._id 또는 transferId */
  transferKey: string;
  bookmarked: boolean;
  side: "send" | "receive";
  onChanged?: (bookmarked: boolean) => void;
  className?: string;
  stopPropagation?: boolean;
};

export function PracticeTransferBookmarkControl({
  transferKey,
  bookmarked,
  side,
  onChanged,
  className,
  stopPropagation = true,
}: PracticeTransferBookmarkControlProps) {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const active = Boolean(bookmarked);
  const ariaLabel = active ? "북마크 해제" : "북마크";

  const onTriggerPointerDown = (event: MouseEvent) => {
    if (!stopPropagation) return;
    event.stopPropagation();
  };

  const handleToggle = async () => {
    const key = String(transferKey || "").trim();
    if (!key || !token || busy) return;
    const next = !active;
    setBusy(true);
    onChanged?.(next);
    try {
      const res = next
        ? await request({
            path: `/api/practice/transfers/${encodeURIComponent(key)}/bookmark`,
            method: "POST",
            token,
            jsonBody: { side },
          })
        : await request({
            path: `/api/practice/transfers/${encodeURIComponent(key)}/bookmark?side=${encodeURIComponent(side)}`,
            method: "DELETE",
            token,
          });
      if (!res.ok) {
        const message =
          res.data &&
          typeof res.data === "object" &&
          typeof (res.data as { message?: unknown }).message === "string"
            ? String((res.data as { message: string }).message)
            : "다시 시도해 주세요.";
        throw new Error(message);
      }
    } catch (error) {
      onChanged?.(active);
      toast({
        title: next ? "북마크 추가 실패" : "북마크 해제 실패",
        description:
          error instanceof Error ? error.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 shrink-0",
            active && "text-sky-600",
            className,
          )}
          aria-label={ariaLabel}
          aria-pressed={active}
          disabled={busy || !transferKey}
          onPointerDown={onTriggerPointerDown}
          onClick={() => void handleToggle()}
        >
          <Bookmark
            className={cn("h-4 w-4", active && "fill-current")}
            strokeWidth={1.75}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ariaLabel}</TooltipContent>
    </Tooltip>
  );
}
