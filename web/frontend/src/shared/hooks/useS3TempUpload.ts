// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/hooks/compressMeshFile.ts
// - web/frontend/src/shared/hooks/usePracticeFilePreUpload.ts
// - web/frontend/src/shared/hooks/useUploadWithProgressToast.ts
// - web/backend/controllers/files/file.controller.js
// - web/backend/utils/s3.utils.js
import { useCallback } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { prepareUploadBlob } from "@/shared/hooks/compressMeshFile";

export interface TempUploadedFile {
  _id: string;
  originalName: string;
  mimetype: string;
  size: number;
  fileType?: string;
  location?: string;
  key?: string;
}

type PresignResponseItem = {
  uploadUrl: string;
  file: TempUploadedFile;
  contentEncoding?: string;
};

type MultipartInitResponse = {
  uploadId: string;
  partUrls: { partNumber: number; uploadUrl: string }[];
  file: TempUploadedFile;
  contentEncoding?: string;
};

interface UseS3TempUploadOptions {
  token?: string | null;
}

const IMAGE_OPTIMIZE_MIN_BYTES = 1.5 * 1024 * 1024;
const IMAGE_OPTIMIZE_MAX_DIMENSION = 1800;
const UPLOAD_CONCURRENCY = 8;
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_PUT_ATTEMPTS = 3;

const isImageFile = (file: File) => file.type.startsWith("image/");

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const optimizeImageFile = async (file: File): Promise<File> => {
  if (typeof window === "undefined") return file;
  if (!isImageFile(file)) return file;
  if (file.size < IMAGE_OPTIMIZE_MIN_BYTES) return file;

  try {
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);

    const maxSide = Math.max(image.width || 0, image.height || 0);
    if (!maxSide) return file;

    const scale = Math.min(1, IMAGE_OPTIMIZE_MAX_DIMENSION / maxSide);
    if (scale >= 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, file.type);
    if (!blob || blob.size <= 0 || blob.size >= file.size) return file;

    return new File([blob], file.name, {
      type: blob.type || file.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지 읽기에 실패했습니다."));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 로딩에 실패했습니다."));
    image.src = src;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string) =>
  new Promise<Blob | null>((resolve) => {
    const quality = mimeType === "image/jpeg" ? 0.86 : 0.92;
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });

type PreparedFile = {
  source: File;
  blob: Blob;
  mimetype: string;
  originalName: string;
  contentEncoding?: "gzip";
  uncompressedSize: number;
  progressKey: string;
};

const putBlobWithRetry = async (params: {
  url: string;
  blob: Blob;
  contentType?: string;
  contentEncoding?: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<string> => {
  const { url, blob, contentType, contentEncoding, onProgress } = params;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_PUT_ATTEMPTS; attempt += 1) {
    try {
      const etag = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        if (contentType) {
          xhr.setRequestHeader("Content-Type", contentType);
        }
        if (contentEncoding) {
          xhr.setRequestHeader("Content-Encoding", contentEncoding);
        }

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable || !onProgress) return;
          onProgress(event.loaded, event.total || blob.size);
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(String(xhr.getResponseHeader("ETag") || "").trim());
            return;
          }
          reject(new Error(`S3 업로드에 실패했습니다. (${xhr.status})`));
        };

        xhr.onerror = () => reject(new Error("S3 업로드 중 오류 발생"));
        xhr.send(blob);
      });
      return etag;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err || "upload failed"));
      if (attempt >= MAX_PUT_ATTEMPTS) break;
      await sleep(250 * attempt * attempt);
    }
  }

  throw lastError || new Error("S3 업로드에 실패했습니다.");
};

const runWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const current = nextIndex;
        nextIndex += 1;
        results[current] = await worker(items[current], current);
      }
    },
  );

  await Promise.all(runners);
  return results;
};

export function useS3TempUpload(options: UseS3TempUploadOptions) {
  const { token } = options;

  const uploadSinglePrepared = useCallback(
    async (
      prepared: PreparedFile,
      onByteProgress?: (loaded: number, total: number) => void,
    ): Promise<TempUploadedFile> => {
      const totalBytes = prepared.blob.size;

      if (totalBytes >= MULTIPART_THRESHOLD_BYTES) {
        const partCount = Math.max(
          1,
          Math.ceil(totalBytes / MULTIPART_PART_SIZE_BYTES),
        );

        const initRes = await apiFetch<any>({
          path: "/api/files/temp/multipart/init",
          method: "POST",
          token,
          jsonBody: {
            originalName: prepared.originalName,
            mimetype: prepared.mimetype,
            size: totalBytes,
            partCount,
            contentEncoding: prepared.contentEncoding,
            uncompressedSize: prepared.uncompressedSize,
          },
        });

        if (!initRes.ok) {
          throw new Error("multipart 업로드 시작에 실패했습니다.");
        }

        const initBody = (initRes.data as any)?.data as MultipartInitResponse;
        const uploadId = String(initBody?.uploadId || "").trim();
        const partUrls = Array.isArray(initBody?.partUrls) ? initBody.partUrls : [];
        const file = initBody?.file;
        if (!uploadId || !file?._id || partUrls.length !== partCount) {
          throw new Error("multipart 업로드 정보가 올바르지 않습니다.");
        }

        const partProgress = new Array<number>(partCount).fill(0);
        const emitProgress = () => {
          if (!onByteProgress) return;
          const loaded = partProgress.reduce((sum, n) => sum + n, 0);
          onByteProgress(Math.min(totalBytes, loaded), totalBytes);
        };

        try {
          const completedParts = await runWithConcurrency(
            partUrls,
            Math.min(4, partUrls.length),
            async (part) => {
              const partNumber = Math.floor(Number(part.partNumber) || 0);
              const start = (partNumber - 1) * MULTIPART_PART_SIZE_BYTES;
              const end = Math.min(totalBytes, start + MULTIPART_PART_SIZE_BYTES);
              const chunk = prepared.blob.slice(start, end);

              const etag = await putBlobWithRetry({
                url: part.uploadUrl,
                blob: chunk,
                onProgress: (loaded) => {
                  partProgress[partNumber - 1] = loaded;
                  emitProgress();
                },
              });

              if (!etag) {
                throw new Error(`파트 ${partNumber} ETag를 받지 못했습니다.`);
              }

              partProgress[partNumber - 1] = chunk.size;
              emitProgress();
              return { ETag: etag, PartNumber: partNumber };
            },
          );

          const completeRes = await apiFetch<any>({
            path: "/api/files/temp/multipart/complete",
            method: "POST",
            token,
            jsonBody: {
              fileId: file._id,
              uploadId,
              parts: completedParts,
            },
          });

          if (!completeRes.ok) {
            throw new Error("multipart 업로드 완료에 실패했습니다.");
          }

          const completedFile =
            ((completeRes.data as any)?.data?.file as TempUploadedFile) || file;
          return completedFile;
        } catch (err) {
          await apiFetch({
            path: "/api/files/temp/multipart/abort",
            method: "POST",
            token,
            jsonBody: { fileId: file._id, uploadId },
          }).catch(() => null);
          throw err;
        }
      }

      const res = await apiFetch<any>({
        path: "/api/files/temp/presign",
        method: "POST",
        token,
        jsonBody: {
          files: [
            {
              originalName: prepared.originalName,
              mimetype: prepared.mimetype,
              size: totalBytes,
              contentEncoding: prepared.contentEncoding,
              uncompressedSize: prepared.uncompressedSize,
            },
          ],
        },
      });

      if (!res.ok) {
        throw new Error("업로드 URL 생성에 실패했습니다.");
      }

      const data = (res.data as any)?.data;
      const item = Array.isArray(data) ? (data[0] as PresignResponseItem) : null;
      if (!item?.uploadUrl || !item?.file) {
        throw new Error("업로드 URL 생성에 실패했습니다.");
      }

      await putBlobWithRetry({
        url: item.uploadUrl,
        blob: prepared.blob,
        contentType: prepared.mimetype,
        contentEncoding: prepared.contentEncoding,
        onProgress: onByteProgress,
      });

      return item.file;
    },
    [token],
  );

  const uploadFiles = useCallback(
    async (
      files: File[],
      onProgress?: (progress: Record<string, number>) => void,
    ): Promise<TempUploadedFile[]> => {
      if (!files.length) return [];

      const preparedList: PreparedFile[] = await Promise.all(
        files.map(async (file) => {
          const optimized = await optimizeImageFile(file);
          const prepared = await prepareUploadBlob(optimized);
          return {
            source: file,
            blob: prepared.blob,
            mimetype: prepared.mimetype,
            originalName: prepared.originalName,
            contentEncoding: prepared.contentEncoding,
            uncompressedSize: prepared.uncompressedSize,
            progressKey: `${file.name}:${file.size}`,
          };
        }),
      );

      const progressMap: Record<string, number> = {};
      for (const row of preparedList) {
        progressMap[row.progressKey] = 0;
      }
      onProgress?.({ ...progressMap });

      return runWithConcurrency(
        preparedList,
        UPLOAD_CONCURRENCY,
        async (prepared) => {
          const uploaded = await uploadSinglePrepared(prepared, (loaded, total) => {
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
            progressMap[prepared.progressKey] = Math.max(0, Math.min(100, pct));
            onProgress?.({ ...progressMap });
          });
          progressMap[prepared.progressKey] = 100;
          onProgress?.({ ...progressMap });
          return uploaded;
        },
      );
    },
    [uploadSinglePrepared],
  );

  return { uploadFiles };
}
