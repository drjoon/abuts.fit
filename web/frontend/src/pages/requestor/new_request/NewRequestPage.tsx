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
import { useFileVerification } from "./hooks/useFileVerification";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { clearLocalDraft } from "./utils/localDraftStorage";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import { NewRequestDetailsSection } from "./components/NewRequestDetailsSection";
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
  const FILE_SIZE_THRESHOLD_BYTES = 30 * 1024 * 1024; // 3MB

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
    duplicateResolutions,
    setDuplicateResolutions,
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
    clearLocalDraft();
    try {
      window.localStorage.removeItem("abutsfit:new-request-draft-id:v1");
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("abutsfit:new-request-draft-meta:v1:"))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // noop
    }
    setFileVerificationStatus({});
    setCaseInfos({
      clinicName: "",
      patientName: "",
      tooth: "",
      implantManufacturer: "",
      implantBrand: "",
      implantFamily: "",
      implantType: "",
      maxDiameter: undefined,
      connectionDiameter: undefined,
      shippingMode: undefined,
      requestedShipDate: undefined,
      workType: "abutment",
    });
    setImplantManufacturer("");
    setImplantBrand("");
    setImplantFamily("");
    setImplantType("");

    const fileInput = document.getElementById(
      "file-input",
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

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
    try {
      return `${String(found.name || "").normalize("NFC")}:${found.size}`;
    } catch {
      return `${found.name}:${found.size}`;
    }
  };

  const getNewCaseInfoByCaseId = useCallback(
    (caseId: string) => {
      const fileKey = getFileKeyByDraftCaseId(String(caseId));
      const file = fileKey
        ? (files || []).find((f) => {
            try {
              return (
                `${String(f.name || "").normalize("NFC")}:${f.size}` === fileKey
              );
            } catch {
              return `${f.name}:${f.size}` === fileKey;
            }
          })
        : null;
      const info = fileKey ? caseInfosMap?.[fileKey] : undefined;
      const parsed = file ? parseFilenameWithRules(file.name) : null;
      return {
        fileName: file?.name || "",
        patientName: String(info?.patientName || parsed?.patientName || ""),
        tooth: String(info?.tooth || parsed?.tooth || ""),
        clinicName: String(info?.clinicName || parsed?.clinicName || ""),
      };
    },
    [caseInfosMap, files],
  );

  const applyDuplicateChoice = async (choice: {
    strategy: "skip" | "replace" | "remake";
    caseId: string;
    existingRequestId: string;
  }) => {
    // skip 선택 시 파일 제거
    if (choice.strategy === "skip") {
      let fileIndex = -1;

      // caseId가 fileKey 형식(name:size)인 경우 직접 파일명 추출
      if (choice.caseId.includes(":")) {
        const [fileName] = choice.caseId.split(":");
        fileIndex = (files || []).findIndex((f) => f.name === fileName);

        console.log("[DuplicateModal] skip - fileKey format:", {
          caseId: choice.caseId,
          extractedFileName: fileName,
          fileIndex,
          filesCount: files?.length,
        });
      }

      // fileKey 형식이 아니면 기존 로직 사용
      if (fileIndex === -1) {
        const info = getNewCaseInfoByCaseId(String(choice.caseId));
        if (info?.fileName) {
          fileIndex = (files || []).findIndex((f) => f.name === info.fileName);
        }
      }

      // 여전히 못 찾았다면 _draftCaseInfoId로 시도
      if (fileIndex === -1) {
        fileIndex = (files || []).findIndex(
          (f) =>
            String((f as any)?._draftCaseInfoId || "") ===
            String(choice.caseId),
        );
      }

      if (fileIndex >= 0) {
        console.log("[DuplicateModal] Found file, removing:", {
          fileIndex,
          fileName: files[fileIndex]?.name,
        });
        await handleRemoveFile(fileIndex);
      } else {
        console.warn("[DuplicateModal] Could not find file for caseId:", {
          caseId: choice.caseId,
          allFileNames: files?.map((f) => f.name),
        });
      }
    }

    // 중복 해결 정보 저장
    const nextResolutions = (() => {
      const next = (duplicateResolutions || []).filter(
        (r) => r.caseId !== choice.caseId,
      );
      next.push(choice);
      return next;
    })();

    setDuplicateResolutions(nextResolutions);

    // 남은 중복 건 확인
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

    // 모든 중복 건 처리 완료 - 모달 닫기
    const finalResolutions = nextResolutions.map((r) => ({
      caseId: r.caseId,
      strategy: r.strategy,
      existingRequestId: r.existingRequestId,
    }));

    // 중요: 선택 정보를 보존한 채 프롬프트만 닫고 사용자가 다시 제출하도록 유도
    setDuplicateResolutions(finalResolutions as any);
    setDuplicatePrompt(null);
  };

  const renderDuplicateActions = (dup: any) => {
    const isTracking =
      duplicatePrompt?.mode === "tracking" ||
      String(dup?.existingRequest?.manufacturerStage || "").trim() ===
        "추적관리";

    // stageOrder: 0=의뢰, 1=CAM, 2=가공, 3=세척.패킹/포장.발송, 4=추적관리
    const stageOrder = Number(dup?.stageOrder ?? 0);

    // 의뢰/CAM 단계(0-1): "새 의뢰로 교체" (replace)
    // 가공 이후(2+): "하나 더 의뢰하기" (remake)
    // 추적관리(4): "재의뢰로 접수" (remake)
    let primaryStrategy: "replace" | "remake";
    let primaryLabel: string;

    if (isTracking) {
      primaryStrategy = "remake";
      primaryLabel = "재의뢰로 접수";
    } else if (stageOrder >= 2) {
      // 가공 이후 단계
      primaryStrategy = "remake";
      primaryLabel = "하나 더 의뢰하기";
    } else {
      // 의뢰/CAM 단계
      primaryStrategy = "replace";
      primaryLabel = "새 의뢰로 교체";
    }

    return (
      <div className="flex gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("[DuplicateModal] Primary button clicked", {
              strategy: primaryStrategy,
              caseId: dup.caseId,
              stageOrder,
            });
            applyDuplicateChoice({
              strategy: primaryStrategy,
              caseId: dup.caseId,
              existingRequestId: dup.existingRequest?._id,
            });
          }}
          className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("[DuplicateModal] Skip button clicked", {
              caseId: dup.caseId,
            });
            applyDuplicateChoice({
              strategy: "skip",
              caseId: dup.caseId,
              existingRequestId: dup.existingRequest?._id,
            });
          }}
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          기존의뢰 유지
        </button>
      </div>
    );
  };

  const { weeklyBatchLabel, weeklyBatchDays, setWeeklyBatchDays } =
    useBulkShippingPolicy(user?.email);

  const [focusUnverifiedTick, setFocusUnverifiedTick] = useState(0);

  const validateFileForUpload = (
    file: File,
  ): { valid: boolean; message?: string } => {
    // Check file extension for STL
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".stl")) {
      return {
        valid: false,
        message: "STL 파일만 업로드 가능합니다.",
      };
    }

    if (file.size >= FILE_SIZE_THRESHOLD_BYTES) {
      return {
        valid: false,
        message:
          "30MB 이상의 파일은 업로드할 수 없습니다. 커스텀 어벗 STL 파일만 업로드해주세요.",
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
    const rejectedFiles: { name: string; reason: string }[] = [];

    selectedFiles.forEach((file) => {
      const validation = validateFileForUpload(file);
      if (validation.valid) {
        filesToUpload.push(file);
      } else {
        rejectedFiles.push({
          name: file.name,
          reason: validation.message || "알 수 없는 오류",
        });
      }
    });

    if (rejectedFiles.length > 0) {
      const firstReason = rejectedFiles[0].reason;
      toast({
        title: "파일 업로드 실패",
        description: firstReason,
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
      className="bg-gradient-subtle p-4 flex flex-col h-full min-h-0 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto w-full space-y-4 flex flex-col flex-1 min-h-0 h-full">
        <MultiActionDialog
          open={!!duplicatePrompt}
          preventCloseOnOverlayClick={false}
          onClose={() => {
            setDuplicatePrompt(null);
          }}
          title={
            duplicatePrompt?.mode === "tracking"
              ? "추적관리 의뢰가 이미 있습니다"
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
                const existingCaseInfos = existing?.caseInfos || {};
                const newClinic = String(info?.clinicName || "").trim();
                const newPatient = String(info?.patientName || "").trim();
                const newTooth = String(info?.tooth || "").trim();
                const existingClinic = String(
                  existingCaseInfos?.clinicName || "",
                ).trim();
                const existingPatient = String(
                  existingCaseInfos?.patientName || "",
                ).trim();
                const existingTooth = String(
                  existingCaseInfos?.tooth || "",
                ).trim();
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
                          기존 의뢰: {existingClinic || "-"} /
                          {existingPatient || "-"} / {existingTooth || "-"}
                        </span>
                        <span className="truncate">
                          상태: {String(existing?.manufacturerStage || "")}
                        </span>
                        {existing?.requestId && (
                          <span className="truncate">
                            의뢰번호: {String(existing.requestId || "")}
                          </span>
                        )}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch flex-1 min-h-0 h-full">
          <div className="flex flex-col gap-2.5 flex-1 min-h-0 h-full">
            <NewRequestDetailsSection
              files={files}
              selectedPreviewIndex={selectedPreviewIndex}
              setSelectedPreviewIndex={setSelectedPreviewIndex}
              caseInfos={caseInfos}
              setCaseInfos={setCaseInfos}
              caseInfosMap={caseInfosMap}
              updateCaseInfos={updateCaseInfos}
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
              highlight={false}
              sectionHighlightClass={sectionHighlightClass}
              focusUnverifiedTick={focusUnverifiedTick}
              duplicatePromptOpen={!!duplicatePrompt}
              isDragOver={isDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                e.preventDefault();
                handleDragLeave(e);
                handleIncomingFiles(Array.from(e.dataTransfer.files));
              }}
              onFilesSelected={handleIncomingFiles}
              onCancelAll={handleCancelAll}
              onDuplicateDetected={({ file, duplicate }) => {
                const caseId = String(
                  (file as any)?._draftCaseInfoId || "",
                ).trim();
                const fallbackCaseId = `${file.name}:${file.size}`;
                const effectiveCaseId = caseId || fallbackCaseId;
                // 이미 해당 caseId에 대한 사용자의 결정이 저장되어 있다면 모달을 다시 열지 않는다
                const alreadyResolved = (duplicateResolutions || []).some(
                  (r) => r.caseId === effectiveCaseId,
                );
                if (alreadyResolved) {
                  return;
                }
                const stageOrder = Number(duplicate?.stageOrder ?? 0);
                const mapped = {
                  caseId: effectiveCaseId,
                  fileName: file.name,
                  existingRequest: duplicate?.existingRequest,
                  stageOrder, // stageOrder를 전달하여 UI에서 올바른 옵션 표시
                };

                setDuplicatePrompt((prev) => {
                  const existing = prev?.duplicates || [];
                  const has = existing.some(
                    (d: any) => d.caseId === mapped.caseId,
                  );
                  const duplicates = has ? existing : [...existing, mapped];
                  return {
                    mode: "active",
                    ...(prev || {}),
                    duplicates,
                  } as any;
                });
              }}
            />
          </div>

          <div className="flex flex-col justify-center min-h-0">
            <NewRequestShippingSection
              caseInfos={caseInfos}
              setCaseInfos={setCaseInfos}
              highlight={highlightStep === "shipping"}
              sectionHighlightClass={sectionHighlightClass}
              weeklyBatchLabel={weeklyBatchLabel}
              weeklyBatchDays={weeklyBatchDays}
              onWeeklyBatchDaysChange={setWeeklyBatchDays}
              onOpenShippingSettings={() =>
                navigate("/dashboard/settings?tab=shipping")
              }
              onSubmit={() => {
                if (!files.length) {
                  toast({
                    title: "파일이 필요합니다",
                    description:
                      "최소 1개의 커스텀 어벗 STL 파일을 추가한 뒤 의뢰해주세요.",
                    variant: "destructive",
                    duration: 4000,
                  });
                  return;
                }
                if (unverifiedCount > 0) {
                  const firstUnverifiedIndex = files.findIndex((file) => {
                    const key = `${String(file.name || "").normalize("NFC")}:${file.size}`;
                    return !fileVerificationStatus[key];
                  });
                  if (firstUnverifiedIndex >= 0) {
                    setSelectedPreviewIndex(firstUnverifiedIndex);
                  }
                  setFocusUnverifiedTick((prev) => prev + 1);
                  setHighlightUnverifiedArrows(true);
                  toast({
                    title: "확인 필요",
                    description: `카드를 클릭해서 환자/임플란트 정보를 입력해주세요.`,
                    duration: 5000,
                  });
                  setTimeout(() => setHighlightUnverifiedArrows(false), 10000);
                  return;
                }
                (async () => {
                  if (!weeklyBatchDays.length) {
                    try {
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(
                          new CustomEvent("abuts:shipping:needs-weekly-days"),
                        );
                      }
                    } catch {}
                    toast({
                      title: "설정 필요",
                      description:
                        "이 화면의 ‘묶음 배송’ 섹션에서 요일을 선택한 후 다시 시도하세요.",
                      variant: "destructive",
                      duration: 4500,
                    });
                    return;
                  }

                  toast({
                    title: "의뢰 접수중",
                    description: "제출을 처리하고 있어요. 잠시만 기다려주세요.",
                    duration: 3000,
                  });
                  handleSubmit();
                })();
              }}
            />
          </div>
        </div>
      </div>
    </PageFileDropZone>
  );
};

export default NewRequestPage;
