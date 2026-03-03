import { useState, useCallback } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { getFile } from "../utils/fileIndexedDB";
import { getFileKey, clearLocalDraft } from "../utils/localDraftStorage";
import { type CaseInfos } from "./newRequestTypes";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

type UseNewRequestSubmitV3WrapperParams = {
  token: string | null;
  navigate: (path: string) => void;
  files: File[];
  setFiles: (v: File[]) => void;
  setSelectedPreviewIndex: (v: number | null) => void;
  caseInfosMap?: Record<string, CaseInfos>;
  duplicateResolutions?: Array<{
    caseId: string;
    strategy: "skip" | "replace" | "remake";
    existingRequestId: string;
  }>;
};

/**
 * V3 방식 제출 래퍼
 * - 제출 시 로컬에서 파일을 가져와 S3 업로드
 * - Draft 생성 후 Request 생성
 */
export const useNewRequestSubmitV3Wrapper = ({
  token,
  navigate,
  files,
  setFiles,
  setSelectedPreviewIndex,
  caseInfosMap,
  duplicateResolutions,
}: UseNewRequestSubmitV3WrapperParams) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // SSOT: fileKey = `${name(NFC)}:${size}` created by getFileKey
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token === "MOCK_DEV_TOKEN") {
      headers["x-mock-role"] = "requestor";
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (files.length === 0) {
      toast({
        title: "파일이 필요합니다",
        description: "최소 1개의 파일을 추가해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const createdRequests: any[] = [];

      // 1) IndexedDB에서 모든 파일을 병렬로 읽고, 업로드 대상 배열 구성
      const resolvedFiles = await Promise.all(
        files.map(async (file) => {
          const key = getFileKey(file);
          try {
            const stored = await getFile(key);
            return stored || file;
          } catch {
            return file;
          }
        }),
      );

      // 2) 업로드를 병렬로 수행하면서 진행 토스트 표시 (기존 컴포넌트 재사용)
      const uploaded = await uploadFilesWithToast(resolvedFiles);

      // 3) 업로드 결과와 원본 파일을 매핑하여 Request 생성 (병렬, 제한된 동시성)
      const CHUNK_SIZE = 4;
      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const sliceFiles = files.slice(i, i + CHUNK_SIZE);
        const sliceResolved = resolvedFiles.slice(i, i + CHUNK_SIZE);
        const sliceUploaded = uploaded.slice(i, i + CHUNK_SIZE);

        await Promise.all(
          sliceFiles.map(async (file, idx) => {
            const fileKey = getFileKey(file);
            const caseInfos = caseInfosMap?.[fileKey];

            if (!caseInfos) {
              console.warn("[V3 Submit] No caseInfos for file", {
                fileKey,
                fileName: file.name,
                size: file.size,
                caseInfosMapKeys: caseInfosMap
                  ? Object.keys(caseInfosMap)
                  : null,
              });
              throw new Error(`파일 정보가 없습니다: ${file.name}`);
            }

            const clinicName = String(caseInfos.clinicName || "").trim();
            const patientName = String(caseInfos.patientName || "").trim();
            if (!clinicName || !patientName) {
              throw new Error(
                `필수 정보 누락 (${file.name}): ${!clinicName ? "치과이름" : ""}${!clinicName && !patientName ? ", " : ""}${!patientName ? "환자이름" : ""}`,
              );
            }

            const up = sliceUploaded[idx];
            const upFile = sliceResolved[idx];
            const s3Key = (up && (up.key || (up as any)?.s3Key)) as
              | string
              | undefined;
            if (!s3Key) {
              throw new Error(`S3 업로드 키가 없습니다: ${file.name}`);
            }

            const createResponse = await fetch(`${API_BASE_URL}/requests`, {
              method: "POST",
              headers: getHeaders(),
              body: JSON.stringify({
                file: {
                  originalName: upFile.name,
                  size: upFile.size,
                  mimetype: upFile.type,
                  s3Key,
                },
                caseInfos: {
                  clinicName,
                  patientName,
                  tooth: String(caseInfos.tooth || "").trim(),
                  implantManufacturer: caseInfos.implantManufacturer,
                  implantSystem: caseInfos.implantSystem,
                  implantType: caseInfos.implantType,
                  maxDiameter: caseInfos.maxDiameter,
                  connectionDiameter: caseInfos.connectionDiameter,
                  workType: "abutment",
                },
                shippingMode: caseInfos.shippingMode || "normal",
                requestedShipDate: caseInfos.requestedShipDate,
              }),
            });

            if (!createResponse.ok) {
              const errData = await createResponse.json().catch(() => ({}));
              throw new Error(
                errData?.message || `의뢰 생성 실패: ${file.name}`,
              );
            }

            const createData = await createResponse.json();
            createdRequests.push(createData.data);
          }),
        );
      }

      // 4. 성공 - 로컬 Draft 초기화
      await clearLocalDraft();

      // 상태 초기화
      setFiles([]);
      setSelectedPreviewIndex(null);

      toast({
        title: "의뢰 완료",
        description: "의뢰가 성공적으로 생성되었습니다.",
        duration: 3000,
      });

      // 페이지 이동
      navigate("/dashboard");
    } catch (error: any) {
      console.error("[V3 Submit] Error:", error);

      // 중복 감지 에러는 재throw하여 상위에서 처리
      if (error?.code === "DUPLICATE_REQUEST") {
        throw error;
      }

      toast({
        title: "오류",
        description:
          error instanceof Error
            ? error.message
            : "의뢰 생성 중 오류가 발생했습니다.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    token,
    files,
    caseInfosMap,
    duplicateResolutions,
    setFiles,
    setSelectedPreviewIndex,
    navigate,
    toast,
  ]);

  return {
    handleSubmit,
    isSubmitting,
  };
};
