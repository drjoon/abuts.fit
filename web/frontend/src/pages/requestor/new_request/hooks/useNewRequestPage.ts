import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useNewRequestClinics } from "./useNewRequestClinics";
import { useNewRequestSubmitV2 } from "./useNewRequestSubmitV2";
import { useDraftMeta } from "./useDraftMeta";
import { useNewRequestFilesV2 } from "./useNewRequestFilesV2";
import { useNewRequestImplant } from "./useNewRequestImplant";
import { useNewRequestFilesV3Wrapper } from "./useNewRequestFilesV3Wrapper";
import { useNewRequestSubmitV3Wrapper } from "./useNewRequestSubmitV3Wrapper";
import { type DraftCaseInfo, type CaseInfos } from "./newRequestTypes";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { getLocalDraft, initLocalDraft } from "../utils/localDraftStorage";
import { getFile } from "../utils/fileIndexedDB";

const NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX =
  "abutsfit:new-request-clinics:v1:";

/**
 * New Request 페이지 통합 훅 (리팩터링 버전)
 * - useDraftMeta: Draft 생성/조회/업데이트
 * - useNewRequestFilesV2: 파일 업로드/삭제/복원
 * - useNewRequestImplant: 임플란트 정보 관리
 * - useNewRequestClinics: 클리닉 프리셋 관리
 * - useNewRequestSubmitV2: 제출/취소 처리
 */
export const useNewRequestPage = (existingRequestId?: string) => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    mode: "active" | "tracking";
    duplicates: any[];
  } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [draftFiles, setDraftFiles] = useState<DraftCaseInfo[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<
    number | null
  >(null);

  const [duplicateResolutions, setDuplicateResolutions] = useState<
    {
      strategy: "skip" | "replace" | "remake";
      caseId: string;
      existingRequestId: string;
    }[]
  >([]);

  const clinicStorageKey = useMemo(() => {
    const userId = user?.id ? String(user.id) : "guest";
    return `${NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX}${userId}`;
  }, [user?.id]);

  const organizationType = useMemo(() => {
    const role = String(user?.role || "requestor").trim();
    return role || "requestor";
  }, [user?.role]);

  // Draft 메타 관리 (caseInfosMap)
  const {
    draftId,
    caseInfosMap,
    setCaseInfosMap,
    updateCaseInfos,
    removeCaseInfos,
    patchDraftImmediately,
    status: draftStatus,
    error: draftError,
    deleteDraft,
    resetDraft,
    initialDraftFiles,
  } = useDraftMeta();

  // --- 로컬 SSOT 복원 (페이지 새로고침 시 파일/정보 유지) ---
  useEffect(() => {
    // 이미 UI에 파일이 있으면 복원 스킵
    if (files.length > 0) return;

    const restoreLocal = async () => {
      const draft = getLocalDraft() || initLocalDraft();
      if (!draft.files || draft.files.length === 0) return;

      const restored: File[] = [];
      for (const meta of draft.files) {
        try {
          const fileFromIdb = await getFile(meta.fileKey);
          if (fileFromIdb) {
            restored.push(fileFromIdb);
          }
        } catch (err) {
          console.warn("[restoreLocalDraft] IndexedDB load failed", err);
        }
      }

      if (restored.length > 0) {
        setFiles(restored);
        setSelectedPreviewIndex(0);

        // caseInfosMap 복원 (shippingMode 타입 정규화)
        if (draft.caseInfosMap && Object.keys(draft.caseInfosMap).length > 0) {
          setCaseInfosMap((prev) => {
            const next: Record<string, CaseInfos> = { ...prev };
            Object.entries(draft.caseInfosMap).forEach(([k, v]) => {
              const shippingMode =
                v.shippingMode === "express"
                  ? "express"
                  : v.shippingMode === "normal"
                    ? "normal"
                    : undefined;
              next[k] = {
                ...v,
                shippingMode,
              } as CaseInfos;
            });
            return next;
          });
        }

        // V3 모드: Draft ID 제거하여 서버 Draft 복원 방지
        try {
          localStorage.removeItem("abutsfit:new-request-draft-id:v1");
          console.log(
            "[restoreLocalDraft] Removed draft ID to prevent server restore",
          );
        } catch (err) {
          console.warn("[restoreLocalDraft] Failed to remove draft ID:", err);
        }
      }
    };

    void restoreLocal();
  }, [files.length, setCaseInfosMap, setFiles, setSelectedPreviewIndex]);

  // Draft 최초 로딩 시 서버의 draft.caseInfos를 로컬 draftFiles 상태에 주입
  useEffect(() => {
    if (!draftId) return;
    if (draftStatus !== "ready") return;
    if (!initialDraftFiles || initialDraftFiles.length === 0) return;
    if (draftFiles.length > 0) return;

    setDraftFiles(initialDraftFiles);
  }, [
    draftId,
    draftStatus,
    initialDraftFiles,
    draftFiles.length,
    setDraftFiles,
  ]);

  const prevDraftIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // undefined: 초기 마운트 (스킵)
    // null 또는 string: 이후 변경 (처리)
    if (
      prevDraftIdRef.current !== undefined &&
      prevDraftIdRef.current !== draftId
    ) {
      // Draft가 바뀌었으면 파일/케이스 관련 상태를 즉시 비움
      setFiles([]);
      setDraftFiles([]);
      setSelectedPreviewIndex(null);
      setDuplicatePrompt(null);
    }

    prevDraftIdRef.current = draftId ?? null;
  }, [draftId]);

  const normalizeKeyPart = useCallback((s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  }, []);

  const toNormalizedFileKey = useCallback(
    (file: File) => {
      return `${normalizeKeyPart(file.name)}:${file.size}`;
    },
    [normalizeKeyPart],
  );

  // 현재 선택된 파일의 key
  const currentFileKey = useMemo(() => {
    if (selectedPreviewIndex === null || !files[selectedPreviewIndex]) {
      return "__default__";
    }
    const file = files[selectedPreviewIndex];
    return toNormalizedFileKey(file);
  }, [selectedPreviewIndex, files, toNormalizedFileKey]);

  // 현재 파일의 caseInfos (파일별 독립적 관리)
  const currentCaseInfos = useMemo(() => {
    const key =
      currentFileKey === "__default__" ? "__default__" : currentFileKey;
    const info = (() => {
      if (key === "__default__") {
        return caseInfosMap.__default__ || { workType: "abutment" };
      }
      return caseInfosMap[key] || { workType: "abutment" };
    })();

    console.log("[useNewRequestPage] currentCaseInfos compute:", {
      selectedPreviewIndex,
      currentFileKey,
      key,
      patientName: info.patientName,
      filesCount: files.length,
    });

    return info;
  }, [currentFileKey, caseInfosMap, selectedPreviewIndex, files]);

  // 현재 파일의 caseInfos 업데이트 함수
  const setCaseInfos = useCallback(
    (updates: Partial<typeof currentCaseInfos>) => {
      const file =
        selectedPreviewIndex !== null ? files[selectedPreviewIndex] : null;
      const fileKey = file ? toNormalizedFileKey(file) : "__default__";

      console.log("[useNewRequestPage] setCaseInfos called:", {
        fileKey,
        updates,
        currentCaseInfos,
        selectedPreviewIndex,
      });

      // 1) 로컬 캐시(caseInfosMap) 업데이트
      updateCaseInfos(fileKey, updates);

      // 2) 필수 정보가 모두 입력되면 백엔드 중복 체크 수행
      const merged = { ...currentCaseInfos, ...updates };
      const clinicName = String(merged.clinicName || "").trim();
      const patientName = String(merged.patientName || "").trim();
      const tooth = String(merged.tooth || "").trim();

      if (clinicName && patientName && tooth && file && token) {
        // 중복 체크 수행
        (async () => {
          try {
            const query = new URLSearchParams({
              clinicName,
              patientName,
              tooth,
            }).toString();

            const res = await request<any>({
              path: `/api/requests/my/check-duplicate?${query}`,
              method: "GET",
              token,
            });

            if (!res.ok) return;

            const body: any = res.data || {};
            const data = body?.data || body;

            if (data?.exists) {
              const stageOrder = Number(data?.stageOrder || 0);
              const existingRequest = data?.existingRequest;

              // 중복 발견 시 모달 표시
              setDuplicatePrompt({
                mode: "active",
                duplicates: [
                  {
                    caseId: (file as any)?._draftCaseInfoId || fileKey,
                    fileName: file.name,
                    existingRequest,
                    stageOrder,
                  },
                ],
              });
            }
          } catch (error) {
            console.error("[setCaseInfos] 중복 체크 실패:", error);
          }
        })();
      }
    },
    [
      selectedPreviewIndex,
      files,
      updateCaseInfos,
      currentCaseInfos,
      toNormalizedFileKey,
      token,
      setDuplicatePrompt,
    ],
  );

  // useNewRequestImplant 내부에서 clinicName이 바뀔 때마다
  // 임플란트 정보를 초기화(sync)하려고 시도하는 로직이
  // 파일 전환 시 원치 않는 덮어쓰기를 유발할 수 있음.
  // syncSelectedConnection을 수동으로만 호출하도록 NewRequestPatientImplantFields 수정 검토 필요.

  // 임플란트 정보 관리
  const {
    connections,
    selectedConnectionId,
    setSelectedConnectionId,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantFamily,
    setImplantFamily,
    implantType,
    setImplantType,
    syncSelectedConnection,
    familyOptions,
    typeOptions,
  } = useNewRequestImplant({
    token,
    clinicName: currentCaseInfos.clinicName,
    onDefaultImplantChange: (fields) => {
      // 기본 임플란트가 자동 설정될 때 현재 파일의 Draft.caseInfos에도 같이 기록
      // 단, 파일이 선택되어 있을 때만 (초기 로딩 시 __default__ 덮어쓰기 방지)
      if (selectedPreviewIndex !== null) {
        setCaseInfos({
          ...currentCaseInfos,
          ...fields,
        });
      }
    },
  });

  // 파일 전환 시 로컬 임플란트 상태 동기화
  useEffect(() => {
    if (currentCaseInfos) {
      console.log("[useNewRequestPage] Syncing implant state for file:", {
        currentFileKey,
        implantManufacturer: currentCaseInfos.implantManufacturer,
        implantSystem: currentCaseInfos.implantSystem,
        implantFamily: currentCaseInfos.implantFamily,
        implantType: currentCaseInfos.implantType,
      });
      setImplantManufacturer(currentCaseInfos.implantManufacturer || "");
      setImplantSystem(currentCaseInfos.implantSystem || "");
      setImplantFamily(currentCaseInfos.implantFamily || "");
      setImplantType(currentCaseInfos.implantType || "");
    }
  }, [
    currentFileKey,
    currentCaseInfos.implantManufacturer,
    currentCaseInfos.implantSystem,
    currentCaseInfos.implantFamily,
    currentCaseInfos.implantType,
    setImplantManufacturer,
    setImplantSystem,
    setImplantFamily,
    setImplantType,
  ]);

  // 클리닉 프리셋 관리
  const {
    clinicPresets: rawClinicPresets,
    selectedClinicId: rawSelectedClinicId,
    handleSelectClinic: rawHandleSelectClinic,
    handleAddOrSelectClinic: rawHandleAddOrSelectClinic,
    handleRenameClinic,
    handleDeleteClinic,
  } = useNewRequestClinics({
    clinicStorageKey,
    implant: {
      manufacturer: implantManufacturer,
      system: implantSystem,
      family: implantFamily,
      type: implantType,
    },
  });

  // 클리닉 프리셋 (글로벌)
  const clinicPresets = rawClinicPresets;

  // 현재 파일의 clinicName에 맞는 clinicId 찾기 (파일별 독립적)
  const selectedClinicId = useMemo(() => {
    const currentClinicName = currentCaseInfos.clinicName;
    if (!currentClinicName) return null;

    // 현재 파일의 clinicName과 일치하는 프리셋 찾기
    const matchingClinic = rawClinicPresets.find(
      (c) => c.name === currentClinicName,
    );
    return matchingClinic?.id || null;
  }, [currentCaseInfos.clinicName, rawClinicPresets]);

  const handleSelectClinic = useCallback(
    (id: string | null) => {
      rawHandleSelectClinic(id);

      // 선택된 클리닉의 이름 찾기
      const selectedClinic = id
        ? rawClinicPresets.find((c) => c.id === id)
        : null;
      const clinicName = selectedClinic?.name || "";

      // 현재 선택된 파일의 clinicName만 업데이트
      if (currentFileKey && updateCaseInfos) {
        updateCaseInfos(currentFileKey, { clinicName });
      }
    },
    [rawHandleSelectClinic, rawClinicPresets, currentFileKey, updateCaseInfos],
  );

  const handleAddOrSelectClinic = useCallback(
    (name: string) => {
      rawHandleAddOrSelectClinic(name);

      // 현재 선택된 파일의 clinicName 업데이트
      if (currentFileKey && updateCaseInfos) {
        const trimmedName = name.trim();

        // 선택된 치과의 favorite 임플란트 찾기
        const selectedClinic = rawClinicPresets.find(
          (c) => c.name === trimmedName,
        );
        const favorite = selectedClinic?.favorite;

        // clinicName + favorite 임플란트 정보 함께 업데이트
        const updates: any = { clinicName: trimmedName };
        if (favorite) {
          updates.implantManufacturer = favorite.manufacturer;
          updates.implantSystem = favorite.system;
          updates.implantFamily = favorite.family;
          updates.implantType = favorite.type;
        }

        // updateCaseInfos 호출 (로컬 상태 + 디바운스된 PATCH)
        updateCaseInfos(currentFileKey, updates);
      }
    },
    [
      rawHandleAddOrSelectClinic,
      rawClinicPresets,
      currentFileKey,
      updateCaseInfos,
    ],
  );

  // V3 래퍼: 로컬 저장만 수행 (S3 업로드 없음)
  const { handleUpload: v3HandleUpload } = useNewRequestFilesV3Wrapper({
    setFiles,
    setSelectedPreviewIndex,
    updateCaseInfos,
    caseInfosMap,
  });

  // 파일 관리 (업로드/삭제/복원)
  const {
    files: fileList,
    draftFiles: draftFileList,
    isDragOver: v2IsDragOver,
    selectedPreviewIndex: previewIndex,
    handleUpload: rawHandleUpload,
    handleRemoveFile,
    handleDragOver: v2HandleDragOver,
    handleDragLeave: v2HandleDragLeave,
    handleDrop: v2HandleDrop,
  } = useNewRequestFilesV2({
    draftId,
    token,
    draftFiles,
    setDraftFiles,
    files,
    setFiles,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    caseInfosMap,
    updateCaseInfos,
    removeCaseInfos,
  });

  // V3 드래그 앤 드롭 핸들러
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      // V3 방식: 로컬 저장만
      await v3HandleUpload(droppedFiles);
    },
    [v3HandleUpload],
  );

  const handleUploadUnchecked = useCallback(
    async (incomingFiles: File[]) => {
      // V3 방식: 로컬 저장만
      await v3HandleUpload(incomingFiles);
    },
    [v3HandleUpload],
  );

  const buildDuplicateCheckPayload = useCallback((file: File) => {
    const parsed = parseFilenameWithRules(file.name);
    const clinicName = String(parsed.clinicName || "").trim();
    const patientName = String(parsed.patientName || "").trim();
    const tooth = String(parsed.tooth || "").trim();
    if (!clinicName || !patientName || !tooth) return null;

    return {
      clinicName,
      patientName,
      tooth,
    };
  }, []);

  const handleUpload = useCallback(
    async (incomingFiles: File[]) => {
      // V3 방식: 드롭/선택 시 로컬 저장만 수행하고,
      // 실제 S3 업로드는 제출 시점에만 진행한다.
      await v3HandleUpload(incomingFiles);
    },
    [v3HandleUpload],
  );

  const setupNextPath = "/dashboard/new-request";

  const ensureSetupForUpload = useCallback(async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return false;
    }

    try {
      const profileRes = await request<any>({
        path: "/api/users/profile",
        method: "GET",
        token,
      });
      const profileBody: any = profileRes.data || {};
      const profile = profileBody?.data || profileBody;
      const needsPhone =
        !String(profile?.phoneNumber || "").trim() || !profile?.phoneVerifiedAt;
      if (needsPhone) {
        toast({
          title: "설정이 필요합니다",
          description: "계정 설정에서 휴대폰 인증을 완료해주세요.",
          duration: 3000,
        });
        return false;
      }

      let membership: "owner" | "member" | "pending" | "none" = "none";
      let hasBusinessNumber = false;
      try {
        const orgRes = await request<any>({
          path: `/api/organizations/me?organizationType=${encodeURIComponent(
            organizationType,
          )}`,
          method: "GET",
          token,
        });
        if (orgRes.ok) {
          const orgBody: any = orgRes.data || {};
          const orgData = orgBody?.data || orgBody;
          membership = (orgData?.membership || "none") as
            | "owner"
            | "member"
            | "pending"
            | "none";
          const businessNumberRaw = String(
            orgData?.extracted?.businessNumber || "",
          ).trim();
          hasBusinessNumber = Boolean(businessNumberRaw);
        }
      } catch {
        // ignore
      }

      if (!hasBusinessNumber) {
        toast({
          title: "설정이 필요합니다",
          description: "사업자 설정에서 사업자 정보를 등록해주세요.",
          duration: 3000,
        });
        return false;
      }

      // 대표자만 배송/결제 탭이 존재하므로 owner만 추가로 체크한다.
      if (membership === "owner") {
        const emailKey = String(user?.email || "guest").trim() || "guest";
        let currentBalance = 0;
        try {
          const balanceRes = await request<any>({
            path: "/api/credits/balance",
            method: "GET",
            token,
          });
          if (balanceRes.ok) {
            const balanceBody: any = balanceRes.data || {};
            const balanceData = balanceBody?.data || balanceBody;
            currentBalance = Number(balanceData?.balance || 0);
          }
        } catch {
          return true;
        }

        try {
          const userId = String(user?.id || emailKey || "guest").trim();
          const createdAtRaw = String((user as any)?.createdAt || "").trim();
          const createdAtMs = createdAtRaw
            ? new Date(createdAtRaw).getTime()
            : NaN;
          const isNewUser =
            Number.isFinite(createdAtMs) &&
            Date.now() - createdAtMs < 7 * 24 * 60 * 60 * 1000;

          let threshold = 10000;
          if (!isNewUser) {
            try {
              const insightsRes = await request<any>({
                path: "/api/credits/insights/spend",
                method: "GET",
                token,
              });
              if (insightsRes.ok) {
                const body: any = insightsRes.data || {};
                const data = body?.data || body;
                const avgDailySpendSupply = Number(
                  data?.avgDailySpendSupply || 0,
                );
                const hasUsageData = data?.hasUsageData === true;
                if (
                  hasUsageData &&
                  Number.isFinite(avgDailySpendSupply) &&
                  avgDailySpendSupply > 0
                ) {
                  threshold = Math.max(0, Math.round(avgDailySpendSupply * 7));
                }
              }
            } catch {
              // ignore
            }
          }

          const now = new Date();
          const ymd = `${now.getFullYear()}-${String(
            now.getMonth() + 1,
          ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          const toastKey = `abutsfit:credit-topup-toast:v1:${userId}:${ymd}`;

          // [변경] 생산 시작 시점에 크레딧을 차감하므로, 의뢰 생성 시점의 크레딧 부족 토스트는 제거하거나 안내 문구로 변경 가능.
          // 여기서는 사용자 요청에 따라 "생산 시작 시 크레딧을 확인"하도록 했으므로 생성 시점의 강제 토스트는 제거함.
        } catch {
          // ignore
        }
      }
    } catch {
      // 네트워크 오류 등으로 설정 체크가 불가능한 경우에는 업로드를 막지 않는다.
      return true;
    }

    try {
      const toastKey = `abutsfit:setup-complete-toast-shown:v1:${String(
        user?.id || "guest",
      )}`;
      if (!sessionStorage.getItem(toastKey)) {
        sessionStorage.setItem(toastKey, "1");
        // Toast removed as per request
      }
    } catch {
      // ignore
    }

    return true;
  }, [navigate, setupNextPath, toast, token, user?.email, user?.id]);

  // Draft에서 caseInfos 동기화 (임플란트 정보 -> Draft)
  // 주의: 이 동기화는 사용자가 명시적으로 임플란트 정보를 선택할 때만 호출되어야 함
  // 자동 동기화는 무한 루프를 유발할 수 있으므로 제거됨

  // 기존 의뢰 수정 모드 처리
  useEffect(() => {
    if (!existingRequestId || !token) return;

    (async () => {
      try {
        const res = await fetch(`/api/requests/${existingRequestId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return;
        const body = await res.json().catch(() => ({}) as any);
        const req = body?.data ?? body;
        if (!req) return;

        setSelectedRequest(req);

        if (req.caseInfos && typeof req.caseInfos === "object") {
          const ci = req.caseInfos as any;
          setCaseInfosMap({
            __default__: {
              clinicName:
                typeof ci.clinicName === "string" ? ci.clinicName : "",
              patientName:
                typeof ci.patientName === "string" ? ci.patientName : "",
              tooth: typeof ci.tooth === "string" ? ci.tooth : "",
              implantManufacturer:
                typeof ci.implantManufacturer === "string"
                  ? ci.implantManufacturer
                  : "",
              implantSystem:
                typeof ci.implantSystem === "string" ? ci.implantSystem : "",
              implantFamily:
                typeof ci.implantFamily === "string" ? ci.implantFamily : "",
              implantType:
                typeof ci.implantType === "string" ? ci.implantType : "",
              maxDiameter:
                typeof ci.maxDiameter === "number" ? ci.maxDiameter : undefined,
              connectionDiameter:
                typeof ci.connectionDiameter === "number"
                  ? ci.connectionDiameter
                  : undefined,
              workType:
                typeof ci.workType === "string" ? ci.workType : "abutment",
              shippingMode:
                ci.shippingMode === "normal" || ci.shippingMode === "express"
                  ? ci.shippingMode
                  : undefined,
              requestedShipDate:
                typeof ci.requestedShipDate === "string"
                  ? ci.requestedShipDate
                  : undefined,
            },
          });
        }

        if (req.caseInfos) {
          const {
            implantManufacturer,
            implantSystem,
            implantFamily,
            implantType,
          } = req.caseInfos;
          if (typeof implantManufacturer === "string") {
            setImplantManufacturer(implantManufacturer);
          }
          if (typeof implantSystem === "string") {
            setImplantSystem(implantSystem);
          }
          if (typeof implantFamily === "string") {
            setImplantFamily(implantFamily);
          }
          if (typeof implantType === "string") {
            setImplantType(implantType);
          }
        }
      } catch {
        // no-op
      }
    })();
  }, [
    existingRequestId,
    token,
    setCaseInfosMap,
    setImplantManufacturer,
    setImplantSystem,
    setImplantFamily,
    setImplantType,
  ]);

  // 제출/취소 처리
  const handleServerDuplicateDetected = useCallback(
    async (payload: { mode: "active" | "tracking"; duplicates: any[] }) => {
      if (!payload || !Array.isArray(payload.duplicates)) return;

      console.log("[handleServerDuplicateDetected] Auto-resolving duplicates", {
        mode: payload.mode,
        count: payload.duplicates.length,
      });

      // 자동으로 적절한 전략 선택
      const autoResolutions = payload.duplicates.map((dup: any) => {
        const stageOrder = Number(dup?.stageOrder ?? 0);
        // 0: 의뢰, 1: CAM -> replace
        // 2: 가공, 3: 세척.패킹/포장.발송, 4: 추적관리 -> remake
        const strategy = stageOrder >= 2 ? "remake" : "replace";

        return {
          caseId: String(dup.caseId || ""),
          strategy,
          existingRequestId: String(dup?.existingRequest?._id || ""),
        };
      });

      console.log("[handleServerDuplicateDetected] Auto-resolutions", {
        resolutions: autoResolutions,
      });

      // 자동 선택된 resolutions로 설정
      setDuplicateResolutions(autoResolutions as any);
    },
    [setDuplicateResolutions],
  );

  // V3 제출 래퍼: 로컬에서 파일 가져와 S3 업로드 후 제출
  const { handleSubmit: v3HandleSubmit, isSubmitting: v3IsSubmitting } =
    useNewRequestSubmitV3Wrapper({
      token,
      navigate,
      files,
      setFiles,
      setSelectedPreviewIndex,
      caseInfosMap,
      duplicateResolutions,
    });

  const {
    handleSubmit: rawHandleSubmit,
    handleSubmitWithDuplicateResolutions:
      rawHandleSubmitWithDuplicateResolutions,
    handleCancel,
  } = useNewRequestSubmitV2({
    existingRequestId,
    draftId,
    token,
    navigate,
    files,
    setFiles,
    clinicPresets,
    selectedClinicId,
    setSelectedPreviewIndex,
    caseInfosMap,
    patchDraftImmediately,
    onDuplicateDetected: handleServerDuplicateDetected,
  });

  const handleSubmit = useCallback(async () => {
    const ok = await ensureSetupForUpload();
    if (!ok) return;

    console.log("[handleSubmit] Starting V3 submission", {
      duplicateResolutionsCount: duplicateResolutions.length,
      filesCount: files.length,
    });

    // V3 방식: 로컬에서 파일 가져와 S3 업로드 후 제출
    try {
      await v3HandleSubmit();
      setDuplicateResolutions([]);
    } catch (error: any) {
      // 중복 감지 에러 처리
      if (error?.code === "DUPLICATE_REQUEST") {
        const mode = error?.data?.mode;
        const duplicates = error?.data?.duplicates;
        if (
          (mode === "active" || mode === "tracking") &&
          Array.isArray(duplicates) &&
          duplicates.length > 0
        ) {
          handleServerDuplicateDetected({ mode, duplicates });
        }
      }
    }
  }, [
    ensureSetupForUpload,
    duplicateResolutions,
    files,
    v3HandleSubmit,
    setDuplicateResolutions,
    handleServerDuplicateDetected,
  ]);

  const handleSubmitWithDuplicateResolutions = useCallback(
    async (
      opts: {
        caseId: string;
        strategy: "skip" | "replace" | "remake";
        existingRequestId: string;
      }[],
    ) => {
      const ok = await ensureSetupForUpload();
      if (!ok) return;
      await rawHandleSubmitWithDuplicateResolutions(opts as any);
    },
    [ensureSetupForUpload, rawHandleSubmitWithDuplicateResolutions],
  );

  // 환자 사례 미리보기 (파일 기반)
  const patientCasesPreview = useMemo(() => {
    // 파일 이름에서 환자명/치아 정보 추출 (간단한 구현)
    // 실제로는 AI 분석 결과를 사용하거나 사용자 입력을 기반으로 함
    return [];
  }, [files]);

  // Draft 준비 완료 여부
  const isReady = draftStatus === "ready" && !!draftId;

  return {
    // 사용자 정보
    user,

    // Draft 상태
    draftId,
    draftStatus,
    resetDraft,

    // Case 정보 (파일별 독립적 관리)
    caseInfos: currentCaseInfos,
    setCaseInfos,

    // 파일 관리
    files: fileList,
    setFiles,
    selectedPreviewIndex: previewIndex,
    setSelectedPreviewIndex,
    caseInfosMap,
    updateCaseInfos,
    patchDraftImmediately,

    // 파일 업로드 핸들러
    isDragOver: isReady ? isDragOver : false,
    handleDragOver: isReady ? handleDragOver : () => {},
    handleDragLeave: isReady ? handleDragLeave : () => {},
    handleDrop: isReady ? handleDrop : () => {},
    handleUpload: isReady ? handleUpload : () => {},
    handleUploadUnchecked: isReady ? handleUploadUnchecked : () => {},
    handleRemoveFile: isReady ? handleRemoveFile : () => {},

    // 임플란트 정보
    typeOptions,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantFamily,
    setImplantFamily,
    implantType,
    setImplantType,
    syncSelectedConnection,
    familyOptions,
    connections,

    // 클리닉 프리셋
    clinicPresets,
    selectedClinicId,
    handleSelectClinic,
    handleAddOrSelectClinic,
    handleDeleteClinic,

    // 제출/취소
    handleSubmit,
    handleSubmitWithDuplicateResolutions,
    handleCancel,
    selectedRequest,
    duplicatePrompt,
    setDuplicatePrompt,
    duplicateResolutions,
    setDuplicateResolutions,
  };
};
