// change-log:
// - 2026-08-16: S3 키 기준 IndexedDB blob 캐시 헬퍼.
// related files:
// - web/frontend/src/shared/files/fileBlobCache.ts
// - web/frontend/src/shared/files/downloadWithProgress.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import { getFileBlob, setFileBlob } from "@/shared/files/fileBlobCache";
import { fetchBlobWithProgress } from "@/shared/files/downloadWithProgress";

export function s3FileBlobCacheKey(s3Key: string): string {
  return `s3:${String(s3Key || "").trim()}`;
}

export type FetchS3BlobCachedOptions = {
  s3Key: string;
  fileName: string;
  token: string;
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

  const cacheKey = s3FileBlobCacheKey(s3Key);
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
