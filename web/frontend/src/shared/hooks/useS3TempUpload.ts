import { useCallback } from "react";
import { apiFetch } from "@/lib/apiClient";

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
    async (files: File[]): Promise<TempUploadedFile[]> => {
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
      for (let i = 0; i < presigned.length; i += 1) {
        const item = presigned[i];
        const file = files[i];
        if (!item?.uploadUrl || !item?.file?._id) {
          throw new Error("업로드 URL 응답이 올바르지 않습니다.");
        }

        const putRes = await fetch(item.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file?.type || "application/octet-stream",
          },
          body: file,
        });

        if (!putRes.ok) {
          throw new Error("S3 업로드에 실패했습니다.");
        }

        uploadedFiles.push(item.file);
      }

      return uploadedFiles;
    },
    [token]
  );

  return { uploadFiles };
}
