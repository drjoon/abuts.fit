import { useCallback } from "react";
import { getFileBlob, setFileBlob } from "@/utils/stlIndexedDb";
import { getReviewStageKeyByTab, type ManufacturerRequest } from "./utils";
import { toast as toastFn, useToast } from "@/hooks/use-toast";

type PreviewLoaderParams = {
  token: string | null;
  isCamStage: boolean;
  isMachiningStage: boolean;
  tabStage: string;
  decodeNcText: (buffer: ArrayBuffer) => string;
  setPreviewLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewNcText: React.Dispatch<React.SetStateAction<string>>;
  setPreviewNcName: React.Dispatch<React.SetStateAction<string>>;
  setPreviewStageUrl: React.Dispatch<React.SetStateAction<string>>;
  setPreviewStageName: React.Dispatch<React.SetStateAction<string>>;
  setPreviewFiles: React.Dispatch<
    React.SetStateAction<{
      original?: File | null;
      cam?: File | null;
      title?: string;
      request?: ManufacturerRequest | null;
    }>
  >;
  setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function usePreviewLoader({
  token,
  isCamStage,
  isMachiningStage,
  tabStage,
  decodeNcText,
  setPreviewLoading,
  setPreviewNcText,
  setPreviewNcName,
  setPreviewStageUrl,
  setPreviewStageName,
  setPreviewFiles,
  setPreviewOpen,
}: PreviewLoaderParams) {
  const { toast } = useToast();

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
          duration: 3000,
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
        toastFn({
          title: "미리보기 실패",
          description: "파일을 불러올 수 없습니다.",
          variant: "destructive",
        });
      } finally {
        setPreviewLoading(false);
      }
    },
    [
      token,
      toast,
      isCamStage,
      isMachiningStage,
      tabStage,
      decodeNcText,
      setPreviewFiles,
      setPreviewLoading,
      setPreviewNcText,
      setPreviewNcName,
      setPreviewOpen,
      setPreviewStageName,
      setPreviewStageUrl,
    ]
  );

  return { handleOpenPreview };
}
