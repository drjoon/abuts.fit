import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNewRequestPage } from "./hooks/useNewRequestPage";
import { useToast } from "@/hooks/use-toast";
import { usePresetStorage } from "./hooks/usePresetStorage";
import { useBulkShippingPolicy } from "./hooks/useBulkShippingPolicy";
import { useExpressShipping } from "./hooks/useExpressShipping";
import { useFileVerification } from "./hooks/useFileVerification";
import { apiFetch } from "@/lib/apiClient";
import { MultiActionDialog } from "@/components/MultiActionDialog";
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
    duplicatePrompt,
    setDuplicatePrompt,
    handleSubmitWithDuplicateResolution,
    handleSubmitWithDuplicateResolutions,
  } = useNewRequestPage(existingRequestId);

  const {
    fileVerificationStatus,
    setFileVerificationStatus,
    highlightUnverifiedArrows,
    setHighlightUnverifiedArrows,
    unverifiedCount,
    highlightStep,
  } = useFileVerification({ files });

  const hasVerifiedFile = useMemo(() => {
    if (!files.length) return false;
    return files.some(
      (file) => fileVerificationStatus[`${file.name}:${file.size}`]
    );
  }, [fileVerificationStatus, files]);

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

  const [duplicateCursor, setDuplicateCursor] = useState(0);
  const [duplicateResolutions, setDuplicateResolutions] = useState<
    {
      caseId: string;
      strategy: "skip" | "replace" | "remake";
      existingRequestId: string;
    }[]
  >([]);

  useEffect(() => {
    if (!duplicatePrompt) {
      setDuplicateCursor(0);
      setDuplicateResolutions([]);
      return;
    }
    setDuplicateCursor(0);
    setDuplicateResolutions([]);
  }, [duplicatePrompt]);

  const currentDuplicate =
    duplicatePrompt &&
    Array.isArray(duplicatePrompt.duplicates) &&
    duplicatePrompt.duplicates.length > 0
      ? duplicatePrompt.duplicates[duplicateCursor] || null
      : null;

  const getFileKeyByDraftCaseId = (draftCaseId: string) => {
    const found = (files || []).find(
      (f) => String((f as any)?._draftCaseInfoId || "") === String(draftCaseId)
    );
    if (!found) return null;
    return `${found.name}:${found.size}`;
  };

  const skippedFileKeys = useMemo(() => {
    const keys: string[] = [];
    for (const r of duplicateResolutions) {
      if (r.strategy !== "skip") continue;
      const k = getFileKeyByDraftCaseId(r.caseId);
      if (k) keys.push(k);
    }
    return Array.from(new Set(keys));
  }, [duplicateResolutions, files]);

  const currentDuplicateNewCaseInfo = useMemo(() => {
    if (!currentDuplicate?.caseId) return null;
    const fileKey = getFileKeyByDraftCaseId(String(currentDuplicate.caseId));
    const file = fileKey
      ? (files || []).find((f) => `${f.name}:${f.size}` === fileKey)
      : null;
    const info = fileKey ? caseInfosMap?.[fileKey] : undefined;
    return {
      fileName: file?.name || "",
      patientName: String(info?.patientName || ""),
      tooth: String(info?.tooth || ""),
      clinicName: String(info?.clinicName || ""),
    };
  }, [currentDuplicate?.caseId, files, caseInfosMap]);

  const applyDuplicateChoice = async (choice: {
    strategy: "skip" | "replace" | "remake";
    caseId: string;
    existingRequestId: string;
  }) => {
    const nextResolutions = (() => {
      const next = (duplicateResolutions || []).filter(
        (r) => r.caseId !== choice.caseId
      );
      next.push(choice);
      return next;
    })();

    setDuplicateResolutions(nextResolutions);

    const totalDup = duplicatePrompt?.duplicates?.length || 0;
    const nextCursor = duplicateCursor + 1;

    if (nextCursor < totalDup) {
      setDuplicateCursor(nextCursor);
      return;
    }

    const all = nextResolutions;
    setDuplicatePrompt(null);
    await handleSubmitWithDuplicateResolutions(all);
  };

  const { summary: bulkShippingSummary } = useBulkShippingPolicy(user?.email);
  const { calculateExpressDate, expressArrivalDate } =
    useExpressShipping(caseInfos);

  const [normalArrivalDate, setNormalArrivalDate] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const maxDiameter = caseInfos?.maxDiameter;
      if (maxDiameter == null) {
        if (!cancelled) setNormalArrivalDate(undefined);
        return;
      }

      try {
        const res = await apiFetch<any>({
          path: `/api/requests/shipping-estimate?mode=normal&maxDiameter=${encodeURIComponent(
            String(maxDiameter)
          )}`,
          method: "GET",
        });

        const next =
          res.ok && res.data?.success
            ? res.data?.data?.arrivalDateYmd
            : undefined;
        if (!cancelled) setNormalArrivalDate(next);
      } catch {
        if (!cancelled) setNormalArrivalDate(undefined);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [caseInfos?.maxDiameter]);

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
        <MultiActionDialog
          open={!!duplicatePrompt}
          title={
            duplicatePrompt?.mode === "completed"
              ? "완료된 의뢰가 이미 있습니다"
              : "진행 중인 의뢰가 이미 있습니다"
          }
          description={
            <div className="space-y-2">
              <div className="text-sm text-gray-700">
                동일한 치과/환자/치아 정보로 이미 의뢰가 존재합니다.
              </div>
              {currentDuplicateNewCaseInfo && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-gray-800">
                  <div className="font-semibold mb-1">현재 케이스(새 의뢰)</div>
                  {currentDuplicateNewCaseInfo.fileName && (
                    <div className="truncate">
                      파일: {currentDuplicateNewCaseInfo.fileName}
                    </div>
                  )}
                  {(currentDuplicateNewCaseInfo.patientName ||
                    currentDuplicateNewCaseInfo.tooth ||
                    currentDuplicateNewCaseInfo.clinicName) && (
                    <div className="truncate">
                      {currentDuplicateNewCaseInfo.clinicName
                        ? `치과: ${currentDuplicateNewCaseInfo.clinicName}`
                        : ""}
                      {currentDuplicateNewCaseInfo.patientName
                        ? ` / 환자: ${currentDuplicateNewCaseInfo.patientName}`
                        : ""}
                      {currentDuplicateNewCaseInfo.tooth
                        ? ` / 치아: ${currentDuplicateNewCaseInfo.tooth}`
                        : ""}
                    </div>
                  )}
                </div>
              )}
              {currentDuplicate && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                  <div className="font-semibold mb-1">
                    중복된 의뢰 ({duplicateCursor + 1} /{" "}
                    {duplicatePrompt?.duplicates?.length || 1})
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate">
                      의뢰번호:{" "}
                      {String(
                        currentDuplicate?.existingRequest?.requestId || ""
                      )}
                    </span>
                    <span className="truncate">
                      상태:{" "}
                      {String(currentDuplicate?.existingRequest?.status || "")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          }
          actions={(() => {
            const actions: any[] = [];
            const existingRequestMongoId = String(
              currentDuplicate?.existingRequest?._id || ""
            );
            const caseId = String(currentDuplicate?.caseId || "").trim();
            const mode = duplicatePrompt?.mode;

            actions.push({
              label: "새의뢰 취소",
              variant: "secondary",
              onClick: async () => {
                if (!caseId || !existingRequestMongoId) {
                  setDuplicatePrompt(null);
                  await handleCancelAll();
                  return;
                }
                await applyDuplicateChoice({
                  strategy: "skip",
                  caseId,
                  existingRequestId: existingRequestMongoId,
                });
              },
            });

            if (existingRequestMongoId && caseId) {
              actions.unshift({
                label: "재의뢰",
                variant: "primary",
                onClick: async () => {
                  await applyDuplicateChoice({
                    strategy: mode === "completed" ? "remake" : "replace",
                    caseId,
                    existingRequestId: existingRequestMongoId,
                  });
                },
              });
            }

            return actions;
          })()}
          onClose={() => setDuplicatePrompt(null)}
        />
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
          disabledFileKeys={skippedFileKeys}
        />

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
            disabled={!hasVerifiedFile}
            highlight={highlightStep === "shipping"}
            sectionHighlightClass={sectionHighlightClass}
            bulkShippingSummary={bulkShippingSummary}
            normalArrivalDate={normalArrivalDate}
            expressArrivalDate={expressArrivalDate}
            onOpenShippingSettings={() =>
              navigate("/dashboard/settings?tab=shipping")
            }
            onSelectExpress={async () => {
              const guessShipDate = calculateExpressDate(
                caseInfos?.maxDiameter
              );
              try {
                const res = await apiFetch<any>({
                  path: `/api/requests/shipping-estimate?mode=express&shipYmd=${encodeURIComponent(
                    guessShipDate
                  )}`,
                  method: "GET",
                });

                const shipDateYmd =
                  res.ok && res.data?.success
                    ? res.data?.data?.shipDateYmd
                    : guessShipDate;

                setCaseInfos({
                  shippingMode: "express",
                  requestedShipDate: shipDateYmd,
                });
              } catch {
                setCaseInfos({
                  shippingMode: "express",
                  requestedShipDate: guessShipDate,
                });
              }
            }}
            onSubmit={() => {
              if (unverifiedCount > 0) {
                setHighlightUnverifiedArrows(true);
                toast({
                  title: "확인 필요",
                  description: `모든 파일을 확인해서 [확인후]로 변경해주세요.`,
                  duration: 5000,
                });
                setTimeout(() => setHighlightUnverifiedArrows(false), 10000);
                return;
              }
              toast({
                title: "의뢰 접수중",
                description: "제출을 처리하고 있어요. 잠시만 기다려주세요.",
                duration: 3000,
              });
              handleSubmit();
            }}
            onCancelAll={handleCancelAll}
          />
        </div>
      </div>
    </div>
  );
};
