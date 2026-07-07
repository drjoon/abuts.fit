import {
  useMemo,
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { type DiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import { WorksheetQueueSummary } from "@/shared/ui/dashboard/WorksheetQueueSummary";
import { useToast } from "@/shared/hooks/use-toast";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  type ManufacturerRequest,
  deriveStageForFilter,
  stageOrder,
  getDiameterBucketIndex,
  getReviewStageKeyByTab,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  filterRequestsByStage,
  filterAndSortRequests,
  mergeTransientRealtimeProgress,
  isPrePickupShippingVisible,
  shouldShowRequestInIncludeCompleted,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";
import {
  usePagination,
  useInfiniteScroll,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestPagination";
import {
  MailboxGrid,
  type MailboxSummaryItem,
} from "../shipping/components/MailboxGrid";
import { MailboxContentsModal } from "../shipping/components/MailboxContentsModal";
import { WorksheetCardGrid } from "./WorksheetCardGrid";
import { MachiningQueueBoard } from "../machining/MachiningQueueBoard";
import { PreviewModal } from "./PreviewModal";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import { usePreviewLoader } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useStageDropHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useStageDropHandlers";
import { useWorksheetRealtimeStatus } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus";
import { useRequestPageState } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestPageState";
import { useMailboxManagement } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useMailboxManagement";
import { useRequestCardHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestCardHandlers";
import { useCardActions } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useCardActions";
import { useRequestFiltering } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFiltering";
// useRequestNavigation 제거: 승인 후 다음 의뢰 자동 열기 방지 정책에 따라 미사용
import { usePackingSelection } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePackingSelection";
import { useMailboxSync } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useMailboxSync";
import { useDiameterQueue } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useDiameterQueue";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RemakeStartStage = "의뢰" | "CAM" | "가공";

export const RequestPage = ({
  showQueueBar = true,
  filterRequests,
}: {
  showQueueBar?: boolean;
  filterRequests?: (req: ManufacturerRequest) => boolean;
}) => {
  const queryClient = useQueryClient();
  const { user, token } = useAuthStore();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCamStage = (searchParams.get("stage") || "request") === "cam";
  const isMachiningStage =
    (searchParams.get("stage") || "request") === "machining";
  const tabStage = String(searchParams.get("stage") || "request").trim();

  const DEFAULT_PAGE_LIMIT = 12;
  const SHIPPING_PAGE_LIMIT = 200;
  const effectivePageLimit =
    tabStage === "shipping" ? SHIPPING_PAGE_LIMIT : DEFAULT_PAGE_LIMIT;

  const pageState = useRequestPageState();
  const [mailboxSummaries, setMailboxSummaries] = useState<
    MailboxSummaryItem[]
  >([]);
  const mailboxSummarySnapshotRef = useRef<{
    fetchedAt: number;
    payload: { mailboxes: MailboxSummaryItem[]; totalRequests: number };
  } | null>(null);
  const mailboxSummaryInFlightRef = useRef<Promise<{
    success: boolean;
    data: { mailboxes: MailboxSummaryItem[]; totalRequests: number };
  }> | null>(null);

  const decodeNcText = useCallback((buffer: ArrayBuffer) => {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
    const utf8Text = utf8Decoder.decode(buffer);
    if (!utf8Text.includes("\uFFFD")) return utf8Text;
    try {
      const eucKrDecoder = new TextDecoder("euc-kr", { fatal: false });
      return eucKrDecoder.decode(buffer);
    } catch (error) {
      console.error("Error decoding NC text:", error);
      return utf8Text;
    }
  }, []);

  const { toast } = useToast();

  const fetchRequestsCore = useCallback(
    async (
      silent = false,
      append = false,
      options?: { forceMailboxRefresh?: boolean },
    ) => {
      if (!token) return null;

      try {
        if (!silent) pageState.setIsLoading(true);
        const basePath =
          user?.role === "admin"
            ? "/api/admin/requests"
            : user?.role === "manufacturer"
              ? "/api/requests/all"
              : "/api/requests";
        const stageFilterForTab = (() => {
          if (tabStage === "request")
            return showCompleted
              ? ["의뢰", "CAM", "가공", "세척.패킹", "포장.발송", "추적관리"]
              : ["의뢰"];
          if (isCamStage)
            return showCompleted
              ? ["CAM", "가공", "세척.패킹", "포장.발송", "추적관리"]
              : ["CAM"];
          if (isMachiningStage)
            return showCompleted
              ? ["가공", "세척.패킹", "포장.발송", "추적관리"]
              : ["가공"];
          if (tabStage === "packing")
            return showCompleted
              ? ["세척.패킹", "포장.발송", "추적관리"]
              : ["세척.패킹"];
          if (tabStage === "shipping")
            return showCompleted ? ["포장.발송", "추적관리"] : ["포장.발송"];
          if (tabStage === "tracking") return ["추적관리"];
          if (tabStage === "rnd") return [] as string[];
          return [] as string[];
        })();

        if (tabStage === "shipping") {
          if (append) {
            pageState.hasMoreRefForCore.current = false;
            hasMoreRef.current = false;
            return [] as ManufacturerRequest[];
          }

          const applySummaryPayload = (payload: {
            mailboxes: MailboxSummaryItem[];
            totalRequests: number;
          }) => {
            const mailboxList = Array.isArray(payload?.mailboxes)
              ? payload.mailboxes
              : [];
            setMailboxSummaries(mailboxList);
            pageState.setRequests([]);

            pageState.setServerTotal(
              Number.isFinite(payload?.totalRequests)
                ? Number(payload.totalRequests)
                : mailboxList.reduce(
                    (acc, item) => acc + Number(item?.requestCount || 0),
                    0,
                  ),
            );

            pageState.hasMoreRefForCore.current = false;
            hasMoreRef.current = false;
          };

          const summaryCache = mailboxSummarySnapshotRef.current;
          const nowTs = Date.now();
          const CLIENT_CACHE_TTL_MS = 60 * 60 * 1000;
          if (
            !options?.forceMailboxRefresh &&
            summaryCache &&
            nowTs - summaryCache.fetchedAt <= CLIENT_CACHE_TTL_MS
          ) {
            applySummaryPayload(summaryCache.payload);
            return [] as ManufacturerRequest[];
          }

          if (!mailboxSummaryInFlightRef.current) {
            mailboxSummaryInFlightRef.current = (async () => {
              const summaryUrl = options?.forceMailboxRefresh
                ? `/api/requests/shipping/mailbox-summary?refresh=1&t=${Date.now()}`
                : "/api/requests/shipping/mailbox-summary";
              const summaryRes = await fetch(summaryUrl, {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (summaryRes.status === 304) {
                if (mailboxSummarySnapshotRef.current?.payload) {
                  return {
                    success: true,
                    data: mailboxSummarySnapshotRef.current.payload,
                  };
                }
                throw new Error("우편함 요약 캐시를 찾지 못했습니다.");
              }

              const summaryJson = await summaryRes.json().catch(() => ({}));
              if (!summaryRes.ok || !summaryJson?.success) {
                throw new Error("우편함 요약 불러오기에 실패했습니다.");
              }
              return summaryJson;
            })().finally(() => {
              mailboxSummaryInFlightRef.current = null;
            });
          }

          try {
            const summaryJson = await mailboxSummaryInFlightRef.current;
            const payload = {
              mailboxes: Array.isArray(summaryJson?.data?.mailboxes)
                ? (summaryJson.data.mailboxes as MailboxSummaryItem[])
                : [],
              totalRequests: Number(summaryJson?.data?.totalRequests || 0),
            };
            mailboxSummarySnapshotRef.current = {
              fetchedAt: Date.now(),
              payload,
            };
            applySummaryPayload(payload);
          } catch {
            toast({
              title: "우편함 요약 불러오기 실패",
              description: "잠시 후 다시 시도해주세요.",
              variant: "destructive",
            });
            return null;
          }

          if (!silent) {
            void queryClient.invalidateQueries({
              queryKey: ["worksheet-assigned-summary"],
            });
            void queryClient.refetchQueries({
              queryKey: ["worksheet-assigned-summary"],
              type: "active",
            });
          }

          return [] as ManufacturerRequest[];
        }

        setMailboxSummaries([]);

        const buildPath = (targetPage: number) => {
          const url = new URL(basePath, window.location.origin);
          url.searchParams.set("page", String(targetPage));
          url.searchParams.set("limit", String(effectivePageLimit));
          url.searchParams.set("view", "worksheet");
          if (tabStage === "shipping") {
            url.searchParams.set("worksheetProfile", "shipping");
          }
          if (tabStage === "rnd") {
            url.searchParams.set("source", "manufacturer_sample");
            url.searchParams.set("rndDone", "1");
          } else {
            url.searchParams.set("rndDone", "0");
          }
          url.searchParams.set("includeTotal", append ? "0" : "1");
          if (tabStage === "shipping" || tabStage === "tracking") {
            url.searchParams.set("includeDelivery", "1");
          }
          if (stageFilterForTab.length === 1) {
            url.searchParams.set("manufacturerStage", stageFilterForTab[0]);
          } else if (stageFilterForTab.length > 1) {
            for (const stage of stageFilterForTab) {
              url.searchParams.append("manufacturerStageIn", stage);
            }
          }
          return url.pathname + url.search;
        };

        const fetchPage = async (targetPage: number) => {
          const res = await fetch(buildPath(targetPage), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          });

          if (!res.ok) {
            return {
              ok: false,
              list: [] as ManufacturerRequest[],
              total: null,
            };
          }

          const data = await res.json();
          const raw = data?.data;
          const pageList = Array.isArray(raw?.requests)
            ? raw.requests
            : Array.isArray(raw)
              ? raw
              : [];
          const total =
            typeof raw?.pagination?.total === "number"
              ? raw.pagination.total
              : null;

          return {
            ok: Boolean(data?.success),
            list: pageList as ManufacturerRequest[],
            total,
          };
        };

        const firstPage = await fetchPage(pageRef.current);
        if (!firstPage.ok) {
          toast({
            title: "의뢰 불러오기 실패",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
          return null;
        }

        let list = firstPage.list;
        let totalFromServer = firstPage.total;

        if (tabStage === "shipping" && !append) {
          let currentPage = pageRef.current;
          let merged = [...firstPage.list];
          let lastBatchSize = firstPage.list.length;

          while (lastBatchSize >= effectivePageLimit) {
            currentPage += 1;
            const nextPage = await fetchPage(currentPage);
            if (!nextPage.ok || !nextPage.list.length) {
              break;
            }
            merged = merged.concat(nextPage.list);
            lastBatchSize = nextPage.list.length;
            if (typeof nextPage.total === "number") {
              totalFromServer = nextPage.total;
            }
          }

          list = merged;
        }

        if (Array.isArray(list)) {
          if (!append && typeof totalFromServer === "number") {
            pageState.setServerTotal(totalFromServer);
          }
          if (append) {
            pageState.setRequests((prev) => {
              const map = new Map<string, any>();
              for (const r of prev)
                map.set(
                  String(
                    (r as any)?._id || (r as any)?.requestId || Math.random(),
                  ),
                  r,
                );
              for (const r of list)
                map.set(
                  String(
                    (r as any)?._id || (r as any)?.requestId || Math.random(),
                  ),
                  r,
                );
              return mergeTransientRealtimeProgress(
                prev,
                Array.from(map.values()) as any[],
              );
            });
          } else {
            // append=false: 페이지 새로고침이므로 prev를 무시하고 list만 사용
            // realtimeProgress만 prev에서 복원
            pageState.setRequests((prev) =>
              mergeTransientRealtimeProgress(
                prev,
                list as ManufacturerRequest[],
              ),
            );
          }
          if (tabStage === "shipping" && !append) {
            pageState.hasMoreRefForCore.current = false;
            hasMoreRef.current = false;
          } else {
            pageState.hasMoreRefForCore.current =
              list.length >= effectivePageLimit;
            hasMoreRef.current = list.length >= effectivePageLimit;
          }
          if (append && list.length > 0) {
            pageState.setVisibleCount((prev) => prev + list.length);
          }

          // 상단 워크시트 요약(assigned/dashboard-summary) 호출 정책:
          // - 최초 페이지 로드(append=false && silent=false) 1회
          // - 무한스크롤 추가 로드(append=true) 시 1회
          // - 실시간 동기화용 조용한 리로드(append=false && silent=true)는 호출하지 않음
          const shouldRefreshWorksheetSummary = append || !silent;
          if (shouldRefreshWorksheetSummary) {
            void queryClient.invalidateQueries({
              queryKey: ["worksheet-assigned-summary"],
            });
            void queryClient.refetchQueries({
              queryKey: ["worksheet-assigned-summary"],
              type: "active",
            });
          }
        } else {
          pageState.hasMoreRefForCore.current = false;
          hasMoreRef.current = false;
        }

        return list as ManufacturerRequest[];
      } catch (error) {
        console.error("Error fetching requests:", error);
        pageState.hasMoreRefForCore.current = false;
        hasMoreRef.current = false;
        if (!silent) {
          toast({
            title: "의뢰 불러오기 실패",
            description: "네트워크 오류가 발생했습니다.",
            variant: "destructive",
          });
        }
        return null;
      } finally {
        if (!silent) pageState.setIsLoading(false);
      }
    },
    [
      token,
      user?.role,
      toast,
      tabStage,
      isCamStage,
      isMachiningStage,
      showCompleted,
      effectivePageLimit,
      pageState,
    ],
  );

  const { pageRef, hasMoreRef, fetchNextPage, resetPagination } = usePagination(
    fetchRequestsCore,
    effectivePageLimit,
  );

  const fetchRequests = useCallback(
    async (silent = false, options?: { forceMailboxRefresh?: boolean }) => {
      resetPagination();
      return await fetchRequestsCore(silent, false, options);
    },
    [fetchRequestsCore, resetPagination],
  );

  const refreshRequests = useCallback(
    async (silent = false, options?: { forceMailboxRefresh?: boolean }) => {
      resetPagination();
      return await fetchRequestsCore(silent, false, options);
    },
    [fetchRequestsCore, resetPagination],
  );

  const reloadRequests = useCallback(
    async (forceMailboxRefresh = false) => {
      await refreshRequests(false, { forceMailboxRefresh });
    },
    [refreshRequests],
  );

  const mailboxState = useMailboxManagement(token, async () => {
    await fetchRequests();
  });

  const handleOpenMailboxDetails = useCallback(
    async (address: string) => {
      const mailboxAddress = String(address || "").trim();
      if (!mailboxAddress || !token) return;

      try {
        const response = await fetch(
          `/api/requests/shipping/mailbox-requests?mailboxAddress=${encodeURIComponent(mailboxAddress)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("우편함 상세 조회에 실패했습니다.");
        }

        const body = await response.json();
        const detailRequests = Array.isArray(body?.data?.requests)
          ? (body.data.requests as ManufacturerRequest[])
          : [];

        await mailboxState.handleRegisterShipment(
          mailboxAddress,
          detailRequests,
        );
      } catch (error) {
        toast({
          title: "우편함 상세 조회 실패",
          description:
            error instanceof Error && error.message
              ? error.message
              : "우편함 상세 조회 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [mailboxState, toast, token],
  );

  const currentStageForTab = isMachiningStage
    ? "가공"
    : isCamStage
      ? "CAM"
      : tabStage === "rnd"
        ? "추적관리"
        : tabStage === "shipping"
          ? "포장.발송"
          : tabStage === "tracking"
            ? "추적관리"
            : "의뢰";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const matchesCurrentPage = useCallback(
    (req: ManufacturerRequest) => {
      if (filterRequests) {
        return filterRequests(req);
      }

      const isDoneRndSample =
        String(req.source || "").trim() === "manufacturer_sample" &&
        Boolean(req.rnd?.doneAt);
      if (tabStage === "rnd") {
        return isDoneRndSample;
      }
      if (isDoneRndSample) {
        return false;
      }

      if (showCompleted && tabStage !== "tracking") {
        return shouldShowRequestInIncludeCompleted(req, currentStageOrder);
      }
      const stage = deriveStageForFilter(req);
      if (tabStage === "request") {
        return stage === "의뢰";
      }
      if (isCamStage) {
        return stage === "CAM";
      }
      if (isMachiningStage) {
        return stage === "가공";
      }
      if (tabStage === "packing") {
        return stage === "세척.패킹";
      }
      if (tabStage === "shipping") {
        return stage === "포장.발송";
      }
      if (tabStage === "tracking") {
        return stage === "추적관리";
      }
      return true;
    },
    [
      currentStageOrder,
      filterRequests,
      isCamStage,
      isMachiningStage,
      showCompleted,
      tabStage,
    ],
  );

  useEffect(() => {
    pageState.pageRefForCore.current = pageRef.current;
    pageState.hasMoreRefForCore.current = hasMoreRef.current;
  }, [pageRef, hasMoreRef, pageState]);

  const { handleOpenPreview } = usePreviewLoader({
    token,
    isCamStage,
    isMachiningStage,
    tabStage,
    decodeNcText,
    setPreviewLoading: pageState.setPreviewLoading,
    setPreviewNcText: pageState.setPreviewNcText,
    setPreviewNcName: pageState.setPreviewNcName,
    setPreviewStageUrl: pageState.setPreviewStageUrl,
    setPreviewStageName: pageState.setPreviewStageName,
    setPreviewFiles: pageState.setPreviewFiles,
    setPreviewOpen: pageState.setPreviewOpen,
  });

  const {
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
  } = useRequestFileHandlers({
    token,
    stage: tabStage,
    isCamStage,
    isMachiningStage,
    fetchRequests: reloadRequests,
    setRequests: pageState.setRequests,
    matchesCurrentPage,
    setDownloading: pageState.setDownloading,
    setUploading: pageState.setUploading,
    setDeletingCam: pageState.setDeletingCam,
    setDeletingNc: pageState.setDeletingNc,
    setReviewSaving: pageState.setReviewSaving,
    setPreviewOpen: pageState.setPreviewOpen,
    setPreviewFiles: pageState.setPreviewFiles,
    setPreviewNcText: pageState.setPreviewNcText,
    setPreviewNcName: pageState.setPreviewNcName,
    setPreviewStageUrl: pageState.setPreviewStageUrl,
    setPreviewStageName: pageState.setPreviewStageName,
    setPreviewLoading: pageState.setPreviewLoading,
    setSearchParams,
    setUploadProgress: pageState.setUploadProgress,
    decodeNcText,
  });

  const { realtimeBaseRef } = useWorksheetRealtimeStatus({
    enabled: true,
    token,
    setRequests: pageState.setRequests,
    fetchRequests,
    fetchRequestsCore,
    previewOpen: pageState.previewOpen,
    previewFiles: pageState.previewFiles,
    handleOpenPreview,
    removeOnMachiningComplete: true,
    matchesCurrentPage,
  });

  const {
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
    isDraggingOver,
    ocrProcessing,
  } = useStageDropHandlers({
    isMachiningStage,
    isCamStage,
    token,
    requests: pageState.requests,
    handleUploadStageFile,
    handleUploadCam,
  });

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) => {
      if (isCamStage) return handleUploadCam(req, files);
      if (isMachiningStage) return handleUploadNc(req, files);
      return handleUploadStageFile({
        req,
        stage: tabStage as "machining" | "packing" | "shipping" | "tracking",
        file: files[0],
        source: "manual",
      });
    },
    [
      isCamStage,
      isMachiningStage,
      handleUploadNc,
      handleUploadCam,
      handleUploadStageFile,
      tabStage,
    ],
  );

  const handleUploadFromModal = useCallback(
    (req: ManufacturerRequest, file: File) => {
      if (!req?._id) return;
      void handleUploadByStage(req, [file]);
    },
    [handleUploadByStage, tabStage],
  );

  const { handleCardRollback, handleCardApprove } = useCardActions(
    tabStage,
    isCamStage,
    isMachiningStage,
    {
      handleDeleteStageFile,
      handleDeleteNc,
      handleUpdateReviewStatus,
    },
    realtimeBaseRef,
  );

  // R&D 샘플 삭제 핸들러 (제조사/관리자만 가능)
  const handleCardDelete = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const isSample = (req as any).source === "manufacturer_sample";
      if (!isSample) {
        toast({
          title: "삭제 불가",
          description: "R&D 샘플만 삭제할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const mongoId = String(req._id || "").trim();
      const requestId = String(req.requestId || "").trim();
      pageState.setRequests((prev) =>
        prev.filter((item) => {
          const itemMongoId = String(item?._id || "").trim();
          const itemRequestId = String(item?.requestId || "").trim();
          if (mongoId && itemMongoId === mongoId) return false;
          if (requestId && itemRequestId === requestId) return false;
          return true;
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "삭제에 실패했습니다.");
        }
        toast({
          title: "삭제 완료",
          description: `의뢰 ${req.requestId}가 삭제되었습니다.`,
        });
        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        pageState.setRequests((prev) => {
          const exists = prev.some((item) => {
            const itemMongoId = String(item?._id || "").trim();
            const itemRequestId = String(item?.requestId || "").trim();
            return (
              (mongoId && itemMongoId === mongoId) ||
              (requestId && itemRequestId === requestId)
            );
          });
          if (exists) return prev;
          return [req, ...prev];
        });

        toast({
          title: "삭제 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [pageState, queryClient, token, toast],
  );

  const handleCardDone = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const isSample =
        String(req.source || "").trim() === "manufacturer_sample";
      if (!isSample) {
        toast({
          title: "Done 불가",
          description: "R&D 샘플만 Done 처리할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const requestMongoId = String(req._id || "").trim();
      const optimisticDoneAt = new Date().toISOString();
      pageState.setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            rnd: {
              ...(item.rnd || {}),
              doneAt: optimisticDoneAt,
              doneFromStage:
                String(item.manufacturerStage || "").trim() || null,
            },
          };
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}/rnd-done`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ done: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "Done 처리에 실패했습니다.");
        }
        toast({
          title: "Done 완료",
          description: `의뢰 ${req.requestId}가 R&D 탭으로 이동되었습니다.`,
        });

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              rnd: {
                ...(item.rnd || {}),
                doneAt: req?.rnd?.doneAt || null,
              },
            };
          }),
        );

        toast({
          title: "Done 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [pageState, queryClient, toast, token],
  );

  const [remakeDialogOpen, setRemakeDialogOpen] = useState(false);
  const [remakeSubmitting, setRemakeSubmitting] = useState(false);
  const [remakeStartStage, setRemakeStartStage] =
    useState<RemakeStartStage>("의뢰");
  const [remakeSourceRequest, setRemakeSourceRequest] =
    useState<ManufacturerRequest | null>(null);

  const handleCardRollbackForTab = useCallback(
    async (req: ManufacturerRequest) => {
      if (tabStage !== "rnd") {
        return handleCardRollback(req);
      }
      if (!req?._id) return;
      setRemakeSourceRequest(req);
      setRemakeStartStage("의뢰");
      setRemakeDialogOpen(true);
    },
    [handleCardRollback, tabStage],
  );

  const handleSubmitRemake = useCallback(async () => {
    if (!remakeSourceRequest?._id || remakeSubmitting) return;
    try {
      setRemakeSubmitting(true);
      const res = await fetch(
        `/api/requests/${remakeSourceRequest._id}/clone-from-sample-to-request`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ startStage: remakeStartStage }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || "재제작 복사에 실패했습니다.");
      }

      toast({
        title: "재제작 복사 완료",
        description: `의뢰 ${remakeSourceRequest.requestId}가 ${remakeStartStage} 공정으로 복사되었습니다. (새 의뢰ID: ${data?.data?.requestId || "-"})`,
      });

      setRemakeDialogOpen(false);
      setRemakeSourceRequest(null);

      void queryClient.invalidateQueries({
        queryKey: ["worksheet-assigned-summary"],
      });
      void queryClient.refetchQueries({
        queryKey: ["worksheet-assigned-summary"],
        type: "active",
      });
      void reloadRequests();
    } catch (e: any) {
      toast({
        title: "재제작 복사 실패",
        description: e?.message || "네트워크 오류",
        variant: "destructive",
      });
    } finally {
      setRemakeSubmitting(false);
    }
  }, [
    queryClient,
    reloadRequests,
    remakeSourceRequest,
    remakeStartStage,
    remakeSubmitting,
    toast,
    token,
  ]);

  const [rndMemoSaving, setRndMemoSaving] = useState<Record<string, boolean>>(
    {},
  );
  const [bulkCamRegenerating, setBulkCamRegenerating] = useState(false);

  const handleSaveRndMemo = useCallback(
    async (req: ManufacturerRequest, memoRaw: string) => {
      if (!req?._id) {
        return {
          memo: "",
          memoUpdatedAt: null,
          memoUpdatedBy: null,
          memoUpdatedByName: null,
        };
      }
      const memo = String(memoRaw || "")
        .slice(0, 500)
        .trim();
      const requestId = String(req._id);
      try {
        setRndMemoSaving((prev) => ({ ...prev, [requestId]: true }));
        const res = await fetch(`/api/requests/${req._id}/rnd-memo`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ memo }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "메모 저장에 실패했습니다.");
        }
        const savedMemo = String(data?.data?.memo || "");
        const savedAt = data?.data?.memoUpdatedAt || null;
        const savedBy = data?.data?.memoUpdatedBy || null;
        const savedByName =
          typeof data?.data?.memoUpdatedByName === "string"
            ? data.data.memoUpdatedByName
            : null;

        pageState.setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "") !== requestId) return item;
            return {
              ...item,
              rnd: {
                ...(item.rnd || {}),
                memo: savedMemo,
                memoUpdatedAt: savedAt,
                memoUpdatedBy: savedBy,
                memoUpdatedByName: savedByName,
              },
            };
          }),
        );

        return {
          memo: savedMemo,
          memoUpdatedAt: savedAt,
          memoUpdatedBy: savedBy,
          memoUpdatedByName: savedByName,
        };
      } catch (e: any) {
        toast({
          title: "메모 저장 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
        throw e;
      } finally {
        setRndMemoSaving((prev) => ({ ...prev, [requestId]: false }));
      }
    },
    [pageState, toast, token],
  );

  const enableCardRollback =
    tabStage === "cam" ||
    tabStage === "machining" ||
    tabStage === "packing" ||
    tabStage === "shipping" ||
    tabStage === "tracking" ||
    tabStage === "rnd";

  const enableCardApprove =
    tabStage === "cam" ||
    tabStage === "machining" ||
    tabStage === "packing" ||
    tabStage === "shipping" ||
    tabStage === "tracking" ||
    tabStage === "request";

  const { handleDownloadOriginal } = useRequestCardHandlers(
    token,
    isMachiningStage,
    isCamStage,
  );

  const setPreviewOpen = pageState.setPreviewOpen;

  useEffect(() => {
    resetPagination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void fetchRequestsCore(false, false);
  }, [tabStage, showCompleted]);

  const { filteredBase, filteredAndSorted, getFilteredAndSortedRequests } =
    useRequestFiltering(
      pageState.requests,
      tabStage,
      showCompleted,
      currentStageOrder,
      worksheetSearch,
      filterRequests,
    );

  const handleRegenerateAllCam = useCallback(async () => {
    if (!token || bulkCamRegenerating) return;

    const targets = filteredAndSorted
      .map((req) => String(req?.requestId || "").trim())
      .filter(Boolean);

    if (!targets.length) {
      toast({
        title: "재생성 대상 없음",
        description: "CAM 재생성할 의뢰가 없습니다.",
      });
      return;
    }

    setBulkCamRegenerating(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const requestId of targets) {
        try {
          const res = await fetch(
            `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/regenerate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({}),
            },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.success === false) {
            failCount += 1;
            continue;
          }
          successCount += 1;
        } catch {
          failCount += 1;
        }
      }

      toast({
        title: "CAM 재생성 요청 완료",
        description: `성공 ${successCount}건, 실패 ${failCount}건`,
        variant: failCount > 0 ? "destructive" : undefined,
      });

      void reloadRequests();
    } finally {
      setBulkCamRegenerating(false);
    }
  }, [bulkCamRegenerating, filteredAndSorted, reloadRequests, toast, token]);

  useEffect(() => {
    if (!Object.keys(mailboxState.mailboxErrorByAddress).length) return;
    mailboxState.setMailboxErrorByAddress((prev) => {
      const next = { ...prev };
      for (const address of Object.keys(prev)) {
        const mailboxRequests = filteredAndSorted.filter(
          (r) => String(r?.mailboxAddress || "").trim() === address,
        );
        const hasPickup = mailboxRequests.some((req) => {
          const di =
            req?.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
              ? (req.deliveryInfoRef as any)
              : null;
          return Boolean(di?.trackingNumber || di?.shippedAt);
        });
        if (hasPickup) {
          delete next[address];
        }
      }
      return next;
    });
  }, [filteredAndSorted, mailboxState.mailboxErrorByAddress, mailboxState]);

  const DEBUG = (() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("wsdebug") === "1") return true;
      return (
        localStorage.getItem("abutsfit:wsdebug") === "1" ||
        (window as any).__worksheetDebug === true
      );
    } catch {
      return (window as any).__worksheetDebug === true;
    }
  })();

  useEffect(() => {
    if (!DEBUG) return;
    const stageOf = (r: any) => deriveStageForFilter(r as any);
    const bucketOf = (r: any) => {
      const d = Number((r as any)?.caseInfos?.maxDiameter);
      if (!Number.isFinite(d)) return "unknown";
      if (d <= 6) return "6";
      if (d <= 8) return "8";
      if (d <= 10) return "10";
      return "12";
    };
    const dist = (arr: any[], fn: (x: any) => string) => {
      const m: Record<string, number> = {};
      for (const it of arr) {
        const k = fn(it) || "unknown";
        m[k] = (m[k] || 0) + 1;
      }
      return m;
    };
  }, [
    DEBUG,
    pageState.requests,
    filteredBase,
    filteredAndSorted,
    showCompleted,
    worksheetSearch,
    tabStage,
  ]);

  // handleOpenNextRequest 제거: 승인/롤백 후 다음 의뢰를 자동으로 열지 않는다.
  // 작업자가 직접 다음 의뢰 카드를 선택하도록 유도한다. (백엔드 큐 과부하 방지)

  const setVisibleCount = pageState.setVisibleCount;
  const visibleCountRef = pageState.visibleCountRef;
  const setServerTotal = pageState.setServerTotal;
  useEffect(() => {
    visibleCountRef.current = 12;
    setVisibleCount(12);
    setServerTotal(null);
  }, [
    worksheetSearch,
    showCompleted,
    tabStage,
    setVisibleCount,
    visibleCountRef,
    setServerTotal,
  ]);

  useInfiniteScroll(
    pageState.sentinelRef,
    pageState.visibleCount,
    filteredAndSorted.length,
    hasMoreRef.current,
    fetchNextPage,
    pageState.setVisibleCount,
    pageState.userScrolledRef,
  );

  pageState.totalCountRef.current = filteredAndSorted.length;
  const paginatedRequests = filteredAndSorted.slice(0, pageState.visibleCount);

  const {
    handleTogglePackingRequest,
    handleSelectAllPackingRequests,
    handleClearPackingRequests,
  } = usePackingSelection(tabStage, filteredAndSorted, pageState);

  useMailboxSync(pageState, mailboxState);

  const diameterQueueForReceive = useDiameterQueue(filteredAndSorted);

  if (pageState.isLoading) {
    return <WorksheetLoading />;
  }

  const isEmpty = filteredAndSorted.length === 0;

  return (
    <div
      onDrop={handlePageDrop}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      className="relative w-full h-full text-gray-800 flex flex-col items-stretch"
      onWheelCapture={() => {
        pageState.userScrolledRef.current = true;
        const node = pageState.scrollContainerRef.current;
        if (
          node &&
          node.scrollHeight <= node.clientHeight + 20 &&
          hasMoreRef.current
        ) {
          void fetchNextPage();
        }
      }}
      onScrollCapture={() => {
        pageState.userScrolledRef.current = true;
      }}
    >
      <div
        className="flex-1 overflow-y-auto"
        ref={pageState.setScrollContainer}
        data-worksheet-scroll="1"
        onScroll={() => {
          pageState.userScrolledRef.current = true;
        }}
      >
        {isCamStage && isDraggingOver && (
          <div className="fixed inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 border-solid border-blue-500 text-center">
              <div className="text-2xl font-bold text-blue-700 mb-2">
                NC 파일을 드롭하세요
              </div>
              <div className="text-sm text-slate-600">
                파일명이 일치하는 의뢰건에 자동으로 업로드됩니다
              </div>
            </div>
          </div>
        )}
        {showQueueBar && (
          <WorksheetQueueSummary
            total={
              showCompleted
                ? diameterQueueForReceive.total
                : (pageState.serverTotal ?? diameterQueueForReceive.total)
            }
            labels={diameterQueueForReceive.labels}
            counts={diameterQueueForReceive.counts}
          />
        )}

        <div
          className={`space-y-4 ${tabStage === "shipping" ? "mt-0" : "mt-6"}`}
        >
          <div className={`pb-12 ${tabStage === "shipping" ? "pt-0" : "pt-2"}`}>
            {tabStage === "machining" ? (
              // CAM 승인 후 가공 큐 우선순위/자동시작 정책은 백엔드 SSOT로 관리한다.
              // - 아노다이징 ON 우선
              // - 아노다이징 OFF는 큐 마지막 + "아노 X 가공" 수동 시작
              <MachiningQueueBoard searchQuery={worksheetSearch} />
            ) : tabStage === "shipping" ? (
              <div className="w-full">
                <MailboxGrid
                  mailboxSummaries={mailboxSummaries}
                  forceTodayMailboxAddresses={
                    mailboxState.forceTodayMailboxAddresses
                  }
                  onBoxClick={(address) => {
                    void handleOpenMailboxDetails(address);
                  }}
                  onMailboxError={(address, message) => {
                    const key = String(address || "").trim();
                    if (!key) return;
                    const normalized = String(message || "").trim();
                    if (!normalized) return;
                    mailboxState.setMailboxErrorByAddress((prev) => ({
                      ...prev,
                      [key]: normalized,
                    }));
                  }}
                  onRefresh={() => reloadRequests(true)}
                />
              </div>
            ) : isEmpty ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
                표시할 의뢰가 없습니다.
              </div>
            ) : (
              <>
                {isCamStage && (
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        !filteredAndSorted.length || bulkCamRegenerating
                      }
                      onClick={() => {
                        pageState.setConfirmTitle("모든 의뢰 CAM 재생성");
                        pageState.setConfirmDescription(
                          `현재 목록의 ${filteredAndSorted.length}개 의뢰에 CAM 재생성 요청을 보냅니다. 진행할까요?`,
                        );
                        pageState.setConfirmAction(() => async () => {
                          await handleRegenerateAllCam();
                        });
                        pageState.setConfirmOpen(true);
                      }}
                    >
                      {bulkCamRegenerating
                        ? "CAM 재생성 요청 중..."
                        : "모든 의뢰 CAM 재생성"}
                    </Button>
                  </div>
                )}
                {tabStage === "packing" && (
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllPackingRequests}
                      disabled={!filteredAndSorted.length}
                    >
                      전체 선택
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClearPackingRequests}
                      disabled={!pageState.selectedPackingRequestIds.length}
                    >
                      전체 해제
                    </Button>
                    <div className="text-xs text-slate-500">
                      선택 {pageState.selectedPackingRequestIds.length} / 전체{" "}
                      {filteredAndSorted.length}
                    </div>
                  </div>
                )}
                <WorksheetCardGrid
                  requests={paginatedRequests}
                  selectedRequestIds={
                    tabStage === "packing"
                      ? pageState.selectedPackingRequestIds
                      : []
                  }
                  onToggleSelected={
                    tabStage === "packing"
                      ? handleTogglePackingRequest
                      : undefined
                  }
                  onDownload={handleDownloadOriginal}
                  onOpenPreview={handleOpenPreview}
                  onDeleteCam={handleDeleteCam}
                  onDeleteNc={handleDeleteNc}
                  onRollback={
                    enableCardRollback ? handleCardRollbackForTab : undefined
                  }
                  onApprove={enableCardApprove ? handleCardApprove : undefined}
                  onDelete={handleCardDelete}
                  onDone={handleCardDone}
                  onUploadNc={handleUploadNc}
                  uploadProgress={pageState.uploadProgress}
                  uploading={pageState.uploading}
                  deletingCam={pageState.deletingCam}
                  deletingNc={pageState.deletingNc}
                  isCamStage={isCamStage}
                  isMachiningStage={isMachiningStage}
                  downloading={pageState.downloading}
                  currentStageOrder={currentStageOrder}
                  tabStage={tabStage}
                  onSaveRndMemo={handleSaveRndMemo}
                  rndMemoSaving={rndMemoSaving}
                />

                <div
                  ref={pageState.sentinelRef}
                  className="py-4 text-center text-gray-500"
                >
                  {pageState.visibleCount >= filteredAndSorted.length
                    ? "모든 의뢰를 표시했습니다."
                    : "스크롤하여 더보기"}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <WorksheetDiameterQueueModal
        open={pageState.receiveQueueModalOpen}
        onOpenChange={pageState.setReceiveQueueModalOpen}
        processLabel={`커스텀어벗 > ${currentStageForTab}`}
        queues={diameterQueueForReceive.buckets}
        selectedBucket={pageState.receiveSelectedBucket}
        onSelectBucket={pageState.setReceiveSelectedBucket}
      />

      <MailboxContentsModal
        open={mailboxState.mailboxModalOpen}
        onOpenChange={(next) => {
          if (!next && !mailboxState.isForceTodayUpdating) {
            mailboxState.handleShipmentModalClose();
          }
        }}
        address={mailboxState.mailboxModalAddress}
        requests={mailboxState.mailboxModalRequests}
        errorMessage={
          mailboxState.mailboxErrorByAddress[
            mailboxState.mailboxModalAddress
          ] || ""
        }
        token={token}
        onRollback={handleCardRollback}
        onApprove={handleCardApprove}
        onRollbackAll={
          mailboxState.mailboxModalRequests.length
            ? mailboxState.handleRollbackAllInMailbox
            : undefined
        }
        isRollingBackAll={mailboxState.isRollingBackAll}
        onAddressSaved={mailboxState.handleMailboxAddressSaved}
        forceToday={
          mailboxState.forceTodayMailboxAddresses.has(
            mailboxState.mailboxModalAddress,
          ) ||
          mailboxState.mailboxModalRequests.some((req) =>
            Boolean(req?.timeline?.forceTodayShipment),
          )
        }
        onForceTodayChange={(checked) =>
          void (async () => {
            await mailboxState.setMailboxForceToday(
              mailboxState.mailboxModalAddress,
              checked,
            );
            mailboxState.handleShipmentModalClose();
          })()
        }
      />

      <PreviewModal
        open={pageState.previewOpen}
        onOpenChange={pageState.setPreviewOpen}
        previewLoading={pageState.previewLoading}
        previewFiles={pageState.previewFiles}
        previewNcText={pageState.previewNcText}
        previewNcName={pageState.previewNcName}
        previewStageUrl={pageState.previewStageUrl}
        previewStageName={pageState.previewStageName}
        uploading={pageState.uploading}
        reviewSaving={pageState.reviewSaving}
        stage={tabStage}
        isCamStage={isCamStage}
        isMachiningStage={isMachiningStage}
        onUpdateReviewStatus={handleUpdateReviewStatus}
        onDeleteCam={handleDeleteCam}
        onDeleteNc={handleDeleteNc}
        onDeleteStageFile={handleDeleteStageFile}
        onUploadCam={handleUploadCam}
        onUploadNc={handleUploadNc}
        onUploadStageFile={handleUploadStageFile}
        onDownloadOriginalStl={handleDownloadOriginalStl}
        onDownloadCamStl={handleDownloadCamStl}
        onDownloadNcFile={handleDownloadNcFile}
        onDownloadStageFile={handleDownloadStageFile}
        onRefreshPreview={handleOpenPreview}
        setSearchParams={setSearchParams}
        setConfirmTitle={pageState.setConfirmTitle}
        setConfirmDescription={pageState.setConfirmDescription}
        setConfirmAction={pageState.setConfirmAction}
        setConfirmOpen={pageState.setConfirmOpen}
        // onOpenNextRequest는 제거됨: 승인 후 다음 의뢰 자동 열기 방지
        // 승인 시 모달이 닫히고 작업자가 직접 다음 의뢰를 선택한다.
      />

      <Dialog
        open={remakeDialogOpen}
        onOpenChange={(open) => {
          if (remakeSubmitting) return;
          setRemakeDialogOpen(open);
          if (!open) {
            setRemakeSourceRequest(null);
            setRemakeStartStage("의뢰");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>재제작 시작 공정 선택</DialogTitle>
            <DialogDescription>
              {remakeSourceRequest
                ? `의뢰 ${remakeSourceRequest.requestId} 복사본을 어느 공정부터 시작할지 선택해주세요.`
                : "복사 시작 공정을 선택해주세요."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2 py-2">
            {(["의뢰", "CAM", "가공"] as RemakeStartStage[]).map((stage) => (
              <Button
                key={stage}
                type="button"
                variant={remakeStartStage === stage ? "default" : "outline"}
                onClick={() => setRemakeStartStage(stage)}
                disabled={remakeSubmitting}
              >
                {stage}
              </Button>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={remakeSubmitting}
              onClick={() => {
                setRemakeDialogOpen(false);
                setRemakeSourceRequest(null);
                setRemakeStartStage("의뢰");
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={!remakeSourceRequest || remakeSubmitting}
              onClick={() => void handleSubmitRemake()}
            >
              {remakeSubmitting ? "복사 중..." : "재제작 복사"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pageState.confirmOpen}
        title={pageState.confirmTitle}
        description={pageState.confirmDescription}
        confirmLabel="확인"
        cancelLabel="취소"
        onConfirm={async () => {
          if (!pageState.confirmAction) return;
          const action = pageState.confirmAction;
          pageState.setConfirmOpen(false);
          pageState.setConfirmAction(null);

          try {
            await action();
          } catch (error) {
            console.error("Confirm action failed:", error);
          }
        }}
        onCancel={() => {
          pageState.setConfirmOpen(false);
          pageState.setConfirmAction(null);
        }}
      />
    </div>
  );
};

export default RequestPage;
