import {
  useMemo,
  useState,
  useEffect,
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
import {
  WorksheetDiameterQueueBar,
  type DiameterBucketKey,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import { useToast } from "@/hooks/use-toast";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import { Badge } from "@/components/ui/badge";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import { getFileBlob, setFileBlob } from "@/utils/stlIndexedDb";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getReviewStageKeyByTab,
  getReviewLabel,
  getReviewBadgeClassName,
  getDiameterBucketIndex,
  computeStageLabel,
  deriveStageForFilter,
  stageOrder,
  getAcceptByStage,
} from "./utils";
import { WorksheetCardGrid } from "./WorksheetCardGrid";
import { PreviewModal } from "./PreviewModal";
import { useRequestFileHandlers } from "./useRequestFileHandlers";

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
    {}
  );
  const [visibleCount, setVisibleCount] = useState(9);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  const decodeNcText = useCallback((buffer: ArrayBuffer) => {
    // 우선 UTF-8 시도 후 깨진 경우 EUC-KR로 재시도
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
      const url =
        user?.role === "admin"
          ? "/api/admin/requests"
          : user?.role === "manufacturer"
          ? "/api/requests/all"
          : "/api/requests";
      const params = new URLSearchParams();
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      // DB 메타 확인용 로그
      if (list.length) {
        console.groupCollapsed("[request files] 목록");
        list.forEach((req: ManufacturerRequest) => {
          console.log(req._id, {
            file: req.caseInfos?.file,
            camFile: req.caseInfos?.camFile,
            ncFile: req.caseInfos?.ncFile,
            status: req.status,
            status2: req.status2,
          });
        });
        console.groupEnd();
      }
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

  const handleImageDropForOCR = useCallback(
    async (files: File[]) => {
      if (!isMachiningStage || !token) return;

      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      if (imageFiles.length === 0) {
        toast({
          title: "이미지 파일이 아닙니다",
          description: "이미지 파일(.png, .jpg 등)만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      setOcrProcessing(true);

      try {
        // S3에 이미지 업로드
        const uploaded = await uploadToS3(imageFiles);
        if (!uploaded || uploaded.length === 0) {
          throw new Error("이미지 업로드 실패");
        }

        const uploadedFile = uploaded[0];

        // OCR API 호출
        const ocrRes = await fetch("/api/ai/recognize-lot-number", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            s3Key: uploadedFile.key,
            originalName: uploadedFile.originalName,
          }),
        });

        if (!ocrRes.ok) {
          throw new Error("OCR 처리 실패");
        }

        const ocrData = await ocrRes.json();
        const recognizedLotNumber = ocrData?.data?.lotNumber;

        if (!recognizedLotNumber) {
          toast({
            title: "로트넘버를 인식하지 못했습니다",
            description:
              "이미지에서 로트넘버를 찾을 수 없습니다. 수동으로 업로드해주세요.",
            variant: "destructive",
          });
          return;
        }

        // 로트넘버와 일치하는 request 찾기
        const matchingRequest = requests.find(
          (req) => req.lotNumber?.trim() === recognizedLotNumber.trim()
        );

        if (!matchingRequest) {
          toast({
            title: "일치하는 의뢰를 찾을 수 없습니다",
            description: `인식된 로트넘버: ${recognizedLotNumber}`,
            variant: "destructive",
          });
          return;
        }

        // 해당 request에 이미지 업로드
        await handleUploadStageFile({
          req: matchingRequest,
          stage: "machining",
          file: imageFiles[0],
          source: "manual",
        });

        toast({
          title: "업로드 완료",
          description: `로트넘버 ${recognizedLotNumber}에 이미지가 업로드되었습니다.`,
        });
      } catch (error: any) {
        console.error("OCR 처리 오류:", error);
        toast({
          title: "OCR 처리 실패",
          description: error.message || "오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setOcrProcessing(false);
      }
    },
    [
      isMachiningStage,
      token,
      uploadToS3,
      requests,
      handleUploadStageFile,
      toast,
    ]
  );

  useEffect(() => {
    if (!(isMachiningStage || isCamStage)) return;

    const onWindowDragOver = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    };

    const onWindowDragLeave = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
    };

    const onWindowDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;

      if (isMachiningStage) {
        void handleImageDropForOCR(files);
        return;
      }

      if (isCamStage) {
        const filledStlFiles = files.filter((f) =>
          f.name.toLowerCase().endsWith(".filled.stl")
        );
        if (filledStlFiles.length === 0) return;

        const getBase = (n: string) => {
          const s = String(n || "").trim();
          return s
            .replace(/\.filled\.stl$/i, "")
            .replace(/\.cam\.stl$/i, "")
            .replace(/\.stl$/i, "")
            .replace(/\.nc$/i, "");
        };

        const normalize = (n: string) =>
          n.trim().toLowerCase().normalize("NFC");

        filledStlFiles.forEach((file) => {
          const fileBase = normalize(getBase(file.name));
          const matchingReq = requests.find((r) => {
            const rBase = normalize(
              getBase(
                r.caseInfos?.camFile?.fileName ||
                  r.caseInfos?.camFile?.originalName ||
                  r.caseInfos?.file?.fileName ||
                  r.caseInfos?.file?.originalName ||
                  ""
              )
            );
            return rBase === fileBase;
          });

          if (matchingReq) {
            void handleUploadCam(matchingReq, [file]);
          }
        });
      }
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("drop", onWindowDrop);

    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [
    isMachiningStage,
    isCamStage,
    handleImageDropForOCR,
    handleUploadCam,
    requests,
  ]);

  const handlePageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      if (isMachiningStage) {
        void handleImageDropForOCR(files);
      } else if (isCamStage) {
        // .filled.stl 파일 매칭 업로드
        const filledStlFiles = files.filter((f) =>
          f.name.toLowerCase().endsWith(".filled.stl")
        );
        if (filledStlFiles.length === 0) return;

        const getBase = (n: string) => {
          const s = String(n || "").trim();
          return s
            .replace(/\.filled\.stl$/i, "")
            .replace(/\.cam\.stl$/i, "")
            .replace(/\.stl$/i, "")
            .replace(/\.nc$/i, "");
        };

        const normalize = (n: string) =>
          n.trim().toLowerCase().normalize("NFC");

        filledStlFiles.forEach((file) => {
          const fileBase = normalize(getBase(file.name));
          const matchingReq = requests.find((r) => {
            const rBase = normalize(
              getBase(
                r.caseInfos?.camFile?.fileName ||
                  r.caseInfos?.camFile?.originalName ||
                  r.caseInfos?.file?.fileName ||
                  r.caseInfos?.file?.originalName ||
                  ""
              )
            );
            return rBase === fileBase;
          });

          if (matchingReq) {
            void handleUploadCam(matchingReq, [file]);
          }
        });
      }
    },
    [
      isMachiningStage,
      isCamStage,
      handleImageDropForOCR,
      handleUploadNc,
      requests,
    ]
  );

  const handlePageDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMachiningStage || isCamStage) {
        setIsDraggingOver(true);
      }
    },
    [isMachiningStage, isCamStage]
  );

  const handlePageDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleUploadByStage = useCallback(
    (req: ManufacturerRequest, files: File[]) => {
      if (isCamStage) return handleUploadNc(req, files);
      return handleUploadCam(req, files);
    },
    [isCamStage, handleUploadNc, handleUploadCam]
  );

  const handleUploadFromModal = useCallback(
    (req: ManufacturerRequest, file: File) => {
      if (!req?._id) return;
      void handleUploadByStage(req, [file]);
    },
    [handleUploadByStage]
  );

  const handleCardRollback = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;

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
        void handleDeleteStageFile({
          req,
          stage: "shipping",
          rollbackOnly: true,
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
    [tabStage, handleDeleteStageFile, handleDeleteNc]
  );

  const enableCardRollback =
    tabStage === "cam" ||
    tabStage === "machining" ||
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
        if (url) {
          window.open(url, "_blank");
        } else {
          throw new Error("no url");
        }
      } catch (error) {
        toast({
          title: "다운로드 실패",
          description: isMachiningStage
            ? "NC 파일을 가져올 수 없습니다."
            : isCamStage
            ? "CAM STL을 가져올 수 없습니다."
            : "원본 STL을 가져올 수 없습니다.",
          variant: "destructive",
        });
      } finally {
        setDownloading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, toast, isCamStage, isMachiningStage, tabStage]
  );

  const handleOpenPreview = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      try {
        setPreviewLoading(true);
        setPreviewNcText("");
        setPreviewNcName("");
        setPreviewStageUrl("");
        setPreviewStageName("");
        toast({
          title: "다운로드 중...",
          description: "STL을 불러오고 있습니다.",
          duration: 60000,
        });

        const blobToFile = (blob: Blob, filename: string) =>
          new File([blob], filename, {
            type: blob.type || "model/stl",
          });

        const fetchAsFileWithCache = async (
          cacheKey: string | null,
          signedUrl: string,
          filename: string
        ) => {
          if (cacheKey) {
            const cached = await getFileBlob(cacheKey);
            if (cached) {
              return blobToFile(cached, filename);
            }
          }

          const r = await fetch(signedUrl);
          if (!r.ok) throw new Error("file fetch failed");
          const blob = await r.blob();

          if (cacheKey) {
            try {
              await setFileBlob(cacheKey, blob);
            } catch {
              // ignore cache write errors
            }
          }

          return blobToFile(blob, filename);
        };

        const title =
          req.caseInfos?.patientName ||
          req.requestor?.organization ||
          req.requestor?.name ||
          "파일 미리보기";

        const originalName =
          req.caseInfos?.file?.fileName ||
          req.caseInfos?.file?.originalName ||
          "original.stl";

        const originalCacheKey = req.caseInfos?.file?.s3Key || null;

        const originalUrlRes = await fetch(
          `/api/requests/${req._id}/original-file-url`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!originalUrlRes.ok) throw new Error("original url failed");
        const originalUrlBody = await originalUrlRes.json();
        const originalSignedUrl = originalUrlBody?.data?.url;
        if (!originalSignedUrl) throw new Error("no original url");

        const originalFile = await fetchAsFileWithCache(
          originalCacheKey,
          originalSignedUrl,
          originalName
        );

        let camFile: File | null = null;
        const hasCamFile = !!(
          req.caseInfos?.camFile?.s3Key ||
          req.caseInfos?.camFile?.fileName ||
          req.caseInfos?.camFile?.originalName
        );

        if (hasCamFile) {
          const camName =
            req.caseInfos?.camFile?.fileName ||
            req.caseInfos?.camFile?.originalName ||
            originalName;

          const camCacheKey = req.caseInfos?.camFile?.s3Key || null;
          const camUrlRes = await fetch(
            `/api/requests/${req._id}/cam-file-url`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (camUrlRes.ok) {
            const camUrlBody = await camUrlRes.json();
            const camSignedUrl = camUrlBody?.data?.url;
            if (camSignedUrl) {
              camFile = await fetchAsFileWithCache(
                camCacheKey,
                camSignedUrl,
                camName
              );
            }
          }
        }

        // CAM / 생산 탭에서 NC 프리뷰를 보여주기 위해 NC를 읽어온다.
        if (isCamStage || isMachiningStage) {
          const ncMeta = req.caseInfos?.ncFile;
          if (ncMeta?.s3Key) {
            const ncUrlRes = await fetch(
              `/api/requests/${req._id}/nc-file-url`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (ncUrlRes.ok) {
              const ncUrlBody = await ncUrlRes.json();
              const ncSignedUrl = ncUrlBody?.data?.url;
              if (ncSignedUrl) {
                const ncName =
                  ncMeta?.fileName || ncMeta?.originalName || "program.nc";
                const r = await fetch(ncSignedUrl);
                if (r.ok) {
                  const buf = await r.arrayBuffer();
                  const text = decodeNcText(buf);
                  setPreviewNcText(text);
                  setPreviewNcName(ncName);
                }
              }
            }
          }
        }

        // 생산/발송/추적관리 탭: stageFiles 이미지 URL도 불러온다.
        const stageKey = getReviewStageKeyByTab({
          stage: tabStage,
          isCamStage,
          isMachiningStage,
        });
        if (
          stageKey === "machining" ||
          stageKey === "packaging" ||
          stageKey === "shipping" ||
          stageKey === "tracking"
        ) {
          const stageMeta = req.caseInfos?.stageFiles?.[stageKey];
          if (stageMeta?.s3Key) {
            const stageUrlRes = await fetch(
              `/api/requests/${
                req._id
              }/stage-file-url?stage=${encodeURIComponent(stageKey)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (stageUrlRes.ok) {
              const stageUrlBody = await stageUrlRes.json();
              const signedUrl = stageUrlBody?.data?.url;
              if (signedUrl) {
                setPreviewStageUrl(signedUrl);
                setPreviewStageName(stageMeta?.fileName || `${stageKey}-file`);
              }
            }
          }
        }

        setPreviewFiles({
          original: originalFile,
          cam: camFile,
          title,
          request: req,
        });
        setPreviewOpen(true);
        toast({
          title: "다운로드 완료",
          description: "캐시에서 재사용됩니다.",
          duration: 2000,
        });
      } catch (error) {
        toast({
          title: "미리보기 실패",
          description: "파일을 불러올 수 없습니다.",
          variant: "destructive",
        });
      } finally {
        setPreviewLoading(false);
      }
    },
    [token, toast, isCamStage, isMachiningStage]
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const searchLower = worksheetSearch.toLowerCase();
  const currentStageForTab = isMachiningStage
    ? "생산"
    : isCamStage
    ? "CAM"
    : "의뢰";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const filteredBase = (() => {
    // 완료포함: 탭 기준 단계 이상 모든 건 포함 (CAM 탭=CAM~추적관리, 생산 탭=생산~추적관리)
    if (showCompleted) {
      return requests.filter((req) => {
        const stage = deriveStageForFilter(req);
        const order = stageOrder[stage] ?? 0;
        return order >= currentStageOrder;
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
    .sort((a, b) => (new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1));

  const handleOpenNextRequest = useCallback(
    (currentReqId: string) => {
      const currentIndex = filteredAndSorted.findIndex(
        (r) => r._id === currentReqId
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
    [filteredAndSorted, handleOpenPreview, setPreviewOpen]
  );

  const paginatedRequests = filteredAndSorted.slice(0, visibleCount);
  const groupedByOrg = useMemo(() => {
    if (!isMachiningStage) return null;
    const map = new Map<
      string,
      { org: string; requests: ManufacturerRequest[]; complete: boolean }
    >();
    for (const req of paginatedRequests) {
      const org =
        req.requestor?.organization ||
        req.requestor?.name ||
        req.requestor?._id ||
        "기공소 미지정";
      const stageLabel = computeStageLabel(req, {
        isCamStage,
        isMachiningStage,
      });
      const order = stageOrder[stageLabel] ?? 0;
      const isComplete = order > currentStageOrder;
      if (!map.has(org)) {
        map.set(org, { org, requests: [], complete: true });
      }
      const entry = map.get(org)!;
      entry.requests.push(req);
      if (!isComplete) entry.complete = false;
    }
    return map;
  }, [paginatedRequests, isCamStage, isMachiningStage, currentStageOrder]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + 9, filteredAndSorted.length || 0)
    );
  }, [filteredAndSorted.length]);

  useEffect(() => {
    setVisibleCount(Math.min(9, filteredAndSorted.length));
  }, [
    filteredAndSorted.length,
    worksheetSearch,
    showCompleted,
    isCamStage,
    isMachiningStage,
  ]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root: null, threshold: 1 }
    );
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [loadMore]);

  const diameterQueueForReceive = useMemo(() => {
    const labels: DiameterBucketKey[] = ["6", "8", "10", "10+"];
    const counts = labels.map(() => 0);
    const buckets: Record<DiameterBucketKey, WorksheetQueueItem[]> = {
      "6": [],
      "8": [],
      "10": [],
      "10+": [],
    };

    for (const req of filteredAndSorted) {
      const caseInfos = req.caseInfos || {};
      const bucketIndex = getDiameterBucketIndex(caseInfos.maxDiameter);
      const item: WorksheetQueueItem = {
        id: req._id,
        client: req.requestor?.organization || req.requestor?.name || "",
        patient: caseInfos.patientName || "",
        tooth: caseInfos.tooth || "",
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
        buckets["10+"].push(item);
      }
    }

    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total, buckets };
  }, [filteredAndSorted]);

  if (isLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  const isEmpty = filteredAndSorted.length === 0;

  return (
    <div
      onDrop={handlePageDrop}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      className="relative"
    >
      {(isMachiningStage || isCamStage) && isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 border-dashed border-blue-500 text-center">
            <div className="text-2xl font-bold text-blue-700 mb-2">
              {isMachiningStage
                ? "생산 이미지를 드롭하세요"
                : "NC 파일을 드롭하세요"}
            </div>
            <div className="text-sm text-slate-600">
              {isMachiningStage
                ? "로트넘버를 자동으로 인식하여 해당 파일에 업로드합니다"
                : "파일명이 일치하는 의뢰건에 자동으로 업로드됩니다"}
            </div>
          </div>
        </div>
      )}
      {ocrProcessing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-xl font-bold text-slate-800 mb-2">
              로트넘버 인식 중...
            </div>
            <div className="text-sm text-slate-600">잠시만 기다려주세요</div>
          </div>
        </div>
      )}
      {showQueueBar && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div className="text-lg font-semibold text-slate-800 md:whitespace-nowrap">
            진행중인 의뢰 총 {diameterQueueForReceive.total}건
          </div>
          <div className="flex-1">
            <WorksheetDiameterQueueBar
              title=""
              labels={diameterQueueForReceive.labels}
              counts={diameterQueueForReceive.counts}
              total={diameterQueueForReceive.total}
              onBucketClick={(label) => {
                setReceiveSelectedBucket(label);
                setReceiveQueueModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-4 mt-6">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
            표시할 의뢰가 없습니다.
          </div>
        ) : isMachiningStage && groupedByOrg ? (
          <div className="space-y-4">
            {Array.from(groupedByOrg.values()).map((group) => (
              <div
                key={group.org}
                className={`rounded-2xl border p-4 space-y-3 ${
                  group.complete
                    ? "border-emerald-300 bg-emerald-50/60"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {group.org}
                  </div>
                  <Badge
                    variant={group.complete ? "default" : "outline"}
                    className={`text-[11px] ${
                      group.complete
                        ? "bg-emerald-500 text-white"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    {group.complete ? "그룹 완료" : "진행 중"}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    모든 카드 완료 시 다음 단계 가능
                  </span>
                </div>
                <WorksheetCardGrid
                  requests={group.requests}
                  onDownload={handleDownloadOriginal}
                  onOpenPreview={handleOpenPreview}
                  onDeleteCam={handleDeleteCam}
                  onDeleteNc={handleDeleteNc}
                  onRollback={
                    enableCardRollback ? handleCardRollback : undefined
                  }
                  onUploadNc={handleUploadNc}
                  uploadProgress={uploadProgress}
                  uploading={uploading}
                  deletingCam={deletingCam}
                  deletingNc={deletingNc}
                  isCamStage={isCamStage}
                  isMachiningStage={isMachiningStage}
                  downloading={downloading}
                  currentStageOrder={currentStageOrder}
                />
              </div>
            ))}
          </div>
        ) : (
          <WorksheetCardGrid
            requests={paginatedRequests}
            onDownload={handleDownloadOriginal}
            onOpenPreview={handleOpenPreview}
            onDeleteCam={handleDeleteCam}
            onDeleteNc={handleDeleteNc}
            onRollback={enableCardRollback ? handleCardRollback : undefined}
            onUploadNc={handleUploadNc}
            uploadProgress={uploadProgress}
            uploading={uploading}
            deletingCam={deletingCam}
            deletingNc={deletingNc}
            isCamStage={isCamStage}
            isMachiningStage={isMachiningStage}
            downloading={downloading}
            currentStageOrder={currentStageOrder}
          />
        )}
        {!isEmpty && paginatedRequests.length < filteredAndSorted.length && (
          <div ref={sentinelRef} className="h-6 w-full" />
        )}
      </div>

      <WorksheetDiameterQueueModal
        open={receiveQueueModalOpen}
        onOpenChange={setReceiveQueueModalOpen}
        processLabel={`커스텀어벗 > ${currentStageForTab}`}
        queues={diameterQueueForReceive.buckets}
        selectedBucket={receiveSelectedBucket}
        onSelectBucket={setReceiveSelectedBucket}
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
