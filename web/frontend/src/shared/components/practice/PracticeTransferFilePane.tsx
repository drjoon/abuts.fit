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
  listViewportClassName = "max-h-[10rem]",
}: PracticeTransferFilePaneProps) => {
  return (
    <div className="flex min-h-0 h-full flex-col gap-3">
      <div className="rounded-xl border border-dashed bg-background p-4 text-center flex flex-1 flex-col items-center justify-center">
        <div className="mx-auto mb-2 w-fit rounded-full bg-blue-50 p-3 text-blue-600">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold">파일을 드래그 & 드롭하세요</p>
        <p className="text-sm text-muted-foreground mt-1">{acceptedHint}</p>
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
            className="px-6 text-base"
            onClick={() => {
              const input = document.getElementById(fileInputId) as HTMLInputElement | null;
              input?.click();
            }}
          >
            파일 선택
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-background p-4 flex min-h-[22rem] flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            총 {files.length}개 파일 · 약 {totalSizeMb}MB <span className="text-destructive">*</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onClearAllFiles}
            disabled={files.length === 0}
          >
            전체삭제
          </Button>
        </div>

        {files.length === 0 ? (
          <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
            아직 추가된 파일이 없습니다.
          </div>
        ) : (
          <div className={`${listViewportClassName} overflow-y-auto pr-1`}>
            <div className="grid grid-cols-1 gap-2 auto-rows-[4rem]">
              {files.map((file) => (
                <div
                  key={file.key}
                  className="flex h-[4rem] items-center justify-between rounded-md border px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(2)}MB
                      {file.metaSuffix ? ` · ${file.metaSuffix}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
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
