import { UploadCloud, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
};

export const PracticeTransferFilePane = ({
  acceptedHint,
  fileInputId,
  files,
  totalSizeMb,
  onPickFiles,
  onRemoveFile,
  onClearAllFiles,
  // 파일 행 4rem + gap 0.5rem × 4 = 5개 표시 높이
  listViewportClassName = "h-[22rem] max-h-[22rem]",
}: PracticeTransferFilePaneProps) => {
  const cardClassName =
    "overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-sky-50/60 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-all hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]";

  return (
    <div className="flex min-h-0 h-full flex-col gap-3">
      <div
        className={`${cardClassName} border-dashed p-4 text-center flex flex-1 flex-col items-center justify-center`}
      >
        <div className="mx-auto mb-2 w-fit rounded-full bg-sky-50 p-3 text-sky-600">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold text-slate-900">파일을 드래그 & 드롭하세요</p>
        <p className="mt-1 text-sm text-slate-500">{acceptedHint}</p>
        <div className="mt-3">
          <input
            id={fileInputId}
            type="file"
            accept=".stl,.ply,.obj"
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
            className="rounded-xl border-slate-200 bg-white px-6 text-base shadow-sm"
            onClick={() => {
              const input = document.getElementById(fileInputId) as HTMLInputElement | null;
              input?.click();
            }}
          >
            파일 선택
          </Button>
        </div>
      </div>

      <div className={`${cardClassName} flex flex-col p-4`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm text-slate-500">
            총 {files.length}개 파일 · 약 {totalSizeMb}MB <span className="text-destructive">*</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-slate-200 bg-white"
            onClick={onClearAllFiles}
            disabled={files.length === 0}
          >
            전체삭제
          </Button>
        </div>

        {files.length === 0 ? (
          <div
            className={`${listViewportClassName} flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 text-center text-sm text-slate-500`}
          >
            아직 추가된 파일이 없습니다.
          </div>
        ) : (
          <div className={`${listViewportClassName} overflow-y-auto pr-1`}>
            <div className="grid grid-cols-1 gap-2 auto-rows-[4rem]">
              {files.map((file) => (
                <div
                  key={file.key}
                  className="flex h-[4rem] items-center justify-between rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-2 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500">
                      {(file.size / (1024 * 1024)).toFixed(2)}MB
                      {file.metaSuffix ? ` · ${file.metaSuffix}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-slate-500 hover:text-destructive"
                    onClick={() => onRemoveFile(file.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
