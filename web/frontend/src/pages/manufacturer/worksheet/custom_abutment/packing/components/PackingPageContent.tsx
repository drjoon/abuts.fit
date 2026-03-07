import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
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
import { PackingPrinterSettingsDialog } from "../components/PackingPrinterSettingsDialog";
import { usePackingPrintSettings } from "../hooks/usePackingPrintSettings";
import { usePackingWorksheetData } from "../hooks/usePackingWorksheetData";
import { usePackingCapture } from "../hooks/usePackingCapture";
import {
  downloadPngFromCanvas,
  getLotLabel,
  renderPackLabelToCanvas,
  resolveManufacturingDate,
} from "../utils/packLabelRenderer";
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
    previewOpen,
    previewFiles,
    handleOpenPreview,
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

  const handlePrintPackingLabels = useCallback(async () => {
    if (!paginatedRequests.length) {
      toast({
        title: "출력할 의뢰 없음",
        description: "현재 화면에 출력할 의뢰가 없습니다.",
        variant: "destructive",
      });
      return;
    }
    setIsPrintingPackingLabels(true);
    let successCount = 0;
    let failCount = 0;
    let firstErrorMessage = "";
    try {
      for (const req of paginatedRequests) {
        try {
          const caseInfos = req.caseInfos || {};
          const lot = getLotLabel(req);
          const mailboxCode = String(req.mailboxAddress || "").trim() || "-";
          const labName =
            String((req as any)?.requestorOrganizationId?.name || "").trim() ||
            String((req as any)?.requestor?.organization || "").trim() ||
            String((req as any)?.requestor?.name || "").trim() ||
            "-";
          const implantManufacturer = String(
            (caseInfos as any)?.implantManufacturer || "",
          ).trim();
          const isDentium = /\bDENTIUM\b/i.test(implantManufacturer)
            ? true
            : implantManufacturer.includes("덴티움");
          const screwType = isDentium ? "8B" : "0A";
          const clinicName = String(caseInfos.clinicName || "").trim() || "-";
          const implantBrand = String(
            (caseInfos as any)?.implantBrand || "",
          ).trim();
          const implantFamily = String(
            (caseInfos as any)?.implantFamily || "",
          ).trim();
          const implantType = String(
            (caseInfos as any)?.implantType || "",
          ).trim();
          const createdAtIso = req.createdAt ? String(req.createdAt) : "";
          const { manufacturingDate, rawSources } =
            resolveManufacturingDate(req);
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
            failCount += 1;
            toast({
              title: "제조일자를 확인할 수 없습니다",
              description: `${req.requestId || lot || "의뢰"}의 가공 완료 시각이 없어 라벨을 생성할 수 없습니다.`,
              variant: "destructive",
            });
            continue;
          }
          const material =
            (typeof (caseInfos as any)?.material === "string" &&
              (caseInfos as any).material) ||
            (typeof (req as any)?.material === "string" &&
              (req as any).material) ||
            (typeof (req.lotNumber as any)?.material === "string" &&
              (req.lotNumber as any).material) ||
            "";
          const payload = {
            printer: printerProfile || undefined,
            paperProfile: paperProfile || undefined,
            copies: 1,
            requestId: req.requestId,
            lotNumber: lot,
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
            patientName: caseInfos.patientName || "",
            toothNumber: caseInfos.tooth || "",
            material,
            caseType: "Custom Abutment",
            printedAt: new Date().toISOString(),
          };
          if (packOutputMode === "image") {
            const canvas = await renderPackLabelToCanvas({
              ...payload,
              dpi: packLabelDpi,
              targetDots: packLabelDots,
              designDots: packLabelDesignDots,
            });
            const base = String(req.requestId || lot || "pack").replace(
              /[^a-zA-Z0-9._-]+/g,
              "_",
            );
            await downloadPngFromCanvas(canvas, `${base}-pack.png`);
            successCount += 1;
            continue;
          }
          const response = await fetch(
            "/api/requests/packing/print-packing-label",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            },
          );
          const data = await response.json().catch(() => null);
          if (!response.ok || !data?.success) {
            throw new Error(data?.message || "패킹 라벨 출력에 실패했습니다.");
          }
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
    toast,
    token,
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

        <div className="flex-shrink-0 w-full sticky top-0 z-40 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 my-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 pb-3 px-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPrinterModalOpen(true)}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                aria-label="프린터 설정"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handlePrintPackingLabels}
                disabled={
                  isPrintingPackingLabels || paginatedRequests.length === 0
                }
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                  isPrintingPackingLabels || paginatedRequests.length === 0
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm"
                }`}
              >
                {isPrintingPackingLabels ? "출력 중..." : "🏷️ 패킹 라벨 출력"}
              </button>
            </div>
          </div>
        </div>

        {isEmpty ? (
          <div className="flex justify-center py-8">
            <div className="text-gray-500">의뢰가 없습니다.</div>
          </div>
        ) : (
          !isLoading && (
            <>
              <WorksheetCardGrid
                requests={paginatedRequests}
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
          )
        )}

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
