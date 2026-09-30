// 작업 스캔(상악·하악·바이트)을 한 모델로 연다. 파일 좌표 그대로 겹치고 악별로 켜고 끈다.
// change-log:
// - 2026-09-29: 채팅 첨부는 페인트 도구 막대 안으로. 헤더에는 악 토글·페인트·다운로드만.
// - 2026-09-29: 제목 아래 케이스 정보(caseInfo) — 채팅 헤더와 같은 점·치과/기공소·환자·치아·날짜.
// - 2026-09-28: 다운로드는 파일 목록을 한 번에 넘긴다. 채팅 상세가 케이스 폴더에 저장한다.
// - 2026-09-28: 채팅 첨부 후 프리뷰를 닫지 않는다. 여러 장을 붙일 수 있게 토스트만 띄운다.
// - 2026-09-28: 의뢰 파일 프리뷰와 같은 헤더. 페인트·채팅 첨부·다운로드(악별·전체)와 칼라 매핑.
// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/PreviewAnnotateActions.tsx
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/backend/services/workScanAutoAlign.service.js
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Download, Eye, EyeOff, Loader2, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  PREVIEW_HEADER_BUTTON_CLASS,
  keepOpenOnToastInteract,
  PreviewColorMappingToggle,
  PreviewPaintControls,
  PreviewPaintLayer,
  usePreviewPaint,
} from "@/shared/components/PreviewAnnotateActions";
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

export function WorkScanModelPreviewDialog<T extends WorkScanModelFile>({
  open,
  onOpenChange,
  files,
  authToken,
  title,
  caseInfo,
  onDownload,
  downloadBusy = false,
  onAttachChatFile,
  onRemoveChatFile,
  onReorderChatFiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: readonly T[];
  authToken?: string | null;
  title?: string;
  /** 제목 아래 한 줄. 어느 의뢰의 스캔인지(치과·기공소·환자·치아·날짜). */
  caseInfo?: ReactNode;
  /** 고른 악 하나, 또는 「전체」면 모든 파일을 한 번에 넘긴다. */
  onDownload?: (files: T[]) => void | Promise<void>;
  downloadBusy?: boolean;
  /** 표시가 입혀진 현재 뷰를 채팅 첨부로 넘긴다. */
  onAttachChatFile?: (file: File) => void;
  onRemoveChatFile?: (file: File) => void;
  onReorderChatFiles?: (files: File[]) => void;
}) {
  const parts = useMemo(() => workScanModelParts(files), [files]);
  const partsKey = parts.map((part) => part.key).join("|");
  const viewerRef = useRef<CaseLayerViewerHandle | null>(null);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [colorMapping, setColorMapping] = useState(true);
  const paint = usePreviewPaint({ open, resetKey: partsKey });
  const heading = title || "작업 모델";

  useEffect(() => {
    if (!open || !authToken) return;
    const ac = new AbortController();
    setColorMapping(true);
    // 처음엔 상악·하악만 켠다. 바이트는 헤더에서 켠다.
    const hasJaw = parts.some((part) => part.role !== "bite");
    setHidden(
      hasJaw
        ? Object.fromEntries(
            parts.filter((part) => part.role === "bite").map((part) => [part.key, true]),
          )
        : {},
    );
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
  const canAnnotate = layers.length > 0;

  const renderDownloadControl = () => {
    if (!onDownload || parts.length === 0) return null;
    const label = downloadBusy ? "다운로드 중..." : "다운로드";
    const trigger = (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={PREVIEW_HEADER_BUTTON_CLASS}
        disabled={downloadBusy}
        aria-label={label}
        onClick={parts.length === 1 ? () => void onDownload([parts[0].file]) : undefined}
      >
        <Download />
        <span className="hidden sm:inline">{label}</span>
        {parts.length > 1 ? <ChevronDown className="opacity-70" /> : null}
      </Button>
    );
    if (parts.length === 1) return trigger;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[460]">
          {parts.map((part) => (
            <DropdownMenuItem key={part.key} onClick={() => void onDownload([part.file])}>
              <span className="font-medium">{part.label}</span>
              <span className="ml-2 max-w-[14rem] truncate text-xs text-muted-foreground">
                {part.file.fileName}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void onDownload(parts.map((part) => part.file))}>
            전체 ({parts.length}개)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "z-[450] flex h-[94dvh] max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[94dvh] sm:max-h-[94dvh] sm:gap-0 sm:p-0",
          RESPONSIVE.dialogContentFull,
        )}
        overlayClassName="z-[445]"
        onInteractOutside={keepOpenOnToastInteract}
      >
        <DialogHeader className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b bg-muted/50 py-2 pl-4 pr-14 text-left sm:pl-5 sm:pr-14">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-left text-sm font-medium sm:text-base">
              {heading}
              <span className="ml-2 text-xs font-normal text-muted-foreground sm:text-sm">
                {workScanModelTitle(files)}
              </span>
            </DialogTitle>
            {caseInfo ? <div className="mt-0.5 min-w-0">{caseInfo}</div> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <div className="mr-3 flex items-center gap-1.5">
              {parts.map((part) => {
                const state = loads[part.key];
                const shown = !hidden[part.key];
                return (
                  <Button
                    key={part.key}
                    type="button"
                    size="sm"
                    variant={shown ? "default" : "outline"}
                    className={PREVIEW_HEADER_BUTTON_CLASS}
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
            <PreviewPaintControls paint={paint} disabled={!canAnnotate} />
            {renderDownloadControl()}
          </div>
          <DialogDescription className="sr-only">
            상악·하악·바이트 작업 스캔을 같은 좌표로 겹쳐 봅니다.
          </DialogDescription>
        </DialogHeader>
        <div className="relative min-h-0 flex-1">
          {open ? (
            <CaseLayerViewer ref={viewerRef} layers={layers} colorMapping={colorMapping} />
          ) : null}
          {layers.length > 0 ? (
            <PreviewColorMappingToggle checked={colorMapping} onCheckedChange={setColorMapping} />
          ) : null}
          {loading.length > 0 ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-56 -translate-x-1/2 rounded-md bg-black/55 px-3 py-2 text-xs text-white">
              <p className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                스캔 {loading.length}개 불러오는 중
              </p>
              <Progress value={progress} className="mt-1.5 h-1" />
            </div>
          ) : null}
          {canAnnotate ? (
            <PreviewPaintLayer
              paint={paint}
              surfaceKey={partsKey}
              captureCanvas={() => viewerRef.current?.captureCanvas() ?? null}
              fileName={heading}
              onAttachChatFile={onAttachChatFile}
              onRemoveChatFile={onRemoveChatFile}
              onReorderChatFiles={onReorderChatFiles}
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute bottom-4 left-4 z-20 h-8 gap-1.5 bg-white/90 shadow-sm"
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
