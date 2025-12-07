import { useEffect } from "react";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";

type AiFileInfo = {
  filename: string;
  clinicName: string;
  patientName: string;
  tooth: string;
  workType: string;
  abutType: string;
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
  draftId?: string;
  token?: string | null;
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
  draftId,
  token,
}: UseNewRequestDraftParams) => {
  // 초안 저장을 백엔드 DraftRequest에 동기화 (파일 관련 데이터는 별도 훅에서 관리)
  useEffect(() => {
    if (existingRequestId) return; // 수정 모드에서는 사용하지 않음
    if (!draftId || !token) return;

    void (async () => {
      try {
        await fetch(`/api/request-drafts/${draftId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message,
            caseInfos: {
              implantSystem: implantManufacturer,
              implantType: implantSystem,
              connectionType: implantType,
            },
          }),
        });
      } catch {
        // 네트워크 오류는 조용히 무시 (다음 변경 시 다시 시도됨)
      }
    })();
  }, [
    existingRequestId,
    draftId,
    token,
    message,
    implantManufacturer,
    implantSystem,
    implantType,
  ]);
};
