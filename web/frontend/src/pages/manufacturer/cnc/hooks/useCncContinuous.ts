import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";

export interface ContinuousMachiningState {
  machineId: string;
  currentSlot: number;
  nextSlot: number;
  isRunning: boolean;
  currentJob: string | null;
  nextJob: string | null;
  elapsedSeconds: number;
}

export const useCncContinuous = (machineId: string | null | undefined) => {
  const { token } = useAuthStore();
  const [state, setState] = useState<ContinuousMachiningState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    if (!machineId || !token) {
      setState(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch({
        path: `/api/cnc-machines/${encodeURIComponent(machineId)}/continuous/state`,
        method: "GET",
        token,
      });

      if (!res.ok) {
        throw new Error("연속가공 상태 조회 실패");
      }

      const body: any = res.data ?? {};
      const data = body.data ?? body;

      if (data && typeof data === "object") {
        setState({
          machineId: data.machineId ?? machineId,
          currentSlot: data.currentSlot ?? 3000,
          nextSlot: data.nextSlot ?? 3001,
          isRunning: data.isRunning === true,
          currentJob: data.currentJob ?? null,
          nextJob: data.nextJob ?? null,
          elapsedSeconds: data.elapsedSeconds ?? 0,
        });
      } else {
        setState(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "연속가공 상태 조회 중 오류");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [machineId, token]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  return {
    state,
    loading,
    error,
    refresh: fetchState,
  };
};
