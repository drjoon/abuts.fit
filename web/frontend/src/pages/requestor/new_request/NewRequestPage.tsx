import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNewRequestPage } from "./hooks/useNewRequestPage";
import { useToast } from "@/shared/hooks/use-toast";
import { usePresetStorage } from "./hooks/usePresetStorage";
import { useBulkShippingPolicy } from "./hooks/useBulkShippingPolicy";
import { useExpressShipping } from "./hooks/useExpressShipping";
import { useFileVerification } from "./hooks/useFileVerification";
import { apiFetch } from "@/shared/api/apiClient";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import { GuideFocus } from "@/features/guidetour/GuideFocus";
import { useGuideTour } from "@/features/guidetour/GuideTourProvider";
import { NewRequestDetailsSection } from "./components/NewRequestDetailsSection";
import { NewRequestUploadSection } from "./components/NewRequestUploadSection";
import { NewRequestShippingSection } from "./components/NewRequestShippingSection";
import { NewRequestPageSkeleton } from "@/shared/ui/skeletons/NewRequestPageSkeleton";

/**
 * New Request 페이지 (리팩터링 버전)
 * - caseInfos를 단일 소스로 사용 (aiFileInfos 제거)
 * - 파일별 메타데이터는 Draft.files에서 관리
 * - 환자명/치아번호 옵션은 caseInfos에서 파생
 */
export const NewRequestPage = () => {
  const { id: existingRequestId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const FILE_SIZE_THRESHOLD_BYTES = 3 * 1024 * 1024; // 3MB

  const { toast } = useToast();

  const [isFillHoleProcessing, setIsFillHoleProcessing] = useState(false);
  const [filledStlFiles, setFilledStlFiles] = useState<Record<string, File>>(
    {},
  );

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

  const {
    user,
    files,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleUpload,
    handleUploadUnchecked,
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
    pendingUploadFiles,
    setPendingUploadFiles,
    pendingUploadDecisions,
    setPendingUploadDecisions,
    handleSubmitWithDuplicateResolutions,
    draftStatus,
  } = useNewRequestPage(existingRequestId);

  const {
    fileVerificationStatus,
    setFileVerificationStatus,
    highlightUnverifiedArrows,
    setHighlightUnverifiedArrows,
    unverifiedCount,
    highlightStep,
  } = useFileVerification({ files });

  const {
    active: guideActive,
    activeTourId,
    goToStep,
    stopTour,
    isStepActive,
    setStepCompleted,
  } = useGuideTour();

  const guideStepNavTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!guideActive) return;
    if (activeTourId !== "requestor-new-request") return;

    const hasFiles = files.length > 0;
    setStepCompleted("requestor.new_request.upload", hasFiles);
  }, [activeTourId, files.length, guideActive, setStepCompleted]);

  useEffect(() => {
    if (!guideActive) return;
    if (activeTourId !== "requestor-new-request") return;

    const doneDetails = files.length > 0 && unverifiedCount === 0;
    setStepCompleted("requestor.new_request.details", doneDetails);
  }, [
    activeTourId,
    files.length,
    guideActive,
    setStepCompleted,
    unverifiedCount,
  ]);

  useEffect(() => {
    if (!guideActive) return;
    if (activeTourId !== "requestor-new-request") return;

    const desiredStepId =
      highlightStep === "upload"
        ? files.length > 0
          ? "requestor.new_request.details"
          : "requestor.new_request.upload"
        : highlightStep === "details"
          ? "requestor.new_request.details"
          : "requestor.new_request.shipping";

    if (isStepActive(desiredStepId)) return;

    if (guideStepNavTimerRef.current) {
      window.clearTimeout(guideStepNavTimerRef.current);
    }
    guideStepNavTimerRef.current = window.setTimeout(() => {
      goToStep(desiredStepId);
    }, 0);

    return () => {
      if (guideStepNavTimerRef.current) {
        window.clearTimeout(guideStepNavTimerRef.current);
        guideStepNavTimerRef.current = null;
      }
    };
  }, [
    activeTourId,
    files.length,
    goToStep,
    guideActive,
    highlightStep,
    isStepActive,
  ]);

  const hasVerifiedFile = useMemo(() => {
    if (!files.length) return false;
    return files.some(
      (file) => fileVerificationStatus[`${file.name}:${file.size}`],
    );
  }, [fileVerificationStatus, files]);

  const sectionHighlightClass =
    "ring-2 ring-primary/40 bg-primary/5 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]";

  // 프리셋 관리
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
    await resetDraft();
    handleCancel();
    setFileVerificationStatus({});
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
    setImplantManufacturer("");
    setImplantSystem("");
    setImplantType("");

    const fileInput = document.getElementById(
      "file-input",
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const [duplicateResolutions, setDuplicateResolutions] = useState<
    {
      caseId: string;
      strategy: "skip" | "replace" | "remake";
      existingRequestId: string;
    }[]
  >([]);

  useEffect(() => {
    if (!duplicatePrompt) {
      setDuplicateResolutions([]);
      return;
    }
  }, [duplicatePrompt]);

  const duplicateList = useMemo(
    () =>
      duplicatePrompt &&
      Array.isArray(duplicatePrompt.duplicates) &&
      duplicatePrompt.duplicates.length > 0
        ? duplicatePrompt.duplicates
        : [],
    [duplicatePrompt],
  );

  const getFileKeyByDraftCaseId = (draftCaseId: string) => {
    const found = (files || []).find(
      (f) => String((f as any)?._draftCaseInfoId || "") === String(draftCaseId),
    );
    if (!found) return null;
    return `${found.name}:${found.size}`;
  };

  const getNewCaseInfoByCaseId = useCallback(
    (caseId: string) => {
      const fileKey = getFileKeyByDraftCaseId(String(caseId));
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
    },
    [caseInfosMap, files],
  );

  const applyDuplicateChoice = async (choice: {
    strategy: "skip" | "replace" | "remake";
    caseId: string;
    existingRequestId: string;
  }) => {
    const isPreUploadCase = String(choice.caseId || "").includes(":");
    if (
      isPreUploadCase &&
      pendingUploadFiles &&
      pendingUploadFiles.length > 0
    ) {
      const fileKey = String(choice.caseId || "");
      const fileKeyNfc = (() => {
        const k = String(choice.caseId || "");
        const idx = k.lastIndexOf(":");
        if (idx <= 0) return k;
        const name = k.slice(0, idx);
        const size = k.slice(idx + 1);
        try {
          return `${name.normalize("NFC")}:${size}`;
        } catch {
          return k;
        }
      })();

      if (
        choice.strategy === "replace" ||
        choice.strategy === "remake" ||
        choice.strategy === "skip"
      ) {
        const strategy: "replace" | "remake" | "skip" = choice.strategy;
        setPendingUploadDecisions((prev) => ({
          ...(prev || {}),
          [fileKey]: {
            strategy,
            existingRequestId: choice.existingRequestId,
          },
          [fileKeyNfc]: {
            strategy,
            existingRequestId: choice.existingRequestId,
          },
        }));
      }

      const remaining =
        (duplicatePrompt?.duplicates || []).filter(
          (d) => d.caseId !== choice.caseId,
        ) || [];

      if (remaining.length > 0) {
        setDuplicatePrompt({
          ...duplicatePrompt,
          duplicates: remaining,
        });
        return;
      }

      // 모두 처리 완료
      const filesToActuallyProcess = (pendingUploadFiles || []).filter((f) => {
        const key = `${f.name}:${f.size}`;
        const keyNfc = (() => {
          try {
            return `${String(f.name || "").normalize("NFC")}:${f.size}`;
          } catch {
            return key;
          }
        })();
        const decision =
          pendingUploadDecisions[key] ??
          pendingUploadDecisions[keyNfc] ??
          (key === fileKey || keyNfc === fileKeyNfc ? choice : null);

        return decision?.strategy !== "skip";
      });

      setPendingUploadFiles(null);
      setDuplicatePrompt(null);

      if (filesToActuallyProcess.length > 0) {
        await handleUploadUnchecked(filesToActuallyProcess);
      }
      return;
    }

    // --- 의뢰 제출 시 감지된 중복 케이스 처리 ---
    const nextResolutions = (() => {
      const next = (duplicateResolutions || []).filter(
        (r) => r.caseId !== choice.caseId,
      );
      next.push(choice);
      return next;
    })();

    setDuplicateResolutions(nextResolutions);

    const remaining =
      (duplicatePrompt?.duplicates || []).filter(
        (d) => d.caseId !== choice.caseId,
      ) || [];

    if (remaining.length > 0) {
      setDuplicatePrompt({
        ...duplicatePrompt,
        duplicates: remaining,
      });
      return;
    }

    // 모든 중복 건에 대한 결정이 완료됨
    const finalResolutions = nextResolutions.map((r) => ({
      caseId: r.caseId,
      strategy: r.strategy,
      existingRequestId: r.existingRequestId,
    }));

    // 중요: 상태를 즉시 초기화하고 프롬프트를 닫음
    setDuplicatePrompt(null);
    setDuplicateResolutions([]);
    setPendingUploadDecisions({});

    // setTimeout을 사용하여 React 상태 업데이트와 렌더링 사이클이 완료된 후 제출 진행
    setTimeout(() => {
      handleSubmitWithDuplicateResolutions(finalResolutions as any);
    }, 150);
  };

  const renderDuplicateActions = (dup: any) => {
    const isLocked = dup?.lockedReason === "production";
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            applyDuplicateChoice({
              strategy: "replace",
              caseId: dup.caseId,
              existingRequestId: dup.existingRequest?._id,
            })
          }
          disabled={isLocked}
          className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          새의뢰로 변경
        </button>
        <button
          type="button"
          onClick={() =>
            applyDuplicateChoice({
              strategy: "skip",
              caseId: dup.caseId,
              existingRequestId: dup.existingRequest?._id,
            })
          }
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          기존의뢰 유지
        </button>
      </div>
    );
  };

  const { summary: bulkShippingSummary } = useBulkShippingPolicy(user?.email);
  const { calculateExpressDate, expressEstimatedShipYmd } =
    useExpressShipping(caseInfos);

  const [normalEstimatedShipYmd, setNormalEstimatedShipYmd] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const maxDiameter = caseInfos?.maxDiameter;
      if (maxDiameter == null) {
        if (!cancelled) setNormalEstimatedShipYmd(undefined);
        return;
      }

      try {
        const res = await apiFetch<any>({
          path: `/api/requests/shipping-estimate?mode=normal&maxDiameter=${encodeURIComponent(
            String(maxDiameter),
          )}`,
          method: "GET",
        });

        const next =
          res.ok && res.data?.success
            ? res.data?.data?.estimatedShipYmd
            : undefined;
        if (!cancelled) setNormalEstimatedShipYmd(next);
      } catch {
        if (!cancelled) setNormalEstimatedShipYmd(undefined);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [caseInfos?.maxDiameter]);

  const validateFileForUpload = (
    file: File,
  ): { valid: boolean; message?: string } => {
    if (file.size >= FILE_SIZE_THRESHOLD_BYTES) {
      return {
        valid: false,
        message:
          "3MB 이상의 파일은 업로드할 수 없습니다. 커스텀 어벗 STL 파일만 업로드해주세요.",
      };
    }
    return { valid: true };
  };

  const onUpload = async (filesToUpload: File[]) => {
    try {
      await handleUpload(filesToUpload);
    } catch (e: any) {
      toast({
        title: "오류",
        description: e.message || "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleIncomingFiles = (selectedFiles: File[]) => {
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
        title: "파일 업로드 실패",
        description:
          "3MB 이상의 파일은 업로드할 수 없습니다. 커스텀 어벗 STL 파일만 업로드해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    }

    if (filesToUpload.length > 0) {
      void onUpload(filesToUpload);
    }
  };

  if (draftStatus === "loading") {
    return <NewRequestPageSkeleton />;
  }

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="min-h-screen bg-gradient-subtle p-4 md:p-6"
    >
      <div className="max-w-6xl mx-auto space-y-4">
        <MultiActionDialog
          open={!!duplicatePrompt}
          preventCloseOnOverlayClick={true}
          title={
            duplicatePrompt?.mode === "completed"
              ? "완료된 의뢰가 이미 있습니다"
              : "진행 중인 의뢰가 이미 있습니다"
          }
          description={
            <div className="space-y-3">
              <div className="text-sm text-gray-700">
                동일한 치과/환자/치아 정보로 이미 의뢰가 존재합니다. 항목별로
                선택해주세요.
              </div>
              {duplicateList.map((dup, idx) => {
                const info = getNewCaseInfoByCaseId(String(dup.caseId || ""));
                const existing = dup?.existingRequest || {};
                const isLocked = dup?.lockedReason === "production";
                return (
                  <div
                    key={`${dup.caseId || ""}-${idx}`}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        중복된 의뢰 {idx + 1} / {duplicateList.length}
                      </div>
                      {dup?.fileName && (
                        <span className="text-[11px] text-gray-500 truncate">
                          파일: {String(dup.fileName || "")}
                        </span>
                      )}
                    </div>
                    <div className="rounded border border-gray-200 bg-white p-2">
                      <div className="flex flex-col gap-0.5 text-[11px]">
                        <span className="truncate">
                          상태:{" "}
                          {String(
                            existing?.status2 === "완료"
                              ? "완료"
                              : existing?.manufacturerStage ||
                                  existing?.status ||
                                  "",
                          )}
                          {isLocked && (
                            <span className="text-red-500 ml-1">
                              (생산/발송 단계 의뢰는 변경/취소할 수 없습니다.)
                            </span>
                          )}
                        </span>
                        {existing?.price?.amount != null && (
                          <span className="truncate">
                            금액(공급가):{" "}
                            {Number(
                              existing?.price?.amount || 0,
                            ).toLocaleString()}
                            원
                          </span>
                        )}
                        {existing?.createdAt && (
                          <span className="truncate">
                            접수일: {String(existing.createdAt).slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                    {renderDuplicateActions(dup)}
                  </div>
                );
              })}
            </div>
          }
          actions={[]}
        />

        <GuideFocus stepId="requestor.new_request.details">
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
            clinicNameOptions={clinicPresets}
            patientNameOptions={patientPresets}
            teethOptions={teethPresets}
            addClinicPreset={addClinicPreset}
            clearAllClinicPresets={clearAllClinicPresets}
            addPatientPreset={addPatientPreset}
            clearAllPatientPresets={clearAllPatientPresets}
            addTeethPreset={addTeethPreset}
            clearAllTeethPresets={clearAllTeethPresets}
            handleAddOrSelectClinic={handleAddOrSelectClinic}
            toast={toast}
            highlight={isStepActive("requestor.new_request.details")}
            sectionHighlightClass={sectionHighlightClass}
          />
        </GuideFocus>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
          <GuideFocus stepId="requestor.new_request.upload">
            <NewRequestUploadSection
              isDragOver={isDragOver}
              highlight={highlightStep === "upload"}
              sectionHighlightClass={sectionHighlightClass}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                e.preventDefault();
                handleDragLeave(e);
                handleIncomingFiles(Array.from(e.dataTransfer.files));
              }}
              onFilesSelected={handleIncomingFiles}
            />
          </GuideFocus>

          <GuideFocus stepId="requestor.new_request.shipping">
            <NewRequestShippingSection
              caseInfos={caseInfos}
              setCaseInfos={setCaseInfos}
              highlight={highlightStep === "shipping"}
              sectionHighlightClass={sectionHighlightClass}
              bulkShippingSummary={bulkShippingSummary}
              normalEstimatedShipYmd={normalEstimatedShipYmd}
              expressEstimatedShipYmd={expressEstimatedShipYmd}
              onOpenShippingSettings={() =>
                navigate("/dashboard/settings?tab=shipping")
              }
              onSelectExpress={async () => {
                const guessShipDate = calculateExpressDate(
                  caseInfos?.maxDiameter,
                );
                try {
                  const res = await apiFetch<any>({
                    path: `/api/requests/shipping-estimate?mode=express&maxDiameter=${encodeURIComponent(
                      String(caseInfos?.maxDiameter ?? ""),
                    )}`,
                    method: "GET",
                  });

                  const shipDateYmd =
                    res.ok && res.data?.success
                      ? res.data?.data?.estimatedShipYmd
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
                if (guideActive && activeTourId === "requestor-new-request") {
                  stopTour();
                }
                handleSubmit();
              }}
              onCancelAll={handleCancelAll}
            />
          </GuideFocus>
        </div>
      </div>
    </PageFileDropZone>
  );
};
