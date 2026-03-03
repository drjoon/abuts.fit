import { useState, useCallback } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { getFile } from "../utils/fileIndexedDB";
import { getFileKey, clearLocalDraft } from "../utils/localDraftStorage";
import { type CaseInfos } from "./newRequestTypes";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    let alreadyNotifiedError = false;

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

      // 3) 업로드 결과를 일괄 생성 API로 전송
      const items = files.map((file, idx) => {
        const fileKey = getFileKey(file);
        const caseInfos = caseInfosMap?.[fileKey];
        if (!caseInfos) {
          console.warn("[V3 Submit] No caseInfos for file", {
            fileKey,
            fileName: file.name,
            size: file.size,
            caseInfosMapKeys: caseInfosMap ? Object.keys(caseInfosMap) : null,
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

        const up = uploaded[idx];
        const upFile = resolvedFiles[idx];
        const s3Key = (up && (up.key || (up as any)?.s3Key)) as
          | string
          | undefined;
        if (!s3Key) {
          throw new Error(`S3 업로드 키가 없습니다: ${file.name}`);
        }

        return {
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
        };
      });

      // 업로드 완료 직후, 벌크 등록 처리 중임을 명확히 표시해 공백 시간을 제거
      const creatingToast = toast({
        title: "의뢰 생성 중",
        description: "서버에서 의뢰를 등록하는 중입니다...",
      });

      // 3-b) Rate limit(429) 시 Retry-After 헤더를 존중하여 재시도 (최대 3회)
      const bulkCreateWithRetry = async () => {
        const maxRetries = 3;
        let attempt = 0;
        let lastErr: any = null;
        while (attempt <= maxRetries) {
          const res = await fetch(`${API_BASE_URL}/requests/bulk`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ items, enableDuplicateRequestCheck: false }),
          });
          if (res.status === 429) {
            const ra = res.headers.get("retry-after");
            const sec = ra ? Number(ra) : NaN;
            const waitMs = Number.isFinite(sec)
              ? sec * 1000
              : 500 + attempt * 500;
            await sleep(waitMs);
            attempt += 1;
            continue;
          }
          return res;
        }
        throw lastErr || new Error("레이트 리밋으로 인해 일괄 생성 실패");
      };

      const bulkRes = await bulkCreateWithRetry();
      const status = bulkRes.status;
      const bulkData = await bulkRes.json().catch(() => ({}) as any);
      if (status >= 200 && status < 300) {
        if (Array.isArray(bulkData?.data)) {
          createdRequests.push(...bulkData.data);
        }
        if (creatingToast.id) {
          creatingToast.update({
            id: creatingToast.id,
            title: "의뢰 생성 완료",
            description: "요청이 성공적으로 생성되었습니다.",
            duration: 1200,
          });
        }
      } else if (status === 207) {
        // 일부 성공 (207 Multi-Status)
        if (Array.isArray(bulkData?.data)) {
          createdRequests.push(...bulkData.data);
        }
        if (creatingToast.id) {
          creatingToast.update({
            id: creatingToast.id,
            title: "일부 의뢰 실패",
            description: `성공 ${createdRequests.length}건, 일부 실패가 있습니다.`,
            duration: 1200,
          });
        }
      } else {
        if (creatingToast.id) {
          creatingToast.update({
            id: creatingToast.id,
            title: "의뢰 생성 실패",
            description: bulkData?.message || "의뢰 생성에 실패했습니다.",
            variant: "destructive",
          });
          alreadyNotifiedError = true;
        }
        const err: any = new Error(bulkData?.message || "의뢰 생성 실패(일괄)");
        if (bulkData?.code) err.code = bulkData.code;
        throw err;
      }

      // 4. 결과 처리 (부분 성공 지원)
      const errors = Array.isArray((bulkData as any)?.errors)
        ? (bulkData as any).errors
        : [];
      if (errors.length > 0 && createdRequests.length > 0) {
        // 실패 항목만 남기고 재시도 유도
        const failedIndexes = errors
          .map((e: any) => Number(e?.index))
          .filter((n: any) => Number.isFinite(n) && n >= 0 && n < files.length);
        const failedFiles = files.filter((_, idx) =>
          failedIndexes.includes(idx),
        );

        // 드래프트는 유지(부분 성공), UI에 실패 파일만 남김
        setFiles(failedFiles);
        setSelectedPreviewIndex(failedFiles.length ? 0 : null);

        if (creatingToast.id) {
          creatingToast.update({
            id: creatingToast.id,
            title: "일부 의뢰 실패",
            description: `성공 ${createdRequests.length}건, 실패 ${errors.length}건. 실패 항목은 화면에 남겨두었습니다. 내용을 확인 후 다시 제출해주세요.`,
            duration: 6000,
          });
        } else {
          toast({
            title: "일부 의뢰 실패",
            description: `성공 ${createdRequests.length}건, 실패 ${errors.length}건. 실패 항목은 화면에 남겨두었습니다. 내용을 확인 후 다시 제출해주세요.`,
            duration: 6000,
          });
        }
        return; // 대시보드 이동/드래프트 초기화 스킵
      }

      if (createdRequests.length > 0) {
        // 전체 성공 - 로컬 Draft 초기화
        await clearLocalDraft();

        // 상태 초기화
        setFiles([]);
        setSelectedPreviewIndex(null);

        if (creatingToast.id) {
          creatingToast.update({
            id: creatingToast.id,
            title: "의뢰 완료",
            description: "의뢰가 성공적으로 생성되었습니다.",
            duration: 1200,
          });
        } else {
          toast({
            title: "의뢰 완료",
            description: "의뢰가 성공적으로 생성되었습니다.",
            duration: 3000,
          });
        }

        // 페이지 이동
        navigate("/dashboard");
      } else {
        throw new Error(
          (bulkData as any)?.message || "모든 항목이 실패했습니다.",
        );
      }
    } catch (error: any) {
      console.error("[V3 Submit] Error:", error);

      // 서버에서 이미 에러 토스트를 표시한 경우 중복 토스트 방지
      if (alreadyNotifiedError) {
        return;
      }
      // 중복 감지 에러는 상위에서 처리하려면 throw 유지
      if (error?.code === "DUPLICATE_REQUEST") throw error;

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
