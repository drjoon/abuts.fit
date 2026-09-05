// change-log:
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
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { ZoomableImagePreview } from "@/shared/components/ZoomableImagePreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";

export type ModelPreviewKind = "model" | "image";

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
  onDownload?: () => void | Promise<void>;
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
}: ModelPreviewDialogProps) {
  const isImage = kind === "image";
  const title =
    String(fileName || "").trim() || (isImage ? "이미지 미리보기" : "3D 미리보기");
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const showNav = previewCount > 1 && previewIndex >= 0;
  const indexLabel = showNav ? `${previewIndex + 1} / ${previewCount}` : "";
  const confirmText = String(confirmMessage || "").trim();
  const confirmCta = String(confirmLabel || "").trim();
  const showConfirm = Boolean(onConfirm && confirmCta);
  const showFooter = !isImage || showConfirm;

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

  const downloadOverlay =
    onDownload && !loading ? (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="absolute right-3 top-3 z-20 h-9 shadow-md"
        onClick={() => void onDownload()}
        disabled={downloadBusy || !fileName}
      >
        <Download className="mr-1.5 h-4 w-4" />
        {downloadBusy ? "다운로드 중..." : "다운로드"}
      </Button>
    ) : null;

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
          "z-[450] flex flex-col gap-0 overflow-hidden p-0",
          RESPONSIVE.dialogContentFull,
          "sm:max-w-[min(96vw,56rem)]",
        )}
        overlayClassName="z-[445]"
      >
        <DialogHeader className="shrink-0 space-y-0 border-b bg-muted/50 px-4 py-3 pr-12 sm:px-5">
          <DialogTitle className="truncate text-sm font-medium sm:text-base">
            {title}
            {indexLabel ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground sm:text-sm">
                {indexLabel}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isImage ? "이미지 미리보기" : "3D 모델 미리보기"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-3 sm:px-5 sm:py-4">
          <div className="relative h-[min(70vh,560px)] w-full overflow-hidden rounded-xl border bg-muted/50">
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
                {downloadOverlay}
                {imageUrl && !loading ? (
                  <ZoomableImagePreview src={imageUrl} alt={title} fill />
                ) : !loading ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    미리볼 이미지가 없습니다.
                  </div>
                ) : null}
              </>
            ) : file && !loading ? (
              <StlPreviewViewer
                file={file}
                textureFile={textureFile}
                companionFiles={companionFiles}
                showOverlay={false}
                showGrid={false}
                className="absolute inset-0 h-full min-h-0 w-full"
              />
            ) : !loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                미리볼 파일이 없습니다.
              </div>
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
          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-4 py-3 sm:justify-between sm:px-5">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={confirmBusy}
              onClick={() => onOpenChange(false)}
            >
              닫기
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onDownload ? (
                <Button
                  type="button"
                  variant={showConfirm ? "outline" : "default"}
                  className="h-9"
                  onClick={() => void onDownload()}
                  disabled={downloadBusy || loading || confirmBusy || !fileName}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {downloadBusy ? "다운로드 중..." : "다운로드"}
                </Button>
              ) : null}
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
