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

function buildBlobCacheKey(
  s3Key?: string | null,
  meta?: { fileSize?: unknown; uploadedAt?: unknown } | null,
): string | null {
  const base = String(s3Key || "").trim();
  if (!base) return null;
  const fileSize = meta?.fileSize != null ? String(meta.fileSize) : "";
  const uploadedAt = meta?.uploadedAt ? String(meta.uploadedAt) : "";
  if (!fileSize && !uploadedAt) return base;
  return `${base}:v=${fileSize}:${uploadedAt}`;
}

function buildFallbackBlobCacheKey(
  stableId: string,
  kind: "original" | "cam",
  meta?: { fileSize?: unknown; uploadedAt?: unknown } | null,
): string | null {
  const id = String(stableId || "").trim();
  if (!id) return null;
  const fileSize = meta?.fileSize != null ? String(meta.fileSize) : "";
  const uploadedAt = meta?.uploadedAt ? String(meta.uploadedAt) : "";
  const base = `stl:${id}:${kind}`;
  if (!fileSize && !uploadedAt) return base;
  return `${base}:v=${fileSize}:${uploadedAt}`;
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
    async (
      req: ManufacturerRequest,
      opts?: {
        forceRefresh?: boolean;
      },
    ) => {
      if (!token) return;
      try {
        const forceRefresh = opts?.forceRefresh === true;
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

        let targetReq = req;
        const summaryRequestId = String(req?.requestId || "").trim();
        const shouldEnrichFromSummary =
          tabStage === "tracking" ||
          !req?.caseInfos?.implantManufacturer ||
          !req?.requestor?.business;

        if (token && summaryRequestId && shouldEnrichFromSummary) {
          try {
            const summaryRes = await fetch(
              `/api/requests/by-request/${encodeURIComponent(summaryRequestId)}/summary`,
              {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              },
            );
            const summaryBody: any = await summaryRes.json().catch(() => ({}));
            const summaryData = summaryBody?.data;
            if (summaryRes.ok && summaryBody?.success !== false && summaryData) {
              targetReq = {
                ...req,
                ...summaryData,
                caseInfos: {
                  ...(req?.caseInfos || {}),
                  ...(summaryData?.caseInfos || {}),
                },
                requestor: {
                  ...(req?.requestor || {}),
                  ...(summaryData?.requestor || {}),
                },
                lotNumber: {
                  ...(req?.lotNumber || {}),
                  ...(summaryData?.lotNumber || {}),
                },
              } as ManufacturerRequest;
            }
          } catch {
            // summary 보강 실패 시 원본 req로 계속 진행
          }
        }

        const title =
          targetReq.caseInfos?.patientName ||
          targetReq.requestor?.business ||
          targetReq.requestor?.name ||
          "파일 미리보기";

        const originalName =
          targetReq.caseInfos?.file?.filePath ||
          targetReq.caseInfos?.file?.originalName ||
          "original.stl";

        const originalCacheKeyBase = targetReq.caseInfos?.file?.s3Key || null;
        const originalFileMeta: any = (targetReq as any)?.caseInfos?.file;
        const requestMongoId = String(targetReq?._id || "").trim();
        const requestStableId =
          requestMongoId || String(targetReq?.requestId || "").trim();
        const originalCacheKey =
          buildBlobCacheKey(originalCacheKeyBase, originalFileMeta) ||
          buildFallbackBlobCacheKey(requestStableId, "original", originalFileMeta);

        const camFileMeta: any = (targetReq as any)?.caseInfos?.camFile;
        const camCacheKeyBase = targetReq.caseInfos?.camFile?.s3Key || null;
        const camCacheKey =
          buildBlobCacheKey(camCacheKeyBase, camFileMeta) ||
          buildFallbackBlobCacheKey(requestStableId, "cam", camFileMeta);

        const previewStageKey = getReviewStageKeyByTab({
          stage: tabStage,
          isCamStage,
          isMachiningStage,
        });
        const disableStlCache = forceRefresh;

        const shouldUseSingleLeftStl = isCamStage;

        const loadOriginalStl = async (): Promise<File | null> => {
          if (!requestMongoId) return null;
          return fetchAsFileWithCache(
            originalCacheKey,
            () =>
              fetchSignedUrl(`/api/requests/${requestMongoId}/original-file-url`),
            originalName,
            { disableCache: disableStlCache },
          ).catch(() => null);
        };

        const loadCamStl = async (): Promise<File | null> => {
          if (!requestMongoId) return null;
          const camName =
            targetReq.caseInfos?.camFile?.filePath ||
            targetReq.caseInfos?.camFile?.originalName ||
            originalName;
          return fetchAsFileWithCache(
            camCacheKey,
            () => fetchSignedUrl(`/api/requests/${requestMongoId}/cam-file-url`),
            camName,
            { disableCache: disableStlCache },
          ).catch(() => null);
        };

        const originalFilePromise: Promise<File | null> =
          shouldUseSingleLeftStl || isMachiningStage
            ? Promise.resolve(null)
            : loadOriginalStl();

        const camFilePromise: Promise<File | null> = isMachiningStage
          ? Promise.resolve(null)
          : loadCamStl();

        const leftStlPromise: Promise<File | null> = shouldUseSingleLeftStl
          ? (async () => {
              const cam = await loadCamStl();
              if (cam) return cam;
              return loadOriginalStl();
            })()
          : originalFilePromise;

        const resolveFinishLine = async () => {
          const casePoints = Array.isArray(targetReq.caseInfos?.finishLine?.points)
            ? targetReq.caseInfos.finishLine.points
            : null;
          if (Array.isArray(casePoints) && casePoints.length >= 2) {
            console.log(
              "[usePreviewLoader] finish line loaded from caseInfos",
              {
                requestId: targetReq.requestId,
                requestMongoId: targetReq._id,
                pointCount: casePoints.length,
              },
            );
            return { points: casePoints, source: "caseInfos" as const };
          }

          console.warn("[usePreviewLoader] finish line missing for preview", {
            requestId: targetReq.requestId,
            requestMongoId: targetReq._id,
            hasFinishLineObject: !!targetReq.caseInfos?.finishLine,
            pointCount: Array.isArray(targetReq.caseInfos?.finishLine?.points)
              ? targetReq.caseInfos.finishLine.points.length
              : 0,
          });

          return { points: null, source: null } as const;
        };

        const finishLineResult = await resolveFinishLine();

        // CAM / 가공 탭에서 NC 프리뷰를 보여주기 위해 NC를 읽어온다.
        const ncPromise =
          isCamStage || isMachiningStage
            ? (async () => {
                const ncMeta = targetReq.caseInfos?.ncFile;
                if (!ncMeta?.s3Key || !requestMongoId) return;
                const ncNameRaw =
                  ncMeta?.originalName || ncMeta?.filePath || "program.nc";
                const ncName = ncNameRaw.split("/").pop() || ncNameRaw;
                const ncVersionedKey = buildBlobCacheKey(ncMeta?.s3Key, ncMeta);
                const ncCacheKey = ncVersionedKey
                  ? `cnc:s3:${ncVersionedKey}`
                  : null;
                const ncFile = await fetchAsFileWithCache(
                  ncCacheKey,
                  () => fetchSignedUrl(`/api/requests/${requestMongoId}/nc-file-url`),
                  ncName,
                  { disableCache: forceRefresh },
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
                  targetReq.caseInfos?.stageFiles?.[effectiveStageKey];
                if (!requestMongoId) return;
                const signedUrl = await fetchSignedUrl(
                  `/api/requests/${requestMongoId}/stage-file-url?stage=${encodeURIComponent(
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
          request: targetReq,
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
