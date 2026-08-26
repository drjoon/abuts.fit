// change-log:
// - 2026-08-26: NC 프리뷰 — uploadedAt/fileSize 없는 버전리스 IndexedDB 캐시 금지, full request 보강, #521↔소재직경 불일치 시 재다운로드.
// - 2026-08-25: 추적관리 프리뷰는 full request 보강 필수(lean projection에 ncFile/stageFiles 없음).
// - 2026-08-25: 추적관리 프리뷰에서도 NC 로드 + 각인은 packing stageFiles 사용.
// - 2026-08-23: ExoCAD인데 관리자 헥스 확정값이 없으면 full request로 보강(확정/미정 뱃지).
// - 2026-08-11: 원본 프리뷰 File MIME/확장자를 STL/PLY/OBJ에 맞게 유지.
// - 2026-08-11: cam STL 로드 시 파일명에 filled가 없으면 .filled.stl로 정규화(가이드 표시용).
// - 2026-08-11: 가공(isCamStage) 단일 STL 로드 시 cam 슬롯에도 채워 오른쪽 FL/FP 뷰어가 준비와 동일하게 동작.
// - 2026-08-06: 가공 큐 스냅샷에 designSoftware/헥스 회전 누락 시 full request로 보강.
// - 2026-08-06: 출고예정일(estimatedShipYmd)이 없을 때도 summary enrichment 트리거.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/files/fileBlobCache.ts
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/cnc/production.js
import { useCallback, useRef } from "react";
import { getFileBlob, setFileBlob } from "@/shared/files/stlIndexedDb";
import { deleteCncProgramCache } from "@/shared/files/fileBlobCache";
import { fileFromModelBlob } from "@/shared/files/modelPreviewFile";
import {
  getReviewStageKeyByTab,
  resolveFilledStlFile,
  type ManufacturerRequest,
} from "../utils/request";
import { resolveAdminVerifiedHexFromRequest } from "../utils/hexRotation";
import { toast as toastFn, useToast } from "@/shared/hooks/use-toast";

function hasNcVersionMeta(
  meta?: { fileSize?: unknown; uploadedAt?: unknown } | null,
): boolean {
  if (!meta || typeof meta !== "object") return false;
  if (meta.fileSize != null && String(meta.fileSize).trim() !== "") return true;
  return Boolean(String(meta.uploadedAt || "").trim());
}

function parseNcStockDiameter(text: string): number | null {
  const match = String(text || "").match(/#521\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function resolveExpectedMaterialDiameter(req: ManufacturerRequest): number | null {
  const ncDia = Number((req as any)?.caseInfos?.ncFile?.materialDiameter);
  if (Number.isFinite(ncDia) && ncDia > 0) return ncDia;
  const scheduleDia = Number((req as any)?.productionSchedule?.diameter);
  if (Number.isFinite(scheduleDia) && scheduleDia > 0) return scheduleDia;
  return null;
}

const inFlightSignedUrlMap = new Map<string, Promise<{ url: string; fileName?: string }>>();
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
  // 실시간 silent refresh가 연속 발생해도 이전 로드 결과가 최신 결과를 덮어쓰지 않게 한다.
  const loadGenerationRef = useRef(0);

  const handleOpenPreview = useCallback(
    async (
      req: ManufacturerRequest,
      opts?: {
        forceRefresh?: boolean;
        openOnlyIfAlreadyOpen?: boolean;
        /** 열린 프리뷰 실시간 갱신: 토스트/로딩 스피너 없이 데이터만 교체 */
        silent?: boolean;
      },
    ) => {
      if (!token) return;
      const forceRefresh = opts?.forceRefresh === true;
      const openOnlyIfAlreadyOpen = opts?.openOnlyIfAlreadyOpen === true;
      const silent = opts?.silent === true;
      const loadGeneration = ++loadGenerationRef.current;
      const isLoadCurrent = () => loadGeneration === loadGenerationRef.current;
      try {
        if (!silent) {
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
        }

        const blobToFile = (blob: Blob, filename: string) =>
          fileFromModelBlob(blob, filename);

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
              return {
                url: String(body?.data?.url || "").trim(),
                fileName: String(body?.data?.fileName || "").trim() || undefined,
              };
            },
          );
        };

        let cacheHitCount = 0;
        let cacheMissCount = 0;

        const fetchAsFileWithCache = async (
          cacheKey: string | null,
          signedUrlOrResolver:
            | string
            | (() => Promise<string | { url: string; fileName?: string }>),
          filename: string,
          fetchOpts?: { disableCache?: boolean },
        ) => {
          const disableCache = !!fetchOpts?.disableCache;

          if (!disableCache && cacheKey) {
            const cached = await getFileBlob(cacheKey);
            if (cached) {
              cacheHitCount += 1;
              return blobToFile(cached, filename);
            }
          }

          cacheMissCount += 1;
          const resolved =
            typeof signedUrlOrResolver === "function"
              ? await signedUrlOrResolver()
              : signedUrlOrResolver;
          const signedUrl =
            typeof resolved === "string"
              ? resolved
              : String(resolved?.url || "").trim();
          const resolvedName =
            typeof resolved === "string"
              ? ""
              : String(resolved?.fileName || "").trim();
          const effectiveName = resolvedName || filename;
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

          return blobToFile(blob, effectiveName);
        };

        let targetReq = req;
        const summaryRequestId = String(req?.requestId || "").trim();
        const requestMongoIdForEnrich = String(req?._id || "").trim();

        const hasDesignSoftware = Boolean(
          String(targetReq?.caseInfos?.designSoftware || "").trim(),
        );
        const hasHexRotation = Boolean(
          String(
            (targetReq as any)?.rnd?.manufacturerHexRotation ||
              targetReq?.caseInfos?.manufacturerHexRotation ||
              targetReq?.caseInfos?.finalHexRotation ||
              targetReq?.caseInfos?.requestorHexRotation ||
              (targetReq as any)?.caseInfos?.hexRotation?.mode ||
              "",
          ).trim(),
        );
        const designSoftwareForBadge = String(
          targetReq?.caseInfos?.designSoftware ||
            targetReq?.business?.requestSettings?.designSoftware ||
            "",
        ).trim();
        const needsAdminHexVerification =
          designSoftwareForBadge === "ExoCAD" &&
          !resolveAdminVerifiedHexFromRequest(targetReq);

        const needsNcPreview =
          isCamStage || isMachiningStage || tabStage === "tracking";
        const incomingNcMeta = (req as any)?.caseInfos?.ncFile;
        const ncMetaNeedsEnrich =
          needsNcPreview &&
          Boolean(String(incomingNcMeta?.s3Key || "").trim()) &&
          !hasNcVersionMeta(incomingNcMeta);

        // forceRefresh / 가공 큐 스냅샷: designSoftware·헥스 회전·관리자 확정·NC 버전 메타가 빠질 수 있어 full request로 보강.
        // 추적관리 worksheet projection은 ncFile/stageFiles를 제외하므로 프리뷰 오픈 시 full request 필수.
        // (summary API는 해당 필드를 내려주지 않음)
        const shouldEnrichFromFullRequest =
          forceRefresh ||
          tabStage === "tracking" ||
          ncMetaNeedsEnrich ||
          ((isCamStage || isMachiningStage) &&
            requestMongoIdForEnrich &&
            (!hasDesignSoftware ||
              !hasHexRotation ||
              needsAdminHexVerification));

        if (token && shouldEnrichFromFullRequest && requestMongoIdForEnrich) {
          try {
            const fullRes = await fetch(
              `/api/requests/${encodeURIComponent(requestMongoIdForEnrich)}`,
              {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              },
            );
            const fullBody: any = await fullRes.json().catch(() => ({}));
            const fullReq = fullBody?.data?.request || fullBody?.data || null;
            if (fullRes.ok && fullBody?.success !== false && fullReq) {
              targetReq = {
                ...req,
                ...fullReq,
                _id:
                  String(fullReq?._id || req?._id || "").trim() || req?._id,
                requestId:
                  String(fullReq?.requestId || req?.requestId || "").trim() ||
                  req?.requestId,
                caseInfos: {
                  ...(req?.caseInfos || {}),
                  ...(fullReq?.caseInfos || {}),
                },
                rnd: {
                  ...((req as any)?.rnd || {}),
                  ...(fullReq?.rnd || {}),
                },
                requestor: {
                  ...(req?.requestor || {}),
                  ...(fullReq?.requestor || {}),
                  requestSettings: {
                    ...((req?.requestor as any)?.requestSettings || {}),
                    ...((fullReq?.requestor as any)?.requestSettings || {}),
                  },
                },
                business: {
                  ...((req as any)?.business || {}),
                  ...(fullReq?.business || {}),
                  requestSettings: {
                    ...((req as any)?.business?.requestSettings || {}),
                    ...(fullReq?.business?.requestSettings || {}),
                  },
                },
                lotNumber: {
                  ...(req?.lotNumber || {}),
                  ...(fullReq?.lotNumber || {}),
                },
                spec: {
                  ...((req as any)?.spec || {}),
                  ...(fullReq?.spec || {}),
                },
              } as ManufacturerRequest;
            }
          } catch {
            // full request 보강 실패 시 아래 summary/원본 경로로 진행
          }
        }

        const shouldEnrichFromSummary =
          tabStage === "tracking" ||
          !targetReq?.caseInfos?.implantManufacturer ||
          !targetReq?.requestor?.business ||
          !String(
            targetReq?.timeline?.estimatedShipYmd ||
              (targetReq as any)?.estimatedShipYmd ||
              "",
          ).trim();

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
            const summaryReq = summaryData?.request || summaryData;

            if (summaryRes.ok && summaryBody?.success !== false && summaryReq) {
              const summaryShipYmd = String(
                summaryReq?.timeline?.estimatedShipYmd ||
                  summaryReq?.estimatedShipYmd ||
                  summaryData?.estimatedShipYmd ||
                  "",
              ).trim();
              targetReq = {
                ...targetReq,
                ...summaryReq,
                _id: String(summaryReq?._id || summaryData?._id || targetReq?._id || "").trim() || targetReq?._id,
                requestId: String(summaryReq?.requestId || summaryData?.requestId || targetReq?.requestId || "").trim() || targetReq?.requestId,
                caseInfos: {
                  ...(targetReq?.caseInfos || {}),
                  ...(summaryReq?.caseInfos || {}),
                },
                requestor: {
                  ...(targetReq?.requestor || {}),
                  ...(summaryReq?.requestor || {}),
                },
                lotNumber: {
                  ...(targetReq?.lotNumber || {}),
                  ...(summaryReq?.lotNumber || {}),
                },
                spec: {
                  ...((targetReq as any)?.spec || {}),
                  ...(summaryReq?.spec || {}),
                },
                timeline: {
                  ...((targetReq as any)?.timeline || {}),
                  ...(summaryReq?.timeline || {}),
                  ...(summaryShipYmd
                    ? { estimatedShipYmd: summaryShipYmd }
                    : {}),
                },
                estimatedShipYmd:
                  summaryShipYmd ||
                  String(
                    (targetReq as any)?.estimatedShipYmd ||
                      targetReq?.timeline?.estimatedShipYmd ||
                      "",
                  ).trim() ||
                  null,
              } as ManufacturerRequest;

              const hasImplantData = Boolean(
                targetReq?.caseInfos?.implantManufacturer ||
                  targetReq?.caseInfos?.implantBrand ||
                  targetReq?.caseInfos?.implantFamily ||
                  targetReq?.caseInfos?.implantType ||
                  (targetReq as any)?.spec?.implantCompany ||
                  (targetReq as any)?.spec?.implantBrand ||
                  (targetReq as any)?.spec?.implantProduct ||
                  (targetReq as any)?.spec?.implantFamily ||
                  (targetReq as any)?.spec?.implantType ||
                  (targetReq as any)?.implantManufacturer ||
                  (targetReq as any)?.implantBrand ||
                  (targetReq as any)?.implantFamily ||
                  (targetReq as any)?.implantType,
              );

              const enrichedMongoId = String(targetReq?._id || "").trim();
              if (tabStage === "tracking" && enrichedMongoId && !hasImplantData) {
                try {
                  const fullRes = await fetch(`/api/requests/${encodeURIComponent(enrichedMongoId)}`, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                  });
                  const fullBody: any = await fullRes.json().catch(() => ({}));
                  const fullReq = fullBody?.data?.request || fullBody?.data || null;
                  if (fullRes.ok && fullBody?.success !== false && fullReq) {
                    targetReq = {
                      ...targetReq,
                      ...fullReq,
                      caseInfos: {
                        ...(targetReq?.caseInfos || {}),
                        ...(fullReq?.caseInfos || {}),
                      },
                      requestor: {
                        ...(targetReq?.requestor || {}),
                        ...(fullReq?.requestor || {}),
                      },
                      lotNumber: {
                        ...(targetReq?.lotNumber || {}),
                        ...(fullReq?.lotNumber || {}),
                      },
                      spec: {
                        ...((targetReq as any)?.spec || {}),
                        ...(fullReq?.spec || {}),
                      },
                    } as ManufacturerRequest;
                  }
                } catch {
                  // no-op
                }
              }
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

        const filledStl = resolveFilledStlFile(targetReq.caseInfos);
        const camFileMeta: any = filledStl;
        const camCacheKeyBase = filledStl?.s3Key || null;
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
          const rawCamName =
            filledStl?.filePath || filledStl?.originalName || originalName;
          const rawBase = String(rawCamName).split("/").pop() || String(rawCamName);
          // StlPreviewViewer는 파일명에 "filled"가 있어야 가이드/오버레이를 켠다.
          const camName = /\.filled\./i.test(rawBase) || /filled/i.test(rawBase)
            ? rawBase
            : rawBase.toLowerCase().endsWith(".stl")
              ? rawBase.replace(/\.stl$/i, ".filled.stl")
              : `${rawBase}.filled.stl`;
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

        // CAM / 가공 / 추적관리: NC 프리뷰를 보여주기 위해 NC를 읽어온다.
        // 동일 s3Key 덮어쓰기(재생성) 시 버전 메타 없는 IndexedDB 키는 구 NC를 영원히 돌려준다.
        const ncPromise =
          needsNcPreview
            ? (async () => {
                const ncMeta = targetReq.caseInfos?.ncFile as
                  | {
                      s3Key?: string;
                      originalName?: string;
                      filePath?: string;
                      fileSize?: unknown;
                      uploadedAt?: unknown;
                      materialDiameter?: unknown;
                    }
                  | null
                  | undefined;
                const ncS3Key = String(ncMeta?.s3Key || "").trim();
                if (!ncS3Key || !requestMongoId) return;
                const ncNameRaw =
                  ncMeta?.originalName || ncMeta?.filePath || "program.nc";
                const ncName = ncNameRaw.split("/").pop() || ncNameRaw;
                const versioned = hasNcVersionMeta(ncMeta);
                const ncVersionedKey = buildBlobCacheKey(ncS3Key, ncMeta);
                // 버전 메타가 없으면 unversioned 키로 캐시하지 않는다(구 #521 고착 방지).
                const ncCacheKey =
                  versioned && ncVersionedKey
                    ? `cnc:s3:${ncVersionedKey}`
                    : null;
                const disableNcCache = forceRefresh || !versioned;
                if (disableNcCache) {
                  await deleteCncProgramCache(ncS3Key);
                }

                const loadNcText = async (opts: { disableCache: boolean }) => {
                  const file = await fetchAsFileWithCache(
                    opts.disableCache ? null : ncCacheKey,
                    () =>
                      fetchSignedUrl(
                        `/api/requests/${requestMongoId}/nc-file-url`,
                      ),
                    ncName,
                    { disableCache: opts.disableCache },
                  );
                  const buf = await file.arrayBuffer();
                  return decodeNcText(buf);
                };

                let text = await loadNcText({ disableCache: disableNcCache });
                const expectedDia = resolveExpectedMaterialDiameter(targetReq);
                const actualDia = parseNcStockDiameter(text);
                if (
                  expectedDia != null &&
                  actualDia != null &&
                  Math.abs(actualDia - expectedDia) >= 0.05
                ) {
                  console.warn(
                    "[usePreviewLoader] NC #521 mismatch vs materialDiameter — refetch",
                    {
                      requestId: targetReq.requestId,
                      expectedDia,
                      actualDia,
                      ncS3Key,
                    },
                  );
                  await deleteCncProgramCache(ncS3Key);
                  text = await loadNcText({ disableCache: true });
                }

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
                // 포장.발송·추적관리: 각인은 세척.패킹(packing) stageFiles에 저장된다.
                const effectiveStageKey =
                  previewStageKey === "shipping" ||
                  previewStageKey === "tracking"
                    ? "packing"
                    : previewStageKey;
                const stageMeta =
                  targetReq.caseInfos?.stageFiles?.[effectiveStageKey];
                if (!requestMongoId || !stageMeta?.s3Key) return;
                const signed = await fetchSignedUrl(
                  `/api/requests/${requestMongoId}/stage-file-url?stage=${encodeURIComponent(
                    effectiveStageKey,
                  )}`,
                ).catch(() => null);
                const signedUrl = String(signed?.url || "").trim();
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

        if (!isLoadCurrent()) return;

        setPreviewFiles({
          original: leftStlFile,
          // 가공(isCamStage)은 왼쪽에만 STL을 받던 구조였으나, 오른쪽 FL/FP 뷰어에도 동일 filled를 쓴다.
          cam: shouldUseSingleLeftStl ? leftStlFile : rightStlFile,
          title,
          request: targetReq,
          finishLinePoints: finishLineResult.points,
          finishLineSource: finishLineResult.source,
        });
        if (openOnlyIfAlreadyOpen) {
          setPreviewOpen((prev) => (prev ? true : false));
        } else {
          setPreviewOpen((prev) => (prev ? prev : true));
        }
        if (!silent) {
          toast({
            title: "다운로드 완료",
            description:
              cacheHitCount > 0
                ? `캐시(IndexedDB) ${cacheHitCount}건 + 다운로드 ${cacheMissCount}건`
                : `다운로드 ${cacheMissCount}건`,
            duration: 2000,
          });
        }
      } catch (error) {
        if (!isLoadCurrent()) return;
        if (!silent) {
          toastFn({
            title: "미리보기 실패",
            description: "파일을 불러올 수 없습니다.",
            variant: "destructive",
          });
        }
      } finally {
        if (!isLoadCurrent()) return;
        if (!silent) {
          setPreviewLoading(false);
        }
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
