import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";
import { useAuthStore } from "@/store/useAuthStore";
import { useLeadTimeForecast } from "../hooks/useLeadTimeForecast";
import { useCompanionBinding } from "../hooks/useCompanionBinding";
import { NewRequestAttachmentsPanel } from "./NewRequestAttachmentsPanel";
import { NewRequestDetailDialog } from "./NewRequestDetailDialog";
import { NewRequestCompanionDialogs } from "./NewRequestCompanionDialogs";

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
  registerCompanionFileHandler?: (
    handler: (files: File[], options?: { targetStlFileKey?: string }) => void,
  ) => void;
  onCompanionFilesAccepted?: (files: File[]) => void;
  onCompanionFilesChange?: (files: File[]) => void;
  weeklyBatchDays?: string[];
  onCancelAll: () => void;
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
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFilesSelected,
  registerCompanionFileHandler,
  onCompanionFilesAccepted,
  onCompanionFilesChange,
  weeklyBatchDays = [],
  onCancelAll,
}: Props) {
  const { token } = useAuthStore();
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const companionInputRef = useRef<HTMLInputElement | null>(null);

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

  const { fileDiameters, getEstimatedShipForDiameter, handleDiameterComputed } =
    useLeadTimeForecast({
      token,
      weeklyBatchDays,
      files,
      updateCaseInfos,
      toNormalizedFileKey,
    });

  const companion = useCompanionBinding({
    files,
    caseInfosMap,
    updateCaseInfos,
    toNormalizedFileKey,
    toast,
    onFilesSelected,
    onCompanionFilesAccepted,
    onCompanionFilesChange,
    registerCompanionFileHandler,
  });

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
    const firstUnverifiedIndex = files.findIndex((file) => {
      const key = toNormalizedFileKey(file);
      return !fileVerificationStatus[key];
    });
    if (firstUnverifiedIndex < 0) return;

    const container = listContainerRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(
      `[data-file-index="${firstUnverifiedIndex}"]`,
    );
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusUnverifiedTick, files, fileVerificationStatus, toNormalizedFileKey]);

  const detailFile = detailIndex !== null ? files[detailIndex] : null;
  const detailFileKey = detailFile ? toNormalizedFileKey(detailFile) : null;

  const detailCaseInfos = detailFileKey
    ? caseInfosMap?.[detailFileKey] || caseInfos
    : caseInfos;

  const setDetailCaseInfos = useCallback(
    (updates: Partial<CaseInfos>) => {
      if (detailFileKey) {
        updateCaseInfos(detailFileKey, updates);
        return;
      }
      setCaseInfos(updates);
    },
    [detailFileKey, setCaseInfos, updateCaseInfos],
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
      setSelectedPreviewIndex(index);
      setDetailIndex(index);
      setIsDetailOpen(true);
    },
    [setSelectedPreviewIndex],
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

      if (!fileCaseInfos?.clinicName) missingFields.push("치과이름");
      if (!fileCaseInfos?.patientName) missingFields.push("환자이름");
      if (!fileCaseInfos?.tooth) missingFields.push("치아번호");
      if (!fileCaseInfos?.implantManufacturer) missingFields.push("임플란트 제조사");
      if (!fileCaseInfos?.implantBrand) missingFields.push("임플란트 브랜드");
      if (!fileCaseInfos?.implantFamily) missingFields.push("Family");
      if (!fileCaseInfos?.implantType) missingFields.push("Type");

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

      const hasRemainingUnverified = files.some((candidate) => {
        const key = toNormalizedFileKey(candidate);
        return !nextStatus[key];
      });

      let nextIndex = -1;
      if (hasRemainingUnverified) {
        for (let i = index + 1; i < files.length; i += 1) {
          const key = toNormalizedFileKey(files[i]);
          if (!nextStatus[key]) {
            nextIndex = i;
            break;
          }
        }
        if (nextIndex === -1) {
          for (let i = 0; i < index; i += 1) {
            const key = toNormalizedFileKey(files[i]);
            if (!nextStatus[key]) {
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
      setFileVerificationStatus,
      setHighlightUnverifiedArrows,
      setSelectedPreviewIndex,
      toast,
      toNormalizedFileKey,
    ],
  );

  const handleClearAll = useCallback(() => {
    companion.clearCompanionStateForCancelAll();
    onCancelAll();
  }, [companion, onCancelAll]);

  return (
    <div className="app-glass-card app-glass-card--lg relative flex flex-col border-2 border-gray-300 p-2.5 md:p-3.5 flex-1 min-h-0 h-full max-h-[500px]">
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
            getEstimatedShipForDiameter={getEstimatedShipForDiameter}
            fileDiameters={fileDiameters}
            handleRemoveFile={handleRemoveFile}
            openDetailModal={openDetailModal}
            handleClearAll={handleClearAll}
            onFilesSelected={onFilesSelected}
            isDragOver={isDragOver}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onKeyboardNavigation={handleKeyboardNavigation}
            listContainerRef={listContainerRef}
            uploadInputRef={uploadInputRef}
            companionInputRef={companionInputRef}
            companionFiles={companion.companionFiles}
            standaloneCompanionFiles={companion.standaloneCompanionFiles}
            cardDragOverKey={companion.cardDragOverKey}
            setCardDragOverKey={companion.setCardDragOverKey}
            cardLinkDrag={companion.cardLinkDrag}
            setCardLinkDrag={companion.setCardLinkDrag}
            getCompanionFileKey={companion.getCompanionFileKey}
            getEffectiveCompanionsForStl={companion.getEffectiveCompanionsForStl}
            setPendingCompanionTargetStlKey={companion.setPendingCompanionTargetStlKey}
            setPendingCompanionCardForStlUpload={
              companion.setPendingCompanionCardForStlUpload
            }
            handleRemoveCompanionFile={companion.handleRemoveCompanionFile}
            handleMainInputFiles={companion.handleMainInputFiles}
            handleCompanionInputFiles={companion.handleCompanionInputFiles}
            handleCardDrop={companion.handleCardDrop}
            detachDraggingCompanion={companion.detachDraggingCompanion}
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
      />

      <NewRequestCompanionDialogs
        companionPromptOpen={companion.companionPromptOpen}
        setCompanionPromptOpen={companion.setCompanionPromptOpen}
        onBypassMissingCompanion={companion.handleBypassMissingCompanion}
        onUploadCompanion={() => {
          companion.setPendingCompanionTargetStlKey(null);
          companionInputRef.current?.click();
        }}
        pendingCompanionReplace={companion.pendingCompanionReplace}
        setPendingCompanionReplace={companion.setPendingCompanionReplace}
        onConfirmReplace={(stlFileKey, companionFileKey) => {
          companion.linkCompanionToStl(stlFileKey, companionFileKey, { replace: true });
        }}
        toast={toast}
      />
    </div>
  );
}
