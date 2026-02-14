import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
import { useSocket } from "@/shared/hooks/useSocket";

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
  const { socket } = useSocket();
  const lastTickTimeRef = useRef<number>(0);
  const localTimerRef = useRef<NodeJS.Timeout | null>(null);

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
        lastTickTimeRef.current = Date.now();
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

  // WebSocket 기반 실시간 elapsed 업데이트
  useEffect(() => {
    if (!machineId || !state || !socket) return;

    const handleTick = (data: any) => {
      if (data?.machineId !== machineId) return;

      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          elapsedSeconds: data.elapsedSeconds ?? prev.elapsedSeconds,
          isRunning: data.isRunning ?? prev.isRunning,
        };
      });

      lastTickTimeRef.current = Date.now();
    };

    const handleCompleted = (data: any) => {
      if (data?.machineId !== machineId) return;
      void fetchState();
    };

    socket.on("cnc-machining-tick", handleTick);
    socket.on("cnc-machining-completed", handleCompleted);

    return () => {
      socket.off("cnc-machining-tick", handleTick);
      socket.off("cnc-machining-completed", handleCompleted);
    };
  }, [machineId, state, socket, fetchState]);

  // 로컬 타이머: tick 이벤트가 없을 때 elapsed 보간
  useEffect(() => {
    if (!state?.isRunning) {
      if (localTimerRef.current) {
        clearInterval(localTimerRef.current);
        localTimerRef.current = null;
      }
      return;
    }

    localTimerRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev || !prev.isRunning) return prev;
        return {
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1,
        };
      });
    }, 1000);

    return () => {
      if (localTimerRef.current) {
        clearInterval(localTimerRef.current);
        localTimerRef.current = null;
      }
    };
  }, [state?.isRunning]);

  return {
    state,
    loading,
    error,
    refresh: fetchState,
  };
};
