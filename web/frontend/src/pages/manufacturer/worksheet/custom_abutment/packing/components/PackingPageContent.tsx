// change-log:
// - 2026-11-11: 각인 확인 창은 의뢰 카드 위에 겹치지 않는다. 이미지는 카드로 끌어 놓는다.
// - 2026-11-11: 인식 실패 이미지를 고르고 3글자를 입력하면 그 이미지로 바로 매칭한다.
// - 2026-11-10: 세척.패킹 툴바는 공병 라벨·패킹 라벨·스크류 로트번호. 프린터와 선택은 각 모달에서 출력한다.
// - 2026-11-10: 세척.패킹 공병 스티커. 타입별 장수를 TTP-345 50×20mm TSPL로 출력한다.
// - 2026-11-09: 인식 실패 수기 입력은 프리뷰 위 창으로 연다.
// - 2026-09-04: AI 미매칭 시 각인 이미지 수동 매칭(3글자 필터·카드 드롭) 패널. 자동 인식은 확인 후 확정.
// - 2026-08-04: 컨텐츠 영역 검색 바 제거. 헤더 worksheetSearch만 사용(중복 제거).
// - 2026-08-03: packing page: 공정 '의뢰' 표시를 '준비'로 정규화한 영향으로 일부 시작/복사 로직의 라벨 표기를 조정했습니다 (표시 레벨).
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
import { BodyPortal } from "@/shared/ui/BodyPortal";
import {
  type ManufacturerRequest,
  deriveStageForFilter,
  isAnySampleRequest,
  isRndSampleRequest,
  isUnmachinableShipGone,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { shouldShowRequestInIncludeCompleted } from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";
import { WorksheetCardGrid } from "../../components/WorksheetCardGrid";
import { PreviewModal } from "../../components/PreviewModal";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import {
  releasePreviewBinaries,
  usePreviewLoader,
} from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useWorksheetRealtimeStatus } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus";
import { PackingLabelPrintDialog } from "../components/PackingLabelPrintDialog";
import { VialStickerPrintDialog } from "../components/VialStickerPrintDialog";
import { usePackingPrintSettings } from "../hooks/usePackingPrintSettings";
import { usePackingWorksheetData } from "../hooks/usePackingWorksheetData";
import {
  usePackingCapture,
  extractLotSuffix3,
  PACKING_PENDING_DRAG_MIME,
  type CaptureResult,
} from "../hooks/usePackingCapture";
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
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/usePackingCapture.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/backend/controllers/ai/lotCapture.controller.js
import { Plus, Trash2, X } from "lucide-react";
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

// related files (screw lot tracking):
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/models/systemSettings.model.js
// - web/backend/models/request.model.js

function EngravingConfirmFrame({
  previewOpen,
  children,
}: {
  previewOpen: boolean;
  children: ReactNode;
}) {
  const card = (
    <div
      className={
        previewOpen
          ? "pointer-events-auto w-full max-w-3xl rounded-xl border border-accent-muted bg-accent-soft/95 p-3 shadow-lg"
          : "w-full rounded-xl border border-accent-muted bg-accent-soft/95 p-3 shadow-sm"
      }
    >
      {children}
    </div>
  );
  // 프리뷰가 열려 있을 때만 포탈. 그 외에는 카드 목록 위에 두어 이미지가 카드에 닿게 한다.
  if (previewOpen) {
    return (
      <BodyPortal>
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[140] flex justify-center px-3">
          {card}
        </div>
      </BodyPortal>
    );
  }
  return <div className="px-4 pt-2">{card}</div>;
}

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
    setCaptureHistory((prev) => [result, ...prev].slice(0, 20));
  }, []);

  const {
    isDraggingOver,
    ocrProcessing,
    ocrStage,
    handlePageDrop,
    handlePageDragOver,
    handlePageDragLeave,
    handlePackingImageDropOnRequest,
    pendingMatches,
    activePending,
    setActivePendingId,
    manualSuffixQuery,
    setManualSuffixQuery,
    clearPendingMatch,
    clearAllPendingMatches,
    matchPendingBySuffix,
    confirmSuggestedMatch,
    matchingBusy,
    suffixCommitNote,
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

  // 확인 창은 프리뷰(모달) 밖에 뜬다. 모달이 열려 있으면 바깥 클릭에 닫히고 포커스도 갇혀 입력이 안 된다.
  const hadPendingRef = useRef(false);
  useEffect(() => {
    const hasPending = pendingMatches.length > 0;
    if (hasPending && !hadPendingRef.current && previewOpen) {
      releasePreviewBinaries({
        setPreviewFiles,
        setPreviewNcText,
        setPreviewStageUrl,
      });
      setPreviewOpen(false);
    }
    hadPendingRef.current = hasPending;
  }, [pendingMatches.length, previewOpen]);

  const normalizedManualSuffix = useMemo(
    () =>
      String(manualSuffixQuery || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 3),
    [manualSuffixQuery],
  );

  const displayRequests = useMemo(() => {
    if (!normalizedManualSuffix) return paginatedRequests;
    return filteredAndSorted.filter((req) => {
      const suffix = extractLotSuffix3(req.lotNumber?.value);
      return suffix.startsWith(normalizedManualSuffix);
    });
  }, [filteredAndSorted, normalizedManualSuffix, paginatedRequests]);

  const packingMatchHintIds = useMemo(() => {
    if (!normalizedManualSuffix || !pendingMatches.length) return undefined;
    return new Set(
      displayRequests
        .filter((req) => {
          const suffix = extractLotSuffix3(req.lotNumber?.value);
          return (
            suffix.startsWith(normalizedManualSuffix) &&
            (normalizedManualSuffix.length < 3 ||
              suffix === normalizedManualSuffix)
          );
        })
        .map((req) => String(req._id || ""))
        .filter(Boolean),
    );
  }, [displayRequests, normalizedManualSuffix, pendingMatches.length]);

  const exactManualMatchRequest = useMemo(() => {
    if (normalizedManualSuffix.length !== 3) return null;
    const matches = filteredAndSorted.filter(
      (req) =>
        extractLotSuffix3(req.lotNumber?.value) === normalizedManualSuffix,
    );
    return matches.length === 1 ? matches[0] : null;
  }, [filteredAndSorted, normalizedManualSuffix]);

  const suffixAttemptRef = useRef("");
  const suffixInFlightRef = useRef(false);
  useEffect(() => {
    if (normalizedManualSuffix.length < 3) suffixAttemptRef.current = "";
  }, [normalizedManualSuffix]);

  const commitTypedSuffix = useCallback(
    (suffix: string, pendingId: string, force = false) => {
      if (!pendingId || suffix.length !== 3 || suffixInFlightRef.current) return;
      const key = `${pendingId}:${suffix}`;
      if (!force && suffixAttemptRef.current === key) return;
      suffixAttemptRef.current = key;
      suffixInFlightRef.current = true;
      void matchPendingBySuffix(suffix, pendingId).finally(() => {
        suffixInFlightRef.current = false;
      });
    },
    [matchPendingBySuffix],
  );

  useEffect(() => {
    if (!activePending || matchingBusy) return;
    if (normalizedManualSuffix.length !== 3) return;
    const aiSuffix = extractLotSuffix3(activePending.aiSuffix);
    if (
      aiSuffix &&
      normalizedManualSuffix === aiSuffix &&
      (activePending.candidateMatched ||
        activePending.reason === "no_suffix_match")
    ) {
      return;
    }
    const pendingId = activePending.id;
    const suffix = normalizedManualSuffix;
    const timer = window.setTimeout(() => {
      commitTypedSuffix(suffix, pendingId);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activePending, commitTypedSuffix, matchingBusy, normalizedManualSuffix]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (!activePending || matchingBusy) return;
      const tag = String(
        (e.target as HTMLElement | null)?.tagName || "",
      ).toLowerCase();
      if (tag === "textarea") return;
      if (normalizedManualSuffix.length === 3) {
        const aiSuffix = extractLotSuffix3(activePending.aiSuffix);
        const unchangedAiCandidate =
          activePending.candidateMatched &&
          Boolean(aiSuffix) &&
          normalizedManualSuffix === aiSuffix;
        if (!unchangedAiCandidate) {
          e.preventDefault();
          commitTypedSuffix(normalizedManualSuffix, activePending.id, true);
          return;
        }
      }
      e.preventDefault();
      if (
        activePending.candidateMatched &&
        activePending.suggestedRequestMongoId &&
        (!normalizedManualSuffix ||
          normalizedManualSuffix === activePending.aiSuffix)
      ) {
        void confirmSuggestedMatch(activePending.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activePending,
    commitTypedSuffix,
    confirmSuggestedMatch,
    matchingBusy,
    normalizedManualSuffix,
  ]);

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

  const awaitingSuffixMatch = Boolean(
    activePending &&
      normalizedManualSuffix.length === 3 &&
      suffixCommitNote !== "miss" &&
      suffixCommitNote !== "ambiguous" &&
      suffixCommitNote !== "error" &&
      !(
        extractLotSuffix3(activePending.aiSuffix) === normalizedManualSuffix &&
        activePending.aiSuffix &&
        (activePending.candidateMatched ||
          activePending.reason === "no_suffix_match")
      ),
  );
  const isEmpty = !isLoading && displayRequests.length === 0;
  const overlayText = useMemo(() => {
    if (!ocrProcessing && !matchingBusy) return "세척.패킹 이미지를 드롭하세요";
    if (ocrStage === "upload") return "이미지 업로드 중...";
    if (ocrStage === "recognize") return "LOT 인식 중...";
    if (ocrStage === "match" || matchingBusy) return "카드에 매칭 중...";
    return "처리 중...";
  }, [matchingBusy, ocrProcessing, ocrStage]);

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
            className="px-4 pt-2"
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

        {isLoading && <WorksheetLoading />}

        {pendingMatches.length > 0 && (
          <EngravingConfirmFrame previewOpen={previewOpen}>
              <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                <div>
                  <div className="text-xs font-semibold text-accent-strong">
                    각인 인식 확인
                  </div>
                  <div className="text-[11px] text-slate-600">
                    인식이 맞으면 다음 촬영으로 확정됩니다.
                    <br />
                    인식이 안 되면 이미지를 카드에 놓거나 3글자를 입력하세요.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => clearAllPendingMatches()}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  전체 지우기
                </button>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pendingMatches.map((item) => {
                    const selected = item.id === activePending?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.id === activePending?.id) return;
                          setActivePendingId(item.id);
                          setManualSuffixQuery(
                            item.aiSuffix
                              ? extractLotSuffix3(item.aiSuffix)
                              : "",
                          );
                        }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            PACKING_PENDING_DRAG_MIME,
                            item.id,
                          );
                          e.dataTransfer.setData("text/plain", item.id);
                          e.dataTransfer.effectAllowed = "copy";
                          setActivePendingId(item.id);
                        }}
                        className={`relative shrink-0 overflow-hidden rounded-lg border bg-white text-left ${
                          selected
                            ? "border-primary ring-2 ring-primary/40"
                            : "border-slate-200 opacity-80 hover:opacity-100"
                        }`}
                        title="드래그하여 의뢰 카드에 드롭"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.originalName}
                          className="h-28 w-40 object-cover"
                          draggable={false}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-white">
                          {item.aiSuffix
                            ? `AI ${item.aiSuffix}`
                            : "인식 실패"}
                          {item.candidateMatched ? " · 후보" : ""}
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-slate-600 hover:bg-white"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearPendingMatch(item.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              clearPendingMatch(item.id);
                            }
                          }}
                          aria-label="이 이미지 대기 목록에서 제거"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex min-w-[220px] flex-1 flex-col justify-center gap-2">
                  {activePending ? (
                    <div className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-2 text-[11px] text-slate-600">
                      <div>
                        AI 인식:{" "}
                        <span className="font-mono text-sm font-bold tracking-widest text-slate-900">
                          {activePending.aiSuffix || "—"}
                        </span>
                        {activePending.confidence
                          ? ` · ${activePending.confidence}`
                          : ""}
                      </div>
                      <div className="mt-0.5 truncate">
                        {activePending.candidateMatched
                          ? `제안 의뢰: ${activePending.suggestedRequestId || activePending.suggestedLotValue || "—"}`
                          : activePending.reason === "no_suffix_match"
                            ? "인식값은 있으나 세척.패킹 후보 없음"
                            : activePending.reason === "recognition_failed"
                              ? "인식 실패. 3글자를 입력하세요."
                              : activePending.reason === "manual_bind_failed"
                                ? "카드 매칭에 실패했습니다. 다시 놓으세요."
                                : "자동 후보 없음. 3글자를 입력하세요."}
                      </div>
                    </div>
                  ) : null}
                  <label className="text-[11px] font-semibold text-slate-600">
                    각인 코드 정정 (A–Z 3자리)
                  </label>
                  <Input
                    value={manualSuffixQuery}
                    onChange={(e) => {
                      const next = String(e.target.value || "")
                        .toUpperCase()
                        .replace(/[^A-Z]/g, "")
                        .slice(0, 3);
                      setManualSuffixQuery(next);
                    }}
                    placeholder="예: QJK"
                    maxLength={3}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-11 max-w-[160px] font-mono text-lg tracking-[0.35em] uppercase"
                    aria-label="각인 코드 검색"
                  />
                  <div className="text-[11px] text-slate-500">
                    {matchingBusy || awaitingSuffixMatch ? (
                      "매칭 중…"
                    ) : suffixCommitNote === "ambiguous" ? (
                      <>
                        같은 코드가 여러 건입니다.
                        <br />
                        카드에 이미지를 놓으세요.
                      </>
                    ) : suffixCommitNote === "error" ? (
                      <>
                        매칭에 실패했습니다.
                        <br />
                        코드를 다시 입력하세요.
                      </>
                    ) : normalizedManualSuffix ? (
                      `필터: ${displayRequests.length}건`
                    ) : (
                      "3글자를 입력하면 선택한 이미지에 매칭됩니다."
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {exactManualMatchRequest && activePending ? (
                      <button
                        type="button"
                        disabled={matchingBusy}
                        onClick={() =>
                          activePending &&
                          commitTypedSuffix(
                            normalizedManualSuffix,
                            activePending.id,
                            true,
                          )
                        }
                        className="inline-flex w-fit items-center rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                      >
                        {matchingBusy
                          ? "매칭 중…"
                          : `정정 매칭: ${extractLotSuffix3(exactManualMatchRequest.lotNumber?.value)}`}
                      </button>
                    ) : activePending?.candidateMatched ? (
                      <button
                        type="button"
                        disabled={matchingBusy}
                        onClick={() =>
                          void confirmSuggestedMatch(activePending.id)
                        }
                        className="inline-flex w-fit items-center rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                      >
                        {matchingBusy
                          ? "매칭 중…"
                          : `지금 확정 (${activePending.aiSuffix || ""})`}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
          </EngravingConfirmFrame>
        )}

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
                    className="rounded-lg border border-primary-muted bg-primary-soft shadow-sm px-4 py-2 text-sm min-w-[160px] max-w-[220px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-primary-strong tracking-widest text-lg">
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
                    <div className="text-xs text-primary mt-0.5">
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
            <div className="text-gray-500">
              {awaitingSuffixMatch || matchingBusy
                ? "매칭 중…"
                : suffixCommitNote === "ambiguous"
                  ? "같은 각인 코드가 여러 건입니다."
                  : suffixCommitNote === "error"
                    ? "매칭에 실패했습니다."
                    : normalizedManualSuffix
                      ? `각인 코드 "${normalizedManualSuffix}"에 맞는 의뢰가 없습니다.`
                      : "의뢰가 없습니다."}
            </div>
          </div>
        ) : !isLoading ? (
          <>
            <WorksheetCardGrid
              requests={displayRequests}
              printedRequestIds={new Set(printedPackingRequestIds)}
              onDownload={handleDownloadOriginalStl}
              onOpenPreview={handleOpenPreview}
              onDeleteCam={() => {}}
              onDeleteNc={handleDeleteNc}
              onCloneSample={handleCloneSampleForProduction}
              onSaveToRnd={handleSaveToRnd}
              onRollback={handleCardRollback}
              onApprove={handleCardApprove}
              onDelete={handleCardDelete}
              onDone={handleCardDone}
              onUploadNc={handleUploadByStage}
              onPackingImageDrop={handlePackingImageDropOnRequest}
              packingDropEnabled
              packingMatchHintIds={packingMatchHintIds}
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
              {normalizedManualSuffix
                ? `필터 결과 ${displayRequests.length}건`
                : visibleCount >= filteredAndSorted.length
                  ? "모든 의뢰를 표시했습니다."
                  : "스크롤하여 더보기"}
            </div>
          </>
        ) : null}
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

        {(isDraggingOver || ocrProcessing) && (
          <BodyPortal>
          <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20">
            <div className="rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-slate-800 shadow flex items-center gap-2">
              {ocrProcessing && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
              )}
              <span>{overlayText}</span>
            </div>
          </div>
          </BodyPortal>
        )}
      </div>
    </div>
  );
};
