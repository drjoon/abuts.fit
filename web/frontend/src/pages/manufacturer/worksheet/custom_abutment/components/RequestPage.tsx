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
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";
import {
  onCncMachiningCompleted,
  onCncMachiningTick,
  onNotification,
} from "@/shared/realtime/socket";

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
  const [visibleCount, setVisibleCount] = useState(9);
  const visibleCountRef = useRef(9);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const totalCountRef = useRef(0);
  const [mailboxModalOpen, setMailboxModalOpen] = useState(false);
  const [mailboxModalAddress, setMailboxModalAddress] = useState("");
  const [mailboxModalRequests, setMailboxModalRequests] = useState<
    ManufacturerRequest[]
  >([]);

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
    async (silent = false) => {
      if (!token) return null;

      try {
        if (!silent) setIsLoading(true);
        const basePath =
          user?.role === "admin"
            ? "/api/admin/requests"
            : user?.role === "manufacturer"
              ? "/api/requests/all"
              : "/api/requests";

        const path = (() => {
          if (user?.role !== "manufacturer") return basePath;
          const url = new URL(basePath, window.location.origin);
          // /api/requests/all 은 기본 limit=10 페이지네이션이므로, 워크시트 집계/큐바를 위해 넉넉히 가져온다.
          url.searchParams.set("page", "1");
          url.searchParams.set("limit", "5000");
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
          setRequests(list);
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
    [token, user?.role, toast],
  );

  const fetchRequests = useCallback(
    async (silent = false) => {
      await fetchRequestsCore(silent);
    },
    [fetchRequestsCore],
  );

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
    fetchRequests,
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

  useEffect(() => {
    if (!token) return;

    const unsubBg = onNotification((notification: any) => {
      const type = String(notification?.type || "").trim();
      if (type !== "bg-file-processed") return;

      const requestId = String(notification?.data?.requestId || "").trim();
      if (!requestId) {
        void fetchRequests(true);
        return;
      }

      void (async () => {
        const list = await fetchRequestsCore(true);
        if (!previewOpen) return;
        if (!list || !Array.isArray(list) || list.length === 0) return;

        const updated = list.find(
          (r: any) => String(r?.requestId || "").trim() === requestId,
        );
        if (!updated) return;

        const currentRid = String(
          (previewFiles as any)?.request?.requestId || "",
        ).trim();
        if (currentRid && currentRid !== requestId) return;

        await handleOpenPreview(updated as any);
      })();
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
        void fetchRequests(true);
        return;
      }

      setRequests((prev) =>
        prev.filter((r) => {
          const rid = String((r as any)?.requestId || "").trim();
          return rid !== requestId;
        }),
      );

      void fetchRequests(true);
    });

    const handleRequestRollback = () => {
      void fetchRequests();
    };

    window.addEventListener("request-rollback", handleRequestRollback);

    return () => {
      if (typeof unsubBg === "function") unsubBg();
      if (typeof unsubTick === "function") unsubTick();
      if (typeof unsubCompleted === "function") unsubCompleted();
      window.removeEventListener("request-rollback", handleRequestRollback);
    };
  }, [
    fetchRequests,
    fetchRequestsCore,
    handleOpenPreview,
    previewFiles,
    previewOpen,
    token,
  ]);

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
    [handleUploadByStage],
  );

  const handleCardRollback = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;

      const stage = deriveStageForFilter(req);

      // 항상 "현재 카드 단계"에서 직전 단계로 롤백
      if (stage === "가공") {
        void handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
        });
        return;
      }

      if (stage === "CAM") {
        void handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
        return;
      }

      if (stage === "세척.포장" || stage === "세척.패킹") {
        void handleDeleteStageFile({
          req,
          stage: "packing",
          rollbackOnly: true,
        });
        return;
      }

      if (stage === "발송" || stage === "포장.발송") {
        // 포장.발송 단계 롤백: 세척.패킹 단계로 되돌리기
        void handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
        return;
      }

      if (stage === "추적관리") {
        void handleDeleteStageFile({
          req,
          stage: "tracking",
          rollbackOnly: true,
        });
        return;
      }

      if (tabStage === "machining") {
        void handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
        });
        return;
      }

      if (tabStage === "cam") {
        void handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
        return;
      }

      if (tabStage === "shipping") {
        // 포장.발송 탭에서 롤백: 세척.패킹 단계로 되돌리기
        void handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
        return;
      }

      if (tabStage === "tracking") {
        void handleDeleteStageFile({
          req,
          stage: "tracking",
          rollbackOnly: true,
        });
        return;
      }
    },
    [tabStage, handleDeleteStageFile, handleDeleteNc, handleUpdateReviewStatus],
  );

  const handleCardApprove = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stageKey = getReviewStageKeyByTab({
        stage: tabStage,
        isCamStage,
        isMachiningStage,
      });
      void handleUpdateReviewStatus({
        req,
        status: "APPROVED",
        stageOverride: stageKey,
      });
    },
    [tabStage, isCamStage, isMachiningStage, handleUpdateReviewStatus],
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
    tabStage === "tracking";

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

  const filteredBase = (() => {
    // 완료포함: 탭 기준 단계 이상 모든 건 포함 (CAM 탭=CAM~추적관리, 생산 탭=생산~추적관리)
    if (showCompleted) {
      // 발송 탭에서는 "발송" 단계만 보여주되(WorkSheet.tsx filterRequests), 완료 포함은 status 기준 숨김을 해제하는 의미다.
      if (tabStage === "shipping") {
        return requests.filter((req) => {
          const stage = String(req.manufacturerStage || "").trim();
          if (stage === "추적관리") return true;
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

    // 발송 탭 기본: 완료 건은 숨김 (헤더의 완료포함 체크 시에만 노출)
    if (tabStage === "shipping") {
      return requests.filter((req) => {
        const stage = String(req.manufacturerStage || "").trim();
        if (stage === "추적관리") return false;
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
  })();

  const filteredAndSorted = filteredBase
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
        (caseInfos.implantSystem || "") +
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

  const handleOpenNextRequest = useCallback(
    (currentReqId: string) => {
      const currentIndex = filteredAndSorted.findIndex(
        (r) => r._id === currentReqId,
      );
      if (currentIndex === -1) return;

      const nextReq = filteredAndSorted[currentIndex + 1];
      if (!nextReq) {
        // 마지막 카드인 경우 모달 닫기
        setPreviewOpen(false);
        return;
      }

      setTimeout(() => {
        void handleOpenPreview(nextReq);
      }, 200);
    },
    [filteredAndSorted, handleOpenPreview, setPreviewOpen],
  );

  totalCountRef.current = filteredAndSorted.length;
  const paginatedRequests = filteredAndSorted.slice(0, visibleCount);

  useEffect(() => {
    visibleCountRef.current = 9;
    setVisibleCount(9);
  }, [worksheetSearch, showCompleted, tabStage]);

  const onScrollRef = useRef<(() => void) | null>(null);

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    if (!node) return;
    const maybeLoadMore = () => {
      if (visibleCountRef.current >= totalCountRef.current) return;

      const nearBottom =
        node.scrollTop + node.clientHeight >= node.scrollHeight - 300;
      const notScrollable = node.scrollHeight <= node.clientHeight + 20;

      if (!nearBottom && !notScrollable) return;

      visibleCountRef.current = Math.min(
        visibleCountRef.current + 9,
        totalCountRef.current,
      );
      setVisibleCount(visibleCountRef.current);
      requestAnimationFrame(maybeLoadMore);
    };

    onScrollRef.current = maybeLoadMore;
    requestAnimationFrame(maybeLoadMore);
  }, []);

  useEffect(() => {
    const fn = onScrollRef.current;
    if (!fn) return;
    requestAnimationFrame(fn);
  }, [filteredAndSorted.length]);

  useLayoutEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    if (visibleCountRef.current >= totalCountRef.current) return;

    const maybeFill = () => {
      if (visibleCountRef.current >= totalCountRef.current) return;
      const notScrollable = node.scrollHeight <= node.clientHeight + 20;
      if (!notScrollable) return;

      visibleCountRef.current = Math.min(
        visibleCountRef.current + 9,
        totalCountRef.current,
      );
      setVisibleCount(visibleCountRef.current);
      requestAnimationFrame(maybeFill);
    };

    requestAnimationFrame(maybeFill);
  }, [visibleCount, filteredAndSorted.length]);

  const handleRegisterShipment = useCallback(
    async (address: string, reqs: ManufacturerRequest[]) => {
      if (!reqs.length) return;
      setMailboxModalAddress(address);
      setMailboxModalRequests(reqs);
      setMailboxModalOpen(true);
    },
    [],
  );

  const handleShipmentModalClose = useCallback(() => {
    setMailboxModalOpen(false);
    setMailboxModalAddress("");
    setMailboxModalRequests([]);
  }, []);

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
    >
      <div
        className="flex-1 overflow-y-auto"
        ref={setScrollContainer}
        data-worksheet-scroll="1"
        onScroll={() => onScrollRef.current?.()}
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
                  requests={filteredAndSorted.filter((r) => r.mailboxAddress)}
                  onBoxClick={(address, reqs) =>
                    handleRegisterShipment(address, reqs)
                  }
                />
              </div>
            ) : isEmpty ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
                표시할 의뢰가 없습니다.
              </div>
            ) : (
              <WorksheetCardGrid
                requests={paginatedRequests}
                onDownload={handleDownloadOriginal}
                onOpenPreview={handleOpenPreview}
                onDeleteCam={handleDeleteCam}
                onDeleteNc={handleDeleteNc}
                onRollback={enableCardRollback ? handleCardRollback : undefined}
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
            )}
            {!isEmpty &&
              tabStage !== "machining" &&
              visibleCount < filteredAndSorted.length && (
                <div className="flex justify-center py-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      visibleCountRef.current = Math.min(
                        visibleCountRef.current + 9,
                        totalCountRef.current,
                      );
                      setVisibleCount(visibleCountRef.current);
                    }}
                  >
                    더 보기
                  </Button>
                </div>
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
        onRollback={handleCardRollback}
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
