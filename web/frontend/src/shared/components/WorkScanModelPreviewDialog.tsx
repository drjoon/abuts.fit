// 작업 스캔(상악·하악·바이트)을 한 모델로 연다. 파일 좌표 그대로 겹치고 악별로 켜고 끈다.
// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/backend/services/workScanAutoAlign.service.js
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  workScanModelParts,
  workScanModelTitle,
  type WorkScanModelFile,
} from "@/shared/practice/workScanModel";
import {
  CaseLayerViewer,
  type CaseLayerModel,
  type CaseLayerViewerHandle,
} from "@/shared/share/CaseLayerViewer";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";

type LoadState = { status: "loading"; progress: number } | { status: "ready"; file: File } | { status: "error"; message: string };

export function WorkScanModelPreviewDialog({
  open,
  onOpenChange,
  files,
  authToken,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: readonly WorkScanModelFile[];
  authToken?: string | null;
  title?: string;
}) {
  const parts = useMemo(() => workScanModelParts(files), [files]);
  const partsKey = parts.map((part) => part.key).join("|");
  const viewerRef = useRef<CaseLayerViewerHandle | null>(null);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !authToken) return;
    const ac = new AbortController();
    setHidden({});
    setLoads(
      Object.fromEntries(parts.map((part) => [part.key, { status: "loading", progress: 0 }])),
    );
    for (const part of parts) {
      void fetchS3BlobCached({
        s3Key: part.key,
        fileName: part.file.fileName,
        token: authToken,
        buildUrl: buildS3ProxyDownloadUrl,
        signal: ac.signal,
        onProgress: (progress) =>
          setLoads((prev) =>
            prev[part.key]?.status === "loading"
              ? { ...prev, [part.key]: { status: "loading", progress } }
              : prev,
          ),
      })
        .then((blob) => {
          if (ac.signal.aborted) return;
          const file = new File([blob], part.file.fileName, {
            type: "application/octet-stream",
          });
          setLoads((prev) => ({ ...prev, [part.key]: { status: "ready", file } }));
        })
        .catch((error) => {
          if (ac.signal.aborted) return;
          setLoads((prev) => ({
            ...prev,
            [part.key]: {
              status: "error",
              message: error instanceof Error ? error.message : "파일을 불러오지 못했습니다.",
            },
          }));
        });
    }
    return () => ac.abort();
    // parts는 partsKey가 같으면 같은 파일이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authToken, partsKey]);

  const layers = useMemo<CaseLayerModel[]>(() => {
    const out: CaseLayerModel[] = [];
    for (const part of parts) {
      const state = loads[part.key];
      if (state?.status !== "ready") continue;
      out.push({ id: part.key, file: state.file, tone: "scan", visible: !hidden[part.key] });
    }
    return out;
  }, [hidden, loads, parts]);

  const loading = parts.filter((part) => loads[part.key]?.status === "loading");
  const progress =
    loading.length > 0
      ? loading.reduce((sum, part) => {
          const state = loads[part.key];
          return sum + (state?.status === "loading" ? state.progress : 0);
        }, 0) / loading.length
      : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "z-[450] flex h-[94dvh] max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[94dvh] sm:max-h-[94dvh] sm:gap-0 sm:p-0",
          RESPONSIVE.dialogContentFull,
        )}
        overlayClassName="z-[445]"
      >
        <DialogHeader className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b bg-muted/50 py-2 pl-4 pr-14 text-left sm:pl-5 sm:pr-14">
          <DialogTitle className="min-w-0 flex-1 truncate text-left text-sm font-medium sm:text-base">
            {title || "작업 모델"}
            <span className="ml-2 text-xs font-normal text-muted-foreground sm:text-sm">
              {workScanModelTitle(files)}
            </span>
          </DialogTitle>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {parts.map((part) => {
              const state = loads[part.key];
              const shown = !hidden[part.key];
              return (
                <Button
                  key={part.key}
                  type="button"
                  size="sm"
                  variant={shown ? "default" : "outline"}
                  className="h-8 gap-1 px-2.5 [&_svg]:!size-3.5"
                  disabled={state?.status !== "ready"}
                  title={
                    state?.status === "error"
                      ? state.message
                      : shown
                        ? `${part.label} 숨기기`
                        : `${part.label} 보기`
                  }
                  onClick={() =>
                    setHidden((prev) => ({ ...prev, [part.key]: !prev[part.key] }))
                  }
                >
                  {state?.status === "loading" ? (
                    <Loader2 className="animate-spin" />
                  ) : shown ? (
                    <Eye />
                  ) : (
                    <EyeOff />
                  )}
                  {part.label}
                </Button>
              );
            })}
          </div>
          <DialogDescription className="sr-only">
            상악·하악·바이트 작업 스캔을 같은 좌표로 겹쳐 봅니다.
          </DialogDescription>
        </DialogHeader>
        <div className="relative min-h-0 flex-1">
          {open ? <CaseLayerViewer ref={viewerRef} layers={layers} /> : null}
          {loading.length > 0 ? (
            <div className="pointer-events-none absolute left-1/2 top-4 w-56 -translate-x-1/2 rounded-md bg-black/55 px-3 py-2 text-xs text-white">
              <p className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                스캔 {loading.length}개 불러오는 중
              </p>
              <Progress value={progress} className="mt-1.5 h-1" />
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute bottom-4 left-4 h-8 gap-1.5 bg-white/90 shadow-sm"
            onClick={() => viewerRef.current?.fitToView()}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            화면 맞춤
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
