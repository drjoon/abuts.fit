// change-log:
// - 2026-11-26: lot-server 라이브·자동 OCR·3글자 수동 입력. 대기 카드는 하단 1행. 이미지 AI·pending UI 제거.
// - 2026-11-10: 세척.패킹 툴바는 공병 라벨·패킹 라벨·스크류 로트번호.
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
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import type { UnmachinableLabNoticePayload } from "../../components/UnmachinableLabNoticeFields";
import { useToast } from "@/shared/hooks/use-toast";
import { generateModelNumber } from "@/utils/modelNumber";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { WorksheetQueueSummary } from "@/shared/ui/dashboard/WorksheetQueueSummary";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";
import {
  type ManufacturerRequest,
  deriveStageForFilter,
  isAnySampleRequest,
  isRndSampleRequest,
  isUnmachinableShipGone,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { shouldShowRequestInIncludeCompleted } from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";
import { PreviewModal } from "../../components/PreviewModal";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import {
  releasePreviewBinaries,
  usePreviewLoader,
} from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useWorksheetRealtimeStatus } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus";
import { PackingLabelPrintDialog } from "../components/PackingLabelPrintDialog";
import { VialStickerPrintDialog } from "../components/VialStickerPrintDialog";
import { PackingLotStation } from "../components/PackingLotStation";
import { PackingRequestStrip } from "../components/PackingRequestStrip";
import { usePackingPrintSettings } from "../hooks/usePackingPrintSettings";
import { usePackingWorksheetData } from "../hooks/usePackingWorksheetData";
import {
  usePackingCapture,
  extractLotSuffix3,
  type CaptureResult,
} from "../hooks/usePackingCapture";
import { useLotServerWatch } from "../hooks/useLotServerWatch";
import {
  buildPackLabelBitmapZpl,
  renderPackLabelToCanvas,
  resolveManufacturingDate,
} from "../utils/packLabelRenderer";
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";
import { ScrewTypeHover } from "@/shared/practice/ScrewTypeHover";
import {
  PACKING_SCREW_LOT_SETTING_TYPES,
  ensureCanonicalScrewLotItems,
  resolveCaseScrewType,
} from "@/shared/practice/screwSupply";

// related files:
// - bg/pc2/lot-server/src/index.js
// - web/backend/controllers/ai/lotCapture.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/useLotServerWatch.ts
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ScrewLotSettingItem = {
  type: string;
  lotNumber: string;
};

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
  const [confirmCancelAction, setConfirmCancelAction] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [confirmLabel, setConfirmLabel] = useState("확인");
  const [cancelLabel, setCancelLabel] = useState("취소");
  const [deletingNc, setDeletingNc] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [isPrintingPackingLabels, setIsPrintingPackingLabels] = useState(false);
  const [captureHistory, setCaptureHistory] = useState<CaptureResult[]>([]);
  const [screwLotSettingsOpen, setScrewLotSettingsOpen] = useState(false);
  const [vialStickerOpen, setVialStickerOpen] = useState(false);
  const [packingLabelOpen, setPackingLabelOpen] = useState(false);
  const [screwLotItems, setScrewLotItems] = useState<ScrewLotSettingItem[]>([]);
  const [screwLotLoading, setScrewLotLoading] = useState(false);
  const [screwLotSaving, setScrewLotSaving] = useState(false);

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
    vialPrinter,
    setVialPrinter,
    paperProfile,
    printerOptions,
    printerLoading,
    printerError,
    packLabelDpi,
    packLabelDots,
    packLabelDesignDots,
    packLabelBranding,
    fetchPrinters,
  } = usePackingPrintSettings({ token });

  useEffect(() => {
    if (!vialStickerOpen && !packingLabelOpen) return;
    void fetchPrinters();
  }, [fetchPrinters, packingLabelOpen, vialStickerOpen]);

  const { uploadFiles } = useS3TempUpload({ token });

  const matchesCurrentPage = useCallback(
    (req: ManufacturerRequest) => {
      const isDoneRndSample = isRndSampleRequest(req);
      // 불완전가공이어도 세척.패킹에 남겨 출고를 이어 간다.
      if (isDoneRndSample) return false;
      // 출고했거나 출고시간이 지난 불완전가공 건은 R&D-불완전가공에만 남긴다.
      if (isUnmachinableShipGone(req)) return false;
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
      if (stage === "세척.패킹") {
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

  const handleCloneSampleForProduction = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      try {
        // 세척.패킹 등 가공 이후 단계에서는 허용 시작 공정 한계(준비/가공)에 맞춰
        // 가공 단계 샘플로 복사한다.
        // (준비 단계 카드는 해당 단계 그대로 생성)
        const rawStage = String(req.manufacturerStage || "").trim();
        const lowerStage = rawStage.toLowerCase();
        const startStage = rawStage === "준비" ? "준비" : "가공";

        const res = await fetch(`/api/requests/remake-clone`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requestIds: [req._id], startStage }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "샘플 복사에 실패했습니다.");
        }

        const clonedRequestId =
          data?.data?.created?.[0]?.clonedRequestId || data?.data?.requestId || "-";

        toast({
          title: "샘플 복사 완료",
          description: `크레딧 차감 없이 ${startStage} 공정 샘플을 생성했습니다. (새 의뢰ID: ${clonedRequestId})`,
        });

        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        toast({
          title: "샘플 복사 실패",
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
      const isSample = isAnySampleRequest(req);
      if (!isSample) {
        toast({
          title: "삭제 불가",
          description: "샘플 의뢰만 삭제할 수 있습니다.",
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
      const isSample = isAnySampleRequest(req);
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
            requestCategory: "rnd_sample",
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
              requestCategory: req?.requestCategory || "copied_sample",
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
    async (
      req: ManufacturerRequest,
      reasonRaw: string,
      notice?: UnmachinableLabNoticePayload,
    ) => {
      if (!req?._id) return;
      const reason = String(reasonRaw || "").slice(0, 500).trim();
      if (!reason) {
        throw new Error("불완전가공 사유를 입력해주세요.");
      }
      const labMessage = String(notice?.message || "").trim();
      if (!labMessage) {
        throw new Error("기공소에 전달할 메시지를 입력해주세요.");
      }
      if (!notice?.files?.length) {
        throw new Error("문제 부위 사진을 올려 주세요.");
      }

      const requestMongoId = String(req._id || "").trim();
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
        const uploaded = await uploadFiles(notice.files.map((item) => item.file));
        if (!uploaded.length || uploaded.some((item) => !item?.key || !item?.location)) {
          throw new Error("사진 업로드에 실패했습니다.");
        }
        const labPhotos = notice.files.map((item, index) => {
          const file = uploaded[index];
          return {
            kind: item.kind,
            fileName: file?.originalName || item.file.name,
            fileType: file?.mimetype || item.file.type,
            fileSize: file?.size || item.file.size,
            s3Key: file?.key || "",
            s3Url: file?.location || "",
          };
        });

        const res = await fetch(`/api/requests/${req._id}/rnd-unmachinable`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unmachinable: true,
            reason,
            labMessage,
            labPhotos,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "불완전가공 처리에 실패했습니다.");
        }

        toast({
          title: "불완전가공을 기록했습니다",
          description: `의뢰 ${req.requestId}는 R&D 불완전가공에 남고, 세척.패킹에서 출고를 이어갑니다.`,
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
                unmachinableAt: prevAt,
                unmachinableReason: prevReason,
                unmachinableFromStage: prevFromStage,
              },
            };
          }),
        );

        toast({
          title: "불완전가공 처리 실패",
          description: e?.message || "네트워크 오류",
          variant: "destructive",
        });

        throw e;
      }
    },
    [queryClient, setRequests, toast, token, uploadFiles],
  );

  const normalizeScrewLotItems = useCallback((raw: unknown) => {
    const source = Array.isArray(raw) ? raw : [];
    const unique: ScrewLotSettingItem[] = [];
    for (const item of source) {
      const type = String((item as any)?.type || "")
        .slice(0, 30)
        .trim()
        .toUpperCase();
      const lotNumber = String((item as any)?.lotNumber || "")
        .slice(0, 120)
        .trim();
      if (!type) continue;
      if (unique.some((row) => row.type === type)) continue;
      unique.push({ type, lotNumber });
      if (unique.length >= 50) break;
    }
    return unique;
  }, []);

  const parseScrewLotResponseItems = useCallback(
    (json: any): ScrewLotSettingItem[] => {
      const itemsFromApi = ensureCanonicalScrewLotItems(
        normalizeScrewLotItems(json?.data?.items),
      );
      if (itemsFromApi.length > 0) return itemsFromApi;

      // backward compatibility: 레거시 { lots: { A: "..." } } 응답 허용
      const lots = json?.data?.lots;
      if (!lots || typeof lots !== "object") return [];

      return normalizeScrewLotItems(
        Object.entries(lots as Record<string, unknown>).map(([type, lotNumber]) => ({
          type,
          lotNumber,
        })),
      );
    },
    [normalizeScrewLotItems],
  );

  const fetchScrewLotSettings = useCallback(async () => {
    if (!token) return;
    setScrewLotLoading(true);
    try {
      const res = await fetch("/api/requests/packing/screw-lot-settings", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "스크류 로트번호 설정 조회 실패");
      }
      setScrewLotItems(parseScrewLotResponseItems(json));
    } catch (e: any) {
      toast({
        title: "스크류 로트번호 설정 조회 실패",
        description: e?.message || "네트워크 오류",
        variant: "destructive",
      });
    } finally {
      setScrewLotLoading(false);
    }
  }, [parseScrewLotResponseItems, toast, token]);

  useEffect(() => {
    if (!token) return;
    void fetchScrewLotSettings();
  }, [fetchScrewLotSettings, token]);

  const handleOpenScrewLotSettings = useCallback(() => {
    setScrewLotSettingsOpen(true);
    void fetchScrewLotSettings();
  }, [fetchScrewLotSettings]);

  const handleAddScrewLotRow = useCallback(() => {
    setScrewLotItems((prev) => [...prev, { type: "", lotNumber: "" }]);
  }, []);

  const handleRemoveScrewLotRow = useCallback((index: number) => {
    setScrewLotItems((prev) => prev.filter((_, rowIdx) => rowIdx !== index));
  }, []);

  const handleChangeScrewLotRow = useCallback(
    (index: number, field: "type" | "lotNumber", value: string) => {
      setScrewLotItems((prev) =>
        prev.map((row, rowIdx) => {
          if (rowIdx !== index) return row;
          if (field === "type") {
            return {
              ...row,
              type: String(value || "").slice(0, 30).trim().toUpperCase(),
            };
          }
          return {
            ...row,
            lotNumber: String(value || "").slice(0, 120).trimStart(),
          };
        }),
      );
    },
    [],
  );

  const handleSaveScrewLotSettings = useCallback(async () => {
    if (!token) return;

    const normalizedTypeList = screwLotItems
      .map((row) => String(row?.type || "").slice(0, 30).trim().toUpperCase())
      .filter(Boolean);

    const hasDuplicateType = (() => {
      const seen = new Set<string>();
      for (const type of normalizedTypeList) {
        if (seen.has(type)) return true;
        seen.add(type);
      }
      return false;
    })();

    if (hasDuplicateType) {
      toast({
        title: "중복 타입",
        description: "스크류 타입은 중복 없이 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const normalizedItems = normalizeScrewLotItems(screwLotItems);
    if (normalizedItems.length === 0) {
      toast({
        title: "입력 필요",
        description: "최소 1개 이상의 스크류 타입을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setScrewLotSaving(true);
    try {
      const res = await fetch("/api/requests/packing/screw-lot-settings", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: normalizedItems,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "스크류 로트번호 설정 저장 실패");
      }

      const next = parseScrewLotResponseItems(json);
      setScrewLotItems(next);
      setScrewLotSettingsOpen(false);
      toast({
        title: "스크류 로트번호 설정 저장 완료",
        description: `${next.length}개 타입 설정이 반영되었습니다.`,
      });
    } catch (e: any) {
      toast({
        title: "스크류 로트번호 설정 저장 실패",
        description: e?.message || "네트워크 오류",
        variant: "destructive",
      });
    } finally {
      setScrewLotSaving(false);
    }
  }, [normalizeScrewLotItems, parseScrewLotResponseItems, screwLotItems, toast, token]);

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
          const isDoneRndSample = isRndSampleRequest(req);
          if (isDoneRndSample || isUnmachinableShipGone(req)) return false;
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
          const aTime = new Date(a.createdAt || 0).getTime();
          const bTime = new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
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
      const screwType =
        resolveCaseScrewType({
          screwSupply: (caseInfos as { screwSupply?: unknown }).screwSupply,
          implantManufacturer,
          implantBrand,
          implantFamily,
          implantType,
          connectionDiameter: (caseInfos as any)?.connectionDiameter,
          connectionScrewType: resolvedSpec.screwType,
        }) || "-";
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
        topBannerText: (caseInfos as any)?.hexVerificationSample
          ? "헥스 확인용 무료 샘플"
          : null,
      };

      const canvas = await renderPackLabelToCanvas({
        ...payload,
        ...(packLabelBranding || {}),
        modelName: payload.modelName,
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
      packLabelBranding,
      packLabelDesignDots,
      packLabelDots,
      packLabelDpi,
      paperProfile,
      printerProfile,
      toast,
      token,
    ],
  );

  const handleCaptureResult = useCallback((result: CaptureResult) => {
    setCaptureHistory((prev) => [result, ...prev].slice(0, 8));
  }, []);

  const { matchingBusy, matchNote, setMatchNote, matchBySuffix, bindToRequest } =
    usePackingCapture({
      token,
      toast,
      setRequests,
      onCaptureResult: handleCaptureResult,
    });

  const [suffixInput, setSuffixInput] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const matchingBusyRef = useRef(matchingBusy);
  matchingBusyRef.current = matchingBusy;

  const handleLotFromServer = useCallback(
    (lot: string, meta: { from: "auto" | "manual" }) => {
      const suffix = extractLotSuffix3(lot);
      if (suffix.length !== 3 || matchingBusyRef.current) return;
      setSuffixInput(suffix);
      setMatchNote("");
      void matchBySuffix(suffix, {
        source: meta.from === "manual" ? "manual" : "lot-server",
      }).then((result) => {
        if (result.ok && result.matched) {
          setSuffixInput("");
        }
      });
    },
    [matchBySuffix, setMatchNote],
  );

  const {
    liveUrl,
    busy: lotBusy,
    error: lotError,
    reachable,
    running,
    phase,
    lastLot,
    startWatch,
    stopWatch,
    runFocus,
    runRecognize,
    resetLotDedupe,
  } = useLotServerWatch({
    enabled: true,
    onLot: handleLotFromServer,
  });

  const normalizedManualSuffix = useMemo(
    () =>
      String(suffixInput || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 3),
    [suffixInput],
  );

  const stripRequests = useMemo(() => {
    if (!normalizedManualSuffix) return filteredAndSorted;
    return filteredAndSorted.filter((req) => {
      const suffix = extractLotSuffix3(req.lotNumber?.value);
      return suffix.startsWith(normalizedManualSuffix);
    });
  }, [filteredAndSorted, normalizedManualSuffix]);

  const selectedRequest = useMemo(
    () =>
      filteredAndSorted.find(
        (req) => String(req._id || "") === selectedRequestId,
      ) || null,
    [filteredAndSorted, selectedRequestId],
  );

  const submitSuffix = useCallback(() => {
    const suffix = extractLotSuffix3(normalizedManualSuffix);
    if (suffix.length !== 3 || matchingBusy) return;
    void matchBySuffix(suffix, { source: "manual" }).then((result) => {
      if (result.ok && result.matched) {
        setSuffixInput("");
        resetLotDedupe();
      }
    });
  }, [matchBySuffix, matchingBusy, normalizedManualSuffix, resetLotDedupe]);

  const handlePrintPackingLabels = useCallback(
    async (selectedRequests: ManufacturerRequest[]) => {
      if (!selectedRequests.length) {
        toast({
          title: "출력할 의뢰 없음",
          description: "선택된 의뢰가 없습니다.",
          variant: "destructive",
        });
        return false;
      }
      if (!printerProfile.trim()) {
        toast({
          title: "패킹 라벨 출력",
          description: "프린터를 고르세요.",
          variant: "destructive",
        });
        return false;
      }
      setIsPrintingPackingLabels(true);

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

        if (successCount > 0 && failCount === 0) {
          toast({
            title: "패킹 라벨 출력 완료",
            description: `${successCount}건의 패킹 라벨이 출력되었습니다.`,
          });
          return true;
        }
        if (successCount > 0) {
          toast({
            title: "패킹 라벨 출력",
            description: `${successCount}건 출력 성공 / ${failCount}건 실패`,
            variant: "destructive",
          });
          return false;
        }
        toast({
          title: "패킹 라벨 출력 실패",
          description:
            firstErrorMessage ||
            "출력에 실패했습니다. pack-server 로그를 확인해주세요.",
          variant: "destructive",
        });
        return false;
      } finally {
        setIsPrintingPackingLabels(false);
      }
    },
    [handlePrintSinglePackingLabel, printerProfile, toast],
  );

  return (
    <div
      className="relative flex w-full flex-col items-stretch text-gray-800"
      onWheelCapture={() => {
        userScrolledRef.current = true;
      }}
      onScrollCapture={() => {
        userScrolledRef.current = true;
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-2">
        {showQueueBar ? (
          <WorksheetQueueSummary
            total={
              showCompleted
                ? diameterQueueForPacking.total
                : (serverTotal ?? diameterQueueForPacking.total)
            }
            labels={diameterQueueForPacking.labels}
            counts={diameterQueueForPacking.counts}
            variant="compact"
            toolbar={
              <div className="inline-flex items-center gap-1 rounded-xl bg-stone-100/90 p-1">
                <button
                  type="button"
                  onClick={() => setVialStickerOpen(true)}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-stone-800 shadow-sm transition-colors hover:text-stone-950"
                >
                  공병 라벨
                </button>
                <button
                  type="button"
                  onClick={() => setPackingLabelOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-stone-800 shadow-sm transition-colors hover:text-stone-950"
                >
                  패킹 라벨
                  {unprintedPackingRequestIds.length > 0 ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-900 px-1 text-[10px] font-semibold tabular-nums text-white">
                      {unprintedPackingRequestIds.length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={handleOpenScrewLotSettings}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-stone-800 shadow-sm transition-colors hover:text-stone-950"
                >
                  스크류 로트번호
                </button>
              </div>
            }
          />
        ) : null}

        {isLoading ? <WorksheetLoading /> : null}

        <PackingLotStation
          liveUrl={liveUrl}
          running={running}
          reachable={reachable}
          busy={lotBusy}
          phase={phase}
          lastLot={lastLot}
          error={lotError}
          suffix={suffixInput}
          onSuffixChange={(value) => {
            setSuffixInput(value);
            setMatchNote("");
          }}
          matchNote={matchNote}
          matchingBusy={matchingBusy}
          onStartWatch={() => {
            void startWatch().catch(() => undefined);
          }}
          onStopWatch={() => {
            void stopWatch().catch(() => undefined);
          }}
          onFocus={() => {
            void runFocus().catch(() => undefined);
          }}
          onRecognize={() => {
            void runRecognize().catch(() => undefined);
          }}
          onSubmitSuffix={submitSuffix}
          onRetryRecognize={() => {
            resetLotDedupe();
            void runRecognize().catch(() => undefined);
          }}
          onClearSuffix={() => {
            setSuffixInput("");
            setMatchNote("");
            resetLotDedupe();
          }}
          hasSelectedCard={Boolean(selectedRequest)}
          onBindSelected={() => {
            if (!selectedRequest?._id) return;
            void bindToRequest(
              String(selectedRequest._id),
              normalizedManualSuffix ||
                extractLotSuffix3(selectedRequest.lotNumber?.value),
            ).then((ok) => {
              if (ok) {
                setSuffixInput("");
                setSelectedRequestId("");
                resetLotDedupe();
              }
            });
          }}
        />

        {captureHistory.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] text-stone-500">
            <span className="shrink-0 font-semibold">최근</span>
            {captureHistory.map((item, idx) => (
              <span
                key={`${item.requestId}-${idx}`}
                className="shrink-0 rounded-md border border-primary-muted bg-primary-soft px-2 py-0.5 font-mono tracking-widest text-primary-strong"
              >
                {item.recognizedSuffix || "—"}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto space-y-1.5">
          <div className="flex items-center justify-between px-0.5 text-[11px] text-stone-500">
            <span>
              대기 {stripRequests.length}건
              {normalizedManualSuffix
                ? ` · 필터 ${normalizedManualSuffix}`
                : ""}
            </span>
            <span ref={sentinelRef} className="tabular-nums">
              {visibleCount < filteredAndSorted.length
                ? "스크롤 더보기"
                : ""}
            </span>
          </div>
          <PackingRequestStrip
            requests={stripRequests}
            highlightSuffix={normalizedManualSuffix}
            selectedId={selectedRequestId}
            onSelect={(req) => {
              setSelectedRequestId(String(req._id || ""));
              const suffix = extractLotSuffix3(req.lotNumber?.value);
              if (suffix) setSuffixInput(suffix);
            }}
            onOpen={(req) => {
              void handleOpenPreview(req);
            }}
          />
        </div>
        <PackingLabelPrintDialog
          open={packingLabelOpen}
          onOpenChange={setPackingLabelOpen}
          requests={filteredAndSorted}
          printer={printerProfile}
          onPrinterChange={setPrinterProfile}
          printerOptions={printerOptions}
          printerLoading={printerLoading}
          printerError={printerError}
          packLabelDpi={packLabelDpi}
          packLabelDots={packLabelDots}
          packLabelDesignDots={packLabelDesignDots}
          branding={packLabelBranding}
          printing={isPrintingPackingLabels}
          onPrint={handlePrintPackingLabels}
        />

        <VialStickerPrintDialog
          open={vialStickerOpen}
          onOpenChange={setVialStickerOpen}
          token={token}
          printer={vialPrinter}
          onPrinterChange={setVialPrinter}
          printerOptions={printerOptions}
          printerLoading={printerLoading}
          printerError={printerError}
        />

        <Dialog open={screwLotSettingsOpen} onOpenChange={setScrewLotSettingsOpen}>
          <DialogContent className="sm:max-w-2xl border-slate-300 shadow-2xl ring-1 ring-slate-200 overflow-visible">
            <DialogHeader>
              <DialogTitle>스크류 로트번호 설정</DialogTitle>
              <DialogDescription>
                저장 후 새로 패킹 승인되는 의뢰에는 타입별 최신 로트번호가 스냅샷으로 기록됩니다.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 px-2 py-2 max-h-[60vh] overflow-auto pr-1">
              {screwLotItems.map((row, idx) => (
                <div
                  key={`${idx}-${row.type}`}
                  className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_44px]"
                >
                  <ScrewTypeHover screwType={row.type} className="w-full min-w-0">
                    <Input
                      value={row.type}
                      onChange={(e) =>
                        handleChangeScrewLotRow(idx, "type", e.target.value)
                      }
                      placeholder="타입 (예: A)"
                      maxLength={30}
                      readOnly={PACKING_SCREW_LOT_SETTING_TYPES.includes(row.type)}
                      className={
                        PACKING_SCREW_LOT_SETTING_TYPES.includes(row.type)
                          ? "bg-slate-50 font-semibold"
                          : undefined
                      }
                    />
                  </ScrewTypeHover>
                  <Input
                    value={row.lotNumber}
                    onChange={(e) =>
                      handleChangeScrewLotRow(idx, "lotNumber", e.target.value)
                    }
                    placeholder="로트번호"
                    maxLength={120}
                  />
                  {PACKING_SCREW_LOT_SETTING_TYPES.includes(row.type) ? (
                    <span className="inline-flex h-9 w-9" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoveScrewLotRow(idx)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive-muted text-destructive hover:bg-destructive-soft"
                      aria-label={`스크류 타입 ${row.type || idx + 1} 삭제`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}

              {screwLotItems.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                  등록된 스크류 타입이 없습니다. 아래 버튼으로 타입을 추가하세요.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleAddScrewLotRow}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                타입 추가
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setScrewLotSettingsOpen(false);
                    void fetchScrewLotSettings();
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveScrewLotSettings}
                  disabled={screwLotSaving || screwLotLoading}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                    screwLotSaving || screwLotLoading
                      ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                      : "border border-primary/70 bg-primary-strong text-white hover:bg-primary-strong"
                  }`}
                >
                  {screwLotSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <PreviewModal
          open={previewOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              releasePreviewBinaries({
                setPreviewFiles,
                setPreviewNcText,
                setPreviewStageUrl,
              });
            }
            setPreviewOpen(nextOpen);
          }}
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
        />

        <ConfirmDialog
          open={confirmOpen}
          title={confirmTitle}
          description={confirmDescription}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          onConfirm={async () => {
            if (!confirmAction) return;
            const action = confirmAction;
            setConfirmOpen(false);
            setConfirmAction(null);
            setConfirmCancelAction(null);
            setConfirmLabel("확인");
            setCancelLabel("취소");
            try {
              await action();
            } catch (error) {
              console.error("Confirm action failed:", error);
            }
          }}
          onCancel={() => {
            const cancelAction = confirmCancelAction;
            setConfirmOpen(false);
            setConfirmAction(null);
            setConfirmCancelAction(null);
            setConfirmLabel("확인");
            setCancelLabel("취소");
            if (cancelAction) {
              void Promise.resolve(cancelAction()).catch((error) => {
                console.error("Confirm cancel action failed:", error);
              });
            }
          }}
        />

      </div>
    </div>
  );
};
