import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useNewRequestClinics } from "./new_requests/useNewRequestClinics";
import { useNewRequestImplant } from "./new_requests/useNewRequestImplant";
import { useNewRequestSubmitV2 } from "./new_requests/useNewRequestSubmitV2";
import { useDraftMeta } from "./new_requests/useDraftMeta";
import { useNewRequestFilesV2 } from "./new_requests/useNewRequestFilesV2";
import { type DraftCaseInfo } from "./new_requests/newRequestTypes";

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

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [draftFiles, setDraftFiles] = useState<DraftCaseInfo[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<
    number | null
  >(null);

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
      console.log("[useNewRequestPage] draftId changed, clearing files", {
        prev: prevDraftIdRef.current,
        next: draftId,
      });
      setFiles([]);
      setDraftFiles([]);
      setSelectedPreviewIndex(null);
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

  // 현재 선택된 파일의 caseInfos (파일별 독립적 관리)
  const currentCaseInfos = useMemo(() => {
    if (currentFileKey === "__default__") {
      return caseInfosMap.__default__ || { workType: "abutment" };
    }
    return (
      caseInfosMap[currentFileKey] ||
      caseInfosMap.__default__ || { workType: "abutment" }
    );
  }, [currentFileKey, caseInfosMap]);

  // 현재 파일의 caseInfos 업데이트 함수
  const setCaseInfos = useCallback(
    (updates: Partial<typeof currentCaseInfos>) => {
      if (selectedPreviewIndex === null || !files[selectedPreviewIndex]) {
        // 파일이 선택되지 않았으면 __default__ 업데이트
        updateCaseInfos("__default__", updates);
      } else {
        const file = files[selectedPreviewIndex];
        const fileKey = `${file.name}:${file.size}`;
        updateCaseInfos(fileKey, updates);
      }
    },
    [selectedPreviewIndex, files, updateCaseInfos]
  );

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
      setCaseInfos({
        ...currentCaseInfos,
        ...fields,
      });
    },
  });

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
    handleUpload,
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

        if (req.caseInfos) {
          const { implantSystem, implantType, connectionType } = req.caseInfos;
          if (typeof implantSystem === "string") {
            setImplantManufacturer(implantSystem);
          }
          if (typeof implantType === "string") {
            setImplantSystem(implantType);
          }
          if (typeof connectionType === "string") {
            setImplantType(connectionType);
          }
        }
      } catch {
        // no-op
      }
    })();
  }, [
    existingRequestId,
    token,
    setImplantManufacturer,
    setImplantSystem,
    setImplantType,
  ]);

  // 제출/취소 처리
  const { handleSubmit, handleCancel } = useNewRequestSubmitV2({
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
  });

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
    handleCancel,
    deleteDraft,
    resetDraft,
  };
};
