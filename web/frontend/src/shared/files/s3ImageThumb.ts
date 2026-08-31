// change-log:
// - 2026-08-31: S3 이미지 썸네일 — 서버 리사이즈·병렬·점진 object URL 로드.
// related files:
// - web/frontend/src/shared/files/s3BlobCache.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { getPracticeTransferFileExtension } from "@/shared/practice/practiceTransferAccept";

/** 채팅·의뢰 파일 타일 썸네일 폭(px) — 서버 sharp 리사이즈와 맞춤 */
export const S3_IMAGE_THUMB_WIDTH = 320;

export type S3ImageThumbItem = {
  s3Key: string;
  fileName: string;
};

function mimeTypeForImageFileName(name: string): string {
  const ext = getPracticeTransferFileExtension(name);
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
}

export function buildS3ProxyThumbUrl(s3Key: string, fileName: string): string {
  return buildS3ProxyDownloadUrl(s3Key, fileName, {
    thumbW: S3_IMAGE_THUMB_WIDTH,
  });
}

export function blobToImageObjectUrl(blob: Blob, fileName: string): string {
  const typed =
    blob.type && blob.type !== "application/octet-stream"
      ? blob
      : new Blob([blob], { type: mimeTypeForImageFileName(fileName) });
  return URL.createObjectURL(typed);
}

export async function fetchS3ImageThumbObjectUrl(options: {
  s3Key: string;
  fileName: string;
  token: string;
  signal?: AbortSignal;
}): Promise<string> {
  const s3Key = String(options.s3Key || "").trim();
  const fileName = String(options.fileName || "image").trim() || "image";
  const blob = await fetchS3BlobCached({
    s3Key,
    fileName,
    token: options.token,
    thumbWidth: S3_IMAGE_THUMB_WIDTH,
    buildUrl: buildS3ProxyThumbUrl,
    signal: options.signal,
  });
  return blobToImageObjectUrl(blob, fileName);
}

/** 각 썸네일이 준비되는 즉시 onReady 호출(병렬 fetch). */
export async function loadS3ImageThumbUrlsParallel(options: {
  items: S3ImageThumbItem[];
  token: string;
  signal?: AbortSignal;
  existing?: Record<string, string>;
  onReady: (s3Key: string, url: string) => void;
}): Promise<void> {
  const { items, token, signal, existing = {}, onReady } = options;
  await Promise.all(
    items.map(async (item) => {
      const s3Key = String(item.s3Key || "").trim();
      if (!s3Key || existing[s3Key]) return;
      try {
        const url = await fetchS3ImageThumbObjectUrl({
          s3Key,
          fileName: item.fileName,
          token,
          signal,
        });
        if (signal?.aborted) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
          return;
        }
        onReady(s3Key, url);
      } catch {
        // placeholder 유지
      }
    }),
  );
}
