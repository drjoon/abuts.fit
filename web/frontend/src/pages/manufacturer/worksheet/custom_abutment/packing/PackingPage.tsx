import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
  type DragEvent,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  type ManufacturerRequest,
  stageOrder,
  deriveStageForFilter,
  getDiameterBucketIndex,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { type DiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import { type WorksheetQueueItem } from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import { WorksheetQueueSummary } from "@/shared/ui/dashboard/WorksheetQueueSummary";
import { WorksheetCardGrid } from "../components/WorksheetCardGrid";
import { PreviewModal } from "../components/PreviewModal";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import { usePreviewLoader } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { WorksheetLoading } from "@/shared/ui/WorksheetLoading";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";

// TODO: 개발 완료 후 false로 변경 (LOT 인식 API 호출 대신 "AAD" 하드코딩)
const IS_SIMULATION_MODE = true;

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

export const PackingPage = ({
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

  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<any>({});
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
  const [deletingNc, setDeletingNc] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [visibleCount, setVisibleCount] = useState(9);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [selectedBucket, setSelectedBucket] =
    useState<DiameterBucketKey | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrStage, setOcrStage] = useState<"idle" | "upload" | "recognize">(
    "idle",
  );

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

  const { uploadFiles: uploadToS3 } = useS3TempUpload({ token });

  const fetchRequests = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const path =
        user?.role === "admin"
          ? "/api/admin/requests"
          : user?.role === "manufacturer"
            ? "/api/requests/all"
            : "/api/requests";

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
        return;
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
    } catch (error) {
      console.error("Error fetching requests:", error);
      toast({
        title: "의뢰 불러오기 실패",
        description: "네트워크 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, user?.role, toast]);

  const {
    handleDownloadOriginalStl,
    handleDownloadCamStl,
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

  const extractLotSuffix3 = useCallback((value: string | null | undefined) => {
    const s = String(value || "").toUpperCase();
    const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
    return match ? match[0] : "";
  }, []);

  const resizeImageFile = useCallback((file: File) => {
    return new Promise<File>((resolve) => {
      const reader = new FileReader();
      const image = new Image();

      reader.onload = () => {
        image.onload = () => {
          const SCALE_RATIO = 0.2; // 원본 대비 1/5 크기
          const canvas = document.createElement("canvas");
          canvas.width = image.width * SCALE_RATIO;
          canvas.height = image.height * SCALE_RATIO;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const resizedFile = new File([blob], file.name, {
              type: file.type,
            });
            resolve(resizedFile);
          }, file.type || "image/jpeg");
        };

        image.onerror = () => {
          resolve(file);
        };

        image.src = reader.result as string;
      };

      reader.onerror = () => {
        resolve(file);
      };

      reader.readAsDataURL(file);
    });
  }, []);

  const handlePackingImageDrop = useCallback(
    async (imageFiles: File[]) => {
      if (!token || imageFiles.length === 0) return;

      setOcrProcessing(true);
      setOcrStage("upload");
      try {
        const resizedFiles = await Promise.all(
          imageFiles.map((file) => resizeImageFile(file)),
        );

        const uploadResult = await uploadToS3(resizedFiles);
        setOcrStage("recognize");

        await Promise.allSettled(
          uploadResult.map(async (uploaded, index) => {
            try {
              const resizedFile = resizedFiles[index] ?? imageFiles[index];

              if (!uploaded?.key) {
                toast({
                  title: "이미지 업로드에 실패했습니다",
                  description: "잠시 후 다시 시도해주세요.",
                  variant: "destructive",
                });
                return;
              }

              let rawLot: string = "";

              if (IS_SIMULATION_MODE) {
                await new Promise((resolve) => setTimeout(resolve, 800)); // 시뮬레이션 지연
                rawLot = "AAD";
              } else {
                const aiRes = await fetch("/api/ai/recognize-lot-number", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    s3Key: uploaded.key,
                    originalName: uploaded.originalName,
                  }),
                });

                if (!aiRes.ok) {
                  toast({
                    title: "LOT 번호 인식에 실패했습니다",
                    description: "AI 인식 서버 응답이 올바르지 않습니다.",
                    variant: "destructive",
                  });
                  return;
                }

                const aiData = await aiRes.json();
                rawLot = aiData?.data?.lotNumber || "";
              }

              const recognizedSuffix = extractLotSuffix3(rawLot || "");
              if (!recognizedSuffix) {
                toast({
                  title: "LOT 코드를 인식하지 못했습니다",
                  description:
                    "이미지 내 영문 대문자 3글자가 보이도록 다시 촬영해주세요.",
                  variant: "destructive",
                });
                return;
              }

              const matchingRequest = requests.find((req) => {
                const part = String(req.lotNumber?.part || "");
                const partSuffix = extractLotSuffix3(part);
                return partSuffix === recognizedSuffix;
              });

              if (!matchingRequest) {
                toast({
                  title: "누락",
                  description: `일치하는 의뢰 없음: ${recognizedSuffix}`,
                });
                return;
              }

              await handleUploadStageFile({
                req: matchingRequest,
                stage: "packing",
                file: resizedFile || imageFiles[index] || imageFiles[0],
                source: "manual",
              });

              await handleUpdateReviewStatus({
                req: matchingRequest,
                status: "APPROVED",
                stageOverride: "packing",
              });

              toast({
                title: "세척·포장 완료",
                description: `LOT 코드 ${recognizedSuffix} 의뢰를 발송 단계로 이동했습니다.`,
              });
            } catch (error) {
              toast({
                title: "이미지 처리 실패",
                description:
                  (error as Error)?.message ||
                  "세척·포장 이미지 처리 중 오류가 발생했습니다.",
                variant: "destructive",
              });
            }
          }),
        );
      } catch (error: any) {
        console.error("Packing LOT 인식 처리 오류:", error);
        toast({
          title: "이미지 처리 실패",
          description:
            error?.message || "세척·포장 이미지 처리 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setOcrProcessing(false);
        setOcrStage("idle");
      }
    },
    [
      extractLotSuffix3,
      handleUpdateReviewStatus,
      handleUploadStageFile,
      requests,
      toast,
      token,
      uploadToS3,
      resizeImageFile,
    ],
  );

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) => {
      return handleUploadStageFile({
        req,
        stage: "packing",
        file: files[0],
        source: "manual",
      });
    },
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
        return;
      }
    },
    [handleDeleteStageFile, handleUpdateReviewStatus],
  );

  const handlePageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer.files || []);
      if (files.length === 0) return;

      const imageFiles = files.filter((file) => {
        const name = file.name.toLowerCase();
        return (
          name.endsWith(".jpg") ||
          name.endsWith(".jpeg") ||
          name.endsWith(".png")
        );
      });

      if (imageFiles.length === 0) return;

      void handlePackingImageDrop(imageFiles);
    },
    [handlePackingImageDrop],
  );

  const handlePageDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handlePageDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const searchLower = worksheetSearch.toLowerCase();
  const currentStageForTab = "세척.패킹";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const filteredBase = (() => {
    if (showCompleted) {
      return requests.filter((req) => {
        const stage = deriveStageForFilter(req);
        const order = stageOrder[stage] ?? 0;
        return order >= currentStageOrder;
      });
    }

    return requests.filter((req) => {
      const stage = deriveStageForFilter(req);
      return stage === "세척.패킹";
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
        setPreviewOpen(false);
        return;
      }

      setTimeout(() => {
        void handleOpenPreview(nextReq);
      }, 200);
    },
    [filteredAndSorted, handleOpenPreview, setPreviewOpen],
  );

  const paginatedRequests = filteredAndSorted.slice(0, visibleCount);

  const diameterQueueForPacking = useMemo(() => {
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
        qty: 1,
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          visibleCount < filteredAndSorted.length
        ) {
          setVisibleCount((prev) => prev + 9);
        }
      },
      { threshold: 0.1 },
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => {
      if (sentinelRef.current) {
        observer.unobserve(sentinelRef.current);
      }
    };
  }, [visibleCount, filteredAndSorted.length]);

  return (
    <div
      className="relative w-full text-gray-800 flex flex-col items-stretch"
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

        {!isLoading && paginatedRequests.length === 0 && (
          <div className="flex justify-center py-8">
            <div className="text-gray-500">의뢰가 없습니다.</div>
          </div>
        )}

        {!isLoading && paginatedRequests.length > 0 && (
          <>
            <WorksheetCardGrid
              requests={paginatedRequests}
              onDownload={handleDownloadOriginalStl}
              onOpenPreview={handleOpenPreview}
              onDeleteCam={() => {}}
              onDeleteNc={handleDeleteNc}
              onRollback={handleCardRollback}
              onApprove={handleCardApprove}
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
        )}

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
          onOpenNextRequest={(id) => {}}
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
              <span>
                {ocrProcessing
                  ? ocrStage === "upload"
                    ? "이미지 업로드 중..."
                    : ocrStage === "recognize"
                      ? "LOT 인식 중..."
                      : "처리 중..."
                  : "세척.패킹 이미지를 드롭하세요"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
