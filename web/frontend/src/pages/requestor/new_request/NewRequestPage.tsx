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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * New Request 페이지 (리팩터링 버전)
 * - caseInfos를 단일 소스로 사용 (aiFileInfos 제거)
 * - 파일별 메타데이터는 Draft.files에서 관리
 * - 환자명/치아번호 옵션은 caseInfos에서 파생
 */
export const NewRequestPage = () => {
  const { id: existingRequestId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const FILE_SIZE_THRESHOLD_BYTES = 30 * 1024 * 1024;
  const ABUTMENT_MAX_BYTES = 1 * 1024 * 1024; // 어벗 STL은 1MB 이하만 허용

  const { toast } = useToast();

  const [isFillHoleProcessing, setIsFillHoleProcessing] = useState(false);
  const [filledStlFiles, setFilledStlFiles] = useState<Record<string, File>>(
    {},
  );
  const [companionFilesForSubmit, setCompanionFilesForSubmit] = useState<File[]>([]);

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
    handleRemoveFile: rawHandleRemoveFile,
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
    duplicatePromptFromSubmit,
    setDuplicatePromptFromSubmit,
    duplicateResolutions,
    setDuplicateResolutions,
    handleSubmitWithDuplicateResolutions,
    draftStatus,
  } = useNewRequestPage(existingRequestId, {
    companionFiles: companionFilesForSubmit,
  });

  const {
    fileVerificationStatus,
    setFileVerificationStatus,
    highlightUnverifiedArrows,
    setHighlightUnverifiedArrows,
    unverifiedCount,
    highlightStep,
  } = useFileVerification({ files });

  // 파일 삭제는 rawHandleRemoveFile이 처리하고,
  // fileVerificationStatus cleanup은 useFileVerification의 effect가 자동으로 처리
  const handleRemoveFile = rawHandleRemoveFile;

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
    setCompanionFilesForSubmit([]);

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

  const resolveExistingRequestId = (dupLike: any) => {
    const id = String(
      dupLike?.existingRequestId ||
        dupLike?.existingRequest?._id ||
        dupLike?.existingRequest?.id ||
        "",
    ).trim();
    return id;
  };

  const applyDuplicateChoice = async (choice: {
    strategy: "skip" | "replace" | "remake";
    caseId: string;
    existingRequestId: string;
  }) => {
    const safeExistingRequestId = String(choice.existingRequestId || "").trim();
    if (choice.strategy !== "skip" && !safeExistingRequestId) {
      toast({
        title: "중복 처리 실패",
        description:
          "기존 의뢰 식별자를 찾을 수 없어 처리할 수 없습니다. 다시 시도해주세요.",
        variant: "destructive",
      });
      return;
    }
    // skip 선택 시 파일 제거
    if (choice.strategy === "skip") {
      let fileIndex = -1;

      // caseId가 fileKey 형식(name:size)인 경우 직접 파일명 추출
      if (choice.caseId.includes(":")) {
        const [fileName] = choice.caseId.split(":");
        fileIndex = (files || []).findIndex((f) => f.name === fileName);
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
        await handleRemoveFile(fileIndex);
      }
    }

    // 중복 해결 정보 저장
    const nextResolutions = (() => {
      const next = (duplicateResolutions || []).filter(
        (r) => r.caseId !== choice.caseId,
      );
      next.push({
        ...choice,
        existingRequestId: safeExistingRequestId,
      });
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

    // 모든 중복 건 처리 완료
    const finalResolutions = nextResolutions.map((r) => ({
      caseId: r.caseId,
      strategy: r.strategy,
      existingRequestId: r.existingRequestId,
    }));

    setDuplicateResolutions(finalResolutions as any);
    setDuplicatePrompt(null);

    // 제출 중 서버 중복 응답으로 열린 모달이면, 선택 즉시 재제출한다.
    // useNewRequestSubmitV2의 preparedDraft 재사용으로 기존 업로드를 재사용해 재업로드를 피한다.
    if (duplicatePromptFromSubmit) {
      setDuplicatePromptFromSubmit(false);
      toast({
        title: "중복 처리 완료",
        description: "선택한 방식으로 의뢰를 접수하고 있어요.",
        duration: 4000,
      });
      await handleSubmitWithDuplicateResolutions(finalResolutions as any);
    }
  };

  const renderDuplicateActions = (dup: any) => {
    const stageOrder = Number(dup?.stageOrder ?? 0);
    const isCancelableStage =
      typeof dup?.isCancelableStage === "boolean"
        ? dup.isCancelableStage
        : stageOrder <= 1;

    const primaryStrategy: "replace" | "remake" = isCancelableStage
      ? "replace"
      : "remake";
    const primaryLabel = isCancelableStage
      ? "기존 의뢰 취소 후 재의뢰"
      : "재의뢰로 접수";

    return (
      <div className="flex gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void applyDuplicateChoice({
              strategy: primaryStrategy,
              caseId: dup.caseId,
              existingRequestId: resolveExistingRequestId(dup),
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
            void applyDuplicateChoice({
              strategy: "skip",
              caseId: dup.caseId,
              existingRequestId: resolveExistingRequestId(dup),
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

  const CAD_COMPANION_EXTS = new Set([
    ".constructioninfo",
    ".dentalproject",
    ".cln",
    ".3shapeorder",
    ".xml",
  ]);

  const ABUT_HINT_KEYWORDS = [
    "abut",
    "abutment",
    "tibase",
    "ti-base",
    "customabut",
    "custom_abut",
    "angulated",
    "hybrid",
    "어벗",
  ];

  const CROWN_HINT_KEYWORDS = [
    "crown",
    "coping",
    "bridge",
    "pontic",
    "inlay",
    "onlay",
    "veneer",
    "provisional",
    "temporary",
    "temp",
    "zirconia",
    "fullarch",
    "full-arch",
    "크라운",
    "브릿지",
    "코핑",
  ];

  type AmbiguousUploadCandidate = {
    id: string;
    file: File;
    reason: string;
    recommended: boolean;
  };

  type ClassifiedUploadBatch = {
    stlFilesToUpload: File[];
    companionFilesToHandle: File[];
    ambiguousFiles: AmbiguousUploadCandidate[];
    rejectedFiles: { name: string; reason: string }[];
    ignoredFiles: { name: string; reason: string }[];
  };

  type WebkitFileSystemEntry = {
    isFile: boolean;
    isDirectory: boolean;
    file?: (callback: (file: File) => void) => void;
    createReader?: () => {
      readEntries: (callback: (entries: WebkitFileSystemEntry[]) => void) => void;
    };
  };

  type DataTransferItemWithEntry = DataTransferItem & {
    webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
  };

  const [fileReviewOpen, setFileReviewOpen] = useState(false);
  const [reviewBatch, setReviewBatch] = useState<ClassifiedUploadBatch | null>(null);
  const [reviewSelection, setReviewSelection] = useState<Record<string, boolean>>({});

  const getFileExtLower = (name: string) => {
    const lower = String(name || "").trim().toLowerCase();
    const dot = lower.lastIndexOf(".");
    if (dot < 0) return "";
    return lower.slice(dot);
  };

  const companionFileHandlerRef = useRef<(files: File[]) => void>(() => {});

  const dedupeFiles = (input: File[]) => {
    const map = new Map<string, File>();
    for (const file of input) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!map.has(key)) map.set(key, file);
    }
    return [...map.values()];
  };

  const isLikelyCrownDesignStl = (fileName: string) => {
    const lower = String(fileName || "").toLowerCase();
    const hasCrownHint = CROWN_HINT_KEYWORDS.some((k) => lower.includes(k));
    if (!hasCrownHint) return false;
    const hasAbutHint = ABUT_HINT_KEYWORDS.some((k) => lower.includes(k));
    return !hasAbutHint;
  };

  const isLikelyAbutStlName = (fileName: string) => {
    const lower = String(fileName || "").toLowerCase();
    return ABUT_HINT_KEYWORDS.some((k) => lower.includes(k));
  };

  const isLikelyThreeShapeMetadataXml = (fileName: string) => {
    const lower = String(fileName || "").toLowerCase();
    return (
      lower.includes("implantdirectionposition") ||
      lower.includes("dentalproject") ||
      lower.includes("3shape") ||
      lower.includes("order")
    );
  };

  const classifyIncomingFiles = (selectedFiles: File[]): ClassifiedUploadBatch => {
    const stlFilesToUpload: File[] = [];
    const companionFilesToHandle: File[] = [];
    const ambiguousFiles: AmbiguousUploadCandidate[] = [];
    const rejectedFiles: { name: string; reason: string }[] = [];
    const ignoredFiles: { name: string; reason: string }[] = [];

    selectedFiles.forEach((file) => {
      const ext = getFileExtLower(file.name);
      const sizeMb = file.size / (1024 * 1024);

      if (ext === ".xml") {
        if (isLikelyThreeShapeMetadataXml(file.name)) {
          companionFilesToHandle.push(file);
        } else {
          rejectedFiles.push({
            name: file.name,
            reason: "XML 파일은 3Shape 메타파일(예: ImplantDirectionPosition)만 받습니다.",
          });
        }
        return;
      }

      if (ext === ".pts") {
        ignoredFiles.push({
          name: file.name,
          reason: "PTS 파일은 현재 업로드 대상에서 자동 제외됩니다.",
        });
        return;
      }

      if (CAD_COMPANION_EXTS.has(ext)) {
        companionFilesToHandle.push(file);
        return;
      }

      if (ext !== ".stl") {
        rejectedFiles.push({
          name: file.name,
          reason:
            "필요한 파일만 받습니다. 어벗 STL과 구성정보 파일만 업로드할 수 있어요.",
        });
        return;
      }

      if (file.size > ABUTMENT_MAX_BYTES) {
        ambiguousFiles.push({
          id: toNormalizedFileKey(file),
          file,
          recommended: false,
          reason: `STL (${sizeMb.toFixed(2)}MB): 1MB 초과라 크라운/브릿지 가능성이 높아 비추천합니다.`,
        });
        return;
      }

      if (file.size >= FILE_SIZE_THRESHOLD_BYTES) {
        rejectedFiles.push({
          name: file.name,
          reason: "30MB 이상 STL은 제외됩니다.",
        });
        return;
      }

      if (isLikelyCrownDesignStl(file.name)) {
        rejectedFiles.push({
          name: file.name,
          reason: "크라운/브릿지 디자인 STL로 보여서 제외했습니다.",
        });
        return;
      }

      if (isLikelyAbutStlName(file.name)) {
        stlFilesToUpload.push(file);
        return;
      }

      const likelyBySize = file.size >= 80 * 1024 && file.size <= 12 * 1024 * 1024;
      ambiguousFiles.push({
        id: toNormalizedFileKey(file),
        file,
        recommended: likelyBySize,
        reason: likelyBySize
          ? `STL (${sizeMb.toFixed(2)}MB): 어벗 가능성이 높습니다.`
          : `STL (${sizeMb.toFixed(2)}MB): 파일명 기준으로 용도 판단이 어려워요.`,
      });
    });

    return {
      stlFilesToUpload,
      companionFilesToHandle,
      ambiguousFiles,
      rejectedFiles,
      ignoredFiles,
    };
  };

  const onUpload = async (filesToUpload: File[]) => {
    try {
      await handleUpload(filesToUpload);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "파일 업로드 중 오류가 발생했습니다.";
      toast({
        title: "오류",
        description: message,
        variant: "destructive",
      });
    }
  };

  const applyClassifiedBatch = (batch: ClassifiedUploadBatch, selection?: Record<string, boolean>) => {
    const selectedAmbiguous = (batch.ambiguousFiles || [])
      .filter((item) => selection?.[item.id])
      .map((item) => item.file);

    const stlFiles = [...batch.stlFilesToUpload, ...selectedAmbiguous];

    if (batch.companionFilesToHandle.length > 0) {
      companionFileHandlerRef.current(batch.companionFilesToHandle);
      setCompanionFilesForSubmit((prev) => {
        const map = new Map<string, File>();
        for (const file of [...prev, ...batch.companionFilesToHandle]) {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (!map.has(key)) map.set(key, file);
        }
        return [...map.values()];
      });
    }

    if (stlFiles.length > 0) {
      setFileVerificationStatus((prev) => {
        const next = { ...prev };
        for (const file of stlFiles) {
          next[toNormalizedFileKey(file)] = false;
        }
        return next;
      });
      void onUpload(stlFiles);
    }

    if (batch.rejectedFiles.length > 0) {
      toast({
        title: "일부 파일이 제외되었습니다",
        description: batch.rejectedFiles[0].reason,
        variant: "destructive",
        duration: 3500,
      });
    } else if (batch.ignoredFiles.length > 0) {
      toast({
        title: "일부 파일은 자동 제외되었어요",
        description: batch.ignoredFiles[0].reason,
        duration: 2500,
      });
    }

    if (stlFiles.length === 0 && batch.companionFilesToHandle.length === 0) {
      toast({
        title: "업로드할 파일이 없습니다",
        description: "선택된 파일 중 업로드 가능한 파일이 없었습니다.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleIncomingFiles = (selectedFiles: File[]) => {
    const normalized = dedupeFiles(selectedFiles || []);
    if (!normalized.length) return;

    const batch = classifyIncomingFiles(normalized);

    if (batch.ambiguousFiles.length === 0) {
      applyClassifiedBatch(batch);
      return;
    }

    const initialSelection: Record<string, boolean> = {};
    for (const item of batch.ambiguousFiles) {
      initialSelection[item.id] = item.recommended;
    }

    setReviewBatch(batch);
    setReviewSelection(initialSelection);
    setFileReviewOpen(true);
  };

  const readAllEntries = async (reader: {
    readEntries: (callback: (entries: WebkitFileSystemEntry[]) => void) => void;
  }): Promise<WebkitFileSystemEntry[]> => {
    const all: WebkitFileSystemEntry[] = [];

    while (true) {
      const chunk = await new Promise<WebkitFileSystemEntry[]>((resolve) => {
        reader.readEntries((entries) => resolve(entries || []));
      });
      if (!chunk.length) break;
      all.push(...chunk);
    }

    return all;
  };

  const traverseDroppedEntry = async (
    entry: WebkitFileSystemEntry,
  ): Promise<File[]> => {
    if (entry.isFile && entry.file) {
      const file = await new Promise<File | null>((resolve) => {
        try {
          entry.file?.((f) => resolve(f));
        } catch {
          resolve(null);
        }
      });
      return file ? [file] : [];
    }

    if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      const entries = await readAllEntries(reader);
      const nested = await Promise.all(entries.map((child) => traverseDroppedEntry(child)));
      return nested.flat();
    }

    return [];
  };

  const extractDroppedFiles = async (
    droppedItems: DataTransferItem[],
    droppedDirectFiles: File[],
  ) => {
    const items = Array.from(droppedItems || []);

    if (!items.length) {
      return dedupeFiles(Array.from(droppedDirectFiles || []));
    }

    const all: File[] = [];

    for (const item of items) {
      const withHandle = item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<unknown>;
      };
      if (typeof withHandle.getAsFileSystemHandle === "function") {
        try {
          const handle = await withHandle.getAsFileSystemHandle();
          if (
            handle &&
            (handle as { kind?: string }).kind === "file" &&
            typeof (handle as { getFile?: () => Promise<File> }).getFile === "function"
          ) {
            const file = await (handle as { getFile: () => Promise<File> }).getFile();
            if (file) {
              all.push(file);
              continue;
            }
          }
        } catch {
          // fallback to webkit/dataTransfer path
        }
      }

      const withEntry = item as DataTransferItemWithEntry;
      const entry = withEntry.webkitGetAsEntry?.();
      if (entry) {
        const filesFromEntry = await traverseDroppedEntry(entry);
        all.push(...filesFromEntry);
        continue;
      }
      const file = item.getAsFile();
      if (file) all.push(file);
    }

    const directFiles = Array.from(droppedDirectFiles || []);
    return dedupeFiles([...all, ...directFiles]);
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
            setDuplicatePromptFromSubmit(false);
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
              {duplicatePrompt?.remakeQuota && (
                <div className="rounded border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-800">
                  이번 달 무료 재의뢰: {duplicatePrompt.remakeQuota.limit}건 중{" "}
                  {duplicatePrompt.remakeQuota.used}건 사용, 잔여{" "}
                  {duplicatePrompt.remakeQuota.remaining}건
                </div>
              )}
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

        <Dialog open={fileReviewOpen} onOpenChange={setFileReviewOpen}>
          <DialogContent className="sm:max-w-[680px]">
            <DialogHeader>
              <DialogTitle>파일 확인 후 업로드</DialogTitle>
              <DialogDescription>
                어벗 디자인 파일을 선택해주세요.
                <span className="font-medium">
                  추천 파일은 파란 배지로 강조되어 있습니다.
                </span>
                <br />
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[360px] overflow-y-auto rounded-md border p-2 space-y-1.5">
              {(reviewBatch?.ambiguousFiles || []).map((item) => {
                const checked = Boolean(reviewSelection[item.id]);
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer ${
                      checked ? "border-blue-300 bg-blue-50/60" : "border-slate-200"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        setReviewSelection((prev) => ({
                          ...prev,
                          [item.id]: Boolean(next),
                        }));
                      }}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.file.name}</span>
                        {item.recommended ? (
                          <Badge className="bg-blue-600 hover:bg-blue-600">추천 업로드</Badge>
                        ) : (
                          <Badge variant="secondary">비추천</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{item.reason}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setFileReviewOpen(false);
                  setReviewBatch(null);
                  setReviewSelection({});
                }}
              >
                취소
              </Button>
              <Button
                onClick={() => {
                  if (reviewBatch) {
                    applyClassifiedBatch(reviewBatch, reviewSelection);
                  }
                  setFileReviewOpen(false);
                  setReviewBatch(null);
                  setReviewSelection({});
                }}
              >
                선택 파일 업로드
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                const droppedItems = Array.from(e.dataTransfer?.items || []);
                const droppedDirectFiles = Array.from(e.dataTransfer?.files || []);
                void (async () => {
                  const dropped = await extractDroppedFiles(
                    droppedItems,
                    droppedDirectFiles,
                  );
                  handleIncomingFiles(dropped);
                })();
              }}
              onFilesSelected={handleIncomingFiles}
              registerCompanionFileHandler={(handler) => {
                companionFileHandlerRef.current = handler;
              }}
              onCompanionFilesAccepted={(filesAccepted) => {
                setCompanionFilesForSubmit((prev) => {
                  const map = new Map<string, File>();
                  for (const file of [...prev, ...filesAccepted]) {
                    const key = `${file.name}:${file.size}:${file.lastModified}`;
                    if (!map.has(key)) map.set(key, file);
                  }
                  return [...map.values()];
                });
              }}
              onCompanionFilesChange={(nextFiles) => {
                setCompanionFilesForSubmit(nextFiles);
              }}
              weeklyBatchDays={weeklyBatchDays}
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
                  existingRequestId: resolveExistingRequestId(duplicate),
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
                    } catch {
                      // noop
                    }
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
                    duration: 15000,
                  });

                  if ((duplicateResolutions || []).length > 0) {
                    handleSubmitWithDuplicateResolutions(
                      duplicateResolutions as any,
                    );
                    return;
                  }

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
