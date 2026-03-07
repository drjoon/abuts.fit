import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  onAppEvent,
  onNotification,
  onCncMachiningCompleted,
  onCncMachiningTick,
} from "@/shared/realtime/socket";
import type { ManufacturerRequest } from "../utils/request";

type UseWorksheetRealtimeStatusParams = {
  enabled?: boolean;
  token?: string | null;
  setRequests: Dispatch<SetStateAction<ManufacturerRequest[]>>;
  fetchRequests?: (silent?: boolean) => Promise<any>;
  fetchRequestsCore?: (silent?: boolean, append?: boolean) => Promise<any>;
  previewOpen?: boolean;
  previewFiles?: any;
  handleOpenPreview?: (req: ManufacturerRequest) => Promise<void>;
  removeOnMachiningComplete?: boolean;
};

export function useWorksheetRealtimeStatus({
  enabled = true,
  token,
  setRequests,
  fetchRequests,
  fetchRequestsCore,
  previewOpen = false,
  previewFiles,
  handleOpenPreview,
  removeOnMachiningComplete = false,
}: UseWorksheetRealtimeStatusParams) {
  const realtimeBaseRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setRequests((prev) =>
        prev.map((req) => {
          const rid = String(req?.requestId || "").trim();
          const base = realtimeBaseRef.current[rid];
          if (!rid || typeof base !== "number") return req;
          const current = req.realtimeProgress || {};
          if (!current?.badge) return req;
          return {
            ...req,
            realtimeProgress: {
              ...current,
              elapsedSeconds: Math.max(
                0,
                Math.floor((Date.now() - base) / 1000),
              ),
            },
          };
        }),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, setRequests]);

  useEffect(() => {
    if (!enabled || !token) return;

    const unsubBg = onNotification((notification: any) => {
      const type = String(notification?.type || "").trim();
      if (type !== "bg-file-processed") return;

      const requestId = String(notification?.data?.requestId || "").trim();
      const sourceStep = String(notification?.data?.sourceStep || "").trim();
      if (requestId) {
        setRequests((prev) =>
          prev.map((r) => {
            if (String((r as any)?.requestId || "").trim() !== requestId) {
              return r;
            }
            if (sourceStep === "2-filled") {
              delete realtimeBaseRef.current[requestId];
              return {
                ...(r as any),
                realtimeProgress: {
                  badge: "Filled STL 수신",
                  elapsedSeconds: null,
                  startedAt: null,
                  tone: "blue",
                },
              } as any;
            }
            if (sourceStep === "3-nc") {
              delete realtimeBaseRef.current[requestId];
              return {
                ...(r as any),
                realtimeProgress: null,
              } as any;
            }
            return r;
          }),
        );
      }
      if (
        !requestId ||
        !fetchRequestsCore ||
        !handleOpenPreview ||
        !previewOpen
      ) {
        if (!requestId && fetchRequests) void fetchRequests(true);
        return;
      }

      void (async () => {
        const list = await fetchRequestsCore(true);
        if (!list || !Array.isArray(list) || list.length === 0) return;

        const updated = list.find(
          (r: any) => String(r?.requestId || "").trim() === requestId,
        );
        if (!updated) return;

        const currentRid = String(
          previewFiles?.request?.requestId || "",
        ).trim();
        if (currentRid && currentRid !== requestId) return;
        await handleOpenPreview(updated as any);
      })();
    });

    const unsubAppEvent = onAppEvent((evt: any) => {
      const type = String(evt?.type || "").trim();
      const payload = evt?.data || {};
      const requestId = String(payload?.requestId || "").trim();
      if (!requestId) return;

      if (type === "request:cam-processing-started") {
        const startedAt = String(
          payload?.startedAt || new Date().toISOString(),
        );
        const base = new Date(startedAt).getTime();
        realtimeBaseRef.current[requestId] = Number.isFinite(base)
          ? base
          : Date.now();
        setRequests((prev) =>
          prev.map((r) => {
            if (String((r as any)?.requestId || "").trim() !== requestId) {
              return r;
            }
            return {
              ...(r as any),
              realtimeProgress: {
                badge: "CAM 생성중",
                startedAt,
                elapsedSeconds: 0,
                tone: "indigo",
              },
            } as any;
          }),
        );
        return;
      }

      if (type === "request:filled-processing-started") {
        setRequests((prev) =>
          prev.map((r) => {
            if (String((r as any)?.requestId || "").trim() !== requestId) {
              return r;
            }
            return {
              ...(r as any),
              realtimeProgress: {
                badge: "Filled STL 생성중",
                elapsedSeconds: null,
                startedAt: null,
                tone: "blue",
              },
            } as any;
          }),
        );
        return;
      }

      if (type === "packing:capture-processed") {
        setRequests((prev) =>
          prev.map((r) => {
            if (String((r as any)?.requestId || "").trim() !== requestId) {
              return r;
            }
            return {
              ...(r as any),
              realtimeProgress: null,
            } as any;
          }),
        );
        return;
      }

      if (type === "bg:runtime-status") {
        const clear = payload?.clear === true;
        const label = String(payload?.label || "").trim();
        const tone = String(payload?.tone || "blue").trim();
        const startedAt = payload?.startedAt || null;
        const elapsedSeconds = Number.isFinite(Number(payload?.elapsedSeconds))
          ? Math.max(0, Math.floor(Number(payload?.elapsedSeconds)))
          : null;
        if (startedAt) {
          const base = new Date(startedAt).getTime();
          if (Number.isFinite(base)) realtimeBaseRef.current[requestId] = base;
        }
        if (clear) delete realtimeBaseRef.current[requestId];
        setRequests((prev) =>
          prev.map((r) => {
            if (String((r as any)?.requestId || "").trim() !== requestId) {
              return r;
            }
            return {
              ...(r as any),
              realtimeProgress: clear
                ? null
                : {
                    badge: label || null,
                    startedAt,
                    elapsedSeconds,
                    tone: (tone || null) as any,
                  },
            } as any;
          }),
        );
      }
    });

    const unsubTick = onCncMachiningTick((data: any) => {
      const requestId = data?.requestId ? String(data.requestId).trim() : "";
      if (!requestId) return;
      const elapsedSecondsRaw = data?.elapsedSeconds;
      const elapsedSeconds = Number.isFinite(Number(elapsedSecondsRaw))
        ? Math.max(0, Math.floor(Number(elapsedSecondsRaw)))
        : 0;
      const machineId = data?.machineId ? String(data.machineId).trim() : "";
      const jobId = data?.jobId ? String(data.jobId).trim() : "";
      const phase = data?.phase ? String(data.phase).trim() : "";
      const percentRaw = data?.percent;
      const percent = Number.isFinite(Number(percentRaw))
        ? Math.max(0, Math.min(100, Number(percentRaw)))
        : null;

      setRequests((prev) =>
        prev.map((r) => {
          if (String((r as any)?.requestId || "").trim() !== requestId)
            return r;
          const productionSchedule = (r as any)?.productionSchedule || {};
          return {
            ...r,
            productionSchedule: {
              ...productionSchedule,
              machiningProgress: {
                ...(productionSchedule?.machiningProgress || {}),
                machineId: machineId || null,
                jobId: jobId || null,
                phase: phase || null,
                percent,
                elapsedSeconds,
              },
            },
          } as any;
        }),
      );
    });

    const unsubCompleted = onCncMachiningCompleted((data: any) => {
      const requestId = data?.requestId ? String(data.requestId).trim() : "";
      if (!requestId) {
        if (fetchRequests) void fetchRequests(true);
        return;
      }

      if (removeOnMachiningComplete) {
        setRequests((prev) =>
          prev.filter(
            (r) => String((r as any)?.requestId || "").trim() !== requestId,
          ),
        );
      }

      if (fetchRequests) void fetchRequests(true);
    });

    const handleRequestRollback = () => {
      if (fetchRequests) void fetchRequests();
    };

    window.addEventListener("request-rollback", handleRequestRollback);

    return () => {
      if (typeof unsubBg === "function") unsubBg();
      if (typeof unsubAppEvent === "function") unsubAppEvent();
      if (typeof unsubTick === "function") unsubTick();
      if (typeof unsubCompleted === "function") unsubCompleted();
      window.removeEventListener("request-rollback", handleRequestRollback);
    };
  }, [
    enabled,
    token,
    setRequests,
    fetchRequests,
    fetchRequestsCore,
    previewOpen,
    previewFiles,
    handleOpenPreview,
    removeOnMachiningComplete,
  ]);

  return {
    realtimeBaseRef,
  };
}
