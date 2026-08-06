import { UploadCloud, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx

export type PracticeTransferFileDisplayItem = {
  key: string;
  name: string;
  size: number;
  metaSuffix?: string;
};

export type PracticeTransferFilePaneProps = {
  acceptedHint: string;
  fileInputId: string;
  files: PracticeTransferFileDisplayItem[];
  totalSizeMb: string;
  onPickFiles: (files: File[]) => void;
  onRemoveFile: (key: string) => void;
  onClearAllFiles: () => void;
  listViewportClassName?: string;
  /** @deprecated 동기화 버튼은 대시보드 헤더로 이동. 하위 호환용으로만 유지 */
  syncUploadLabel?: string;
  syncUploadBusyLabel?: string;
  syncUploadDisabled?: boolean;
  syncUploadBusy?: boolean;
  syncUploadHint?: string;
  onSyncUpload?: () => void;
};

export const PracticeTransferFilePane = ({
  acceptedHint,
  fileInputId,
  files,
  totalSizeMb,
  onPickFiles,
  onRemoveFile,
  onClearAllFiles,
  listViewportClassName = "h-[16rem] max-h-[16rem]",
}: PracticeTransferFilePaneProps) => {
  const cardClassName =
    "overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm";

  return (
    <div className="flex min-h-0 h-full flex-col gap-2">
      <div
        className={`${cardClassName} border-dashed bg-slate-50/50 p-3 text-center flex flex-1 flex-col items-center justify-center`}
      >
        <div className="mx-auto mb-1.5 w-fit rounded-full bg-sky-50 p-2 text-sky-600">
          <UploadCloud className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold text-slate-900">파일 드래그 & 드롭</p>
        <p className="mt-0.5 text-xs text-slate-500">{acceptedHint}</p>
        <div className="mt-2">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-slate-200 bg-white"
            onClick={() => {
              const input = document.getElementById(fileInputId) as HTMLInputElement | null;
              input?.click();
            }}
          >
            파일 선택
          </Button>
        </div>
      </div>

      <div className={`${cardClassName} flex flex-col p-3`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            {files.length}개 · {totalSizeMb}MB
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-lg border-slate-200 bg-white text-xs"
            onClick={onClearAllFiles}
            disabled={files.length === 0}
          >
            전체삭제
          </Button>
        </div>

        {files.length === 0 ? (
          <div
            className={`${listViewportClassName} flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/40 text-center text-xs text-slate-500`}
          >
            첨부된 파일 없음
          </div>
        ) : (
          <div className={`${listViewportClassName} overflow-y-auto pr-1`}>
            <TooltipProvider delayDuration={0}>
              <div className="grid grid-cols-1 gap-1.5 auto-rows-[3.25rem]">
                {files.map((file) => (
                  <div
                    key={file.key}
                    className="flex h-[3.25rem] items-center justify-between rounded-lg border border-slate-200/80 bg-white px-2 py-1.5"
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
                          className="max-w-sm break-all"
                        >
                          {file.name}
                        </TooltipContent>
                      </Tooltip>
                      <p className="text-xs text-slate-500">
                        {(file.size / (1024 * 1024)).toFixed(2)}MB
                        {file.metaSuffix ? ` · ${file.metaSuffix}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-destructive"
                      onClick={() => onRemoveFile(file.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  );
};
