import { Trash2 } from "lucide-react";
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

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferFileDropTarget.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-08-11: 드롭존·목록을 생산의뢰식 심플 스타일로. 확장자 안내는 즉시툴팁.
// - 2026-08-11: 첨부 목록 3열 그리드.
// - 2026-08-12: 클릭/요소드롭은 PracticeTransferFileDropTarget 공통 재사용.

export type PracticeTransferFileDisplayItem = {
  key: string;
  name: string;
  size: number;
  metaSuffix?: string;
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
  syncUploadLabel = "업로드",
  syncUploadBusyLabel = "업로드 중...",
  syncUploadDisabled = false,
  syncUploadBusy = false,
  syncUploadHint,
  onSyncUpload,
}: PracticeTransferFilePaneProps) => {
  const hasFiles = files.length > 0;

  return (
    <div className="flex min-h-0 shrink-0 flex-col gap-2.5">
      <PracticeTransferFileDropTarget
        fileInputId={fileInputId}
        onFiles={onPickFiles}
        disabled={disabled}
        acceptedHint={acceptedHint}
        compact={hasFiles}
        label="클릭하거나 파일을 드래그해 추가"
      />

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
              {files.map((file) => (
                <div
                  key={file.key}
                  className="app-glass-card flex h-[3.5rem] min-w-0 items-center justify-between gap-1 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5"
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
                    <p className="truncate text-xs text-slate-500">
                      {formatAttachmentSize(file.size)}
                      {file.metaSuffix ? ` · ${file.metaSuffix}` : ""}
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
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
