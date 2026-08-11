// change-log:
// - 2026-08-11: 기공소 어벗의뢰 상단 — 거래 치과 등록 D-day 배너.
// - 2026-08-11: 상단 헤더(지난 의뢰) 제거 — 대시보드 최근 의뢰 카드로만 제공.
// - 2026-08-11: 아노다이징/디자인소프트웨어 기본값 변경은 기존 첨부 카드에 미반영(신규 업로드만).
// - 2026-08-11: 아노다이징을 의뢰건 caseInfos SSOT로 저장·뱃지 표시(디자인소프트웨어와 동일). 사업체는 기본값 시드만.
// - 2026-08-11: 설정 의뢰 탭 제거 후 아노다이징 토글을 좌측 상단(디자인소프트웨어 옆)으로 이전.
// - 2026-08-09: 왼쪽 첨부 패널을 넓혀 드롭존 안내 문구가 1줄로 유지되도록 함.
// - 2026-08-09: 신규의뢰 첨부 허용 확장자 STL/PLY/OBJ.
// - 2026-08-09: 연결 끊기 시 productMode 복원과 함께 출고 모드·일정을 다시 계산한다.
// - 2026-08-09: 구강스캔·디자인+생산은 메시 직경 없이 리드 1일로 출고 모드를 판정.
// - 2026-08-09: 우측 신속 비활성(디자인+1일 등)일 때 의뢰카드 신속 버튼도 함께 막는다.
// - 2026-08-09: 묶음 요일 변경 시 신규 days·구강스캔(디자인+1일)로 신속 선택 가능 여부를 다시 판정.
// - 2026-08-11: 상단 헤더에서 보유 크레딧 제거(사이드바 크레딧 페이지로 이전). 지난 의뢰만 유지.
// - 2026-08-09: 상단 헤더(보유 크레딧/지난 의뢰)를 RequestorWorkspaceHeader로 공유. 기간 필터는 신규의뢰에서 미표시.
// - 2026-08-04: 중복 의뢰 "취소 후 재의뢰" 선택 시 기존 의뢰/치과 즐겨찾기 정보로 누락 필드를 채우고 카드 검증을 자동 완료.
// - 2026-08-03: 중복 의뢰 안내 모달의 상태 표시를 공정 라벨 정규화(의뢰 -> 준비)로 표시. (display-only)
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { getNormalizedStageLabelSafe } from "@/utils/stage";
import { useParams, useNavigate } from "react-router-dom";
import { useNewRequestPage } from "./hooks/useNewRequestPage";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BusinessPaidAccessGate } from "@/shared/business/BusinessPaidAccessGate";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { LabTradingPartnerWindowBanner } from "@/features/lab/LabTradingPartnerWindowBanner";

import type { CaseInfos } from "./hooks/newRequestTypes";
import {
  isExpressShippingSelectable,
  type LeadTimesMap,
} from "@/shared/shipping/estimateShipDate";
import {
  findGroupByFileKey,
  isLikelyOralScanSize,
  resolveFileSizeBytes,
} from "./utils/patientGroups";


// related files:
// - web/frontend/src/pages/requestor/new_request/components/NewRequestDetailsSection.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/shared/shipping/estimateShipDate.ts
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/models/user.model.js
// Rhino의 align 기능이 구성정보를 대체하므로, 개별 구성정보 파일 업로드/매칭은 사용하지 않는다.


/**
 * New Request 페이지 (리팩터링 버전)
 * - caseInfos를 단일 소스로 사용 (aiFileInfos 제거)
 * - 파일별 메타데이터는 Draft.files에서 관리
 * - 환자명/치아번호 옵션은 caseInfos에서 파생
 */
export const NewRequestPage = () => (
  <BusinessPaidAccessGate>
    <NewRequestPageContent />
  </BusinessPaidAccessGate>
);

const NewRequestPageContent = () => {
  const { id: existingRequestId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const { toast } = useToast();
  const { token } = useAuthStore();
  const { kind: requestorKind } = useRequestorBusinessAccess();
  const isLabRequestor = requestorKind === "lab";

  const [designSoftwareModalOpen, setDesignSoftwareModalOpen] = useState(false);
  const [designSoftwareMode, setDesignSoftwareMode] = useState<
    "3Shape" | "ExoCAD" | "custom"
  >("3Shape");
  const [customDesignSoftware, setCustomDesignSoftware] = useState("");
  const designSoftwareCanEdit = true;
  const [canEditBusinessDesignSoftware, setCanEditBusinessDesignSoftware] =
    useState(false);
  const [designSoftwareSaving, setDesignSoftwareSaving] = useState(false);
  const [designSoftwareValue, setDesignSoftwareValue] = useState("");
  const [needsBusinessDesignSoftwareBootstrap, setNeedsBusinessDesignSoftwareBootstrap] =
    useState(false);
  const [anodizingEnabled, setAnodizingEnabled] = useState(true);
  const [anodizingSaving, setAnodizingSaving] = useState(false);

  const [isFillHoleProcessing, setIsFillHoleProcessing] = useState(false);
  const [filledStlFiles, setFilledStlFiles] = useState<Record<string, File>>(
    {},
  );

  const normalizeKeyPart = useCallback((s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  }, []);

  const toNormalizedFileKey = useCallback(
    (f: File) => {
      return `${normalizeKeyPart(f.name)}:${f.size}`;
    },
    [normalizeKeyPart],
  );

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
    clinicPresets: requestClinicPresets,
    duplicatePrompt,
    setDuplicatePrompt,
    duplicatePromptFromSubmit,
    setDuplicatePromptFromSubmit,
    duplicateResolutions,
    setDuplicateResolutions,
    handleSubmitWithDuplicateResolutions,
    draftStatus,
    attachmentListItems,
    patientGroups,
    groupSelectedFiles,
    ungroupPatientFiles,
    removeFileFromPatientGroup,
    clearPatientGroups,
  } = useNewRequestPage(existingRequestId, {
    enableOralScanGrouping: !isLabRequestor,
  });

  const countableFileKeys = useMemo(() => {
    if (!patientGroups?.length) return undefined;
    const grouped = new Set(patientGroups.flatMap((g) => g.fileKeys));
    const keys: string[] = [];
    for (const g of patientGroups) {
      const primary = g.fileKeys[0];
      if (primary) keys.push(primary);
    }
    for (const file of files) {
      const key = toNormalizedFileKey(file);
      if (!grouped.has(key)) keys.push(key);
    }
    return keys;
  }, [files, patientGroups, toNormalizedFileKey]);

  const {
    fileVerificationStatus,
    setFileVerificationStatus,
    highlightUnverifiedArrows,
    setHighlightUnverifiedArrows,
    unverifiedCount,
    highlightStep,
  } = useFileVerification({
    files,
    countableFileKeys,
  });



  // Requestor(계정) 디자인소프트웨어를 신규 의뢰 기본값으로 사용한다.
  // 단, 사업체/계정 requestSettings가 하나라도 비어 있으면 신규의뢰 진입 시 자동 생성(보정)한다.
  // 우선순위: Draft 기본값(__default__.designSoftware) > requestor > business
  useEffect(() => {
    if (!token) return;
    if (user?.role !== "requestor") return;

    let cancelled = false;

    const loadRequestorDesignSoftware = async () => {
      try {
        const res = await apiFetch<any>({
          path: "/api/businesses/me/request-settings",
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;

        const body: any = res.data || {};
        const data = body?.data || body;

        // 아노다이징 기본값: Draft __default__ > 의뢰자 계정 > 사업체 > ON
        const draftAnodizing = caseInfosMap?.__default__?.anodizingEnabled;
        const requestorAnodizing =
          typeof data?.requestorAnodizingEnabled === "boolean"
            ? data.requestorAnodizingEnabled
            : null;
        const businessAnodizing =
          typeof data?.anodizingEnabled === "boolean"
            ? data.anodizingEnabled
            : true;
        const resolvedAnodizing =
          typeof draftAnodizing === "boolean"
            ? draftAnodizing
            : typeof requestorAnodizing === "boolean"
              ? requestorAnodizing
              : businessAnodizing;
        setAnodizingEnabled(resolvedAnodizing);
        if (typeof draftAnodizing !== "boolean") {
          updateCaseInfos("__default__", { anodizingEnabled: resolvedAnodizing });
        }

        let requestorDefault = String(data?.requestorDesignSoftware || "").trim();
        let businessDefault = String(data?.designSoftware || "").trim();
        const draftDefault = String(
          caseInfosMap?.__default__?.designSoftware || "",
        ).trim();

        const canEditBusinessDesign =
          typeof data?.canEditDesignSoftware === "boolean"
            ? data.canEditDesignSoftware
            : false;
        setCanEditBusinessDesignSoftware(canEditBusinessDesign);

        const missingRequestorSettings = !requestorDefault;
        const missingBusinessSettings = !businessDefault;
        setNeedsBusinessDesignSoftwareBootstrap(
          missingBusinessSettings && canEditBusinessDesign,
        );

        // 사업체/계정 requestSettings 중 하나라도 비어 있으면 자동 생성(보정)
        if (missingRequestorSettings || missingBusinessSettings) {
          const bootstrapDefault =
            draftDefault || requestorDefault || businessDefault;

          if (bootstrapDefault) {
            const syncPayload: Record<string, string> = {};
            if (missingRequestorSettings) {
              syncPayload.requestorDesignSoftware = bootstrapDefault;
            }
            if (missingBusinessSettings && canEditBusinessDesign) {
              syncPayload.designSoftware = bootstrapDefault;
            }

            if (Object.keys(syncPayload).length > 0) {
              const syncRes = await apiFetch<any>({
                path: "/api/businesses/me/request-settings",
                method: "PUT",
                token,
                jsonBody: syncPayload,
              });

              if (syncRes.ok) {
                if (missingRequestorSettings) {
                  requestorDefault = bootstrapDefault;
                }
                if (missingBusinessSettings) {
                  businessDefault = bootstrapDefault;
                  setNeedsBusinessDesignSoftwareBootstrap(false);
                }
              } else {
                const syncBody: any = syncRes.data || {};
                const syncMessage = String(
                  syncBody?.message ||
                    "사업체/의뢰자 기본 소프트웨어 자동 주입에 실패했습니다.",
                );
                toast({
                  title: "설정 동기화 실패",
                  description: syncMessage,
                  variant: "destructive",
                });
                return;
              }
            }
          }
        }

        if (!requestorDefault) {
          toast({
            title: "디자인 소프트웨어 설정 필요",
            description: "의뢰자 계정의 디자인 소프트웨어를 먼저 설정해주세요.",
            variant: "destructive",
          });
          return;
        }

        // Draft 기본값이 있으면 서버 기본값으로 덮어쓰지 않는다.
        if (draftDefault) {
          setDesignSoftwareValue(draftDefault);
          return;
        }

        setDesignSoftwareValue(requestorDefault);
        updateCaseInfos("__default__", { designSoftware: requestorDefault });
      } catch {
        // ignore
      }
    };

    void loadRequestorDesignSoftware();

    return () => {
      cancelled = true;
    };
  }, [caseInfosMap, token, toast, updateCaseInfos, user?.role]);

  // Draft/로컬 복원으로 __default__.designSoftware가 늦게 들어오면
  // UI 표시값(designSoftwareValue)을 해당 값으로 동기화한다.
  useEffect(() => {
    const draftDefault = String(
      caseInfosMap?.__default__?.designSoftware || "",
    ).trim();
    if (!draftDefault) return;
    if (draftDefault === String(designSoftwareValue || "").trim()) return;
    setDesignSoftwareValue(draftDefault);
  }, [caseInfosMap, designSoftwareValue]);

  const handleSaveDesignSoftware = useCallback(async () => {
    const designSoftware =
      designSoftwareMode === "custom"
        ? String(customDesignSoftware || "").trim()
        : designSoftwareMode;

    if (!designSoftware) {
      toast({
        title: "입력값이 필요합니다",
        description: "직접 입력을 선택한 경우 소프트웨어 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "디자인 소프트웨어 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }

    setDesignSoftwareSaving(true);
    try {
      const savePayload: Record<string, string> = {
        requestorDesignSoftware: designSoftware,
      };
      if (
        needsBusinessDesignSoftwareBootstrap &&
        canEditBusinessDesignSoftware
      ) {
        savePayload.designSoftware = designSoftware;
      }

      const res = await apiFetch<any>({
        path: "/api/businesses/me/request-settings",
        method: "PUT",
        token,
        jsonBody: savePayload,
      });

      if (!res.ok) {
        const body: any = res.data || {};
        const message = String(
          body?.message || "디자인 소프트웨어 설정 저장에 실패했습니다.",
        );
        toast({
          title: "저장 실패",
          description: message,
          variant: "destructive",
        });
        return;
      }

      // 신규 업로드에 사용할 기본값만 저장한다.
      // 이미 존재하는 의뢰 카드(caseInfos)는 덮어쓰지 않는다.
      setDesignSoftwareValue(designSoftware);
      updateCaseInfos("__default__", { designSoftware });
      setDesignSoftwareModalOpen(false);
      if (needsBusinessDesignSoftwareBootstrap) {
        setNeedsBusinessDesignSoftwareBootstrap(false);
      }
      toast({
        title: "저장 완료",
        description: "의뢰 기본 디자인 소프트웨어가 저장되었습니다.",
      });
    } finally {
      setDesignSoftwareSaving(false);
    }
  }, [
    canEditBusinessDesignSoftware,
    customDesignSoftware,
    designSoftwareMode,
    needsBusinessDesignSoftwareBootstrap,
    toast,
    token,
    updateCaseInfos,
  ]);



  const handleOpenDesignSoftwareModal = useCallback(() => {
    const current = String(
      designSoftwareValue || caseInfosMap?.__default__?.designSoftware || "",
    ).trim();

    if (current === "3Shape" || current === "ExoCAD") {
      setDesignSoftwareMode(current);
      setCustomDesignSoftware("");
    } else if (current) {
      setDesignSoftwareMode("custom");
      setCustomDesignSoftware(current);
    } else {
      setDesignSoftwareMode("3Shape");
      setCustomDesignSoftware("");
    }

    setDesignSoftwareModalOpen(true);
  }, [caseInfosMap, designSoftwareValue]);

  const handleToggleAnodizing = useCallback(() => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "아노다이징 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (anodizingSaving) return;

    const next = !anodizingEnabled;
    const prev = anodizingEnabled;
    setAnodizingEnabled(next);
    // 디자인소프트웨어와 동일: 이미 첨부된 카드는 유지하고,
    // 신규 업로드 시드(__default__)·계정 기본값만 갱신한다.
    updateCaseInfos("__default__", { anodizingEnabled: next });

    setAnodizingSaving(true);
    void (async () => {
      try {
        const res = await apiFetch<any>({
          path: "/api/businesses/me/request-settings",
          method: "PUT",
          token,
          jsonBody: { requestorAnodizingEnabled: next },
        });

        if (!res.ok) {
          setAnodizingEnabled(prev);
          updateCaseInfos("__default__", { anodizingEnabled: prev });
          const body: any = res.data || {};
          toast({
            title: "저장에 실패했습니다",
            description:
              String(
                body?.message ||
                  "아노다이징 기본값 저장 중 오류가 발생했습니다.",
              ),
            variant: "destructive",
          });
          return;
        }

        const body: any = res.data || {};
        const data = body?.data || body;
        if (typeof data?.requestorAnodizingEnabled === "boolean") {
          setAnodizingEnabled(data.requestorAnodizingEnabled);
          updateCaseInfos("__default__", {
            anodizingEnabled: data.requestorAnodizingEnabled,
          });
        }
      } catch {
        setAnodizingEnabled(prev);
        updateCaseInfos("__default__", { anodizingEnabled: prev });
        toast({
          title: "저장에 실패했습니다",
          description: "아노다이징 기본값 저장 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setAnodizingSaving(false);
      }
    })();
  }, [
    anodizingEnabled,
    anodizingSaving,
    toast,
    token,
    updateCaseInfos,
  ]);

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

  const handleShippingModeChange = useCallback(
    (fileKeys: string[], mode: "normal" | "express") => {
      for (const key of fileKeys) {
        updateCaseInfos(key, { shippingMode: mode });
      }
    },
    [updateCaseInfos],
  );

  const knownFileKeysRef = useRef<Set<string>>(new Set());

  const handleCancelAll = async () => {
    const preservedDesignSoftware = String(
      designSoftwareValue || caseInfosMap?.__default__?.designSoftware || "",
    ).trim();
    const preservedAnodizing =
      typeof caseInfosMap?.__default__?.anodizingEnabled === "boolean"
        ? caseInfosMap.__default__.anodizingEnabled
        : anodizingEnabled;

    await resetDraft();
    handleCancel();
    clearLocalDraft();
    clearPatientGroups();
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

    if (preservedDesignSoftware) {
      updateCaseInfos("__default__", { designSoftware: preservedDesignSoftware });
      setDesignSoftwareValue(preservedDesignSoftware);
      if (
        preservedDesignSoftware === "3Shape" ||
        preservedDesignSoftware === "ExoCAD"
      ) {
        setDesignSoftwareMode(preservedDesignSoftware);
        setCustomDesignSoftware("");
      } else {
        setDesignSoftwareMode("custom");
        setCustomDesignSoftware(preservedDesignSoftware);
      }
    }

    setAnodizingEnabled(preservedAnodizing);
    updateCaseInfos("__default__", { anodizingEnabled: preservedAnodizing });

    const fileInput = document.getElementById(
      "file-input",
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }

    toast({
      title: "전체 삭제 완료",
      description: "첨부/입력이 초기화되었습니다.",
      duration: 2500,
    });
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

  const getFileKeyByDraftCaseId = useCallback((draftCaseId: string) => {
    const found = (files || []).find(
      (f) => String((f as any)?._draftCaseInfoId || "") === String(draftCaseId),
    );
    if (!found) return null;
    try {
      return `${String(found.name || "").normalize("NFC")}:${found.size}`;
    } catch {
      return `${found.name}:${found.size}`;
    }
  }, [files]);

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
    [caseInfosMap, files, getFileKeyByDraftCaseId],
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

  const hasExistingRequestDuplicate = useMemo(
    () => duplicateList.some((dup) => Boolean(resolveExistingRequestId(dup))),
    [duplicateList],
  );

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

    const matchedDuplicate = (duplicatePrompt?.duplicates || []).find(
      (d) => String(d?.caseId || "") === String(choice.caseId || ""),
    );

    const resolveFileIndexForCaseId = (caseId: string) => {
      let fileIndex = -1;

      // caseId가 fileKey 형식(name:size)인 경우 직접 파일명 추출
      if (caseId.includes(":")) {
        const [fileName] = caseId.split(":");
        fileIndex = (files || []).findIndex((f) => f.name === fileName);
      }

      // fileKey 형식이 아니면 기존 로직 사용
      if (fileIndex === -1) {
        const info = getNewCaseInfoByCaseId(String(caseId));
        if (info?.fileName) {
          fileIndex = (files || []).findIndex((f) => f.name === info.fileName);
        }
      }

      // 여전히 못 찾았다면 _draftCaseInfoId로 시도
      if (fileIndex === -1) {
        fileIndex = (files || []).findIndex(
          (f) =>
            String((f as any)?._draftCaseInfoId || "") === String(caseId),
        );
      }

      return fileIndex;
    };

    // skip 선택 시 파일 제거
    if (choice.strategy === "skip") {
      const fileIndex = resolveFileIndexForCaseId(choice.caseId);
      if (fileIndex >= 0) {
        await handleRemoveFile(fileIndex);
      }
    }

    // 재의뢰(replace/remake): 누락된 환자/임플란트 정보를 채우고 카드 검증 완료
    if (choice.strategy === "replace" || choice.strategy === "remake") {
      const fileIndex = resolveFileIndexForCaseId(choice.caseId);
      if (fileIndex >= 0) {
        const file = files[fileIndex];
        const fileKey = toNormalizedFileKey(file);
        const current = caseInfosMap?.[fileKey] || {};
        const existingCaseInfos =
          (matchedDuplicate?.existingRequest?.caseInfos as CaseInfos) || {};
        const clinicName = String(
          current.clinicName || existingCaseInfos.clinicName || "",
        ).trim();
        const favorite = requestClinicPresets.find(
          (c) => String(c.name || "").trim() === clinicName,
        )?.favorite;

        const pickText = (...values: unknown[]) => {
          for (const value of values) {
            const text = String(value || "").trim();
            if (text) return text;
          }
          return undefined;
        };

        const updates: Partial<CaseInfos> = {};
        const clinicNameValue = pickText(
          current.clinicName,
          existingCaseInfos.clinicName,
        );
        const patientNameValue = pickText(
          current.patientName,
          existingCaseInfos.patientName,
        );
        const toothValue = pickText(current.tooth, existingCaseInfos.tooth);
        const manufacturerValue = pickText(
          existingCaseInfos.implantManufacturer,
          favorite?.manufacturer,
          current.implantManufacturer,
        );
        const brandValue = pickText(
          existingCaseInfos.implantBrand,
          favorite?.brand,
          current.implantBrand,
        );
        const familyValue = pickText(
          existingCaseInfos.implantFamily,
          favorite?.family,
          current.implantFamily,
          "Regular",
        );
        const typeValue = pickText(
          existingCaseInfos.implantType,
          favorite?.type,
          current.implantType,
          "Hex",
        );
        const retentionGrooveValue =
          (pickText(
            current.retentionGroove,
            existingCaseInfos.retentionGroove,
          ) as CaseInfos["retentionGroove"]) || "none";
        const designSoftwareNext = pickText(
          current.designSoftware,
          existingCaseInfos.designSoftware,
          designSoftwareValue,
        );
        const anodizingNext =
          typeof current.anodizingEnabled === "boolean"
            ? current.anodizingEnabled
            : typeof existingCaseInfos.anodizingEnabled === "boolean"
              ? existingCaseInfos.anodizingEnabled
              : anodizingEnabled;

        if (clinicNameValue) updates.clinicName = clinicNameValue;
        if (patientNameValue) updates.patientName = patientNameValue;
        if (toothValue) updates.tooth = toothValue;
        if (manufacturerValue) updates.implantManufacturer = manufacturerValue;
        if (brandValue) updates.implantBrand = brandValue;
        if (familyValue) updates.implantFamily = familyValue;
        if (typeValue) updates.implantType = typeValue;
        updates.retentionGroove = retentionGrooveValue;
        if (designSoftwareNext) updates.designSoftware = designSoftwareNext;
        updates.anodizingEnabled = anodizingNext;
        if (!current.workType) updates.workType = "abutment";

        updateCaseInfos(fileKey, updates);

        const merged = { ...current, ...updates };
        const isComplete = Boolean(
          String(merged.clinicName || "").trim() &&
            String(merged.patientName || "").trim() &&
            String(merged.tooth || "").trim() &&
            String(merged.implantManufacturer || "").trim() &&
            String(merged.implantBrand || "").trim() &&
            String(merged.implantFamily || "").trim() &&
            String(merged.implantType || "").trim(),
        );

        if (isComplete) {
          setFileVerificationStatus((prev) => ({
            ...prev,
            [fileKey]: true,
          }));
        }
      }
    }

    // 중복 해결 정보 저장
    const nextResolutions = (() => {
      const next = (duplicateResolutions || []).filter(
        (r) => r.caseId !== choice.caseId,
      );
      const shouldPersistResolution =
        Boolean(safeExistingRequestId) || choice.strategy !== "skip";
      if (shouldPersistResolution) {
        next.push({
          ...choice,
          existingRequestId: safeExistingRequestId,
        });
      }
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
      if (finalResolutions.length > 0) {
        await handleSubmitWithDuplicateResolutions(finalResolutions as any);
      } else {
        await handleSubmit();
      }
    }
  };

  const renderDuplicateActions = (dup: any) => {
    const existingRequestId = resolveExistingRequestId(dup);

    if (!existingRequestId) {
      return (
        <div className="flex gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void applyDuplicateChoice({
                strategy: "skip",
                caseId: dup.caseId,
                existingRequestId: "",
              });
            }}
            className="flex-1 rounded bg-primary-strong px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-primary-strong"
          >
            이 중복 항목 제외
          </button>
        </div>
      );
    }

    const stageOrder = Number(dup?.stageOrder ?? 0);
    const isCancelableStage =
      typeof dup?.isCancelableStage === "boolean"
        ? dup.isCancelableStage
        : stageOrder <= 0;

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
              existingRequestId,
            });
          }}
          className="flex-1 rounded bg-primary-strong px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-primary-strong"
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
              existingRequestId,
            });
          }}
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          기존의뢰 유지
        </button>
      </div>
    );
  };

  const {
    weeklyBatchDays,
    setWeeklyBatchDays,
    defaultShippingMode,
    setDefaultShippingMode,
  } = useBulkShippingPolicy(user?.email);

  const [leadTimes, setLeadTimes] = useState<LeadTimesMap | null>(null);
  const handleLeadTimesChange = useCallback((next: LeadTimesMap | null) => {
    setLeadTimes(next);
  }, []);

  const groupedFileKeys = useMemo(
    () => new Set((patientGroups || []).flatMap((g) => g.fileKeys)),
    [patientGroups],
  );

  const resolveCaseProductMode = useCallback(
    (fileKey: string, info?: CaseInfos | null) => {
      if (isLabRequestor) return "custom_abutment";
      if (groupedFileKeys.has(fileKey)) return "design_custom_abutment";
      return (info?.productMode as string | null | undefined) ?? null;
    },
    [groupedFileKeys, isLabRequestor],
  );

  /** 구강스캔·디자인+생산은 메시 직경으로 리드를 잡지 않는다 */
  const resolveCaseLeadDiameter = useCallback(
    (fileKey: string, info?: CaseInfos | null) => {
      const productMode = resolveCaseProductMode(fileKey, info);
      if (productMode === "design_custom_abutment") return null;
      return (info?.maxDiameter as number | null | undefined) ?? null;
    },
    [resolveCaseProductMode],
  );

  /** 우측 기본 신속 카드: 첨부 중 디자인+생산이 있으면 +1영업일로 판정 */
  const expressSelectProductMode = useMemo(() => {
    if (isLabRequestor) return null;
    if (groupedFileKeys.size > 0) return "design_custom_abutment";
    for (const file of files) {
      const key = toNormalizedFileKey(file);
      if (caseInfosMap?.[key]?.productMode === "design_custom_abutment") {
        return "design_custom_abutment";
      }
    }
    return null;
  }, [groupedFileKeys, files, caseInfosMap, isLabRequestor, toNormalizedFileKey]);

  /** 우측 신속 카드와 동일 조건 — 카드 신속 버튼·모드 강등에도 공통 적용 */
  const expressSelectableGlobal = useMemo(
    () =>
      isExpressShippingSelectable({
        weeklyBatchDays,
        leadTimes,
        diameter: null,
        productMode: expressSelectProductMode,
      }),
    [weeklyBatchDays, leadTimes, expressSelectProductMode],
  );

  const resolveEffectiveShippingMode = useCallback(
    (
      mode: "normal" | "express",
      diameter: number | null = null,
      productMode: string | null = null,
      batchDays: string[] | null = null,
    ): "normal" | "express" => {
      if (mode !== "express") return "normal";
      const days = batchDays ?? weeklyBatchDays;
      // 우측에 디자인+1일 등으로 신속 이점이 없으면 건별(생산만)도 신속을 열지 않는다.
      const globalOk = isExpressShippingSelectable({
        weeklyBatchDays: days,
        leadTimes,
        diameter: null,
        productMode: expressSelectProductMode,
      });
      if (!globalOk) return "normal";
      const ok = isExpressShippingSelectable({
        weeklyBatchDays: days,
        leadTimes,
        diameter,
        productMode,
      });
      return ok ? "express" : "normal";
    },
    [weeklyBatchDays, leadTimes, expressSelectProductMode],
  );

  /**
   * 구강스캔 묶음에서 빠진 파일: productMode·출고 모드를 크기 기준으로 다시 맞춘다.
   * (디자인+1일이 남아 예상 출고가 하루 밀리는 문제 방지)
   * 이탈 직후 patientGroups/groupedFileKeys는 아직 이전 값일 수 있어
   * 건별 productMode로만 신속 가능 여부를 판정한다.
   */
  const refreshShipScheduleAfterLeaveGroup = useCallback(
    (fileKeys: string[]) => {
      const unique = Array.from(new Set(fileKeys.filter(Boolean)));
      for (const key of unique) {
        const file = files.find((f) => toNormalizedFileKey(f) === key);
        const size =
          typeof file?.size === "number"
            ? file.size
            : resolveFileSizeBytes(key);
        const productMode = isLabRequestor
          ? "custom_abutment"
          : isLikelyOralScanSize(size)
            ? "design_custom_abutment"
            : "custom_abutment";
        const info = caseInfosMap?.[key];
        const diameter =
          productMode === "design_custom_abutment"
            ? null
            : typeof info?.maxDiameter === "number"
              ? info.maxDiameter
              : null;
        const preferred =
          info?.shippingMode === "express" ||
          defaultShippingMode === "express"
            ? ("express" as const)
            : ("normal" as const);
        const shippingMode =
          preferred === "express" &&
          isExpressShippingSelectable({
            weeklyBatchDays,
            leadTimes,
            diameter,
            productMode,
          })
            ? ("express" as const)
            : ("normal" as const);
        updateCaseInfos(key, {
          productMode,
          workType: "abutment",
          shippingMode,
          requestedShipDate: undefined,
        });
        if (import.meta.env.DEV) {
          console.debug("[ship-eta] leave-group refresh", {
            key,
            productMode,
            diameter,
            shippingMode,
          });
        }
      }
    },
    [
      files,
      toNormalizedFileKey,
      caseInfosMap,
      defaultShippingMode,
      weeklyBatchDays,
      leadTimes,
      updateCaseInfos,
      isLabRequestor,
    ],
  );

  const handleUngroupPatientFiles = useCallback(
    (groupId: string) => {
      const group = (patientGroups || []).find((g) => g.id === groupId);
      const keys = group ? [...group.fileKeys] : [];
      ungroupPatientFiles(groupId);
      refreshShipScheduleAfterLeaveGroup(keys);
    },
    [patientGroups, ungroupPatientFiles, refreshShipScheduleAfterLeaveGroup],
  );

  const handleRemoveFileFromPatientGroup = useCallback(
    (fileKey: string) => {
      const group = findGroupByFileKey(patientGroups || [], fileKey);
      let leftKeys = [fileKey];
      if (group) {
        const remaining = group.fileKeys.filter((k) => k !== fileKey);
        // 2개 미만이면 묶음 해체 → 멤버 전원 이탈
        leftKeys =
          remaining.length >= 2 ? [fileKey] : [...group.fileKeys];
      }
      removeFileFromPatientGroup(fileKey);
      refreshShipScheduleAfterLeaveGroup(leftKeys);
    },
    [
      patientGroups,
      removeFileFromPatientGroup,
      refreshShipScheduleAfterLeaveGroup,
    ],
  );

  const handleWeeklyBatchDaysChange = useCallback(
    (days: string[]) => {
      setWeeklyBatchDays(days);
      // 요일 변경 후 신속 이점이 있으면 기본 출고 방식을 유지하고, 없으면 묶음으로 맞춘다.
      // 주의: setState 직후라 weeklyBatchDays 클로저는 아직 이전 값 — 반드시 days를 넘긴다.
      for (const file of files) {
        const key = toNormalizedFileKey(file);
        const info = caseInfosMap?.[key];
        const diameter = resolveCaseLeadDiameter(key, info);
        const productMode = resolveCaseProductMode(key, info);
        const preferred =
          info?.shippingMode === "express" ||
          defaultShippingMode === "express"
            ? "express"
            : "normal";
        updateCaseInfos(key, {
          shippingMode: resolveEffectiveShippingMode(
            preferred,
            diameter,
            productMode,
            days,
          ),
        });
      }
      if (import.meta.env.DEV) {
        console.debug("[ship-eta] weeklyBatchDays -> re-resolve modes", {
          days,
          defaultShippingMode,
        });
      }
    },
    [
      files,
      setWeeklyBatchDays,
      toNormalizedFileKey,
      updateCaseInfos,
      caseInfosMap,
      defaultShippingMode,
      resolveEffectiveShippingMode,
      resolveCaseProductMode,
      resolveCaseLeadDiameter,
    ],
  );

  const handleDefaultShippingModeChange = useCallback(
    (mode: "normal" | "express") => {
      setDefaultShippingMode(mode);
      for (const file of files) {
        const key = toNormalizedFileKey(file);
        const info = caseInfosMap?.[key];
        const diameter = resolveCaseLeadDiameter(key, info);
        const productMode = resolveCaseProductMode(key, info);
        updateCaseInfos(key, {
          shippingMode: resolveEffectiveShippingMode(
            mode,
            diameter,
            productMode,
          ),
        });
      }
      if (import.meta.env.DEV) {
        console.debug("[ship-eta] defaultShippingMode -> all files", {
          mode,
          fileCount: files.length,
        });
      }
    },
    [
      files,
      setDefaultShippingMode,
      toNormalizedFileKey,
      updateCaseInfos,
      resolveEffectiveShippingMode,
      resolveCaseProductMode,
      resolveCaseLeadDiameter,
      caseInfosMap,
    ],
  );

  // 신속 이점이 없어지면(ETA가 묶음과 같거나 늦으면) 건별 모드를 묶음으로 강등.
  // 환자 케이스는 항상 디자인+생산(+1영업일)로 판정한다.
  useEffect(() => {
    for (const file of files) {
      const key = toNormalizedFileKey(file);
      const info = caseInfosMap?.[key];
      if (info?.shippingMode !== "express") continue;
      const diameter = resolveCaseLeadDiameter(key, info);
      const productMode = resolveCaseProductMode(key, info);
      if (
        resolveEffectiveShippingMode("express", diameter, productMode) ===
        "express"
      ) {
        continue;
      }
      updateCaseInfos(key, { shippingMode: "normal" });
    }
  }, [
    files,
    caseInfosMap,
    toNormalizedFileKey,
    updateCaseInfos,
    resolveEffectiveShippingMode,
    resolveCaseProductMode,
    resolveCaseLeadDiameter,
  ]);

  // 새로 첨부된 파일에만 우측 기본 배송 방식을 적용한다.
  useEffect(() => {
    const nextKnown = new Set<string>();
    for (const file of files) {
      const key = toNormalizedFileKey(file);
      nextKnown.add(key);
      if (knownFileKeysRef.current.has(key)) continue;

      const info = caseInfosMap?.[key];
      const existing = info?.shippingMode;
      if (existing === "normal" || existing === "express") continue;

      const diameter = resolveCaseLeadDiameter(key, info);
      const productMode = resolveCaseProductMode(key, info);
      updateCaseInfos(key, {
        shippingMode: resolveEffectiveShippingMode(
          defaultShippingMode,
          diameter,
          productMode,
        ),
      });
    }
    knownFileKeysRef.current = nextKnown;
  }, [
    files,
    defaultShippingMode,
    caseInfosMap,
    updateCaseInfos,
    toNormalizedFileKey,
    resolveEffectiveShippingMode,
    resolveCaseProductMode,
    resolveCaseLeadDiameter,
  ]);

  const [focusUnverifiedTick, setFocusUnverifiedTick] = useState(0);

  type StlSelectionCandidate = {
    id: string;
    file: File;
  };

  type ClassifiedUploadBatch = {
    stlCandidates: StlSelectionCandidate[];
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

  const getFileExtLower = (name: string) => {
    const lower = String(name || "").trim().toLowerCase();
    const dot = lower.lastIndexOf(".");
    if (dot < 0) return "";
    return lower.slice(dot);
  };



  const dedupeFiles = (input: File[]) => {
    const map = new Map<string, File>();
    for (const file of input) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!map.has(key)) map.set(key, file);
    }
    return [...map.values()];
  };

  const classifyIncomingFiles = (selectedFiles: File[]): ClassifiedUploadBatch => {
    const stlCandidates: StlSelectionCandidate[] = [];
    const rejectedFiles: { name: string; reason: string }[] = [];
    const ignoredFiles: { name: string; reason: string }[] = [];

    selectedFiles.forEach((file) => {
      const ext = getFileExtLower(file.name);

      if (ext === ".pts") {
        ignoredFiles.push({
          name: file.name,
          reason: "PTS 파일은 업로드 대상에서 제외됩니다.",
        });
        return;
      }

      if (ext === ".stl" || ext === ".ply" || ext === ".obj") {
        stlCandidates.push({ id: toNormalizedFileKey(file), file });
        return;
      }

      rejectedFiles.push({
        name: file.name,
        reason: "3D 모델(STL, PLY, OBJ)만 업로드할 수 있어요.",
      });
    });

    return {
      stlCandidates,
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

  const applyClassifiedBatch = (batch: ClassifiedUploadBatch) => {
    const stlFiles = batch.stlCandidates.map((item) => item.file);

    if (stlFiles.length > 0) {
      setFileVerificationStatus((prev) => {
        const next = { ...prev };
        for (const file of stlFiles) {
          next[toNormalizedFileKey(file)] = false;
        }
        return next;
      });

      // 업로드 시점의 기본 출고 방식·소프트웨어를 "신규 파일"에만 즉시 주입한다.
      // (useEffect 대기 시 첫 렌더 ETA가 express/빈 weeklyBatchDays로 월요일로 고정되는 문제 방지)
      for (const file of stlFiles) {
        const fileKey = toNormalizedFileKey(file);
        const existingMode = caseInfosMap?.[fileKey]?.shippingMode;
        if (existingMode !== "normal" && existingMode !== "express") {
          updateCaseInfos(fileKey, {
            shippingMode: resolveEffectiveShippingMode(defaultShippingMode),
          });
        }
      }

      const currentSoftware = String(
        designSoftwareValue || caseInfosMap?.__default__?.designSoftware || "",
      ).trim();
      if (currentSoftware) {
        for (const file of stlFiles) {
          const fileKey = toNormalizedFileKey(file);
          const existingSoftware = String(
            caseInfosMap?.[fileKey]?.designSoftware || "",
          ).trim();
          if (!existingSoftware) {
            updateCaseInfos(fileKey, { designSoftware: currentSoftware });
          }
        }
      }

      const currentAnodizing =
        typeof caseInfosMap?.__default__?.anodizingEnabled === "boolean"
          ? caseInfosMap.__default__.anodizingEnabled
          : anodizingEnabled;
      for (const file of stlFiles) {
        const fileKey = toNormalizedFileKey(file);
        if (typeof caseInfosMap?.[fileKey]?.anodizingEnabled !== "boolean") {
          updateCaseInfos(fileKey, { anodizingEnabled: currentAnodizing });
        }
      }

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

    if (stlFiles.length === 0) {
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
    applyClassifiedBatch(classifyIncomingFiles(normalized));
  };

  const checkDesignSoftwareOnDrop = useCallback(() => {
    if (user?.role !== "requestor") return;
    if (!designSoftwareCanEdit) return;

    const current = String(
      designSoftwareValue || caseInfosMap?.__default__?.designSoftware || "",
    ).trim();
    if (current) return;

    setDesignSoftwareMode("3Shape");
    setCustomDesignSoftware("");
    setDesignSoftwareModalOpen(true);
  }, [caseInfosMap, designSoftwareCanEdit, designSoftwareValue, user?.role]);

  const handleIncomingDroppedFiles = (selectedFiles: File[]) => {
    checkDesignSoftwareOnDrop();
    handleIncomingFiles(selectedFiles);
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
      onFiles={handleIncomingDroppedFiles}
      activeClassName="ring-2 ring-primary/30"
      className="new-request-page bg-gradient-subtle p-4 flex flex-col h-full min-h-0 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto w-full space-y-3 flex flex-col flex-1 min-h-0 h-full">
        {isLabRequestor ? <LabTradingPartnerWindowBanner /> : null}
        <MultiActionDialog
          open={!!duplicatePrompt}
          preventCloseOnOverlayClick={false}
          onClose={() => {
            setDuplicatePrompt(null);
            setDuplicatePromptFromSubmit(false);
          }}
          title={
            hasExistingRequestDuplicate
              ? duplicatePrompt?.mode === "tracking"
                ? "추적관리 의뢰가 이미 있습니다"
                : "진행 중인 의뢰가 이미 있습니다"
              : "제출 목록 내 중복 항목이 있습니다"
          }
          description={
            <div className="space-y-3">
              <div className="text-sm text-gray-700">
                {hasExistingRequestDuplicate
                  ? "동일한 치과/환자/치아 정보로 이미 의뢰가 존재합니다. 항목별로 선택해주세요."
                  : "제출하려는 파일들끼리 동일한 치과/환자/치아 조합이 중복되었습니다. 항목별로 제외 여부를 선택해주세요."}
              </div>
              {duplicatePrompt?.remakeQuota && (
                <div className="rounded border border-primary-muted bg-primary-soft px-2.5 py-2 text-[11px] text-primary-strong">
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
                        {resolveExistingRequestId(dup) ? (
                          <>
                            <span className="truncate">
                              기존 의뢰: {existingClinic || "-"} /
                              {existingPatient || "-"} / {existingTooth || "-"}
                            </span>
                            <span className="truncate">
                              상태: {getNormalizedStageLabelSafe(existing) || String(existing?.manufacturerStage || "")}
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
                          </>
                        ) : (
                          <>
                            <span className="truncate">
                              중복 조합: {newClinic || "-"} / {newPatient || "-"} / {newTooth || "-"}
                            </span>
                            {dup?.firstFileName && (
                              <span className="truncate text-gray-500">
                                먼저 포함된 파일: {String(dup.firstFileName)}
                              </span>
                            )}
                          </>
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



        <Dialog
          open={designSoftwareModalOpen}
          onOpenChange={(next) => {
            // 의뢰자 기본 설정은 저장 전까지 강제 노출한다.
            if (!designSoftwareCanEdit) {
              setDesignSoftwareModalOpen(next);
              return;
            }
            if (next) setDesignSoftwareModalOpen(true);
          }}
        >
          <DialogContent
            hideClose
            className="new-request-page sm:max-w-md"
            onInteractOutside={(e) => {
              if (designSoftwareCanEdit) e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              if (designSoftwareCanEdit) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>디자인 소프트웨어 설정</DialogTitle>
              <DialogDescription>
                신규 의뢰 진행 전에 사용 중인 디자인 소프트웨어를 먼저 설정해주세요.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <RadioGroup
                value={designSoftwareMode}
                onValueChange={(value) => {
                  if (
                    value === "3Shape" ||
                    value === "ExoCAD" ||
                    value === "custom"
                  ) {
                    setDesignSoftwareMode(value);
                  }
                }}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="3Shape" id="gate-design-3shape" />
                  <Label htmlFor="gate-design-3shape">3Shape</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ExoCAD" id="gate-design-exocad" />
                  <Label htmlFor="gate-design-exocad">ExoCAD</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="gate-design-custom" />
                  <Label htmlFor="gate-design-custom">직접 입력</Label>
                </div>
              </RadioGroup>

              {designSoftwareMode === "custom" && (
                <Input
                  value={customDesignSoftware}
                  onChange={(e) => setCustomDesignSoftware(e.target.value)}
                  placeholder="사용 중인 디자인 소프트웨어를 입력해주세요"
                  maxLength={120}
                  autoFocus
                />
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDesignSoftwareModalOpen(false)}
                disabled={designSoftwareSaving}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void handleSaveDesignSoftware();
                }}
                disabled={designSoftwareSaving}
              >
                {designSoftwareSaving ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(34rem,1.2fr)_minmax(0,1fr)] gap-3 items-stretch flex-1 min-h-0 h-full">
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
                  handleIncomingDroppedFiles(dropped);
                })();
              }}
              onFilesSelected={handleIncomingDroppedFiles}
              weeklyBatchDays={weeklyBatchDays}
              onCancelAll={handleCancelAll}
              designSoftwareLabel={String(designSoftwareValue || "").trim()}
              onOpenDesignSoftwareModal={handleOpenDesignSoftwareModal}
              anodizingEnabled={anodizingEnabled}
              anodizingSaving={anodizingSaving}
              onToggleAnodizing={handleToggleAnodizing}
              onShippingModeChange={handleShippingModeChange}
              defaultShippingMode={defaultShippingMode}
              expressSelectableGlobal={expressSelectableGlobal}
              onLeadTimesChange={handleLeadTimesChange}
              attachmentListItems={attachmentListItems}
              patientGroups={patientGroups}
              productionOnly={isLabRequestor}
              onGroupSelectedFiles={groupSelectedFiles}
              onUngroupPatientFiles={handleUngroupPatientFiles}
              onRemoveFileFromPatientGroup={handleRemoveFileFromPatientGroup}
              onDuplicateDetected={({ file, duplicate }) => {
                const fileWithDraftCaseId = file as File & {
                  _draftCaseInfoId?: string;
                };
                const caseId = String(fileWithDraftCaseId._draftCaseInfoId || "").trim();
                const fallbackCaseId = `${file.name}:${file.size}`;
                const effectiveCaseId = caseId || fallbackCaseId;
                // 이미 해당 caseId에 대한 사용자의 결정이 저장되어 있다면 모달을 다시 열지 않는다
                const alreadyResolved = (duplicateResolutions || []).some(
                  (r) => r.caseId === effectiveCaseId,
                );
                if (alreadyResolved) {
                  return;
                }

                const duplicateRecord: Record<string, unknown> =
                  duplicate && typeof duplicate === "object"
                    ? (duplicate as Record<string, unknown>)
                    : {};
                const stageOrder = Number(duplicateRecord.stageOrder ?? 0);
                const mapped = {
                  caseId: effectiveCaseId,
                  fileName: file.name,
                  existingRequest: duplicateRecord.existingRequest,
                  existingRequestId: resolveExistingRequestId(duplicateRecord),
                  stageOrder, // stageOrder를 전달하여 UI에서 올바른 옵션 표시
                };

                setDuplicatePrompt((prev) => {
                  const existing = prev?.duplicates || [];
                  const has = existing.some(
                    (d) => (d as { caseId?: string }).caseId === mapped.caseId,
                  );
                  const duplicates = has ? existing : [...existing, mapped];
                  return {
                    mode: "active",
                    ...(prev || {}),
                    duplicates,
                  };
                });
              }}
            />
          </div>

          <div className="flex flex-col flex-1 min-h-0 h-full">
            <NewRequestShippingSection
              weeklyBatchDays={weeklyBatchDays}
              onWeeklyBatchDaysChange={handleWeeklyBatchDaysChange}
              leadTimes={leadTimes}
              expressProductMode={expressSelectProductMode}
              showDesignLeadTimeHint={!isLabRequestor}
              defaultShippingMode={defaultShippingMode}
              onDefaultShippingModeChange={handleDefaultShippingModeChange}
              onSubmit={() => {
                if (!files.length) {
                  toast({
                    title: "파일이 필요합니다",
                    description:
                      "최소 1개의 3D 모델(STL, PLY, OBJ)을 추가한 뒤 의뢰해주세요.",
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
                  const hasBulkShipping = files.some((file) => {
                    const key = toNormalizedFileKey(file);
                    const mode = caseInfosMap?.[key]?.shippingMode;
                    return mode !== "express";
                  });
                  if (hasBulkShipping && !weeklyBatchDays.length) {
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
                        "묶음 출고 의뢰가 있어 출고 요일을 선택한 후 다시 시도하세요.",
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
