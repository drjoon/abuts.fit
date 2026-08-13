// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/features/requests/components/PageFileDropZone.tsx
// - web/frontend/src/shared/files/extractDroppedFiles.ts
// - web/frontend/src/shared/practice/practiceTransferAccept.ts
import {
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { UploadCloud } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  dataTransferHasFiles,
  extractDroppedFiles,
} from "@/shared/files/extractDroppedFiles";
import {
  PRACTICE_ACCEPTED_HINT,
  PRACTICE_TRANSFER_ACCEPT,
  filterPracticeTransferFiles,
} from "@/shared/practice/practiceTransferAccept";

export type PracticeTransferFileDropTargetChildren =
  | ReactNode
  | ((state: {
      isDragActive: boolean;
      openPicker: () => void;
    }) => ReactNode);

export type PracticeTransferFileDropTargetProps = {
  fileInputId: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  acceptedHint?: string;
  /** 기본: 기공의뢰 허용 확장자. 생산의뢰는 STL만 넘기려면 호출측에서 지정 */
  filterFiles?: (files: File[]) => File[];
  className?: string;
  activeClassName?: string;
  /** 기본 dashed 클릭/드롭 UI. false면 children만(카드 래핑용) */
  showDefaultUi?: boolean;
  compact?: boolean;
  label?: string;
  children?: PracticeTransferFileDropTargetChildren;
};

/**
 * 기공의뢰 첨부 공통: 클릭 파일오픈 + 요소 스코프 드롭.
 * - FilePane(치과 intake) / 기공소 수락 카드 결과파일에 재사용
 * - 페이지 전역 드롭은 PageFileDropZone 유지
 */
export function PracticeTransferFileDropTarget({
  fileInputId,
  onFiles,
  disabled = false,
  multiple = true,
  accept = PRACTICE_TRANSFER_ACCEPT,
  acceptedHint = PRACTICE_ACCEPTED_HINT,
  filterFiles = filterPracticeTransferFiles,
  className,
  activeClassName = "border-primary bg-primary-soft/40 ring-2 ring-primary/30",
  showDefaultUi = true,
  compact = false,
  label = "클릭하거나 파일을 드래그해 추가",
  children,
}: PracticeTransferFileDropTargetProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const emitFiles = (raw: File[]) => {
    const next = filterFiles(raw);
    if (!next.length) return;
    onFiles(next);
  };

  const openPicker = () => {
    if (disabled) return;
    const input =
      inputRef.current ||
      (document.getElementById(fileInputId) as HTMLInputElement | null);
    input?.click();
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !dataTransferHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !dataTransferHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !dataTransferHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !dataTransferHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const items = Array.from(event.dataTransfer?.items || []);
    const direct = Array.from(event.dataTransfer?.files || []);
    void (async () => {
      const files = await extractDroppedFiles(items, direct);
      emitFiles(files);
    })();
  };

  const content =
    typeof children === "function"
      ? children({ isDragActive, openPicker })
      : children;

  return (
    <div
      className={cn(
        "relative",
        className,
        isDragActive ? activeClassName : undefined,
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        id={fileInputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const nextFiles = Array.from(e.target.files || []);
          if (nextFiles.length) emitFiles(nextFiles);
          e.currentTarget.value = "";
        }}
      />

      {showDefaultUi ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openPicker();
              }}
              className={cn(
                "w-full rounded-2xl border-2 border-dashed text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                compact
                  ? "min-h-[4.75rem] px-3 py-3"
                  : "min-h-[7rem] px-4 py-5",
                "border-slate-300 bg-white hover:border-primary/50",
                isDragActive ? "border-primary bg-primary-soft/30" : "",
              )}
            >
              <div
                className={cn(
                  "mx-auto flex w-fit items-center justify-center rounded-full bg-primary-soft text-primary-strong",
                  compact ? "mb-1 p-1.5" : "mb-1.5 p-2",
                )}
              >
                <UploadCloud className={compact ? "h-4 w-4" : "h-5 w-5"} />
              </div>
              <p className="whitespace-nowrap text-sm text-muted-foreground">
                {label}
              </p>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {acceptedHint}
          </TooltipContent>
        </Tooltip>
      ) : null}

      {content}
    </div>
  );
}

export const openPracticeTransferFilePicker = (fileInputId: string) => {
  const input = document.getElementById(fileInputId) as HTMLInputElement | null;
  input?.click();
};
