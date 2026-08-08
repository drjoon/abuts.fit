import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Calendar, X } from "lucide-react";
import type { CaseInfos } from "../hooks/newRequestTypes";
import { useState, useEffect } from "react";
import {
  computeEstimatedShipLabel,
  EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
  isExpressShippingSelectable,
  type LeadTimesMap,
} from "@/shared/shipping/estimateShipDate";
import { useToast } from "@/shared/hooks/use-toast";

// change-log:
// - 2026-08-06: 예상 발송 → 예상 출고 (제조사 출발일).
// - 2026-08-08: 신속 버튼 = 신속 ETA < 묶음 ETA일 때만 활성.
// - 2026-08-08: 신속 ETA를 묶음 파라미터와 분리 계산. 모드 전환 시 출고일 잔류 방지.
// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/features/settings/tabs/RequestTab.tsx
// - web/frontend/src/shared/shipping/estimateShipDate.ts

type ShippingMode = "normal" | "express";

type Props = {
  files: File[];
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: (index: number | null) => void;
  fileVerificationStatus: Record<string, boolean>;
  highlightUnverifiedArrows: boolean;
  caseInfosMap?: Record<string, CaseInfos>;
  toNormalizedFileKey: (file: File) => string;
  weeklyBatchDays?: string[];
  leadTimes?: LeadTimesMap | null;
  getEstimatedShipForDiameter: ((
    diameter: number | null,
    shippingMode?: "normal" | "express",
  ) => string | null) | null;
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
  onShippingModeChange?: (fileKeys: string[], mode: ShippingMode) => void;
  defaultShippingMode?: ShippingMode;
};

function resolveShippingMode(
  info?: CaseInfos,
  defaultMode: ShippingMode = "normal",
): ShippingMode {
  if (info?.shippingMode === "express") return "express";
  if (info?.shippingMode === "normal") return "normal";
  return defaultMode;
}

export function NewRequestAttachmentsPanel({
  files,
  selectedPreviewIndex,
  fileVerificationStatus,
  highlightUnverifiedArrows,
  caseInfosMap,
  toNormalizedFileKey,
  weeklyBatchDays = [],
  leadTimes = null,
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
  onShippingModeChange,
  defaultShippingMode = "normal",
}: Props) {
  const hasAnyAttachment = files.length > 0;
  const { toast } = useToast();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const applyMode = (
    fileKeys: string[],
    mode: ShippingMode,
    options?: { diameter?: number | null },
  ) => {
    if (!onShippingModeChange || fileKeys.length === 0) return;
    if (mode === "express") {
      const ok = isExpressShippingSelectable({
        weeklyBatchDays,
        leadTimes,
        diameter: options?.diameter ?? null,
        requestedAt: now,
      });
      if (!ok) {
        toast({
          title: "신속 출고 선택 불가",
          description: EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
          variant: "destructive",
          duration: 4000,
        });
        return;
      }
    }
    onShippingModeChange(fileKeys, mode);
  };

  const modeButtonClass = (active: boolean, disabled = false) =>
    `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      active
        ? "bg-primary text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    } ${disabled ? "opacity-50 cursor-not-allowed hover:bg-slate-100" : ""}`;

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
            AI가 파일명으로 치과/환자/치아번호를 자동 인식합니다.
          </p>
        </div>

        {hasAnyAttachment &&
          files.map((file, index) => {
            const filename = file.name;
            const fileKey = toNormalizedFileKey(file);
            const isSelected = selectedPreviewIndex === index;
            const isVerified = !!fileVerificationStatus[fileKey];
            const isUnverifiedHighlight = highlightUnverifiedArrows && !isVerified;
            const shippingMode = resolveShippingMode(
              caseInfosMap?.[fileKey],
              defaultShippingMode,
            );

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
            const expressSelectable = isExpressShippingSelectable({
              weeklyBatchDays,
              leadTimes,
              diameter,
              requestedAt: now,
            });
            const effectiveShippingMode: ShippingMode =
              shippingMode === "express" && !expressSelectable
                ? "normal"
                : shippingMode;
            // 신속/묶음 ETA를 분기 계산해 모드 전환 시 묶음일이 남지 않게 한다.
            const estimatedShip =
              effectiveShippingMode === "express"
                ? computeEstimatedShipLabel({
                    shippingMode: "express",
                    requestedAt: now,
                  })
                : (computeEstimatedShipLabel({
                    weeklyBatchDays,
                    leadTimes,
                    diameter,
                    shippingMode: "normal",
                    requestedAt: now,
                  }) ??
                  (getEstimatedShipForDiameter
                    ? getEstimatedShipForDiameter(diameter, "normal")
                    : null));
            const designSoftware = String(fileInfo?.designSoftware || "").trim();

            return (
              <div
                key={`${fileKey}-${index}`}
                onClick={() => openDetailModal(index)}
                data-file-index={index}
                data-shipping-mode={effectiveShippingMode}
                className={`relative shrink-0 app-glass-card w-full px-4 py-3.5 rounded-xl cursor-pointer transition-all ${baseClasses} ${stateClasses} ${ringClasses} hover:border-gray-400`}
              >
                <div className="relative z-10 flex flex-col gap-2">
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

                  {(estimatedShip || designSoftware || onShippingModeChange) && (
                    <div className="flex items-center justify-between gap-2">
                      {estimatedShip ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span
                            key={`eta-${fileKey}-${effectiveShippingMode}-${estimatedShip}`}
                            className="truncate"
                          >
                            예상 출고: {estimatedShip}
                          </span>
                        </div>
                      ) : (
                        <div />
                      )}

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {onShippingModeChange ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className={modeButtonClass(
                                effectiveShippingMode === "normal",
                              )}
                              onClick={() =>
                                applyMode([fileKey], "normal", { diameter })
                              }
                            >
                              묶음
                            </button>
                            <button
                              type="button"
                              className={modeButtonClass(
                                effectiveShippingMode === "express",
                                !expressSelectable,
                              )}
                              disabled={!expressSelectable}
                              title={
                                expressSelectable
                                  ? undefined
                                  : EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE
                              }
                              onClick={() =>
                                applyMode([fileKey], "express", { diameter })
                              }
                            >
                              신속
                            </button>
                          </div>
                        ) : null}
                        {designSoftware ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-medium px-1.5 py-0.5"
                          >
                            {designSoftware}
                          </Badge>
                        ) : null}
                      </div>
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
