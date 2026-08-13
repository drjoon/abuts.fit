// related files:
// - web/frontend/rules.md
// - web/frontend/websocket-realtime-update-checklist.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useCardActions.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/bg/bg.controller.js
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { useToast } from "@/shared/hooks/use-toast";
import {
  onNotification,
  onCncMachiningCompleted,
  onCncMachiningTick,
} from "@/shared/realtime/socket";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
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
  handleOpenPreview?: (
    req: ManufacturerRequest,
    opts?: {
      forceRefresh?: boolean;
      openOnlyIfAlreadyOpen?: boolean;
      silent?: boolean;
    },
  ) => Promise<unknown>;
  removeOnMachiningComplete?: boolean;
  matchesCurrentPage?: (req: ManufacturerRequest) => boolean;
  pendingStageTransitionToastRef?: MutableRefObject<
    Record<
      string,
      {
        toastId: string;
        expectedStages: string[];
        createdAt: number;
      }
    >
  >;
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
  pendingStageTransitionToastRef,
}: UseWorksheetRealtimeStatusParams) {
  const realtimeBaseRef = useRef<Record<string, number>>({});
  const startedToastShownRef = useRef<Record<string, number>>({});
  const latestRef = useRef({
    previewOpen,
    previewFiles,
    fetchRequestsCore,
    handleOpenPreview,
  });
  latestRef.current = {
    previewOpen,
    previewFiles,
    fetchRequestsCore,
    handleOpenPreview,
  };
  const { toast, dismiss } = useToast();

  const showStartedToast = useCallback(
    (kind: "filled" | "nc", requestId: string) => {
      const key = `${kind}:${requestId}`;
      const now = Date.now();
      const lastShownAt = Number(startedToastShownRef.current[key] || 0);
      if (now - lastShownAt < 4000) return;
      startedToastShownRef.current[key] = now;

      toast({
        title: "작업 시작",
        description:
          kind === "filled"
            ? "Filled STL 생성을 시작했습니다."
            : "NC 코드 생성을 시작했습니다.",
      });
    },
    [toast],
  );

  // change-log: 2026-08-03 - manufacturerStage request 단계는 '준비' 단일값으로 표시.
  const toStageLabel = (raw: unknown) => {
    const stage = String(raw || "")
      .trim()
      .toLowerCase();
    if (stage === "준비") return "준비";
    if (stage === "cam" || stage === "machining") return "가공";
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

  const applyRequestPatch = useCallback((
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
  }, [matchesCurrentPage]);

  // packing:capture-processed 와 동일하게, 열린 프리뷰만 silent 데이터 갱신한다.
  const refreshOpenPreviewIfMatch = useCallback(
    (
      matchRequestId: string,
      eventRequest?: ManufacturerRequest | null,
    ) => {
      const {
        previewOpen,
        previewFiles,
        handleOpenPreview,
      } = latestRef.current;
      if (!previewOpen || !handleOpenPreview) return;

      const openReq = previewFiles?.request as ManufacturerRequest | undefined;
      if (!openReq) return;

      const openRid = String(openReq?.requestId || "").trim();
      const openMid = String(openReq?._id || "").trim();
      const eventRid = String(
        eventRequest?.requestId || matchRequestId || "",
      ).trim();
      const eventMid = String(eventRequest?._id || "").trim();
      const isSameOpenPreview =
        (openRid && eventRid && openRid === eventRid) ||
        (openMid && eventMid && openMid === eventMid) ||
        (openRid && matchRequestId && openRid === matchRequestId);

      if (!isSameOpenPreview) return;

      void handleOpenPreview(eventRequest || openReq, {
        forceRefresh: true,
        openOnlyIfAlreadyOpen: true,
        silent: true,
      });
    },
    [],
  );

  const handleWorksheetAppEvent = useCallback((evt: any) => {
    const type = String(evt?.type || "").trim();
    const payload = evt?.data || {};
    const requestId = String(payload?.requestId || "").trim();
    const isBatchDeliveryUpdate = type === "request:delivery-updated-batch";
    if (!requestId && !isBatchDeliveryUpdate) return;

    switch (type) {
      case "request:cam-processing-started": {
        const startedAt = new Date().toISOString();
        realtimeBaseRef.current[requestId] = Date.now();
        showStartedToast("nc", requestId);
        setRequests((prev) =>
          prev.map((r) => {
            if (String((r as any)?.requestId || "").trim() !== requestId) {
              return r;
            }
            return {
              ...(r as any),
              realtimeProgress: {
                badge: "NC 생성중",
                elapsedSeconds: 0,
                startedAt,
                tone: "blue",
              },
            } as any;
          }),
        );
        return;
      }
      case "request:filled-processing-started": {
        const startedAt = new Date().toISOString();
        realtimeBaseRef.current[requestId] = Date.now();
        showStartedToast("filled", requestId);
        setRequests((prev) =>
          prev.map((r) => {
            if (String((r as any)?.requestId || "").trim() !== requestId) {
              return r;
            }
            return {
              ...(r as any),
              realtimeProgress: {
                badge: "Filled STL 생성중",
                elapsedSeconds: 0,
                startedAt,
                tone: "blue",
              },
            } as any;
          }),
        );
        return;
      }
      case "packing:capture-processed": {
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
      case "request:design-claim-changed": {
        if (fetchRequests) void fetchRequests(true);
        return;
      }
      case "request:stage-changed": {
        const eventRequest = payload?.request as
          | ManufacturerRequest
          | undefined;
        if (eventRequest) {
          setRequests((prev) => {
            const patched = applyRequestPatch(prev, eventRequest);

            const sourceForInsert = String(payload?.source || "").trim();
            const normalizedSourceForInsert = sourceForInsert.toLowerCase();
            const isRollbackSource =
              normalizedSourceForInsert === "stage-file-rollback-only" ||
              normalizedSourceForInsert === "stage-file-rollback-with-delete" ||
              normalizedSourceForInsert === "nc-rollback-only" ||
              normalizedSourceForInsert === "nc-rollback-with-delete" ||
              normalizedSourceForInsert.includes("rollback");

            if (!isRollbackSource || !matchesCurrentPage?.(eventRequest)) {
              return patched;
            }

            const requestIdForInsert = String(eventRequest?.requestId || "").trim();
            const mongoIdForInsert = String(eventRequest?._id || "").trim();
            const alreadyExists = patched.some((item) => {
              const itemRequestId = String(item?.requestId || "").trim();
              const itemMongoId = String(item?._id || "").trim();
              return (
                (requestIdForInsert && itemRequestId === requestIdForInsert) ||
                (mongoIdForInsert && itemMongoId === mongoIdForInsert)
              );
            });

            if (alreadyExists) return patched;
            return [eventRequest, ...patched];
          });
        }

        const pendingToastEntry =
          pendingStageTransitionToastRef?.current?.[requestId] || null;
        if (pendingToastEntry) {
          const normalizeStage = (value: unknown) =>
            String(value || "")
              .trim()
              .toUpperCase();
          const toStage =
            String(payload?.toStage || "").trim() ||
            String((eventRequest as any)?.manufacturerStage || "").trim();
          const currentStageNorm = normalizeStage(toStage);
          const expectedStagesNorm = (pendingToastEntry.expectedStages || []).map(
            normalizeStage,
          );
          if (
            currentStageNorm &&
            expectedStagesNorm.some((stage) => stage === currentStageNorm)
          ) {
            if (pendingToastEntry.toastId) {
              dismiss(pendingToastEntry.toastId);
            }
            delete pendingStageTransitionToastRef.current[requestId];
          }
        }

        const source = String(payload?.source || "").trim();
        const shouldSkipImmediateRefetch =
          source === "bg-file-processed" && Boolean(eventRequest);

        if (!shouldSkipImmediateRefetch && fetchRequests) {
          void fetchRequests(true);
        }
        // Rhino filled STL 등 BG 파일 수신: 열린 프리뷰 silent 갱신 (packing 패턴)
        if (source === "bg-file-processed" && requestId) {
          refreshOpenPreviewIfMatch(requestId, eventRequest || null);
        }
        return;
      }
      case "request:stl-metadata-updated": {
        const eventRequest = payload?.request as
          | ManufacturerRequest
          | undefined;
        if (eventRequest) {
          setRequests((prev) => applyRequestPatch(prev, eventRequest));
        }

        if (fetchRequests) void fetchRequests(true);

        // camFile이 포함된 filled 완료 메타만 열린 프리뷰를 갱신한다.
        // (register-stl-metadata 단독은 cam 전에 레이스를 만들 수 있어 제외)
        const metaSource = String(payload?.source || "").trim();
        const hasCam = Boolean(
          String((eventRequest as any)?.caseInfos?.camFile?.s3Key || "").trim(),
        );
        if (
          requestId &&
          (metaSource === "bg-file-processed:2-filled" || hasCam)
        ) {
          refreshOpenPreviewIfMatch(requestId, eventRequest || null);
        }
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
      case "worksheet:count-update": {
        const stage = String(payload?.stage || "").trim();
        const source = String(payload?.source || "").trim();
        const requestCategory = String(payload?.requestCategory || "").trim();
        const delta = Number(payload?.delta || 0);
        const action = String(payload?.action || "").trim();
        if (fetchRequests) {
          void fetchRequests(true);
        }
        if (
          source === "manufacturer_sample" ||
          requestCategory === "rnd_sample" ||
          requestCategory === "copied_sample"
        ) {
          if (delta < 0 || action === "deleted") {
            toast({
              title: "R&D 샘플 삭제됨",
              description: `R&D 샘플이 제거되었습니다${stage ? ` (${stage})` : ""}`,
            });
          } else {
            toast({
              title: "R&D 샘플 복사 완료",
              description: `R&D 탭에 새 샘플이 저장되었습니다${stage ? ` (${stage})` : ""}`,
            });
          }
        }
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
        const inferredBase =
          elapsedSeconds != null
            ? Date.now() - elapsedSeconds * 1000
            : Number.NaN;
        const effectiveBase = Number.isFinite(parsedBase)
          ? parsedBase
          : inferredBase;
        const hasValidBase = Number.isFinite(effectiveBase);
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
              realtimeBaseRef.current[requestId] = effectiveBase;
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
  }, [
    applyRequestPatch,
    fetchRequests,
    setRequests,
    showStartedToast,
    toast,
    dismiss,
    pendingStageTransitionToastRef,
    matchesCurrentPage,
    refreshOpenPreviewIfMatch,
  ]);

  // 웹소켓 실시간 업데이트(app-event): 활성 페이지에서만 이벤트를 반영한다.
  useAppEventListener({
    enabled: Boolean(enabled && token),
    eventTypes: [
      "request:cam-processing-started",
      "request:filled-processing-started",
      "packing:capture-processed",
      "request:stage-changed",
      "request:design-claim-changed",
      "request:stl-metadata-updated",
      "request:cam-trigger-failed",
      "request:async-action-failed",
      "request:delivery-updated",
      "request:delivery-updated-batch",
      "worksheet:count-update",
      "bg:runtime-status",
    ],
    onMatch: handleWorksheetAppEvent,
  });

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

          // startedAt이 없어도 서버 elapsedSeconds가 있으면 로컬 기준시각을 역산해 타이머를 이어간다.
          if (
            typeof base !== "number" &&
            Number.isFinite(Number((current as any)?.elapsedSeconds))
          ) {
            const elapsed = Math.max(
              0,
              Math.floor(Number((current as any)?.elapsedSeconds)),
            );
            base = Date.now() - elapsed * 1000;
            realtimeBaseRef.current[rid] = base;
          }

          if (typeof base !== "number" || !current?.badge) return req;

          const nextElapsed = Math.max(
            0,
            Math.floor((Date.now() - base) / 1000),
          );
          if (nextElapsed === Number((current as any)?.elapsedSeconds || 0)) {
            return req;
          }

          return {
            ...req,
            realtimeProgress: {
              ...current,
              elapsedSeconds: nextElapsed,
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
              const isSuccess =
                String(status || "").trim().toLowerCase() === "success";
              const incomingS3Key = isSuccess
                ? String(notification?.data?.s3Key || "").trim()
                : "";
              const incomingFileName = isSuccess
                ? String(notification?.data?.fileName || "").trim()
                : "";
              const prevCaseInfos = ((r as any)?.caseInfos ||
                {}) as Record<string, any>;
              const prevCamFile = (prevCaseInfos?.camFile ||
                (r as any)?.camFile ||
                {}) as Record<string, any>;
              const normalizedFilePath = incomingFileName
                ? incomingFileName.replace(/^2-filled\//i, "")
                : String(prevCamFile?.filePath || "").trim();
              const nextCamFile = incomingS3Key
                ? {
                    ...prevCamFile,
                    s3Key: incomingS3Key,
                    ...(normalizedFilePath
                      ? { filePath: normalizedFilePath }
                      : {}),
                  }
                : prevCamFile;
              const nextCaseInfos = incomingS3Key
                ? { ...prevCaseInfos, camFile: nextCamFile }
                : prevCaseInfos;
              return {
                ...(r as any),
                ...(incomingS3Key
                  ? { caseInfos: nextCaseInfos, camFile: nextCamFile }
                  : {}),
                realtimeProgress: incomingS3Key
                  ? null
                  : {
                      badge: "Filled STL 수신",
                      elapsedSeconds: null,
                      startedAt: null,
                      tone: "blue",
                    },
              } as any;
            }
            if (sourceStep === "3-nc") {
              delete realtimeBaseRef.current[requestId];

              const incomingS3Key = String(notification?.data?.s3Key || "").trim();
              const incomingFileName = String(notification?.data?.fileName || "").trim();

              const prevCaseInfos = ((r as any)?.caseInfos || {}) as Record<string, any>;
              const prevNcFile = (prevCaseInfos?.ncFile || (r as any)?.ncFile || {}) as Record<string, any>;

              const normalizedFilePath = incomingFileName
                ? incomingFileName.replace(/^3-nc\//i, "")
                : String(prevNcFile?.filePath || "").trim();

              const nextNcFile = {
                ...prevNcFile,
                ...(incomingS3Key ? { s3Key: incomingS3Key } : {}),
                ...(normalizedFilePath ? { filePath: normalizedFilePath } : {}),
              };

              const nextCaseInfos = {
                ...prevCaseInfos,
                ncFile: nextNcFile,
              };

              shouldRefreshList = true;
              return {
                ...(r as any),
                caseInfos: nextCaseInfos,
                ncFile: nextNcFile,
                realtimeProgress: null,
              } as any;
            }
            return r;
          }),
        );
      }
      if (shouldRefreshList && fetchRequests) {
        window.setTimeout(() => {
          void fetchRequests(true);
        }, 180);
      }
      // notification 경로 fallback: 2-filled 성공 시 열린 프리뷰 silent 갱신
      // (app-event와 중복되어도 usePreviewLoader loadGeneration이 최신만 반영)
      if (
        sourceStep === "2-filled" &&
        String(status || "").trim().toLowerCase() === "success" &&
        requestId
      ) {
        window.setTimeout(() => {
          refreshOpenPreviewIfMatch(requestId, null);
        }, 120);
      }
      if (!requestId && fetchRequests) void fetchRequests(true);
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
      if (typeof unsubTick === "function") unsubTick();
      if (typeof unsubCompleted === "function") unsubCompleted();
    };
  }, [
    enabled,
    token,
    setRequests,
    fetchRequests,
    applyRequestPatch,
    removeOnMachiningComplete,
    showStartedToast,
    toast,
    refreshOpenPreviewIfMatch,
  ]);

  return {
    realtimeBaseRef,
  };
}
