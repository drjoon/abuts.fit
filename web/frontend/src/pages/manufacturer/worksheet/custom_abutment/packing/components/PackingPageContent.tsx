import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
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
import { WorksheetCardGrid } from "../../components/WorksheetCardGrid";
import { PreviewModal } from "../../components/PreviewModal";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import { usePreviewLoader } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useWorksheetRealtimeStatus } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus";
import { PackingPrinterSettingsDialog } from "../components/PackingPrinterSettingsDialog";
import { usePackingPrintSettings } from "../hooks/usePackingPrintSettings";
import { usePackingWorksheetData } from "../hooks/usePackingWorksheetData";
import { usePackingCapture } from "../hooks/usePackingCapture";
import {
  buildPackLabelBitmapZpl,
  getLotLabel,
  renderPackLabelToCanvas,
  resolveManufacturingDate,
} from "../utils/packLabelRenderer";
import { savePackingLabelsAsZip } from "../utils/packLabelZip";
import { Settings } from "lucide-react";

export const PackingPageContent = ({
  showQueueBar = true,
}: {
  showQueueBar?: boolean;
}) => {
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
      const stage = deriveStageForFilter(req);
      if (showCompleted) {
        return ["세척.패킹", "포장.발송", "추적관리"].includes(stage);
      }
      return stage === "세척.패킹";
    },
    [showCompleted],
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

  const handleClearPackingRequests = useCallback(() => {
    setSelectedPackingRequestIds([]);
  }, []);

  useEffect(() => {
    setSelectedPackingRequestIds((prev) => {
      const validIds = new Set(allPackingRequestIds);
      const next = prev.filter((id) => validIds.has(id));
      if (!didInitPackingSelectionRef.current) {
        didInitPackingSelectionRef.current = true;
        return allPackingRequestIds;
      }
      return next;
    });
  }, [allPackingRequestIds]);

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
          const stage = deriveStageForFilter(req);
          if (showCompleted) {
            return ["세척.패킹", "포장.발송", "추적관리"].includes(stage);
          }
          return stage === "세척.패킹";
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
          return text.includes(worksheetSearch.toLowerCase());
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

      const resolvePackScrewCode = (request: ManufacturerRequest) => {
        const manufacturer = requireNonEmptyString(
          (request.caseInfos as any)?.implantManufacturer,
          "제조사",
          request,
        );
        const isDentium = /\bDENTIUM\b/i.test(manufacturer)
          ? true
          : manufacturer.includes("덴티움");
        const legacy = isDentium ? "8B" : "0A";
        return legacy.split("").reverse().join("");
      };

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
      const screwType = resolvePackScrewCode(req);
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
        patientName,
        toothNumber,
        material,
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
          description: `${req.requestId || fullLotNumber} (${generateModelNumber((req as any)?.caseInfos, fullLotNumber) || ""}) 라벨을 출력했습니다.`,
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
    uploadStageFile: handleUploadStageFile,
    updateReviewStatus: handleUpdateReviewStatus,
    fetchRequestsList,
    setRequests,
    previewOpen,
    previewFiles,
    handleOpenPreview,
    handleAutoPrintProcessedRequest: async (req) => {
      try {
        await handlePrintSinglePackingLabel(req, {
          silentSuccess: true,
          silentError: false,
        });
      } catch (error) {
        toast({
          title: "패킹 라벨 자동 출력 실패",
          description:
            error instanceof Error && error.message
              ? error.message
              : "패킹 라벨 자동 출력 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
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
            total={diameterQueueForPacking.total}
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
                {isPrintingPackingLabels ? "출력 중..." : "🏷️ 패킹 라벨 출력"}
              </button>
              <div className="w-2" />
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
                전체 선택
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
                전체 해제
              </button>
              <div className="text-xs text-slate-500">
                전체 {allPackingRequestIds.length}개 / 선택{" "}
                {selectedPackingRequestIds.length}개
              </div>
            </div>
          </div>
        </div>

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
              onToggleSelected={handleTogglePackingRequest}
              onDownload={handleDownloadOriginalStl}
              onOpenPreview={handleOpenPreview}
              onDeleteCam={() => {}}
              onDeleteNc={handleDeleteNc}
              onRollback={handleCardRollback}
              onApprove={handleCardApprove}
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
