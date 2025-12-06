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
      // Authorization 헤더는 apiFetch의 token 옵션으로 처리하되,
      // 필요한 경우 추가 헤더를 headers로 전달한다.
      const res = await apiFetch<any>({
        path: "/api/files/temp",
        method: "POST",
        token,
        headers,
        body: formData,
      });

      if (!res.ok) {
        throw new Error("파일 업로드에 실패했습니다.");
      }

      const body = res.data || {};
      const data = (body as any)?.data;
      if (!Array.isArray(data)) return [];
      return data as TempUploadedFile[];
    },
    [token]
  );

  return { uploadFiles };
}
