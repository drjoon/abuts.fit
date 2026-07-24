import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Calendar, X } from "lucide-react";
import type { CaseInfos } from "../hooks/newRequestTypes";

type CardLinkDrag = {
  kind: "stl" | "companion";
  stlFileKey?: string;
  companionFileKey?: string;
  sourceStlFileKey?: string;
} | null;

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
  onFilesSelected: (files: File[]) => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onKeyboardNavigation: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  listContainerRef: React.RefObject<HTMLDivElement | null>;
  uploadInputRef: React.RefObject<HTMLInputElement | null>;
  companionInputRef: React.RefObject<HTMLInputElement | null>;
  companionFiles: File[];
  standaloneCompanionFiles: File[];
  cardDragOverKey: string | null;
  setCardDragOverKey: React.Dispatch<React.SetStateAction<string | null>>;
  cardLinkDrag: CardLinkDrag;
  setCardLinkDrag: (drag: CardLinkDrag) => void;
  getCompanionFileKey: (file: File) => string;
  getEffectiveCompanionsForStl: (file: File) => File[];
  setPendingCompanionTargetStlKey: (key: string | null) => void;
  setPendingCompanionCardForStlUpload: (key: string | null) => void;
  handleRemoveCompanionFile: (file: File) => void;
  handleMainInputFiles: (selected: File[]) => void;
  handleCompanionInputFiles: (selected: File[]) => void;
  handleCardDrop: (
    event: React.DragEvent<HTMLDivElement>,
    dropKey: string,
    options?: {
      selectIndex?: number;
      targetStlFileKey?: string;
      targetCompanionFileKey?: string;
    },
    onSelectIndex?: (index: number) => void,
  ) => void;
  detachDraggingCompanion: () => boolean;
};

export function NewRequestAttachmentsPanel({
  files,
  selectedPreviewIndex,
  setSelectedPreviewIndex,
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
  companionInputRef,
  companionFiles,
  standaloneCompanionFiles,
  cardDragOverKey,
  setCardDragOverKey,
  cardLinkDrag,
  setCardLinkDrag,
  getCompanionFileKey,
  getEffectiveCompanionsForStl,
  setPendingCompanionTargetStlKey,
  setPendingCompanionCardForStlUpload,
  handleRemoveCompanionFile,
  handleMainInputFiles,
  handleCompanionInputFiles,
  handleCardDrop,
  detachDraggingCompanion,
}: Props) {
  const hasActiveSession = files.length > 0;
  const hasAnyAttachment = hasActiveSession || companionFiles.length > 0;

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
            handleMainInputFiles(Array.from(fileList));
          }
          e.currentTarget.value = "";
        }}
        accept=".stl,.xml,.constructionInfo"
      />

      <input
        ref={companionInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fileList = e.currentTarget.files;
          if (fileList) {
            handleCompanionInputFiles(Array.from(fileList));
          }
          e.currentTarget.value = "";
        }}
        accept=".xml,.constructionInfo"
      />

      <div className="flex justify-end gap-2 px-2 pb-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          disabled={!files.length && companionFiles.length === 0}
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
        onDragOver={(e) => {
          if (cardLinkDrag) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          if (detachDraggingCompanion()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div
          className={`shrink-0 w-full border-2 border-dashed rounded-2xl text-center transition-colors flex flex-col items-center justify-center gap-1.5 cursor-pointer ${hasAnyAttachment ? "p-3 md:p-4" : "p-5 md:p-6 max-w-[420px] mx-auto"} ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-primary/50 bg-white"
          }`}
          onDragOver={(e) => {
            if (cardLinkDrag) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onDragOver(e);
          }}
          onDragLeave={(e) => {
            if (cardLinkDrag) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onDragLeave(e);
          }}
          onDrop={(e) => {
            if (detachDraggingCompanion()) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onDrop(e);
          }}
          onClick={() => uploadInputRef.current?.click()}
        >
          <p className="text-xs md:text-sm text-muted-foreground">
            여기를 클릭하거나 파일을 드래그해 추가하세요.
          </p>
          <p className="text-xs md:text-sm text-muted-foreground">
            파일명에서 치과/환자/치아번호를 자동 인식합니다.
          </p>
        </div>

        {standaloneCompanionFiles.map((companion) => {
          const companionKey = getCompanionFileKey(companion);

          return (
            <div
              key={companionKey}
              draggable
              onDragStart={(event) => {
                event.stopPropagation();
                setCardLinkDrag({
                  kind: "companion",
                  companionFileKey: companionKey,
                });
              }}
              onDragEnd={() => {
                setCardLinkDrag(null);
                setCardDragOverKey(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setCardDragOverKey(companionKey);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setCardDragOverKey((prev) => (prev === companionKey ? null : prev));
              }}
              onDrop={(event) =>
                handleCardDrop(
                  event,
                  companionKey,
                  { targetCompanionFileKey: companionKey },
                  (i) => setSelectedPreviewIndex(i),
                )
              }
              className={`relative shrink-0 app-glass-card w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 ${cardDragOverKey === companionKey ? "ring-2 ring-blue-300 ring-offset-2 ring-offset-white border-blue-300 bg-blue-50/40" : ""}`}
            >
              <div className="relative z-10 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="truncate flex-1 text-[11px] text-slate-500"
                    title="STL 파일을 추가해 의뢰를 계속해주세요. (카드 드롭 가능)"
                  >
                    STL 파일을 추가해 의뢰를 계속해주세요. (카드 드롭 가능)
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingCompanionCardForStlUpload(companionKey);
                        uploadInputRef.current?.click();
                      }}
                    >
                      stl 추가
                    </Button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemoveCompanionFile(companion);
                      }}
                      className="p-1 text-slate-400 hover:text-red-500"
                      aria-label="구성정보 삭제"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-sky-700 min-w-0">
                  <Badge className="bg-sky-600 hover:bg-sky-600">구성정보</Badge>
                  <span className="truncate" title={companion.name}>
                    {companion.name}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {hasActiveSession &&
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

            const effectiveCompanions = getEffectiveCompanionsForStl(file);
            const primaryCompanion = effectiveCompanions[0] || null;

            return (
              <div
                key={`${fileKey}-${index}`}
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  setCardLinkDrag({ kind: "stl", stlFileKey: fileKey });
                }}
                onDragEnd={() => {
                  setCardLinkDrag(null);
                  setCardDragOverKey(null);
                }}
                onClick={() => openDetailModal(index)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setCardDragOverKey(fileKey);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setCardDragOverKey((prev) => (prev === fileKey ? null : prev));
                }}
                onDrop={(event) =>
                  handleCardDrop(
                    event,
                    fileKey,
                    {
                      selectIndex: index,
                      targetStlFileKey: fileKey,
                    },
                    (i) => setSelectedPreviewIndex(i),
                  )
                }
                data-file-index={index}
                className={`relative shrink-0 app-glass-card w-full px-4 py-3.5 rounded-xl cursor-pointer transition-all ${baseClasses} ${stateClasses} ${ringClasses} ${cardDragOverKey === fileKey ? "ring-2 ring-blue-300 ring-offset-2 ring-offset-white border-blue-300 bg-blue-50/40" : ""} hover:border-gray-400`}
              >
                <div className="relative z-10 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate flex-1">{filename}</div>
                    <div className="flex items-center gap-1">
                      {!primaryCompanion && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPreviewIndex(index);
                            setPendingCompanionTargetStlKey(fileKey);
                            companionInputRef.current?.click();
                          }}
                        >
                          구성정보 추가
                        </Button>
                      )}

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

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex items-center gap-1.5 text-sky-700">
                      <Badge className="bg-sky-600 hover:bg-sky-600">구성정보</Badge>
                      {primaryCompanion ? (
                        <span
                          className="truncate cursor-grab active:cursor-grabbing"
                          title={`${primaryCompanion.name} (드래그해서 분리/결합)`}
                          draggable
                          onDragStart={(event) => {
                            event.stopPropagation();
                            setCardLinkDrag({
                              kind: "companion",
                              companionFileKey: getCompanionFileKey(primaryCompanion),
                              sourceStlFileKey: fileKey,
                            });
                          }}
                          onDragEnd={() => {
                            setCardLinkDrag(null);
                            setCardDragOverKey(null);
                          }}
                        >
                          {primaryCompanion.name}
                        </span>
                      ) : (
                        <span
                          className="truncate text-slate-500"
                          title="STL 파일이 있는 폴더에서 구성정보 파일을 추가해 주세요."
                        >
                          STL 파일이 있는 폴더에서 구성정보 파일을 추가해 주세요.
                        </span>
                      )}
                      {effectiveCompanions.length > 1 && (
                        <span className="text-slate-500">
                          +{effectiveCompanions.length - 1}개
                        </span>
                      )}
                    </div>

                    {primaryCompanion && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveCompanionFile(primaryCompanion);
                        }}
                        className="p-1 text-slate-400 hover:text-red-500"
                        aria-label="구성정보 삭제"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {estimatedShip && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="w-3 h-3" />
                      <span>예상 발송: {estimatedShip}</span>
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
