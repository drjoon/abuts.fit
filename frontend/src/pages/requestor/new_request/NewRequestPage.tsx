import { useEffect, useRef, useState } from "react";
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
import { Upload, Plus, Truck, Zap, Info } from "lucide-react";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import { useNewRequestPage } from "@/features/requestor/hooks/useNewRequestPage";
import ClinicAutocompleteField from "@/components/ClinicAutocompleteField";
import LabeledAutocompleteField from "@/components/LabeledAutocompleteField";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { request } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

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
    clinicPresets,
    selectedClinicId,
    handleSelectClinic,
    handleAddOrSelectClinic,
    handleDeleteClinic,
    connections,
    resetDraft,
  } = useNewRequestPage(existingRequestId);

  // hasActiveSession은 files.length > 0으로 직접 계산
  const hasActiveSession = files.length > 0;

  // 디버깅: files.length 변화 추적
  useEffect(() => {
    console.log("[NewRequestPage] files.length changed:", files.length);
  }, [files.length]);

  const [clinicInput, setClinicInput] = useState("");
  const [fileWorkTypes, setFileWorkTypes] = useState<
    Record<string, "abutment" | "crown">
  >({});
  const [hasUserChosenWorkType, setHasUserChosenWorkType] = useState(false);
  const manufacturerSelectRef = useRef<HTMLButtonElement | null>(null);
  const crownOnlyToastShownRef = useRef(false);
  const lastRequestedFilenamesRef = useRef<string[] | null>(null);

  const handleCancelAll = async () => {
    // 1) 서버 Draft + 로컬 Draft 캐시 완전 초기화
    // resetDraft() 내부에서 setCaseInfos({ workType: "abutment" })를 호출하므로
    // 여기서 별도로 setCaseInfos를 호출하면 안 됨 (updateCaseInfos가 PATCH를 트리거함)
    await resetDraft();

    // 2) 클라이언트 상태 초기화 (기존 로직 유지)
    handleCancel();

    // hasActiveSession은 files.length로 자동 계산되므로 별도 설정 불필요

    setClinicInput("");
    setFileWorkTypes({});
    setHasUserChosenWorkType(false);
    lastRequestedFilenamesRef.current = null;

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

  // 클리닉 프리셋 선택 시 입력값 동기화
  useEffect(() => {
    const selected = clinicPresets.find((c) => c.id === selectedClinicId);
    setClinicInput(selected?.name ?? "");
  }, [clinicPresets, selectedClinicId]);

  // 선택된 파일의 clinicName이 있으면 자동으로 클리닉 입력값 설정
  useEffect(() => {
    if (selectedPreviewIndex === null || !caseInfos?.clinicName) return;
    const name = caseInfos.clinicName.trim();
    if (!name) return;

    setClinicInput(name);
    handleAddOrSelectClinic(name);
  }, [selectedPreviewIndex, caseInfos?.clinicName, handleAddOrSelectClinic]);

  // 환자명 옵션 (현재는 caseInfos의 patientName 하나만 사용)
  const patientNameOptions = caseInfos?.patientName
    ? [{ id: caseInfos.patientName, label: caseInfos.patientName }]
    : [];

  // 치아번호 옵션 (현재는 caseInfos의 tooth 하나만 사용)
  const teethOptions = caseInfos?.tooth
    ? [{ id: caseInfos.tooth, label: caseInfos.tooth }]
    : [];

  // 선택된 파일의 workType 결정 (파일 크기 기준 + 사용자 오버라이드)
  const getFileWorkType = (file: File): "abutment" | "crown" => {
    const key = `${file.name}:${file.size}`;
    const overridden = fileWorkTypes[key];
    if (overridden) return overridden;

    // 기본 자동 판단: 1MB 미만이면 어벗, 이상이면 크라운
    return file.size < FILE_SIZE_THRESHOLD_BYTES ? "abutment" : "crown";
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

  // files 배열이 완전히 비워지면 AI 파일명 파싱 중복 체크용 캐시도 초기화한다.
  useEffect(() => {
    if (files.length === 0) {
      lastRequestedFilenamesRef.current = null;
    }
  }, [files]);

  // 파일 크기 기반으로 전체 workType 자동 제안 (사용자가 직접 선택하기 전까지만)
  useEffect(() => {
    if (!files.length) return;
    if (hasUserChosenWorkType) return;

    const hasAbutment = files.some((f) => getFileWorkType(f) === "abutment");
    const autoType: "abutment" | "crown" = hasAbutment ? "abutment" : "crown";

    if (caseInfos?.workType !== autoType) {
      setCaseInfos({
        ...caseInfos,
        workType: autoType,
      });
    }
  }, [files, caseInfos, hasUserChosenWorkType, setCaseInfos]);

  // 크라운 파일만 첨부된 경우 안내 토스트 (1회만)
  useEffect(() => {
    if (!files.length) return;
    if (hasUserChosenWorkType) return;
    if (crownOnlyToastShownRef.current) return;

    const allCrown = files.every((f) => getFileWorkType(f) === "crown");
    if (!allCrown) return;

    crownOnlyToastShownRef.current = true;
    toast({
      title: "안내",
      description: "크라운은 참고용이고, 커스텀 어벗만 의뢰할 수 있습니다.",
      duration: 3000,
    });
  }, [files, hasUserChosenWorkType, toast]);

  // 파일명이 있으면서 아직 환자/치과 정보가 비어 있으면 AI 파일명 파싱 API를 호출해 기본값을 채운다.
  // files 배열의 파일 목록이 변경될 때마다 1회씩 호출하고, 동일한 파일 목록에 대해서는 중복 호출하지 않는다.
  useEffect(() => {
    if (!files.length) return;

    if (caseInfos?.clinicName || caseInfos?.patientName || caseInfos?.tooth) {
      return;
    }

    const filenames = files.map((f) => f.name);

    const prev = lastRequestedFilenamesRef.current;
    const isSameAsPrev =
      prev &&
      prev.length === filenames.length &&
      prev.every((name, idx) => name === filenames[idx]);

    if (isSameAsPrev) {
      return;
    }

    lastRequestedFilenamesRef.current = filenames;

    (async () => {
      try {
        const res = await request<
          {
            filename: string;
            clinicName: string | null;
            patientName: string | null;
            tooth: string | null;
          }[]
        >({
          path: "/api/ai/parse-filenames",
          method: "POST",
          jsonBody: { filenames },
        });

        const items = (res.data as any)?.data || res.data;
        if (!Array.isArray(items) || !items.length) return;

        const first = items[0] as any;
        setCaseInfos({
          ...caseInfos,
          clinicName: first.clinicName || "",
          patientName: first.patientName || "",
          tooth: first.tooth || "",
        });
      } catch {
        // AI 분석 실패는 무시 (빈 상태 유지)
      }
    })();
  }, [files, caseInfos, setCaseInfos]);

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* ===== RED SECTION: File Selection & Details (Dynamic) ===== */}
        <div className="relative flex flex-col rounded-2xl border-2 border-gray-300 p-4 md:p-6  transition-shadow hover:shadow-md">
          {/* File Cards */}
          <div className="flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 mb-2">
            {!hasActiveSession && (
              <div className="flex items-center justify-center w-full min-h-[120px] rounded-xl border border-dashed border-gray-200 bg-white/60 text-[11px] md:text-sm text-muted-foreground">
                아직 첨부된 STL 파일이 없습니다. 우측의 드롭 영역에 파일을
                드롭하거나, 아래 버튼으로 파일을 선택해주세요.
              </div>
            )}
            {hasActiveSession &&
              files.map((file, index) => {
                const filename = file.name;
                const workType = getFileWorkType(file);
                const isSelected = selectedPreviewIndex === index;

                const isAbutment = workType === "abutment";
                const isCrown = workType === "crown";

                return (
                  <div
                    key={index}
                    onClick={() => {
                      setSelectedPreviewIndex(index);
                      const currentWorkType = getFileWorkType(file);
                      setHasUserChosenWorkType(true);

                      if (caseInfos?.workType !== currentWorkType) {
                        setCaseInfos({
                          ...caseInfos,
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
                        syncSelectedConnection("OSSTEM", "Regular", "Hex");

                        setCaseInfos({
                          ...caseInfos,
                          implantSystem: "OSSTEM",
                          implantType: "Regular",
                          connectionType: "Hex",
                        });
                      }
                    }}
                    className={`shrink-0 w-48 md:w-56 p-2 md:p-3 rounded-lg  cursor-pointer text-xs space-y-2 transition-colors ${
                      isSelected
                        ? "border-2 border-primary shadow-lg"
                        : "border border-gray-200 hover:border-primary/40 hover:shadow"
                    } ${
                      isAbutment
                        ? "bg-gray-300 text-gray-900"
                        : isCrown
                        ? "bg-gray-100 text-gray-900"
                        : "bg-gray-50 text-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                      <span className="truncate flex-1">{filename}</span>
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
                    <div className="flex gap-1 md:gap-2 mt-1">
                      {/* 어벗 버튼 */}
                      <button
                        type="button"
                        className="flex-1 rounded py-1 border text-[10px] md:text-[11px] bg-gray-300 text-gray-900 border-gray-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPreviewIndex(index);
                          setHasUserChosenWorkType(true);
                          // 카드별 어벗 선택
                          const key = `${file.name}:${file.size}`;
                          setFileWorkTypes((prev) => ({
                            ...prev,
                            [key]: "abutment",
                          }));
                          // 전체 workType도 어벗으로 설정
                          if (caseInfos?.workType !== "abutment") {
                            setCaseInfos({
                              ...caseInfos,
                              workType: "abutment",
                            });
                          }
                          // 어벗 선택 시 기본 임플란트 정보 설정
                          if (
                            !implantManufacturer &&
                            !implantSystem &&
                            !implantType
                          ) {
                            setImplantManufacturer("OSSTEM");
                            setImplantSystem("Regular");
                            setImplantType("Hex");
                            syncSelectedConnection("OSSTEM", "Regular", "Hex");
                          }
                        }}
                      >
                        어벗
                      </button>
                      {/* 크라운 버튼 */}
                      <button
                        type="button"
                        className="flex-1 rounded py-1 border text-[10px] md:text-[11px] bg-gray-50 text-gray-900 border-gray-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPreviewIndex(index);
                          setHasUserChosenWorkType(true);
                          const key = `${file.name}:${file.size}`;
                          setFileWorkTypes((prev) => ({
                            ...prev,
                            [key]: "crown",
                          }));
                          // 크라운만 선택된 경우를 위해 workType도 갱신
                          if (caseInfos?.workType !== "crown") {
                            setCaseInfos({
                              ...caseInfos,
                              workType: "crown",
                            });
                          }
                        }}
                      >
                        크라운
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* File Details & Case Info */}
          <div className="w-full grid gap-4 lg:grid-cols-2 items-start border-gray-200 pt-6">
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
                  STL 파일을 업로드하고 상단 파일 카드에서 하나를 선택하면
                  여기에 프리뷰가 보입니다.
                </div>
              )}
            </div>

            {/* Case Info Form + 드롭박스 (우측) */}
            <div className="space-y-4 text-xs md:text-sm min-w-0">
              <div className="">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-foreground ">
                  {/* 치과명 */}
                  <div className="min-w-0">
                    <ClinicAutocompleteField
                      value={clinicInput}
                      onChange={(value) => {
                        setClinicInput(value);
                        setCaseInfos({
                          clinicName: value,
                        });
                      }}
                      presets={clinicPresets}
                      selectedId={selectedClinicId}
                      onSelectClinic={handleSelectClinic}
                      onAddOrSelectClinic={handleAddOrSelectClinic}
                      onDeleteClinic={handleDeleteClinic}
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
                      }}
                      onClear={() => {
                        setCaseInfos({
                          patientName: "",
                        });
                      }}
                      onDelete={() => {
                        setCaseInfos({
                          patientName: "",
                        });
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
                      }}
                      onClear={() => {
                        setCaseInfos({
                          tooth: "",
                        });
                      }}
                      onDelete={() => {
                        setCaseInfos({
                          tooth: "",
                        });
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

              {/* BLUE SECTION: File Upload Area (입력 폼 하단, RED 박스 우측 열 내부) */}
              <div
                className={`mt-4 border-2 border-dashed rounded-2xl p-4 md:p-6 text-center transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-primary/50 bg-white"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="h-6 md:h-8 w-6 md:w-8 mx-auto text-muted-foreground" />
                <p className="text-base md:text-lg font-medium mb-2">
                  어벗과 크라운 STL 파일 드롭
                </p>
                <Button
                  variant="outline"
                  className="text-xs md:text-sm"
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  파일 선택
                </Button>
                <p className="text-xs md:text-sm text-muted-foreground mt-2">
                  치과이름, 환자이름, 치아번호가 포함된 파일명으로
                  업로드해주세요.
                  <br />
                  품질 향상을 위해 커스텀 어벗과 함께 크라운 데이터도 업로드
                  부탁드립니다.
                </p>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fileList = e.currentTarget.files;
                    if (fileList) {
                      handleUpload(Array.from(fileList));
                    }
                  }}
                  accept=".stl"
                />
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
            <div className="hidden lg:block" />
            <div className="relative flex flex-col rounded-2xl border-2 border-gray-300 p-4 md:p-6 space-y-4 transition-shadow hover:shadow-md">
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
              <div className="space-y-3 pt-2 border-gray-200">
                <div className="flex gap-2 flex-col sm:flex-row">
                  <Button onClick={handleSubmit} size="lg" className="flex-1">
                    의뢰하기
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="sm:w-24"
                    onClick={handleCancelAll}
                  >
                    취소하기
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
