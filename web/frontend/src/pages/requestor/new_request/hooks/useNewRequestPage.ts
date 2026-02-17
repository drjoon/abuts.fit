import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useNewRequestClinics } from "./useNewRequestClinics";
import { useNewRequestSubmitV2 } from "./useNewRequestSubmitV2";
import { useDraftMeta } from "./useDraftMeta";
import { useNewRequestFilesV2 } from "./useNewRequestFilesV2";
import { useNewRequestImplant } from "./useNewRequestImplant";
import { type DraftCaseInfo } from "./newRequestTypes";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";

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
    mode: "active" | "completed";
    duplicates: any[];
  } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [draftFiles, setDraftFiles] = useState<DraftCaseInfo[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<
    number | null
  >(null);

  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[] | null>(
    null
  );

  const [pendingUploadDecisions, setPendingUploadDecisions] = useState<
    Record<
      string,
      { strategy: "replace" | "remake" | "skip"; existingRequestId: string }
    >
  >({});

  const clinicStorageKey = useMemo(() => {
    const userId = user?.id ? String(user.id) : "guest";
    return `${NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX}${userId}`;
  }, [user?.id]);

  // Draft 메타 관리 (caseInfosMap)
  const {
    draftId,
    caseInfosMap,
    setCaseInfosMap,
    updateCaseInfos,
    patchDraftImmediately,
    status: draftStatus,
    deleteDraft,
    resetDraft,
    initialDraftFiles,
  } = useDraftMeta();

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

  // 현재 선택된 파일의 key
  const currentFileKey = useMemo(() => {
    if (selectedPreviewIndex === null || !files[selectedPreviewIndex]) {
      return "__default__";
    }
    const file = files[selectedPreviewIndex];
    return `${file.name}:${file.size}`;
  }, [selectedPreviewIndex, files]);

  // 현재 파일의 caseInfos (파일별 독립적 관리)
  const currentCaseInfos = useMemo(() => {
    const key =
      currentFileKey === "__default__" ? "__default__" : currentFileKey;
    const info = caseInfosMap[key] ||
      caseInfosMap.__default__ || { workType: "abutment" };

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
      const fileKey = file ? `${file.name}:${file.size}` : "__default__";

      console.log("[useNewRequestPage] setCaseInfos called:", {
        fileKey,
        updates,
        currentCaseInfos,
        selectedPreviewIndex,
      });

      // 1) 로컬 캐시(caseInfosMap) 업데이트
      updateCaseInfos(fileKey, updates);
    },
    [selectedPreviewIndex, files, updateCaseInfos, currentCaseInfos]
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
    implantType,
    setImplantType,
    syncSelectedConnection,
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
        implantType: currentCaseInfos.implantType,
      });
      setImplantManufacturer(currentCaseInfos.implantManufacturer || "");
      setImplantSystem(currentCaseInfos.implantSystem || "");
      setImplantType(currentCaseInfos.implantType || "");
    }
  }, [
    currentFileKey,
    currentCaseInfos.implantManufacturer,
    currentCaseInfos.implantSystem,
    currentCaseInfos.implantType,
    setImplantManufacturer,
    setImplantSystem,
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
      (c) => c.name === currentClinicName
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
    [rawHandleSelectClinic, rawClinicPresets, currentFileKey, updateCaseInfos]
  );

  const handleAddOrSelectClinic = useCallback(
    (name: string) => {
      rawHandleAddOrSelectClinic(name);

      // 현재 선택된 파일의 clinicName 업데이트
      if (currentFileKey && updateCaseInfos) {
        const trimmedName = name.trim();

        // 선택된 치과의 favorite 임플란트 찾기
        const selectedClinic = rawClinicPresets.find(
          (c) => c.name === trimmedName
        );
        const favorite = selectedClinic?.favorite;

        // clinicName + favorite 임플란트 정보 함께 업데이트
        const updates: any = { clinicName: trimmedName };
        if (favorite) {
          updates.implantManufacturer = favorite.manufacturer;
          updates.implantSystem = favorite.system;
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
    ]
  );

  // 파일 관리 (업로드/삭제/복원)
  const {
    files: fileList,
    draftFiles: draftFileList,
    isDragOver,
    selectedPreviewIndex: previewIndex,
    handleUpload: rawHandleUpload,
    handleRemoveFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
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
  });

  const handleUploadUnchecked = useCallback(
    async (incomingFiles: File[]) => {
      await rawHandleUpload(incomingFiles);
    },
    [rawHandleUpload]
  );

  const handleUpload = useCallback(
    async (incomingFiles: File[]) => {
      if (!token || !incomingFiles || incomingFiles.length === 0) {
        await rawHandleUpload(incomingFiles);
        return;
      }

      const modalDuplicates: any[] = [];
      const blockedFiles: File[] = [];
      const eligibleFiles: File[] = [];

      // 병렬로 모든 파일의 중복 여부를 체크
      const checkResults = await Promise.all(
        incomingFiles.map(async (f) => {
          try {
            const query = new URLSearchParams({
              fileName: f.name,
            }).toString();

            const res = await request<any>({
              path: `/api/requests/my/has-duplicate?${query}`,
              method: "GET",
              token,
            });

            if (!res.ok) return { file: f, error: true };

            const body: any = res.data || {};
            const data = body?.data || body;

            return { file: f, data };
          } catch (err) {
            return { file: f, error: true };
          }
        })
      );

      for (const result of checkResults) {
        const f = result.file;
        if (result.error) {
          eligibleFiles.push(f);
          continue;
        }

        const data = result.data;
        if (!data?.exists) {
          eligibleFiles.push(f);
          continue;
        }

        const stageOrder = Number(data?.stageOrder);
        const existingRequest = data?.existingRequest;

        // 0: 의뢰, 1: CAM, 2: 생산, 3: 발송, 4: 완료
        if (stageOrder >= 2) {
          blockedFiles.push(f);
          modalDuplicates.push({
            caseId: `${f.name}:${f.size}`,
            fileName: f.name,
            existingRequest,
            lockedReason: "production",
          });
        } else if (stageOrder === 0 || stageOrder === 1) {
          modalDuplicates.push({
            caseId: `${f.name}:${f.size}`,
            fileName: f.name,
            existingRequest,
          });
        } else {
          eligibleFiles.push(f);
        }
      }

      console.log("[중복체크] 최종 결과", {
        blockedCount: blockedFiles.length,
        modalCount: modalDuplicates.length,
        eligibleCount: eligibleFiles.length,
      });

      if (blockedFiles.length > 0) {
        console.log("[중복체크] 차단 토스트 표시");
        toast({
          title: "중복 의뢰 불가",
          description:
            "CAM 이후(생산/발송) 단계의 기존 의뢰는 변경/취소할 수 없습니다. CAM 단계까지는 기존 의뢰를 취소하거나 교체할 수 있습니다. 기존 의뢰를 확인해주세요.",
          variant: "destructive",
          duration: 4500,
        });
      }

      if (modalDuplicates.length > 0) {
        setDuplicatePrompt({
          mode: "active",
          duplicates: modalDuplicates,
        });

        // 중복 파일들만 pending에 담아 모달 결정 후 처리
        const dupFiles = modalDuplicates
          .map((d) => incomingFiles.find((f) => f.name === d.fileName))
          .filter(Boolean) as File[];
        setPendingUploadFiles(dupFiles);
      }

      // 중복 없는 파일들은 즉시 업로드 진행
      if (eligibleFiles.length > 0) {
        await rawHandleUpload(eligibleFiles);
      }
    },
    [rawHandleUpload, setDuplicatePrompt, setPendingUploadFiles, toast, token]
  );

  const setupNextPath = "/dashboard/new-request";

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || "requestor") as string,
      "x-mock-position": (user as any)?.position || "staff",
      "x-mock-email": user?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || "사용자",
      "x-mock-organization": (user as any)?.organization || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [token, user?.email, user?.name, user?.role]);

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
        headers: mockHeaders,
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

      const orgRes = await request<any>({
        path: "/api/requestor-organizations/me",
        method: "GET",
        token,
        headers: mockHeaders,
      });
      const orgBody: any = orgRes.data || {};
      const org = orgBody?.data || orgBody;
      const membership = String(org?.membership || "none");
      const hasBusinessNumber = org?.hasBusinessNumber === true;
      if (!hasBusinessNumber) {
        toast({
          title: "설정이 필요합니다",
          description: "기공소 설정에서 사업자 정보를 등록해주세요.",
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
            headers: mockHeaders,
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
                headers: mockHeaders,
              });
              if (insightsRes.ok) {
                const body: any = insightsRes.data || {};
                const data = body?.data || body;
                const avgDailySpendSupply = Number(
                  data?.avgDailySpendSupply || 0
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
            now.getMonth() + 1
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
        user?.id || "guest"
      )}`;
      if (!sessionStorage.getItem(toastKey)) {
        sessionStorage.setItem(toastKey, "1");
        // Toast removed as per request
      }
    } catch {
      // ignore
    }

    return true;
  }, [
    mockHeaders,
    navigate,
    setupNextPath,
    toast,
    token,
    user?.email,
    user?.id,
  ]);

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
            "x-mock-role": "requestor",
          },
        });

        if (!res.ok) return;
        const body = await res.json().catch(() => ({} as any));
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
          const { implantManufacturer, implantSystem, implantType } =
            req.caseInfos;
          if (typeof implantManufacturer === "string") {
            setImplantManufacturer(implantManufacturer);
          }
          if (typeof implantSystem === "string") {
            setImplantSystem(implantSystem);
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
    setImplantType,
  ]);

  // 제출/취소 처리
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
    onDuplicateDetected: (payload) => {
      const toStageOrder = (req: any) => {
        const stage = String(req?.manufacturerStage || "").trim();
        const status = String(req?.status || "").trim();
        const status2 = String(req?.status2 || "").trim();
        if (status2 === "완료") return 4;
        const stageOrderMap: Record<string, number> = {
          의뢰: 0,
          의뢰접수: 0,
          request: 0,
          cam: 1,
          CAM: 1,
          가공전: 1,
          production: 2,
          생산: 2,
          가공후: 2,
          shipping: 3,
          발송: 3,
          추적관리: 3,
          배송대기: 3,
          배송중: 3,
          completed: 4,
          완료: 4,
        };
        return stageOrderMap[stage] ?? stageOrderMap[status] ?? 0;
      };

      const mappedDuplicates = Array.isArray(payload?.duplicates)
        ? payload.duplicates.map((dup: any) => {
            const so = toStageOrder(dup?.existingRequest);
            return {
              ...dup,
              lockedReason: so >= 2 ? "production" : undefined,
            };
          })
        : [];

      setDuplicatePrompt({
        ...payload,
        duplicates: mappedDuplicates,
      });
    },
  });

  const handleSubmit = useCallback(async () => {
    const ok = await ensureSetupForUpload();
    if (!ok) return;

    const decisionKeys = Object.keys(pendingUploadDecisions || {});
    const hasDuplicateDecisions = decisionKeys.length > 0;

    if (hasDuplicateDecisions) {
      // 1. skip 결정된 파일들을 제외한 실제 업로드할 파일들 선별
      const filesToActuallyUpload = (pendingUploadFiles || []).filter((f) => {
        const fileKey = `${f.name}:${f.size}`;
        const fileKeyNfc = (() => {
          try {
            return `${String(f.name || "").normalize("NFC")}:${f.size}`;
          } catch {
            return fileKey;
          }
        })();
        const decision =
          pendingUploadDecisions[fileKey] ?? pendingUploadDecisions[fileKeyNfc];

        return decision?.strategy !== "skip";
      });

      // 2. skip이 아닌 파일들은 업로드 진행
      if (filesToActuallyUpload.length > 0) {
        await handleUploadUnchecked(filesToActuallyUpload);
      }

      // 3. 중복 해결 정보(resolutions) 생성
      const resolutions = files
        .map((f) => {
          const fileKey = `${f.name}:${f.size}`;
          const fileKeyNfc = (() => {
            try {
              return `${String(f.name || "").normalize("NFC")}:${f.size}`;
            } catch {
              return fileKey;
            }
          })();

          const sourceKey = String((f as any)?._sourceFileKey || "");
          const sourceKeyNfc = String((f as any)?._sourceFileKeyNfc || "");

          const decision =
            pendingUploadDecisions[sourceKey] ??
            pendingUploadDecisions[sourceKeyNfc] ??
            pendingUploadDecisions[fileKey] ??
            pendingUploadDecisions[fileKeyNfc];

          const caseId = String((f as any)?._draftCaseInfoId || "").trim();

          if (!decision || !caseId) return null;
          if (decision.strategy === "skip") return null;

          return {
            caseId,
            strategy: decision.strategy,
            existingRequestId: decision.existingRequestId,
          };
        })
        .filter(Boolean) as any[];

      await rawHandleSubmitWithDuplicateResolutions(resolutions as any);
      setPendingUploadDecisions({});
      setPendingUploadFiles(null);
      return;
    }

    await rawHandleSubmit();
  }, [
    ensureSetupForUpload,
    pendingUploadFiles,
    pendingUploadDecisions,
    handleUploadUnchecked,
    files,
    rawHandleSubmit,
    rawHandleSubmitWithDuplicateResolutions,
    setPendingUploadDecisions,
    setPendingUploadFiles,
  ]);

  const handleSubmitWithDuplicateResolutions = useCallback(
    async (
      opts: {
        caseId: string;
        strategy: "skip" | "replace" | "remake";
        existingRequestId: string;
      }[]
    ) => {
      const ok = await ensureSetupForUpload();
      if (!ok) return;
      await rawHandleSubmitWithDuplicateResolutions(opts as any);
    },
    [ensureSetupForUpload, rawHandleSubmitWithDuplicateResolutions]
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
    implantType,
    setImplantType,
    syncSelectedConnection,
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

    pendingUploadFiles,
    setPendingUploadFiles,
    pendingUploadDecisions,
    setPendingUploadDecisions,
  };
};
