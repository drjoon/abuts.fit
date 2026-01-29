import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  type ManufacturerRequest,
  stageOrder,
  deriveStageForFilter,
} from "../request/utils";
import { WorksheetCardGrid } from "../request/WorksheetCardGrid";
import { PreviewModal } from "../request/PreviewModal";
import { useRequestFileHandlers } from "../request/useRequestFileHandlers";
import { usePreviewLoader } from "../request/usePreviewLoader";

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

export const PackagingPage = () => {
  const { user, token } = useAuthStore();
  const { worksheetSearch, showCompleted } = useOutletContext<{
    worksheetSearch: string;
    showCompleted: boolean;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabStage = "packaging";

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

      if (data.success && Array.isArray(raw?.requests)) {
        setRequests(raw.requests);
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

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) => {
      return handleUploadStageFile({
        req,
        stage: "packaging",
        file: files[0],
        source: "manual",
      });
    },
    [handleUploadStageFile],
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

      void handleDeleteStageFile({
        req,
        stage: "packaging",
        rollbackOnly: true,
      });
    },
    [handleDeleteStageFile],
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const searchLower = worksheetSearch.toLowerCase();
  const currentStageForTab = "세척.포장";
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
      return stage === "세척.포장";
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
    <div className="flex flex-col gap-4">
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      )}

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
            uploadProgress={uploadProgress}
            isCamStage={false}
            isMachiningStage={false}
            uploading={uploading}
            downloading={downloading}
            deletingCam={{}}
            deletingNc={deletingNc}
            currentStageOrder={currentStageOrder}
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
