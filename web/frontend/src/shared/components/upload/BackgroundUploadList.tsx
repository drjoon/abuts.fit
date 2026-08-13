// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/features/chat/components/ChatComposer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import { RotateCcw, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/shared/ui/cn";
import type { BackgroundUploadItem } from "@/shared/hooks/useBackgroundTempUpload";

type Props = {
  items: BackgroundUploadItem[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  className?: string;
  formatFileSize?: (size: number) => string;
};

const defaultFormatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
};

const statusLabel = (item: BackgroundUploadItem) => {
  if (item.status === "error") return item.error || "업로드 실패";
  if (item.status === "done") return "완료";
  if (item.status === "queued") return "대기";
  return `${Math.max(0, Math.min(100, Math.round(item.progress)))}%`;
};

export function BackgroundUploadList({
  items,
  onRemove,
  onRetry,
  className,
  formatFileSize = defaultFormatFileSize,
}: Props) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, Math.round(item.progress)));
        const isError = item.status === "error";
        const showBar = item.status !== "done";

        return (
          <div
            key={item.id}
            className={cn(
              "min-w-[10rem] max-w-[16rem] flex-1 rounded border px-2 py-1.5 space-y-1",
              isError ? "border-destructive/60 bg-destructive-soft" : "",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="min-w-0 flex-1 truncate text-xs"
                title={item.file.name}
              >
                {item.file.name}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[10px] tabular-nums",
                  isError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {statusLabel(item)}
              </span>
              {isError && typeof onRetry === "function" ? (
                <button
                  type="button"
                  className="shrink-0 opacity-70 hover:opacity-100"
                  onClick={() => onRetry(item.id)}
                  aria-label="업로드 재시도"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              ) : null}
              {typeof onRemove === "function" ? (
                <button
                  type="button"
                  className="shrink-0 opacity-70 hover:opacity-100"
                  onClick={() => onRemove(item.id)}
                  aria-label="첨부 제거"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span className="tabular-nums">
                {formatFileSize(item.file.size)}
              </span>
            </div>
            {showBar ? (
              <Progress
                value={pct}
                className={cn("h-1.5", isError ? "bg-destructive/20" : "")}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
