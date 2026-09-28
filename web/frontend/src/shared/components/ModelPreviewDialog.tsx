// change-log:
// - 2026-09-28: 다운로드를 헤더 채팅 첨부 오른쪽으로 옮김.
// - 2026-09-28: 이미지 저장 버튼 제거. 다운로드와 겹친다.
// - 2026-09-28: 헤더 버튼 순서 페인트·이미지 저장·채팅 첨부. 페인트 오른쪽 여백. 하단 닫기 제거.
// - 2026-09-28: 프리뷰 대화상자를 뷰포트(96vw·94dvh)에 맞춤. 1280px·100rem 상한 제거.
// - 2026-09-27: 이미지·3D 프리뷰 헤더에 이미지 저장·페인트·채팅 첨부. 가로·세로를 키움.
// - 2026-09-26: 페인트로 표시한 뒤 채팅에 첨부.
// - 2026-09-23: 3D 프리뷰 — 다운로드 옆 「이미지 저장」(현재 뷰 PNG).
// - 2026-09-10: DCM 다운로드 시 원본/PLY(칼라) 선택 메뉴.
// - 2026-09-05: z-[450]/overlay z-[445] — 가이드투어 코치(z-440)·플로팅 상세 위.
// - 2026-08-31: 이미지 줌/팬 — ZoomableImagePreview 공통 컴포넌트 사용(중앙 기준 줌).
// - 2026-08-31: 이미지 프리뷰 확대/축소(휠·버튼) + 드래그 이동.
// - 2026-08-28: PLY/OBJ 칼라 텍스처(TextureFile·동반 이미지) 프리뷰 전달.
// - 2026-08-28: z-[320]/overlay z-[310] — 플로팅 의뢰상세(z-300) 위에 프리뷰.
// - 2026-08-21: 선택 컨펌 안내·CTA(치과 어벗 디자인 컨펌 등). 이미지도 컨펌 시 푸터 표시.
// - 2026-08-16: 채팅 위젯 톤 — rounded-xl·muted/50 헤더·h-9 푸터.
// - 2026-08-16: 파일 여러 개일 때 이전/다음 버튼·인덱스 표시.
// - 2026-08-16: 3D 프리뷰 영역 고정 높이 + absolute fill로 모델 가운데 정렬.
// - 2026-08-16: 이미지 미리보기 + 다운로드 오버레이. 3D는 기존 푸터 다운로드.
// - 2026-08-16: 기공의뢰 3D 메쉬 미리보기(저장 없이 뷰어 + 다운로드).
// related files:
// - web/frontend/src/shared/components/ZoomableImagePreview.tsx
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/files/dcmDownloadFormat.ts
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Paperclip,
  Pencil,
} from "lucide-react";
import {
  StlPreviewViewer,
  type StlPreviewViewerHandle,
} from "@/features/requests/components/StlPreviewViewer";
import {
  ZoomableImagePreview,
  type ZoomableImagePreviewHandle,
} from "@/shared/components/ZoomableImagePreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";
import {
  DCM_DOWNLOAD_FORMAT_OPTIONS,
  isDcmFileName,
  type DcmDownloadFormat,
} from "@/shared/files/dcmDownloadFormat";
import { useToast } from "@/shared/hooks/use-toast";
import {
  VIEW_PAINT_COLORS,
  ViewPaintSurface,
  paintNoteFileName,
  viewPaintColorLabel,
  type ViewPaintHandle,
} from "@/shared/components/practice/ViewPaintSurface";

export type ModelPreviewKind = "model" | "image";

export type ModelPreviewDownloadOptions = {
  dcmFormat?: DcmDownloadFormat;
};

export type ModelPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  kind?: ModelPreviewKind;
  file: File | null;
  /** PLY/OBJ 칼라 텍스처(동반 JPG/PNG) */
  textureFile?: File | null;
  companionFiles?: File[] | null;
  loading?: boolean;
  progress?: number;
  onDownload?: (opts?: ModelPreviewDownloadOptions) => void | Promise<void>;
  downloadBusy?: boolean;
  /** 0-based. 없으면 네비 숨김 */
  previewIndex?: number;
  previewCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /** 프리뷰 하단 컨펌 안내(치과 디자인 컨펌 등) */
  confirmMessage?: string;
  confirmLabel?: string;
  confirmBusy?: boolean;
  onConfirm?: () => void | Promise<void>;
  /** 표시가 입혀진 현재 뷰를 채팅 첨부로 넘긴다. */
  onAttachChatFile?: (file: File) => void;
};

export function ModelPreviewDialog({
  open,
  onOpenChange,
  fileName,
  kind = "model",
  file,
  textureFile = null,
  companionFiles = null,
  loading = false,
  progress = 0,
  onDownload,
  downloadBusy = false,
  previewIndex = -1,
  previewCount = 0,
  onPrev,
  onNext,
  confirmMessage,
  confirmLabel,
  confirmBusy = false,
  onConfirm,
  onAttachChatFile,
}: ModelPreviewDialogProps) {
  const { toast } = useToast();
  const isImage = kind === "image";
  const isDcm = isDcmFileName(fileName);
  const title =
    String(fileName || "").trim() || (isImage ? "이미지 미리보기" : "3D 미리보기");
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const viewerRef = useRef<StlPreviewViewerHandle | null>(null);
  const imageRef = useRef<ZoomableImagePreviewHandle | null>(null);
  const paintRef = useRef<ViewPaintHandle | null>(null);
  const [paintOn, setPaintOn] = useState(false);
  const [paintColor, setPaintColor] = useState<string>(VIEW_PAINT_COLORS[0]);
  const [paintInk, setPaintInk] = useState(false);
  const canAnnotate = (isImage ? Boolean(imageUrl) : Boolean(file)) && !loading;
  const canAttachPaint = Boolean(onAttachChatFile) && canAnnotate && paintInk;
  const showNav = previewCount > 1 && previewIndex >= 0;
  const indexLabel = showNav ? `${previewIndex + 1} / ${previewCount}` : "";
  const confirmText = String(confirmMessage || "").trim();
  const confirmCta = String(confirmLabel || "").trim();
  const showConfirm = Boolean(onConfirm && confirmCta);
  const showFooter = showConfirm;

  const captureViewCanvas = () =>
    isImage
      ? imageRef.current?.captureCanvas() ?? null
      : viewerRef.current?.captureCanvas() ?? null;

  const attachPaintToChat = async () => {
    const base = captureViewCanvas();
    const blob = base ? await paintRef.current?.compositePng(base) : null;
    if (!blob || !onAttachChatFile) return;
    onAttachChatFile(
      new File([blob], paintNoteFileName(fileName), { type: "image/png" }),
    );
    toast({
      title: "채팅에 첨부했습니다.",
      description: (
        <>
          표시가 입혀진 이미지가 대화 입력에 있습니다.
          <br />
          미리보기를 닫고 보내기를 누르면 상대에게 전달됩니다.
        </>
      ),
    });
    onOpenChange(false);
  };

  useEffect(() => {
    if (open) return;
    setPaintOn(false);
    setPaintInk(false);
    paintRef.current?.clear();
  }, [open]);

  useEffect(() => {
    setPaintOn(false);
    setPaintInk(false);
  }, [fileName]);

  const renderDownloadControl = (opts?: {
    className?: string;
    variant?: "default" | "secondary" | "outline";
  }) => {
    if (!onDownload) return null;
    const disabled = downloadBusy || loading || confirmBusy || !fileName;
    const label = downloadBusy ? "다운로드 중..." : "다운로드";
    const className = cn(
      "h-8 gap-1 px-2.5 [&_svg]:!size-3.5",
      opts?.className,
    );
    const variant = opts?.variant || "outline";

    if (!isDcm) {
      return (
        <Button
          type="button"
          size="sm"
          variant={variant}
          className={className}
          onClick={() => void onDownload()}
          disabled={disabled}
          aria-label={label}
        >
          <Download />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={variant}
            className={className}
            disabled={disabled}
            aria-label={label}
          >
            <Download />
            <span className="hidden sm:inline">{label}</span>
            <ChevronDown className="opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[460]">
          {DCM_DOWNLOAD_FORMAT_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => void onDownload({ dcmFormat: opt.value })}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  useEffect(() => {
    if (!isImage || !file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, isImage]);

  useEffect(() => {
    if (!open || !showNav) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (loading || confirmBusy) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrev?.();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmBusy, loading, onNext, onPrev, open, showNav]);

  const navButtons = showNav ? (
    <>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute left-3 top-1/2 z-20 h-10 w-10 -translate-y-1/2 shadow-md"
        onClick={() => onPrev?.()}
        disabled={loading || confirmBusy || !onPrev}
        aria-label="이전 파일"
        title="이전 파일"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute right-3 top-1/2 z-20 h-10 w-10 -translate-y-1/2 shadow-md"
        onClick={() => onNext?.()}
        disabled={loading || confirmBusy || !onNext}
        aria-label="다음 파일"
        title="다음 파일"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white shadow-sm">
        {indexLabel}
      </div>
    </>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Above floating transfer (z-300/410) and guide-tour coach (z-440).
        className={cn(
          "z-[450] flex h-[94dvh] max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[94dvh] sm:max-h-[94dvh] sm:gap-0 sm:p-0",
          RESPONSIVE.dialogContentFull,
        )}
        overlayClassName="z-[445]"
      >
        <DialogHeader className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b bg-muted/50 py-2 pl-4 pr-14 text-left sm:pl-5 sm:pr-14">
          <DialogTitle className="min-w-0 flex-1 truncate text-left text-sm font-medium sm:text-base">
            {title}
            {indexLabel ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground sm:text-sm">
                {indexLabel}
              </span>
            ) : null}
          </DialogTitle>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <div className="mr-3 flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={paintOn ? "default" : "outline"}
                className="h-8 gap-1 px-2.5 [&_svg]:!size-3.5"
                disabled={!canAnnotate || confirmBusy}
                aria-pressed={paintOn}
                aria-label="페인트"
                onClick={() => setPaintOn((on) => !on)}
                title="화면 위에 표시를 그립니다"
              >
                <Pencil />
                <span className="hidden sm:inline">페인트</span>
              </Button>
              {paintOn
                ? VIEW_PAINT_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={cn(
                        "h-5 w-5 rounded-full border border-black/10",
                        paintColor === swatch && "ring-2 ring-primary ring-offset-1",
                      )}
                      style={{ backgroundColor: swatch }}
                      aria-label={viewPaintColorLabel(swatch)}
                      onClick={() => setPaintColor(swatch)}
                    />
                  ))
                : null}
              {paintOn && paintInk ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 px-2.5 [&_svg]:!size-3.5"
                  title="표시 지우기"
                  aria-label="표시 지우기"
                  onClick={() => paintRef.current?.clear()}
                >
                  <Eraser />
                  <span className="hidden sm:inline">표시 지우기</span>
                </Button>
              ) : null}
            </div>
            {onAttachChatFile ? (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1 px-2.5 [&_svg]:!size-3.5"
                disabled={!canAttachPaint || confirmBusy}
                onClick={() => void attachPaintToChat()}
                title="표시가 입혀진 이미지를 채팅에 첨부합니다"
                aria-label="채팅 첨부"
              >
                <Paperclip />
                <span className="hidden sm:inline">채팅 첨부</span>
              </Button>
            ) : null}
            {renderDownloadControl()}
          </div>
          <DialogDescription className="sr-only">
            {isImage ? "이미지 미리보기" : "3D 모델 미리보기"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 px-3 py-3 sm:px-4">
          <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border bg-muted/50">
            {loading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 px-6">
                <p className="text-sm text-muted-foreground">
                  불러오는 중 {Math.round(pct)}%
                </p>
                <Progress value={pct} className="h-1.5 w-full max-w-xs" />
              </div>
            ) : null}

            {navButtons}

            {isImage ? (
              <>
                {imageUrl && !loading ? (
                  <ZoomableImagePreview
                    ref={imageRef}
                    src={imageUrl}
                    alt={title}
                    fill
                  />
                ) : !loading ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    미리볼 이미지가 없습니다.
                  </div>
                ) : null}
              </>
            ) : file && !loading ? (
              <>
                <StlPreviewViewer
                  ref={viewerRef}
                  file={file}
                  textureFile={textureFile}
                  companionFiles={companionFiles}
                  showOverlay={false}
                  showGrid={false}
                  className="absolute inset-0 h-full min-h-0 w-full"
                />
              </>
            ) : !loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                미리볼 파일이 없습니다.
              </div>
            ) : null}
            {canAnnotate ? (
              <ViewPaintSurface
                key={fileName}
                ref={paintRef}
                enabled={paintOn}
                color={paintColor}
                onInkChange={setPaintInk}
              />
            ) : null}
          </div>
        </div>

        {showConfirm && confirmText ? (
          <div className="shrink-0 border-t bg-primary-soft/40 px-4 py-3 sm:px-5">
            <p className="text-center text-sm leading-relaxed text-primary-strong">
              {confirmText}
            </p>
          </div>
        ) : null}

        {showFooter ? (
          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-4 py-3 sm:justify-end sm:px-5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {showConfirm ? (
                <Button
                  type="button"
                  className="h-9"
                  disabled={confirmBusy || loading}
                  onClick={() => void onConfirm?.()}
                >
                  {confirmBusy ? "처리 중..." : confirmCta}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
