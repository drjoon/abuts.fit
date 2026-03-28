import { useCallback } from "react";
import { apiFetch } from "@/shared/api/apiClient";

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
};

interface UseS3TempUploadOptions {
  token?: string | null;
}

const IMAGE_OPTIMIZE_MIN_BYTES = 1.5 * 1024 * 1024;
const IMAGE_OPTIMIZE_MAX_DIMENSION = 1800;

const isImageFile = (file: File) => file.type.startsWith("image/");

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

export function useS3TempUpload(options: UseS3TempUploadOptions) {
  const { token } = options;

  const uploadFiles = useCallback(
    async (
      files: File[],
      onProgress?: (progress: Record<string, number>) => void,
    ): Promise<TempUploadedFile[]> => {
      if (!files.length) return [];

      // 일부 환경에서 다량 업로드 시 presign 결과/업로드가 4개로 제한되는 이슈가 있어
      // 안정성을 위해 chunk 단위로 업로드한다.
      const CHUNK_SIZE = 4;
      const chunks: File[][] = [];
      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        chunks.push(files.slice(i, i + CHUNK_SIZE));
      }

      const allUploaded: TempUploadedFile[] = [];
      for (const chunk of chunks) {
        const optimizedChunk = await Promise.all(
          chunk.map((file) => optimizeImageFile(file)),
        );

        const res = await apiFetch<any>({
          path: "/api/files/temp/presign",
          method: "POST",
          token,
          jsonBody: {
            files: optimizedChunk.map((file) => ({
              originalName: file.name,
              mimetype: file.type || "application/octet-stream",
              size: file.size,
            })),
          },
        });

        if (!res.ok) {
          throw new Error("업로드 URL 생성에 실패했습니다.");
        }

        const body = res.data || {};
        const data = (body as any)?.data;
        if (!Array.isArray(data)) continue;

        const presigned = data as PresignResponseItem[];
        const currentProgress: Record<string, number> = {};

        const uploadPromises = presigned.map((item, i) => {
          const file = optimizedChunk[i];
          return new Promise<TempUploadedFile>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", item.uploadUrl);
            xhr.setRequestHeader(
              "Content-Type",
              file?.type || "application/octet-stream",
            );

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable && onProgress) {
                const percentComplete = Math.round(
                  (event.loaded / event.total) * 100,
                );
                const k = `${file.name}:${file.size}`;
                currentProgress[k] = percentComplete;
                onProgress({ ...currentProgress });
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(item.file);
              } else {
                reject(new Error("S3 업로드에 실패했습니다."));
              }
            };

            xhr.onerror = () => reject(new Error("S3 업로드 중 오류 발생"));
            xhr.send(file);
          });
        });

        const uploaded = await Promise.all(uploadPromises);
        allUploaded.push(...uploaded);
      }

      return allUploaded;
    },
    [token],
  );

  return { uploadFiles };
}
