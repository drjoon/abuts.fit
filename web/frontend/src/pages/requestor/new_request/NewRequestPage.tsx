import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNewRequestPage } from "./hooks/useNewRequestPage";
import { useToast } from "@/hooks/use-toast";
import { usePresetStorage } from "./hooks/usePresetStorage";
import { useBulkShippingPolicy } from "./hooks/useBulkShippingPolicy";
import { useExpressShipping } from "./hooks/useExpressShipping";
import { useFileVerification } from "./hooks/useFileVerification";
import { apiFetch } from "@/lib/apiClient";
import { MultiActionDialog } from "@/components/MultiActionDialog";
import { PageFileDropZone } from "@/components/PageFileDropZone";
import { GuideFocus } from "@/features/guidetour/GuideFocus";
import { useGuideTour } from "@/features/guidetour/GuideTourProvider";
import { NewRequestDetailsSection } from "./components/NewRequestDetailsSection";
import { NewRequestUploadSection } from "./components/NewRequestUploadSection";
import { NewRequestShippingSection } from "./components/NewRequestShippingSection";
import { NewRequestPageSkeleton } from "@/components/common/NewRequestPageSkeleton";

/**
 * New Request 페이지 (리팩터링 버전)
 * - caseInfos를 단일 소스로 사용 (aiFileInfos 제거)
 * - 파일별 메타데이터는 Draft.files에서 관리
 * - 환자명/치아번호 옵션은 caseInfos에서 파생
 */
export const NewRequestPage = () => {
  const { id: existingRequestId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const FILE_SIZE_THRESHOLD_BYTES = 3 * 1024 * 1024; // 1MB

  const { toast } = useToast();

  const [isFillHoleProcessing, setIsFillHoleProcessing] = useState(false);
  const [filledStlFiles, setFilledStlFiles] = useState<Record<string, File>>(
    {}
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
    handleSubmitWithDuplicateResolution,
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

    // 파일이 하나라도 있으면 업로드 스텝은 완료로 처리해서
    // 업로드존/상세입력존 사이에서 가이드 포커스가 흔들리는 것을 방지한다.
    const hasFiles = files.length > 0;
    setStepCompleted("requestor.new_request.upload", hasFiles);
  }, [activeTourId, files.length, guideActive, setStepCompleted]);

  useEffect(() => {
    if (!guideActive) return;
    if (activeTourId !== "requestor-new-request") return;

    // 모든 파일이 확인되면 details 스텝을 완료로 처리해서
    // details/shipping 간 포커스 경쟁을 줄인다.
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
    // 업로드 전 중복 체크에서 뜬 모달인 경우:
    // - skip(기존의뢰 유지): 업로드 자체를 진행하지 않음
    // - replace(새의뢰로 교체): 업로드 진행 + 제출 시 duplicateResolutions 반영을 위해 decision 저장
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
      const nextPendingUploadFiles =
        choice.strategy === "skip"
          ? (pendingUploadFiles || []).filter(
              (f) => `${f.name}:${f.size}` !== fileKey
            )
          : [...pendingUploadFiles];

      if (choice.strategy === "replace" || choice.strategy === "remake") {
        const strategy: "replace" | "remake" = choice.strategy;
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

      if (choice.strategy === "skip") {
        setPendingUploadDecisions((prev) => {
          const next = { ...(prev || {}) };
          delete next[fileKey];
          delete next[fileKeyNfc];
          return next;
        });
      }

      const totalDup = duplicatePrompt?.duplicates?.length || 0;
      const nextCursor = duplicateCursor + 1;

      if (nextCursor < totalDup) {
        setPendingUploadFiles(nextPendingUploadFiles);
        setDuplicateCursor(nextCursor);
        return;
      }

      setPendingUploadFiles(null);
      setDuplicatePrompt(null);

      if (nextPendingUploadFiles.length > 0) {
        await handleUploadUnchecked(nextPendingUploadFiles);
      }
      return;
    }

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

    setDuplicatePrompt(null);

    if (nextResolutions.length === 1) {
      // 단일 중복 케이스는 legacy duplicateResolution 경로로 처리해 서버 409 반복을 방지
      const single = nextResolutions[0];
      await handleSubmitWithDuplicateResolution({
        strategy: single.strategy === "skip" ? "replace" : single.strategy,
        existingRequestId: single.existingRequestId,
      });
      return;
    }

    await handleSubmitWithDuplicateResolutions(nextResolutions);
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
          "3MB 이상의 파일은 업로드할 수 없습니다. 커스텀 어벗 STL 파일만 업로드해주세요.",
      };
    }
    return { valid: true };
  };

  const runFillHole = async (files: File[]) => {
    if (!files.length) return;

    setIsFillHoleProcessing(true);
    try {
      // 1) 개별 파일에 대해 순차적으로 또는 병렬로 API 호출
      // 결과가 오는대로 즉시 상태에 업데이트하여 UI에 반영
      await Promise.allSettled(
        files.map(async (file) => {
          const fileKey = toNormalizedFileKey(file);
          const fd = new FormData();
          fd.append("file", file);

          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => {
            controller.abort();
          }, 5 * 60 * 1000);

          try {
            const res = await apiFetch({
              path: "/api/rhino/fillhole",
              method: "POST",
              body: fd,
              signal: controller.signal,
            });

            if (!res.ok) {
              throw new Error(
                (res.data as any)?.message ||
                  `스크류홀 메우기 실패 (HTTP ${res.status})`
              );
            }

            const buf = await res.raw.arrayBuffer();
            const outName = (() => {
              const raw = file.name || "input.stl";
              if (!raw.toLowerCase().endsWith(".stl")) return `${raw}.fw.stl`;
              return raw.replace(/\.stl$/i, ".fw.stl");
            })();

            const filled = new File([buf], outName, {
              type: "application/sla",
            });

            // 결과 업데이트 (개별 파일 완료 시점)
            setFilledStlFiles((prev) => ({ ...prev, [fileKey]: filled }));

            // 해당 파일의 카드로 자동 포커스 및 선택
            const fileIndex = files.findIndex(
              (f) => toNormalizedFileKey(f) === fileKey
            );
            if (fileIndex !== -1) {
              setSelectedPreviewIndex(fileIndex);
            }
          } catch (error: any) {
            console.error(`Fill hole failed for ${file.name}:`, error);
            throw error;
          } finally {
            window.clearTimeout(timeoutId);
          }
        })
      ).then((results) => {
        const failed = results
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => r.status === "rejected")
          .map(({ r, idx }) => {
            const reason = (r as PromiseRejectedResult).reason;
            const msg = (() => {
              const originalMsg = String(reason?.message || reason || "");
              if (
                originalMsg.includes("ECONNREFUSED") ||
                originalMsg.includes("Failed to fetch")
              ) {
                return "스크류홀 메우는 앱이 일시적으로 중단되었습니다. 홀메우기 없이 진행합니다.";
              }
              if (reason?.name === "AbortError") {
                return "처리 시간이 오래 걸려 중단되었습니다.";
              }
              return originalMsg || "알 수 없는 오류";
            })();
            return `${files[idx]?.name || "파일"}: ${msg}`;
          });

        if (failed.length > 0) {
          toast({
            title: "일부 파일 처리 오류",
            description: failed.join("\n"),
            variant: "destructive",
            duration: 6000,
          });
        }
      });
    } finally {
      setIsFillHoleProcessing(false);
    }
  };

  const reportFillHoleIssue = async (originalFile?: File) => {
    try {
      const roomRes = await apiFetch<any>({
        path: "/api/chats/support-room",
        method: "GET",
      });
      if (!roomRes.ok) {
        throw new Error(
          (roomRes.data as any)?.message || "지원 채팅방을 불러오지 못했습니다."
        );
      }

      const roomData = (roomRes.data as any)?.data || roomRes.data;
      const roomId = String(roomData?._id || "").trim();
      if (!roomId) throw new Error("지원 채팅방을 찾을 수 없습니다.");

      const fileName = String(originalFile?.name || "").trim();
      const fileKey = originalFile ? toNormalizedFileKey(originalFile) : "";
      const ci = fileKey ? (caseInfosMap as any)?.[fileKey] : null;
      const clinicName = String(
        ci?.clinicName || caseInfos?.clinicName || ""
      ).trim();
      const patientName = String(
        ci?.patientName || caseInfos?.patientName || ""
      ).trim();
      const tooth = String(ci?.tooth || caseInfos?.tooth || "").trim();

      const content = [
        "[자동 리포트] 홀 메우기 결과에 문제가 있어 의뢰를 보류합니다.",
        fileName ? `파일: ${fileName}` : "",
        clinicName ? `치과: ${clinicName}` : "",
        patientName ? `환자: ${patientName}` : "",
        tooth ? `치아: ${tooth}` : "",
        "증상: (여기에 문제를 간단히 적어주세요)",
      ]
        .filter(Boolean)
        .join("\n");

      const msgRes = await apiFetch<any>({
        path: `/api/chats/rooms/${roomId}/messages`,
        method: "POST",
        jsonBody: { content, attachments: [] },
      });
      if (!msgRes.ok) {
        throw new Error(
          (msgRes.data as any)?.message || "리포트 메시지 전송에 실패했습니다."
        );
      }

      const detail = {
        roomId,
        prefill: content,
      };

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("abuts:open-support-chat", { detail })
        );
      }, 0);
    } catch (e: any) {
      toast({
        title: "오류",
        description: e?.message || "리포트 전송 중 오류가 발생했습니다.",
        variant: "destructive",
        duration: 4000,
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
      void (async () => {
        try {
          await Promise.all([
            handleUpload(filesToUpload),
            runFillHole(filesToUpload),
          ]);
        } catch (e: any) {
          toast({
            title: "오류",
            description:
              e?.message ||
              "업로드 또는 스크류홀 메우기 처리 중 오류가 발생했습니다.",
            variant: "destructive",
            duration: 4000,
          });
        }
      })();
    }
  };

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="min-h-screen bg-gradient-subtle p-4 md:p-6"
    >
      {isFillHoleProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-lg">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            <div className="text-sm text-gray-800">
              업로드하고 스크류홀을 메웁니다. 잠시만 기다려주세요.
            </div>
          </div>
        </div>
      )}
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
                    {(currentDuplicate?.existingRequest?.caseInfos
                      ?.clinicName ||
                      currentDuplicate?.existingRequest?.caseInfos
                        ?.patientName ||
                      currentDuplicate?.existingRequest?.caseInfos?.tooth) && (
                      <span className="truncate">
                        {String(
                          currentDuplicate?.existingRequest?.caseInfos
                            ?.clinicName || ""
                        )
                          ? `치과: ${String(
                              currentDuplicate?.existingRequest?.caseInfos
                                ?.clinicName || ""
                            )}`
                          : ""}
                        {String(
                          currentDuplicate?.existingRequest?.caseInfos
                            ?.patientName || ""
                        )
                          ? ` / 환자: ${String(
                              currentDuplicate?.existingRequest?.caseInfos
                                ?.patientName || ""
                            )}`
                          : ""}
                        {String(
                          currentDuplicate?.existingRequest?.caseInfos?.tooth ||
                            ""
                        )
                          ? ` / 치아: ${String(
                              currentDuplicate?.existingRequest?.caseInfos
                                ?.tooth || ""
                            )}`
                          : ""}
                      </span>
                    )}
                    {currentDuplicate?.fileName && (
                      <span className="truncate">
                        파일: {String(currentDuplicate.fileName || "")}
                      </span>
                    )}
                    <span className="truncate">
                      상태:{" "}
                      {String(
                        currentDuplicate?.existingRequest?.status2 === "완료"
                          ? "완료"
                          : currentDuplicate?.existingRequest
                              ?.manufacturerStage ||
                              currentDuplicate?.existingRequest?.status ||
                              ""
                      )}
                    </span>
                    {currentDuplicate?.existingRequest?.price?.amount !=
                      null && (
                      <span className="truncate">
                        금액(공급가):{" "}
                        {Number(
                          currentDuplicate?.existingRequest?.price?.amount || 0
                        ).toLocaleString()}
                        원
                      </span>
                    )}
                    {currentDuplicate?.existingRequest?.createdAt && (
                      <span className="truncate">
                        접수일:{" "}
                        {String(
                          currentDuplicate.existingRequest.createdAt
                        ).slice(0, 10)}
                      </span>
                    )}
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

            if (existingRequestMongoId && caseId) {
              actions.push({
                label: "기존의뢰 유지",
                variant: "secondary",
                onClick: async () => {
                  await applyDuplicateChoice({
                    strategy: "skip",
                    caseId,
                    existingRequestId: existingRequestMongoId,
                  });
                },
              });
              actions.unshift({
                label: "새의뢰로 교체",
                variant: "primary",
                onClick: async () => {
                  await applyDuplicateChoice({
                    strategy: mode === "completed" ? "remake" : "replace",
                    caseId,
                    existingRequestId: existingRequestMongoId,
                  });
                },
              });
            } else {
              actions.push({
                label: "닫기",
                variant: "secondary",
                onClick: async () => {
                  setDuplicatePrompt(null);
                },
              });
            }

            return actions;
          })()}
          onClose={() => setDuplicatePrompt(null)}
        />

        <GuideFocus stepId="requestor.new_request.details">
          <NewRequestDetailsSection
            files={files}
            filledStlFiles={filledStlFiles}
            onReportFillHoleIssue={reportFillHoleIssue}
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
