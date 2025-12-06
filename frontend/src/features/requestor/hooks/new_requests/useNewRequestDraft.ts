import { useEffect } from "react";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";

const NEW_REQUEST_DRAFT_STORAGE_KEY = "abutsfit:new-request-draft:v1";

type AiFileInfo = {
  filename: string;
  clinicName?: string;
  patientName: string;
  teethText: string;
  workType: string;
  rawSummary: string;
  brand?: string;
  systemSpec?: string;
  abutType?: string;
};

type UseNewRequestDraftParams = {
  existingRequestId?: string;
  message: string;
  setMessage: (v: string) => void;
  aiFileInfos: AiFileInfo[];
  setAiFileInfos: (v: AiFileInfo[]) => void;
  uploadedFiles: TempUploadedFile[];
  setUploadedFiles: (v: TempUploadedFile[]) => void;
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantSystem: string;
  setImplantSystem: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: (v: number | null) => void;
};

export const useNewRequestDraft = ({
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
}: UseNewRequestDraftParams) => {
  // 신규 의뢰 초안 복원 (수정 모드가 아닐 때만)
  useEffect(() => {
    if (existingRequestId) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(NEW_REQUEST_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);

      if (typeof saved.message === "string") {
        setMessage(saved.message);
      }
      if (Array.isArray(saved.aiFileInfos)) {
        setAiFileInfos(saved.aiFileInfos);
      }
      if (Array.isArray(saved.uploadedFiles)) {
        setUploadedFiles(saved.uploadedFiles);
      }
      if (typeof saved.implantManufacturer === "string") {
        setImplantManufacturer(saved.implantManufacturer);
      }
      if (typeof saved.implantSystem === "string") {
        setImplantSystem(saved.implantSystem);
      }
      if (typeof saved.implantType === "string") {
        setImplantType(saved.implantType);
      }
      if (
        typeof saved.selectedPreviewIndex === "number" ||
        saved.selectedPreviewIndex === null
      ) {
        setSelectedPreviewIndex(saved.selectedPreviewIndex);
      }
    } catch {}
  }, [existingRequestId]);

  // 초안 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = {
      message,
      aiFileInfos,
      uploadedFiles,
      implantManufacturer,
      implantSystem,
      implantType,
      selectedPreviewIndex,
    };
    try {
      window.localStorage.setItem(
        NEW_REQUEST_DRAFT_STORAGE_KEY,
        JSON.stringify(draft)
      );
    } catch {}
  }, [
    message,
    aiFileInfos,
    uploadedFiles,
    implantManufacturer,
    implantSystem,
    implantType,
    selectedPreviewIndex,
  ]);
};
