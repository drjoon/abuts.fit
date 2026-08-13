import { Plus, Trash2 } from "lucide-react";
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
// - 2026-08-13: 기공의뢰 전송 화면은 점선 드롭존 제거. 페이지 전역 드롭 + 파일 추가.
// - 2026-08-13: 파일카드 하단 프로그레스바(사전 업로드 전송률).

export type PracticeTransferFileDisplayItem = {
  key: string;
  name: string;
  size: number;
  metaSuffix?: string;
  uploadPercent?: number;
  uploadStatus?: PreUploadFileStatus;
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
  /** false: 점선 드롭존 숨김. 페이지 전역 드롭 + 「파일 추가」만 */
  showDropzone?: boolean;
  /** 대기 중인 로컬 파일을 서버 임시저장으로 업로드 */
  syncUploadLabel?: string;
  syncUploadBusyLabel?: string;
  syncUploadDisabled?: boolean;
  syncUploadBusy?: boolean;
  syncUploadHint?: string;
  onSyncUpload?: () => void;
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
  showDropzone = true,
  syncUploadLabel = "업로드",
  syncUploadBusyLabel = "업로드 중...",
  syncUploadDisabled = false,
  syncUploadBusy = false,
  syncUploadHint,
  onSyncUpload,
}: PracticeTransferFilePaneProps) => {
  const hasFiles = files.length > 0;
  const showListChrome = !showDropzone || hasFiles;

  const renderChromeAndList = (openPicker?: () => void) => (
    <>
      {showListChrome ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {files.length}개 · {totalSizeMb}MB
            </p>
            <div className="flex items-center gap-1.5">
              {!showDropzone && openPicker ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={openPicker}
                        disabled={disabled}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        파일 추가
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {acceptedHint}
                  </TooltipContent>
                </Tooltip>
              ) : null}
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
              {hasFiles ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={onClearAllFiles}
                >
                  전체삭제
                </Button>
              ) : null}
            </div>
          </div>

          {hasFiles ? (
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
                      className="app-glass-card relative flex h-[3.5rem] min-w-0 items-center justify-between gap-1 overflow-hidden rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="truncate text-sm font-medium text-slate-900">
                              {file.name}
                            </p>
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
                            style={{ width: `${showErrorBar ? Math.max(barPercent, 8) : barPercent}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              파일을 드래그하거나 파일 추가로 첨부하세요.
            </p>
          )}
        </>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-0 shrink-0 flex-col gap-2.5">
      {showDropzone ? (
        <>
          <PracticeTransferFileDropTarget
            fileInputId={fileInputId}
            onFiles={onPickFiles}
            disabled={disabled}
            acceptedHint={acceptedHint}
            compact={hasFiles}
            label="클릭하거나 파일을 드래그해 추가"
          />
          {renderChromeAndList()}
        </>
      ) : (
        <PracticeTransferFileDropTarget
          fileInputId={fileInputId}
          onFiles={onPickFiles}
          disabled={disabled}
          acceptedHint={acceptedHint}
          showDefaultUi={false}
        >
          {({ openPicker }) => renderChromeAndList(openPicker)}
        </PracticeTransferFileDropTarget>
      )}
    </div>
  );
};
