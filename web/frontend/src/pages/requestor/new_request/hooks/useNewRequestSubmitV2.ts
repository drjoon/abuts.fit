import { useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { type ClinicPreset, type CaseInfos } from "./newRequestTypes";
import { clearFileCache } from "@/shared/files/fileCache";
import { createParseLog } from "@/shared/services/parseLogService";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";

const NEW_REQUEST_DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

type UseNewRequestSubmitV2Params = {
  existingRequestId?: string;
  draftId?: string;
  token: string | null;
  navigate: (path: string) => void;
  files: File[];
  setFiles: (v: File[]) => void;
  clinicPresets: ClinicPreset[];
  selectedClinicId: string | null;
  setSelectedPreviewIndex: (v: number | null) => void;
  caseInfosMap?: Record<string, CaseInfos>;
  patchDraftImmediately?: (map: Record<string, CaseInfos>) => Promise<void>;
  onDuplicateDetected?: (payload: {
    mode: "active" | "tracking";
    duplicates: any[];
  }) => void;
};

type DuplicateResolutionCase = {
  caseId: string;
  strategy: "skip" | "replace" | "remake";
  existingRequestId: string;
};

export const useNewRequestSubmitV2 = ({
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
  onDuplicateDetected,
}: UseNewRequestSubmitV2Params) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizeKeyPart = (s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  };

  const toNormalizedFileKey = (file: File) => {
    return `${normalizeKeyPart(file.name)}:${file.size}`;
  };

  const redirectToProfileIfNeeded = async () => false;

  /**
   * 파일별 파싱 로그 저장
   * 파싱 결과 vs 사용자 최종 입력값 비교
   */
  const saveParseLogs = async () => {
    if (!files || files.length === 0 || !caseInfosMap) return;

    for (const file of files) {
      try {
        const fileKey = toNormalizedFileKey(file);
        const userInput = caseInfosMap[fileKey];

        if (!userInput) continue;

        // 파일명 파싱 결과
        const parsed = parseFilenameWithRules(file.name);

        // 로그 저장
        await createParseLog({
          filename: file.name,
          parsed: {
            clinicName: parsed.clinicName,
            patientName: parsed.patientName,
            tooth: parsed.tooth,
          },
          userInput: {
            clinicName: userInput.clinicName,
            patientName: userInput.patientName,
            tooth: userInput.tooth,
          },
          draftId,
        });
      } catch (err) {
        // 로그 저장 실패는 무시 (의뢰 제출에 영향 없음)
        console.warn("[useNewRequestSubmitV2] Failed to save parse log:", err);
      }
    }
  };

  // 헤더 생성 (mock dev 토큰 지원)
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

  const handleCancel = async () => {
    // NOTE: resetDraft() 후 useNewRequestPage의 draftId 변경 effect가
    // 자동으로 setFiles([])를 호출하므로, 여기서는 setSelectedPreviewIndex만 리셋
    setSelectedPreviewIndex(null);
  };

  const submitFromDraft = async (
    duplicateResolutions?: DuplicateResolutionCase[],
  ) => {
    if (isSubmitting) return;
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    // 의뢰 수정 모드
    if (existingRequestId) {
      try {
        const base = caseInfosMap?.__default__;
        const payload: any = {};

        if (base && typeof base === "object") {
          payload.caseInfos = {
            clinicName: base.clinicName,
            patientName: base.patientName,
            tooth: base.tooth,
            implantManufacturer: base.implantManufacturer,
            implantSystem: base.implantSystem,
            implantType: base.implantType,
            maxDiameter: base.maxDiameter,
            connectionDiameter: base.connectionDiameter,
            workType: base.workType,
            shippingMode: base.shippingMode,
            requestedShipDate: base.requestedShipDate,
          };

          Object.keys(payload.caseInfos).forEach((k) => {
            if (payload.caseInfos[k] === undefined) {
              delete payload.caseInfos[k];
            }
          });

          if (Object.keys(payload.caseInfos).length === 0) {
            delete payload.caseInfos;
          }
        }

        const res = await fetch(
          `${API_BASE_URL}/requests/${existingRequestId}`,
          {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify(payload),
          },
        );

        if (!res.ok) throw new Error("서버 응답 오류");

        toast({ title: "의뢰가 수정되었습니다", duration: 2000 });
        navigate("/dashboard");
      } catch (err: any) {
        toast({
          title: "의뢰 제출 중 오류",
          description:
            (err?.message || "알 수 없는 오류") +
            "\n크라운은 참고용이고, 커스텀 어벗만 의뢰할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
      return;
    }

    // 신규 의뢰 제출 모드
    if (!draftId) {
      toast({
        title: "오류",
        description: "Draft ID가 없습니다. 페이지를 새로고침해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const submitStart = Date.now();
    console.log("[NewRequestSubmit] submit start", {
      draftId,
      filesCount: files.length,
      hasDuplicateResolutions: Boolean(duplicateResolutions?.length),
    });

    try {
      setIsSubmitting(true);
      // 1. 중복 데이터 체크 (제출 전 클라이언트 사이드 검증 - 동일 페이로드 내 중복)
      if (files.length > 1 && caseInfosMap) {
        console.log("[NewRequestSubmit] duplicate check start", {
          t: Date.now() - submitStart,
        });
        const uniqueCombinations = new Set();
        const duplicates = [];

        for (const file of files) {
          const fileKey = toNormalizedFileKey(file);
          const info = caseInfosMap[fileKey];
          if (info) {
            const combo = `${info.clinicName}|${info.patientName}|${info.tooth}`;
            if (uniqueCombinations.has(combo)) {
              duplicates.push(`${info.patientName}(${info.tooth})`);
            }
            uniqueCombinations.add(combo);
          }
        }

        if (duplicates.length > 0) {
          console.log("[NewRequestSubmit] duplicate check blocked", {
            t: Date.now() - submitStart,
          });
          toast({
            title: "의뢰 제출 중 오류",
            description: `제출한 의뢰 목록에 동일한 치과/환자/치아 조합이 중복되었습니다: ${duplicates.join(
              ", ",
            )}. 중복 항목을 제거하거나 수정한 후 다시 제출해주세요.`,
            variant: "destructive",
            duration: 5000,
          });
          return;
        }
      }

      // 2. 제출 전 디바운스 대기 중인 변경사항을 즉시 Draft에 저장 (서버 데이터 동기화)
      if (patchDraftImmediately && caseInfosMap) {
        console.log("[NewRequestSubmit] patch draft start", {
          t: Date.now() - submitStart,
        });
        const validFileKeys = new Set(files.map((f) => toNormalizedFileKey(f)));
        const filteredMap: Record<string, CaseInfos> = {};
        for (const [key, value] of Object.entries(caseInfosMap)) {
          if (key === "__default__" || validFileKeys.has(key)) {
            filteredMap[key] = value;
          }
        }

        try {
          await patchDraftImmediately(filteredMap);
          console.log("[NewRequestSubmit] patch draft done", {
            t: Date.now() - submitStart,
          });
        } catch (err) {
          console.warn("[useNewRequestSubmitV2] Pre-submit patch failed:", err);
        }
      }

      // 3. Draft를 Request로 전환
      console.log("[useNewRequestSubmitV2] Submitting draft to request...", {
        draftId,
        duplicateResolutionsCount: duplicateResolutions?.length || 0,
      });

      const payload: any = {
        draftId,
        clinicId: selectedClinicId || undefined,
      };

      if (Array.isArray(duplicateResolutions) && duplicateResolutions.length) {
        payload.duplicateResolutions = duplicateResolutions;
        console.log(
          "[useNewRequestSubmitV2] Resolution details:",
          duplicateResolutions,
        );
      }

      // NOTE: caseInfos 페이로드를 제거하여 백엔드가 Draft의 데이터를 신뢰하도록 함
      // (중복 체크 인덱스 불일치 방지)

      console.log("[NewRequestSubmit] submit API start", {
        t: Date.now() - submitStart,
      });
      const res = await fetch(`${API_BASE_URL}/requests/from-draft`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      console.log("[NewRequestSubmit] submit API response", {
        t: Date.now() - submitStart,
        ok: res.ok,
        status: res.status,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("[useNewRequestSubmitV2] Server error response:", {
          status: res.status,
          code: errData?.code,
          message: errData?.message,
          data: errData?.data,
        });

        if (res.status === 409 && errData?.code === "DUPLICATE_REQUEST") {
          const mode = errData?.data?.mode;
          const duplicates = errData?.data?.duplicates;
          if (
            (mode === "active" || mode === "tracking") &&
            Array.isArray(duplicates) &&
            duplicates.length > 0
          ) {
            onDuplicateDetected?.({ mode, duplicates });
            toast({
              title: "중복 의뢰가 감지되었습니다",
              description: "처리 방법을 선택해주세요.",
              duration: 4000,
            });
            return;
          }
        }

        const detailMsg = errData?.message || `서버 오류: ${res.status}`;
        const errorContext = errData?.code ? ` [${errData.code}]` : "";
        throw new Error(`${detailMsg}${errorContext}`);
      }

      const data = await res.json();
      console.log("[NewRequestSubmit] submit API json parsed", {
        t: Date.now() - submitStart,
      });

      // 파싱 로그 저장 (비동기, 실패해도 무시)
      saveParseLogs().catch((err) => {
        console.warn("[useNewRequestSubmitV2] Failed to save parse logs:", err);
      });

      try {
        void fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
      } catch {}

      // 상태 초기화
      setFiles([]);
      setSelectedPreviewIndex(null);

      // localStorage 및 캐시 정리
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(NEW_REQUEST_DRAFT_ID_STORAGE_KEY);
          clearFileCache();
        }
      } catch {}

      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("abuts:credits:updated"));
        }
      } catch {}

      toast({ title: "의뢰가 제출되었습니다" });
      console.log("[NewRequestSubmit] navigate", {
        t: Date.now() - submitStart,
      });
      navigate(`/dashboard`);
    } catch (err: any) {
      const rawMessage = err?.message || "";
      const isNoAbutmentError =
        rawMessage.includes("커스텀 어벗 케이스가 없습니다") ||
        rawMessage.includes("Draft에 커스텀 어벗 케이스가 없습니다");

      const isMissingFieldsError =
        rawMessage.includes("필수 정보가 누락된 파일");

      let description = rawMessage || "알 수 없는 오류";

      if (isNoAbutmentError) {
        description = "커스텀 어벗을 하나 이상 의뢰해야 합니다";
      } else if (isMissingFieldsError) {
        description = "환자정보 또는 임플란트 정보가 누락되었습니다.";
      }

      toast({
        title: "의뢰 제출 중 오류",
        description,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    await submitFromDraft();
  };

  const handleSubmitWithDuplicateResolutions = async (
    opts: DuplicateResolutionCase[],
  ) => {
    await submitFromDraft(opts);
  };

  return {
    handleSubmit,
    handleSubmitWithDuplicateResolutions,
    handleCancel,
    isSubmitting,
  };
};
