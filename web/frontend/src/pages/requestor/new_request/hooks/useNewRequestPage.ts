import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { useNewRequestClinics } from "./useNewRequestClinics";
import { useNewRequestSubmitV2 } from "./useNewRequestSubmitV2";
import { useDraftMeta } from "./useDraftMeta";
import { useNewRequestFilesV2 } from "./useNewRequestFilesV2";
import { useNewRequestImplant } from "./useNewRequestImplant";
import { useNewRequestLocalFiles } from "./useNewRequestLocalFiles";
import { type DraftCaseInfo, type CaseInfos } from "./newRequestTypes";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { getLocalDraft, initLocalDraft } from "../utils/localDraftStorage";
import { getFile } from "../utils/fileIndexedDB";

const NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX =
  "abutsfit:new-request-clinics:v1:";
const NEW_REQUEST_HEX_ROTATION_STORAGE_KEY_PREFIX =
  "abutsfit:new-request:hex-rotation:v1:";

const normalizeRequestorHexRotation = (value: unknown): "0" | "30" => {
  return String(value || "").trim() === "30" ? "30" : "0";
};

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
  const navigateWithDashboardRefresh = useCallback(
    (path: string) => {
      if (path === "/dashboard") {
        navigate(path, {
          state: {
            refreshDashboardAt: Date.now(),
          },
        });
        return;
      }

      navigate(path);
    },
    [navigate],
  );

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    mode: "active" | "tracking";
    duplicates: any[];
    remakeQuota?: {
      limit: number;
      used: number;
      remaining: number;
      currentMonthStartYmd?: string;
      currentMonthEndExclusiveYmd?: string;
    } | null;
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
  const [duplicatePromptFromSubmit, setDuplicatePromptFromSubmit] =
    useState(false);

  const clinicStorageKey = useMemo(() => {
    const userId = user?.id ? String(user.id) : "guest";
    return `${NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX}${userId}`;
  }, [user?.id]);

  const businessAnchorId = useMemo(() => {
    const raw = String(user?.businessAnchorId || "").trim();
    return raw || null;
  }, [user?.businessAnchorId]);

  const requestorHexRotationStorageKey = useMemo(() => {
    const scopeKey = businessAnchorId || "no-business";
    return `${NEW_REQUEST_HEX_ROTATION_STORAGE_KEY_PREFIX}${scopeKey}`;
  }, [businessAnchorId]);

  const [defaultRequestorHexRotation, setDefaultRequestorHexRotation] =
    useState<"0" | "30">("0");

  const businessType = useMemo(() => {
    return resolveBusinessType(user?.role, "requestor");
  }, [user?.role]);

  useEffect(() => {
    const readLocalDefault = (): "0" | "30" | null => {
      try {
        const raw = localStorage.getItem(requestorHexRotationStorageKey);
        if (raw !== "0" && raw !== "30") return null;
        return raw;
      } catch {
        return null;
      }
    };

    // BusinessAnchor 기반 서버 설정을 1순위로 사용한다.
    // localStorage는 서버 조회 실패 시 fallback cache 로만 사용.
    if (!token || !businessAnchorId) {
      const localDefault = readLocalDefault();
      if (localDefault) {
        setDefaultRequestorHexRotation(localDefault);
      }
      return;
    }

    (async () => {
      try {
        const res = await request<any>({
          path: "/api/businesses/me/request-settings",
          method: "GET",
          token,
        });

        if (res.ok) {
          const body = res.data || {};
          const data = body?.data || body;
          const serverDefault = normalizeRequestorHexRotation(
            data?.defaultRequestorHexRotation,
          );
          setDefaultRequestorHexRotation(serverDefault);

          try {
            localStorage.setItem(requestorHexRotationStorageKey, serverDefault);
          } catch {
            // ignore
          }
          return;
        }

        const localDefault = readLocalDefault();
        if (localDefault) {
          setDefaultRequestorHexRotation(localDefault);
        }
      } catch {
        const localDefault = readLocalDefault();
        if (localDefault) {
          setDefaultRequestorHexRotation(localDefault);
        }
      }
    })();
  }, [token, businessAnchorId, requestorHexRotationStorageKey]);

  const persistRequestorHexRotationDefault = useCallback(
    async (value: "0" | "30") => {
      const next = normalizeRequestorHexRotation(value);
      setDefaultRequestorHexRotation(next);

      if (!token || !businessAnchorId) {
        try {
          localStorage.setItem(requestorHexRotationStorageKey, next);
        } catch {
          // ignore
        }
        return;
      }

      const res = await request<any>({
        path: "/api/businesses/me/request-settings",
        method: "PUT",
        token,
        jsonBody: { defaultRequestorHexRotation: next },
      });

      if (res.ok) {
        const body = res.data || {};
        const data = body?.data || body;
        const persisted = normalizeRequestorHexRotation(
          data?.defaultRequestorHexRotation ?? next,
        );
        setDefaultRequestorHexRotation(persisted);
        try {
          localStorage.setItem(requestorHexRotationStorageKey, persisted);
        } catch {
          // ignore
        }
        return;
      }

      if (res.status !== 403) {
        const body = res.data || {};
        const message = String(
          body?.message ||
            "헥스 회전 기본값을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
        );
        toast({
          title: "기본값 저장 실패",
          description: message,
          variant: "destructive",
        });
      }
    },
    [token, businessAnchorId, requestorHexRotationStorageKey, toast],
  );

  // Draft 메타 관리 (caseInfosMap)
  const {
    draftId,
    caseInfosMap,
    setCaseInfosMap,
    updateCaseInfos,
    removeCaseInfos,
    patchDraftImmediately,
    status: draftStatus,
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
        } catch {
          continue;
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
        } catch {
          return;
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
      setDuplicatePromptFromSubmit(false);
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
    const fallback = {
      workType: "abutment",
      requestorHexRotation: defaultRequestorHexRotation,
    } as CaseInfos;

    const current = (() => {
      if (key === "__default__") {
        return caseInfosMap.__default__ || fallback;
      }
      return caseInfosMap[key] || fallback;
    })();

    if (!current?.requestorHexRotation) {
      return {
        ...current,
        requestorHexRotation: defaultRequestorHexRotation,
      } as CaseInfos;
    }

    return current;
  }, [currentFileKey, caseInfosMap, defaultRequestorHexRotation]);

  useEffect(() => {
    if (selectedPreviewIndex === null || !files[selectedPreviewIndex]) return;
    const file = files[selectedPreviewIndex];
    const fileKey = toNormalizedFileKey(file);
    const current = caseInfosMap[fileKey];

    if (current?.requestorHexRotation) return;

    updateCaseInfos(fileKey, {
      requestorHexRotation: defaultRequestorHexRotation,
    });
  }, [
    selectedPreviewIndex,
    files,
    toNormalizedFileKey,
    caseInfosMap,
    updateCaseInfos,
    defaultRequestorHexRotation,
  ]);

  // 현재 파일의 caseInfos 업데이트 함수
  const setCaseInfos = useCallback(
    (updates: Partial<typeof currentCaseInfos>) => {
      const file =
        selectedPreviewIndex !== null ? files[selectedPreviewIndex] : null;
      const fileKey = file ? toNormalizedFileKey(file) : "__default__";

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

              // 중복 발견 시 모달 표시 (입력 중 체크: 제출 플로우 아님)
              setDuplicatePromptFromSubmit(false);
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

  const {
    connections,
    implantManufacturer,
    setImplantManufacturer,
    implantBrand,
    setImplantBrand,
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
      // Family/Type 기본값만 기록. Manufacturer/Brand는 이미 설정된 값 보존.
      // updateCaseInfos가 내부적으로 prev와 merge하므로 스프레드 불필요.
      // 단, 파일이 선택되어 있을 때만 (초기 로딩 시 __default__ 덮어쓰기 방지)
      if (selectedPreviewIndex !== null) {
        setCaseInfos(fields);
      }
    },
  });

  // 파일 전환 시 로컬 임플란트 상태 동기화
  useEffect(() => {
    if (currentCaseInfos) {
      setImplantManufacturer(currentCaseInfos.implantManufacturer || "");
      setImplantBrand(currentCaseInfos.implantBrand || "");
      setImplantFamily(currentCaseInfos.implantFamily || "");
      setImplantType(currentCaseInfos.implantType || "");
    }
  }, [
    currentFileKey,
    currentCaseInfos.implantManufacturer,
    currentCaseInfos.implantBrand,
    currentCaseInfos.implantFamily,
    currentCaseInfos.implantType,
    setImplantManufacturer,
    setImplantBrand,
    setImplantFamily,
    setImplantType,
  ]);

  // 클리닉 프리셋 관리
  const {
    clinicPresets: rawClinicPresets,
    handleSelectClinic: rawHandleSelectClinic,
    handleAddOrSelectClinic: rawHandleAddOrSelectClinic,
    handleDeleteClinic,
  } = useNewRequestClinics({
    clinicStorageKey,
    implant: {
      manufacturer: implantManufacturer,
      brand: implantBrand,
      family: implantFamily,
      type: implantType,
    },
    // 현재 편집 중인 retentionGroove 값을 전달하여 선택된 치과의 디폴트로 자동 저장.
    retentionGroove: currentCaseInfos?.retentionGroove,
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

      // 현재 선택된 파일의 clinicName + 치과별 유지홈 디폴트 적용
      if (currentFileKey && updateCaseInfos) {
        const updates: any = { clinicName };
        if (selectedClinic?.defaultRetentionGroove) {
          updates.retentionGroove = selectedClinic.defaultRetentionGroove;
        }
        updateCaseInfos(currentFileKey, updates);
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
          updates.implantBrand = favorite.brand;
          updates.implantFamily = favorite.family;
          updates.implantType = favorite.type;
        }
        // 치과별 유지홈 디폴트가 있으면 자동 적용 (favorite 임플란트와 동일 패턴).
        if (selectedClinic?.defaultRetentionGroove) {
          updates.retentionGroove = selectedClinic.defaultRetentionGroove;
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
  const { handleUpload: handleLocalUpload } = useNewRequestLocalFiles({
    setFiles,
    setSelectedPreviewIndex,
    updateCaseInfos,
    caseInfosMap,
  });

  // 파일 관리 (업로드/삭제/복원)
  const {
    files: fileList,
    selectedPreviewIndex: previewIndex,
    handleRemoveFile,
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
      await handleLocalUpload(droppedFiles);
    },
    [handleLocalUpload],
  );

  const handleUploadUnchecked = useCallback(
    async (incomingFiles: File[]) => {
      // V3 방식: 로컬 저장만
      await handleLocalUpload(incomingFiles);
    },
    [handleLocalUpload],
  );

  const handleUpload = useCallback(
    async (incomingFiles: File[]) => {
      // V3 방식: 드롭/선택 시 로컬 저장만 수행하고,
      // 실제 S3 업로드는 제출 시점에만 진행한다.
      await handleLocalUpload(incomingFiles);
    },
    [handleLocalUpload],
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
          path: `/api/businesses/me?businessType=${encodeURIComponent(
            businessType,
          )}`,
          method: "GET",
          token,
        });
        if (orgRes.ok) {
          const orgBody: any = orgRes.data || {};
          const orgData = orgBody?.data || orgBody;
          membership = (orgData?.membership || "none") as
            "owner" | "member" | "pending" | "none";
          const businessNumberRaw = String(
            orgData?.metadata?.businessNumber || "",
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
              implantBrand:
                typeof ci.implantBrand === "string" ? ci.implantBrand : "",

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
              totalLength:
                typeof ci.totalLength === "number" ? ci.totalLength : undefined,
              taperAngle:
                typeof ci.taperAngle === "number" ? ci.taperAngle : undefined,
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
              requestorHexRotation: normalizeRequestorHexRotation(
                ci.requestorHexRotation,
              ),
            },
          });
        }

        if (req.caseInfos) {
          const {
            implantManufacturer,
            implantBrand,
            implantFamily,
            implantType,
          } = req.caseInfos;
          if (typeof implantManufacturer === "string") {
            setImplantManufacturer(implantManufacturer);
          }
          if (typeof implantBrand === "string") {
            setImplantBrand(implantBrand);
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
    setImplantBrand,
    setImplantFamily,
    setImplantType,
  ]);

  // 제출/취소 처리
  const handleServerDuplicateDetected = useCallback(
    async (payload: {
      mode: "active" | "tracking";
      duplicates: any[];
      remakeQuota?: {
        limit: number;
        used: number;
        remaining: number;
        currentMonthStartYmd?: string;
        currentMonthEndExclusiveYmd?: string;
      } | null;
    }) => {
      if (!payload || !Array.isArray(payload.duplicates)) return;

      const normalizedDuplicates = payload.duplicates
        .map((dup: any) => {
          const rawCaseId = String(dup?.caseId || "").trim();

          const matchedFile = files.find(
            (f) =>
              String((f as any)?._draftCaseInfoId || "").trim() === rawCaseId,
          );

          const fallbackCaseId = matchedFile
            ? `${matchedFile.name}:${matchedFile.size}`
            : "";

          const caseId = rawCaseId || fallbackCaseId;

          return {
            ...dup,
            caseId,
            fileName: String(dup?.fileName || matchedFile?.name || ""),
            stageOrder: Number(dup?.stageOrder ?? 0),
            existingRequest: dup?.existingRequest,
            existingRequestId: String(
              dup?.existingRequestId ||
                dup?.existingRequest?._id ||
                dup?.existingRequest?.id ||
                "",
            ).trim(),
          };
        })
        .filter((d: any) => Boolean(String(d?.caseId || "").trim()));

      if (normalizedDuplicates.length === 0) return;

      // 자동 적용 대신, 사용자 선택 모달을 노출한다.
      setDuplicateResolutions([]);
      setDuplicatePromptFromSubmit(true);
      setDuplicatePrompt({
        mode: payload.mode,
        duplicates: normalizedDuplicates,
        remakeQuota: payload.remakeQuota || null,
      });

      toast({
        title:
          payload.mode === "tracking"
            ? "동일 정보 의뢰가 확인되었습니다"
            : "중복 의뢰가 확인되었습니다",
        description: "중복 항목별 처리 방법을 선택해주세요.",
        duration: 3500,
      });
    },
    [
      files,
      setDuplicatePrompt,
      setDuplicatePromptFromSubmit,
      setDuplicateResolutions,
      toast,
    ],
  );

  // V2 제출: Draft 기반 워크플로우 (SSOT)
  const {
    handleSubmit: rawHandleSubmit,
    handleSubmitWithDuplicateResolutions:
      rawHandleSubmitWithDuplicateResolutions,
    handleCancel,
  } = useNewRequestSubmitV2({
    existingRequestId,
    draftId,
    token,
    navigate: navigateWithDashboardRefresh,
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

    await rawHandleSubmit();
    setDuplicateResolutions([]);
  }, [ensureSetupForUpload, rawHandleSubmit, setDuplicateResolutions]);

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
    defaultRequestorHexRotation,
    persistRequestorHexRotationDefault,

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
    implantBrand,
    setImplantBrand,
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
    duplicatePromptFromSubmit,
    setDuplicatePromptFromSubmit,
    duplicateResolutions,
    setDuplicateResolutions,
  };
};
