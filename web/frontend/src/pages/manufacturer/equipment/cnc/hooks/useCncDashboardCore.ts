import { useCallback, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";

import type { Machine } from "@/pages/manufacturer/equipment/cnc/types";

interface UseCncDashboardCoreParams {
  machines: Machine[];
  setMachines: React.Dispatch<React.SetStateAction<Machine[]>>;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>;
  ensureCncWriteAllowed: () => Promise<boolean>;
  token: string | null;
}

export const useCncDashboardCore = ({
  machines,
  setMachines,
  loading,
  setLoading,
  setError,
  callRaw,
  ensureCncWriteAllowed,
  token,
}: UseCncDashboardCoreParams) => {
  const controlCooldownRef = useRef<Record<string, number>>({});

  const shouldSilenceBridgeDownError = (msg: string) => {
    const t = String(msg || "").toLowerCase();
    return (
      t.includes("proxy failed") ||
      t.includes("raw proxy") ||
      t.includes("bridge proxy")
    );
  };

  const refreshStatusFor = useCallback(
    async (uid: string) => {
      try {
        const res = await apiFetch({
          path: `/api/machines/${encodeURIComponent(uid)}/status`,
          method: "GET",
          token,
        });
        const body: any = res.data ?? {};
        if (!res.ok || body?.success === false) {
          throw new Error(
            String(body?.message || body?.error || "상태 조회 실패"),
          );
        }

        const statusRaw = String(
          body?.status || body?.data?.status || body?.machine?.status || "",
        ).trim();

        setMachines((prev) => {
          return prev.map((m) =>
            m.uid === uid
              ? {
                  ...m,
                  status: statusRaw || "Unknown",
                  lastUpdated: new Date().toLocaleTimeString(),
                  lastCommand: "status",
                  lastError: null,
                }
              : m,
          );
        });

        if (statusRaw.toUpperCase().includes("ALARM")) {
          setMachines((prev) =>
            prev.map((m) => (m.uid === uid ? { ...m, status: "ALARM" } : m)),
          );
        }
      } catch (e: any) {
        const message = e?.message ?? "알 수 없는 오류";
        if (!shouldSilenceBridgeDownError(message)) {
          setError(message);
        }
        setMachines((prev) =>
          prev.map((m) =>
            m.uid === uid
              ? { ...m, lastCommand: "status", lastError: message }
              : m,
          ),
        );
      }
    },
    [setMachines, setError, token],
  );

  const sendControlCommand = useCallback(
    async (uid: string, action: "reset" | "start" | "stop") => {
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
        const jsonBody =
          action === "start"
            ? { ioUid: 61, panelType: 0, status: 1 }
            : action === "stop"
              ? { ioUid: 62, panelType: 0, status: 1 }
              : undefined;

        const res = await apiFetch({
          path: `/api/machines/${encodeURIComponent(uid)}/${action}`,
          method: "POST",
          token,
          jsonBody,
        });
        if (!res.ok) {
          throw new Error(`${action} 실패`);
        }

        if (action === "stop") {
          try {
            await apiFetch({
              path: `/api/cnc-machines/${encodeURIComponent(uid)}/machining/cancel`,
              method: "POST",
              token,
              jsonBody: {},
            });
          } catch {
            // ignore
          }
        }
        await refreshStatusFor(uid);
      } catch (e: any) {
        const message = e?.message ?? "알 수 없는 오류";
        setError(message);
        setMachines((prev) =>
          prev.map((m) =>
            m.uid === uid
              ? { ...m, lastCommand: action, lastError: message }
              : m,
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [
      ensureCncWriteAllowed,
      refreshStatusFor,
      setError,
      setLoading,
      setMachines,
      token,
    ],
  );

  const handleBackgroundRefresh = useCallback(() => {
    if (loading || machines.length === 0) return;

    void (async () => {
      try {
        const res = await apiFetch({
          path: "/api/machines/status?includeAlarms=1",
          method: "GET",
          token,
        });
        const body: any = res.data ?? {};
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "상태 조회 실패");
        }
        const list: any[] = Array.isArray(body?.machines) ? body.machines : [];
        const map = new Map(
          list
            .filter((x) => x && x.uid)
            .map((x) => [String(x.uid), String(x.status || "Unknown")]),
        );

        setMachines((prev) =>
          prev.map((m) =>
            map.has(m.uid)
              ? {
                  ...m,
                  status: map.get(m.uid) || m.status,
                  lastUpdated: new Date().toLocaleTimeString(),
                  lastCommand: "status",
                  lastError: null,
                }
              : m,
          ),
        );
      } catch (e: any) {
        const message = e?.message ?? "알 수 없는 오류";
        if (!shouldSilenceBridgeDownError(message)) {
          setError(message);
        }

        // 상태 조회가 실패하면 기존 OK 상태를 유지하지 않고, 즉시 ERROR로 반영하여
        // UI에서 stale green을 피한다.
        setMachines((prev) =>
          prev.map((m) => ({
            ...m,
            status: "ERROR",
            lastUpdated: new Date().toLocaleTimeString(),
            lastCommand: "status",
            lastError: message,
          })),
        );
      }
    })();
  }, [
    loading,
    machines.length,
    setError,
    setMachines,
    shouldSilenceBridgeDownError,
    token,
  ]);

  return {
    refreshStatusFor,
    sendControlCommand,
    handleBackgroundRefresh,
  };
};
