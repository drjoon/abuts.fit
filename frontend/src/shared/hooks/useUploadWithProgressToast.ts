import React, { useCallback } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  useS3TempUpload,
  TempUploadedFile,
} from "@/shared/hooks/useS3TempUpload";
import { UploadProgressToast } from "@/components/UploadProgressToast";

interface UseUploadWithProgressToastOptions {
  token?: string | null;
}

export function useUploadWithProgressToast(
  options: UseUploadWithProgressToastOptions
) {
  const { token } = options;
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token });

  const uploadFilesWithToast = useCallback(
    async (files: File[]): Promise<TempUploadedFile[]> => {
      if (!files.length) return [];

      let progress = 0;

      const t = toast({
        title: "파일 업로드",
        description: React.createElement(UploadProgressToast, { progress: 0 }),
      });

      const interval = window.setInterval(() => {
        progress = Math.min(progress + 5, 90);
        if (!t.id) return;
        t.update({
          id: t.id,
          title: "파일 업로드",
          description: React.createElement(UploadProgressToast, {
            progress,
          }),
        });
      }, 200);

      try {
        const result = await uploadFiles(files);

        progress = 100;
        if (t.id) {
          t.update({
            id: t.id,
            title: "파일 업로드 완료",
            description: React.createElement(UploadProgressToast, {
              progress,
              label: "업로드 완료",
            }),
            // 업로드 완료 토스트는 짧게 표시 후 자동으로 사라지도록 설정
            duration: 2000,
          });
        }

        return result;
      } catch (err: any) {
        if (t.id) {
          t.update({
            id: t.id,
            title: "파일 업로드 중 오류 발생",
            description: err?.message || "파일 업로드에 실패했습니다.",
            variant: "destructive",
          });
        }
        throw err;
      } finally {
        window.clearInterval(interval);
      }
    },
    [toast, uploadFiles]
  );

  return { uploadFilesWithToast };
}
