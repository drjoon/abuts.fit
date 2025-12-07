import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { useNewRequestClinics } from "./new_requests/useNewRequestClinics";
import { useNewRequestImplant } from "./new_requests/useNewRequestImplant";
import { useNewRequestDraft } from "./new_requests/useNewRequestDraft";
import { useNewRequestFiles } from "./new_requests/useNewRequestFiles";
import { useNewRequestSubmit } from "./new_requests/useNewRequestSubmit";
import { type DraftFileMeta } from "./new_requests/newRequestTypes";

const NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX =
  "abutsfit:new-request-clinics:v1:";

// 백엔드 DraftRequest와 연동되는 신규 초안용 draftId 저장 키
const NEW_REQUEST_DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1";

export const useNewRequestPage = (existingRequestId?: string) => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();

  const [message, setMessage] = useState("");
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [aiFileInfos, setAiFileInfos] = useState<
    {
      filename: string;
      clinicName: string;
      patientName: string;
      tooth: string;
      workType: string;
      abutType: string;
    }[]
  >([]);
  const [draftFiles, setDraftFiles] = useState<DraftFileMeta[]>([]); // Draft 파일 메타
  const [uploadedFiles, setUploadedFiles] = useState<TempUploadedFile[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<
    number | null
  >(null);

  const clinicStorageKey = useMemo(() => {
    const userId = user?.id ? String(user.id) : "guest";
    return `${NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX}${userId}`;
  }, [user?.id]);

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
  } = useNewRequestImplant({ token });

  const {
    clinicPresets,
    selectedClinicId,
    handleSelectClinic,
    handleAddOrSelectClinic,
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

  // 신규 의뢰 모드일 때, 백엔드 DraftRequest를 생성/복원하고 기본값을 상태에 주입
  useEffect(() => {
    if (existingRequestId) return; // 수정 모드에서는 DraftRequest 사용 안 함
    if (!token) return;

    let cancelled = false;

    const hydrateFromDraft = async () => {
      const storageKey = NEW_REQUEST_DRAFT_ID_STORAGE_KEY;
      let storedId: string | null = null;
      try {
        storedId = window.localStorage.getItem(storageKey);
      } catch {
        storedId = null;
      }

      const fetchDraft = async (id: string) => {
        const res = await fetch(`/api/request-drafts/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            // 개발 환경의 MOCK_DEV_TOKEN 사용 시 요청자 역할로 동작하도록 명시
            "x-mock-role": "requestor",
          },
        });
        if (!res.ok) {
          throw new Error("failed to fetch draft");
        }
        const body = await res.json().catch(() => ({} as any));
        return body?.data ?? body;
      };

      const createDraft = async () => {
        const res = await fetch(`/api/request-drafts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            // 개발용 MOCK 토큰 사용 시 의뢰자 권한으로 초안을 생성
            "x-mock-role": "requestor",
          },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          throw new Error("failed to create draft");
        }
        const body = await res.json().catch(() => ({} as any));
        return body?.data ?? body;
      };

      try {
        let draft: any | null = null;

        if (storedId) {
          try {
            draft = await fetchDraft(storedId);
          } catch {
            draft = null;
          }
        }

        if (!draft) {
          draft = await createDraft();
        }

        if (cancelled || !draft?._id) return;

        setDraftId(draft._id as string);
        try {
          window.localStorage.setItem(storageKey, String(draft._id));
        } catch {}

        // 초기에만 DraftRequest의 값으로 상태를 채운다.
        if (!isDraftHydrated) {
          if (typeof draft.message === "string" && draft.message.length > 0) {
            setMessage(draft.message);
          }

          // DraftRequest.caseInfos -> 임플란트 관련 상태 복원
          if (draft.caseInfos) {
            const {
              implantSystem: draftImplantSystem,
              implantType: draftImplantType,
              connectionType: draftConnectionType,
              clinicName: draftClinicName,
            } = draft.caseInfos;

            if (typeof draftImplantSystem === "string") {
              setImplantManufacturer(draftImplantSystem);
            }
            if (typeof draftImplantType === "string") {
              setImplantSystem(draftImplantType);
            }
            if (typeof draftConnectionType === "string") {
              setImplantType(draftConnectionType);
            }

            // 클리닉 프리셋과 연동하고 싶다면 여기서 draftClinicName 등을 활용 가능
          }

          // DraftRequest.files -> draftFiles / uploadedFiles 초기화
          if (Array.isArray(draft.files) && draft.files.length > 0) {
            const nextDraftFiles: DraftFileMeta[] = draft.files.map(
              (f: any) => ({
                _id: f._id,
                fileId: f.fileId,
                originalName: f.originalName,
                size: f.size,
                mimetype: f.mimetype,
                s3Key: f.s3Key,
              })
            );
            setDraftFiles(nextDraftFiles);

            // useNewRequestFiles 의 restoreFilesFromUploaded 효과가 동작하도록
            // Draft.files 메타를 TempUploadedFile 형태로도 세팅해준다.
            const nextUploaded: TempUploadedFile[] = draft.files.map(
              (f: any) => ({
                _id: f.fileId ?? f._id,
                originalName: f.originalName,
                mimetype: f.mimetype,
                size: f.size,
                fileType: "3d_model",
              })
            );
            setUploadedFiles(nextUploaded);
          }
          // DraftRequest.aiFileInfos -> aiFileInfos 초기화
          if (
            Array.isArray(draft.aiFileInfos) &&
            draft.aiFileInfos.length > 0
          ) {
            setAiFileInfos(draft.aiFileInfos);
          }
          setIsDraftHydrated(true);
        }
      } catch {
        // 초안 생성/복원 실패 시에는 조용히 무시 (사용자는 새로 작성 가능)
      }
    };

    void hydrateFromDraft();

    return () => {
      cancelled = true;
    };
  }, [
    existingRequestId,
    token,
    isDraftHydrated,
    setImplantManufacturer,
    setImplantSystem,
    setImplantType,
    setDraftFiles,
    setUploadedFiles,
  ]);

  // draftId가 준비되기 전에는 훅은 동작하지만, 백엔드 동기화는 내부에서 draftId 존재 여부로 가드
  const fileHookResult = useNewRequestFiles({
    draftId,
    token,
    implantManufacturer,
    implantSystem,
    implantType,
    setImplantManufacturer,
    setImplantSystem,
    setImplantType,
    syncSelectedConnection,
    draftFiles,
    setDraftFiles,
    uploadedFiles,
    setUploadedFiles,
    aiFileInfos,
    setAiFileInfos,
    files,
    setFiles,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
  });

  const {
    abutDiameters,
    connectionDiameters,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleFileListWheel,
    removeFile,
    handleDiameterComputed,
    getWorkTypeForFilename,
  } = fileHookResult;

  useNewRequestDraft({
    existingRequestId,
    message,
    setMessage,
    aiFileInfos,
    setAiFileInfos,
    uploadedFiles,
    setUploadedFiles,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantType,
    setImplantType,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    draftId,
    token,
  });

  const patientCasesPreview = useMemo(() => {
    const caseMap = new Map<
      string,
      {
        patientName: string;
        teethSet: Set<string>;
        files: { filename: string; workType: string }[];
      }
    >();

    aiFileInfos.forEach((info) => {
      const key = (info.patientName || "미지정").trim();
      if (!caseMap.has(key)) {
        caseMap.set(key, {
          patientName: key === "미지정" ? "" : key,
          teethSet: new Set<string>(),
          files: [],
        });
      }

      const entry = caseMap.get(key)!;

      const teethTokens = (info.tooth || "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      teethTokens.forEach((t) => entry.teethSet.add(t));

      entry.files.push({
        filename: info.filename,
        workType: info.workType || "",
      });
    });

    return Array.from(caseMap.values()).map((entry) => ({
      patientName: entry.patientName,
      teeth: Array.from(entry.teethSet),
      files: entry.files,
    }));
  }, [aiFileInfos]);

  const { handleSubmit, handleCancel } = useNewRequestSubmit({
    existingRequestId,
    draftId,
    token,
    navigate,
    message,
    setMessage,
    files,
    setFiles,
    uploadedFiles,
    setUploadedFiles,
    aiFileInfos,
    setAiFileInfos,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantType,
    setImplantType,
    selectedConnectionId,
    setSelectedConnectionId,
    clinicPresets,
    selectedClinicId,
    setSelectedPreviewIndex,
  });

  // 수정 모드이면 기존 의뢰 메타데이터를 불러와서 기본값으로 사용
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

        if (typeof req.description === "string") {
          setMessage(req.description);
        }
        if (req.caseInfos) {
          const { implantSystem, implantType, connectionType } = req.caseInfos;
          if (typeof implantSystem === "string") {
            setImplantManufacturer(implantSystem); // Note: schema vs state name mismatch
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
  }, [existingRequestId, token]);

  // draftId가 준비되기 전에는 파일 관련 기능 비활성화
  const isReady = !!draftId;

  return {
    user,
    message,
    setMessage,
    files,
    setFiles,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    abutDiameters: isReady ? abutDiameters : {},
    connectionDiameters: isReady ? connectionDiameters : {},
    isDragOver: isReady ? isDragOver : false,
    handleDragOver: isReady ? handleDragOver : () => {},
    handleDragLeave: isReady ? handleDragLeave : () => {},
    handleDrop: isReady ? handleDrop : () => {},
    handleFileSelect: isReady ? handleFileSelect : () => {},
    handleFileListWheel: isReady ? handleFileListWheel : () => {},
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
    removeFile: isReady ? removeFile : () => {},
    handleDiameterComputed: isReady ? handleDiameterComputed : () => {},
    getWorkTypeForFilename: isReady ? getWorkTypeForFilename : () => "",
    aiFileInfos,
    setAiFileInfos,
    selectedRequest,
    setSelectedRequest,
    patientCasesPreview,
    clinicPresets,
    selectedClinicId,
    handleSelectClinic,
    handleAddOrSelectClinic,
    handleRenameClinic,
    handleDeleteClinic,
    connections,
  };
};
