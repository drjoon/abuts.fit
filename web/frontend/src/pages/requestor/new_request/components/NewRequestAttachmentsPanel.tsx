import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Calendar, X } from "lucide-react";
import type { CaseInfos } from "../hooks/newRequestTypes";

// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/features/settings/tabs/RequestTab.tsx

type Props = {
  files: File[];
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: (index: number | null) => void;
  fileVerificationStatus: Record<string, boolean>;
  highlightUnverifiedArrows: boolean;
  caseInfosMap?: Record<string, CaseInfos>;
  toNormalizedFileKey: (file: File) => string;
  getEstimatedShipForDiameter: ((diameter: number | null) => string | null) | null;
  fileDiameters: Record<string, number>;
  handleRemoveFile: (index: number) => void;
  openDetailModal: (index: number) => void;
  handleClearAll: () => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onKeyboardNavigation: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  listContainerRef: React.RefObject<HTMLDivElement | null>;
  uploadInputRef: React.RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: File[]) => void;
  designSoftwareLabel?: string;
  onOpenDesignSoftwareModal?: () => void;
};

export function NewRequestAttachmentsPanel({
  files,
  selectedPreviewIndex,
  fileVerificationStatus,
  highlightUnverifiedArrows,
  caseInfosMap,
  toNormalizedFileKey,
  getEstimatedShipForDiameter,
  fileDiameters,
  handleRemoveFile,
  openDetailModal,
  handleClearAll,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onKeyboardNavigation,
  listContainerRef,
  uploadInputRef,
  onFilesSelected,
  designSoftwareLabel,
  onOpenDesignSoftwareModal,
}: Props) {
  const hasAnyAttachment = files.length > 0;

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fileList = e.currentTarget.files;
          if (fileList) {
            onFilesSelected(Array.from(fileList));
          }
          e.currentTarget.value = "";
        }}
        accept=".stl"
      />

      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenDesignSoftwareModal?.()}
        >
          {designSoftwareLabel
            ? `${designSoftwareLabel}`
            : "디자인 소프트웨어 설정"}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          disabled={!files.length}
        >
          전체 삭제
        </Button>
      </div>

      <div
        ref={listContainerRef}
        className={`flex flex-col gap-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 px-2 py-2 flex-1 min-h-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 -mx-1 ${hasAnyAttachment ? "" : "justify-center"}`}
        tabIndex={0}
        role="listbox"
        aria-label="첨부 파일 목록"
        onKeyDown={onKeyboardNavigation}
      >
        <div
          className={`shrink-0 w-full border-2 border-dashed rounded-2xl text-center transition-colors flex flex-col items-center justify-center gap-1.5 cursor-pointer ${hasAnyAttachment ? "p-3 md:p-4" : "p-5 md:p-6 max-w-[420px] mx-auto"} ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-primary/50 bg-white"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => uploadInputRef.current?.click()}
        >
          <p className="text-xs md:text-sm text-muted-foreground">
            여기를 클릭하거나 STL 파일을 드래그해 추가하세요.
          </p>
          <p className="text-xs md:text-sm text-muted-foreground">
            파일명에서 AI로 치과/환자/치아번호를 자동 인식합니다.
          </p>
        </div>

        {hasAnyAttachment &&
          files.map((file, index) => {
            const filename = file.name;
            const fileKey = toNormalizedFileKey(file);
            const isSelected = selectedPreviewIndex === index;
            const isVerified = !!fileVerificationStatus[fileKey];
            const isUnverifiedHighlight = highlightUnverifiedArrows && !isVerified;

            const baseClasses = isVerified
              ? "border border-gray-200 bg-white text-gray-900"
              : "border border-red-300 bg-red-50 text-red-800";
            const stateClasses = isSelected
              ? isVerified
                ? "border-primary bg-primary/10 text-primary shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
                : "border-red-400 bg-red-50 shadow-[0_4px_12px_rgba(248,113,113,0.2)]"
              : "";

            const ringClasses = isSelected
              ? "ring-2 ring-primary ring-offset-2 ring-offset-white"
              : isUnverifiedHighlight
                ? "ring-2 ring-red-400 ring-offset-2 ring-offset-white"
                : "";

            const computedDiameter = fileDiameters[fileKey];
            const fileInfo = caseInfosMap?.[fileKey];
            const diameter = computedDiameter ?? fileInfo?.maxDiameter ?? null;
            const estimatedShip = getEstimatedShipForDiameter
              ? getEstimatedShipForDiameter(diameter)
              : null;
            const designSoftware = String(fileInfo?.designSoftware || "").trim();

            return (
              <div
                key={`${fileKey}-${index}`}
                onClick={() => openDetailModal(index)}
                data-file-index={index}
                className={`relative shrink-0 app-glass-card w-full px-4 py-3.5 rounded-xl cursor-pointer transition-all ${baseClasses} ${stateClasses} ${ringClasses} hover:border-gray-400`}
              >
                <div className="relative z-10 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate flex-1">{filename}</div>
                    <div className="flex items-center gap-1">
                      {isVerified && (
                        <Check className="w-4 h-4 text-primary" aria-label="확인됨" />
                      )}

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveFile(index);
                        }}
                        className="p-1 text-slate-400 hover:text-red-500"
                        aria-label="파일 삭제"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {(estimatedShip || designSoftware) && (
                    <div className="flex items-center justify-between gap-2">
                      {estimatedShip ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Calendar className="w-3 h-3" />
                          <span>예상 발송: {estimatedShip}</span>
                        </div>
                      ) : (
                        <div />
                      )}

                      {designSoftware && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-medium px-1.5 py-0.5"
                        >
                          {designSoftware}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
