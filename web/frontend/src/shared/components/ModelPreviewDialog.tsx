// change-log:
// - 2026-08-16: 파일 여러 개일 때 이전/다음 버튼·인덱스 표시.
// - 2026-08-16: 3D 프리뷰 영역 고정 높이 + absolute fill로 모델 가운데 정렬.
// - 2026-08-16: 이미지 미리보기 + 다운로드 오버레이. 3D는 기존 푸터 다운로드.
// - 2026-08-16: 기공의뢰 3D 메쉬 미리보기(저장 없이 뷰어 + 다운로드).
// related files:
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
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

export type ModelPreviewKind = "model" | "image";

export type ModelPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  kind?: ModelPreviewKind;
  file: File | null;
  loading?: boolean;
  progress?: number;
  onDownload?: () => void | Promise<void>;
  downloadBusy?: boolean;
  /** 0-based. 없으면 네비 숨김 */
  previewIndex?: number;
  previewCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
};

export function ModelPreviewDialog({
  open,
  onOpenChange,
  fileName,
  kind = "model",
  file,
  loading = false,
  progress = 0,
  onDownload,
  downloadBusy = false,
  previewIndex = -1,
  previewCount = 0,
  onPrev,
  onNext,
}: ModelPreviewDialogProps) {
  const isImage = kind === "image";
  const title =
    String(fileName || "").trim() || (isImage ? "이미지 미리보기" : "3D 미리보기");
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const showNav = previewCount > 1 && previewIndex >= 0;
  const indexLabel = showNav ? `${previewIndex + 1} / ${previewCount}` : "";

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
      if (loading) return;
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
  }, [loading, onNext, onPrev, open, showNav]);

  const downloadOverlay =
    onDownload && !loading ? (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="absolute right-3 top-3 z-20 shadow-md"
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
        disabled={loading || !onPrev}
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
        disabled={loading || !onNext}
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
      <DialogContent className="flex w-[95vw] max-w-[56rem] flex-col gap-3 p-4 sm:p-5">
        <DialogHeader className="shrink-0 space-y-1 pr-8">
          <DialogTitle className="truncate text-base font-semibold">
            {title}
            {indexLabel ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {indexLabel}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isImage ? "이미지 미리보기" : "3D 모델 미리보기"}
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[min(70vh,560px)] w-full overflow-hidden rounded-lg border bg-muted/20">
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 p-3">
                  <img
                    src={imageUrl}
                    alt={title}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : !loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  미리볼 이미지가 없습니다.
                </div>
              ) : null}
            </>
          ) : file && !loading ? (
            <StlPreviewViewer
              file={file}
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

        {!isImage ? (
          <DialogFooter className="shrink-0 gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              닫기
            </Button>
            {onDownload ? (
              <Button
                type="button"
                onClick={() => void onDownload()}
                disabled={downloadBusy || loading || !fileName}
              >
                {downloadBusy ? "다운로드 중..." : "다운로드"}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
