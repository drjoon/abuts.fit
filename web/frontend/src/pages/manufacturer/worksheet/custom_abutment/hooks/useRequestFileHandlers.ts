// change-log:
// - 2026-09-03: 세척.패킹 각인 이미지 업로드 직후 프리뷰 URL을 즉시 반영(→ 승인 가능 상태).
// - 2026-08-17: 세척.패킹→가공 롤백 시 우편함 유지, 가공→준비 롤백 시 해제.
// - 2026-08-03: 가공/롤백/승인 로컬 패치에서 의뢰 단계 명칭을 '준비'로 사용하도록 조정 (UI 표시용).
// - note: 서버 승인/롤백 계약은 변경하지 않음(백엔드 이벤트는 기존 manufacturerStage 값을 사용함).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import { deleteCncProgramCache } from "@/shared/files/fileBlobCache";
import {
  deriveStageForFilter,
  patchFilledStlFile,
  type ManufacturerRequest,
  type ReviewStageKey,
  getReviewStageKeyByTab,
} from "../utils/request";

type UseRequestFileHandlersProps = {
  token: string | null;
  stage: string;
  isCamStage: boolean;
  isMachiningStage: boolean;
  fetchRequests: () => Promise<void>;
  setRequests?: React.Dispatch<React.SetStateAction<ManufacturerRequest[]>>;
  matchesCurrentPage?: (req: ManufacturerRequest) => boolean;
  setDownloading: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUploading: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUploadProgress: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >;
  setDeletingCam: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setDeletingNc: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setReviewSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewFiles: React.Dispatch<React.SetStateAction<any>>;
  setPreviewNcText: React.Dispatch<React.SetStateAction<string>>;
  setPreviewNcName: React.Dispatch<React.SetStateAction<string>>;
  setPreviewStageUrl: React.Dispatch<React.SetStateAction<string>>;
  setPreviewStageName: React.Dispatch<React.SetStateAction<string>>;
  setPreviewLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchParams: (
    nextInit: ((prev: URLSearchParams) => URLSearchParams) | URLSearchParams,
    navigateOpts?: { replace?: boolean },
  ) => void;
  decodeNcText: (buffer: ArrayBuffer) => string;
};

export const useRequestFileHandlers = ({
  token,
  stage,
  isCamStage,
  isMachiningStage,
  fetchRequests,
  setRequests,
  matchesCurrentPage,
  setDownloading,
  setUploading,
  setUploadProgress,
  setDeletingCam,
  setDeletingNc,
  setReviewSaving,
  setPreviewOpen,
  setPreviewFiles,
  setPreviewNcText,
  setPreviewNcName,
  setPreviewStageUrl,
  setPreviewStageName,
  setPreviewLoading,
  setSearchParams,
  decodeNcText,
}: UseRequestFileHandlersProps) => {
  const queryClient = useQueryClient();
  const { toast, dismiss } = useToast();
  const { uploadFiles } = useS3TempUpload({ token });

  const getApprovedManufacturerStage = useCallback(
    (stageKey: ReviewStageKey) => {
      // 준비 승인 시 카드/카운터를 즉시 가공으로 반영한다.
      if (stageKey === "request") return "가공";
      if (stageKey === "cam") return "가공";
      if (stageKey === "machining") return "세척.패킹";
      if (stageKey === "packing") return "포장.발송";
      if (stageKey === "shipping") return "추적관리";
      return null;
    },
    [],
  );

  const getRolledBackManufacturerStage = useCallback(
    (stageKey: ReviewStageKey) => {
      if (stageKey === "cam") return "준비";
      if (stageKey === "machining") return "CAM";
      if (stageKey === "packing") return "가공";
      if (stageKey === "shipping") return "세척.패킹";
      if (stageKey === "tracking") return "포장.발송";
      return null;
    },
    [],
  );

  const getSummaryCountKeyByStage = useCallback(
    (stageKey: ReviewStageKey):
      | "requestCount"
      | "camCount"
      | "machiningCount"
      | "packingCount"
      | "shippingCount"
      | "trackingCount" => {
      if (stageKey === "request") return "requestCount";
      if (stageKey === "cam") return "camCount";
      if (stageKey === "machining") return "machiningCount";
      if (stageKey === "packing") return "packingCount";
      if (stageKey === "shipping") return "shippingCount";
      return "trackingCount";
    },
    [],
  );

  const getNextStageForSummary = useCallback(
    (stageKey: ReviewStageKey, status: "PENDING" | "APPROVED" | "REJECTED") => {
      if (status === "APPROVED") {
        if (stageKey === "request") return "machining" as ReviewStageKey;
        if (stageKey === "cam") return "machining" as ReviewStageKey;
        if (stageKey === "machining") return "packing" as ReviewStageKey;
        if (stageKey === "packing") return "shipping" as ReviewStageKey;
        if (stageKey === "shipping") return "tracking" as ReviewStageKey;
        return null;
      }

      if (status === "PENDING") {
        if (stageKey === "cam") return "request" as ReviewStageKey;
        if (stageKey === "machining") return "cam" as ReviewStageKey;
        if (stageKey === "packing") return "machining" as ReviewStageKey;
        if (stageKey === "shipping") return "packing" as ReviewStageKey;
        if (stageKey === "tracking") return "shipping" as ReviewStageKey;
        return null;
      }

      return null;
    },
    [],
  );

  const applyWorksheetSummaryCounterDelta = useCallback(
    (
      stageKey: ReviewStageKey,
      status: "PENDING" | "APPROVED" | "REJECTED",
      delta = 1,
    ) => {
      if (!Number.isFinite(delta) || delta === 0) return;
      const nextStage = getNextStageForSummary(stageKey, status);
      if (!nextStage) return;

      const fromKey = getSummaryCountKeyByStage(stageKey);
      const toKey = getSummaryCountKeyByStage(nextStage);
      if (fromKey === toKey) return;

      queryClient.setQueriesData(
        { queryKey: ["worksheet-assigned-summary"] },
        (prev: any) => {
          if (!prev || typeof prev !== "object") return prev;
          if (!prev.success || !prev.data || typeof prev.data !== "object") {
            return prev;
          }

          const nextData = {
            ...(prev.data as Record<string, unknown>),
          } as Record<string, number | unknown>;

          const fromValue = Number(nextData[fromKey] || 0);
          const toValue = Number(nextData[toKey] || 0);

          nextData[fromKey] = Math.max(0, fromValue - delta);
          nextData[toKey] = Math.max(0, toValue + delta);

          return {
            ...prev,
            data: nextData,
          };
        },
      );
    },
    [getNextStageForSummary, getSummaryCountKeyByStage, queryClient],
  );

  const summaryRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const summaryRefetchInFlightRef = useRef<Promise<void> | null>(null);
  const summaryRefetchQueuedRef = useRef(false);

  const runWorksheetSummaryVerifyRefetch = useCallback(() => {
    if (summaryRefetchInFlightRef.current) {
      summaryRefetchQueuedRef.current = true;
      return;
    }

    const task = (async () => {
      await queryClient.invalidateQueries({
        queryKey: ["worksheet-assigned-summary"],
      });
      await queryClient.refetchQueries({
        queryKey: ["worksheet-assigned-summary"],
        type: "active",
      });
    })().finally(() => {
      summaryRefetchInFlightRef.current = null;
      if (summaryRefetchQueuedRef.current) {
        summaryRefetchQueuedRef.current = false;
        runWorksheetSummaryVerifyRefetch();
      }
    });

    summaryRefetchInFlightRef.current = task;
  }, [queryClient]);

  const scheduleWorksheetSummaryVerifyRefetch = useCallback(
    (delayMs = 220) => {
      if (summaryRefetchTimerRef.current) {
        clearTimeout(summaryRefetchTimerRef.current);
      }
      summaryRefetchTimerRef.current = setTimeout(() => {
        summaryRefetchTimerRef.current = null;
        runWorksheetSummaryVerifyRefetch();
      }, Math.max(0, delayMs));
    },
    [runWorksheetSummaryVerifyRefetch],
  );

  useEffect(() => {
    return () => {
      if (summaryRefetchTimerRef.current) {
        clearTimeout(summaryRefetchTimerRef.current);
      }
      summaryRefetchTimerRef.current = null;
      summaryRefetchQueuedRef.current = false;
    };
  }, []);

  const patchReviewStatusLocally = useCallback(
    (
      req: ManufacturerRequest,
      stageKey: ReviewStageKey,
      status: "PENDING" | "APPROVED" | "REJECTED",
      reason?: string,
    ): ManufacturerRequest => {
      const next = {
        ...req,
        caseInfos: {
          ...req.caseInfos,
          reviewByStage: {
            ...req.caseInfos?.reviewByStage,
            [stageKey]: {
              ...req.caseInfos?.reviewByStage?.[stageKey],
              status,
              updatedAt: new Date().toISOString(),
              reason: String(reason || ""),
            },
          },
        },
      } as ManufacturerRequest;

      if (status === "APPROVED") {
        const nextStage = getApprovedManufacturerStage(stageKey);
        if (nextStage) {
          next.manufacturerStage = nextStage;
        }
      } else if (status === "PENDING") {
        const rollbackStage = getRolledBackManufacturerStage(stageKey);
        if (rollbackStage) {
          next.manufacturerStage = rollbackStage;
        }
      }

      if (stageKey === "shipping" && status === "PENDING") {
        const prevCounts = {
          ...(req.caseInfos?.rollbackCounts || {}),
        } as Record<string, number>;
        prevCounts["shipping"] = Number(prevCounts["shipping"] || 0) + 1;
        next.caseInfos = {
          ...next.caseInfos,
          rollbackCounts: prevCounts as any,
        };
      }

      if (stageKey === "machining" && status === "PENDING") {
        next.mailboxAddress = null;
      }

      if (stageKey === "tracking" && status === "PENDING") {
        const prevCounts = {
          ...(req.caseInfos?.rollbackCounts || {}),
        } as Record<string, number>;
        prevCounts["tracking"] = Number(prevCounts["tracking"] || 0) + 1;
        next.caseInfos = {
          ...next.caseInfos,
          rollbackCounts: prevCounts as any,
        };
      }

      if (stageKey === "cam" && status === "PENDING") {
        const prevCounts = {
          ...(req.caseInfos?.rollbackCounts || {}),
        } as Record<string, number>;
        prevCounts["cam"] = Number(prevCounts["cam"] || 0) + 1;
        next.caseInfos = {
          ...next.caseInfos,
          rollbackCounts: prevCounts as any,
        };
      }

      if (stageKey === "request" && status === "PENDING") {
        const prevCounts = {
          ...(req.caseInfos?.rollbackCounts || {}),
        } as Record<string, number>;
        prevCounts["request"] = Number(prevCounts["request"] || 0) + 1;
        next.caseInfos = {
          ...next.caseInfos,
          rollbackCounts: prevCounts as any,
        };
      }

      if (stageKey === "machining" && status === "PENDING") {
        next.assignedMachine = null;
        next.productionSchedule = {
          ...next.productionSchedule,
          actualMachiningComplete: null,
          assignedMachine: null,
          queuePosition: null,
        };
      }

      return next;
    },
    [getApprovedManufacturerStage, getRolledBackManufacturerStage],
  );

  const patchDeleteStageFileLocally = useCallback(
    (
      req: ManufacturerRequest,
      stageKey: "machining" | "packing" | "shipping" | "tracking",
      rollbackOnly: boolean,
    ): ManufacturerRequest => {
      const nextStageFiles = { ...(req.caseInfos?.stageFiles || {}) } as Record<
        string,
        unknown
      >;
      // rollbackOnly=true일 때는 서버도 stageFiles를 삭제하지 않으므로
      // 로컬 optimistic update에서도 파일을 유지해야 함
      if (!rollbackOnly) {
        delete nextStageFiles[stageKey];
      }

      const next = {
        ...req,
        caseInfos: {
          ...req.caseInfos,
          stageFiles: nextStageFiles,
          reviewByStage: {
            ...req.caseInfos?.reviewByStage,
            [stageKey]: {
              ...req.caseInfos?.reviewByStage?.[stageKey],
              status: "PENDING",
              updatedAt: new Date().toISOString(),
              reason: "",
            },
          },
        },
      } as ManufacturerRequest;

      if (rollbackOnly) {
        const rollbackStage = getRolledBackManufacturerStage(stageKey);
        if (rollbackStage) {
          next.manufacturerStage = rollbackStage;
        }
      }

      if (
        (stageKey === "machining" || stageKey === "packing") &&
        rollbackOnly
      ) {
        if (stageKey === "machining") {
          next.mailboxAddress = null;
        }
        next.assignedMachine = null;
        next.productionSchedule = {
          ...next.productionSchedule,
          actualMachiningComplete: null,
          assignedMachine: null,
          queuePosition: null,
        };
      }

      if (rollbackOnly) {
        const prevCounts = {
          ...(req.caseInfos?.rollbackCounts || {}),
        } as Record<string, number>;
        const bump = (k: string) => {
          prevCounts[k] = Number(prevCounts[k] || 0) + 1;
        };
        bump(stageKey);
        if (stageKey === "machining") bump("cam");
        if (stageKey === "packing") bump("machining");
        next.caseInfos = {
          ...next.caseInfos,
          rollbackCounts: prevCounts as any,
        };
      }

      return next;
    },
    [getRolledBackManufacturerStage],
  );

  const applySingleRequestPatch = useCallback(
    (nextRequest: ManufacturerRequest | null | undefined) => {
      if (!nextRequest || !setRequests) return false;
      const requestId = String(nextRequest.requestId || "").trim();
      const mongoId = String(nextRequest._id || "").trim();
      const shouldKeep = matchesCurrentPage
        ? matchesCurrentPage(nextRequest)
        : true;

      setRequests((prev) => {
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
              deriveStageForFilter(nextRequest) === "준비"
                ? nextRequest.realtimeProgress || item.realtimeProgress || null
                : null,
          };
        });

        if (found) return updated;
        return [nextRequest, ...updated];
      });

      return true;
    },
    [matchesCurrentPage, setRequests],
  );

  const removeSingleRequest = useCallback(
    (targetRequest: ManufacturerRequest | null | undefined) => {
      if (!targetRequest || !setRequests) return false;
      const requestId = String(targetRequest.requestId || "").trim();
      const mongoId = String(targetRequest._id || "").trim();
      setRequests((prev) =>
        prev.filter((item) => {
          const itemRequestId = String(item?.requestId || "").trim();
          const itemMongoId = String(item?._id || "").trim();
          if (requestId && itemRequestId === requestId) return false;
          if (mongoId && itemMongoId === mongoId) return false;
          return true;
        }),
      );
      return true;
    },
    [setRequests],
  );

  const downloadByEndpoint = useCallback(
    async (endpoint: string, errorMessage: string) => {
      if (!token) return;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        toast({
          title: "다운로드 실패",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }
      const data = await res.json();
      const url = data?.data?.url;
      if (!url) {
        toast({
          title: "다운로드 실패",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }
      window.open(url, "_blank");
    },
    [token, toast],
  );

  const handleDownloadOriginalStl = useCallback(
    async (req: ManufacturerRequest) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/original-file-url`,
        "원본 STL을 가져올 수 없습니다.",
      );
    },
    [downloadByEndpoint],
  );

  const handleDownloadCamStl = useCallback(
    async (req: ManufacturerRequest) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/cam-file-url`,
        "CAM STL을 가져올 수 없습니다.",
      );
    },
    [downloadByEndpoint],
  );

  const handleDownloadNcFile = useCallback(
    async (req: ManufacturerRequest) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/nc-file-url`,
        "NC 파일을 가져올 수 없습니다.",
      );
    },
    [downloadByEndpoint],
  );

  const handleDownloadStageFile = useCallback(
    async (req: ManufacturerRequest, stage: string) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/stage-file-url?stage=${encodeURIComponent(
          stage,
        )}`,
        "파일을 가져올 수 없습니다.",
      );
    },
    [downloadByEndpoint],
  );

  // related files (hex dual-production on request approval):
  // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
  // - web/backend/controllers/requests/common.review.controller.js
  const handleUpdateReviewStatus = useCallback(
    async (params: {
      req: ManufacturerRequest;
      status: "PENDING" | "APPROVED" | "REJECTED";
      reason?: string;
      stageOverride?: ReviewStageKey;
      keepPreviewOpen?: boolean;
      forceReprocess?: boolean;
      processBothHexVariants?: boolean;
      approvalTriggerSource?: "preview-modal" | "worksheet-tab" | "unknown";
      nextUpCamRunGuard?: boolean;
    }) => {
      if (!token) return;
      setReviewSaving(true);

      const stageKey =
        params.stageOverride ||
        getReviewStageKeyByTab({
          stage,
          isCamStage,
          isMachiningStage,
        });



      try {
        const res = await fetch(
          `/api/requests/${params.req._id}/review-status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              stage: stageKey,
              status: params.status,
              reason: params.reason || "",
              forceReprocess: params.forceReprocess === true,
              processBothHexVariants: params.processBothHexVariants === true,
              approvalTriggerSource: params.approvalTriggerSource || "unknown",
              nextUpCamRunGuard: params.nextUpCamRunGuard === true,
            }),
          },
        );

        if (!res.ok) {
          let message = "검토 상태 변경에 실패했습니다.";
          const statusCode = res.status;
          let errorPayload: any = null;
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errorData = await res.json().catch(() => null);
              errorPayload = errorData?.payload || null;
              if (errorData?.message) message = String(errorData.message);
            } else {
              const text = await res.text().catch(() => "");
              if (text) message = text;
            }
          } catch {
            // ignore
          }

          const err = new Error(message);
          (err as any).statusCode = statusCode;
          (err as any).payload = errorPayload;
          (err as any).skipFetchRequests = true; // 에러 시 목록 갱신 및 안내 토스트 방지
          throw err;
        }

        let body: {
          message?: string;
          data?: ManufacturerRequest;
          meta?: {
            noop?: boolean;
            reason?: string;
            retryEnqueued?: boolean;
            retryErrorMessage?: string;
            lastQueueErrorMessage?: string;
            lastQueueErrorCode?: string;
            lastQueueErrorStatus?: number | string;
            reusedExistingNc?: boolean;
            camRunTriggered?: boolean;
            camRunQueueId?: string | null;
            camRunAlreadyQueued?: boolean;
            camRunTriggerErrorMessage?: string | null;
          };
        } | null = null;
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            body = await res.json().catch(() => null);
          }
        } catch {
          // ignore
        }

        if (body?.data) {
          applySingleRequestPatch(body.data);
        } else if (setRequests) {
          // 서버가 data를 생략한 경우에만 최소 로컬 반영(응답 이후)
          const fallbackRequest = patchReviewStatusLocally(
            params.req,
            stageKey,
            params.status,
            params.reason,
          );
          applySingleRequestPatch(fallbackRequest);
        } else {
          await fetchRequests();
        }

        const isAlreadyApprovedNoop =
          body?.meta?.noop === true &&
          body?.meta?.reason === "already-approved-request-stage";
        const triggerSource = params.approvalTriggerSource || "unknown";

        const responseMessage = String(body?.message || "").trim();
        const lastQueueErrorMessage = String(
          body?.meta?.lastQueueErrorMessage || "",
        ).trim();
        const lastQueueErrorCode = String(
          body?.meta?.lastQueueErrorCode || "",
        ).trim();
        const lastQueueErrorStatus = Number(body?.meta?.lastQueueErrorStatus || 0);
        const retryEnqueued = body?.meta?.retryEnqueued === true;
        const retryErrorMessage = String(body?.meta?.retryErrorMessage || "").trim();

        const queueErrorHint = `${lastQueueErrorCode} ${lastQueueErrorMessage}`.toLowerCase();
        const isEsprit403 =
          lastQueueErrorStatus === 403 ||
          lastQueueErrorCode === "403" ||
          queueErrorHint.includes(" 403") ||
          queueErrorHint.startsWith("403") ||
          queueErrorHint.includes("allowlist") ||
          queueErrorHint.includes("forbidden") ||
          queueErrorHint.includes("차단");

        if (isAlreadyApprovedNoop) {
          if (retryEnqueued) {
            toast({
              title: isEsprit403
                ? "Esprit 재시도 등록됨 (이전 403 실패 감지)"
                : "Esprit 재시도 큐 등록 완료",
              description: isEsprit403
                ? "이전 실패 원인: Esprit 서버 IP 차단(403). 재시도는 등록되었지만 ESPRIT_ALLOW_IPS 확인이 필요합니다."
                : responseMessage ||
                  "이전 실패가 감지되어 CAM 생성 재시도 큐에 등록했습니다.",
              variant: isEsprit403 ? "destructive" : undefined,
              duration: 6000,
            });
          } else if (isEsprit403) {
            toast({
              title: "Esprit 호출 실패 (403)",
              description:
                lastQueueErrorMessage ||
                "Esprit 서버 IP가 차단되었습니다. ESPRIT_ALLOW_IPS를 확인해주세요.",
              variant: "destructive",
              duration: 7000,
            });
          } else if (retryErrorMessage) {
            toast({
              title: "재시도 큐 등록 실패",
              description: retryErrorMessage,
              variant: "destructive",
              duration: 6000,
            });
          } else {
            const isRequestApproveFromTab =
              params.status === "APPROVED" &&
              stageKey === "request" &&
              triggerSource === "worksheet-tab";
            const reusedExistingNc = body?.meta?.reusedExistingNc === true;
            toast({
              title: isRequestApproveFromTab
                ? reusedExistingNc
                  ? "작업 탭 승인: 기존 NC 재사용으로 가공 이동"
                  : "작업 탭 승인: 기존 이력 우선 처리"
                : "중복 승인 요청",
              description: isRequestApproveFromTab
                ? reusedExistingNc
                  ? "기존 NC 작업을 재사용해 BG 재생성 없이 가공 단계로 이동했습니다."
                  : "작업 탭 승인에서는 기존 작업 재사용 가능 시 가공으로 넘기고, 재사용 불가 시 BG 재처리를 진행합니다."
                : responseMessage || "이미 승인 접수된 건입니다.",
              duration: 5000,
            });
          }
        } else {
          const camRunTriggered = body?.meta?.camRunTriggered === true;
          const camRunTriggerErrorMessage = String(
            body?.meta?.camRunTriggerErrorMessage || "",
          ).trim();
          const camRunAlreadyQueued = body?.meta?.camRunAlreadyQueued === true;

          const successTitle =
            camRunTriggered &&
            params.status === "APPROVED" &&
            (stageKey === "machining" || stageKey === "cam")
              ? "CAM 실행"
              : "검토 상태 변경 완료";
          const successDescription =
            params.status === "APPROVED"
              ? stageKey === "request"
                ? "의뢰 승인으로 처리했습니다. 기존 작업 이력이 재사용 가능하면 가공으로 넘기고, 불가하면 BG를 재처리합니다."
                : stageKey === "cam" || stageKey === "machining"
                  ? camRunTriggered
                    ? camRunAlreadyQueued
                      ? "가공 Next Up으로 이동했고, NC 코드 메타데이터가 없어 기존 CAM 실행 대기열을 재사용합니다."
                      : "가공 Next Up으로 이동했고, NC 코드 메타데이터가 없어 CAM 실행을 시작했습니다."
                    : camRunTriggerErrorMessage
                      ? `가공 Next Up으로 이동했지만 CAM 실행 요청에 실패했습니다: ${camRunTriggerErrorMessage}`
                      : "작업 명령이 접수되었습니다. 처리 완료 후 상태가 자동으로 업데이트됩니다."
                  : stageKey === "packing"
                    ? "포장.발송으로 이동했습니다."
                    : "승인되었습니다."
              : params.status === "REJECTED"
                ? "반려되었습니다."
                : stageKey === "packing"
                  ? String(params.req?.mailboxAddress || "").trim()
                    ? `가공 단계로 되돌렸습니다. 우편함 ${String(params.req.mailboxAddress).trim()}은 유지됩니다. 패킹 라벨이 있으면 같은 칸으로 재진입합니다.`
                    : "가공 단계로 되돌렸습니다."
                : "미승인 상태로 변경되었습니다.";

          // 성공 시에만 안내 토스트 표시
          toast({
            title: successTitle,
            description: successDescription,
            duration: 3000, // 성공 토스트는 3초 후 자동 소멸
            variant:
              camRunTriggerErrorMessage &&
              params.status === "APPROVED" &&
              (stageKey === "machining" || stageKey === "cam")
                ? "destructive"
                : undefined,
          });
        }

        if (params.status === "APPROVED") {
          // 자동 탭 이동을 막기 위해 stage 변경을 하지 않는다.
          // 필요 시 수동으로 탭 전환하도록 유지
        }

        // 검증 재조회는 coalesced/silent 방식으로 1회만 수행한다.
        scheduleWorksheetSummaryVerifyRefetch();

        if (!params.keepPreviewOpen) {
          setPreviewOpen(false);
        }
      } catch (error) {
        const errorMessage =
          (error as Error)?.message || "잠시 후 다시 시도해주세요.";
        const errorAny = error as any;



        if (
          errorAny?.statusCode === 402 &&
          errorAny?.payload?.reason === "insufficient_credit_for_shipping"
        ) {
          const nextRequest = {
            ...params.req,
            shippingCreditMeta: {
              insufficient: true,
              required: Number(errorAny?.payload?.required || 0) || null,
              paidBalance: Number(errorAny?.payload?.paidBalance || 0) || null,
              freeShippingCreditBalance:
                Number(errorAny?.payload?.freeShippingCreditBalance || 0) ||
                null,
              reason: String(errorAny?.payload?.reason || "").trim() || null,
            },
          } as ManufacturerRequest;
          applySingleRequestPatch(nextRequest);
        }
        toast({
          title: "검토 상태 변경 실패",
          description:
            errorAny?.statusCode === 402 &&
            errorAny?.payload?.reason === "insufficient_credit_for_shipping"
              ? "배송비 부족으로 포장.발송 단계로 이동할 수 없습니다."
              : errorAny?.statusCode === 402 &&
                  errorMessage.includes("의뢰자 잔액 부족")
                ? "의뢰자 잔액 부족으로 가공 진입 불가"
                : errorMessage,
          variant: "destructive",
          duration: 5000,
        });
      } finally {
        setReviewSaving(false);
      }
    },
    [
      token,
      stage,
      toast,
      applySingleRequestPatch,
      fetchRequests,
      isCamStage,
      isMachiningStage,
      patchReviewStatusLocally,
      setPreviewOpen,
      setRequests,
      setReviewSaving,
      scheduleWorksheetSummaryVerifyRefetch,
    ],
  );

  const handleDeleteCam = useCallback(
    async (
      req: ManufacturerRequest,
      opts?: { rollbackOnly?: boolean; navigate?: boolean },
    ) => {
      if (!token) return;
      setDeletingCam((prev) => ({ ...prev, [req._id]: true }));
      const rollbackOnly = !!opts?.rollbackOnly;
      const navigate = opts?.navigate !== false;
      const updatedRequest = {
        ...req,
        caseInfos: {
          ...req.caseInfos,
          ...patchFilledStlFile(undefined), // stlFile + legacy camFile clear
          reviewByStage: rollbackOnly
            ? {
                ...req.caseInfos?.reviewByStage,
                cam: {
                  ...req.caseInfos?.reviewByStage?.cam,
                  status: "PENDING",
                  updatedAt: new Date().toISOString(),
                  reason: "",
                },
              }
            : req.caseInfos?.reviewByStage,
        },
        manufacturerStage: "준비",
        mailboxAddress: null,
      } as ManufacturerRequest;
      const optimisticallyPatched = applySingleRequestPatch(updatedRequest);
      if (!optimisticallyPatched) {
        removeSingleRequest(req);
      }
      applyWorksheetSummaryCounterDelta("cam", "PENDING", 1);

      try {
        const res = await fetch(
          `/api/requests/${req._id}/cam-file${
            rollbackOnly ? "?rollbackOnly=1" : ""
          }`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (!res.ok) {
          throw new Error("delete cam file failed");
        }

        toast({
          title: "롤백 완료",
          description: "의뢰 단계로 되돌렸습니다.",
        });

        scheduleWorksheetSummaryVerifyRefetch();

        if (navigate) {
          setPreviewOpen(false);
          setPreviewFiles({});
          setPreviewNcText("");
          setPreviewNcName("");
        }
      } catch (error) {
        applySingleRequestPatch(req);
        applyWorksheetSummaryCounterDelta("cam", "PENDING", -1);
        toast({
          title: "삭제 실패",
          description: "CAM 수정본 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setDeletingCam((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [
      token,
      toast,
      applySingleRequestPatch,
      removeSingleRequest,
      setDeletingCam,
      setPreviewOpen,
      setPreviewFiles,
      setPreviewNcText,
      setPreviewNcName,
      applyWorksheetSummaryCounterDelta,
      scheduleWorksheetSummaryVerifyRefetch,
    ],
  );

  const handleDeleteNc = useCallback(
    async (
      req: ManufacturerRequest,
      opts?: { nextStage?: string; rollbackOnly?: boolean; navigate?: boolean },
    ) => {
      if (!token) return;
      setDeletingNc((prev) => ({ ...prev, [req._id]: true }));
      const targetStage = opts?.nextStage || "cam";
      const rollbackOnly = !!opts?.rollbackOnly;
      const navigate = opts?.navigate !== false;

      const rollbackPendingToast =
        rollbackOnly && targetStage === "request"
          ? toast({
              title: "준비 롤백 요청 전송됨",
              description:
                "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
              duration: 3000,
              skipDuplicateCheck: true,
            })
          : null;

      const updatedRequest = {
        ...req,
        caseInfos: {
          ...req.caseInfos,
          ...(rollbackOnly ? {} : { ncFile: undefined }),
          reviewByStage: rollbackOnly
            ? {
                ...req.caseInfos?.reviewByStage,
                machining: {
                  status: "PENDING",
                  updatedAt: new Date().toISOString(),
                  reason: "",
                },
              }
            : req.caseInfos?.reviewByStage,
        },
        manufacturerStage: targetStage === "request" ? "준비" : "가공",
        ...(targetStage === "request" ? { mailboxAddress: null } : {}),
      } as ManufacturerRequest;
      const optimisticallyPatched = applySingleRequestPatch(updatedRequest);
      if (!optimisticallyPatched) {
        removeSingleRequest(req);
      }

      const rollbackStageKeyForSummary =
        targetStage === "request" ? "cam" : "machining";
      applyWorksheetSummaryCounterDelta(rollbackStageKeyForSummary, "PENDING", 1);

      try {
        const endpoint = `/api/requests/${req._id}/nc-file?nextStage=${targetStage}${
          rollbackOnly ? "&rollbackOnly=1" : ""
        }`;

        console.log("[ROLLBACK_TRACE][FE][NC] request", {
          requestMongoId: String(req._id || ""),
          requestId: String(req.requestId || ""),
          endpoint,
          targetStage,
          rollbackOnly,
        });

        const res = await fetch(endpoint, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const body = await res.json().catch(() => null);
        console.log("[ROLLBACK_TRACE][FE][NC] response", {
          requestMongoId: String(req._id || ""),
          requestId: String(req.requestId || ""),
          status: res.status,
          ok: res.ok,
          body,
        });

        if (!res.ok || (body && body.success === false)) {
          throw new Error((body && body.message) || "delete nc file failed");
        }
        if (rollbackPendingToast?.id) {
          dismiss(rollbackPendingToast.id);
        }

        const stageLabel = targetStage === "request" ? "준비" : "가공";
        toast({
          title: "롤백 완료",
          description: `${stageLabel} 단계로 되돌렸습니다.`,
        });

        setPreviewFiles((prev) => {
          const prevState =
            prev && typeof prev === "object"
              ? (prev as Record<string, unknown>)
              : null;
          if (!prevState) return prev;

          const prevReq = (prevState.request || null) as ManufacturerRequest | null;
          if (!prevReq) return prev;

          const prevMongoId = String(prevReq?._id || "").trim();
          const targetMongoId = String(req?._id || "").trim();
          if (!prevMongoId || !targetMongoId || prevMongoId !== targetMongoId) {
            return prev;
          }

          const responseData =
            body?.data && typeof body.data === "object"
              ? (body.data as ManufacturerRequest)
              : null;
          const nextRequest = responseData
            ? ({
                ...updatedRequest,
                ...responseData,
                caseInfos: {
                  ...(updatedRequest.caseInfos || {}),
                  ...(responseData.caseInfos || {}),
                },
              } as ManufacturerRequest)
            : updatedRequest;

          return {
            ...prevState,
            request: nextRequest,
          };
        });

        scheduleWorksheetSummaryVerifyRefetch();

        if (!setRequests) {
          await fetchRequests();
        }

        if (navigate) {
          setPreviewOpen(false);
          setPreviewNcText("");
          setPreviewNcName("");
          setPreviewFiles({});
        }
      } catch (error) {
        if (rollbackPendingToast?.id) {
          dismiss(rollbackPendingToast.id);
        }
        applyWorksheetSummaryCounterDelta(rollbackStageKeyForSummary, "PENDING", -1);
        console.error("[ROLLBACK_TRACE][FE][NC] error", {
          requestMongoId: String(req._id || ""),
          requestId: String(req.requestId || ""),
          error: error instanceof Error ? error.message : String(error || ""),
        });
        applySingleRequestPatch(req);
        toast({
          title: "삭제 실패",
          description: "NC 파일 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setDeletingNc((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [
      token,
      toast,
      applySingleRequestPatch,
      removeSingleRequest,
      setDeletingNc,
      setPreviewOpen,
      setPreviewNcText,
      setPreviewNcName,
      setPreviewFiles,
      applyWorksheetSummaryCounterDelta,
      scheduleWorksheetSummaryVerifyRefetch,
      dismiss,
      fetchRequests,
      setRequests,
    ],
  );

  const handleUploadCam = useCallback(
    async (req: ManufacturerRequest, files: File[]) => {
      if (!token) return;
      const normalize = (name: string) =>
        name.trim().toLowerCase().normalize("NFC");
      const originalName =
        req.caseInfos?.file?.filePath ||
        req.caseInfos?.file?.originalName ||
        "";
      const originalBase = originalName
        .replace(/(\.cam\.stl|\.stl)$/i, "")
        .trim();
      const expectedCamName = originalBase ? `${originalBase}.cam.stl` : "";

      const filtered = files.filter((f) =>
        f.name.toLowerCase().endsWith(".cam.stl"),
      );
      if (!filtered.length) {
        toast({
          title: "업로드 실패",
          description: "CAM 파일(.cam.stl)만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }
      if (expectedCamName) {
        const mismatch = filtered.some(
          (f) => normalize(f.name) !== normalize(expectedCamName),
        );
        if (mismatch) {
          toast({
            title: "파일명 불일치",
            description: `CAM 파일명은 ${expectedCamName} 으로 업로드해주세요.`,
            variant: "destructive",
          });
          return;
        }
      }

      setUploading((prev) => ({ ...prev, [req._id]: true }));
      setUploadProgress((prev) => ({ ...prev, [req._id]: 0 }));
      try {
        const uploaded = await uploadFiles(filtered, (p) => {
          if (p[filtered[0].name] !== undefined) {
            setUploadProgress((prev) => ({
              ...prev,
              [req._id]: p[filtered[0].name],
            }));
          }
        });
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }
        const first = uploaded[0];
        const finalFileName = expectedCamName || first.originalName;
        const res = await fetch(`/api/requests/${req._id}/cam-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: finalFileName,
            filePath: finalFileName,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
          }),
        });
        if (!res.ok) {
          let message = "CAM 파일 저장에 실패했습니다.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errorData = await res.json();
              if (errorData?.message) message = String(errorData.message);
            } else {
              const text = await res.text();
              if (text) message = text;
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }
        // CAM 파일 업로드 성공 시 NC 캐시 무효화 (CAM 업로드 시 NC도 재생성되므로)
        const ncS3Key = req?.caseInfos?.ncFile?.s3Key;
        if (ncS3Key) {
          await deleteCncProgramCache(ncS3Key);
        }

        toast({
          title: "업로드 완료",
          description: "CAM STL이 저장되었습니다.",
        });
        await fetchRequests();

        setPreviewFiles((prev: any) => ({
          ...prev,
          cam: filtered[0] || prev.cam,
        }));
        setPreviewNcName(finalFileName);
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description:
            (error as Error)?.message ||
            "파일 업로드 또는 저장에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[req._id];
          return next;
        });
      }
    },
    [
      token,
      uploadFiles,
      toast,
      fetchRequests,
      setUploading,
      setUploadProgress,
      setPreviewFiles,
      setPreviewNcName,
    ],
  );

  const handleUploadNc = useCallback(
    async (req: ManufacturerRequest, files: File[]) => {
      if (!token) return;

      const filtered = files.filter((f) =>
        f.name.toLowerCase().endsWith(".nc"),
      );
      if (!filtered.length) {
        toast({
          title: "업로드 실패",
          description: "NC(.nc) 파일만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const firstLocal = filtered[0];

      const parseMaterialDiameterFromNc = (text: string) => {
        const s = String(text || "");
        const matches = Array.from(
          s.matchAll(/#521\s*=\s*([0-9]+(?:\.[0-9]+)?)/gi),
        );
        if (!matches.length) return null;
        const last = matches[matches.length - 1];
        const raw = last?.[1];
        if (!raw) return null;
        const v = Number(raw);
        if (!Number.isFinite(v) || v <= 0) return null;
        return v;
      };

      setUploading((prev) => ({ ...prev, [req._id]: true }));
      setUploadProgress((prev) => ({ ...prev, [req._id]: 0 }));
      try {
        let localNcText = "";
        let localMaterialDiameter: number | null = null;
        try {
          const buf = await firstLocal.arrayBuffer();
          localNcText = decodeNcText(buf);
          localMaterialDiameter = parseMaterialDiameterFromNc(localNcText);
        } catch {
          // ignore
        }

        const uploaded = await uploadFiles([firstLocal], (p) => {
          if (p[firstLocal.name] !== undefined) {
            setUploadProgress((prev) => ({
              ...prev,
              [req._id]: p[firstLocal.name],
            }));
          }
        });
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }
        const first = uploaded[0];
        const res = await fetch(`/api/requests/${req._id}/nc-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: firstLocal.name,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
            materialDiameter: localMaterialDiameter,
          }),
        });
        if (!res.ok) {
          let message = "NC 파일 저장에 실패했습니다.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errorData = await res.json();
              if (errorData?.message) message = String(errorData.message);
            } else {
              const text = await res.text();
              if (text) message = text;
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }
        // NC 파일 업로드 성공 시 캐시 무효화
        if (first.key) {
          await deleteCncProgramCache(first.key);
        }

        toast({
          title: "업로드 완료",
          description: "NC 파일을 업로드했습니다.",
        });
        await fetchRequests();

        if (localNcText) {
          setPreviewNcText(localNcText);
          setPreviewNcName(firstLocal.name);
        }
      } catch (error: any) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: error.message || "NC 파일 업로드에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[req._id];
          return next;
        });
      }
    },
    [
      token,
      uploadFiles,
      toast,
      fetchRequests,
      decodeNcText,
      setUploading,
      setUploadProgress,
      setPreviewNcText,
      setPreviewNcName,
    ],
  );

  const handleUploadStageFile = useCallback(
    async (params: {
      req: ManufacturerRequest;
      stage: "machining" | "packing" | "shipping" | "tracking";
      file: File;
      source: "manual" | "worker";
    }) => {
      if (!token) return;
      if (!params.req?._id) return;

      setUploading((prev) => ({ ...prev, [params.req._id as string]: true }));
      setUploadProgress((prev) => ({
        ...prev,
        [params.req._id as string]: 0,
      }));
      try {
        const uploaded = await uploadFiles([params.file], (p) => {
          if (p[params.file.name] !== undefined) {
            setUploadProgress((prev) => ({
              ...prev,
              [params.req._id as string]: p[params.file.name],
            }));
          }
        });
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }

        const first = uploaded[0];
        const res = await fetch(`/api/requests/${params.req._id}/stage-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stage: params.stage,
            fileName: first.originalName,
            filePath: first.originalName,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
            source: params.source,
          }),
        });

        if (!res.ok) {
          let message = "파일 저장에 실패했습니다.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errorData = await res.json();
              if (errorData?.message) message = String(errorData.message);
            } else {
              const text = await res.text();
              if (text) message = text;
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        toast({
          title: "업로드 완료",
          description: "파일이 저장되었습니다.",
        });
        const body = await res
          .clone()
          .json()
          .catch(() => null);
        const updatedRequest = (body?.data ||
          null) as ManufacturerRequest | null;
        const patched = applySingleRequestPatch(updatedRequest);
        if (!patched) {
          await fetchRequests();
        }

        if (params.stage === "machining" || params.stage === "packing") {
          try {
            setPreviewStageUrl(URL.createObjectURL(params.file));
            setPreviewStageName(params.file.name);
          } catch {
            // ignore
          }
        }
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: "파일 업로드 또는 저장에 실패했습니다.",
          variant: "destructive",
        });
        throw error;
      } finally {
        setUploading((prev) => ({
          ...prev,
          [params.req._id as string]: false,
        }));
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[params.req._id as string];
          return next;
        });
      }
    },
    [
      token,
      uploadFiles,
      toast,
      fetchRequests,
      applySingleRequestPatch,
      setUploading,
      setUploadProgress,
      setPreviewStageUrl,
      setPreviewStageName,
    ],
  );

  const handleDeleteStageFile = useCallback(
    async (params: {
      req: ManufacturerRequest;
      stage: "machining" | "packing" | "shipping" | "tracking";
      rollbackOnly?: boolean;
      navigate?: boolean;
      preserveStage?: boolean;
    }) => {
      if (!token) return;
      if (!params.req?._id) return;

      const rollbackOnly = !!params.rollbackOnly;
      const navigate = params.navigate !== false;
      const preserveStage = !!params.preserveStage;

      setUploading((prev) => ({ ...prev, [params.req._id as string]: true }));
      const updatedRequest = patchDeleteStageFileLocally(
        params.req,
        params.stage,
        rollbackOnly,
      );
      const optimisticallyPatched = applySingleRequestPatch(updatedRequest);
      if (!optimisticallyPatched) {
        removeSingleRequest(params.req);
      }

      const rollbackStageKeyForSummary = params.stage as ReviewStageKey;
      const shouldApplyOptimisticSummaryDelta = rollbackOnly;
      if (shouldApplyOptimisticSummaryDelta) {
        applyWorksheetSummaryCounterDelta(rollbackStageKeyForSummary, "PENDING", 1);
      }

      const rollbackPendingToast =
        rollbackOnly && params.stage === "machining"
          ? toast({
              title: "준비 롤백 요청 전송됨",
              description:
                "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
              duration: 3000,
              skipDuplicateCheck: true,
            })
          : null;

      try {
        const endpoint = `/api/requests/${
          params.req._id
        }/stage-file?stage=${encodeURIComponent(params.stage)}${
          rollbackOnly ? "&rollbackOnly=1" : ""
        }${preserveStage ? "&preserveStage=1" : ""}`;

        console.log("[ROLLBACK_TRACE][FE][STAGE_FILE] request", {
          requestMongoId: String(params.req._id || ""),
          requestId: String(params.req.requestId || ""),
          endpoint,
          stage: params.stage,
          rollbackOnly,
          preserveStage,
        });

        const res = await fetch(endpoint, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const body = await res.json().catch(() => ({}));
        console.log("[ROLLBACK_TRACE][FE][STAGE_FILE] response", {
          requestMongoId: String(params.req._id || ""),
          requestId: String(params.req.requestId || ""),
          status: res.status,
          ok: res.ok,
          body,
        });

        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "delete stage file failed");
        }

        const updatedFromServer =
          body?.data && typeof body.data === "object"
            ? (body.data as ManufacturerRequest)
            : null;

        const mergedRequest = updatedFromServer
          ? ({
              ...updatedRequest,
              ...updatedFromServer,
              caseInfos: {
                ...(updatedRequest.caseInfos || {}),
                ...(updatedFromServer.caseInfos || {}),
              },
            } as ManufacturerRequest)
          : null;

        if (mergedRequest) {
          applySingleRequestPatch(mergedRequest);
        }

        setPreviewFiles((prev) => {
          const prevState =
            prev && typeof prev === "object"
              ? (prev as Record<string, unknown>)
              : null;
          if (!prevState) return prev;

          const prevReq = (prevState.request || null) as ManufacturerRequest | null;
          if (!prevReq) return prev;

          const prevMongoId = String(prevReq?._id || "").trim();
          const targetMongoId = String(params.req?._id || "").trim();
          if (!prevMongoId || !targetMongoId || prevMongoId !== targetMongoId) {
            return prev;
          }

          const baseRequest = mergedRequest
            ? {
                ...prevReq,
                ...mergedRequest,
                caseInfos: {
                  ...(prevReq.caseInfos || {}),
                  ...(mergedRequest.caseInfos || {}),
                },
              }
            : updatedRequest;

          const nextRequest = { ...baseRequest } as ManufacturerRequest;
          if (!rollbackOnly) {
            const nextStageFiles = {
              ...(nextRequest.caseInfos?.stageFiles || {}),
            } as Record<string, unknown>;
            delete nextStageFiles[params.stage];
            nextRequest.caseInfos = {
              ...(nextRequest.caseInfos || {}),
              stageFiles: nextStageFiles,
            };
          }

          return {
            ...prevState,
            request: nextRequest,
          };
        });

        scheduleWorksheetSummaryVerifyRefetch();

        if (rollbackPendingToast?.id) {
          dismiss(rollbackPendingToast.id);
        }

        toast(
          rollbackOnly
            ? {
                title: "롤백 완료",
                description:
                  params.stage === "packing" &&
                  String(params.req?.mailboxAddress || "").trim()
                    ? `가공 단계로 되돌렸습니다. 우편함 ${String(params.req.mailboxAddress).trim()}은 유지됩니다. 패킹 라벨이 있으면 같은 칸으로 재진입합니다.`
                    : "공정 단계를 되돌렸습니다.",
              }
            : {
                title: "삭제 완료",
                description: "파일을 삭제했습니다.",
              },
        );

        if (!rollbackOnly) {
          // stage 이미지 삭제 후에는 프리뷰 URL/파일명을 즉시 비운다.
          setPreviewStageUrl("");
          setPreviewStageName("");
        }

        if (navigate) {
          setPreviewOpen(false);
          setPreviewFiles({});
        }
      } catch (error) {
        if (rollbackPendingToast?.id) {
          dismiss(rollbackPendingToast.id);
        }
        if (shouldApplyOptimisticSummaryDelta) {
          applyWorksheetSummaryCounterDelta(rollbackStageKeyForSummary, "PENDING", -1);
        }
        console.error("[ROLLBACK_TRACE][FE][STAGE_FILE] error", {
          requestMongoId: String(params.req?._id || ""),
          requestId: String(params.req?.requestId || ""),
          stage: params.stage,
          rollbackOnly,
          preserveStage,
          error: error instanceof Error ? error.message : String(error || ""),
        });
        applySingleRequestPatch(params.req);
        toast({
          title: rollbackOnly ? "롤백 실패" : "삭제 실패",
          description: rollbackOnly
            ? "공정 롤백에 실패했습니다."
            : "파일 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({
          ...prev,
          [params.req._id as string]: false,
        }));
      }
    },
    [
      token,
      toast,
      applySingleRequestPatch,
      patchDeleteStageFileLocally,
      removeSingleRequest,
      setUploading,
      setPreviewOpen,
      setPreviewFiles,
      setPreviewStageUrl,
      setPreviewStageName,
      applyWorksheetSummaryCounterDelta,
      scheduleWorksheetSummaryVerifyRefetch,
      dismiss,
    ],
  );

  return {
    handleDownloadOriginalStl,
    handleDownloadCamStl,
    handleDownloadNcFile,
    handleDownloadStageFile,
    handleUpdateReviewStatus,
    handleDeleteCam,
    handleDeleteNc,
    handleUploadCam,
    handleUploadNc,
    handleUploadStageFile,
    handleDeleteStageFile,
  };
};
