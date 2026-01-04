import { useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";
import { NewRequestPatientImplantFields } from "./NewRequestPatientImplantFields";

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Option = { id: string; label: string };

type Props = {
  files: File[];
  filledStlFiles?: Record<string, File>;
  onReportFillHoleIssue?: (originalFile?: File) => void | Promise<void>;
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
    type: string
  ) => void;
  fileVerificationStatus: Record<string, boolean>;
  setFileVerificationStatus: (
    next:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
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
};

export function NewRequestDetailsSection({
  files,
  filledStlFiles,
  onReportFillHoleIssue,
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

  const previewFile =
    selectedFileKey && filledStlFiles?.[selectedFileKey]
      ? filledStlFiles[selectedFileKey]
      : selectedFile;

  const hasSelectedFile = Boolean(
    selectedPreviewIndex !== null && files[selectedPreviewIndex]
  );

  const showImplantSelect = useMemo(() => {
    const selectedWorkType = selectedFile
      ? getFileWorkType(selectedFile)
      : caseInfos?.workType;
    return selectedWorkType === "abutment";
  }, [selectedFile, caseInfos?.workType]);

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 border-gray-300 p-4 md:p-6 transition-shadow hover:shadow-md ${
        highlight ? sectionHighlightClass : ""
      }`}
    >
      <div className="w-full grid gap-4 lg:grid-cols-2 items-start border-gray-200">
        <div className="min-w-0">
          {selectedPreviewIndex !== null && files[selectedPreviewIndex] && (
            <div className="space-y-3">
              {previewFile && (
                <StlPreviewViewer
                  file={previewFile}
                  showOverlay={true}
                  onDiameterComputed={(
                    _filename,
                    maxDiameter,
                    connectionDiameter
                  ) => {
                    const roundedMax = Math.round((maxDiameter ?? 0) * 10) / 10;
                    const roundedConn =
                      Math.round((connectionDiameter ?? 0) * 10) / 10;
                    setCaseInfos({
                      maxDiameter: roundedMax,
                      connectionDiameter: roundedConn,
                    });
                  }}
                />
              )}

              <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-700">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">
                    스크류홀이 메워진 모델에 문제 있으면, 의뢰는 계속 진행하되
                    관리자에게 보고해주세요.
                  </div>
                  <button
                    type="button"
                    className="shrink-0 inline-flex items-center justify-center rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onReportFillHoleIssue?.(selectedFile || undefined);
                    }}
                  >
                    리포트
                  </button>
                </div>
              </div>
            </div>
          )}

          {(!files.length || selectedPreviewIndex === null) && (
            <div className="px-4 flex items-center justify-center h-[260px] md:h-[320px] rounded-2xl border border-dashed border-gray-200 bg-white/60 text-xs md:text-sm text-muted-foreground">
              STL Preview
            </div>
          )}
        </div>

        <div className="space-y-4 text-xs md:text-sm min-w-0">
          <NewRequestPatientImplantFields
            caseInfos={caseInfos}
            setCaseInfos={setCaseInfos}
            showImplantSelect={showImplantSelect}
            readOnly={!hasSelectedFile}
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

          <div className="space-y-4">
            <div>
              <h4 className="text-xs md:text-sm font-semibold mb-2 text-gray-700">
                확인 전
              </h4>
              <div className="flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
                {!hasActiveSession && (
                  <div className="flex items-center justify-center w-full min-h-[120px] rounded-xl border border-dashed border-gray-200 bg-white/60 text-[11px] md:text-sm text-muted-foreground px-6">
                    첨부된 STL 파일
                  </div>
                )}
                {hasActiveSession &&
                  files
                    .map((file, index) => ({ file, index }))
                    .filter(
                      ({ file }) =>
                        !fileVerificationStatus[
                          `${normalizeKeyPart(file.name)}:${file.size}`
                        ]
                    )
                    .map(({ file, index }) => {
                      const filename = file.name;
                      const fileKey = toNormalizedFileKey(file);
                      const isSelected = selectedPreviewIndex === index;

                      return (
                        <div
                          key={`${fileKey}-${index}`}
                          onClick={() => {
                            setSelectedPreviewIndex(index);
                          }}
                          className={`shrink-0 w-48 md:w-56 p-2 md:p-3 rounded-lg cursor-pointer text-xs space-y-2 transition-colors ${
                            isSelected
                              ? "border-2 border-primary shadow-lg"
                              : "border border-gray-200 hover:border-primary/40 hover:shadow"
                          } bg-white text-gray-900`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                            <span className="truncate flex-1">{filename}</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className={`flex items-center justify-center rounded px-1 py-0.5 border transition-all ${
                                  highlightUnverifiedArrows
                                    ? "text-destructive border-destructive bg-destructive/10 animate-bounce shadow-sm"
                                    : "text-primary border-primary/40 bg-primary/5 hover:bg-primary/10"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const fileCaseInfos =
                                    caseInfosMap?.[fileKey] || caseInfos;

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
                                        ", "
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
                                  for (
                                    let i = index + 1;
                                    i < files.length;
                                    i++
                                  ) {
                                    const key = `${normalizeKeyPart(
                                      files[i].name
                                    )}:${files[i].size}`;
                                    if (!nextStatus[key]) {
                                      nextIndex = i;
                                      break;
                                    }
                                  }

                                  if (nextIndex === -1) {
                                    for (let i = 0; i < index; i++) {
                                      const key = `${normalizeKeyPart(
                                        files[i].name
                                      )}:${files[i].size}`;
                                      if (!nextStatus[key]) {
                                        nextIndex = i;
                                        break;
                                      }
                                    }
                                  }

                                  if (nextIndex === -1) {
                                    nextIndex = index;
                                  }

                                  // 중복 의뢰 체크 (확인 전 -> 확인 후 이동 시점)
                                  (async () => {
                                    try {
                                      const query = new URLSearchParams({
                                        clinicName:
                                          fileCaseInfos?.clinicName || "",
                                        patientName:
                                          fileCaseInfos?.patientName || "",
                                        tooth: fileCaseInfos?.tooth || "",
                                      }).toString();

                                      const res = await fetch(
                                        `/api/requests/check-duplicate?${query}`,
                                        {
                                          headers: {
                                            Authorization: `Bearer ${localStorage.getItem(
                                              "token"
                                            )}`,
                                          },
                                        }
                                      );

                                      if (res.ok) {
                                        const data = await res.json();
                                        // CAM(status: CAM or 가공전) 이상 단계가 있으면 차단
                                        if (
                                          data.exists &&
                                          data.stageOrder > 0
                                        ) {
                                          toast({
                                            title: "중복 의뢰가 감지되었습니다",
                                            description:
                                              "이미 진행 중(CAM 이상)인 의뢰가 있습니다. 기존 의뢰를 확인해주세요.",
                                            variant: "destructive",
                                          });
                                          return;
                                        }
                                      }
                                    } catch (err) {
                                      console.error(
                                        "Duplicate check error:",
                                        err
                                      );
                                    }

                                    setFileVerificationStatus(nextStatus);
                                    setSelectedPreviewIndex(nextIndex);
                                    setHighlightUnverifiedArrows(false);
                                  })();
                                }}
                                title="확인 완료"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="text-lg leading-none text-muted-foreground hover:text-destructive flex items-center justify-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveFile(index);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>

            <div>
              <h4 className="text-xs md:text-sm font-semibold mb-2 text-gray-700">
                확인 후
              </h4>
              <div className="flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
                {files
                  .map((file, index) => ({ file, index }))
                  .filter(
                    ({ file }) =>
                      fileVerificationStatus[
                        `${normalizeKeyPart(file.name)}:${file.size}`
                      ]
                  )
                  .map(({ file, index }) => {
                    const filename = file.name;
                    const fileKey = toNormalizedFileKey(file);
                    const isSelected = selectedPreviewIndex === index;

                    return (
                      <div
                        key={`${fileKey}-${index}`}
                        onClick={() => {
                          setSelectedPreviewIndex(index);
                        }}
                        className={`shrink-0 w-48 md:w-56 p-2 md:p-3 rounded-lg cursor-pointer text-xs space-y-2 transition-colors ${
                          isSelected
                            ? "border-2 border-primary bg-primary/10 text-primary shadow-lg"
                            : "border border-primary/40 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10 hover:shadow"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                          <span className="truncate flex-1">{filename}</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-primary flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFileVerificationStatus((prev) => ({
                                  ...prev,
                                  [fileKey]: false,
                                }));
                              }}
                              title="확인 취소"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="text-lg leading-none text-muted-foreground hover:text-destructive flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile(index);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {files.filter(
                  (file) => fileVerificationStatus[`${file.name}:${file.size}`]
                ).length === 0 && (
                  <div className="flex items-center justify-center w-full min-h-[120px] rounded-xl border border-dashed border-gray-200 bg-white/60 text-[11px] md:text-sm text-muted-foreground px-6">
                    확인된 파일이 없습니다
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
