import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNewRequestPage } from "@/features/requestor/hooks/useNewRequestPage";
import { useToast } from "@/hooks/use-toast";
import { usePresetStorage } from "@/features/requestor/hooks/new_requests/usePresetStorage";
import { useBulkShippingPolicy } from "./hooks/useBulkShippingPolicy";
import { useExpressShipping } from "./hooks/useExpressShipping";
import { useFileVerification } from "./hooks/useFileVerification";
import { NewRequestDetailsSection } from "./components/NewRequestDetailsSection";
import { NewRequestUploadSection } from "./components/NewRequestUploadSection";
import { NewRequestShippingSection } from "./components/NewRequestShippingSection";

/**
 * New Request 페이지 (리팩터링 버전)
 * - caseInfos를 단일 소스로 사용 (aiFileInfos 제거)
 * - 파일별 메타데이터는 Draft.files에서 관리
 * - 환자명/치아번호 옵션은 caseInfos에서 파생
 */
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

  const {
    fileVerificationStatus,
    setFileVerificationStatus,
    highlightUnverifiedArrows,
    setHighlightUnverifiedArrows,
    unverifiedCount,
    highlightStep,
  } = useFileVerification({ files });

  const sectionHighlightClass =
    "ring-2 ring-primary/40 bg-primary/5 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]";

  // 프리셋 관리 (환자명, 치아번호, 치과명)
  const {
    presets: patientPresets,
    addPreset: addPatientPreset,
    clearAllPresets: clearAllPatientPresets,
  } = usePresetStorage("patient-names");
  const {
    presets: teethPresets,
    addPreset: addTeethPreset,
    clearAllPresets: clearAllTeethPresets,
  } = usePresetStorage("teeth-numbers");
  const {
    presets: clinicPresets,
    addPreset: addClinicPreset,
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

    setFileVerificationStatus({});

    // 환자/치과/치아 및 임플란트/배송
    setCaseInfos({
      clinicName: "",
      patientName: "",
      tooth: "",
      implantManufacturer: "",
      implantSystem: "",
      implantType: "",
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

  const { summary: bulkShippingSummary } = useBulkShippingPolicy(user?.email);
  const { calculateExpressDate, expressArrivalDate } =
    useExpressShipping(caseInfos);

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

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <NewRequestDetailsSection
          files={files}
          selectedPreviewIndex={selectedPreviewIndex}
          setSelectedPreviewIndex={setSelectedPreviewIndex}
          caseInfos={caseInfos}
          setCaseInfos={setCaseInfos}
          caseInfosMap={caseInfosMap}
          updateCaseInfos={updateCaseInfos}
          connections={connections}
          typeOptions={typeOptions}
          implantManufacturer={implantManufacturer}
          setImplantManufacturer={setImplantManufacturer}
          implantSystem={implantSystem}
          setImplantSystem={setImplantSystem}
          implantType={implantType}
          setImplantType={setImplantType}
          syncSelectedConnection={syncSelectedConnection}
          fileVerificationStatus={fileVerificationStatus}
          setFileVerificationStatus={setFileVerificationStatus}
          highlightUnverifiedArrows={highlightUnverifiedArrows}
          setHighlightUnverifiedArrows={setHighlightUnverifiedArrows}
          handleRemoveFile={handleRemoveFile}
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
          toast={toast}
          highlight={highlightStep === "details"}
          sectionHighlightClass={sectionHighlightClass}
        />

        {(() => {
          const hasSelectedFile =
            selectedPreviewIndex !== null && !!files[selectedPreviewIndex];
          const hasCaseInfos = !!caseInfos;
          return hasSelectedFile || hasCaseInfos;
        })() && (
          <div className="grid grid-cols-1 lg:grid-cols-2 mt-2">
            <NewRequestUploadSection
              isDragOver={isDragOver}
              highlight={highlightStep === "upload"}
              sectionHighlightClass={sectionHighlightClass}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onFilesSelected={(selectedFiles) => {
                const filesToUpload: File[] = [];
                const rejectedFiles: string[] = [];

                selectedFiles.forEach((file) => {
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
              }}
            />

            <NewRequestShippingSection
              caseInfos={caseInfos}
              setCaseInfos={setCaseInfos}
              highlight={highlightStep === "shipping"}
              sectionHighlightClass={sectionHighlightClass}
              bulkShippingSummary={bulkShippingSummary}
              expressArrivalDate={expressArrivalDate}
              onOpenShippingSettings={() =>
                navigate("/dashboard/settings?tab=shipping")
              }
              onSelectExpress={() => {
                const expressDate = calculateExpressDate(
                  caseInfos?.maxDiameter
                );
                setCaseInfos({
                  shippingMode: "express",
                  requestedShipDate: expressDate,
                });
              }}
              onSubmit={() => {
                if (unverifiedCount > 0) {
                  setHighlightUnverifiedArrows(true);
                  toast({
                    title: "확인 필요",
                    description: `디자인과 정보가 맞는지 ${unverifiedCount}개의 파일을 확인해주세요.`,
                    duration: 5000,
                  });
                  setTimeout(() => setHighlightUnverifiedArrows(false), 10000);
                  return;
                }
                handleSubmit();
              }}
              onCancelAll={handleCancelAll}
            />
          </div>
        )}
      </div>
    </div>
  );
};
