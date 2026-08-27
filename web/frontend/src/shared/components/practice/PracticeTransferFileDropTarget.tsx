// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/features/requests/components/PageFileDropZone.tsx
// - web/frontend/src/shared/files/extractDroppedFiles.ts
// - web/frontend/src/shared/practice/practiceTransferAccept.ts
// - 2026-08-21: pickPracticeTransferFilesViaInput — 상세 모달(카드 없는 경로) 파일 선택.
// - 2026-08-27: Windows 파일창 race — pickOsFilesViaInput SSOT로 위임.
// - 2026-08-17: 파일창 오픈 — button+Tooltip+input.click 제거, label/htmlFor + sr-only input.
import {
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  dataTransferHasFiles,
  extractDroppedFiles,
} from "@/shared/files/extractDroppedFiles";
import { pickOsFilesViaInput } from "@/shared/files/pickOsFilesViaInput";
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
  /** 부모 높이에 맞춰 드롭 영역이 늘어남(메모 옆 2열용) */
  fillHeight?: boolean;
  label?: string;
  children?: PracticeTransferFileDropTargetChildren;
};

/**
 * 기공의뢰 첨부 공통: 클릭 파일오픈 + 요소 스코프 드롭.
 * - FilePane(치과 intake) / 기공소 수락 카드 결과파일에 재사용
 * - 페이지 전역 드롭은 PageFileDropZone 유지
 * - 기본 UI는 label→input(htmlFor)로 OS 파일창을 연다(JS click/Tooltip 경유 금지)
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
  fillHeight = false,
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
        fillHeight && "flex min-h-0 flex-1 flex-col",
        className,
        isDragActive ? activeClassName : undefined,
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/*
        display:none 대신 sr-only — 일부 브라우저에서 hidden input의
        programmatic click / label 활성화가 느리거나 무시되는 경우 방지.
      */}
      <input
        ref={inputRef}
        id={fileInputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const nextFiles = Array.from(e.target.files || []);
          if (nextFiles.length) emitFiles(nextFiles);
          e.currentTarget.value = "";
        }}
      />

      {showDefaultUi ? (
        <label
          htmlFor={disabled ? undefined : fileInputId}
          aria-disabled={disabled || undefined}
          className={cn(
            "w-full rounded-2xl border-2 border-dashed text-center transition-colors",
            fillHeight
              ? "flex h-full min-h-[7rem] flex-1 flex-col items-center justify-center px-4 py-5"
              : compact
                ? "block min-h-[4.75rem] px-3 py-3"
                : "block min-h-[7rem] px-4 py-5",
            "border-slate-300 bg-white hover:border-primary/50",
            isDragActive ? "border-primary bg-primary-soft/30" : "",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer",
          )}
        >
          <div
            className={cn(
              "mx-auto flex w-fit items-center justify-center rounded-full bg-primary-soft text-primary-strong",
              compact && !fillHeight ? "mb-1 p-1.5" : "mb-1.5 p-2",
            )}
          >
            <UploadCloud
              className={compact && !fillHeight ? "h-4 w-4" : "h-5 w-5"}
            />
          </div>
          <p className="whitespace-nowrap text-sm text-muted-foreground">
            {label}
          </p>
          {acceptedHint ? (
            <p
              className={cn(
                "text-muted-foreground/80",
                compact && !fillHeight ? "mt-0.5 text-[11px]" : "mt-1 text-xs",
              )}
            >
              {acceptedHint}
            </p>
          ) : null}
        </label>
      ) : null}

      {content}
    </div>
  );
}

export const openPracticeTransferFilePicker = (fileInputId: string) => {
  const input = document.getElementById(fileInputId) as HTMLInputElement | null;
  input?.click();
};

/** 카드 DOM input 없이 OS 파일창(상세 모달·캘린더 경로) */
export function pickPracticeTransferFilesViaInput(opts?: {
  accept?: string;
  multiple?: boolean;
}): Promise<File[]> {
  return pickOsFilesViaInput({
    accept: opts?.accept ?? PRACTICE_TRANSFER_ACCEPT,
    multiple: opts?.multiple,
  });
}
