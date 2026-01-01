import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import {
  type ManufacturerRequest,
  type ReviewStageKey,
  getReviewStageKeyByTab,
} from "./utils";

type UseRequestFileHandlersProps = {
  token: string | null;
  isCamStage: boolean;
  isMachiningStage: boolean;
  fetchRequests: () => Promise<void>;
  setDownloading: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUploading: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUploadProgress: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >;
  setDeletingCam: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setDeletingNc: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setReviewSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewFiles: React.Dispatch<React.SetStateAction<any>>;
  setPreviewNcText: React.Dispatch<React.SetStateAction<string>>;
  setPreviewNcName: React.Dispatch<React.SetStateAction<string>>;
  setPreviewStageUrl: React.Dispatch<React.SetStateAction<string>>;
  setPreviewStageName: React.Dispatch<React.SetStateAction<string>>;
  setPreviewLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchParams: (
    nextInit: ((prev: URLSearchParams) => URLSearchParams) | URLSearchParams,
    navigateOpts?: { replace?: boolean }
  ) => void;
  decodeNcText: (buffer: ArrayBuffer) => string;
};

export const useRequestFileHandlers = ({
  token,
  isCamStage,
  isMachiningStage,
  fetchRequests,
  setDownloading,
  setUploading,
  setUploadProgress,
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
  decodeNcText,
}: UseRequestFileHandlersProps) => {
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token });

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
          // 자동 탭 이동을 막기 위해 stage 변경을 하지 않는다.
          // 필요 시 수동으로 탭 전환하도록 유지
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
      setReviewSaving,
    ]
  );

  const handleDeleteCam = useCallback(
    async (
      req: ManufacturerRequest,
      opts?: { rollbackOnly?: boolean; navigate?: boolean }
    ) => {
      if (!token) return;
      setDeletingCam((prev) => ({ ...prev, [req._id]: true }));
      try {
        const rollbackOnly = !!opts?.rollbackOnly;
        const navigate = opts?.navigate !== false;
        const res = await fetch(
          `/api/requests/${req._id}/cam-file${
            rollbackOnly ? "?rollbackOnly=1" : ""
          }`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          throw new Error("delete cam file failed");
        }
        toast({
          title: "롤백 완료",
          description: "의뢰 단계로 되돌렸습니다.",
        });

        await fetchRequests();

        if (navigate) {
          setPreviewOpen(false);
          setPreviewFiles({});
          setPreviewNcText("");
          setPreviewNcName("");

          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("stage", "receive");
              return next;
            },
            { replace: true }
          );
        }
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
    [
      token,
      toast,
      fetchRequests,
      setDeletingCam,
      setPreviewOpen,
      setPreviewFiles,
      setPreviewNcText,
      setPreviewNcName,
      setSearchParams,
    ]
  );

  const handleDeleteNc = useCallback(
    async (
      req: ManufacturerRequest,
      opts?: { nextStage?: string; rollbackOnly?: boolean; navigate?: boolean }
    ) => {
      if (!token) return;
      setDeletingNc((prev) => ({ ...prev, [req._id]: true }));
      try {
        const targetStage = opts?.nextStage || "cam";
        const rollbackOnly = !!opts?.rollbackOnly;
        const navigate = opts?.navigate !== false;
        const res = await fetch(
          `/api/requests/${req._id}/nc-file?nextStage=${targetStage}${
            rollbackOnly ? "&rollbackOnly=1" : ""
          }`,
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
          title: "롤백 완료",
          description: `${stageLabel} 단계로 되돌렸습니다.`,
        });
        await fetchRequests();

        if (navigate) {
          setPreviewOpen(false);
          setPreviewNcText("");
          setPreviewNcName("");
          setPreviewFiles({});

          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("stage", targetStage === "request" ? "receive" : "cam");
              return next;
            },
            { replace: true }
          );
        }
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
    [
      token,
      toast,
      fetchRequests,
      setDeletingNc,
      setPreviewOpen,
      setPreviewNcText,
      setPreviewNcName,
      setPreviewFiles,
      setSearchParams,
    ]
  );

  const handleUploadCam = useCallback(
    async (req: ManufacturerRequest, files: File[]) => {
      if (!token) return;
      const normalize = (name: string) =>
        name.trim().toLowerCase().normalize("NFC");
      const originalName =
        req.caseInfos?.file?.fileName ||
        req.caseInfos?.file?.originalName ||
        "";
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
      setUploadProgress((prev) => ({ ...prev, [req._id]: 0 }));
      try {
        const uploaded = await uploadFiles(filtered, (p) => {
          if (p[filtered[0].name] !== undefined) {
            setUploadProgress((prev) => ({
              ...prev,
              [req._id]: p[filtered[0].name],
            }));
          }
        });
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
          let message = "CAM 파일 저장에 실패했습니다.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errorData = await res.json();
              if (errorData?.message) message = String(errorData.message);
            } else {
              const text = await res.text();
              if (text) message = text;
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }
        toast({
          title: "업로드 완료",
          description: "CAM STL이 저장되었습니다.",
        });
        await fetchRequests();

        setPreviewFiles((prev: any) => ({
          ...prev,
          cam: filtered[0] || prev.cam,
        }));
        setPreviewNcName(finalFileName);
      } catch (error) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description:
            (error as Error)?.message ||
            "파일 업로드 또는 저장에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[req._id];
          return next;
        });
      }
    },
    [
      token,
      uploadFiles,
      toast,
      fetchRequests,
      setUploading,
      setUploadProgress,
      setPreviewFiles,
      setPreviewNcName,
    ]
  );

  const handleUploadNc = useCallback(
    async (req: ManufacturerRequest, files: File[]) => {
      if (!token) return;

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

      setUploading((prev) => ({ ...prev, [req._id]: true }));
      setUploadProgress((prev) => ({ ...prev, [req._id]: 0 }));
      try {
        const uploaded = await uploadFiles([firstLocal], (p) => {
          if (p[firstLocal.name] !== undefined) {
            setUploadProgress((prev) => ({
              ...prev,
              [req._id]: p[firstLocal.name],
            }));
          }
        });
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
            fileName: firstLocal.name,
            fileType: first.mimetype,
            fileSize: first.size,
            s3Key: first.key,
            s3Url: first.location,
          }),
        });
        if (!res.ok) {
          let message = "NC 파일 저장에 실패했습니다.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errorData = await res.json();
              if (errorData?.message) message = String(errorData.message);
            } else {
              const text = await res.text();
              if (text) message = text;
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }
        toast({
          title: "업로드 완료",
          description: "NC 파일을 업로드했습니다.",
        });
        await fetchRequests();

        try {
          const buf = await firstLocal.arrayBuffer();
          const text = decodeNcText(buf);
          setPreviewNcText(text);
          setPreviewNcName(firstLocal.name);
        } catch {
          // ignore
        }
      } catch (error: any) {
        console.error(error);
        toast({
          title: "업로드 실패",
          description: error.message || "NC 파일 업로드에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({ ...prev, [req._id]: false }));
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[req._id];
          return next;
        });
      }
    },
    [
      token,
      uploadFiles,
      toast,
      fetchRequests,
      decodeNcText,
      setUploading,
      setUploadProgress,
      setPreviewNcText,
      setPreviewNcName,
    ]
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
      setUploadProgress((prev) => ({
        ...prev,
        [params.req._id as string]: 0,
      }));
      try {
        const uploaded = await uploadFiles([params.file], (p) => {
          if (p[params.file.name] !== undefined) {
            setUploadProgress((prev) => ({
              ...prev,
              [params.req._id as string]: p[params.file.name],
            }));
          }
        });
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
          let message = "파일 저장에 실패했습니다.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errorData = await res.json();
              if (errorData?.message) message = String(errorData.message);
            } else {
              const text = await res.text();
              if (text) message = text;
            }
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        toast({
          title: "업로드 완료",
          description: "파일이 저장되었습니다.",
        });

        await fetchRequests();

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
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[params.req._id as string];
          return next;
        });
      }
    },
    [
      token,
      uploadFiles,
      toast,
      fetchRequests,
      setUploading,
      setUploadProgress,
      setPreviewStageUrl,
      setPreviewStageName,
    ]
  );

  const handleDeleteStageFile = useCallback(
    async (params: {
      req: ManufacturerRequest;
      stage: "machining" | "packaging" | "shipping" | "tracking";
      rollbackOnly?: boolean;
    }) => {
      if (!token) return;
      if (!params.req?._id) return;

      const rollbackOnly = !!params.rollbackOnly;

      setUploading((prev) => ({ ...prev, [params.req._id as string]: true }));
      try {
        const res = await fetch(
          `/api/requests/${
            params.req._id
          }/stage-file?stage=${encodeURIComponent(params.stage)}${
            rollbackOnly ? "&rollbackOnly=1" : ""
          }`,
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

        toast(
          rollbackOnly
            ? {
                title: "롤백 완료",
                description: "공정 단계를 되돌렸습니다.",
              }
            : {
                title: "삭제 완료",
                description: "파일을 삭제했습니다.",
              }
        );
        await fetchRequests();
        if (params.stage === "machining" && !rollbackOnly) {
          setPreviewStageUrl("");
          setPreviewStageName("");
        }
      } catch (error) {
        console.error(error);
        toast({
          title: rollbackOnly ? "롤백 실패" : "삭제 실패",
          description: rollbackOnly
            ? "공정 롤백에 실패했습니다."
            : "파일 삭제에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading((prev) => ({
          ...prev,
          [params.req._id as string]: false,
        }));
      }
    },
    [
      token,
      toast,
      fetchRequests,
      setUploading,
      setPreviewStageUrl,
      setPreviewStageName,
    ]
  );

  return {
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
  };
};
