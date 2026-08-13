import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";
import { useAuthStore } from "@/store/useAuthStore";
import { useLeadTimeForecast } from "../hooks/useLeadTimeForecast";
import { NewRequestAttachmentsPanel } from "./NewRequestAttachmentsPanel";
import { NewRequestDetailDialog } from "./NewRequestDetailDialog";
import type { LeadTimesMap } from "@/shared/shipping/estimateShipDate";
import type { PreUploadFileProgress } from "@/shared/hooks/useFilePreUpload";
import type { AttachmentListItem, PatientFileGroup } from "../utils/patientGroups";
import {
  findGroupByFileKey,
  getPrimaryFileKey,
  isLikelyCustomAbutDesignSize,
  isLikelyOralScanSize,
} from "../utils/patientGroups";

// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/new_request/utils/patientGroups.ts
// Rhino의 align 기능이 구성정보를 대체하므로, 신규의뢰에서 개별 구성정보 파일은 사용하지 않는다.

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Option = { id: string; label: string };

type Props = {
  files: File[];
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: (index: number | null) => void;
  caseInfos?: CaseInfos;
  setCaseInfos: (updates: Partial<CaseInfos>) => void;
  caseInfosMap?: Record<string, CaseInfos>;
  updateCaseInfos: (fileKey: string, updates: Partial<CaseInfos>) => void;
  connections: Connection[];
  familyOptions: string[];
  typeOptions: string[];
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantBrand: string;
  setImplantBrand: (v: string) => void;
  implantFamily: string;
  setImplantFamily: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (
    manufacturer: string,
    brand: string,
    family: string,
    type: string,
  ) => void;
  fileVerificationStatus: Record<string, boolean>;
  setFileVerificationStatus: (
    next:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  highlightUnverifiedArrows: boolean;
  setHighlightUnverifiedArrows: (v: boolean) => void;
  handleRemoveFile: (index: number) => void;
  clinicNameOptions: Option[];
  patientNameOptions: Option[];
  teethOptions: Option[];
  addClinicPreset: (label: string) => void;
  clearAllClinicPresets: () => void;
  addPatientPreset: (label: string) => void;
  clearAllPatientPresets: () => void;
  addTeethPreset: (label: string) => void;
  clearAllTeethPresets: () => void;
  handleAddOrSelectClinic: (label: string) => void;
  toast: ToastFn;
  highlight: boolean;
  sectionHighlightClass: string;
  focusUnverifiedTick: number;
  onDuplicateDetected?: (payload: { file: File; duplicate: unknown }) => void;
  duplicatePromptOpen: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onFilesSelected: (files: File[]) => void;
  uploadProgress?: Record<string, PreUploadFileProgress>;
  weeklyBatchDays?: string[];
  onCancelAll: () => void;
  designSoftwareLabel?: string;
  onOpenDesignSoftwareModal?: () => void;
  anodizingEnabled?: boolean;
  anodizingSaving?: boolean;
  onToggleAnodizing?: () => void;
  onShippingModeChange?: (
    fileKeys: string[],
    mode: "normal" | "express",
  ) => void;
  defaultShippingMode?: "normal" | "express";
  /** 우측 신속 카드와 동일 — false면 카드 신속 버튼도 비활성 */
  expressSelectableGlobal?: boolean;
  onLeadTimesChange?: (leadTimes: LeadTimesMap | null) => void;
  attachmentListItems?: AttachmentListItem[];
  patientGroups?: PatientFileGroup[];
  onGroupSelectedFiles?: (fileKeys: string[]) => void;
  onUngroupPatientFiles?: (groupId: string) => void;
  onRemoveFileFromPatientGroup?: (fileKey: string) => void;
  /** true: 기공소 — 항상 커스텀어벗 생산, 구강스캔 묶음·디자인+생산 탭 없음 */
  productionOnly?: boolean;
};

export function NewRequestDetailsSection({
  files,
  selectedPreviewIndex,
  setSelectedPreviewIndex,
  caseInfos,
  setCaseInfos,
  caseInfosMap,
  updateCaseInfos,
  connections,
  familyOptions,
  typeOptions,
  implantManufacturer,
  setImplantManufacturer,
  implantBrand,
  setImplantBrand,
  implantFamily,
  setImplantFamily,
  implantType,
  setImplantType,
  syncSelectedConnection,
  fileVerificationStatus,
  setFileVerificationStatus,
  highlightUnverifiedArrows,
  setHighlightUnverifiedArrows,
  handleRemoveFile,
  clinicNameOptions,
  patientNameOptions,
  teethOptions,
  addClinicPreset,
  clearAllClinicPresets,
  addPatientPreset,
  clearAllPatientPresets,
  addTeethPreset,
  clearAllTeethPresets,
  handleAddOrSelectClinic,
  toast,
  highlight: _highlight,
  sectionHighlightClass: _sectionHighlightClass,
  focusUnverifiedTick,
  onDuplicateDetected: _onDuplicateDetected,
  duplicatePromptOpen,
  isDragOver: _isDragOver,
  onDragOver: _onDragOver,
  onDragLeave: _onDragLeave,
  onDrop: _onDrop,
  onFilesSelected,
  uploadProgress = {},
  weeklyBatchDays = [],
  onCancelAll,
  designSoftwareLabel,
  onOpenDesignSoftwareModal,
  anodizingEnabled,
  anodizingSaving,
  onToggleAnodizing,
  onShippingModeChange,
  defaultShippingMode = "normal",
  expressSelectableGlobal = true,
  onLeadTimesChange,
  attachmentListItems,
  patientGroups = [],
  onGroupSelectedFiles,
  onUngroupPatientFiles,
  onRemoveFileFromPatientGroup,
  productionOnly = false,
}: Props) {
  const { token } = useAuthStore();
  const listContainerRef = useRef<HTMLDivElement | null>(null);


  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [shouldRestoreDetailAfterDuplicate, setShouldRestoreDetailAfterDuplicate] =
    useState(false);

  const normalizeKeyPart = useCallback((s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  }, []);

  const toNormalizedFileKey = useCallback(
    (file: File) => `${normalizeKeyPart(file.name)}:${file.size}`,
    [normalizeKeyPart],
  );

  const { fileDiameters, getEstimatedShipForDiameter, handleDiameterComputed, leadTimes } =
    useLeadTimeForecast({
      token,
      weeklyBatchDays,
      files,
      updateCaseInfos,
      toNormalizedFileKey,
    });

  useEffect(() => {
    onLeadTimesChange?.(leadTimes);
  }, [leadTimes, onLeadTimesChange]);

  useEffect(() => {
    if (files.length > 0 && (selectedPreviewIndex === null || selectedPreviewIndex >= files.length)) {
      setSelectedPreviewIndex(0);
    }
  }, [files, selectedPreviewIndex, setSelectedPreviewIndex]);

  useEffect(() => {
    if (!isDetailOpen || !files.length) return;

    const nextIndex =
      selectedPreviewIndex !== null && files[selectedPreviewIndex]
        ? selectedPreviewIndex
        : 0;

    if (detailIndex !== nextIndex) {
      setDetailIndex(nextIndex);
    }
  }, [isDetailOpen, files, selectedPreviewIndex, detailIndex]);

  useEffect(() => {
    if (!duplicatePromptOpen && shouldRestoreDetailAfterDuplicate) {
      setIsDetailOpen(true);
      setShouldRestoreDetailAfterDuplicate(false);
    }
  }, [duplicatePromptOpen, shouldRestoreDetailAfterDuplicate]);

  useEffect(() => {
    if (!isDetailOpen) return;
    const noFiles = files.length === 0;
    const invalidIndex = detailIndex === null || (detailIndex ?? 0) >= files.length;
    if (noFiles || invalidIndex) {
      setIsDetailOpen(false);
    }
  }, [isDetailOpen, files.length, detailIndex]);

  useEffect(() => {
    if (!files.length) return;
    if (caseInfos?.workType !== "abutment") {
      setCaseInfos({
        ...caseInfos,
        workType: "abutment",
      });
    }
  }, [files, caseInfos, setCaseInfos]);

  useEffect(() => {
    if (!focusUnverifiedTick || !files.length) return;
    const grouped = new Set(patientGroups.flatMap((g) => g.fileKeys));
    const firstUnverifiedIndex = files.findIndex((file) => {
      const key = toNormalizedFileKey(file);
      if (grouped.has(key)) {
        const group = findGroupByFileKey(patientGroups, key);
        const primary = group ? getPrimaryFileKey(group) : null;
        if (primary !== key) return false;
      }
      return !fileVerificationStatus[key];
    });
    if (firstUnverifiedIndex < 0) return;

    const container = listContainerRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(
      `[data-file-index="${firstUnverifiedIndex}"]`,
    );
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [
    focusUnverifiedTick,
    files,
    fileVerificationStatus,
    patientGroups,
    toNormalizedFileKey,
  ]);

  const detailFile = detailIndex !== null ? files[detailIndex] : null;
  const detailFileKey = detailFile ? toNormalizedFileKey(detailFile) : null;
  const detailPatientGroup = detailFileKey
    ? findGroupByFileKey(patientGroups, detailFileKey)
    : null;

  const previewFileIndices = useMemo(() => {
    if (detailPatientGroup) {
      const keyToIndex = new Map(
        files.map((file, index) => [toNormalizedFileKey(file), index]),
      );
      return detailPatientGroup.fileKeys
        .map((key) => keyToIndex.get(key))
        .filter((index): index is number => typeof index === "number");
    }
    if (detailIndex != null) return [detailIndex];
    return [];
  }, [detailPatientGroup, detailIndex, files, toNormalizedFileKey]);

  const selectPreviewIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= files.length) return;
      setSelectedPreviewIndex(index);
      setDetailIndex(index);
    },
    [files.length, setSelectedPreviewIndex],
  );

  const detailCaseInfosBase = detailFileKey
    ? caseInfosMap?.[detailFileKey] || caseInfos
    : caseInfos;
  const detailIsOralScan = isLikelyOralScanSize(detailFile?.size);
  const detailIsAbutDesign = isLikelyCustomAbutDesignSize(detailFile?.size);
  // 구강스캔(묶음·단일) → 디자인+생산 고정. 어벗디자인 STL → 생산 고정. 기공소 → 항상 생산.
  const lockDesignProductMode = productionOnly
    ? false
    : Boolean(detailPatientGroup) || detailIsOralScan;
  const lockProductionProductMode = productionOnly
    ? true
    : !lockDesignProductMode && detailIsAbutDesign;
  const detailCaseInfos = productionOnly
    ? {
        ...detailCaseInfosBase,
        productMode: "custom_abutment" as const,
        workType: "abutment" as const,
      }
    : lockDesignProductMode
      ? {
          ...detailCaseInfosBase,
          productMode: "design_custom_abutment" as const,
          workType: "abutment" as const,
        }
      : lockProductionProductMode
        ? {
            ...detailCaseInfosBase,
            productMode: "custom_abutment" as const,
            workType: "abutment" as const,
          }
        : detailCaseInfosBase;

  const setDetailCaseInfos = useCallback(
    (updates: Partial<CaseInfos>) => {
      if (!detailFileKey) {
        setCaseInfos(updates);
        return;
      }
      if (productionOnly) {
        updateCaseInfos(detailFileKey, {
          ...updates,
          productMode: "custom_abutment",
          workType: "abutment",
        });
        return;
      }
      const group = findGroupByFileKey(patientGroups, detailFileKey);
      const fileSize = files.find(
        (f) => toNormalizedFileKey(f) === detailFileKey,
      )?.size;
      const oralScanLocked = isLikelyOralScanSize(fileSize);
      if (group || oralScanLocked) {
        // 구강스캔(묶음·단일)은 항상 디자인+생산
        const nextUpdates: Partial<CaseInfos> = {
          ...updates,
          productMode: "design_custom_abutment",
          workType: "abutment",
        };
        const keys = group ? group.fileKeys : [detailFileKey];
        for (const key of keys) {
          updateCaseInfos(key, nextUpdates);
        }
        return;
      }
      if (isLikelyCustomAbutDesignSize(fileSize)) {
        // 어벗디자인 STL은 항상 생산
        updateCaseInfos(detailFileKey, {
          ...updates,
          productMode: "custom_abutment",
          workType: "abutment",
        });
        return;
      }
      updateCaseInfos(detailFileKey, updates);
    },
    [
      detailFileKey,
      files,
      patientGroups,
      productionOnly,
      setCaseInfos,
      toNormalizedFileKey,
      updateCaseInfos,
    ],
  );

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (duplicatePromptOpen && !nextOpen) return;
      setIsDetailOpen(nextOpen);
    },
    [duplicatePromptOpen],
  );

  const openDetailModal = useCallback(
    (index: number) => {
      const file = files[index];
      if (file && !productionOnly) {
        const fileKey = toNormalizedFileKey(file);
        const group = findGroupByFileKey(patientGroups, fileKey);
        if (group) {
          for (const key of group.fileKeys) {
            updateCaseInfos(key, {
              productMode: "design_custom_abutment",
              workType: "abutment",
            });
          }
        }
      }
      setSelectedPreviewIndex(index);
      setDetailIndex(index);
      setIsDetailOpen(true);
    },
    [
      files,
      patientGroups,
      productionOnly,
      setSelectedPreviewIndex,
      toNormalizedFileKey,
      updateCaseInfos,
    ],
  );

  const focusSelectedCard = useCallback((index: number) => {
    const container = listContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-file-index="${index}"]`);
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const handleKeyboardNavigation = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!files.length) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const currentIndex = selectedPreviewIndex ?? 0;
        const nextIndex = (currentIndex + direction + files.length) % files.length;
        setSelectedPreviewIndex(nextIndex);
        focusSelectedCard(nextIndex);
      }

      if (event.key === "Enter" && selectedPreviewIndex !== null) {
        event.preventDefault();
        openDetailModal(selectedPreviewIndex);
      }
    },
    [files.length, focusSelectedCard, openDetailModal, selectedPreviewIndex, setSelectedPreviewIndex],
  );

  const findNextIndex = useCallback(
    (currentIndex: number, options: { onlyUnverified?: boolean } = {}) => {
      if (!files.length) return currentIndex;
      for (let offset = 1; offset <= files.length; offset += 1) {
        const candidate = (currentIndex + offset) % files.length;
        if (!options.onlyUnverified) return candidate;

        const candidateKey = toNormalizedFileKey(files[candidate]);
        if (!fileVerificationStatus[candidateKey]) {
          return candidate;
        }
      }
      return currentIndex;
    },
    [fileVerificationStatus, files, toNormalizedFileKey],
  );

  const moveToNextDetail = useCallback(
    (options: { onlyUnverified?: boolean } = {}) => {
      if (!files.length) return false;
      const currentIndex = detailIndex ?? selectedPreviewIndex ?? 0;
      const nextIndex = findNextIndex(currentIndex, options);
      if (nextIndex === currentIndex && options.onlyUnverified) {
        return false;
      }
      setSelectedPreviewIndex(nextIndex);
      setDetailIndex(nextIndex);
      return true;
    },
    [detailIndex, files.length, findNextIndex, selectedPreviewIndex, setSelectedPreviewIndex],
  );

  const handleVerifyFile = useCallback(
    async (index: number, options: { stayInModal?: boolean } = {}) => {
      const file = files[index];
      if (!file) return;

      const fileKey = toNormalizedFileKey(file);
      const fileCaseInfos = caseInfosMap?.[fileKey] || caseInfos;
      const missingFields: string[] = [];
      const isDesignCustomMode =
        fileCaseInfos?.productMode === "design_custom_abutment";

      if (isDesignCustomMode) {
        if (!fileCaseInfos?.clinicName) missingFields.push("치과명");
        if (!fileCaseInfos?.patientName) missingFields.push("환자명");
        const hasProsthesis = Array.isArray(fileCaseInfos?.toothWorks)
          ? fileCaseInfos.toothWorks.some(
              (row) =>
                /^[1-4][1-8]$/.test(String(row?.toothNumber || "").trim()) &&
                Boolean(String(row?.prosthesisType || "").trim()),
            )
          : Boolean(String(fileCaseInfos?.prosthesisType || "").trim());
        if (!hasProsthesis) missingFields.push("보철물");
      } else {
        if (!fileCaseInfos?.clinicName) missingFields.push("치과이름");
        if (!fileCaseInfos?.patientName) missingFields.push("환자이름");
        if (!fileCaseInfos?.tooth) missingFields.push("치아번호");
        if (!fileCaseInfos?.implantManufacturer) missingFields.push("임플란트 제조사");
        if (!fileCaseInfos?.implantBrand) missingFields.push("임플란트 브랜드");
        if (!fileCaseInfos?.implantFamily) missingFields.push("Family");
        if (!fileCaseInfos?.implantType) missingFields.push("Type");
      }
      if (missingFields.length > 0) {
        toast({
          title: "정보를 먼저 채워주세요",
          description: `${missingFields.join(", ")}가(이) 비어 있습니다. 디자인과 정보가 모두 맞는지 확인 후 완료해 주세요.`,
          variant: "destructive",
        });
        return;
      }

      const nextStatus: Record<string, boolean> = {
        ...fileVerificationStatus,
        [fileKey]: true,
      };

      const group = findGroupByFileKey(patientGroups, fileKey);
      if (group) {
        for (const key of group.fileKeys) {
          nextStatus[key] = true;
        }
      }

      const countableKeys = new Set<string>();
      if (patientGroups.length > 0) {
        const grouped = new Set(patientGroups.flatMap((g) => g.fileKeys));
        for (const g of patientGroups) {
          const primary = getPrimaryFileKey(g);
          if (primary) countableKeys.add(primary);
        }
        files.forEach((candidate) => {
          const key = toNormalizedFileKey(candidate);
          if (!grouped.has(key)) countableKeys.add(key);
        });
      } else {
        files.forEach((candidate) => {
          countableKeys.add(toNormalizedFileKey(candidate));
        });
      }

      const hasRemainingUnverified = [...countableKeys].some(
        (key) => !nextStatus[key],
      );

      let nextIndex = -1;
      if (hasRemainingUnverified) {
        const isCountableIndex = (i: number) => {
          const key = toNormalizedFileKey(files[i]);
          return countableKeys.has(key);
        };
        for (let i = index + 1; i < files.length; i += 1) {
          const key = toNormalizedFileKey(files[i]);
          if (isCountableIndex(i) && !nextStatus[key]) {
            nextIndex = i;
            break;
          }
        }
        if (nextIndex === -1) {
          for (let i = 0; i < index; i += 1) {
            const key = toNormalizedFileKey(files[i]);
            if (isCountableIndex(i) && !nextStatus[key]) {
              nextIndex = i;
              break;
            }
          }
        }
      }

      if (hasRemainingUnverified) {
        setShouldRestoreDetailAfterDuplicate(true);
      }

      setFileVerificationStatus(nextStatus);
      if (nextIndex !== -1) {
        setSelectedPreviewIndex(nextIndex);
      }
      setHighlightUnverifiedArrows(false);

      if (options.stayInModal && hasRemainingUnverified && nextIndex !== -1) {
        setDetailIndex(nextIndex);
        setIsDetailOpen(true);
      } else {
        setIsDetailOpen(false);
      }
    },
    [
      caseInfos,
      caseInfosMap,
      fileVerificationStatus,
      files,
      patientGroups,
      setFileVerificationStatus,
      setHighlightUnverifiedArrows,
      setSelectedPreviewIndex,
      toast,
      toNormalizedFileKey,
    ],
  );

  const handleClearAll = useCallback(() => {
    onCancelAll();
  }, [onCancelAll]);

  return (
    <div className="app-glass-card app-glass-card--lg relative flex flex-col border-2 border-gray-300 p-3 md:p-4 flex-1 min-h-0 h-full">
      <div className="app-glass-card-content flex flex-col flex-1 min-h-0 h-full">
        <div className="flex flex-col flex-1 min-h-0 h-full">
          <NewRequestAttachmentsPanel
            files={files}
            selectedPreviewIndex={selectedPreviewIndex}
            setSelectedPreviewIndex={setSelectedPreviewIndex}
            fileVerificationStatus={fileVerificationStatus}
            highlightUnverifiedArrows={highlightUnverifiedArrows}
            caseInfosMap={caseInfosMap}
            toNormalizedFileKey={toNormalizedFileKey}
            weeklyBatchDays={weeklyBatchDays}
            leadTimes={leadTimes}
            getEstimatedShipForDiameter={getEstimatedShipForDiameter}
            fileDiameters={fileDiameters}
            handleRemoveFile={handleRemoveFile}
            openDetailModal={openDetailModal}
            handleClearAll={handleClearAll}
            designSoftwareLabel={designSoftwareLabel}
            onOpenDesignSoftwareModal={onOpenDesignSoftwareModal}
            anodizingEnabled={anodizingEnabled}
            anodizingSaving={anodizingSaving}
            onToggleAnodizing={onToggleAnodizing}
            onFilesSelected={onFilesSelected}
            uploadProgress={uploadProgress}
            onKeyboardNavigation={handleKeyboardNavigation}
            listContainerRef={listContainerRef}
            onShippingModeChange={onShippingModeChange}
            defaultShippingMode={defaultShippingMode}
            expressSelectableGlobal={expressSelectableGlobal}
            listItems={attachmentListItems}
            onGroupSelectedFiles={productionOnly ? undefined : onGroupSelectedFiles}
            onUngroup={productionOnly ? undefined : onUngroupPatientFiles}
            onRemoveFileFromGroup={productionOnly ? undefined : onRemoveFileFromPatientGroup}
            productionOnly={productionOnly}
          />
        </div>
      </div>

      <NewRequestDetailDialog
        open={isDetailOpen}
        onOpenChange={handleDialogOpenChange}
        detailIndex={detailIndex}
        selectedPreviewIndex={selectedPreviewIndex}
        files={files}
        detailFile={detailFile}
        detailCaseInfos={detailCaseInfos}
        setDetailCaseInfos={setDetailCaseInfos}
        handleDiameterComputed={handleDiameterComputed}
        connections={connections}
        familyOptions={familyOptions}
        typeOptions={typeOptions}
        implantManufacturer={implantManufacturer}
        setImplantManufacturer={setImplantManufacturer}
        implantBrand={implantBrand}
        setImplantBrand={setImplantBrand}
        implantFamily={implantFamily}
        setImplantFamily={setImplantFamily}
        implantType={implantType}
        setImplantType={setImplantType}
        syncSelectedConnection={syncSelectedConnection}
        clinicNameOptions={clinicNameOptions}
        patientNameOptions={patientNameOptions}
        teethOptions={teethOptions}
        addClinicPreset={addClinicPreset}
        clearAllClinicPresets={clearAllClinicPresets}
        addPatientPreset={addPatientPreset}
        clearAllPatientPresets={clearAllPatientPresets}
        addTeethPreset={addTeethPreset}
        clearAllTeethPresets={clearAllTeethPresets}
        handleAddOrSelectClinic={handleAddOrSelectClinic}
        highlightUnverifiedArrows={highlightUnverifiedArrows}
        handleRemoveFile={handleRemoveFile}
        onVerifyAndNext={(index) => handleVerifyFile(index, { stayInModal: true })}
        onSkip={() => {
          moveToNextDetail();
        }}
        toast={toast}
        lockDesignProductMode={lockDesignProductMode}
        lockProductionProductMode={lockProductionProductMode}
        previewFileIndices={previewFileIndices}
        onSelectPreviewIndex={selectPreviewIndex}
      />


    </div>
  );
}
