import { useCallback } from "react";

export interface TempUploadedFile {
  _id: string;
  originalName: string;
  mimetype: string;
  size: number;
  fileType?: string;
  location?: string;
  key?: string;
}

interface UseS3TempUploadOptions {
  token?: string | null;
}

export function useS3TempUpload(options: UseS3TempUploadOptions) {
  const { token } = options;

  const uploadFiles = useCallback(
    async (files: File[]): Promise<TempUploadedFile[]> => {
      if (!files.length) return [];
      const formData = new FormData();

      files.forEach((file) => {
        formData.append("files", file);
      });

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/files/temp", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        throw new Error("파일 업로드에 실패했습니다.");
      }

      const body = await res.json().catch(() => ({}));
      const data = body?.data;
      if (!Array.isArray(data)) return [];
      return data as TempUploadedFile[];
    },
    [token]
  );

  return { uploadFiles };
}
