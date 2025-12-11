import { useToast } from "@/hooks/use-toast";
import { type ClinicPreset, type CaseInfos } from "./newRequestTypes";
import { clearFileCache } from "@/utils/fileCache";
import { createParseLog } from "@/services/parseLogService";
import { parseFilenameWithRules } from "@/utils/parseFilenameWithRules";

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
}: UseNewRequestSubmitV2Params) => {
  const { toast } = useToast();

  /**
   * 파일별 파싱 로그 저장
   * 파싱 결과 vs 사용자 최종 입력값 비교
   */
  const saveParseLogs = async () => {
    if (!files || files.length === 0 || !caseInfosMap) return;

    for (const file of files) {
      try {
        const fileKey = `${file.name}:${file.size}`;
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

  const handleSubmit = async () => {
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
        const payload = {};

        const res = await fetch(
          `${API_BASE_URL}/requests/${existingRequestId}`,
          {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify(payload),
          }
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

    try {
      // Draft를 Request로 전환
      const payload = {
        draftId,
        clinicId: selectedClinicId || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/requests/from-draft`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `서버 오류: ${res.status}`);
      }

      const data = await res.json();
      const newRequestId = data.data?._id || data._id;

      // 파싱 로그 저장 (비동기, 실패해도 무시)
      saveParseLogs().catch((err) => {
        console.warn("[useNewRequestSubmitV2] Failed to save parse logs:", err);
      });

      // Draft 삭제
      try {
        await fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
      } catch {
        // 무시
      }

      // 상태 초기화
      console.log(
        "[useNewRequestSubmitV2] setFiles([]) from handleSubmit success"
      );
      setFiles([]);
      setSelectedPreviewIndex(null);

      // localStorage 및 캐시 정리
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(NEW_REQUEST_DRAFT_ID_STORAGE_KEY);
          clearFileCache();
        }
      } catch {}

      toast({ title: "의뢰가 제출되었습니다" });
      navigate(`/dashboard`);
    } catch (err: any) {
      const rawMessage = err?.message || "";

      const isNoAbutmentError =
        rawMessage.includes("커스텀 어벗 케이스가 없습니다") ||
        rawMessage.includes("커스컴 어벗 케이스가 없습니다") ||
        rawMessage.includes("Draft에 커스텀 어벗 케이스가 없습니다");

      const isMissingFieldsError =
        rawMessage.includes("필수 정보가 누락된 파일");

      let description = rawMessage || "알 수 없는 오류";

      if (isNoAbutmentError) {
        description = "커스텀 어벗을 하나 이상 의뢰해야 합니다";
      } else if (isMissingFieldsError) {
        // 상세 정보가 있으면 표시
        description =
          "다음 파일의 필수 정보가 누락되었습니다:\n\n" +
          (err?.details || "치과이름, 환자이름, 치아번호를 확인해주세요");
      }

      toast({
        title: "의뢰 제출 중 오류",
        description,
        variant: "destructive",
      });
    }
  };

  return {
    handleSubmit,
    handleCancel,
  };
};
