import { useMemo, useEffect, useCallback, type ReactNode } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
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
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";
import {
  usePagination,
  useInfiniteScroll,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestPagination";
import { MailboxGrid } from "../shipping/components/MailboxGrid";
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
import { useRequestNavigation } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestNavigation";
import { usePackingSelection } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePackingSelection";
import { useMailboxSync } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useMailboxSync";
import { useDiameterQueue } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useDiameterQueue";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";

export const RequestPage = ({
  showQueueBar = true,
  filterRequests,
}: {
  showQueueBar?: boolean;
  filterRequests?: (req: ManufacturerRequest) => boolean;
}) => {
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

  const PAGE_LIMIT = 12;

  const pageState = useRequestPageState();

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
    async (silent = false, append = false) => {
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
          return [] as string[];
        })();

        const path = (() => {
          const url = new URL(basePath, window.location.origin);
          url.searchParams.set("page", String(pageRef.current));
          url.searchParams.set("limit", String(PAGE_LIMIT));
          url.searchParams.set("view", "worksheet");
          if (tabStage === "shipping") {
            url.searchParams.set("worksheetProfile", "shipping");
          }
          url.searchParams.set("includeTotal", "0");
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
        })();

        const res = await fetch(path, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!res.ok) {
          toast({
            title: "의뢰 불러오기 실패",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
          return null;
        }

        const data = await res.json();
        const raw = data?.data;
        const list = Array.isArray(raw?.requests)
          ? raw.requests
          : Array.isArray(raw)
            ? raw
            : [];
        if (data?.success && Array.isArray(list)) {
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
            pageState.setRequests((prev) =>
              mergeTransientRealtimeProgress(
                prev,
                list as ManufacturerRequest[],
              ),
            );
          }
          pageState.hasMoreRefForCore.current = list.length >= PAGE_LIMIT;
          hasMoreRef.current = list.length >= PAGE_LIMIT;
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
      pageState,
    ],
  );

  const { pageRef, hasMoreRef, fetchNextPage, resetPagination } = usePagination(
    fetchRequestsCore,
    PAGE_LIMIT,
  );

  const fetchRequests = useCallback(
    async (silent = false) => {
      resetPagination();
      return await fetchRequestsCore(silent, false);
    },
    [fetchRequestsCore, resetPagination],
  );

  const refreshRequests = useCallback(
    async (silent = false) => {
      resetPagination();
      return await fetchRequestsCore(silent, false);
    },
    [fetchRequestsCore, resetPagination],
  );

  const reloadRequests = useCallback(async () => {
    await refreshRequests();
  }, [refreshRequests]);

  const mailboxState = useMailboxManagement(token, async () => {
    await fetchRequests();
  });

  const matchesCurrentPage = useCallback(
    (req: ManufacturerRequest) => {
      if (filterRequests) {
        return filterRequests(req);
      }
      const stage = deriveStageForFilter(req);
      if (tabStage === "request") {
        return showCompleted
          ? [
              "의뢰",
              "CAM",
              "가공",
              "세척.패킹",
              "포장.발송",
              "추적관리",
            ].includes(stage)
          : stage === "의뢰";
      }
      if (isCamStage) {
        return showCompleted
          ? ["CAM", "가공", "세척.패킹", "포장.발송", "추적관리"].includes(
              stage,
            )
          : stage === "CAM";
      }
      if (isMachiningStage) {
        return showCompleted
          ? ["가공", "세척.패킹", "포장.발송", "추적관리"].includes(stage)
          : stage === "가공";
      }
      if (tabStage === "packing") {
        return showCompleted
          ? ["세척.패킹", "포장.발송", "추적관리"].includes(stage)
          : stage === "세척.패킹";
      }
      if (tabStage === "shipping") {
        return showCompleted
          ? ["포장.발송", "추적관리"].includes(stage)
          : stage === "포장.발송";
      }
      if (tabStage === "tracking") {
        return stage === "추적관리";
      }
      return true;
    },
    [filterRequests, isCamStage, isMachiningStage, showCompleted, tabStage],
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

  const enableCardRollback =
    tabStage === "cam" ||
    tabStage === "machining" ||
    tabStage === "packing" ||
    tabStage === "shipping" ||
    tabStage === "tracking";

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
    pageState.pageRefForCore.current = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void fetchRequestsCore(false, false);
  }, [tabStage, showCompleted]);

  const currentStageForTab = isMachiningStage
    ? "가공"
    : isCamStage
      ? "CAM"
      : tabStage === "shipping"
        ? "포장.발송"
        : tabStage === "tracking"
          ? "추적관리"
          : "의뢰";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const { filteredBase, filteredAndSorted, getFilteredAndSortedRequests } =
    useRequestFiltering(
      pageState.requests,
      tabStage,
      showCompleted,
      currentStageOrder,
      worksheetSearch,
      filterRequests,
    );

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

  const { handleOpenNextRequest } = useRequestNavigation(
    filteredAndSorted,
    getFilteredAndSortedRequests,
    handleOpenPreview,
    refreshRequests,
    pageState,
  );

  useEffect(() => {
    pageState.visibleCountRef.current = 12;
    pageState.setVisibleCount(12);
  }, [worksheetSearch, showCompleted, tabStage, pageState]);

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
            total={diameterQueueForReceive.total}
            labels={diameterQueueForReceive.labels}
            counts={diameterQueueForReceive.counts}
          />
        )}

        <div
          className={`space-y-4 ${tabStage === "shipping" ? "mt-0" : "mt-6"}`}
        >
          <div className={`pb-12 ${tabStage === "shipping" ? "pt-0" : "pt-2"}`}>
            {tabStage === "machining" ? (
              <MachiningQueueBoard searchQuery={worksheetSearch} />
            ) : tabStage === "shipping" ? (
              <div className="w-full">
                <MailboxGrid
                  requests={filteredAndSorted.filter(
                    (r) => r.mailboxAddress || isPrePickupShippingVisible(r),
                  )}
                  onBoxClick={(address, reqs) =>
                    mailboxState.handleRegisterShipment(address, reqs)
                  }
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
                />
              </div>
            ) : isEmpty ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
                표시할 의뢰가 없습니다.
              </div>
            ) : (
              <>
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
                    enableCardRollback ? handleCardRollback : undefined
                  }
                  onApprove={enableCardApprove ? handleCardApprove : undefined}
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
        onOpenChange={mailboxState.handleShipmentModalClose}
        address={mailboxState.mailboxModalAddress}
        requests={mailboxState.mailboxModalRequests}
        errorMessage={
          mailboxState.mailboxErrorByAddress[
            mailboxState.mailboxModalAddress
          ] || ""
        }
        token={token}
        onRollback={handleCardRollback}
        onRollbackAll={
          mailboxState.mailboxModalRequests.length
            ? mailboxState.handleRollbackAllInMailbox
            : undefined
        }
        isRollingBackAll={mailboxState.isRollingBackAll}
        onAddressSaved={mailboxState.handleMailboxAddressSaved}
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
        setSearchParams={setSearchParams}
        setConfirmTitle={pageState.setConfirmTitle}
        setConfirmDescription={pageState.setConfirmDescription}
        setConfirmAction={pageState.setConfirmAction}
        setConfirmOpen={pageState.setConfirmOpen}
        onOpenNextRequest={handleOpenNextRequest}
      />

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
