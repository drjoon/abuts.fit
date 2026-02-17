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

export function useS3TempUpload(options: UseS3TempUploadOptions) {
  const { token } = options;

  const uploadFiles = useCallback(
    async (
      files: File[],
      onProgress?: (progress: Record<string, number>) => void
    ): Promise<TempUploadedFile[]> => {
      if (!files.length) return [];

      const res = await apiFetch<any>({
        path: "/api/files/temp/presign",
        method: "POST",
        token,
        jsonBody: {
          files: files.map((file) => ({
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
      if (!Array.isArray(data)) return [];

      const presigned = data as PresignResponseItem[];
      const uploadedFiles: TempUploadedFile[] = [];
      const currentProgress: Record<string, number> = {};

      const uploadPromises = presigned.map((item, i) => {
        const file = files[i];
        return new Promise<TempUploadedFile>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", item.uploadUrl);
          xhr.setRequestHeader(
            "Content-Type",
            file?.type || "application/octet-stream"
          );

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
              const percentComplete = Math.round(
                (event.loaded / event.total) * 100
              );
              currentProgress[file.name] = percentComplete;
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

      return Promise.all(uploadPromises);
    },
    [token]
  );

  return { uploadFiles };
}
