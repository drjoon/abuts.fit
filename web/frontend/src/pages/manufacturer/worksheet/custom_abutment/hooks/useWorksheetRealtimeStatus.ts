import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  onAppEvent,
  onNotification,
  onCncMachiningCompleted,
  onCncMachiningTick,
} from "@/shared/realtime/socket";
import { deleteCncProgramCache } from "@/shared/files/fileBlobCache";
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
  const { toast } = useToast();

  const toStageLabel = (raw: unknown) => {
    const stage = String(raw || "")
      .trim()
      .toLowerCase();
    if (stage === "request") return "의뢰";
    if (stage === "cam") return "CAM";
    if (stage === "machining") return "가공";
    if (stage === "packing") return "세척.패킹";
    if (stage === "shipping") return "포장.발송";
    if (stage === "tracking") return "추적관리";
    return String(raw || "").trim() || "공정";
  };

  const toActionLabel = (raw: unknown) => {
    const action = String(raw || "")
      .trim()
      .toLowerCase();
    if (action === "esprit-trigger") return "Esprit 트리거";
    if (action === "auto-machining-trigger") return "자동 가공 트리거";
    if (action === "stage-file-cleanup") return "공정 파일 정리";
    if (action === "nc-file-cleanup") return "NC 파일 정리";
    if (action === "nc-bridge-cleanup") return "NC 브리지 정리";
    return "비동기 작업";
  };

  const isNonBlockingAsyncFailure = (payload: any) => {
    const action = String(payload?.action || "")
      .trim()
      .toLowerCase();
    return action === "nc-bridge-cleanup";
  };

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
    // found=false인 경우: 현재 페이지에 없는 항목이므로 추가하지 않음
    // (페이지 로딩 중이거나, 무한 스크롤로 아직 불러오지 않은 페이지의 항목일 수 있음)
    return prev;
  };

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setRequests((prev) =>
        prev.map((req) => {
          const rid = String(req?.requestId || "").trim();
          if (!rid) return req;

          let base = realtimeBaseRef.current[rid];
          const current = req.realtimeProgress || {};

          // 서버에서 startedAt을 내려주었으나 로컬 ref에 없는 경우 (리프레시 시 복원)
          if (typeof base !== "number" && current?.startedAt) {
            const parsed = new Date(current.startedAt).getTime();
            if (Number.isFinite(parsed)) {
              base = parsed;
              realtimeBaseRef.current[rid] = base;
            }
          }

          if (typeof base !== "number" || !current?.badge) return req;

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
      const status = String(notification?.data?.status || "").trim();

      // NC 파일 재생성 완료 시 이전 NC 캐시 무효화 (현재 request에 남아있는 구 s3Key 기반)
      if (sourceStep === "3-nc" && status === "success" && requestId) {
        setRequests((prev) => {
          const found = prev.find(
            (r) => String((r as any)?.requestId || "").trim() === requestId,
          );
          const oldS3Key = (found as any)?.caseInfos?.ncFile?.s3Key;
          if (oldS3Key) void deleteCncProgramCache(oldS3Key);
          return prev;
        });
      }

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
      const isBatchDeliveryUpdate = type === "request:delivery-updated-batch";
      if (!requestId && !isBatchDeliveryUpdate) return;

      switch (type) {
        case "request:cam-processing-started":
          delete realtimeBaseRef.current[requestId];
          setRequests((prev) =>
            prev.map((r) => {
              if (String((r as any)?.requestId || "").trim() !== requestId) {
                return r;
              }
              return {
                ...(r as any),
                realtimeProgress: {
                  badge: "NC 생성중",
                  elapsedSeconds: null,
                  startedAt: null,
                  tone: "blue",
                },
              } as any;
            }),
          );
          return;
        case "request:filled-processing-started":
          delete realtimeBaseRef.current[requestId];
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
        case "packing:capture-processed":
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
        case "request:stage-changed": {
          // 스테이지 변경 시 항목을 개별 패치하지 않고 전체 목록을 재조회한다.
          // 이렇게 해야 현재 탭 조건에 맞는 항목만 한번에 올바르게 필터링된다.
          if (fetchRequests) void fetchRequests(true);
          return;
        }
        case "request:cam-trigger-failed":
        case "request:async-action-failed": {
          const stageLabel = toStageLabel(payload?.stage);
          const actionLabel = toActionLabel(payload?.action);
          const isNonBlocking = isNonBlockingAsyncFailure(payload);
          toast({
            title: isNonBlocking ? "비동기 정리 지연" : "비동기 작업 실패",
            description: String(
              isNonBlocking
                ? `${actionLabel}가 지연되었습니다. 롤백은 완료되었고, 뒤정리는 재시도됩니다.`
                : payload?.message ||
                    `${stageLabel} 단계 ${actionLabel} 실패 (${requestId || ""})`,
            ).trim(),
            variant: isNonBlocking ? "default" : "destructive",
          });
          return;
        }
        case "request:delivery-updated": {
          const eventRequest = payload?.request as
            | ManufacturerRequest
            | undefined;
          if (!eventRequest) return;
          setRequests((prev) => applyRequestPatch(prev, eventRequest));
          return;
        }
        case "request:delivery-updated-batch": {
          const eventRequests = Array.isArray(payload?.requests)
            ? payload.requests
            : [];
          if (!eventRequests.length) return;
          setRequests((prev) => {
            let next = prev;
            for (const item of eventRequests) {
              const eventRequest = item?.request as
                | ManufacturerRequest
                | undefined;
              if (!eventRequest) continue;
              next = applyRequestPatch(next, eventRequest);
            }
            return next;
          });
          return;
        }
        case "bg:runtime-status": {
          const clear = payload?.clear === true;
          const status = String(payload?.status || "")
            .trim()
            .toLowerCase();
          const label = String(payload?.label || "").trim();
          const tone = String(payload?.tone || "blue").trim();
          const startedAt = payload?.startedAt || null;
          const elapsedSeconds = Number.isFinite(
            Number(payload?.elapsedSeconds),
          )
            ? Math.max(0, Math.floor(Number(payload?.elapsedSeconds)))
            : null;

          const hasStartedAt =
            typeof startedAt === "string" &&
            String(startedAt).trim().length > 0;
          const parsedBase = hasStartedAt
            ? new Date(startedAt as string).getTime()
            : Number.NaN;
          const hasValidBase = Number.isFinite(parsedBase);
          const shouldClearRealtime =
            clear || (status === "completed" && !hasValidBase);
          if (!hasValidBase || shouldClearRealtime) {
            delete realtimeBaseRef.current[requestId];
          }

          setRequests((prev) =>
            prev.map((r) => {
              if (String((r as any)?.requestId || "").trim() !== requestId) {
                return r;
              }
              if (shouldClearRealtime) {
                delete realtimeBaseRef.current[requestId];
                return {
                  ...(r as any),
                  realtimeProgress: null,
                } as any;
              }
              if (hasValidBase) {
                realtimeBaseRef.current[requestId] = parsedBase;
              }
              return {
                ...(r as any),
                realtimeProgress: {
                  badge: label || null,
                  startedAt,
                  elapsedSeconds,
                  tone: (tone || null) as any,
                },
              } as any;
            }),
          );
          return;
        }
        default:
          return;
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
  }, [enabled, token, setRequests, fetchRequests, toast]);

  return {
    realtimeBaseRef,
  };
}
