import { useState, useCallback } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { getFile } from "../utils/fileIndexedDB";
import { getFileKey, clearLocalDraft } from "../utils/localDraftStorage";
import { type CaseInfos } from "./newRequestTypes";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";

const API_BASE_URL =
  (import.meta.env.DEV && (import.meta.env.VITE_API_BASE_URL as string)) ||
  "/api";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type UseNewRequestSubmitParams = {
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

export const useNewRequestSubmit = ({
  token,
  navigate,
  files,
  setFiles,
  setSelectedPreviewIndex,
  caseInfosMap,
  duplicateResolutions,
}: UseNewRequestSubmitParams) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
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

      try {
        const precheckRes = await fetch(
          `${API_BASE_URL}/requestor-organizations/me`,
          {
            method: "GET",
            headers: getHeaders(),
          },
        );
        const preData = await precheckRes.json().catch(() => ({}) as any);
        const weeklyDays: string[] = Array.isArray(
          preData?.data?.shippingPolicy?.weeklyBatchDays,
        )
          ? preData.data.shippingPolicy.weeklyBatchDays
          : [];
        if (!weeklyDays.length) {
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("abuts:shipping:needs-weekly-days"),
              );
            }
          } catch {}
          toast({
            title: "설정 필요",
            description:
              "이 화면의 ‘묶음 배송’ 섹션에서 요일을 선택한 후 다시 시도하세요.",
            variant: "destructive",
            duration: 4500,
          });
          setIsSubmitting(false);
          return;
        }
      } catch {
      }

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

      const uploaded = await uploadFilesWithToast(resolvedFiles);

      const items = files.map((file, idx) => {
        const fileKey = getFileKey(file);
        const caseInfos = caseInfosMap?.[fileKey];
        if (!caseInfos) {
          console.warn("[NewRequestSubmit] No caseInfos for file", {
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
            implantFamily: caseInfos.implantFamily,
            implantType: caseInfos.implantType,
            maxDiameter: caseInfos.maxDiameter,
            connectionDiameter: caseInfos.connectionDiameter,
            workType: "abutment",
          },
          shippingMode: caseInfos.shippingMode || "normal",
          requestedShipDate: caseInfos.requestedShipDate,
        };
      });
      const duplicateResolutionsForBulk = Array.isArray(duplicateResolutions)
        ? duplicateResolutions
            .map((resolution) => {
              const matchedIndex = files.findIndex(
                (file) => getFileKey(file) === String(resolution.caseId || ""),
              );
              return {
                ...resolution,
                caseId:
                  matchedIndex >= 0
                    ? String(matchedIndex)
                    : String(resolution.caseId || ""),
              };
            })
            .filter((resolution) => String(resolution.caseId || "").trim())
        : undefined;

      const creatingToast = toast({
        title: "의뢰 생성 중",
        description: "서버에서 의뢰를 등록하는 중입니다...",
      });

      const bulkCreateWithRetry = async () => {
        const maxRetries = 3;
        let attempt = 0;
        let lastErr: any = null;
        while (attempt <= maxRetries) {
          const res = await fetch(`${API_BASE_URL}/requests/bulk`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
              items,
              enableDuplicateRequestCheck: false,
              duplicateResolutions: duplicateResolutionsForBulk,
            }),
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
        try {
          const needsWeeklyDays = (() => {
            try {
              if (Array.isArray((bulkData as any)?.errors)) {
                return (bulkData as any).errors.some((e: any) =>
                  String(e?.message || "").includes("묶음 배송 요일을 설정"),
                );
              }
              return String((bulkData as any)?.message || "").includes(
                "묶음 배송 요일을 설정",
              );
            } catch {
              return false;
            }
          })();
          if (needsWeeklyDays && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("abuts:shipping:needs-weekly-days"),
            );
          }
        } catch {}
        const err: any = new Error(bulkData?.message || "의뢰 생성 실패(일괄)");
        if (bulkData?.code) err.code = bulkData.code;
        throw err;
      }

      const errors = Array.isArray((bulkData as any)?.errors)
        ? (bulkData as any).errors
        : [];
      if (errors.length > 0 && createdRequests.length > 0) {
        const failedIndexes = errors
          .map((e: any) => Number(e?.index))
          .filter((n: any) => Number.isFinite(n) && n >= 0 && n < files.length);
        const failedFiles = files.filter((_, idx) =>
          failedIndexes.includes(idx),
        );

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
        return;
      }

      if (createdRequests.length > 0) {
        await clearLocalDraft();

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

        navigate("/dashboard");
      } else {
        throw new Error(
          (bulkData as any)?.message || "모든 항목이 실패했습니다.",
        );
      }
    } catch (error: any) {
      console.error("[NewRequestSubmit] Error:", error);

      if (alreadyNotifiedError) {
        try {
          const msg = String(error?.message || "");
          if (
            msg.includes("묶음 배송 요일을 설정") &&
            typeof window !== "undefined"
          ) {
            window.dispatchEvent(
              new CustomEvent("abuts:shipping:needs-weekly-days"),
            );
          }
        } catch {}
        return;
      }
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
