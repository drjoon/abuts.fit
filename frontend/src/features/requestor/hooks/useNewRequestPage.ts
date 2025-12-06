import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { useNewRequestClinics } from "./new_requests/useNewRequestClinics";
import { useNewRequestImplant } from "./new_requests/useNewRequestImplant";
import { useNewRequestDraft } from "./new_requests/useNewRequestDraft";
import { useNewRequestFiles } from "./new_requests/useNewRequestFiles";
import { useNewRequestSubmit } from "./new_requests/useNewRequestSubmit";

const NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX =
  "abutsfit:new-request-clinics:v1:";

export const useNewRequestPage = (existingRequestId?: string) => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();

  const [message, setMessage] = useState("");
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
  } = useNewRequestFiles({
    token,
    implantManufacturer,
    implantSystem,
    implantType,
    setImplantManufacturer,
    setImplantSystem,
    setImplantType,
    syncSelectedConnection,
    uploadedFiles,
    setUploadedFiles,
    aiFileInfos,
    setAiFileInfos,
    files,
    setFiles,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
  });

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

  return {
    user,
    message,
    setMessage,
    files,
    setFiles,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    abutDiameters,
    connectionDiameters,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleFileListWheel,
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
    removeFile,
    handleDiameterComputed,
    getWorkTypeForFilename,
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
  };
};
