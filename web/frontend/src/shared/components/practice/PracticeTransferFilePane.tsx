import { UploadCloud, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - 2026-08-11: 드롭존·목록을 생산의뢰식 심플 스타일로. 확장자 안내는 즉시툴팁.

export type PracticeTransferFileDisplayItem = {
  key: string;
  name: string;
  size: number;
  metaSuffix?: string;
};

/** 파일 행 높이 3.5rem × 4 + gap 1.5 × 3 ≈ 15.125rem */
export const PRACTICE_FILE_LIST_VIEWPORT_CLASS =
  "h-[15.125rem] max-h-[15.125rem] min-h-[15.125rem]";

export type PracticeTransferFilePaneProps = {
  acceptedHint: string;
  fileInputId: string;
  files: PracticeTransferFileDisplayItem[];
  totalSizeMb: string;
  onPickFiles: (files: File[]) => void;
  onRemoveFile: (key: string) => void;
  onClearAllFiles: () => void;
  listViewportClassName?: string;
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
  acceptedHint,
  fileInputId,
  files,
  totalSizeMb,
  onPickFiles,
  onRemoveFile,
  onClearAllFiles,
  listViewportClassName = PRACTICE_FILE_LIST_VIEWPORT_CLASS,
}: PracticeTransferFilePaneProps) => {
  const hasFiles = files.length > 0;
  const openPicker = () => {
    const input = document.getElementById(fileInputId) as HTMLInputElement | null;
    input?.click();
  };

  return (
    <div className="flex min-h-0 shrink-0 flex-col gap-2.5">
      <input
        id={fileInputId}
        type="file"
        accept=".stl,.ply,.obj,.png,.jpg,.jpeg,.webp,.bmp,.gif"
        className="hidden"
        multiple
        onChange={(e) => {
          const nextFiles = Array.from(e.target.files || []);
          if (nextFiles.length) onPickFiles(nextFiles);
          e.currentTarget.value = "";
        }}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={openPicker}
            className={`w-full rounded-2xl border-2 border-dashed text-center transition-colors ${
              hasFiles
                ? "min-h-[4.75rem] px-3 py-3"
                : "min-h-[7rem] px-4 py-5"
            } border-slate-300 bg-white hover:border-primary/50`}
          >
            <div
              className={`mx-auto flex w-fit items-center justify-center rounded-full bg-primary-soft text-primary-strong ${
                hasFiles ? "mb-1 p-1.5" : "mb-1.5 p-2"
              }`}
            >
              <UploadCloud className={hasFiles ? "h-4 w-4" : "h-5 w-5"} />
            </div>
            <p className="whitespace-nowrap text-sm text-muted-foreground">
              클릭하거나 파일을 드래그해 추가
            </p>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {acceptedHint}
        </TooltipContent>
      </Tooltip>

      {hasFiles ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {files.length}개 · {totalSizeMb}MB
            </p>
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

          <div className={`${listViewportClassName} overflow-y-auto pr-1`}>
            <div className="grid grid-cols-1 gap-1.5 auto-rows-[3.5rem]">
              {files.map((file) => (
                <div
                  key={file.key}
                  className="app-glass-card flex h-[3.5rem] items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-1.5"
                >
                  <div className="min-w-0">
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
                    <p className="text-xs text-slate-500">
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
                        className="h-8 w-8 text-slate-500 hover:text-destructive"
                        onClick={() => onRemoveFile(file.key)}
                        aria-label="파일 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
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
