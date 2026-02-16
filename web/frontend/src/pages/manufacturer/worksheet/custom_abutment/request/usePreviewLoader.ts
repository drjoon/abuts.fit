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
      finishLinePoints?: number[][] | null;
      finishLineSource?: "caseInfos" | "file" | null;
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

        let cacheHitCount = 0;
        let cacheMissCount = 0;

        const fetchAsFileWithCache = async (
          cacheKey: string | null,
          signedUrl: string,
          filename: string,
          opts?: { disableCache?: boolean },
        ) => {
          const disableCache = !!opts?.disableCache;

          if (!disableCache && cacheKey) {
            const cached = await getFileBlob(cacheKey);
            if (cached) {
              cacheHitCount += 1;
              return blobToFile(cached, filename);
            }
          }

          cacheMissCount += 1;
          const r = await fetch(signedUrl);
          if (!r.ok) throw new Error("file fetch failed");
          const blob = await r.blob();

          if (!disableCache && cacheKey) {
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
          req.caseInfos?.file?.filePath ||
          req.caseInfos?.file?.originalName ||
          "original.stl";

        const originalCacheKeyBase = req.caseInfos?.file?.s3Key || null;
        const originalFileMeta: any = (req as any)?.caseInfos?.file;
        const originalCacheVersion =
          originalFileMeta?.fileSize || originalFileMeta?.uploadedAt;
        const originalCacheKey =
          originalCacheKeyBase && originalCacheVersion
            ? `${originalCacheKeyBase}:${originalCacheVersion}`
            : originalCacheKeyBase;

        const originalUrlRes = await fetch(
          `/api/requests/${req._id}/original-file-url`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!originalUrlRes.ok) throw new Error("original url failed");
        const originalUrlBody = await originalUrlRes.json();
        const originalSignedUrl = originalUrlBody?.data?.url;
        if (!originalSignedUrl) throw new Error("no original url");

        const previewStageKey = getReviewStageKeyByTab({
          stage: tabStage,
          isCamStage,
          isMachiningStage,
        });
        const disableStlCache = false;

        const originalFile = await fetchAsFileWithCache(
          originalCacheKey,
          originalSignedUrl,
          originalName,
          { disableCache: disableStlCache },
        );

        let camFile: File | null = null;
        const hasCamFile = !!req.caseInfos?.camFile?.s3Key;

        if (hasCamFile) {
          const camName =
            req.caseInfos?.camFile?.filePath ||
            req.caseInfos?.camFile?.originalName ||
            originalName;

          // filled.stl이 동일 s3Key로 교체되는 경우가 있어, 버전 값을 포함해 캐시 무효화
          const camCacheKeyBase = req.caseInfos?.camFile?.s3Key || null;
          const camCacheVersion =
            req.caseInfos?.camFile?.fileSize ||
            req.caseInfos?.camFile?.uploadedAt;
          const camCacheKey =
            camCacheKeyBase && camCacheVersion
              ? `${camCacheKeyBase}:${camCacheVersion}`
              : camCacheKeyBase;
          const camUrlRes = await fetch(
            `/api/requests/${req._id}/cam-file-url`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (camUrlRes.ok) {
            const camUrlBody = await camUrlRes.json();
            const camSignedUrl = camUrlBody?.data?.url;
            if (camSignedUrl) {
              camFile = await fetchAsFileWithCache(
                camCacheKey,
                camSignedUrl,
                camName,
                { disableCache: disableStlCache },
              );
            }
          }
        }

        const resolveFinishLine = async () => {
          const casePoints = Array.isArray(req.caseInfos?.finishLine?.points)
            ? req.caseInfos.finishLine.points
            : null;
          if (Array.isArray(casePoints) && casePoints.length >= 2) {
            console.log("[PreviewLoader] finish line from caseInfos", {
              count: casePoints.length,
            });
            return { points: casePoints, source: "caseInfos" as const };
          }

          return { points: null, source: null } as const;
        };

        const finishLineResult = await resolveFinishLine();

        // CAM / 생산 탭에서 NC 프리뷰를 보여주기 위해 NC를 읽어온다.
        if (isCamStage || isMachiningStage) {
          const ncMeta = req.caseInfos?.ncFile;
          if (ncMeta?.s3Key) {
            const ncUrlRes = await fetch(
              `/api/requests/${req._id}/nc-file-url`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (ncUrlRes.ok) {
              const ncUrlBody = await ncUrlRes.json();
              const ncSignedUrl = ncUrlBody?.data?.url;
              if (ncSignedUrl) {
                const ncName =
                  ncMeta?.filePath || ncMeta?.originalName || "program.nc";
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
        if (
          previewStageKey === "machining" ||
          previewStageKey === "packaging" ||
          previewStageKey === "shipping" ||
          previewStageKey === "tracking"
        ) {
          // 발송 탭에서는 포장 단계(stage="packaging")의 이미지를 재사용한다.
          const effectiveStageKey =
            previewStageKey === "shipping" ? "packaging" : previewStageKey;

          const stageMeta = req.caseInfos?.stageFiles?.[effectiveStageKey];
          if (stageMeta?.s3Key) {
            const stageUrlRes = await fetch(
              `/api/requests/${
                req._id
              }/stage-file-url?stage=${encodeURIComponent(effectiveStageKey)}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (stageUrlRes.ok) {
              const stageUrlBody = await stageUrlRes.json();
              const signedUrl = stageUrlBody?.data?.url;
              if (signedUrl) {
                setPreviewStageUrl(signedUrl);
                setPreviewStageName(
                  stageMeta?.filePath || `${effectiveStageKey}-file`,
                );
              }
            }
          }
        }

        setPreviewFiles({
          original: originalFile,
          cam: camFile,
          title,
          request: req,
          finishLinePoints: finishLineResult.points,
          finishLineSource: finishLineResult.source,
        });
        if (finishLineResult.points?.length) {
          console.log("[PreviewLoader] finish line ready for preview", {
            source: finishLineResult.source,
            count: finishLineResult.points.length,
          });
        }
        setPreviewOpen(true);
        toast({
          title: "다운로드 완료",
          description:
            cacheHitCount > 0
              ? `캐시(IndexedDB) ${cacheHitCount}건 + 다운로드 ${cacheMissCount}건`
              : `다운로드 ${cacheMissCount}건`,
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
    ],
  );

  return { handleOpenPreview };
}
