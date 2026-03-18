import { useCallback } from "react";
import { getFileBlob, setFileBlob } from "@/shared/files/stlIndexedDb";
import {
  getReviewStageKeyByTab,
  type ManufacturerRequest,
} from "../utils/request";
import { toast as toastFn, useToast } from "@/shared/hooks/use-toast";

const inFlightSignedUrlMap = new Map<string, Promise<string>>();
const inFlightBlobMap = new Map<string, Promise<Blob>>();

function getOrCreateInFlight<T>(
  map: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
) {
  const existing = map.get(key);
  if (existing) return existing;

  const promise = factory().finally(() => {
    map.delete(key);
  });
  map.set(key, promise);
  return promise;
}

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

        const fetchSignedUrl = async (path: string) => {
          const dedupeKey = `signed-url:${path}`;
          return getOrCreateInFlight(
            inFlightSignedUrlMap,
            dedupeKey,
            async () => {
              const res = await fetch(path, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error(`signed url failed: ${path}`);
              const body = await res.json();
              return String(body?.data?.url || "").trim();
            },
          );
        };

        let cacheHitCount = 0;
        let cacheMissCount = 0;

        const fetchAsFileWithCache = async (
          cacheKey: string | null,
          signedUrlOrResolver: string | (() => Promise<string>),
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
          const signedUrl =
            typeof signedUrlOrResolver === "function"
              ? await signedUrlOrResolver()
              : signedUrlOrResolver;
          if (!signedUrl) throw new Error("signed url missing");
          const blobDedupeKey = `blob:${cacheKey || signedUrl}`;
          const blob = await getOrCreateInFlight(
            inFlightBlobMap,
            blobDedupeKey,
            async () => {
              const r = await fetch(signedUrl);
              if (!r.ok) throw new Error("file fetch failed");
              return r.blob();
            },
          );

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
          req.requestor?.business ||
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

        const previewStageKey = getReviewStageKeyByTab({
          stage: tabStage,
          isCamStage,
          isMachiningStage,
        });
        const disableStlCache = false;

        const hasCamFile = !!req.caseInfos?.camFile?.s3Key;
        const shouldUseSingleLeftStl = isCamStage;

        const originalFilePromise: Promise<File | null> = shouldUseSingleLeftStl
          ? Promise.resolve(null)
          : fetchAsFileWithCache(
              originalCacheKey,
              () =>
                fetchSignedUrl(`/api/requests/${req._id}/original-file-url`),
              originalName,
              { disableCache: disableStlCache },
            );

        const camFilePromise: Promise<File | null> = hasCamFile
          ? (() => {
              const camName =
                req.caseInfos?.camFile?.filePath ||
                req.caseInfos?.camFile?.originalName ||
                originalName;
              const camCacheKeyBase = req.caseInfos?.camFile?.s3Key || null;
              const camCacheVersion =
                req.caseInfos?.camFile?.fileSize ||
                req.caseInfos?.camFile?.uploadedAt;
              const camCacheKey =
                camCacheKeyBase && camCacheVersion
                  ? `${camCacheKeyBase}:${camCacheVersion}`
                  : camCacheKeyBase;
              return fetchAsFileWithCache(
                camCacheKey,
                () => fetchSignedUrl(`/api/requests/${req._id}/cam-file-url`),
                camName,
                { disableCache: disableStlCache },
              ).catch(() => null);
            })()
          : Promise.resolve(null);

        const leftStlPromise: Promise<File | null> = shouldUseSingleLeftStl
          ? hasCamFile
            ? camFilePromise
            : fetchAsFileWithCache(
                originalCacheKey,
                () =>
                  fetchSignedUrl(`/api/requests/${req._id}/original-file-url`),
                originalName,
                { disableCache: disableStlCache },
              )
          : originalFilePromise;

        const resolveFinishLine = async () => {
          const casePoints = Array.isArray(req.caseInfos?.finishLine?.points)
            ? req.caseInfos.finishLine.points
            : null;
          if (Array.isArray(casePoints) && casePoints.length >= 2) {
            console.log(
              "[usePreviewLoader] finish line loaded from caseInfos",
              {
                requestId: req.requestId,
                requestMongoId: req._id,
                pointCount: casePoints.length,
              },
            );
            return { points: casePoints, source: "caseInfos" as const };
          }

          console.warn("[usePreviewLoader] finish line missing for preview", {
            requestId: req.requestId,
            requestMongoId: req._id,
            hasFinishLineObject: !!req.caseInfos?.finishLine,
            pointCount: Array.isArray(req.caseInfos?.finishLine?.points)
              ? req.caseInfos.finishLine.points.length
              : 0,
          });

          return { points: null, source: null } as const;
        };

        const finishLineResult = await resolveFinishLine();

        // CAM / 가공 탭에서 NC 프리뷰를 보여주기 위해 NC를 읽어온다.
        const ncPromise =
          isCamStage || isMachiningStage
            ? (async () => {
                const ncMeta = req.caseInfos?.ncFile;
                if (!ncMeta?.s3Key) return;
                const ncName =
                  ncMeta?.filePath || ncMeta?.originalName || "program.nc";
                const ncCacheVersion = ncMeta?.fileSize || ncMeta?.uploadedAt;
                const ncCacheKey =
                  ncMeta?.s3Key && ncCacheVersion
                    ? `${ncMeta.s3Key}:${ncCacheVersion}`
                    : ncMeta?.s3Key || null;
                const ncFile = await fetchAsFileWithCache(
                  ncCacheKey,
                  () => fetchSignedUrl(`/api/requests/${req._id}/nc-file-url`),
                  ncName,
                );
                const buf = await ncFile.arrayBuffer();
                const text = decodeNcText(buf);
                setPreviewNcText(text);
                setPreviewNcName(ncName);
              })()
            : Promise.resolve();

        const stagePromise =
          previewStageKey === "machining" ||
          previewStageKey === "packing" ||
          previewStageKey === "shipping" ||
          previewStageKey === "tracking"
            ? (async () => {
                const effectiveStageKey =
                  previewStageKey === "shipping" ? "packing" : previewStageKey;
                const stageMeta =
                  req.caseInfos?.stageFiles?.[effectiveStageKey];
                if (!stageMeta?.s3Key) return;
                const signedUrl = await fetchSignedUrl(
                  `/api/requests/${req._id}/stage-file-url?stage=${encodeURIComponent(
                    effectiveStageKey,
                  )}`,
                ).catch(() => "");
                if (!signedUrl) return;
                setPreviewStageUrl(signedUrl);
                setPreviewStageName(
                  stageMeta?.filePath || `${effectiveStageKey}-file`,
                );
              })()
            : Promise.resolve();

        const [leftStlFile, rightStlFile] = await Promise.all([
          leftStlPromise,
          shouldUseSingleLeftStl ? Promise.resolve(null) : camFilePromise,
          ncPromise,
          stagePromise,
        ]).then(([leftStl, rightStl]) => [leftStl, rightStl]);

        setPreviewFiles({
          original: leftStlFile,
          cam: rightStlFile,
          title,
          request: req,
          finishLinePoints: finishLineResult.points,
          finishLineSource: finishLineResult.source,
        });
        setPreviewOpen((prev) => (prev ? prev : true));
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
