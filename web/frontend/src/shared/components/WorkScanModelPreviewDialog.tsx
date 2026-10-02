// 작업 스캔(상악·하악·바이트)을 한 모델로 연다. 파일 좌표 그대로 겹치고 악별로 켜고 끈다.
// change-log:
// - 2026-10-01: 페인트는 열 때 꺼 둔다. 날짜는 의뢰 업로드 날.
// - 2026-10-01: 헤더 날짜 팝오버. 기본은 가장 최근 날짜의 상악·하악.
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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
} from "lucide-react";

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
import {
  VIEW_GESTURE_HINT_LAYER_CLASS,
  ViewGestureHint,
} from "@/shared/components/ViewGestureHint";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  hiddenKeysForWorkScanDate,
  workScanDateGroups,
  workScanModelParts,
  type WorkScanModelFile,
} from "@/shared/practice/workScanModel";
import {
  CaseLayerViewer,
  type CaseLayerModel,
  type CaseLayerViewerHandle,
} from "@/shared/share/CaseLayerViewer";
import { cn } from "@/shared/ui/cn";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import { AbutsLogo } from "@/components/branding/AbutsLogo";

type LoadState =
  | { status: "loading"; progress: number }
  | { status: "ready"; file: File }
  | { status: "error"; message: string };

const PANEL_WIDTH_KEY = "abuts.workScanPanelWidth.v1";
const PANEL_DEFAULT_REM = 22;
const PANEL_MIN_REM = 16;
const PANEL_MAX_REM = 44;

function ScanEyeToggle({
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
  const dateGroups = useMemo(() => workScanDateGroups(parts), [parts]);
  const partsKey = parts.map((part) => part.key).join("|");
  const viewerRef = useRef<CaseLayerViewerHandle | null>(null);
  const [loads, setLoads] = useState<Record<string, LoadState>>({});
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean> | null>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [colorMapping, setColorMapping] = useState(true);
  const paint = usePreviewPaint({
    open,
    resetKey: partsKey,
    initiallyOn: false,
  });
  const [paintSpace, setPaintSpace] = useState<ViewPaintSpace | null>(null);
  const [panelRem, setPanelRem] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
      return Number.isFinite(saved) && saved > 0
        ? Math.min(PANEL_MAX_REM, Math.max(PANEL_MIN_REM, saved))
        : PANEL_DEFAULT_REM;
    } catch {
      return PANEL_DEFAULT_REM;
    }
  });
  const savePanelRem = (rem: number) => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(rem));
    } catch {
      /* 저장이 막혀도 이번 화면에서는 유지한다. */
    }
  };
  const clampRem = (rem: number) =>
    Math.min(PANEL_MAX_REM, Math.max(PANEL_MIN_REM, rem));
  const heading = title || "작업 모델";
  const activeDateKey =
    dateKey && dateGroups.some((group) => group.key === dateKey)
      ? dateKey
      : (dateGroups[0]?.key ?? "");
  const activeGroup =
    dateGroups.find((group) => group.key === activeDateKey) ?? null;
  const activeParts = activeGroup?.parts ?? [];
  const defaultHidden = useMemo(
    () => hiddenKeysForWorkScanDate(parts, activeDateKey),
    [activeDateKey, parts],
  );
  const hiddenMap = hidden ?? defaultHidden;

  const setPartsShown = (keys: string[], on: boolean) =>
    setHidden((prev) => {
      const base = prev ?? hiddenKeysForWorkScanDate(parts, activeDateKey);
      const next = { ...base };
      for (const key of keys) next[key] = !on;
      return next;
    });

  const selectDate = (next: string) => {
    setDateKey(next);
    setHidden(hiddenKeysForWorkScanDate(parts, next));
    setDateMenuOpen(false);
  };

  useEffect(() => {
    if (!open || !authToken) return;
    const ac = new AbortController();
    setColorMapping(true);
    setDateKey(null);
    setHidden(null);
    setDateMenuOpen(false);
    setLoads(
      Object.fromEntries(
        parts.map((part) => [part.key, { status: "loading", progress: 0 }]),
      ),
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
          setLoads((prev) => ({
            ...prev,
            [part.key]: { status: "ready", file },
          }));
        })
        .catch((error) => {
          if (ac.signal.aborted) return;
          setLoads((prev) => ({
            ...prev,
            [part.key]: {
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "파일을 불러오지 못했습니다.",
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
      out.push({
        id: part.key,
        file: state.file,
        tone: "scan",
        visible: !hiddenMap[part.key],
      });
    }
    return out;
  }, [hiddenMap, loads, parts]);

  const loading = parts.filter((part) => loads[part.key]?.status === "loading");
  const progress =
    loading.length > 0
      ? loading.reduce((sum, part) => {
          const state = loads[part.key];
          return sum + (state?.status === "loading" ? state.progress : 0);
        }, 0) / loading.length
      : 100;
  const canAnnotate = layers.length > 0;

  const renderDownloadControl = (compact = false) => {
    if (!onDownload || parts.length === 0) return null;
    const label = downloadBusy ? "다운로드 중..." : "다운로드";
    const trigger = (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          PREVIEW_HEADER_BUTTON_CLASS,
          compact && "h-7 px-2 text-xs",
        )}
        disabled={downloadBusy}
        aria-label={label}
        onClick={
          parts.length === 1
            ? () => void onDownload([parts[0].file])
            : undefined
        }
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
            <DropdownMenuItem
              key={part.key}
              onClick={() => void onDownload([part.file])}
            >
              <span className="font-medium">
                {dateGroups.length > 1
                  ? `${part.dateLabel} ${part.label}`
                  : part.label}
              </span>
              <span className="ml-2 max-w-[14rem] truncate text-xs text-muted-foreground">
                {part.file.fileName}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void onDownload(parts.map((part) => part.file))}
          >
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
          "z-[450] outline-none focus:outline-none focus-visible:outline-none flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:gap-0 sm:rounded-none sm:p-0 md:flex-row",
        )}
        overlayClassName="z-[445]"
        closeClassName="right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background opacity-100 shadow-md hover:bg-foreground/85 focus:ring-0 focus:ring-offset-0"
        closeIconClassName="h-5 w-5 stroke-[2.5]"
        onInteractOutside={(event) => {
          keepOpenOnToastInteract(event);
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("[data-work-scan-date]")
          ) {
            event.preventDefault();
          }
        }}
      >
        <div className="relative min-h-[55dvh] min-w-0 flex-1 md:min-h-0">
          {open ? (
            <CaseLayerViewer
              ref={viewerRef}
              layers={layers}
              colorMapping={colorMapping}
              onPaintSpace={setPaintSpace}
            />
          ) : null}
          <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
            {layers.length > 0 ? (
              <PreviewColorMappingToggle
                checked={colorMapping}
                onCheckedChange={setColorMapping}
                className="static"
              />
            ) : null}
            <PreviewPaintControls
              paint={paint}
              disabled={!canAnnotate}
              className="bg-white/95 text-xs shadow-sm"
            />
          </div>
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
              space={paintSpace}
              onAttachChatFile={onAttachChatFile}
              onRemoveChatFile={onRemoveChatFile}
              onReorderChatFiles={onReorderChatFiles}
            />
          ) : null}
          <div className={VIEW_GESTURE_HINT_LAYER_CLASS}>
            <ViewGestureHint />
          </div>
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
          <AbutsLogo
            variant="light"
            className="pointer-events-none absolute bottom-4 right-4 z-10 opacity-80"
            iconClassName="h-7 w-7"
            wordmarkClassName="text-base"
          />
        </div>
        <aside
          className="relative flex max-h-[45dvh] w-full shrink-0 flex-col border-t bg-card md:max-h-none md:w-[var(--scan-panel-w)] md:border-l md:border-t-0"
          style={{ "--scan-panel-w": `${panelRem}rem` } as CSSProperties}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="패널 가로폭 조절"
            aria-valuemin={PANEL_MIN_REM}
            aria-valuemax={PANEL_MAX_REM}
            aria-valuenow={Math.round(panelRem)}
            tabIndex={0}
            title="드래그해서 패널 폭 조절"
            className="absolute -left-1 top-0 z-30 hidden h-full w-2 cursor-col-resize touch-none items-center justify-center hover:bg-primary/20 active:bg-primary/30 md:flex"
            onPointerDown={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              target.setPointerCapture(event.pointerId);
              const remPx =
                parseFloat(
                  getComputedStyle(document.documentElement).fontSize,
                ) || 16;
              let latest = panelRem;
              const move = (e: PointerEvent) => {
                latest = clampRem((window.innerWidth - e.clientX) / remPx);
                setPanelRem(latest);
              };
              const up = () => {
                target.removeEventListener("pointermove", move);
                target.removeEventListener("pointerup", up);
                target.removeEventListener("pointercancel", up);
                savePanelRem(latest);
              };
              target.addEventListener("pointermove", move);
              target.addEventListener("pointerup", up);
              target.addEventListener("pointercancel", up);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
              event.preventDefault();
              const next = clampRem(
                panelRem + (event.key === "ArrowLeft" ? 1 : -1),
              );
              setPanelRem(next);
              savePanelRem(next);
            }}
          >
            <span className="h-8 w-0.5 rounded-full bg-border" />
          </div>
          <DialogHeader className="space-y-0 border-b bg-muted/50 py-3 pl-4 pr-4 text-left sm:pl-4 sm:pr-4">
            <DialogTitle className="flex min-h-10 items-center pr-12 text-left text-sm font-semibold">
              {heading}
            </DialogTitle>
            {caseInfo ? (
              <div className="mt-0.5 min-w-0 [&_*]:!max-w-full [&_*]:!flex-wrap [&_*]:!overflow-visible [&_*]:!text-clip [&_*]:!whitespace-normal">
                {caseInfo}
              </div>
            ) : null}
            <DialogDescription className="sr-only">
              상악·하악·바이트 작업 스캔을 같은 좌표로 겹쳐 봅니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-muted-foreground">
                파일
              </p>
              {renderDownloadControl(true)}
            </div>
            <ScanEyeToggle
              on={activeParts.some((part) => !hiddenMap[part.key])}
              label={
                activeParts.some((part) => !hiddenMap[part.key])
                  ? "모두 숨기기"
                  : "모두 보기"
              }
              disabled={activeParts.length === 0}
              onClick={() =>
                setPartsShown(
                  activeParts.map((part) => part.key),
                  !activeParts.some((part) => !hiddenMap[part.key]),
                )
              }
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
            {dateGroups.map((group) => {
              const isActive = group.key === activeDateKey;
              const keys = group.parts.map((part) => part.key);
              const groupOn = isActive && keys.some((key) => !hiddenMap[key]);
              return (
                <section
                  key={group.key || "none"}
                  className={cn(
                    "mb-1 rounded-lg border last:mb-0",
                    isActive
                      ? "border-primary/40 bg-primary-soft/40"
                      : "border-transparent",
                  )}
                >
                  <div className="flex items-center gap-1 px-1 py-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-muted/60"
                      onClick={() => {
                        if (!isActive) selectDate(group.key);
                      }}
                    >
                      <span className="min-w-0 truncate">
                        {group.label || "날짜 없음"}
                      </span>
                      <span className="ml-auto shrink-0 text-[0.6875rem] font-normal text-muted-foreground">
                        {group.parts.length}개
                      </span>
                    </button>
                    <ScanEyeToggle
                      on={groupOn}
                      label={
                        groupOn
                          ? `${group.label} 숨기기`
                          : `${group.label} 보기`
                      }
                      onClick={() => {
                        if (!isActive) {
                          selectDate(group.key);
                          return;
                        }
                        setPartsShown(keys, !groupOn);
                      }}
                    />
                  </div>
                  {isActive ? (
                    <div className="flex flex-col gap-1 px-2 pb-2">
                      <div className="flex w-full items-center justify-between gap-2 pl-1">
                        <p className="text-xs font-semibold text-muted-foreground">
                          작업 파일
                        </p>
                      </div>
                      <ul className="flex w-full flex-col divide-y divide-primary/15 rounded-2xl rounded-tr-sm border border-primary/30 bg-primary-soft px-3 py-0.5">
                        {group.parts.map((part) => {
                          const state = loads[part.key];
                          const shown = !hiddenMap[part.key];
                          return (
                            <li
                              key={part.key}
                              className="flex items-center gap-2 py-1.5"
                            >
                              <div className="min-w-0 flex-1">
                                <p
                                  className="truncate text-[0.8125rem]"
                                  title={part.file.fileName}
                                >
                                  {part.file.fileName}
                                </p>
                                {state?.status === "error" ? (
                                  <p
                                    className="truncate text-xs text-destructive"
                                    title={state.message}
                                  >
                                    {state.message}
                                  </p>
                                ) : part.file.uploadedAt ? (
                                  <p className="text-xs text-muted-foreground">
                                    {formatKstDateTimeToKo(
                                      part.file.uploadedAt,
                                    )}
                                  </p>
                                ) : null}
                              </div>
                              {state?.status === "loading" ? (
                                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  {Math.round(state.progress)}%
                                </span>
                              ) : (
                                <span className="shrink-0 whitespace-nowrap rounded bg-white/80 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary-strong">
                                  {part.label}
                                </span>
                              )}
                              <ScanEyeToggle
                                on={shown}
                                label={shown ? "숨기기" : "보기"}
                                disabled={state?.status !== "ready"}
                                onClick={() =>
                                  setPartsShown([part.key], !shown)
                                }
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
