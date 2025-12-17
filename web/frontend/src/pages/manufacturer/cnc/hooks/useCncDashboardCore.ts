import { useCallback, useRef } from "react";

import type { Machine } from "@/pages/manufacturer/cnc/types";

interface UseCncDashboardCoreParams {
  machines: Machine[];
  setMachines: React.Dispatch<React.SetStateAction<Machine[]>>;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>;
  ensureCncWriteAllowed: () => Promise<boolean>;
}

export const useCncDashboardCore = ({
  machines,
  setMachines,
  loading,
  setLoading,
  setError,
  callRaw,
  ensureCncWriteAllowed,
}: UseCncDashboardCoreParams) => {
  const controlCooldownRef = useRef<Record<string, number>>({});

  const refreshStatusFor = useCallback(
    async (uid: string) => {
      try {
        const res = await callRaw(uid, "GetOPStatus");
        const data: any = res?.data ?? res;
        const resultCode =
          typeof data?.result === "number"
            ? data.result
            : typeof res?.result === "number"
            ? res.result
            : null;

        let status = "Unknown";
        if (typeof resultCode === "number") {
          status = resultCode === 0 ? "OK" : "Error";
        }

        setMachines((prev) => {
          return prev.map((m) =>
            m.uid === uid
              ? {
                  ...m,
                  status,
                  lastUpdated: new Date().toLocaleTimeString(),
                  lastCommand: "status",
                  lastError: null,
                }
              : m
          );
        });
      } catch (e: any) {
        const message = e?.message ?? "알 수 없는 오류";
        setError(message);
        setMachines((prev) =>
          prev.map((m) =>
            m.uid === uid
              ? { ...m, lastCommand: "status", lastError: message }
              : m
          )
        );
      }
    },
    [callRaw, setMachines, setError]
  );

  const sendControlCommand = useCallback(
    async (uid: string, action: "reset") => {
      const ok = await ensureCncWriteAllowed();
      if (!ok) return;

      const key = `${uid}:${action}`;
      const now = Date.now();
      const last = controlCooldownRef.current[key] ?? 0;
      if (now - last < 3000) {
        return;
      }
      controlCooldownRef.current[key] = now;

      setLoading(true);
      setError(null);
      try {
        const endpoint = `/api/core/machines/${encodeURIComponent(
          uid
        )}/${action}`;
        const res = await fetch(endpoint, {
          method: "POST",
        });
        if (!res.ok) {
          throw new Error(`${action} 실패`);
        }
        await refreshStatusFor(uid);
      } catch (e: any) {
        const message = e?.message ?? "알 수 없는 오류";
        setError(message);
        setMachines((prev) =>
          prev.map((m) =>
            m.uid === uid
              ? { ...m, lastCommand: action, lastError: message }
              : m
          )
        );
      } finally {
        setLoading(false);
      }
    },
    [ensureCncWriteAllowed, refreshStatusFor, setError, setLoading, setMachines]
  );

  const handleBackgroundRefresh = useCallback(() => {
    if (loading || machines.length === 0) return;

    const VISIBLE_LIMIT = 12; // 3열 기준 4행 정도
    const targets = machines.slice(0, VISIBLE_LIMIT);

    targets.forEach((m) => {
      void refreshStatusFor(m.uid);
    });
  }, [loading, machines, refreshStatusFor]);

  return {
    refreshStatusFor,
    sendControlCommand,
    handleBackgroundRefresh,
  };
};
