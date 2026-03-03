import { useCallback, useRef } from "react";
import { request } from "@/shared/api/apiClient";

interface DuplicateCheckParams {
  clinicName: string;
  patientName: string;
  tooth: string;
}

interface DuplicateCheckResult {
  exists: boolean;
  stageOrder: number;
  existingRequest?: {
    _id: string;
    requestId: string;
    manufacturerStage: string;
    price?: any;
    createdAt?: string;
    caseInfos?: {
      clinicName: string;
      patientName: string;
      tooth: string;
    };
  };
}

interface UseDuplicateCheckParams {
  token: string | null;
  onDuplicateFound?: (result: DuplicateCheckResult) => void;
}

/**
 * 백엔드 중복 체크 훅
 * 
 * 환자/임플란트 정보가 모두 입력되면 백엔드에 중복 여부를 조회합니다.
 */
export function useDuplicateCheck({ token, onDuplicateFound }: UseDuplicateCheckParams) {
  const checkingRef = useRef<Set<string>>(new Set());

  /**
   * 중복 체크 실행
   */
  const checkDuplicate = useCallback(
    async (params: DuplicateCheckParams): Promise<DuplicateCheckResult | null> => {
      if (!token) return null;

      const { clinicName, patientName, tooth } = params;
      
      // 필수 정보가 모두 입력되지 않았으면 체크하지 않음
      if (!clinicName?.trim() || !patientName?.trim() || !tooth?.trim()) {
        return null;
      }

      // 중복 체크 중인지 확인 (동일한 키로 중복 요청 방지)
      const checkKey = `${clinicName}|${patientName}|${tooth}`;
      if (checkingRef.current.has(checkKey)) {
        return null;
      }

      try {
        checkingRef.current.add(checkKey);

        const query = new URLSearchParams({
          clinicName: clinicName.trim(),
          patientName: patientName.trim(),
          tooth: tooth.trim(),
        }).toString();

        const res = await request<any>({
          path: `/api/requests/my/check-duplicate?${query}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          console.error("[useDuplicateCheck] API error:", res);
          return null;
        }

        const body: any = res.data || {};
        const data = body?.data || body;

        const result: DuplicateCheckResult = {
          exists: Boolean(data?.exists),
          stageOrder: Number(data?.stageOrder || 0),
          existingRequest: data?.existingRequest || undefined,
        };

        if (result.exists && onDuplicateFound) {
          onDuplicateFound(result);
        }

        return result;
      } catch (error) {
        console.error("[useDuplicateCheck] Error:", error);
        return null;
      } finally {
        checkingRef.current.delete(checkKey);
      }
    },
    [token, onDuplicateFound]
  );

  return { checkDuplicate };
}
