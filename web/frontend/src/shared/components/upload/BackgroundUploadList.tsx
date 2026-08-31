// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/features/chat/components/ChatComposer.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, X, ZoomIn } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";
import type { BackgroundUploadItem } from "@/shared/hooks/useBackgroundTempUpload";
import { isChatImageAttachment } from "@/features/chat/components/ChatMessageBubble";

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

function PendingImageUploadTile({
  item,
  onRemove,
  onRetry,
  formatFileSize,
}: {
  item: BackgroundUploadItem;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  formatFileSize: (size: number) => string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const objectUrl = useMemo(
    () => URL.createObjectURL(item.file),
    [item.file, item.id],
  );

  useEffect(
    () => () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
    },
    [objectUrl],
  );

  const pct = Math.max(0, Math.min(100, Math.round(item.progress)));
  const isError = item.status === "error";
  const showBar = item.status !== "done";

  return (
    <>
      <div
        className={cn(
          "group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted/30",
          isError ? "border-destructive/60" : "border-border/70",
        )}
      >
        <button
          type="button"
          className="block h-full w-full"
          aria-label={`${item.file.name} 미리보기`}
          onClick={() => setPreviewOpen(true)}
        >
          <img
            src={objectUrl}
            alt={item.file.name}
            className="h-full w-full object-cover"
          />
        </button>

        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="pointer-events-auto rounded-full bg-background/90 p-1.5 shadow-sm"
            aria-label="크게 보기"
            onClick={() => setPreviewOpen(true)}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

        {showBar ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5">
            <Progress
              value={pct}
              className={cn(
                "h-1",
                isError ? "bg-destructive/30 [&>div]:bg-destructive" : "",
              )}
            />
          </div>
        ) : null}

        <div className="absolute left-1 top-1 flex max-w-[calc(100%-0.5rem)] items-center gap-0.5">
          <span
            className={cn(
              "truncate rounded bg-black/55 px-1 py-0.5 text-[9px] leading-none text-white",
              isError ? "bg-destructive/80" : "",
            )}
            title={statusLabel(item)}
          >
            {statusLabel(item)}
          </span>
        </div>

        <div className="absolute right-0.5 top-0.5 flex items-center gap-0.5">
          {isError && typeof onRetry === "function" ? (
            <button
              type="button"
              className="rounded-full bg-background/90 p-0.5 shadow-sm opacity-90 hover:opacity-100"
              onClick={() => onRetry(item.id)}
              aria-label="업로드 재시도"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          ) : null}
          {typeof onRemove === "function" ? (
            <button
              type="button"
              className="rounded-full bg-background/90 p-0.5 shadow-sm opacity-90 hover:opacity-100"
              onClick={() => onRemove(item.id)}
              aria-label="첨부 제거"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{item.file.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center rounded-lg bg-muted/40 p-4">
            <img
              src={objectUrl}
              alt={item.file.name}
              className="max-h-[70vh] max-w-full object-contain"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {formatFileSize(item.file.size)}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PendingFileUploadChip({
  item,
  onRemove,
  onRetry,
  formatFileSize,
}: {
  item: BackgroundUploadItem;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  formatFileSize: (size: number) => string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(item.progress)));
  const isError = item.status === "error";
  const showBar = item.status !== "done";

  return (
    <div
      className={cn(
        "min-w-[10rem] max-w-[16rem] flex-1 space-y-1 rounded border px-2 py-1.5",
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
        <span className="tabular-nums">{formatFileSize(item.file.size)}</span>
      </div>
      {showBar ? (
        <Progress
          value={pct}
          className={cn("h-1.5", isError ? "bg-destructive/20" : "")}
        />
      ) : null}
    </div>
  );
}

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
        const isImage = isChatImageAttachment({
          fileName: item.file.name,
          fileType: item.file.type,
        });

        if (isImage) {
          return (
            <PendingImageUploadTile
              key={item.id}
              item={item}
              onRemove={onRemove}
              onRetry={onRetry}
              formatFileSize={formatFileSize}
            />
          );
        }

        return (
          <PendingFileUploadChip
            key={item.id}
            item={item}
            onRemove={onRemove}
            onRetry={onRetry}
            formatFileSize={formatFileSize}
          />
        );
      })}
    </div>
  );
}
