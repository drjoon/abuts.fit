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
  const [visibleCount, setVisibleCount] = useState(9);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
  const { uploadFiles } = useS3TempUpload({ token });

  const fetchRequests = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const url =
        user?.role === "admin" ? "/api/admin/requests" : "/api/requests";
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
            status1: req.status1,
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
    [token, toast, isCamStage, isMachiningStage]
  );

  const downloadByEndpoint = useCallback(
    async (endpoint: string, errorMessage: string) => {
      if (!token) return;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        toast({
          title: "다운로드 실패",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }
      const data = await res.json();
      const url = data?.data?.url;
      if (!url) {
        toast({
          title: "다운로드 실패",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }
      window.open(url, "_blank");
    },
    [token, toast]
  );

  const handleDownloadOriginalStl = useCallback(
    async (req: ManufacturerRequest) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/original-file-url`,
        "원본 STL을 가져올 수 없습니다."
      );
    },
    [downloadByEndpoint]
  );

  const handleDownloadCamStl = useCallback(
    async (req: ManufacturerRequest) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/cam-file-url`,
        "CAM STL을 가져올 수 없습니다."
      );
    },
    [downloadByEndpoint]
  );

  const handleDownloadNcFile = useCallback(
    async (req: ManufacturerRequest) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/nc-file-url`,
        "NC 파일을 가져올 수 없습니다."
      );
    },
    [downloadByEndpoint]
  );

  const handleDownloadStageFile = useCallback(
    async (req: ManufacturerRequest, stage: string) => {
      await downloadByEndpoint(
        `/api/requests/${req._id}/stage-file-url?stage=${encodeURIComponent(
          stage
        )}`,
        "파일을 가져올 수 없습니다."
      );
    },
    [downloadByEndpoint]
  );

  const handleUpdateReviewStatus = useCallback(
    async (params: {
      req: ManufacturerRequest;
      status: "PENDING" | "APPROVED" | "REJECTED";
      reason?: string;
      stageOverride?: ReviewStageKey;
    }) => {
      if (!token) return;
      setReviewSaving(true);
      try {
        const stageKey =
          params.stageOverride ||
          getReviewStageKeyByTab({
            isCamStage,
            isMachiningStage,
          });

        const res = await fetch(
          `/api/requests/${params.req._id}/review-status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              stage: stageKey,
              status: params.status,
              reason: params.reason || "",
            }),
          }
        );

        if (!res.ok) {
          throw new Error("review status update failed");
        }

        await fetchRequests();

        toast({
          title: "검토 상태 변경 완료",
          description:
            params.status === "APPROVED"
              ? "승인되었습니다."
              : params.status === "REJECTED"
              ? "반려되었습니다."
              : "미승인 상태로 변경되었습니다.",
        });

        if (params.status === "APPROVED") {
          // 승인 시 다음 공정 탭으로만 이동 (stageOverride 기준)
          if (stageKey === "request") {
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set("stage", "cam");
                return next;
              },
              { replace: true }
            );
          }
          if (stageKey === "cam") {
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set("stage", "machining");
                return next;
              },
              { replace: true }
            );
          }
        }

        setPreviewOpen(false);
      } catch {
        toast({
          title: "검토 상태 변경 실패",
          description: "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      } finally {
        setReviewSaving(false);
      }
    },
    [
      token,
      toast,
      fetchRequests,
      isCamStage,
      isMachiningStage,
      setSearchParams,
      setPreviewOpen,
    ]
  );

  const handleDeleteCam = useCallback(
    async (req: ManufacturerRequest) => {
      if (!token) return;
      setDeletingCam((prev) => ({ ...prev, [req._id]: true }));
      try {
        const res = await fetch(`/api/requests/${req._id}/cam-file`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("delete cam file failed");
        }
        toast({
          title: "삭제 완료",
          description: "CAM 수정본을 삭제하고 상태를 가공전으로 되돌렸습니다.",
        });

        // 모달을 먼저 닫아 상태 불일치로 인한 화면 깜빡임 방지
        setPreviewOpen(false);

        await fetchRequests();

        // 프리뷰 상태 초기화
        setPreviewFiles({});
        setPreviewNcText("");
        setPreviewNcName("");

        // 의뢰 탭(receive)으로 이동
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("stage", "receive");
            return next;
          },
          { replace: true }
        );
      } catch (error) {
        toast({
          title: "삭제 실패",
          description: "CAM 수정본 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setDeletingCam((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, toast, fetchRequests]
  );

  const handleDeleteNc = useCallback(
    async (req: ManufacturerRequest, opts?: { nextStage?: string }) => {
      if (!token) return;
      setDeletingNc((prev) => ({ ...prev, [req._id]: true }));
      try {
        const targetStage = opts?.nextStage || "cam";
        const res = await fetch(
          `/api/requests/${req._id}/nc-file?nextStage=${targetStage}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          throw new Error("delete nc file failed");
        }
        const stageLabel = targetStage === "request" ? "의뢰" : "CAM";
        toast({
          title: "삭제 완료",
          description: `NC 파일을 삭제하고 ${stageLabel} 단계로 되돌렸습니다.`,
        });
        // 모달을 먼저 닫아 상태 불일치로 인한 화면 깜빡임 방지
        setPreviewOpen(false);

        await fetchRequests();

        // 프리뷰 상태 초기화
        setPreviewNcText("");
        setPreviewNcName("");
        setPreviewFiles({});

        // 탭 이동
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("stage", targetStage === "request" ? "receive" : "cam");
            return next;
          },
          { replace: true }
        );
      } catch (error) {
        toast({
          title: "삭제 실패",
          description: "NC 파일 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setDeletingNc((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, toast, fetchRequests, setSearchParams]
  );

  const handleUploadCam = useCallback(
    async (
      req: ManufacturerRequest,
      files: File[],
      options?: { autoApprove?: boolean; approveStage?: ReviewStageKey }
    ) => {
      if (!token) return;
      const normalize = (name: string) =>
        name.trim().toLowerCase().normalize("NFC");
      const originalName =
        req.caseInfos?.file?.fileName ||
        req.caseInfos?.file?.originalName ||
        req.caseInfos?.camFile?.fileName ||
        req.caseInfos?.camFile?.originalName ||
        "";
      // 원본 확장자(.stl 또는 .cam.stl)가 섞여 있어도 마지막 확장자만 제거
      const originalBase = originalName
        .replace(/(\.cam\.stl|\.stl)$/i, "")
        .trim();
      const expectedCamName = originalBase ? `${originalBase}.cam.stl` : "";

      const filtered = files.filter((f) =>
        f.name.toLowerCase().endsWith(".cam.stl")
      );
      if (!filtered.length) {
        toast({
          title: "업로드 실패",
          description: "CAM 파일(.cam.stl)만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }
      if (expectedCamName) {
        const mismatch = filtered.some(
          (f) => normalize(f.name) !== normalize(expectedCamName)
        );
        if (mismatch) {
          toast({
            title: "파일명 불일치",
            description: `CAM 파일명은 ${expectedCamName} 으로 업로드해주세요.`,
            variant: "destructive",
          });
          return;
        }
      }

      setUploading((prev) => ({ ...prev, [req._id]: true }));
      try {
        const uploaded = await uploadFiles(filtered);
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }
        const first = uploaded[0];
        const finalFileName = expectedCamName || first.originalName;
        const res = await fetch(`/api/requests/${req._id}/cam-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: finalFileName,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
          }),
        });
        if (!res.ok) {
          throw new Error("save cam file failed");
        }
        toast({
          title: "업로드 완료",
          description: "CAM STL이 저장되었습니다.",
        });
        await fetchRequests();

        // 즉시 프리뷰 반영(서명 URL 재다운로드 없이 로컬 파일로 표시)
        setPreviewFiles((prev) => ({
          ...prev,
          cam: filtered[0] || prev.cam,
        }));
        // 파일명 즉시 업데이트
        setPreviewNcName(finalFileName);
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: "파일 업로드 또는 저장에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, uploadFiles, toast, fetchRequests, handleUpdateReviewStatus]
  );

  const handleUploadStageFile = useCallback(
    async (params: {
      req: ManufacturerRequest;
      stage: "machining" | "packaging" | "shipping" | "tracking";
      file: File;
      source: "manual" | "worker";
    }) => {
      if (!token) return;
      if (!params.req?._id) return;

      setUploading((prev) => ({ ...prev, [params.req._id as string]: true }));
      try {
        const uploaded = await uploadFiles([params.file]);
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }

        const first = uploaded[0];
        const res = await fetch(`/api/requests/${params.req._id}/stage-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stage: params.stage,
            fileName: first.originalName,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
            source: params.source,
          }),
        });

        if (!res.ok) {
          throw new Error("save stage file failed");
        }

        toast({
          title: "업로드 완료",
          description: "파일이 저장되었습니다.",
        });

        await fetchRequests();

        // 즉시 프리뷰 반영(이미지)
        if (params.stage === "machining") {
          try {
            setPreviewStageUrl(URL.createObjectURL(params.file));
            setPreviewStageName(params.file.name);
          } catch {
            // ignore
          }
        }
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: "파일 업로드 또는 저장에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({
          ...prev,
          [params.req._id as string]: false,
        }));
      }
    },
    [token, uploadFiles, toast, fetchRequests]
  );

  const handleDeleteStageFile = useCallback(
    async (params: {
      req: ManufacturerRequest;
      stage: "machining" | "packaging" | "shipping" | "tracking";
    }) => {
      if (!token) return;
      if (!params.req?._id) return;

      setUploading((prev) => ({ ...prev, [params.req._id as string]: true }));
      try {
        const res = await fetch(
          `/api/requests/${
            params.req._id
          }/stage-file?stage=${encodeURIComponent(params.stage)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error("delete stage file failed");
        }

        toast({
          title: "삭제 완료",
          description: "파일을 삭제했습니다.",
        });
        await fetchRequests();
        if (params.stage === "machining") {
          setPreviewStageUrl("");
          setPreviewStageName("");
        }
      } catch (error) {
        console.error(error);
        toast({
          title: "삭제 실패",
          description: "파일 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({
          ...prev,
          [params.req._id as string]: false,
        }));
      }
    },
    [token, toast, fetchRequests]
  );

  const handleUploadNc = useCallback(
    async (
      req: ManufacturerRequest,
      files: File[],
      options?: { autoApprove?: boolean; approveStage?: ReviewStageKey }
    ) => {
      if (!token) return;

      const normalize = (name: string) =>
        String(name || "")
          .trim()
          .toLowerCase()
          .normalize("NFC");

      const originalName =
        req.caseInfos?.file?.fileName ||
        req.caseInfos?.file?.originalName ||
        "";
      const base = originalName.includes(".")
        ? originalName.split(".").slice(0, -1).join(".")
        : originalName;
      const expectedNcName = base ? `${base}.nc` : "";

      const filtered = files.filter((f) =>
        f.name.toLowerCase().endsWith(".nc")
      );
      if (!filtered.length) {
        toast({
          title: "업로드 실패",
          description: "NC(.nc) 파일만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const firstLocal = filtered[0];
      if (
        expectedNcName &&
        normalize(firstLocal.name) !== normalize(expectedNcName)
      ) {
        toast({
          title: "파일명 불일치",
          description: `원본과 동일한 파일명(${expectedNcName})으로 업로드해주세요.`,
          variant: "destructive",
        });
        return;
      }

      setUploading((prev) => ({ ...prev, [req._id]: true }));
      try {
        const uploaded = await uploadFiles([firstLocal]);
        if (!uploaded || !uploaded.length) {
          throw new Error("upload failed");
        }
        const first = uploaded[0];
        const res = await fetch(`/api/requests/${req._id}/nc-file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: expectedNcName || first.originalName,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
          }),
        });
        if (!res.ok) {
          throw new Error("save nc file failed");
        }
        toast({
          title: "업로드 완료",
          description: "NC 파일을 업로드했습니다.",
        });
        await fetchRequests();

        // 즉시 프리뷰 반영(로컬 NC 텍스트)
        try {
          const buf = await firstLocal.arrayBuffer();
          const text = decodeNcText(buf);
          setPreviewNcText(text);
          setPreviewNcName(expectedNcName || firstLocal.name);
        } catch {
          // ignore
        }
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: "NC 파일 업로드에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
      }
    },
    [token, uploadFiles, toast, fetchRequests, handleUpdateReviewStatus]
  );

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

        // CAM / 가공 탭에서 NC 프리뷰를 보여주기 위해 NC를 읽어온다.
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

        // 가공 탭: stageFiles(machining) 이미지 URL도 불러온다.
        if (isMachiningStage) {
          const stageMeta = req.caseInfos?.stageFiles?.machining;
          if (stageMeta?.s3Key) {
            const stageUrlRes = await fetch(
              `/api/requests/${req._id}/stage-file-url?stage=machining`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (stageUrlRes.ok) {
              const stageUrlBody = await stageUrlRes.json();
              const signedUrl = stageUrlBody?.data?.url;
              if (signedUrl) {
                setPreviewStageUrl(signedUrl);
                setPreviewStageName(stageMeta?.fileName || "machining-file");
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
    ? "가공"
    : isCamStage
    ? "CAM"
    : "의뢰";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const filteredBase = (() => {
    // 완료포함: 탭 기준 단계 이상 모든 건 포함 (CAM 탭=CAM~추적관리, 가공 탭=가공~추적관리)
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

    // 기본(의뢰/CAM) 탭에서는 가공후(완료된 CAM) 제외
    return base.filter((req) => {
      const status = (req.status || "").trim();
      const status1 = (req.status1 || "").trim();
      const status2 = (req.status2 || "").trim();
      const camDone =
        status === "가공후" ||
        status1 === "가공후" ||
        status2 === "가공후" ||
        !!req.caseInfos?.camFile?.s3Key;
      return !camDone;
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
    <>
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
        processLabel="커스텀어벗 > 의뢰, CAM"
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
    </>
  );
};
