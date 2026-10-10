// change-log:
// - 2026-10-10: 보이는 카드만, 동시에 2개까지 STL을 받고 PNG로 바꾼 뒤 File은 놓는다.
// - 2026-09-17: 카드 썸네일 로드를 프리뷰와 동일하게 `/cam-file-url` + IndexedDB로 맞춤(S3 프록시 실패 수정).
// - 2026-09-17: 준비/가공 의뢰카드 — filled STL + 피니시라인 썸네일(프리뷰 오른쪽과 동일 소스).
// related files:
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/shared/files/stlIndexedDb.ts
import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import { StlPreviewThumbnail } from "@/features/requests/components/StlPreviewThumbnail";
import {
  fileFromModelBlob,
  modelFileBasename,
} from "@/shared/files/modelPreviewFile";
import { getFileBlob, setFileBlob } from "@/shared/files/stlIndexedDb";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import {
  resolveFilledStlFile,
  type ManufacturerRequest,
} from "../utils/request";

type Props = {
  request: ManufacturerRequest;
  className?: string;
};

function ensureFilledFileName(name: string): string {
  const base = modelFileBasename(name, "model.filled.stl");
  if (/\.filled\./i.test(base) || /filled/i.test(base)) return base;
  return base.toLowerCase().endsWith(".stl")
    ? base.replace(/\.stl$/i, ".filled.stl")
    : `${base}.filled.stl`;
}

function resolveFinishLinePoints(
  request: ManufacturerRequest,
): number[][] | null {
  const points = request?.caseInfos?.finishLine?.points;
  if (!Array.isArray(points) || points.length < 2) return null;
  return points;
}

const PNG_CACHE_MAX = 48;
const pngCache = new Map<string, string>();
const MAX_STL_DOWNLOADS = 2;
let activeStlDownloads = 0;
const stlDownloadWaiters: Array<() => void> = [];

function rememberPng(key: string, dataUrl: string) {
  if (pngCache.has(key)) pngCache.delete(key);
  pngCache.set(key, dataUrl);
  while (pngCache.size > PNG_CACHE_MAX) {
    const oldest = pngCache.keys().next().value;
    if (!oldest) break;
    pngCache.delete(oldest);
  }
}

function acquireStlDownload(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  if (activeStlDownloads < MAX_STL_DOWNLOADS) {
    activeStlDownloads += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const start = () => {
      signal.removeEventListener("abort", onAbort);
      activeStlDownloads += 1;
      resolve();
    };
    const onAbort = () => {
      const idx = stlDownloadWaiters.indexOf(start);
      if (idx >= 0) stlDownloadWaiters.splice(idx, 1);
      reject(new DOMException("Aborted", "AbortError"));
    };
    stlDownloadWaiters.push(start);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function releaseStlDownload() {
  activeStlDownloads = Math.max(0, activeStlDownloads - 1);
  const next = stlDownloadWaiters.shift();
  if (next) next();
}

function buildCamCacheKey(
  s3Key: string | null | undefined,
  meta?: { fileSize?: unknown; uploadedAt?: unknown } | null,
  fallbackId?: string,
): string | null {
  const base = String(s3Key || "").trim();
  const fileSize = meta?.fileSize != null ? String(meta.fileSize) : "";
  const uploadedAt = meta?.uploadedAt ? String(meta.uploadedAt) : "";
  if (base) {
    if (!fileSize && !uploadedAt) return base;
    return `${base}:v=${fileSize}:${uploadedAt}`;
  }
  const id = String(fallbackId || "").trim();
  if (!id) return null;
  const fb = `stl:${id}:cam`;
  if (!fileSize && !uploadedAt) return fb;
  return `${fb}:v=${fileSize}:${uploadedAt}`;
}

export function FilledStlCardThumbnail({ request, className }: Props) {
  const token = useAuthStore((s) => s.token);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const releaseSlotRef = useRef<(() => void) | null>(null);
  const [visible, setVisible] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);

  const requestMongoId = String(request?._id || "").trim();
  const filledMeta = resolveFilledStlFile(request?.caseInfos);
  const s3Key = String(filledMeta?.s3Key || "").trim();
  const fileName = ensureFilledFileName(
    String(
      filledMeta?.filePath ||
        filledMeta?.originalName ||
        filledMeta?.fileName ||
        "model.filled.stl",
    ),
  );
  const finishLinePoints = resolveFinishLinePoints(request);
  const cacheKey = buildCamCacheKey(
    s3Key,
    filledMeta,
    requestMongoId || String(request?.requestId || "").trim(),
  );
  const [pngUrl, setPngUrl] = useState<string | null>(() =>
    cacheKey ? pngCache.get(cacheKey) || null : null,
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPngUrl(cacheKey ? pngCache.get(cacheKey) || null : null);
    setFile(null);
  }, [cacheKey]);

  useEffect(() => {
    if (pngUrl || !visible || !token || !requestMongoId || !s3Key) {
      if (!pngUrl) setFile(null);
      setFailed(!pngUrl && (!s3Key || !requestMongoId));
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    let slotHeld = false;
    let slotReleased = false;
    const releaseOnce = () => {
      if (!slotHeld || slotReleased) return;
      slotReleased = true;
      releaseStlDownload();
    };
    releaseSlotRef.current = releaseOnce;
    setFailed(false);

    void (async () => {
      try {
        await acquireStlDownload(ac.signal);
        slotHeld = true;
        if (cancelled || ac.signal.aborted) {
          releaseOnce();
          return;
        }

        if (cacheKey) {
          const cached = await getFileBlob(cacheKey);
          if (cancelled || ac.signal.aborted) {
            releaseOnce();
            return;
          }
          if (cached) {
            setFile(fileFromModelBlob(cached, fileName));
            return;
          }
        }

        const signedRes = await fetch(
          `/api/requests/${encodeURIComponent(requestMongoId)}/cam-file-url`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: ac.signal,
          },
        );
        if (!signedRes.ok) {
          throw new Error(`cam-file-url failed: ${signedRes.status}`);
        }
        const body = await signedRes.json().catch(() => ({}));
        const signedUrl = String(body?.data?.url || "").trim();
        const resolvedName =
          String(body?.data?.fileName || "").trim() || fileName;
        if (!signedUrl) throw new Error("signed url missing");

        const fileRes = await fetch(signedUrl, { signal: ac.signal });
        if (!fileRes.ok) throw new Error(`filled stl fetch failed: ${fileRes.status}`);
        const blob = await fileRes.blob();
        if (cancelled || ac.signal.aborted) {
          releaseOnce();
          return;
        }

        if (cacheKey) {
          try {
            await setFileBlob(cacheKey, blob);
          } catch {
            // ignore cache write
          }
        }

        setFile(
          fileFromModelBlob(
            blob,
            ensureFilledFileName(resolvedName || fileName),
          ),
        );
      } catch (err) {
        if (cancelled || ac.signal.aborted) return;
        if ((err as { name?: string })?.name === "AbortError") return;
        setFailed(true);
        setFile(null);
        releaseOnce();
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      releaseOnce();
      if (releaseSlotRef.current === releaseOnce) releaseSlotRef.current = null;
    };
  }, [visible, pngUrl, token, requestMongoId, s3Key, fileName, cacheKey]);

  return (
    <div ref={rootRef} className={cn("h-full w-full", className)} aria-hidden>
      {pngUrl ? (
        <img
          src={pngUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : file ? (
        <StlPreviewThumbnail
          file={file}
          finishLinePoints={finishLinePoints}
          className="pointer-events-none"
          onSnapshot={(dataUrl) => {
            if (cacheKey) rememberPng(cacheKey, dataUrl);
            setPngUrl(dataUrl);
            setFile(null);
            releaseSlotRef.current?.();
            releaseSlotRef.current = null;
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <Box
            className={cn(
              "h-6 w-6 shrink-0",
              failed ? "opacity-40" : "opacity-60 animate-pulse",
            )}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}

export default FilledStlCardThumbnail;
