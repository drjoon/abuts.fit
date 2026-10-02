// 의뢰 파일 전체를 한 번에 띄운다. 3D 스캔은 같은 좌표로 겹치고, 사진은 아래 썸네일 갤러리에서 연다.
// change-log:
// - 2026-10-03: 신설. 파일 1개씩 열고 좌우 화살표로 넘기던 의뢰 파일 프리뷰를 작업 스캔 프리뷰 구조로 바꿈.
// related files:
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Box,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Maximize2,
} from "lucide-react";

import { AbutsLogo } from "@/components/branding/AbutsLogo";
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
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import {
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  isModelPreviewExt,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
} from "@/shared/files/modelPreviewFile";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  PREVIEW_HEADER_BUTTON_CLASS,
  keepOpenOnToastInteract,
  PreviewColorMappingToggle,
  PreviewPaintControls,
  PreviewPaintLayer,
  usePreviewPaint,
} from "@/shared/components/PreviewAnnotateActions";
import {
  ResizablePanelHandle,
  useResizablePanelWidth,
} from "@/shared/components/ResizablePanelHandle";
import {
  VIEW_GESTURE_HINT_LAYER_CLASS,
  ViewGestureHint,
} from "@/shared/components/ViewGestureHint";
import {
  ZoomableImagePreview,
  type ZoomableImagePreviewHandle,
} from "@/shared/components/ZoomableImagePreview";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";
import { resolveOralScanRole } from "@/shared/practice/labProsthesisAiDesign";
import {
  CaseLayerViewer,
  type CaseLayerModel,
  type CaseLayerViewerHandle,
} from "@/shared/share/CaseLayerViewer";
import { cn } from "@/shared/ui/cn";

export type RequestPreviewFile = {
  id: string;
  fileName: string;
  size: number;
  s3Key: string;
  uploadedAt?: string | null;
  scanRole?: string | null;
};

type Item = {
  key: string;
  file: RequestPreviewFile;
  kind: "model" | "image";
  roleLabel: string;
};

type LoadState =
  | { status: "loading"; progress: number }
  | { status: "ready" }
  | { status: "error"; message: string };

const ROLE_LABEL: Record<string, string> = {
  upper: "상악",
  lower: "하악",
  bite: "바이트",
};

function itemKey(file: RequestPreviewFile) {
  return String(file.s3Key || file.id || file.fileName);
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

function kindOf(fileName: string): "model" | "image" | null {
  const ext = getModelExtLower(fileName);
  if (isModelPreviewExt(ext)) return "model";
  const dot = fileName.lastIndexOf(".");
  const plain = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  if (IMAGE_EXTS.has(plain)) return "image";
  return null;
}

function EyeToggle({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:opacity-40",
        on ? "text-primary" : "text-muted-foreground/60",
      )}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );
}

export function RequestFilesPreviewDialog({
  open,
  onOpenChange,
  files,
  initialKey,
  authToken,
  title = "의뢰 파일",
  caseInfo,
  onDownload,
  downloadBusy = false,
  onAttachChatFile,
  onRemoveChatFile,
  onReorderChatFiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: readonly RequestPreviewFile[];
  /** 처음에 열 파일(사진이면 바로 그 사진). 없으면 3D 겹침. */
  initialKey?: string | null;
  authToken?: string | null;
  title?: string;
  caseInfo?: ReactNode;
  onDownload?: (files: RequestPreviewFile[]) => void | Promise<void>;
  downloadBusy?: boolean;
  onAttachChatFile?: (file: File) => void;
  onRemoveChatFile?: (file: File) => void;
  onReorderChatFiles?: (files: File[]) => void;
}) {
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const file of files) {
      const kind = kindOf(file.fileName);
      if (!kind || !String(file.s3Key || "").trim()) continue;
      const role = resolveOralScanRole({
        fileName: file.fileName,
        scanRole: file.scanRole,
      });
      out.push({
        key: itemKey(file),
        file,
        kind,
        roleLabel:
          kind === "image" ? "사진" : (role && ROLE_LABEL[role]) || "3D",
      });
    }
    return out;
  }, [files]);
  const itemsKey = items.map((i) => i.key).join("|");
  const models = items.filter((i) => i.kind === "model");

  const viewerRef = useRef<CaseLayerViewerHandle | null>(null);
  const imageRef = useRef<ZoomableImagePreviewHandle | null>(null);
  const panel = useResizablePanelWidth("abuts.requestFilesPanelWidth.v1");
  const paint = usePreviewPaint({
    open,
    resetKey: itemsKey,
    initiallyOn: false,
  });
  const [paintSpace, setPaintSpace] = useState<ViewPaintSpace | null>(null);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [modelFiles, setModelFiles] = useState<
    Record<string, { file: File; companionFiles: File[] }>
  >({});
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [shownImageKey, setShownImageKey] = useState<string | null>(null);
  const [colorMapping, setColorMapping] = useState(true);
  const initialKeyRef = useRef(initialKey);
  initialKeyRef.current = initialKey;

  // 열 때마다 전부 불러온다. 사진을 먼저 받아 두면 PLY 텍스처로도 쓴다.
  useEffect(() => {
    if (!open || !authToken) return;
    const ac = new AbortController();
    const urls: string[] = [];
    setColorMapping(true);
    setModelFiles({});
    setImageFiles({});
    setImageUrls({});
    setLoads(
      Object.fromEntries(
        items.map((i) => [
          i.key,
          { status: "loading", progress: 0 } as LoadState,
        ]),
      ),
    );
    const startHidden: Record<string, boolean> = {};
    for (const m of models) {
      const role = resolveOralScanRole({
        fileName: m.file.fileName,
        scanRole: m.file.scanRole,
      });
      startHidden[m.key] = role === "bite";
    }
    setHidden(startHidden);
    const wanted = initialKeyRef.current;
    setShownImageKey(
      wanted && items.some((i) => i.key === wanted && i.kind === "image")
        ? wanted
        : null,
    );

    const setProgress = (key: string, progress: number) =>
      setLoads((prev) =>
        prev[key]?.status === "loading"
          ? { ...prev, [key]: { status: "loading", progress } }
          : prev,
      );
    const fail = (key: string, error: unknown) => {
      if (ac.signal.aborted) return;
      setLoads((prev) => ({
        ...prev,
        [key]: {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "파일을 불러오지 못했습니다.",
        },
      }));
    };
    const fetchBlob = (item: Item) =>
      fetchS3BlobCached({
        s3Key: item.file.s3Key,
        fileName: item.file.fileName,
        token: authToken,
        buildUrl: buildS3ProxyDownloadUrl,
        signal: ac.signal,
        onProgress: (progress) => setProgress(item.key, progress),
      });

    const imagePromises = items
      .filter((i) => i.kind === "image")
      .map(async (item) => {
        try {
          const blob = await fetchBlob(item);
          if (ac.signal.aborted) return null;
          const file = fileFromImageBlob(blob, item.file.fileName);
          const url = URL.createObjectURL(file);
          urls.push(url);
          setImageFiles((prev) => ({ ...prev, [item.key]: file }));
          setImageUrls((prev) => ({ ...prev, [item.key]: url }));
          setLoads((prev) => ({ ...prev, [item.key]: { status: "ready" } }));
          return { item, file };
        } catch (error) {
          fail(item.key, error);
          return null;
        }
      });

    for (const item of models) {
      void (async () => {
        try {
          const blob = await fetchBlob(item);
          if (ac.signal.aborted) return;
          const images = (await Promise.all(imagePromises)).filter(
            (v): v is { item: Item; file: File } => Boolean(v),
          );
          const ext = getModelExtLower(item.file.fileName);
          let companionFiles: File[] = [];
          if ((ext === ".ply" || ext === ".obj") && images.length > 0) {
            const preferred =
              ext === ".ply"
                ? peekPlyHeaderInfo(await blob.arrayBuffer()).textureFileName
                : null;
            const textureName = resolveCompanionTextureFileName(
              item.file.fileName,
              preferred,
              images.map((v) => v.item.file.fileName),
            );
            companionFiles = images
              .filter((v) => v.item.file.fileName === textureName)
              .map((v) => v.file);
          }
          if (ac.signal.aborted) return;
          setModelFiles((prev) => ({
            ...prev,
            [item.key]: {
              file: fileFromModelBlob(blob, item.file.fileName),
              companionFiles,
            },
          }));
          setLoads((prev) => ({ ...prev, [item.key]: { status: "ready" } }));
        } catch (error) {
          fail(item.key, error);
        }
      })();
    }
    return () => {
      ac.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
    // items는 itemsKey가 같으면 같은 파일이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authToken, itemsKey]);

  const layers = useMemo<CaseLayerModel[]>(() => {
    const out: CaseLayerModel[] = [];
    for (const m of models) {
      const loaded = modelFiles[m.key];
      if (!loaded) continue;
      out.push({
        id: m.key,
        file: loaded.file,
        companionFiles: loaded.companionFiles,
        tone: "scan",
        visible: !hidden[m.key],
      });
    }
    return out;
  }, [hidden, modelFiles, models]);

  const pending = items.filter((i) => loads[i.key]?.status === "loading");
  const progress =
    pending.length > 0
      ? pending.reduce((sum, i) => {
          const state = loads[i.key];
          return sum + (state?.status === "loading" ? state.progress : 0);
        }, 0) / pending.length
      : 100;
  const showingImage = Boolean(shownImageKey && imageUrls[shownImageKey]);
  const canAnnotate = showingImage
    ? true
    : layers.some((layer) => layer.visible);
  const shownImage = items.find((i) => i.key === shownImageKey) || null;

  const setModelsShown = (keys: string[], on: boolean) => {
    setShownImageKey(null);
    setHidden((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = !on;
      return next;
    });
  };
  const anyModelShown = models.some((m) => !hidden[m.key]);

  const selectItem = (item: Item) => {
    if (item.kind === "image") {
      setShownImageKey((cur) => (cur === item.key ? null : item.key));
      return;
    }
    setShownImageKey(null);
    setHidden((prev) => ({ ...prev, [item.key]: false }));
  };

  const renderDownloadControl = () => {
    if (!onDownload || items.length === 0) return null;
    const label = downloadBusy ? "다운로드 중..." : "다운로드";
    const trigger = (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(PREVIEW_HEADER_BUTTON_CLASS, "h-7 px-2 text-xs")}
        disabled={downloadBusy}
        aria-label={label}
        onClick={
          items.length === 1
            ? () => void onDownload([items[0].file])
            : undefined
        }
      >
        <Download />
        <span className="hidden sm:inline">{label}</span>
        {items.length > 1 ? <ChevronDown className="opacity-70" /> : null}
      </Button>
    );
    if (items.length === 1) return trigger;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-[460]">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.key}
              onClick={() => void onDownload([item.file])}
            >
              <span className="max-w-[16rem] truncate">
                {item.file.fileName}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void onDownload(items.map((item) => item.file))}
          >
            전체 ({items.length}개)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[450] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 outline-none focus:outline-none focus-visible:outline-none sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:gap-0 sm:rounded-none sm:p-0"
        overlayClassName="z-[445]"
        closeClassName="right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background opacity-100 shadow-md hover:bg-foreground/85 focus:ring-0 focus:ring-offset-0"
        closeIconClassName="h-5 w-5 stroke-[2.5]"
        onInteractOutside={keepOpenOnToastInteract}
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-[55dvh] min-w-0 flex-1 flex-col md:min-h-0">
            <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/50">
              {open ? (
                <CaseLayerViewer
                  ref={viewerRef}
                  layers={layers}
                  colorMapping={colorMapping}
                  onPaintSpace={setPaintSpace}
                />
              ) : null}
              {showingImage && shownImageKey ? (
                <div className="absolute inset-0 z-10 bg-muted">
                  <ZoomableImagePreview
                    ref={imageRef}
                    src={imageUrls[shownImageKey]}
                    alt={shownImage?.file.fileName || "사진"}
                    fill
                  />
                </div>
              ) : null}
              <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
                <PreviewColorMappingToggle
                  checked={colorMapping}
                  onCheckedChange={setColorMapping}
                  disabled={showingImage || layers.length === 0}
                  className="static"
                />
                <PreviewPaintControls
                  paint={paint}
                  disabled={!canAnnotate}
                  className="bg-white/95 text-xs shadow-sm"
                />
              </div>
              {pending.length > 0 ? (
                <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-56 -translate-x-1/2 rounded-md bg-black/55 px-3 py-2 text-xs text-white">
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    파일 {pending.length}개 불러오는 중
                  </p>
                  <Progress value={progress} className="mt-1.5 h-1" />
                </div>
              ) : null}
              {canAnnotate ? (
                <PreviewPaintLayer
                  paint={paint}
                  surfaceKey={showingImage ? shownImageKey || "" : itemsKey}
                  captureCanvas={() =>
                    showingImage
                      ? (imageRef.current?.captureCanvas() ?? null)
                      : (viewerRef.current?.captureCanvas() ?? null)
                  }
                  fileName={shownImage?.file.fileName || title}
                  space={showingImage ? null : paintSpace}
                  onAttachChatFile={onAttachChatFile}
                  onRemoveChatFile={onRemoveChatFile}
                  onReorderChatFiles={onReorderChatFiles}
                />
              ) : null}
              {!showingImage ? (
                <div className={VIEW_GESTURE_HINT_LAYER_CLASS}>
                  <ViewGestureHint />
                </div>
              ) : null}
              {!showingImage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute bottom-4 left-4 z-20 h-8 gap-1.5 bg-white/95 px-2.5 text-xs shadow-sm"
                  onClick={() => viewerRef.current?.fitToView()}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  뷰리셋
                </Button>
              ) : null}
              <AbutsLogo
                variant="light"
                className="pointer-events-none absolute bottom-4 right-4 z-10 opacity-80"
                iconClassName="h-7 w-7"
                wordmarkClassName="text-base"
              />
            </div>

            <div
              className="shrink-0 border-t bg-card px-3 py-2"
              aria-label="의뢰 파일 갤러리"
            >
              <ul className="flex gap-2 overflow-x-auto px-1.5 py-1.5">
                {items.map((item) => {
                  const state = loads[item.key];
                  const active =
                    item.kind === "image"
                      ? shownImageKey === item.key
                      : !showingImage && !hidden[item.key];
                  const url = imageUrls[item.key];
                  return (
                    <li key={item.key} className="shrink-0">
                      <button
                        type="button"
                        className={cn(
                          "relative flex h-16 w-20 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border bg-muted/60 text-muted-foreground transition-shadow hover:shadow-md",
                          active && "border-primary ring-2 ring-primary/50",
                        )}
                        title={item.file.fileName}
                        onClick={() => selectItem(item)}
                      >
                        {item.kind === "image" && url ? (
                          <img
                            src={url}
                            alt={item.file.fileName}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : state?.status === "loading" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : item.kind === "image" ? (
                          <ImageIcon className="h-5 w-5" />
                        ) : (
                          <Box className="h-5 w-5" />
                        )}
                        <span
                          className={cn(
                            "relative text-[0.6875rem] font-medium",
                            item.kind === "image" && url
                              ? "absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-white"
                              : "",
                          )}
                        >
                          {item.roleLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <aside
            className="relative flex max-h-[45dvh] w-full shrink-0 flex-col border-t bg-card md:max-h-none md:w-[var(--panel-w)] md:border-l md:border-t-0"
            style={panel.style}
          >
            <ResizablePanelHandle panel={panel} />
            <DialogHeader className="space-y-0 border-b bg-muted/50 py-3 pl-4 pr-4 text-left sm:pl-4 sm:pr-4">
              <DialogTitle className="flex min-h-10 items-center pr-12 text-left text-sm font-semibold">
                {title}
              </DialogTitle>
              {caseInfo ? (
                <div className="mt-0.5 min-w-0 [&_*]:!max-w-full [&_*]:!flex-wrap [&_*]:!overflow-visible [&_*]:!text-clip [&_*]:!whitespace-normal">
                  {caseInfo}
                </div>
              ) : null}
              <DialogDescription className="sr-only">
                의뢰 파일의 3D 스캔을 같은 좌표로 겹쳐 보고, 사진은 아래
                갤러리에서 엽니다.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  파일
                </p>
                {renderDownloadControl()}
              </div>
              <EyeToggle
                on={anyModelShown && !showingImage}
                label={anyModelShown ? "3D 모두 숨기기" : "3D 모두 보기"}
                disabled={models.length === 0}
                onClick={() =>
                  setModelsShown(
                    models.map((m) => m.key),
                    !anyModelShown || showingImage,
                  )
                }
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="flex flex-col items-start gap-1">
                <p className="px-1 text-xs font-semibold text-muted-foreground">
                  의뢰 파일
                </p>
                <ul className="flex w-[92%] flex-col divide-y rounded-2xl rounded-tl-sm border bg-muted/60 px-3 py-0.5">
                  {items.map((item) => {
                    const state = loads[item.key];
                    const on =
                      item.kind === "image"
                        ? shownImageKey === item.key
                        : !hidden[item.key];
                    return (
                      <li
                        key={item.key}
                        className="flex items-center gap-2 py-1.5"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => selectItem(item)}
                        >
                          <p
                            className="truncate text-[0.8125rem]"
                            title={item.file.fileName}
                          >
                            {item.file.fileName}
                          </p>
                          {state?.status === "error" ? (
                            <p
                              className="truncate text-xs text-destructive"
                              title={state.message}
                            >
                              {state.message}
                            </p>
                          ) : item.file.uploadedAt ? (
                            <p className="text-xs text-muted-foreground">
                              {formatKstDateTimeToKo(item.file.uploadedAt)}
                            </p>
                          ) : null}
                        </button>
                        {state?.status === "loading" ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {Math.round(state.progress)}%
                          </span>
                        ) : (
                          <span className="shrink-0 whitespace-nowrap rounded bg-white/80 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary-strong">
                            {item.roleLabel}
                          </span>
                        )}
                        <EyeToggle
                          on={on && !(item.kind === "model" && showingImage)}
                          label={on ? "숨기기" : "보기"}
                          disabled={state?.status !== "ready"}
                          onClick={() => {
                            if (item.kind === "image") {
                              selectItem(item);
                              return;
                            }
                            if (showingImage) {
                              setShownImageKey(null);
                              setHidden((prev) => ({
                                ...prev,
                                [item.key]: false,
                              }));
                              return;
                            }
                            setModelsShown([item.key], !on);
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
