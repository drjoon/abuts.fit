// change-log:
// - 2026-08-16: 3D 프리뷰 영역 고정 높이 + absolute fill로 모델 가운데 정렬.
// - 2026-08-16: 이미지 미리보기 + 다운로드 오버레이. 3D는 기존 푸터 다운로드.
// - 2026-08-16: 기공의뢰 3D 메쉬 미리보기(저장 없이 뷰어 + 다운로드).
// related files:
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
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
}: ModelPreviewDialogProps) {
  const isImage = kind === "image";
  const title =
    String(fileName || "").trim() || (isImage ? "이미지 미리보기" : "3D 미리보기");
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const [imageUrl, setImageUrl] = useState<string | null>(null);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[95vw] max-w-[56rem] flex-col gap-3 p-4 sm:p-5">
        <DialogHeader className="shrink-0 space-y-1 pr-8">
          <DialogTitle className="truncate text-base font-semibold">
            {title}
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
