import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { generateModelNumber } from "@/utils/modelNumber";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { WorksheetQueueSummary } from "@/shared/ui/dashboard/WorksheetQueueSummary";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";
import {
  type ManufacturerRequest,
  deriveStageForFilter,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { shouldShowRequestInIncludeCompleted } from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";
import { WorksheetCardGrid } from "../../components/WorksheetCardGrid";
import { PreviewModal } from "../../components/PreviewModal";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import { usePreviewLoader } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useWorksheetRealtimeStatus } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus";
import { PackingPrinterSettingsDialog } from "../components/PackingPrinterSettingsDialog";
import { usePackingPrintSettings } from "../hooks/usePackingPrintSettings";
import { usePackingWorksheetData } from "../hooks/usePackingWorksheetData";
import {
  usePackingCapture,
  type CaptureResult,
} from "../hooks/usePackingCapture";
import {
  buildPackLabelBitmapZpl,
  getLotLabel,
  renderPackLabelToCanvas,
  resolveManufacturingDate,
} from "../utils/packLabelRenderer";
import { savePackingLabelsAsZip } from "../utils/packLabelZip";
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";
import { Settings } from "lucide-react";

export const PackingPageContent = ({
  showQueueBar = true,
}: {
  showQueueBar?: boolean;
}) => {
  const queryClient = useQueryClient();
  const { user, token } = useAuthStore();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabStage = "packing";
  const { toast } = useToast();

  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<any>({});
  const [reviewSaving, setReviewSaving] = useState(false);
  const [previewNcText, setPreviewNcText] = useState("");
  const [previewNcName, setPreviewNcName] = useState("");
  const [previewStageUrl, setPreviewStageUrl] = useState("");
  const [previewStageName, setPreviewStageName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDescription, setConfirmDescription] = useState<ReactNode>("");
  const [confirmAction, setConfirmAction] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [deletingNc, setDeletingNc] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [isPrintingPackingLabels, setIsPrintingPackingLabels] = useState(false);
  const [selectedPackingRequestIds, setSelectedPackingRequestIds] = useState<
    string[]
  >([]);
  const didInitPackingSelectionRef = useRef(false);
  const [captureHistory, setCaptureHistory] = useState<CaptureResult[]>([]);

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

  const {
    requests,
    setRequests,
    isLoading,
    hideRequestFromList,
    restoreHiddenRequest,
    fetchRequestsList,
    fetchRequests,
    filteredAndSorted,
    paginatedRequests,
    currentStageOrder,
    diameterQueueForPacking,
    visibleCount,
    serverTotal,
    sentinelRef,
    userScrolledRef,
  } = usePackingWorksheetData({
    token,
    userRole: user?.role,
    showCompleted,
    worksheetSearch,
    toast,
  });

  const allPackingRequestIds = useMemo(
    () => filteredAndSorted.map((req) => String(req._id || "")).filter(Boolean),
    [filteredAndSorted],
  );

  const paginatedPackingRequestIdSet = useMemo(
    () =>
      new Set(
        paginatedRequests.map((req) => String(req._id || "")).filter(Boolean),
      ),
    [paginatedRequests],
  );

  const printedPackingCount = useMemo(
    () =>
      filteredAndSorted.filter((req) =>
        Boolean((req as any)?.shippingLabelPrinted?.printed),
      ).length,
    [filteredAndSorted],
  );

  const printedPackingRequestIds = useMemo(
    () =>
      filteredAndSorted
        .filter((req) => Boolean((req as any)?.shippingLabelPrinted?.printed))
        .map((req) => String(req._id || ""))
        .filter(Boolean),
    [filteredAndSorted],
  );

  const unprintedPackingRequestIds = useMemo(
    () =>
      filteredAndSorted
        .filter((req) => !Boolean((req as any)?.shippingLabelPrinted?.printed))
        .map((req) => String(req._id || ""))
        .filter(Boolean),
    [filteredAndSorted],
  );

  const {
    printerProfile,
    setPrinterProfile,
    paperProfile,
    setPaperProfile,
    paperOptions,
    paperLoading,
    paperError,
    printerOptions,
    printerLoading,
    printerError,
    printerModalOpen,
    setPrinterModalOpen,
    packOutputMode,
    setPackOutputMode,
    packLabelDpi,
    packLabelDots,
    packLabelDesignDots,
    fetchPrinters,
  } = usePackingPrintSettings({ token });

  const matchesCurrentPage = useCallback(
    (req: ManufacturerRequest) => {
      const isDoneRndSample =
        String(req.source || "").trim() === "manufacturer_sample" &&
        Boolean(req.rnd?.doneAt);
      const isUnmachinable = Boolean(req.rnd?.unmachinableAt);
      if (isDoneRndSample || isUnmachinable) return false;
      if (showCompleted) {
        return shouldShowRequestInIncludeCompleted(req, currentStageOrder);
      }
      return deriveStageForFilter(req) === "세척.패킹";
    },
    [currentStageOrder, showCompleted],
  );

  const {
    handleDownloadOriginalStl,
    handleDownloadNcFile,
    handleDownloadStageFile,
    handleUpdateReviewStatus,
    handleDeleteNc,
    handleUploadStageFile,
    handleDeleteStageFile,
  } = useRequestFileHandlers({
    token,
    stage: tabStage,
    isCamStage: false,
    isMachiningStage: false,
    fetchRequests,
    setRequests,
    matchesCurrentPage,
    setDownloading,
    setUploading,
    setUploadProgress,
    setDeletingCam: () => {},
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
  });

  const { handleOpenPreview } = usePreviewLoader({
    token,
    isCamStage: false,
    isMachiningStage: false,
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

  useWorksheetRealtimeStatus({
    enabled: true,
    token,
    setRequests,
    fetchRequests,
    fetchRequestsCore: fetchRequestsList,
    previewOpen,
    previewFiles,
    handleOpenPreview,
    removeOnMachiningComplete: false,
    matchesCurrentPage,
  });

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) =>
      handleUploadStageFile({
        req,
        stage: "packing",
        file: files[0],
        source: "manual",
      }),
    [handleUploadStageFile],
  );

  const handleCardApprove = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;
      void handleUpdateReviewStatus({
        req,
        status: "APPROVED",
        stageOverride: "packing",
      });
    },
    [handleUpdateReviewStatus],
  );

  const handleCardRollback = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stage = deriveStageForFilter(req);
      if (stage === "가공") {
        void handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
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
      }
    },
    [handleDeleteStageFile, handleUpdateReviewStatus],
  );

  const handleSaveToRnd = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      try {
        const res = await fetch(`/api/requests/${req._id}/clone-as-sample`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "R&D 저장에 실패했습니다.");
        }
        toast({
          title: "R&D 저장 완료",
          description: `R&D 페이지로 샘플 복사 저장 완료 (새 의뢰ID: ${data?.data?.requestId || "-"})`,
        });
        // 저장 직후 상단 탭 카운트를 즉시 반영
        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        toast({
          title: "R&D 저장 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });
      }
    },
    [queryClient, toast, token],
  );

  const handleCardDelete = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const isSample =
        String(req.source || "").trim() === "manufacturer_sample";
      if (!isSample) {
        toast({
          title: "삭제 불가",
          description: "R&D 샘플만 삭제할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }
      const requestMongoId = String(req._id || "").trim();
      const requestRid = String(req.requestId || "").trim();
      setRequests((prev) =>
        prev.filter((item) => {
          const itemMongoId = String(item?._id || "").trim();
          const itemRid = String(item?.requestId || "").trim();
          if (requestMongoId && itemMongoId === requestMongoId) return false;
          if (requestRid && itemRid === requestRid) return false;
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
        setRequests((prev) => {
          const exists = prev.some((item) => {
            const itemMongoId = String(item?._id || "").trim();
            const itemRid = String(item?.requestId || "").trim();
            return (
              (requestMongoId && itemMongoId === requestMongoId) ||
              (requestRid && itemRid === requestRid)
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
    [queryClient, setRequests, toast, token],
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
      setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            rnd: {
              ...(item.rnd || {}),
              doneAt: optimisticDoneAt,
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
        setRequests((prev) =>
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
    [queryClient, setRequests, toast, token],
  );

  const handleMarkUnmachinable = useCallback(
    async (req: ManufacturerRequest, reasonRaw: string) => {
      if (!req?._id) return;
      const reason = String(reasonRaw || "").slice(0, 500).trim();
      if (!reason) {
        throw new Error("가공불가 사유를 입력해주세요.");
      }

      const requestMongoId = String(req._id || "").trim();
      hideRequestFromList(req);
      const prevAt = req.rnd?.unmachinableAt || null;
      const prevReason = String(req.rnd?.unmachinableReason || "");
      const prevFromStage = String(req.rnd?.unmachinableFromStage || "") || null;
      const optimisticAt = new Date().toISOString();

      setRequests((prev) =>
        prev.map((item) => {
          if (String(item?._id || "").trim() !== requestMongoId) return item;
          return {
            ...item,
            rnd: {
              ...(item.rnd || {}),
              unmachinableAt: optimisticAt,
              unmachinableReason: reason,
              unmachinableFromStage:
                String(item.manufacturerStage || "").trim() || null,
            },
          };
        }),
      );

      try {
        const res = await fetch(`/api/requests/${req._id}/rnd-unmachinable`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unmachinable: true,
            reason,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "가공불가 처리에 실패했습니다.");
        }

        toast({
          title: "가공불가 처리 완료",
          description: `의뢰 ${req.requestId}가 가공불가 탭으로 이동되었습니다.`,
        });

        // 현재 탭 목록에서 해당 의뢰만 즉시 제거해 잔상을 방지한다.
        setRequests((prev) =>
          prev.filter((item) => String(item?._id || "").trim() !== requestMongoId),
        );

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        restoreHiddenRequest(req);
        setRequests((prev) =>
          prev.map((item) => {
            if (String(item?._id || "").trim() !== requestMongoId) return item;
            return {
              ...item,
              rnd: {
                ...(item.rnd || {}),
                unmachinableAt: prevAt,
                unmachinableReason: prevReason,
                unmachinableFromStage: prevFromStage,
              },
            };
          }),
        );

        toast({
          title: "가공불가 처리 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });

        throw e;
      }
    },
    [hideRequestFromList, queryClient, restoreHiddenRequest, setRequests, toast, token],
  );

  const handleTogglePackingRequest = useCallback((req: ManufacturerRequest) => {
    const id = String(req._id || "").trim();
    if (!id) return;
    setSelectedPackingRequestIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAllPackingRequests = useCallback(() => {
    setSelectedPackingRequestIds(allPackingRequestIds);
  }, [allPackingRequestIds]);

  const handleSelectUnprintedPackingRequests = useCallback(() => {
    setSelectedPackingRequestIds(unprintedPackingRequestIds);
  }, [unprintedPackingRequestIds]);

  const handleSelectPrintedPackingRequests = useCallback(() => {
    setSelectedPackingRequestIds(printedPackingRequestIds);
  }, [printedPackingRequestIds]);

  const handleClearPackingRequests = useCallback(() => {
    setSelectedPackingRequestIds([]);
  }, []);

  useEffect(() => {
    setSelectedPackingRequestIds((prev) => {
      const validIds = new Set(allPackingRequestIds);
      const next = prev.filter((id) => validIds.has(id));
      if (!didInitPackingSelectionRef.current) {
        didInitPackingSelectionRef.current = true;
        return unprintedPackingRequestIds;
      }
      return next;
    });
  }, [allPackingRequestIds, unprintedPackingRequestIds]);

  const handleOpenNextRequest = useCallback(
    async (currentReqId: string) => {
      const currentIndex = filteredAndSorted.findIndex(
        (r) => r._id === currentReqId,
      );
      const preferredNextId =
        currentIndex >= 0
          ? filteredAndSorted[currentIndex + 1]?._id || null
          : null;

      const refreshed = await fetchRequestsList(true, false);
      const latestList = Array.isArray(refreshed) ? refreshed : requests;
      const latestFilteredAndSorted = latestList
        .filter((req) => {
          const isDoneRndSample =
            String(req.source || "").trim() === "manufacturer_sample" &&
            Boolean(req.rnd?.doneAt);
          const isUnmachinable = Boolean(req.rnd?.unmachinableAt);
          if (isDoneRndSample || isUnmachinable) return false;
          if (showCompleted) {
            return shouldShowRequestInIncludeCompleted(req, currentStageOrder);
          }
          return deriveStageForFilter(req) === "세척.패킹";
        })
        .filter((request) => {
          const caseInfos = request.caseInfos || {};
          const text = (
            (request.referenceIds?.join(",") || "") +
            (request.requestor?.business || "") +
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
          const normalizedSearch = worksheetSearch.trim().toLowerCase();
          if (!normalizedSearch) return true;
          return text.includes(normalizedSearch);
        })
        .sort((a, b) => {
          const aScore = a.shippingPriority?.score ?? 0;
          const bScore = b.shippingPriority?.score ?? 0;
          if (aScore !== bScore) return bScore - aScore;
          return new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1;
        });

      let nextReq: ManufacturerRequest | undefined;
      if (preferredNextId) {
        nextReq = latestFilteredAndSorted.find(
          (r) => r._id === preferredNextId,
        );
      }
      if (!nextReq) {
        nextReq = latestFilteredAndSorted.find((r) => r._id !== currentReqId);
      }
      if (!nextReq) {
        setPreviewOpen(false);
        return;
      }

      await handleOpenPreview(nextReq);
    },
    [
      fetchRequestsList,
      filteredAndSorted,
      handleOpenPreview,
      requests,
      setPreviewOpen,
      currentStageOrder,
      showCompleted,
      worksheetSearch,
    ],
  );

  const handlePrintSinglePackingLabel = useCallback(
    async (
      req: ManufacturerRequest,
      options?: {
        silentSuccess?: boolean;
        silentError?: boolean;
      },
    ) => {
      const requireNonEmptyString = (
        value: unknown,
        fieldLabel: string,
        request: ManufacturerRequest,
      ) => {
        if (typeof value !== "string") {
          throw new Error(
            `${request.requestId || "의뢰"}: ${fieldLabel} 값이 비어 있습니다. 백엔드 데이터를 확인해주세요.`,
          );
        }
        const text = value.trim();
        if (!text) {
          throw new Error(
            `${request.requestId || "의뢰"}: ${fieldLabel} 값이 비어 있습니다. 백엔드 데이터를 확인해주세요.`,
          );
        }
        return text;
      };

      const resolvePackMailboxCode = (request: ManufacturerRequest) =>
        requireNonEmptyString(request.mailboxAddress, "메일함 코드", request);

      const resolvePackFullLotNumber = (request: ManufacturerRequest) => {
        const value = String((request as any)?.lotNumber?.value || "").trim();
        return requireNonEmptyString(value, "풀 로트번호", request);
      };

      const caseInfos = req.caseInfos || {};
      const fullLotNumber = resolvePackFullLotNumber(req);
      const labName = requireNonEmptyString(
        (req as any)?.requestorBusinessAnchor?.name ||
          (req as any)?.business?.name,
        "사업자명",
        req,
      );
      const implantManufacturer = requireNonEmptyString(
        (caseInfos as any)?.implantManufacturer,
        "제조사",
        req,
      );
      const clinicName = requireNonEmptyString(
        caseInfos.clinicName,
        "치과명",
        req,
      );
      const implantBrand = requireNonEmptyString(
        (caseInfos as any)?.implantBrand,
        "브랜드",
        req,
      );
      const implantFamily = requireNonEmptyString(
        (caseInfos as any)?.implantFamily,
        "패밀리",
        req,
      );
      const implantType = requireNonEmptyString(
        (caseInfos as any)?.implantType,
        "타입",
        req,
      );
      const patientName = requireNonEmptyString(
        caseInfos.patientName,
        "환자명",
        req,
      );
      const toothNumber = requireNonEmptyString(
        caseInfos.tooth,
        "치아번호",
        req,
      );
      const createdAtIso = req.createdAt ? String(req.createdAt) : "";
      const { manufacturingDate, rawSources } = resolveManufacturingDate(req);

      if (!manufacturingDate) {
        console.warn(
          "[PackingPage] manufacturing date missing for pack label",
          {
            requestId: req.requestId,
            manufacturerStage: req.manufacturerStage,
            productionSchedule: req.productionSchedule,
            rawSources,
            reviewByStage: req.caseInfos?.reviewByStage,
          },
        );
        throw new Error(
          `${req.requestId || fullLotNumber || "의뢰"}: 제조일자를 확인할 수 없어 라벨을 생성할 수 없습니다.`,
        );
      }

      const material =
        (typeof (caseInfos as any)?.material === "string" &&
          (caseInfos as any).material) ||
        (typeof (req as any)?.material === "string" && (req as any).material) ||
        (typeof (req.lotNumber as any)?.material === "string" &&
          (req.lotNumber as any).material) ||
        "";
      const mailboxCode = resolvePackMailboxCode(req);
      const resolvedSpec = resolveImplantConnectionSpec({
        implantManufacturer,
        implantBrand,
        implantFamily,
        implantType,
        connectionDiameter: (caseInfos as any)?.connectionDiameter,
      });
      const screwType = resolvedSpec.screwType || "-";
      const connectionDiameter =
        resolvedSpec.connectionDiameter != null
          ? resolvedSpec.connectionDiameter
          : Number.isFinite(Number((caseInfos as any)?.connectionDiameter))
            ? Number((caseInfos as any)?.connectionDiameter)
            : null;
      // 모델명: CA + 각도(aaa) + 최대직경(ddd) + 최대높이(lll) (로트번호 미포함)
      const modelNumber = generateModelNumber(caseInfos as any);
      const modelName = modelNumber ? `CA${modelNumber}` : "";
      const payload = {
        printer: printerProfile || undefined,
        paperProfile: paperProfile || undefined,
        copies: 1,
        requestId: req.requestId,
        lotNumber: fullLotNumber,
        mailboxCode,
        screwType,
        clinicName,
        labName,
        requestDate: createdAtIso,
        manufacturingDate,
        implantManufacturer,
        implantBrand,
        implantFamily,
        implantType,
        connectionDiameter,
        patientName,
        toothNumber,
        material,
        modelName,
        caseType: "Custom Abutment",
        printedAt: new Date().toISOString(),
      };

      const canvas = await renderPackLabelToCanvas({
        ...payload,
        dpi: packLabelDpi,
        targetDots: packLabelDots,
        designDots: packLabelDesignDots,
      });

      const zpl = buildPackLabelBitmapZpl({
        canvas,
        labelWidth: packLabelDots?.pw,
        labelHeight: packLabelDots?.ll,
      });
      const response = await fetch("/api/requests/packing/print-zpl", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          printer: payload.printer,
          paperProfile: payload.paperProfile,
          copies: payload.copies,
          requestId: payload.requestId,
          title:
            `Custom Abutment Packing ${payload.requestId || fullLotNumber || ""}`.trim(),
          zpl,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "패킹 라벨 출력에 실패했습니다.");
      }
      if (!options?.silentSuccess) {
        toast({
          title: "패킹 라벨 출력 완료",
          description: `${req.requestId || fullLotNumber} (${generateModelNumber((req as any)?.caseInfos) || ""}) 라벨을 출력했습니다.`,
        });
      }
    },
    [
      packLabelDesignDots,
      packLabelDots,
      packLabelDpi,
      packOutputMode,
      paperProfile,
      printerProfile,
      toast,
      token,
    ],
  );

  const handleCaptureResult = useCallback((result: CaptureResult) => {
    setCaptureHistory((prev) => [result, ...prev].slice(0, 20));
  }, []);

  const {
    isDraggingOver,
    ocrProcessing,
    ocrStage,
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
  } = usePackingCapture({
    token,
    requests,
    toast,
    setRequests,
    previewOpen,
    previewFiles,
    handleOpenPreview,
    onCaptureResult: handleCaptureResult,
  });

  const handlePrintPackingLabels = useCallback(async () => {
    const selectedRequests = paginatedRequests.filter((req) =>
      selectedPackingRequestIds.includes(String(req._id || "")),
    );
    if (!selectedRequests.length) {
      toast({
        title: "출력할 의뢰 없음",
        description: "선택된 의뢰가 없습니다.",
        variant: "destructive",
      });
      return;
    }
    setIsPrintingPackingLabels(true);

    if (packOutputMode === "image") {
      try {
        await savePackingLabelsAsZip({
          requests: selectedRequests,
          packLabelDpi,
          packLabelDots,
          packLabelDesignDots,
        });
        toast({
          title: "패킹 라벨 저장 완료",
          description: `${selectedRequests.length}건의 패킹 라벨을 zip으로 저장했습니다.`,
        });
      } catch (error) {
        toast({
          title: "패킹 라벨 저장 실패",
          description:
            error instanceof Error && error.message
              ? error.message
              : "패킹 라벨 zip 저장에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setIsPrintingPackingLabels(false);
      }
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let firstErrorMessage = "";

    try {
      for (const req of selectedRequests) {
        try {
          await handlePrintSinglePackingLabel(req, {
            silentSuccess: true,
            silentError: true,
          });
          successCount += 1;
        } catch (error) {
          failCount += 1;
          if (!firstErrorMessage) {
            firstErrorMessage =
              error instanceof Error && error.message
                ? error.message
                : "패킹 라벨 출력에 실패했습니다.";
          }
          console.error("Packing label print failed:", error);
        }
      }

      if (successCount > 0) {
        toast({
          title: "패킹 라벨 출력 완료",
          description:
            failCount > 0
              ? `${successCount}건 출력 성공 / ${failCount}건 실패`
              : `${successCount}건의 패킹 라벨이 출력되었습니다.`,
        });
      } else {
        toast({
          title: "패킹 라벨 출력 실패",
          description:
            firstErrorMessage ||
            "출력에 실패했습니다. pack-server 로그를 확인해주세요.",
          variant: "destructive",
        });
      }
    } finally {
      setIsPrintingPackingLabels(false);
    }
  }, [
    packLabelDesignDots,
    packLabelDots,
    packLabelDpi,
    packOutputMode,
    paginatedRequests,
    paperProfile,
    printerProfile,
    selectedPackingRequestIds,
    toast,
    token,
    handlePrintSinglePackingLabel,
  ]);

  const isEmpty = !isLoading && paginatedRequests.length === 0;
  const overlayText = useMemo(() => {
    if (!ocrProcessing) return "세척.패킹 이미지를 드롭하세요";
    if (ocrStage === "upload") return "이미지 업로드 중...";
    if (ocrStage === "recognize") return "LOT 인식 중...";
    return "처리 중...";
  }, [ocrProcessing, ocrStage]);

  return (
    <div
      className="relative w-full text-gray-800 flex flex-col items-stretch"
      onWheelCapture={() => {
        userScrolledRef.current = true;
      }}
      onScrollCapture={() => {
        userScrolledRef.current = true;
      }}
      onDrop={handlePageDrop}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
    >
      <div className="flex-1">
        {showQueueBar && (
          <WorksheetQueueSummary
            total={
              showCompleted
                ? diameterQueueForPacking.total
                : (serverTotal ?? diameterQueueForPacking.total)
            }
            labels={diameterQueueForPacking.labels}
            counts={diameterQueueForPacking.counts}
          />
        )}

        {isLoading && <WorksheetLoading />}

        <div className="flex-shrink-0 w-full sticky top-0 z-40 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 my-2">
          <div className="flex justify-center pt-4 pb-1 px-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPrinterModalOpen(true)}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                aria-label="프린터 설정"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={handlePrintPackingLabels}
                disabled={
                  isPrintingPackingLabels ||
                  selectedPackingRequestIds.length === 0
                }
                className={`px-4 py-1 text-sm font-medium rounded-lg transition-colors border ${
                  isPrintingPackingLabels ||
                  selectedPackingRequestIds.length === 0
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm"
                }`}
              >
                {isPrintingPackingLabels
                  ? "출력 중..."
                  : `🏷️ 패킹 라벨 출력 (${selectedPackingRequestIds.length}건)`}
              </button>
              <div className="w-2" />
              {/* 미출력 선택 */}
              <button
                type="button"
                onClick={handleSelectUnprintedPackingRequests}
                disabled={!unprintedPackingRequestIds.length}
                title={`미출력 ${unprintedPackingRequestIds.length}건 선택`}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  !unprintedPackingRequestIds.length
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                }`}
              >
                미출력만 ({unprintedPackingRequestIds.length})
              </button>
              {/* 기출력 선택 */}
              <button
                type="button"
                onClick={handleSelectPrintedPackingRequests}
                disabled={!printedPackingRequestIds.length}
                title={`기출력 ${printedPackingRequestIds.length}건 선택 (재출력)`}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  !printedPackingRequestIds.length
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                }`}
              >
                기출력만 ({printedPackingRequestIds.length})
              </button>
              {/* 전체 선택/해제 */}
              <button
                type="button"
                onClick={handleSelectAllPackingRequests}
                disabled={!allPackingRequestIds.length}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  !allPackingRequestIds.length
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                전체
              </button>
              <button
                type="button"
                onClick={handleClearPackingRequests}
                disabled={!selectedPackingRequestIds.length}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  !selectedPackingRequestIds.length
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                해제
              </button>
            </div>
          </div>
        </div>

        {captureHistory.length > 0 && (
          <div className="w-full px-4 pt-2 pb-1">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-xs font-semibold text-slate-500">
                각인 인식 결과
              </span>
              <button
                type="button"
                onClick={() => setCaptureHistory([])}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                전체 지우기
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {captureHistory.map((item, idx) => {
                const caseInfos = item.request?.caseInfos || {};
                const clinicName = String((caseInfos as any)?.clinicName || "");
                const patientName = String(
                  (caseInfos as any)?.patientName || "",
                );
                const tooth = String((caseInfos as any)?.tooth || "");
                const lotSuffix = item.recognizedSuffix || "—";
                const timeStr = item.capturedAt.toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                return (
                  <div
                    key={`${item.requestId}-${idx}`}
                    className="rounded-lg border border-blue-200 bg-blue-50 shadow-sm px-4 py-2 text-sm min-w-[160px] max-w-[220px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-blue-700 tracking-widest text-lg">
                        {lotSuffix}
                      </span>
                      <span className="text-xs text-slate-400">{timeStr}</span>
                    </div>
                    <div className="text-slate-600 text-xs mt-0.5 truncate">
                      {item.requestId}
                      {clinicName && ` · ${clinicName}`}
                      {patientName && ` · ${patientName}`}
                      {tooth && ` · ${tooth}`}
                    </div>
                    <div className="text-xs text-blue-500 mt-0.5">
                      → 포장.발송 이동
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isEmpty ? (
          <div className="flex justify-center py-8">
            <div className="text-gray-500">의뢰가 없습니다.</div>
          </div>
        ) : !isLoading ? (
          <>
            <WorksheetCardGrid
              requests={paginatedRequests}
              selectedRequestIds={Array.from(
                new Set(
                  selectedPackingRequestIds.filter((id) =>
                    paginatedPackingRequestIdSet.has(id),
                  ),
                ),
              )}
              printedRequestIds={new Set(printedPackingRequestIds)}
              onToggleSelected={handleTogglePackingRequest}
              onDownload={handleDownloadOriginalStl}
              onOpenPreview={handleOpenPreview}
              onDeleteCam={() => {}}
              onDeleteNc={handleDeleteNc}
              onSaveToRnd={handleSaveToRnd}
              onRollback={handleCardRollback}
              onApprove={handleCardApprove}
              onDelete={handleCardDelete}
              onDone={handleCardDone}
              onUploadNc={handleUploadByStage}
              uploadProgress={uploadProgress}
              isCamStage={false}
              isMachiningStage={false}
              uploading={uploading}
              downloading={downloading}
              deletingCam={{}}
              deletingNc={deletingNc}
              currentStageOrder={currentStageOrder}
              tabStage="packing"
            />
            <div ref={sentinelRef} className="py-4 text-center text-gray-500">
              {visibleCount >= filteredAndSorted.length
                ? "모든 의뢰를 표시했습니다."
                : "스크롤하여 더보기"}
            </div>
          </>
        ) : null}
        <PackingPrinterSettingsDialog
          open={printerModalOpen}
          onOpenChange={setPrinterModalOpen}
          printerProfile={printerProfile}
          setPrinterProfile={setPrinterProfile}
          paperProfile={paperProfile}
          setPaperProfile={setPaperProfile}
          packOutputMode={packOutputMode}
          setPackOutputMode={setPackOutputMode}
          printerOptions={printerOptions}
          printerLoading={printerLoading}
          printerError={printerError}
          paperOptions={paperOptions}
          paperLoading={paperLoading}
          paperError={paperError}
          onRefreshPrinters={() => void fetchPrinters()}
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
          isCamStage={false}
          isMachiningStage={false}
          onUpdateReviewStatus={handleUpdateReviewStatus}
          onDeleteCam={() => Promise.resolve()}
          onDeleteNc={handleDeleteNc}
          onDeleteStageFile={handleDeleteStageFile}
          onUploadCam={() => Promise.resolve()}
          onUploadNc={() => Promise.resolve()}
          onUploadStageFile={handleUploadStageFile}
          onDownloadOriginalStl={handleDownloadOriginalStl}
          onDownloadCamStl={() => Promise.resolve()}
          onDownloadNcFile={() => Promise.resolve()}
          onDownloadStageFile={handleDownloadStageFile}
          onRefreshPreview={handleOpenPreview}
          onMarkUnmachinable={handleMarkUnmachinable}
          onOpenNextRequest={handleOpenNextRequest}
          setSearchParams={setSearchParams}
          setConfirmTitle={setConfirmTitle}
          setConfirmDescription={setConfirmDescription}
          setConfirmAction={setConfirmAction}
          setConfirmOpen={setConfirmOpen}
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

        {(isDraggingOver || ocrProcessing) && (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-900/20">
            <div className="rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-slate-800 shadow flex items-center gap-2">
              {ocrProcessing && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              )}
              <span>{overlayText}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
