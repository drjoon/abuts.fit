import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Plus,
  Truck,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import { useNewRequestPage } from "@/features/requestor/hooks/useNewRequestPage";
import LabeledAutocompleteField from "@/components/LabeledAutocompleteField";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { request } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { usePresetStorage } from "@/features/requestor/hooks/new_requests/usePresetStorage";

/**
 * New Request 페이지 (리팩터링 버전)
 * - caseInfos를 단일 소스로 사용 (aiFileInfos 제거)
 * - 파일별 메타데이터는 Draft.files에서 관리
 * - 환자명/치아번호 옵션은 caseInfos에서 파생
 */
const SHIPPING_POLICY_STORAGE_PREFIX = "abutsfit:shipping-policy:v1:";

const getShippingPolicy = (email?: string | null) => {
  const key = `${SHIPPING_POLICY_STORAGE_PREFIX}${email || "guest"}`;
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    const shippingMode = parsed.shippingMode || "countBased";
    const autoBatchThreshold = parsed.autoBatchThreshold || 20;
    const maxWaitDays = parsed.maxWaitDays || 3;
    const weeklyBatchDays = parsed.weeklyBatchDays || ["mon", "thu"];

    if (shippingMode === "weeklyBased") {
      const dayLabels: Record<string, string> = {
        mon: "월",
        tue: "화",
        wed: "수",
        thu: "목",
        fri: "금",
      };
      const selectedDays = weeklyBatchDays.map((d) => dayLabels[d]).join("/");
      return {
        shippingMode,
        summary: `${selectedDays} 도착`,
      } as const;
    }

    return {
      shippingMode,
      summary: `${autoBatchThreshold}개씩 발송, 최대 ${maxWaitDays}일 대기`,
    } as const;
  } catch {
    return {
      shippingMode: "countBased" as const,
      summary: "20개씩 발송, 최대 3일 대기",
    } as const;
  }
};

export const NewRequestPage = () => {
  const { id: existingRequestId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const FILE_SIZE_THRESHOLD_BYTES = 1 * 1024 * 1024; // 1MB

  const { toast } = useToast();

  // hasActiveSession을 상태 대신 files.length로 직접 계산
  // 상태 동기화 문제를 완전히 제거

  const {
    user,
    files,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleUpload,
    handleRemoveFile,
    typeOptions,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantType,
    setImplantType,
    syncSelectedConnection,
    handleSubmit,
    handleCancel,
    caseInfos,
    setCaseInfos,
    connections,
    resetDraft,
    caseInfosMap,
    updateCaseInfos,
    patchDraftImmediately,
    handleAddOrSelectClinic,
  } = useNewRequestPage(existingRequestId);

  // hasActiveSession은 files.length > 0으로 직접 계산
  const hasActiveSession = files.length > 0;

  const [fileWorkTypes, setFileWorkTypes] = useState<
    Record<string, "abutment" | "crown">
  >({});
  const [hasUserChosenWorkType, setHasUserChosenWorkType] = useState(false);
  const [fileVerificationStatus, setFileVerificationStatus] = useState<
    Record<string, boolean>
  >({});
  const [highlightUnverifiedArrows, setHighlightUnverifiedArrows] =
    useState(false);
  const manufacturerSelectRef = useRef<HTMLButtonElement | null>(null);
  const crownOnlyToastShownRef = useRef(false);

  // 프리셋 관리 (환자명, 치아번호, 치과명)
  const {
    presets: patientPresets,
    addPreset: addPatientPreset,
    deletePreset: deletePatientPreset,
    clearAllPresets: clearAllPatientPresets,
  } = usePresetStorage("patient-names");
  const {
    presets: teethPresets,
    addPreset: addTeethPreset,
    deletePreset: deleteTeethPreset,
    clearAllPresets: clearAllTeethPresets,
  } = usePresetStorage("teeth-numbers");
  const {
    presets: clinicPresets,
    addPreset: addClinicPreset,
    deletePreset: deleteClinicPreset,
    clearAllPresets: clearAllClinicPresets,
  } = usePresetStorage("clinic-names");

  const handleCancelAll = async () => {
    // 1) 서버 Draft + 로컬 Draft 캐시 완전 초기화
    // resetDraft() 내부에서 setCaseInfos({ workType: "abutment" })를 호출하므로
    // 여기서 별도로 setCaseInfos를 호출하면 안 됨 (updateCaseInfos가 PATCH를 트리거함)
    await resetDraft();

    // 2) 클라이언트 상태 초기화 (기존 로직 유지)
    handleCancel();

    // hasActiveSession은 files.length로 자동 계산되므로 별도 설정 불필요

    setFileWorkTypes({});
    setHasUserChosenWorkType(false);
    setFileVerificationStatus({});

    // 환자/치과/치아 및 임플란트/배송 관련 caseInfos도 모두 초기화
    setCaseInfos({
      clinicName: "",
      patientName: "",
      tooth: "",
      implantSystem: "",
      implantType: "",
      connectionType: "",
      maxDiameter: undefined,
      connectionDiameter: undefined,
      shippingMode: undefined,
      requestedShipDate: undefined,
      workType: "abutment",
    });

    // NOTE: setCaseInfos는 resetDraft() 내부에서 이미 초기화됨
    // 여기서 다시 호출하면 updateCaseInfos가 이전 draftId로 PATCH를 시도함

    setImplantManufacturer("");
    setImplantSystem("");
    setImplantType("");

    const fileInput = document.getElementById(
      "file-input"
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  // 비즈니스 데이(주말 제외) 더하기
  const addBusinessDays = (startDate: Date, days: number) => {
    let count = 0;
    const current = new Date(startDate);
    while (count < days) {
      current.setDate(current.getDate() + 1);
      const day = current.getDay(); // 0: 일, 6: 토
      if (day !== 0 && day !== 6) {
        count++;
      }
    }
    return current;
  };

  // 최대 직경에 따른 신속 배송 발송일 계산
  const calculateExpressDate = (maxDiameter?: number) => {
    const today = new Date();

    // 8mm 이하: 내일 가공/발송
    if (maxDiameter === undefined || maxDiameter <= 8) {
      const shipDate = addBusinessDays(today, 1);
      return shipDate.toISOString().split("T")[0];
    }

    // 8mm 초과(10mm, 10+): 매주 수요일 발송
    // 월요일(1)까지 접수 → 이번주 수요일(3),
    // 화요일(2) 이후 접수 → 다음주 수요일
    const currentDay = today.getDay(); // 0~6
    const targetDow = 3; // 수요일

    let daysToAdd = targetDow - currentDay;
    if (currentDay > 1) {
      // 화요일(2) 이후면 다음주 수요일로 넘김
      daysToAdd += 7;
    }
    if (daysToAdd <= 0) {
      daysToAdd += 7;
    }

    const shipDate = new Date(today);
    shipDate.setDate(today.getDate() + daysToAdd);
    return shipDate.toISOString().split("T")[0];
  };

  const expressShipDate =
    caseInfos?.shippingMode === "express"
      ? caseInfos?.requestedShipDate ??
        calculateExpressDate(caseInfos?.maxDiameter)
      : calculateExpressDate(caseInfos?.maxDiameter); // 항상 계산

  const expressArrivalDate =
    caseInfos?.maxDiameter && expressShipDate
      ? addBusinessDays(new Date(expressShipDate), 1)
          .toISOString()
          .split("T")[0]
      : undefined;

  const { summary: bulkShippingSummary } = getShippingPolicy(user?.email);

  // 치과명 옵션 (프리셋 기반)
  const clinicNameOptions = useMemo(
    () => clinicPresets.map((p) => ({ id: p.id, label: p.label })),
    [clinicPresets]
  );

  // 환자명 옵션 (프리셋 기반)
  const patientNameOptions = useMemo(
    () => patientPresets.map((p) => ({ id: p.id, label: p.label })),
    [patientPresets]
  );

  // 치아번호 옵션 (프리셋 기반)
  const teethOptions = useMemo(
    () => teethPresets.map((p) => ({ id: p.id, label: p.label })),
    [teethPresets]
  );

  // 선택된 파일의 workType 결정 (어벗만 허용)
  const getFileWorkType = (file: File): "abutment" | "crown" => {
    // 어벗만 허용, 항상 abutment 반환
    return "abutment";
  };

  // 파일 업로드 시 크라운 파일 필터링 (1MB 이상 파일 거부)
  const validateFileForUpload = (
    file: File
  ): { valid: boolean; message?: string } => {
    if (file.size >= FILE_SIZE_THRESHOLD_BYTES) {
      return {
        valid: false,
        message:
          "1MB 이상의 파일은 업로드할 수 없습니다. 커스텀 어벗 STL 파일만 업로드해주세요.",
      };
    }
    return { valid: true };
  };

  // 파일이 업로드되면 첫 번째 파일을 자동 선택하여 상세/폼 영역이 바로 보이도록 한다.
  useEffect(() => {
    if (
      files.length > 0 &&
      (selectedPreviewIndex === null || selectedPreviewIndex >= files.length)
    ) {
      setSelectedPreviewIndex(0);
    }
  }, [files, selectedPreviewIndex, setSelectedPreviewIndex]);

  // 어벗만 허용하므로 workType은 항상 abutment
  useEffect(() => {
    if (!files.length) return;

    if (caseInfos?.workType !== "abutment") {
      setCaseInfos({
        ...caseInfos,
        workType: "abutment",
      });
    }
  }, [files, caseInfos, setCaseInfos]);

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* ===== RED SECTION: File Selection & Details (Dynamic) ===== */}
        <div className="relative flex flex-col rounded-2xl border-2 border-gray-300 p-4 md:p-6  transition-shadow hover:shadow-md">
          {/* File Details & Case Info */}
          <div className="w-full grid gap-4 lg:grid-cols-2 items-start border-gray-200">
            {/* 3D Viewer (좌측) */}
            <div className="min-w-0">
              {selectedPreviewIndex !== null &&
                files[selectedPreviewIndex] &&
                (() => {
                  const selectedFile = files[selectedPreviewIndex];
                  const selectedWorkType = getFileWorkType(selectedFile);
                  const isAbutment = selectedWorkType === "abutment";

                  return (
                    <StlPreviewViewer
                      file={selectedFile}
                      showOverlay={isAbutment}
                      onDiameterComputed={(
                        _filename,
                        maxDiameter,
                        connectionDiameter
                      ) => {
                        if (!isAbutment) return;
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
                  );
                })()}

              {(!files.length || selectedPreviewIndex === null) && (
                <div className="px-4 flex items-center justify-center h-[260px] md:h-[320px] rounded-2xl border border-dashed border-gray-200 bg-white/60 text-xs md:text-sm text-muted-foreground">
                  STL Preview
                </div>
              )}
            </div>

            {/* Case Info Form + 드롭박스 (우측) */}
            <div className="space-y-4 text-xs md:text-sm min-w-0">
              <div className="">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-foreground ">
                  {/* 치과명 */}
                  <div className="min-w-0">
                    <LabeledAutocompleteField
                      value={caseInfos?.clinicName || ""}
                      onChange={(value) => {
                        setCaseInfos({
                          clinicName: value,
                        });
                      }}
                      options={clinicNameOptions}
                      placeholder="치과명"
                      onOptionSelect={(label) => {
                        handleAddOrSelectClinic(label);
                        addClinicPreset(label);
                      }}
                      onClear={() => {
                        // 현재 입력만 비움 (프리셋은 유지)
                        setCaseInfos({
                          clinicName: "",
                        });
                      }}
                      onDelete={() => {
                        // 치과명 프리셋 히스토리 전체 삭제 + 현재 값도 비움
                        clearAllClinicPresets();
                        setCaseInfos({
                          clinicName: "",
                        });
                      }}
                      onBlur={() => {
                        if (caseInfos?.clinicName) {
                          handleAddOrSelectClinic(caseInfos.clinicName);
                          addClinicPreset(caseInfos.clinicName);
                        }
                      }}
                      inputClassName="h-8 text-xs w-full pr-10"
                    />
                  </div>

                  {/* 환자명 */}
                  <div className="min-w-0">
                    <LabeledAutocompleteField
                      value={caseInfos?.patientName || ""}
                      onChange={(value) => {
                        setCaseInfos({
                          patientName: value,
                        });
                      }}
                      options={patientNameOptions}
                      placeholder="환자명"
                      onOptionSelect={(label) => {
                        setCaseInfos({
                          patientName: label,
                        });
                        // 옵션 선택 시 프리셋에 추가
                        addPatientPreset(label);
                      }}
                      onClear={() => {
                        setCaseInfos({
                          patientName: "",
                        });
                      }}
                      onDelete={() => {
                        // 환자명 프리셋 히스토리 전체 삭제 + 현재 값 비움
                        clearAllPatientPresets();
                        setCaseInfos({
                          patientName: "",
                        });
                      }}
                      onBlur={() => {
                        // blur 시 프리셋에 자동 저장
                        if (caseInfos?.patientName) {
                          addPatientPreset(caseInfos.patientName);
                        }
                      }}
                      inputClassName="h-8 text-xs w-full pr-10"
                    />
                  </div>

                  {/* 치아번호 */}
                  <div className="min-w-0">
                    <LabeledAutocompleteField
                      value={caseInfos?.tooth || ""}
                      onChange={(value) => {
                        setCaseInfos({
                          tooth: value,
                        });
                      }}
                      options={teethOptions}
                      placeholder="치아번호"
                      onOptionSelect={(label) => {
                        setCaseInfos({
                          tooth: label,
                        });
                        // 옵션 선택 시 프리셋에 추가
                        addTeethPreset(label);
                      }}
                      onClear={() => {
                        setCaseInfos({
                          tooth: "",
                        });
                      }}
                      onDelete={() => {
                        // 치아번호 프리셋 히스토리 전체 삭제 + 현재 값 비움
                        clearAllTeethPresets();
                        setCaseInfos({
                          tooth: "",
                        });
                      }}
                      onBlur={() => {
                        // blur 시 프리셋에 자동 저장
                        if (caseInfos?.tooth) {
                          addTeethPreset(caseInfos.tooth);
                        }
                      }}
                      inputClassName="h-8 text-xs w-full pr-10"
                    />
                  </div>
                </div>
              </div>

              {/* Implant Info (어벗만) */}
              {(() => {
                const selectedFile =
                  selectedPreviewIndex !== null
                    ? files[selectedPreviewIndex]
                    : null;
                const selectedWorkType = selectedFile
                  ? getFileWorkType(selectedFile)
                  : caseInfos?.workType;

                return selectedWorkType === "abutment";
              })() && (
                <div className="space-y-4">
                  {/* 임플란트 선택 */}
                  <div className="space-y-1">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] md:text-[11px]">
                      <div className="min-w-0 space-y-1">
                        <Select
                          value={implantManufacturer}
                          onValueChange={(value) => {
                            setImplantManufacturer(value);
                            setImplantSystem("");
                            setImplantType("");
                            syncSelectedConnection(value, "", "");
                            setCaseInfos({
                              implantSystem: value,
                              implantType: "",
                              connectionType: "",
                            });
                          }}
                        >
                          <SelectTrigger ref={manufacturerSelectRef}>
                            <SelectValue placeholder="제조사" />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              ...new Set(
                                connections.map((c) => c.manufacturer)
                              ),
                            ].map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <Select
                          value={implantSystem}
                          onValueChange={(value) => {
                            setImplantSystem(value);
                            setImplantType("");
                            syncSelectedConnection(
                              implantManufacturer,
                              value,
                              ""
                            );
                            setCaseInfos({
                              implantType: value,
                              connectionType: "",
                            });
                          }}
                          disabled={!implantManufacturer}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="시스템" />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              ...new Set(
                                connections
                                  .filter(
                                    (c) =>
                                      c.manufacturer === implantManufacturer
                                  )
                                  .map((c) => c.system)
                              ),
                            ].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <Select
                          value={implantType}
                          onValueChange={(value) => {
                            setImplantType(value);
                            syncSelectedConnection(
                              implantManufacturer,
                              implantSystem,
                              value
                            );
                            setCaseInfos({
                              connectionType: value,
                            });
                          }}
                          disabled={!implantSystem}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="유형" />
                          </SelectTrigger>
                          <SelectContent>
                            {typeOptions.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* File Cards - 확인 전 / 확인 후 분리 */}
              <div className="space-y-4">
                {/* 확인 전 섹션 */}
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
                            !fileVerificationStatus[`${file.name}:${file.size}`]
                        )
                        .map(({ file, index }) => {
                          const filename = file.name;
                          const workType = getFileWorkType(file);
                          const isSelected = selectedPreviewIndex === index;
                          const fileKey = `${file.name}:${file.size}`;

                          const isAbutment = workType === "abutment";
                          const isCrown = workType === "crown";

                          return (
                            <div
                              key={fileKey}
                              onClick={() => {
                                const currentWorkType = getFileWorkType(file);
                                setHasUserChosenWorkType(true);

                                setSelectedPreviewIndex(index);

                                const fileInfoFromMap = caseInfosMap?.[fileKey];
                                if (fileInfoFromMap) {
                                  updateCaseInfos(fileKey, fileInfoFromMap);
                                } else {
                                  updateCaseInfos(fileKey, {
                                    workType: currentWorkType,
                                  });
                                }

                                if (
                                  currentWorkType === "abutment" &&
                                  !implantManufacturer &&
                                  !implantSystem &&
                                  !implantType
                                ) {
                                  setImplantManufacturer("OSSTEM");
                                  setImplantSystem("Regular");
                                  setImplantType("Hex");
                                  syncSelectedConnection(
                                    "OSSTEM",
                                    "Regular",
                                    "Hex"
                                  );

                                  updateCaseInfos(fileKey, {
                                    ...(fileInfoFromMap || {}),
                                    implantSystem: "OSSTEM",
                                    implantType: "Regular",
                                    connectionType: "Hex",
                                  });
                                }
                              }}
                              className={`shrink-0 w-48 md:w-56 p-2 md:p-3 rounded-lg cursor-pointer text-xs space-y-2 transition-colors ${
                                isSelected
                                  ? "border-2 border-primary shadow-lg"
                                  : "border border-gray-200 hover:border-primary/40 hover:shadow"
                              } bg-white text-gray-900`}
                            >
                              <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                                <span className="truncate flex-1">
                                  {filename}
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    className={`flex items-center justify-center rounded px-1 py-0.5 border transition-all ${
                                      highlightUnverifiedArrows
                                        ? "text-primary border-primary bg-primary/10 animate-bounce shadow-sm"
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

                                      // 현재 파일을 확인 후로 이동시키면서, 다음 선택될 파일 인덱스를 계산
                                      const nextStatus: Record<
                                        string,
                                        boolean
                                      > = {
                                        ...fileVerificationStatus,
                                        [fileKey]: true,
                                      };

                                      // 1순위: 현재 인덱스 이후의 "확인 전" 파일
                                      let nextIndex = -1;
                                      for (
                                        let i = index + 1;
                                        i < files.length;
                                        i++
                                      ) {
                                        const key = `${files[i].name}:${files[i].size}`;
                                        if (!nextStatus[key]) {
                                          nextIndex = i;
                                          break;
                                        }
                                      }

                                      // 2순위: 현재 인덱스 이전의 "확인 전" 파일
                                      if (nextIndex === -1) {
                                        for (let i = 0; i < index; i++) {
                                          const key = `${files[i].name}:${files[i].size}`;
                                          if (!nextStatus[key]) {
                                            nextIndex = i;
                                            break;
                                          }
                                        }
                                      }

                                      // 3순위: 확인 전 파일이 더 이상 없으면, 방금 이동한 파일(확인 후)을 선택
                                      if (nextIndex === -1) {
                                        nextIndex = index;
                                      }

                                      setFileVerificationStatus(nextStatus);
                                      setSelectedPreviewIndex(nextIndex);
                                      setHighlightUnverifiedArrows(false);
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

                {/* 확인 후 섹션 */}
                <div>
                  <h4 className="text-xs md:text-sm font-semibold mb-2 text-gray-700">
                    확인 후
                  </h4>
                  <div className="flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
                    {files
                      .map((file, index) => ({ file, index }))
                      .filter(
                        ({ file }) =>
                          fileVerificationStatus[`${file.name}:${file.size}`]
                      )
                      .map(({ file, index }) => {
                        const filename = file.name;
                        const workType = getFileWorkType(file);
                        const isSelected = selectedPreviewIndex === index;
                        const fileKey = `${file.name}:${file.size}`;

                        const isAbutment = workType === "abutment";
                        const isCrown = workType === "crown";

                        return (
                          <div
                            key={fileKey}
                            onClick={() => {
                              const currentWorkType = getFileWorkType(file);
                              setHasUserChosenWorkType(true);

                              setSelectedPreviewIndex(index);

                              const fileInfoFromMap = caseInfosMap?.[fileKey];
                              if (fileInfoFromMap) {
                                updateCaseInfos(fileKey, fileInfoFromMap);
                              } else {
                                updateCaseInfos(fileKey, {
                                  workType: currentWorkType,
                                });
                              }

                              if (
                                currentWorkType === "abutment" &&
                                !implantManufacturer &&
                                !implantSystem &&
                                !implantType
                              ) {
                                setImplantManufacturer("OSSTEM");
                                setImplantSystem("Regular");
                                setImplantType("Hex");
                                syncSelectedConnection(
                                  "OSSTEM",
                                  "Regular",
                                  "Hex"
                                );

                                updateCaseInfos(fileKey, {
                                  ...(fileInfoFromMap || {}),
                                  implantSystem: "OSSTEM",
                                  implantType: "Regular",
                                  connectionType: "Hex",
                                });
                              }
                            }}
                            className={`shrink-0 w-48 md:w-56 p-2 md:p-3 rounded-lg cursor-pointer text-xs space-y-2 transition-colors ${
                              isSelected
                                ? "border-2 border-primary bg-primary/10 text-primary shadow-lg"
                                : "border border-primary/40 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10 hover:shadow"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                              <span className="truncate flex-1">
                                {filename}
                              </span>
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
                      (file) =>
                        fileVerificationStatus[`${file.name}:${file.size}`]
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

        {/* ===== GREEN SECTION: Shipping & Action Buttons (Dynamic) ===== */}
        {(() => {
          const hasSelectedFile =
            selectedPreviewIndex !== null && !!files[selectedPreviewIndex];
          const hasCaseInfos = !!caseInfos;
          return hasSelectedFile || hasCaseInfos;
        })() && (
          <div className="grid grid-cols-1 lg:grid-cols-2 mt-2">
            <div className="mb-4 lg:mb-0 mr-4">
              {/* BLUE SECTION: File Upload Area (GREEN 섹션 좌측 열로 이동) */}
              <div
                className={`border-2 border-dashed rounded-2xl p-4 md:p-6 text-center transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-primary/50 bg-white"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                커스텀 어벗 STL 파일 드롭
                <p className="text-base md:text-lg font-medium mb-2"></p>
                <Button
                  variant="outline"
                  className="text-xs md:text-sm"
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  <Upload className="h-6 md:h-8 w-6 md:w-8 mx-auto text-muted-foreground" />{" "}
                  파일 선택
                </Button>
                <p className="text-xs md:text-sm text-muted-foreground mt-2">
                  치과이름, 환자이름, 치아번호가 순서대로 포함된 파일명으로
                  업로드하시면 환자 정보가 자동으로 채워집니다.
                </p>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fileList = e.currentTarget.files;
                    if (fileList) {
                      const filesToUpload: File[] = [];
                      const rejectedFiles: string[] = [];

                      Array.from(fileList).forEach((file) => {
                        const validation = validateFileForUpload(file);
                        if (validation.valid) {
                          filesToUpload.push(file);
                        } else {
                          rejectedFiles.push(file.name);
                        }
                      });

                      if (rejectedFiles.length > 0) {
                        toast({
                          title: "파일 업로드 불가",
                          description: `${rejectedFiles.join(
                            ", "
                          )} - 1MB 이상의 파일은 업로드할 수 없습니다. 커스텀 어벗 STL 파일만 업로드해주세요.`,
                          variant: "destructive",
                          duration: 4000,
                        });
                      }

                      if (filesToUpload.length > 0) {
                        handleUpload(filesToUpload);
                      }
                    }
                    // 동일 파일을 다시 선택해도 onChange가 항상 호출되도록 value 초기화
                    e.currentTarget.value = "";
                  }}
                  accept=".stl"
                />
              </div>
            </div>
            <div className="relative flex flex-col rounded-2xl border-2 border-gray-300 p-4 md:p-6  transition-shadow hover:shadow-md">
              {/* 배송 옵션 */}
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* 묶음 배송 카드 - FunctionalItemCard 적용 */}
                  <FunctionalItemCard
                    onUpdate={() =>
                      navigate("/dashboard/settings?tab=shipping")
                    }
                    className="col-span-1"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setCaseInfos({
                          shippingMode: "normal",
                          requestedShipDate: undefined,
                        })
                      }
                      className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                        (caseInfos?.shippingMode || "normal") === "normal"
                          ? "border-primary bg-primary/5 text-primary font-medium"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                      <span className="flex flex-col items-start leading-tight">
                        <span>묶음 배송</span>
                        <span className="text-[11px] md:text-xs opacity-80 font-normal">
                          {bulkShippingSummary}
                        </span>
                      </span>
                    </button>
                  </FunctionalItemCard>

                  {/* 신속 배송 버튼 */}
                  <button
                    type="button"
                    onClick={() => {
                      const expressDate = calculateExpressDate(
                        caseInfos?.maxDiameter
                      );
                      setCaseInfos({
                        shippingMode: "express",
                        requestedShipDate: expressDate,
                      });
                    }}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                      caseInfos?.shippingMode === "express"
                        ? "border-orange-500 bg-orange-50 text-orange-600 font-medium"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="flex flex-col items-start leading-tight">
                      <span>신속 배송</span>
                      {expressArrivalDate && (
                        <span
                          className={`text-[11px] md:text-xs ${
                            caseInfos?.shippingMode === "express"
                              ? "text-orange-700"
                              : "text-gray-500"
                          }`}
                        >
                          도착 예정: {expressArrivalDate}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              </div>

              {/* Submit & Cancel Buttons */}
              <div className="space-y-3 pt-4 border-gray-200">
                {(() => {
                  const unverifiedCount = files.filter(
                    (file) =>
                      !fileVerificationStatus[`${file.name}:${file.size}`]
                  ).length;

                  return (
                    <>
                      <div className="flex gap-2 flex-col sm:flex-row">
                        <Button
                          onClick={() => {
                            if (unverifiedCount > 0) {
                              setHighlightUnverifiedArrows(true);
                              toast({
                                title: "확인 필요",
                                description: `디자인과 정보가 맞는지 ${unverifiedCount}개의 파일을 확인해주세요.`,
                                duration: 5000,
                              });
                              setTimeout(
                                () => setHighlightUnverifiedArrows(false),
                                10000
                              );
                              return;
                            }
                            handleSubmit();
                          }}
                          size="lg"
                          className="w-full sm:flex-[2]"
                        >
                          의뢰하기
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          className="w-full sm:flex-[1]"
                          onClick={handleCancelAll}
                        >
                          취소하기
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
