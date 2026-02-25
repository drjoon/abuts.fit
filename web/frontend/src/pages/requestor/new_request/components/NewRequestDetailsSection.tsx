import { useEffect, useMemo, useRef, useState } from "react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";
import { NewRequestPatientImplantFields } from "./NewRequestPatientImplantFields";
import { apiFetch } from "@/shared/api/apiClient";

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
  typeOptions: string[];
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantSystem: string;
  setImplantSystem: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (
    manufacturer: string,
    system: string,
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
  typeOptions,
  implantManufacturer,
  setImplantManufacturer,
  implantSystem,
  setImplantSystem,
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
  highlight,
  sectionHighlightClass,
  focusUnverifiedTick,
}: Props) {
  const normalizeKeyPart = (s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  };

  const toNormalizedFileKey = (f: File) => {
    return `${normalizeKeyPart(f.name)}:${f.size}`;
  };

  const hasActiveSession = files.length > 0;
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  const getFileWorkType = (_file: File): "abutment" | "crown" => {
    return "abutment";
  };

  useEffect(() => {
    if (
      files.length > 0 &&
      (selectedPreviewIndex === null || selectedPreviewIndex >= files.length)
    ) {
      setSelectedPreviewIndex(0);
    }
  }, [files, selectedPreviewIndex, setSelectedPreviewIndex]);

  useEffect(() => {
    if (!files.length) return;

    if (caseInfos?.workType !== "abutment") {
      setCaseInfos({
        ...caseInfos,
        workType: "abutment",
      });
    }
  }, [files, caseInfos, setCaseInfos]);

  const selectedFile =
    selectedPreviewIndex !== null ? files[selectedPreviewIndex] : null;

  const selectedFileKey =
    selectedPreviewIndex !== null && files[selectedPreviewIndex]
      ? toNormalizedFileKey(files[selectedPreviewIndex])
      : null;

  const previewFile = selectedFile;

  const hasSelectedFile = Boolean(
    selectedPreviewIndex !== null && files[selectedPreviewIndex],
  );

  const detailFile = detailIndex !== null ? files[detailIndex] : null;
  const detailFileKey = detailFile ? toNormalizedFileKey(detailFile) : null;
  const detailCaseInfos = detailFileKey
    ? caseInfosMap?.[detailFileKey] || caseInfos
    : caseInfos;
  const detailImplantInfo = {
    clinicName: detailCaseInfos?.clinicName || "",
    patientName: detailCaseInfos?.patientName || "",
    tooth: detailCaseInfos?.tooth || "",
    implantManufacturer: detailCaseInfos?.implantManufacturer || "",
    implantSystem: detailCaseInfos?.implantSystem || "",
    implantType: detailCaseInfos?.implantType || "",
  };

  const openDetailModal = (index: number) => {
    setSelectedPreviewIndex(index);
    setDetailIndex(index);
    setIsDetailOpen(true);
  };

  const findNextIndex = (
    currentIndex: number,
    options: { onlyUnverified?: boolean } = {},
  ) => {
    if (!files.length) return currentIndex;
    for (let offset = 1; offset <= files.length; offset++) {
      const candidate = (currentIndex + offset) % files.length;
      if (!options.onlyUnverified) {
        return candidate;
      }
      const candidateKey = toNormalizedFileKey(files[candidate]);
      if (!fileVerificationStatus[candidateKey]) {
        return candidate;
      }
    }
    return currentIndex;
  };

  const moveToNextDetail = (options: { onlyUnverified?: boolean } = {}) => {
    if (!files.length) return false;
    const currentIndex = detailIndex ?? selectedPreviewIndex ?? 0;
    const nextIndex = findNextIndex(currentIndex, options);
    if (nextIndex === currentIndex && options.onlyUnverified) {
      return false;
    }
    setSelectedPreviewIndex(nextIndex);
    setDetailIndex(nextIndex);
    return true;
  };

  const handleVerifyFile = async (
    index: number,
    options: { stayInModal?: boolean } = {},
  ) => {
    const file = files[index];
    if (!file) return;
    const fileKey = toNormalizedFileKey(file);
    const fileCaseInfos = caseInfosMap?.[fileKey] || caseInfos;

    const missingFields: string[] = [];
    if (!fileCaseInfos?.clinicName) {
      missingFields.push("치과이름");
    }
    if (!fileCaseInfos?.patientName) {
      missingFields.push("환자이름");
    }
    if (!fileCaseInfos?.tooth) {
      missingFields.push("치아번호");
    }

    if (missingFields.length > 0) {
      toast({
        title: "정보를 먼저 채워주세요",
        description: `${missingFields.join(
          ", ",
        )}가(이) 비어 있습니다. 디자인과 정보가 모두 맞는지 확인 후 완료해 주세요.`,
        variant: "destructive",
      });
      return;
    }

    const nextStatus: Record<string, boolean> = {
      ...fileVerificationStatus,
      [fileKey]: true,
    };

    let nextIndex = -1;
    for (let i = index + 1; i < files.length; i++) {
      const key = `${normalizeKeyPart(files[i].name)}:${files[i].size}`;
      if (!nextStatus[key]) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex === -1) {
      for (let i = 0; i < index; i++) {
        const key = `${normalizeKeyPart(files[i].name)}:${files[i].size}`;
        if (!nextStatus[key]) {
          nextIndex = i;
          break;
        }
      }
    }

    if (nextIndex === -1) {
      nextIndex = index;
    }

    try {
      const query = new URLSearchParams({
        clinicName: fileCaseInfos?.clinicName || "",
        patientName: fileCaseInfos?.patientName || "",
        tooth: fileCaseInfos?.tooth || "",
      }).toString();

      const res = await apiFetch<any>({
        path: `/api/requests/my/check-duplicate?${query}`,
        method: "GET",
      });

      const body: any = res.data || {};
      const data = body?.data || body;

      if (res.ok && data?.exists && Number(data?.stageOrder) >= 2) {
        toast({
          title: "중복 의뢰가 감지되었습니다",
          description:
            "생산/발송/완료 단계의 기존 의뢰가 있습니다. 기존 의뢰를 확인해주세요.",
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.error("Duplicate check error:", err);
    }

    setFileVerificationStatus(nextStatus);
    setSelectedPreviewIndex(nextIndex);
    setHighlightUnverifiedArrows(false);

    const hasRemainingUnverified = files.some((candidate) => {
      const key = toNormalizedFileKey(candidate);
      return !nextStatus[key];
    });

    if (options.stayInModal && hasRemainingUnverified) {
      setDetailIndex(nextIndex);
      setIsDetailOpen(true);
    } else {
      setIsDetailOpen(false);
    }
  };

  const showImplantSelect = useMemo(() => {
    const selectedWorkType = selectedFile
      ? getFileWorkType(selectedFile)
      : caseInfos?.workType;
    return selectedWorkType === "abutment";
  }, [selectedFile, caseInfos?.workType]);

  const requiredFieldsPresent = (info?: CaseInfos | null) => {
    if (!info) return false;
    return Boolean(info.clinicName && info.patientName && info.tooth);
  };

  useEffect(() => {
    if (!files.length) return;
    let changed = false;
    const nextStatus: Record<string, boolean> = { ...fileVerificationStatus };

    files.forEach((file) => {
      const key = toNormalizedFileKey(file);
      if (!fileVerificationStatus[key]) return;
      const info =
        (caseInfosMap && caseInfosMap[key]) ||
        caseInfosMap?.__default__ ||
        caseInfos;
      if (!requiredFieldsPresent(info)) {
        nextStatus[key] = false;
        changed = true;
      }
    });

    if (changed) {
      setFileVerificationStatus(nextStatus);
    }
  }, [
    caseInfosMap,
    caseInfos,
    fileVerificationStatus,
    files,
    setFileVerificationStatus,
  ]);

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
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusUnverifiedTick, files, fileVerificationStatus]);

  const focusSelectedCard = (index: number) => {
    const container = listContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-file-index="${index}"]`,
    );
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  const handleKeyboardNavigation = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (!files.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const currentIndex = selectedPreviewIndex ?? 0;
      const nextIndex =
        (currentIndex + direction + files.length) % files.length;
      setSelectedPreviewIndex(nextIndex);
      focusSelectedCard(nextIndex);
    }
    if (event.key === "Enter" && selectedPreviewIndex !== null) {
      event.preventDefault();
      openDetailModal(selectedPreviewIndex);
    }
  };

  return (
    <div
      className={`app-glass-card app-glass-card--lg relative flex flex-col border-2 border-gray-300 p-2.5 md:p-3.5 flex-1 min-h-0 h-full max-h-[500px]`}
    >
      <div className="app-glass-card-content flex flex-col flex-1 min-h-0 h-full">
        <div className="flex flex-col flex-1 min-h-0 h-full">
          <div
            ref={listContainerRef}
            className="flex flex-col gap-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 px-2 py-2 flex-1 min-h-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 -mx-1"
            tabIndex={0}
            role="listbox"
            aria-label="첨부된 STL 파일 목록"
            onKeyDown={handleKeyboardNavigation}
          >
            {!hasActiveSession && (
              <div className="app-glass-card app-glass-card--lg flex items-center justify-center w-full min-h-[120px] rounded-xl border border-dashed border-gray-200 bg-white/60 text-[11px] md:text-sm text-muted-foreground px-6">
                첨부된 STL 파일
              </div>
            )}
            {hasActiveSession &&
              files
                .map((file, index) => ({ file, index }))
                .map(({ file, index }) => {
                  const filename = file.name;
                  const fileKey = toNormalizedFileKey(file);
                  const isSelected = selectedPreviewIndex === index;
                  const isVerified = !!fileVerificationStatus[fileKey];
                  const isUnverifiedHighlight =
                    highlightUnverifiedArrows && !isVerified;
                  const baseClasses = isVerified
                    ? "border border-gray-200 bg-white text-gray-900"
                    : "border border-red-300 bg-red-50 text-red-800";
                  const stateClasses = isSelected
                    ? isVerified
                      ? "border-primary bg-primary/10 text-primary shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
                      : "border-red-400 bg-red-50 shadow-[0_4px_12px_rgba(248,113,113,0.2)]"
                    : "";
                  const ringClasses = (() => {
                    if (isSelected) {
                      return "ring-2 ring-primary ring-offset-2 ring-offset-white";
                    }
                    if (isUnverifiedHighlight) {
                      return "ring-2 ring-red-400 ring-offset-2 ring-offset-white";
                    }
                    return "";
                  })();

                  return (
                    <div
                      key={`${fileKey}-${index}`}
                      onClick={() => {
                        openDetailModal(index);
                      }}
                      data-file-index={index}
                      className={`relative shrink-0 app-glass-card w-full px-4 py-3.5 rounded-xl cursor-pointer transition-all flex items-center ${baseClasses} ${stateClasses} ${ringClasses} hover:border-gray-400`}
                    >
                      <div className="relative z-10 flex items-center justify-between gap-3">
                        <div className="truncate flex-1">{filename}</div>
                        <div className="flex items-center gap-1">
                          {isVerified && (
                            <Check
                              className="w-4 h-4 text-primary"
                              aria-label="확인됨"
                            />
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
                    </div>
                  );
                })}
          </div>
        </div>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              STL 확인 및 정보 입력
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 items-stretch mr-4">
            <div className="app-glass-card app-glass-card--lg">
              <div className="app-glass-card-content">
                {detailFile ? (
                  <StlPreviewViewer
                    file={detailFile}
                    showOverlay={true}
                    className="min-h-[240px] h-[240px] md:h-[280px]"
                    onDiameterComputed={(
                      _filename,
                      maxDiameter,
                      connectionDiameter,
                    ) => {
                      const roundedMax =
                        Math.round((maxDiameter ?? 0) * 10) / 10;
                      const roundedConn =
                        Math.round((connectionDiameter ?? 0) * 10) / 10;
                      setCaseInfos({
                        maxDiameter: roundedMax,
                        connectionDiameter: roundedConn,
                      });
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    STL Preview
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3 h-full">
              <div className="app-glass-card app-glass-card--lg">
                <div className="app-glass-card-content space-y-2.5 text-sm">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    임플란트/환자 정보
                  </div>
                  <NewRequestPatientImplantFields
                    caseInfos={caseInfos}
                    setCaseInfos={setCaseInfos}
                    showImplantSelect={showImplantSelect}
                    readOnly={!detailFile}
                    connections={connections}
                    typeOptions={typeOptions}
                    implantManufacturer={implantManufacturer}
                    setImplantManufacturer={setImplantManufacturer}
                    implantSystem={implantSystem}
                    setImplantSystem={setImplantSystem}
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
                  />
                </div>
              </div>
              <DialogFooter className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (detailIndex !== null) {
                        handleRemoveFile(detailIndex);
                      }
                      setIsDetailOpen(false);
                    }}
                  >
                    삭제
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDetailOpen(false)}
                  >
                    취소
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className={
                      highlightUnverifiedArrows
                        ? "animate-bounce bg-primary text-white"
                        : undefined
                    }
                    onClick={() => {
                      if (detailIndex !== null) {
                        void handleVerifyFile(detailIndex, {
                          stayInModal: true,
                        });
                      }
                    }}
                  >
                    확인 & 다음
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-slate-500"
                    onClick={() => {
                      const moved = moveToNextDetail({ onlyUnverified: true });
                      if (!moved) {
                        setIsDetailOpen(false);
                      }
                    }}
                    disabled={!files.length}
                  >
                    건너뛰기
                  </Button>
                </div>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
