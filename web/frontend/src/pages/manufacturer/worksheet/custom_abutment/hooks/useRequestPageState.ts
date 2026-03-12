import { useState, useCallback, useRef, useEffect } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { type DiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";

type PreviewFiles = {
  original?: File | null;
  cam?: File | null;
  title?: string;
  request?: ManufacturerRequest | null;
};

export const useRequestPageState = () => {
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
  const [confirmDescription, setConfirmDescription] =
    useState<React.ReactNode>("");
  const [confirmAction, setConfirmAction] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [deletingCam, setDeletingCam] = useState<Record<string, boolean>>({});
  const [deletingNc, setDeletingNc] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedPackingRequestIds, setSelectedPackingRequestIds] = useState<
    string[]
  >([]);

  const visibleCountRef = useRef(12);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const totalCountRef = useRef(0);
  const userScrolledRef = useRef(false);
  const didInitPackingSelectionRef = useRef(false);
  const pageRefForCore = useRef(1);
  const hasMoreRefForCore = useRef(true);
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

  return {
    requests,
    setRequests,
    isLoading,
    setIsLoading,
    receiveQueueModalOpen,
    setReceiveQueueModalOpen,
    receiveSelectedBucket,
    setReceiveSelectedBucket,
    downloading,
    setDownloading,
    uploading,
    setUploading,
    previewOpen,
    setPreviewOpen,
    previewLoading,
    setPreviewLoading,
    previewFiles,
    setPreviewFiles,
    reviewSaving,
    setReviewSaving,
    previewNcText,
    setPreviewNcText,
    previewNcName,
    setPreviewNcName,
    previewStageUrl,
    setPreviewStageUrl,
    previewStageName,
    setPreviewStageName,
    confirmOpen,
    setConfirmOpen,
    confirmTitle,
    setConfirmTitle,
    confirmDescription,
    setConfirmDescription,
    confirmAction,
    setConfirmAction,
    deletingCam,
    setDeletingCam,
    deletingNc,
    setDeletingNc,
    uploadProgress,
    setUploadProgress,
    visibleCount,
    setVisibleCount,
    selectedPackingRequestIds,
    setSelectedPackingRequestIds,
    visibleCountRef,
    scrollContainerRef,
    sentinelRef,
    totalCountRef,
    userScrolledRef,
    didInitPackingSelectionRef,
    pageRefForCore,
    hasMoreRefForCore,
    setScrollContainer,
  };
};
