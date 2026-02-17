import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export interface JobResult {
  jobId: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  result: any;
  createdAtUtc: string;
}

interface UseJobResultOptions {
  machineId: string;
  jobId: string;
  onComplete?: (result: JobResult) => void;
  onError?: (error: string) => void;
  pollInterval?: number;
  maxRetries?: number;
}

export const useJobResult = ({
  machineId,
  jobId,
  onComplete,
  onError,
  pollInterval = 1000,
  maxRetries = 300,
}: UseJobResultOptions) => {
  const { token } = useAuthStore();
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const retryCountRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const pollJobResult = useCallback(async () => {
    if (!token || !machineId || !jobId) return;

    try {
      const res = await apiFetch({
        path: `/api/cnc-machines/${encodeURIComponent(machineId)}/jobs/${encodeURIComponent(jobId)}`,
        method: "GET",
        token,
      });

      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "작업 결과 조회 실패");
      }

      const result: JobResult = {
        jobId: body.jobId,
        status: body.status,
        result: body.result,
        createdAtUtc: body.createdAtUtc,
      };

      setJobResult(result);

      if (result.status === "COMPLETED") {
        setIsPolling(false);
        onComplete?.(result);
      } else if (result.status === "FAILED") {
        setIsPolling(false);
        onError?.(result.result?.message || "작업 실패");
      }
    } catch (error: any) {
      retryCountRef.current++;
      if (retryCountRef.current >= maxRetries) {
        setIsPolling(false);
        onError?.(error?.message || "작업 결과 조회 중 오류 발생");
      }
    }
  }, [token, machineId, jobId, onComplete, onError, maxRetries]);

  useEffect(() => {
    if (!isPolling) return;

    timerRef.current = setInterval(() => {
      void pollJobResult();
    }, pollInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPolling, pollJobResult, pollInterval]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, []);

  return {
    jobResult,
    isPolling,
    stopPolling,
  };
};
