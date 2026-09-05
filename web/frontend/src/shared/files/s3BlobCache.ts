// change-log:
// - 2026-09-05: guide-tour/* — public 정적 샘플 fetch(실 PLY). 실패 시 placeholder.
// - 2026-09-05: guide-tour/demo S3키 — 네트워크 없이 placeholder blob(403 방지).
// - 2026-08-16: S3 키 기준 IndexedDB blob 캐시 헬퍼.
// related files:
// - web/frontend/src/shared/files/fileBlobCache.ts
// - web/frontend/src/shared/files/downloadWithProgress.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/guideTour/guideTourLabReceiveDemo.ts
import { getFileBlob, setFileBlob } from "@/shared/files/fileBlobCache";
import { fetchBlobWithProgress } from "@/shared/files/downloadWithProgress";
import {
  buildGuideTourDemoPlaceholderBlob,
  guideTourDemoPublicUrl,
  isGuideTourDemoS3Key,
} from "@/shared/guideTour/guideTourLabReceiveDemo";

export function s3FileBlobCacheKey(s3Key: string, thumbWidth?: number): string {
  const key = String(s3Key || "").trim();
  if (thumbWidth && thumbWidth > 0) {
    return `s3thumb:${Math.floor(thumbWidth)}:${key}`;
  }
  return `s3:${key}`;
}

export type FetchS3BlobCachedOptions = {
  s3Key: string;
  fileName: string;
  token: string;
  /** 썸네일 프록시 요청 시 서버 리사이즈 폭(px) */
  thumbWidth?: number;
  /** 프록시 URL 빌더 (캐시 미스 시에만 호출) */
  buildUrl: (s3Key: string, fileName: string) => string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

/**
 * IndexedDB(`s3:{key}`) → 없으면 S3 프록시 fetch 후 캐시 저장.
 * 캐시 히트 시 progress 100만 보고한다.
 */
export async function fetchS3BlobCached(
  options: FetchS3BlobCachedOptions,
): Promise<Blob> {
  const s3Key = String(options.s3Key || "").trim();
  const fileName = String(options.fileName || "download").trim() || "download";
  if (!s3Key) throw new Error("파일 키가 없습니다.");
  if (!options.token) throw new Error("로그인이 필요합니다.");

  // 가이드투어 — public/guide-tour/... 정적 샘플(실 PLY 복사본)
  if (isGuideTourDemoS3Key(s3Key)) {
    try {
      const url = guideTourDemoPublicUrl(s3Key);
      const res = await fetch(url, { signal: options.signal });
      if (res.ok) {
        const blob = await res.blob();
        options.onProgress?.(100);
        try {
          await setFileBlob(s3FileBlobCacheKey(s3Key, options.thumbWidth), blob);
        } catch {
          // ignore cache write errors
        }
        return blob;
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      // fall through to placeholder
    }
    options.onProgress?.(100);
    return buildGuideTourDemoPlaceholderBlob();
  }

  const cacheKey = s3FileBlobCacheKey(s3Key, options.thumbWidth);
  const cached = await getFileBlob(cacheKey);
  if (cached) {
    options.onProgress?.(100);
    return cached;
  }

  const blob = await fetchBlobWithProgress({
    url: options.buildUrl(s3Key, fileName),
    token: options.token,
    signal: options.signal,
    onProgress: options.onProgress,
  });

  try {
    await setFileBlob(cacheKey, blob);
  } catch {
    // ignore cache write errors
  }

  return blob;
}
