import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PracticeTransferFileDropTarget,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import { PRACTICE_ACCEPTED_HINT } from "@/shared/practice/practiceTransferAccept";
import { cn } from "@/shared/ui/cn";
import type { PreUploadFileStatus } from "@/shared/hooks/useFilePreUpload";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferFileDropTarget.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/hooks/useFilePreUpload.ts
// - 2026-08-11: 드롭존·목록을 생산의뢰식 심플 스타일로. 확장자 안내는 즉시툴팁.
// - 2026-08-11: 첨부 목록 3열 그리드.
// - 2026-08-12: 클릭/요소드롭은 PracticeTransferFileDropTarget 공통 재사용.
// - 2026-08-13: 파일카드 하단 프로그레스바(사전 업로드 전송률).
// - 2026-08-17: 확장자 안내는 DropTarget 라벨 하단 상시 표기(클릭 경로 Tooltip 제거).
// - 2026-08-20: requirementNote를 모바일 쉐이드 포토 안내 등 soft tip으로 표시.
// - 2026-08-20: 쉐이드 안내 — 드롭존과 같은 폭·가운데 정렬, 카메라 아이콘.
// - 2026-08-20: 이미지 첨부는 카드에 썸네일 미리보기.
// - 2026-08-20: 썸네일 클릭 시 크게 보기. 파일명도 같은 미리보기.
// - 2026-08-20: fillHeight — 메모 옆 열에서 빈 드롭존 높이 맞춤.
// - 2026-08-26: requirementNoteExtra — TRIOS Communicate 한 줄.

export type PracticeTransferFileDisplayItem = {
  key: string;
  name: string;
  size: number;
  metaSuffix?: string;
  uploadPercent?: number;
  uploadStatus?: PreUploadFileStatus;
  /** 이미지면 blob/proxy object URL. STL 등은 생략. */
  previewUrl?: string | null;
};

/** 3열 카드 · 행높이 3.5rem × 3행 + gap 1.5 × 2 ≈ 11.25rem */
export const PRACTICE_FILE_LIST_VIEWPORT_CLASS =
  "h-[11.25rem] max-h-[11.25rem] min-h-[11.25rem]";

export type PracticeTransferFilePaneProps = {
  acceptedHint?: string;
  fileInputId: string;
  files: PracticeTransferFileDisplayItem[];
  totalSizeMb: string;
  onPickFiles: (files: File[]) => void;
  onRemoveFile: (key: string) => void;
  onClearAllFiles: () => void;
  listViewportClassName?: string;
  disabled?: boolean;
  /** 드롭존 아래 안내(예: 모바일 환자 사진) */
  requirementNote?: string | null;
  /** requirementNote 아래 보조 한 줄 */
  requirementNoteExtra?: string | null;
  /** 대기 중인 로컬 파일을 서버 임시저장으로 업로드 */
  syncUploadLabel?: string;
  syncUploadBusyLabel?: string;
  syncUploadDisabled?: boolean;
  syncUploadBusy?: boolean;
  syncUploadHint?: string;
  onSyncUpload?: () => void;
  /** 이미지 썸네일 클릭 시 크게 보기 */
  onPreviewFile?: (file: PracticeTransferFileDisplayItem) => void;
  className?: string;
  /** 메모 옆 2열 — 부모 높이에 맞춰 빈 드롭존을 늘림 */
  fillHeight?: boolean;
};

const formatAttachmentSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
};

const resolveFileMeta = (file: PracticeTransferFileDisplayItem): string => {
  if (file.uploadStatus === "uploading") {
    const pct = Math.max(0, Math.min(100, Math.round(file.uploadPercent ?? 0)));
    return `${pct}%`;
  }
  if (file.uploadStatus === "error") return "실패";
  if (file.uploadStatus === "done") {
    return file.metaSuffix && file.metaSuffix !== "대기"
      ? file.metaSuffix
      : "업로드됨";
  }
  return file.metaSuffix || "";
};

export const PracticeTransferFilePane = ({
  acceptedHint = PRACTICE_ACCEPTED_HINT,
  fileInputId,
  files,
  totalSizeMb,
  onPickFiles,
  onRemoveFile,
  onClearAllFiles,
  listViewportClassName = PRACTICE_FILE_LIST_VIEWPORT_CLASS,
  disabled = false,
  requirementNote = null,
  requirementNoteExtra = null,
  syncUploadLabel = "업로드",
  syncUploadBusyLabel = "업로드 중...",
  syncUploadDisabled = false,
  syncUploadBusy = false,
  syncUploadHint,
  onSyncUpload,
  onPreviewFile,
  className,
  fillHeight = false,
}: PracticeTransferFilePaneProps) => {
  const hasFiles = files.length > 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-2.5",
        fillHeight ? "h-full" : "shrink-0",
        className,
      )}
    >
      <PracticeTransferFileDropTarget
        fileInputId={fileInputId}
        onFiles={onPickFiles}
        disabled={disabled}
        acceptedHint={acceptedHint}
        compact={hasFiles}
        fillHeight={fillHeight && !hasFiles}
        label="클릭하거나 파일을 드래그해 추가"
      />

      {requirementNote || requirementNoteExtra ? (
        <div className="flex flex-col items-center gap-1 px-1 text-center">
          {requirementNote ? (
            <div className="flex items-center justify-center gap-1.5">
              <Camera
                className="h-3.5 w-3.5 shrink-0 text-primary-strong/80"
                aria-hidden
              />
              <p className="text-xs leading-snug text-muted-foreground">
                {requirementNote}
              </p>
            </div>
          ) : null}
          {requirementNoteExtra ? (
            <p className="text-[11px] leading-snug text-muted-foreground/90">
              {requirementNoteExtra}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasFiles ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {files.length}개 · {totalSizeMb}MB
            </p>
            <div className="flex items-center gap-1.5">
              {onSyncUpload ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-primary-strong px-2.5 text-xs text-white hover:bg-primary-strong disabled:bg-primary-strong/50"
                        onClick={onSyncUpload}
                        disabled={syncUploadDisabled || syncUploadBusy}
                      >
                        {syncUploadBusy ? syncUploadBusyLabel : syncUploadLabel}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {syncUploadHint ? (
                    <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                      {syncUploadHint}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onClearAllFiles}
              >
                전체삭제
              </Button>
            </div>
          </div>

          <div className={`${listViewportClassName} overflow-y-auto pr-1`}>
            <div className="grid grid-cols-1 gap-1.5 auto-rows-[3.5rem] sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => {
                const meta = resolveFileMeta(file);
                const showBar = file.uploadStatus === "uploading";
                const showErrorBar = file.uploadStatus === "error";
                const barPercent = Math.max(
                  0,
                  Math.min(100, Math.round(file.uploadPercent ?? 0)),
                );

                return (
                  <div
                    key={file.key}
                    className="app-glass-card relative flex h-[3.5rem] min-w-0 items-center justify-between gap-1.5 overflow-hidden rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5"
                  >
                    {"previewUrl" in file ? (
                      <button
                        type="button"
                        className={cn(
                          "relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-slate-100",
                          file.previewUrl && onPreviewFile
                            ? "cursor-zoom-in"
                            : "cursor-default",
                        )}
                        disabled={!file.previewUrl || !onPreviewFile}
                        aria-label={`${file.name} 크게 보기`}
                        onClick={() => {
                          if (!file.previewUrl || !onPreviewFile) return;
                          onPreviewFile(file);
                        }}
                      >
                        {file.previewUrl ? (
                          <img
                            src={file.previewUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                              const fallback = event.currentTarget.nextElementSibling;
                              if (fallback instanceof HTMLElement) {
                                fallback.style.display = "flex";
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className={cn(
                            "absolute inset-0 items-center justify-center text-slate-400",
                            file.previewUrl ? "hidden" : "flex",
                          )}
                        >
                          <ImagePlus className="h-4 w-4" />
                        </div>
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {file.previewUrl && onPreviewFile ? (
                            <button
                              type="button"
                              className="block w-full truncate text-left text-sm font-medium text-slate-900"
                              onClick={() => onPreviewFile(file)}
                            >
                              {file.name}
                            </button>
                          ) : (
                            <p className="truncate text-sm font-medium text-slate-900">
                              {file.name}
                            </p>
                          )}
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="start"
                          className="max-w-sm break-all text-xs"
                        >
                          {file.name}
                        </TooltipContent>
                      </Tooltip>
                      <p
                        className={cn(
                          "truncate text-xs",
                          file.uploadStatus === "error"
                            ? "text-destructive"
                            : "text-slate-500",
                        )}
                      >
                        {formatAttachmentSize(file.size)}
                        {meta ? ` · ${meta}` : ""}
                      </p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-500 hover:text-destructive"
                          onClick={() => onRemoveFile(file.key)}
                          aria-label="파일 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        삭제
                      </TooltipContent>
                    </Tooltip>
                    {showBar || showErrorBar ? (
                      <div
                        className="absolute inset-x-0 bottom-0 h-1 bg-slate-100"
                        aria-hidden
                      >
                        <div
                          className={cn(
                            "h-full transition-[width] duration-150 ease-out",
                            showErrorBar ? "bg-destructive" : "bg-primary",
                          )}
                          style={{
                            width: `${showErrorBar ? Math.max(barPercent, 8) : barPercent}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
