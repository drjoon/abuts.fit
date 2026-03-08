import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  onAppEvent,
  onNotification,
  onCncMachiningCompleted,
  onCncMachiningTick,
} from "@/shared/realtime/socket";
import {
  deriveStageForFilter,
  type ManufacturerRequest,
} from "../utils/request";

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
  matchesCurrentPage?: (req: ManufacturerRequest) => boolean;
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
  matchesCurrentPage,
}: UseWorksheetRealtimeStatusParams) {
  const realtimeBaseRef = useRef<Record<string, number>>({});

  const applyRequestPatch = (
    prev: ManufacturerRequest[],
    nextRequest: ManufacturerRequest | null | undefined,
  ) => {
    if (!nextRequest) return prev;
    const requestId = String(nextRequest.requestId || "").trim();
    const mongoId = String(nextRequest._id || "").trim();
    const shouldKeep = matchesCurrentPage
      ? matchesCurrentPage(nextRequest)
      : true;

    if (!shouldKeep) {
      return prev.filter((item) => {
        const itemRequestId = String(item?.requestId || "").trim();
        const itemMongoId = String(item?._id || "").trim();
        if (requestId && itemRequestId === requestId) return false;
        if (mongoId && itemMongoId === mongoId) return false;
        return true;
      });
    }

    let found = false;
    const updated = prev.map((item) => {
      const itemRequestId = String(item?.requestId || "").trim();
      const itemMongoId = String(item?._id || "").trim();
      const isSame =
        (requestId && itemRequestId === requestId) ||
        (mongoId && itemMongoId === mongoId);
      if (!isSame) return item;
      found = true;
      return {
        ...item,
        ...nextRequest,
        realtimeProgress:
          nextRequest.realtimeProgress === undefined
            ? item.realtimeProgress || null
            : nextRequest.realtimeProgress,
      };
    });

    if (found) return updated;
    return [nextRequest, ...updated];
  };

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
      let shouldRefreshList = false;
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
              shouldRefreshList = true;
              return {
                ...(r as any),
                realtimeProgress: null,
              } as any;
            }
            return r;
          }),
        );
      }
      if (shouldRefreshList && fetchRequests) {
        void fetchRequests(true);
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
        const eventRequest = payload?.request as
          | ManufacturerRequest
          | undefined;
        if (eventRequest) {
          setRequests((prev) =>
            applyRequestPatch(prev, {
              ...eventRequest,
              realtimeProgress: null,
            }),
          );
        } else {
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
        }
        return;
      }

      if (type === "request:stage-changed") {
        const eventRequest = payload?.request as
          | ManufacturerRequest
          | undefined;
        if (!eventRequest) return;
        setRequests((prev) =>
          applyRequestPatch(prev, {
            ...eventRequest,
            manufacturerStage:
              String(
                eventRequest.manufacturerStage || payload?.toStage || "",
              ).trim() || eventRequest.manufacturerStage,
          }),
        );
        return;
      }

      if (type === "request:delivery-updated") {
        const eventRequest = payload?.request as
          | ManufacturerRequest
          | undefined;
        if (!eventRequest) return;
        setRequests((prev) => applyRequestPatch(prev, eventRequest));
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

    return () => {
      if (typeof unsubBg === "function") unsubBg();
      if (typeof unsubAppEvent === "function") unsubAppEvent();
      if (typeof unsubTick === "function") unsubTick();
      if (typeof unsubCompleted === "function") unsubCompleted();
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
    matchesCurrentPage,
  ]);

  return {
    realtimeBaseRef,
  };
}
