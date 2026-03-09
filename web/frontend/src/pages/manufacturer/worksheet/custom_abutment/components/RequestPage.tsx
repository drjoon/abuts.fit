import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type DragEvent,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type DiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import { WorksheetQueueSummary } from "@/shared/ui/dashboard/WorksheetQueueSummary";
import { useToast } from "@/shared/hooks/use-toast";
import { toKstYmd } from "@/shared/date/kst";
import { Badge } from "@/components/ui/badge";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getReviewStageKeyByTab,
  getReviewLabel,
  getReviewBadgeClassName,
  deriveStageForFilter,
  stageOrder,
  getAcceptByStage,
  getDiameterBucketIndex,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { MailboxGrid } from "../shipping/components/MailboxGrid";
import { MailboxContentsModal } from "../shipping/components/MailboxContentsModal";
import { WorksheetCardGrid } from "./WorksheetCardGrid";
import { MachiningQueueBoard } from "../machining/MachiningQueueBoard";
import { PreviewModal } from "./PreviewModal";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import { usePreviewLoader } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useStageDropHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useStageDropHandlers";
import { useWorksheetRealtimeStatus } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";

type FilePreviewInfo = {
  originalName: string;
  url: string;
};

type PreviewFiles = {
  original?: File | null;
  cam?: File | null;
  title?: string;
  request?: ManufacturerRequest | null;
};

const mergeTransientRealtimeProgress = (
  prevRequests: ManufacturerRequest[],
  nextRequests: ManufacturerRequest[],
): ManufacturerRequest[] => {
  const prevByKey = new Map<string, ManufacturerRequest>();

  for (const req of prevRequests) {
    const requestId = String(req?.requestId || "").trim();
    const mongoId = String(req?._id || "").trim();
    if (requestId) prevByKey.set(`requestId:${requestId}`, req);
    if (mongoId) prevByKey.set(`mongoId:${mongoId}`, req);
  }

  return nextRequests.map((req) => {
    const requestId = String(req?.requestId || "").trim();
    const mongoId = String(req?._id || "").trim();
    const prev =
      (requestId ? prevByKey.get(`requestId:${requestId}`) : null) ||
      (mongoId ? prevByKey.get(`mongoId:${mongoId}`) : null) ||
      null;

    if (!prev?.realtimeProgress || req?.realtimeProgress) {
      return req;
    }

    return {
      ...req,
      realtimeProgress: prev.realtimeProgress,
    };
  });
};

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

  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [receiveQueueModalOpen, setReceiveQueueModalOpen] = useState(false);
  const [receiveSelectedBucket, setReceiveSelectedBucket] =
    useState<DiameterBucketKey | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<PreviewFiles>({});
  const [reviewSaving, setReviewSaving] = useState(false);
  const [previewNcText, setPreviewNcText] = useState<string>("");
  const [previewNcName, setPreviewNcName] = useState<string>("");
  const [previewStageUrl, setPreviewStageUrl] = useState<string>("");
  const [previewStageName, setPreviewStageName] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDescription, setConfirmDescription] = useState<ReactNode>("");
  const [confirmAction, setConfirmAction] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [deletingCam, setDeletingCam] = useState<Record<string, boolean>>({});
  const [deletingNc, setDeletingNc] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [visibleCount, setVisibleCount] = useState(12);
  const visibleCountRef = useRef(12);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const totalCountRef = useRef(0);
  const userScrolledRef = useRef(false);
  // Network pagination page size for worksheet
  const PAGE_LIMIT = 12;
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isFetchingPageRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const bootstrapLoadsRef = useRef(0);
  const maxBootstrapLoads = 5;
  const [mailboxModalOpen, setMailboxModalOpen] = useState(false);
  const [mailboxModalAddress, setMailboxModalAddress] = useState("");
  const [mailboxModalRequests, setMailboxModalRequests] = useState<
    ManufacturerRequest[]
  >([]);
  const [mailboxErrorByAddress, setMailboxErrorByAddress] = useState<
    Record<string, string>
  >({});
  const [isRollingBackAll, setIsRollingBackAll] = useState(false);
  const [selectedPackingRequestIds, setSelectedPackingRequestIds] = useState<
    string[]
  >([]);
  const didInitPackingSelectionRef = useRef(false);

  const decodeNcText = useCallback((buffer: ArrayBuffer) => {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
    const utf8Text = utf8Decoder.decode(buffer);
    if (!utf8Text.includes("\uFFFD")) return utf8Text;
    try {
      const eucKrDecoder = new TextDecoder("euc-kr", { fatal: false });
      return eucKrDecoder.decode(buffer);
    } catch {
      return utf8Text;
    }
  }, []);

  const { toast } = useToast();

  const { handleOpenPreview } = usePreviewLoader({
    token,
    isCamStage,
    isMachiningStage,
    tabStage,
    decodeNcText,
    setPreviewLoading,
    setPreviewNcText,
    setPreviewNcName,
    setPreviewStageUrl,
    setPreviewStageName,
    setPreviewFiles,
    setPreviewOpen,
  });

  const fetchRequestsCore = useCallback(
    async (silent = false, append = false) => {
      if (!token) return null;

      try {
        if (!silent) setIsLoading(true);
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
          // Always include page & limit to encourage backend pagination
          url.searchParams.set("page", String(pageRef.current));
          url.searchParams.set("limit", String(PAGE_LIMIT));
          url.searchParams.set("view", "worksheet");
          url.searchParams.set("includeTotal", "0");
          if (stageFilterForTab.length === 1) {
            url.searchParams.set("manufacturerStage", stageFilterForTab[0]);
          } else if (stageFilterForTab.length > 1) {
            for (const stage of stageFilterForTab) {
              url.searchParams.append("manufacturerStageIn", stage);
            }
          }
          return url.pathname + url.search;
        })();

        // 캐시를 무시하고 항상 최신 데이터를 조회 (NC 파일 업데이트 반영용)
        const res = await fetch(path, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store", // 브라우저 캐시 무시
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
            setRequests((prev) => {
              // dedupe by _id
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
            setRequests((prev) =>
              mergeTransientRealtimeProgress(
                prev,
                list as ManufacturerRequest[],
              ),
            );
          }
          // if received less than limit, no more pages
          hasMoreRef.current = list.length >= PAGE_LIMIT;
        }

        return list as ManufacturerRequest[];
      } catch (error) {
        console.error("Error fetching requests:", error);
        if (!silent) {
          toast({
            title: "의뢰 불러오기 실패",
            description: "네트워크 오류가 발생했습니다.",
            variant: "destructive",
          });
        }
        return null;
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [token, user?.role, toast, tabStage, isCamStage, isMachiningStage],
  );

  const fetchRequests = useCallback(
    async (silent = false) => {
      // reset paging
      pageRef.current = 1;
      hasMoreRef.current = true;
      return await fetchRequestsCore(silent, false);
    },
    [fetchRequestsCore],
  );

  const refreshRequests = useCallback(
    async (silent = false) => {
      return await fetchRequests(silent);
    },
    [fetchRequests],
  );

  const reloadRequests = useCallback(async () => {
    await refreshRequests();
  }, [refreshRequests]);

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

  const fetchNextPage = useCallback(async () => {
    if (isFetchingPageRef.current) return;
    if (!hasMoreRef.current) return;

    // Throttle: enforce minimum 500ms between fetches to avoid 429 rate limit
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    if (timeSinceLastFetch < 500) {
      console.log(
        "[RequestPage] Throttling fetchNextPage, too soon since last fetch",
      );
      return;
    }

    isFetchingPageRef.current = true;
    lastFetchTimeRef.current = now;
    try {
      pageRef.current += 1;
      await fetchRequestsCore(true, true);
    } finally {
      isFetchingPageRef.current = false;
    }
  }, [fetchRequestsCore]);

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
    setRequests,
    matchesCurrentPage,
    setDownloading,
    setUploading,
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
    setUploadProgress,
    decodeNcText,
  });

  const { realtimeBaseRef } = useWorksheetRealtimeStatus({
    enabled: true,
    token,
    setRequests,
    fetchRequests,
    fetchRequestsCore,
    previewOpen,
    previewFiles,
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
    requests,
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

  const handleCardRollback = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;

      const stage = deriveStageForFilter(req);

      // 항상 "현재 카드 단계"에서 직전 단계로 롤백
      if (stage === "가공") {
        return handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
        });
      }

      if (stage === "CAM") {
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }

      if (stage === "세척.포장" || stage === "세척.패킹") {
        return handleDeleteStageFile({
          req,
          stage: "packing",
          rollbackOnly: true,
        });
      }

      if (stage === "발송" || stage === "포장.발송") {
        // 포장.발송 단계 롤백: 세척.패킹 단계로 되돌리기
        return handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
      }

      if (stage === "추적관리") {
        return handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
      }

      if (tabStage === "machining") {
        return handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
        });
      }

      if (tabStage === "cam") {
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }

      if (tabStage === "shipping") {
        // 포장.발송 탭에서 롤백: 세척.패킹 단계로 되돌리기
        return handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
      }

      // CAM/의뢰 탭에서의 기본 롤백: CAM 파일 삭제
      return handleDeleteNc(req, {
        nextStage: "request",
        rollbackOnly: true,
        navigate: false,
      });
    },
    [handleDeleteStageFile, handleDeleteNc, handleUpdateReviewStatus, tabStage],
  );

  const handleCardApprove = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stageKey = getReviewStageKeyByTab({
        stage: tabStage,
        isCamStage,
        isMachiningStage,
      });
      if (stageKey === "request") {
        realtimeBaseRef.current[String(req.requestId || "").trim()] =
          Date.now();
        setRequests((prev) =>
          prev.map((item) => {
            if (
              String(item.requestId || "").trim() !==
              String(req.requestId || "").trim()
            ) {
              return item;
            }
            return item;
          }),
        );
      }
      void handleUpdateReviewStatus({
        req,
        status: "APPROVED",
        stageOverride: stageKey,
      });
    },
    [
      tabStage,
      isCamStage,
      isMachiningStage,
      handleUpdateReviewStatus,
      realtimeBaseRef,
      setRequests,
    ],
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

  const handleDownloadOriginal = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      setDownloading((prev) => ({ ...prev, [req._id]: true }));
      try {
        const endpoint = isMachiningStage
          ? `/api/requests/${req._id}/nc-file-url`
          : isCamStage
            ? `/api/requests/${req._id}/cam-file-url`
            : `/api/requests/${req._id}/original-file-url`;

        const res = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("download url failed");
        }
        const data = await res.json();
        const url = data?.data?.url;
        if (!url) throw new Error("download url missing");

        const fetchAndSave = async (signedUrl: string, filename: string) => {
          const r = await fetch(signedUrl);
          if (!r.ok) throw new Error("download failed");
          const blob = await r.blob();

          const nameWithExt = filename.includes(".")
            ? filename
            : `${filename}.stl`;
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = nameWithExt;
          link.click();
          URL.revokeObjectURL(link.href);
        };

        const fileName =
          isMachiningStage || isCamStage
            ? req.caseInfos?.camFile?.filePath ||
              req.caseInfos?.camFile?.fileName ||
              req.caseInfos?.camFile?.originalName ||
              req.caseInfos?.file?.filePath ||
              req.caseInfos?.file?.originalName ||
              "download.stl"
            : req.caseInfos?.file?.filePath ||
              req.caseInfos?.file?.originalName ||
              "download.stl";

        await fetchAndSave(url, fileName);

        toast({
          title: "다운로드 시작",
          description: "파일을 내려받고 있습니다.",
          duration: 2000,
        });
      } catch (error) {
        toast({
          title: "다운로드 실패",
          description: "파일을 내려받을 수 없습니다.",
          variant: "destructive",
          duration: 3000,
        });
      } finally {
        setDownloading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, isMachiningStage, isCamStage, toast],
  );

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests, tabStage]);

  const searchLower = worksheetSearch.toLowerCase();
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

  const isPrePickupShippingVisible = (req: ManufacturerRequest) => {
    const stage = String(req.manufacturerStage || "").trim();
    const di =
      req.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
        ? (req.deliveryInfoRef as any)
        : null;
    const statusCode = Number(di?.tracking?.lastStatusCode || 0);
    const isCanceled =
      String(di?.tracking?.lastStatusText || "").trim() === "예약취소";
    const hasPickupReservation = Boolean(
      di?.trackingNumber || di?.shippedAt || di?.tracking?.lastStatusText,
    );
    return (
      stage === "추적관리" &&
      hasPickupReservation &&
      !di?.deliveredAt &&
      !isCanceled &&
      (!Number.isFinite(statusCode) || statusCode < 11)
    );
  };

  const filteredBase = useMemo(() => {
    if (!Array.isArray(requests)) return [];

    if (showCompleted) {
      // 발송 탭: showCompleted가 켜져도 "접수전"은 포함
      if (tabStage === "shipping") {
        return requests.filter((req) => {
          if (isPrePickupShippingVisible(req)) return true;
          if (!filterRequests) return true;
          try {
            return filterRequests(req);
          } catch {
            return false;
          }
        });
      }
      return requests.filter((req) => {
        const stage = deriveStageForFilter(req);
        const order = stageOrder[stage] ?? 0;
        return order >= currentStageOrder;
      });
    }

    if (tabStage === "shipping") {
      return requests.filter((req) => {
        if (isPrePickupShippingVisible(req)) return true;
        try {
          return filterRequests ? filterRequests(req) : true;
        } catch {
          return false;
        }
      });
    }

    const base = filterRequests
      ? requests.filter((req) => {
          try {
            return filterRequests(req);
          } catch {
            return false;
          }
        })
      : requests;

    // 단계별 필터가 있으면 추가 필터 없이 그 결과 사용
    if (filterRequests) return base;

    // 기본(의뢰/CAM) 탭에서는 생산(가공후) 단계 이상은 제외
    return base.filter((req) => {
      const stage = deriveStageForFilter(req);
      const order = stageOrder[stage] ?? 0;
      // 현재 탭보다 높은 단계의 의뢰는 숨김 (단, showCompleted가 꺼져있을 때)
      return order <= currentStageOrder;
    });
  }, [currentStageOrder, filterRequests, requests, showCompleted, tabStage]);

  const filteredAndSorted = useMemo(() => {
    return filteredBase
      .filter((request) => {
        const caseInfos = request.caseInfos || {};
        const text = (
          (request.referenceIds?.join(",") || "") +
          (request.requestor?.organization || "") +
          (request.requestor?.name || "") +
          (caseInfos.clinicName || "") +
          (caseInfos.patientName || "") +
          (request.description || "") +
          (caseInfos.tooth || "") +
          (caseInfos.connectionDiameter || "") +
          (caseInfos.implantManufacturer || "") +
          (caseInfos.implantBrand || "") +
          (caseInfos.implantFamily || "") +
          (caseInfos.implantType || "")
        ).toLowerCase();
        return text.includes(searchLower);
      })
      .sort((a, b) => {
        const aScore = a.shippingPriority?.score ?? 0;
        const bScore = b.shippingPriority?.score ?? 0;
        if (aScore !== bScore) return bScore - aScore;
        return new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1;
      });
  }, [filteredBase, searchLower]);

  useEffect(() => {
    if (!Object.keys(mailboxErrorByAddress).length) return;
    setMailboxErrorByAddress((prev) => {
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
  }, [filteredAndSorted, mailboxErrorByAddress]);

  const getFilteredAndSortedRequests = useCallback(
    (sourceRequests: ManufacturerRequest[]) => {
      const base = (() => {
        if (showCompleted) {
          if (tabStage === "shipping") {
            return sourceRequests.filter((req) => {
              if (isPrePickupShippingVisible(req)) return true;
              if (!filterRequests) return true;
              try {
                return filterRequests(req);
              } catch {
                return false;
              }
            });
          }
          return sourceRequests.filter((req) => {
            const stage = deriveStageForFilter(req);
            const order = stageOrder[stage] ?? 0;
            return order >= currentStageOrder;
          });
        }

        if (tabStage === "shipping") {
          return sourceRequests.filter((req) => {
            if (isPrePickupShippingVisible(req)) return true;
            try {
              return filterRequests ? filterRequests(req) : true;
            } catch {
              return false;
            }
          });
        }

        const filtered = filterRequests
          ? sourceRequests.filter((req) => {
              try {
                return filterRequests(req);
              } catch {
                return false;
              }
            })
          : sourceRequests;

        if (filterRequests) return filtered;

        return filtered.filter((req) => {
          const stage = deriveStageForFilter(req);
          const order = stageOrder[stage] ?? 0;
          return order <= currentStageOrder;
        });
      })();

      return base
        .filter((request) => {
          const caseInfos = request.caseInfos || {};
          const text = (
            (request.referenceIds?.join(",") || "") +
            (request.requestor?.organization || "") +
            (request.requestor?.name || "") +
            (caseInfos.clinicName || "") +
            (caseInfos.patientName || "") +
            (request.description || "") +
            (caseInfos.tooth || "") +
            (caseInfos.connectionDiameter || "") +
            (caseInfos.implantManufacturer || "") +
            (caseInfos.implantBrand || "") +
            (caseInfos.implantFamily || "") +
            (caseInfos.implantType || "")
          ).toLowerCase();
          return text.includes(searchLower);
        })
        .sort((a, b) => {
          const aScore = a.shippingPriority?.score ?? 0;
          const bScore = b.shippingPriority?.score ?? 0;
          if (aScore !== bScore) return bScore - aScore;
          return new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1;
        });
    },
    [currentStageOrder, filterRequests, searchLower, showCompleted, tabStage],
  );

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

    // summary logs
    console.group("[WorksheetDebug][RequestPage]");
    console.log("tabStage", tabStage, "showCompleted", showCompleted);
    console.log("search", worksheetSearch);
    console.log("raw requests", requests.length);
    console.log("stage distribution (raw)", dist(requests, stageOf));
    console.log("diameter buckets (raw)", dist(requests, bucketOf));
    console.log("after base stage filter", filteredBase.length);
    console.log(
      "stage distribution (base)",
      dist(filteredBase as any, stageOf),
    );
    console.log("after search/sort", filteredAndSorted.length);
    console.log(
      "visibleCount",
      visibleCountRef.current,
      "totalCount",
      totalCountRef.current,
      "hasMore",
      hasMoreRef.current,
      "page",
      pageRef.current,
    );
    console.groupEnd();
  }, [
    DEBUG,
    requests,
    filteredBase,
    filteredAndSorted,
    showCompleted,
    worksheetSearch,
    tabStage,
  ]);

  const handleOpenNextRequest = useCallback(
    async (currentReqId: string) => {
      const currentIndex = filteredAndSorted.findIndex(
        (r) => r._id === currentReqId,
      );

      const preferredNextId =
        currentIndex >= 0
          ? filteredAndSorted[currentIndex + 1]?._id || null
          : null;

      if (!preferredNextId) {
        setPreviewOpen(false);
        return;
      }

      const refreshed = await refreshRequests(true);
      const latestList = Array.isArray(refreshed)
        ? getFilteredAndSortedRequests(refreshed as ManufacturerRequest[])
        : getFilteredAndSortedRequests(requests);

      const nextReq = latestList.find((r) => r._id === preferredNextId);

      if (!nextReq) {
        setPreviewOpen(false);
        return;
      }

      await handleOpenPreview(nextReq as ManufacturerRequest);
    },
    [
      filteredAndSorted,
      getFilteredAndSortedRequests,
      handleOpenPreview,
      refreshRequests,
      requests,
      setPreviewOpen,
    ],
  );

  useEffect(() => {
    visibleCountRef.current = 12;
    setVisibleCount(12);
  }, [worksheetSearch, showCompleted, tabStage]);

  const onScrollRef = useRef<(() => void) | null>(null);

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    const prev = scrollContainerRef.current;
    if (prev && onScrollRef.current) {
      prev.removeEventListener("scroll", onScrollRef.current as any);
      onScrollRef.current = null;
    }
    scrollContainerRef.current = node;
    if (!node) return;

    const onScroll = () => {
      userScrolledRef.current = true;
    };
    onScrollRef.current = onScroll;
    node.addEventListener("scroll", onScroll, { passive: true });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (!userScrolledRef.current) return;
        if (
          visibleCount >= filteredAndSorted.length - 3 &&
          hasMoreRef.current
        ) {
          void fetchNextPage();
        }
        if (visibleCount < filteredAndSorted.length) {
          setVisibleCount((prev) => prev + 9);
        }
      },
      { threshold: 0.2 },
    );

    const target = sentinelRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
      observer.disconnect();
    };
  }, [visibleCount, filteredAndSorted.length, fetchNextPage]);

  totalCountRef.current = filteredAndSorted.length;
  const paginatedRequests = filteredAndSorted.slice(0, visibleCount);

  useEffect(() => {
    if (tabStage !== "packing") return;
    setSelectedPackingRequestIds((prev) => {
      const validIds = new Set(
        filteredAndSorted.map((req) => String(req._id || "")).filter(Boolean),
      );
      const next = prev.filter((id) => validIds.has(id));
      if (!didInitPackingSelectionRef.current) {
        didInitPackingSelectionRef.current = true;
        return Array.from(validIds);
      }
      return next;
    });
  }, [filteredAndSorted, tabStage]);

  const handleTogglePackingRequest = useCallback((req: ManufacturerRequest) => {
    const id = String(req._id || "").trim();
    if (!id) return;
    setSelectedPackingRequestIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAllPackingRequests = useCallback(() => {
    setSelectedPackingRequestIds(
      filteredAndSorted.map((req) => String(req._id || "")).filter(Boolean),
    );
  }, [filteredAndSorted]);

  const handleClearPackingRequests = useCallback(() => {
    setSelectedPackingRequestIds([]);
  }, []);

  const handleRegisterShipment = useCallback(
    async (address: string, reqs: ManufacturerRequest[]) => {
      if (!reqs.length) return;
      setMailboxModalAddress(address);
      setMailboxModalRequests(reqs);
      setIsRollingBackAll(false);
      setMailboxModalOpen(true);
    },
    [],
  );

  const handleShipmentModalClose = useCallback(() => {
    setMailboxModalOpen(false);
    setMailboxModalAddress("");
    setMailboxModalRequests([]);
    setIsRollingBackAll(false);
  }, []);

  useEffect(() => {
    if (!mailboxModalOpen || !mailboxModalAddress) return;
    const next = requests.filter(
      (req) => req.mailboxAddress === mailboxModalAddress,
    );
    setMailboxModalRequests(next);
  }, [requests, mailboxModalOpen, mailboxModalAddress]);

  useEffect(() => {
    if (!mailboxModalOpen) return;
    if (mailboxModalRequests.length > 0) return;
    handleShipmentModalClose();
  }, [mailboxModalRequests.length, mailboxModalOpen, handleShipmentModalClose]);

  const handleRollbackAllInMailbox = useCallback(async () => {
    if (
      !mailboxModalRequests.length ||
      isRollingBackAll ||
      !mailboxModalAddress ||
      !token
    )
      return;
    setIsRollingBackAll(true);
    try {
      const res = await fetch("/api/requests/shipping/mailbox-rollback", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mailboxAddress: mailboxModalAddress,
          requestIds: mailboxModalRequests
            .map((req) => req._id)
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        let message = "전체 롤백에 실패했습니다.";
        try {
          const body = await res.json().catch(() => null);
          if (body?.message) message = body.message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      await fetchRequests();
      toast({
        title: "박스 전체 롤백 완료",
        description: "우편함 롤백을 완료했습니다.",
        duration: 3000,
      });
    } finally {
      setIsRollingBackAll(false);
    }
  }, [
    fetchRequests,
    isRollingBackAll,
    mailboxModalAddress,
    mailboxModalRequests,
    toast,
    token,
  ]);

  const diameterQueueForReceive = useMemo(() => {
    const labels: DiameterBucketKey[] = ["6", "8", "10", "12"];
    const counts = labels.map(() => 0);
    const buckets: Record<DiameterBucketKey, WorksheetQueueItem[]> = {
      "6": [],
      "8": [],
      "10": [],
      "12": [],
    };

    for (const req of filteredAndSorted) {
      const caseInfos = req.caseInfos || {};
      const bucketIndex = getDiameterBucketIndex(caseInfos.maxDiameter);
      const item: WorksheetQueueItem = {
        id: req._id,
        client: req.requestor?.organization || req.requestor?.name || "",
        patient: caseInfos.patientName || "",
        tooth: caseInfos.tooth || "",
        connectionDiameter:
          typeof caseInfos.connectionDiameter === "number" &&
          Number.isFinite(caseInfos.connectionDiameter)
            ? caseInfos.connectionDiameter
            : null,
        maxDiameter:
          typeof caseInfos.maxDiameter === "number" &&
          Number.isFinite(caseInfos.maxDiameter)
            ? caseInfos.maxDiameter
            : null,
        camDiameter:
          typeof req.productionSchedule?.diameter === "number" &&
          Number.isFinite(req.productionSchedule.diameter)
            ? req.productionSchedule.diameter
            : null,
        programText: req.description,
        qty: 1, // 기본 1개로 가정
      };

      if (bucketIndex === 0) {
        counts[0]++;
        buckets["6"].push(item);
      } else if (bucketIndex === 1) {
        counts[1]++;
        buckets["8"].push(item);
      } else if (bucketIndex === 2) {
        counts[2]++;
        buckets["10"].push(item);
      } else {
        counts[3]++;
        buckets["12"].push(item);
      }
    }

    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total, buckets };
  }, [filteredAndSorted]);

  if (isLoading) {
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
        userScrolledRef.current = true;
        const node = scrollContainerRef.current;
        if (
          node &&
          node.scrollHeight <= node.clientHeight + 20 &&
          hasMoreRef.current
        ) {
          void fetchNextPage();
        }
      }}
      onScrollCapture={() => {
        userScrolledRef.current = true;
      }}
    >
      <div
        className="flex-1 overflow-y-auto"
        ref={setScrollContainer}
        data-worksheet-scroll="1"
        onScroll={() => {
          userScrolledRef.current = true;
          onScrollRef.current?.();
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
                    handleRegisterShipment(address, reqs)
                  }
                  onMailboxError={(address, message) => {
                    const key = String(address || "").trim();
                    if (!key) return;
                    const normalized = String(message || "").trim();
                    if (!normalized) return;
                    setMailboxErrorByAddress((prev) => ({
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
                      disabled={!selectedPackingRequestIds.length}
                    >
                      전체 해제
                    </Button>
                    <div className="text-xs text-slate-500">
                      선택 {selectedPackingRequestIds.length} / 전체{" "}
                      {filteredAndSorted.length}
                    </div>
                  </div>
                )}
                <WorksheetCardGrid
                  requests={paginatedRequests}
                  selectedRequestIds={
                    tabStage === "packing" ? selectedPackingRequestIds : []
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
                  uploadProgress={uploadProgress}
                  uploading={uploading}
                  deletingCam={deletingCam}
                  deletingNc={deletingNc}
                  isCamStage={isCamStage}
                  isMachiningStage={isMachiningStage}
                  downloading={downloading}
                  currentStageOrder={currentStageOrder}
                  tabStage={tabStage}
                />

                <div
                  ref={sentinelRef}
                  className="py-4 text-center text-gray-500"
                >
                  {visibleCount >= filteredAndSorted.length
                    ? "모든 의뢰를 표시했습니다."
                    : "스크롤하여 더보기"}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <WorksheetDiameterQueueModal
        open={receiveQueueModalOpen}
        onOpenChange={setReceiveQueueModalOpen}
        processLabel={`커스텀어벗 > ${currentStageForTab}`}
        queues={diameterQueueForReceive.buckets}
        selectedBucket={receiveSelectedBucket}
        onSelectBucket={setReceiveSelectedBucket}
      />

      <MailboxContentsModal
        open={mailboxModalOpen}
        onOpenChange={handleShipmentModalClose}
        address={mailboxModalAddress}
        requests={mailboxModalRequests}
        errorMessage={mailboxErrorByAddress[mailboxModalAddress] || ""}
        onRollback={handleCardRollback}
        onRollbackAll={
          mailboxModalRequests.length ? handleRollbackAllInMailbox : undefined
        }
        isRollingBackAll={isRollingBackAll}
      />

      <PreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        previewLoading={previewLoading}
        previewFiles={previewFiles}
        previewNcText={previewNcText}
        previewNcName={previewNcName}
        previewStageUrl={previewStageUrl}
        previewStageName={previewStageName}
        uploading={uploading}
        reviewSaving={reviewSaving}
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
        setConfirmTitle={setConfirmTitle}
        setConfirmDescription={setConfirmDescription}
        setConfirmAction={setConfirmAction}
        setConfirmOpen={setConfirmOpen}
        onOpenNextRequest={handleOpenNextRequest}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="확인"
        cancelLabel="취소"
        onConfirm={async () => {
          if (!confirmAction) return;
          const action = confirmAction;
          // 즉시 상태 초기화하여 중복 실행 및 UI 깜빡임 방지
          setConfirmOpen(false);
          setConfirmAction(null);

          try {
            await action();
          } catch (error) {
            console.error("Confirm action failed:", error);
          }
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
      />
    </div>
  );
};

export default RequestPage;
