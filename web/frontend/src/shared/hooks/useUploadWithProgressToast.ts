import React, { useCallback } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  useS3TempUpload,
  TempUploadedFile,
} from "@/shared/hooks/useS3TempUpload";
import { UploadProgressToast } from "@/features/requests/components/UploadProgressToast";

interface UseUploadWithProgressToastOptions {
  token?: string | null;
}

export function useUploadWithProgressToast(
  options: UseUploadWithProgressToastOptions,
) {
  const { token } = options;
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token });

  const uploadFilesWithToast = useCallback(
    async (files: File[]): Promise<TempUploadedFile[]> => {
      if (!files.length) return [];

      let overall = 0;
      const total = files.length;
      const progressMap: Record<string, number> = {};

      const t = toast({
        title: "파일 업로드",
        description: React.createElement(UploadProgressToast, { progress: 0 }),
      });

      const update = () => {
        const sum = Object.values(progressMap).reduce((a, b) => a + b, 0);
        overall = Math.floor(sum / Math.max(1, total));
        if (t.id) {
          t.update({
            id: t.id,
            title: "파일 업로드",
            description: React.createElement(UploadProgressToast, {
              progress: overall,
            }),
          });
        }
      };

      try {
        const result = await uploadFiles(files, (perFile) => {
          Object.assign(progressMap, perFile);
          update();
        });

        if (t.id) {
          t.update({
            id: t.id,
            title: "파일 업로드 완료",
            description: React.createElement(UploadProgressToast, {
              progress: 100,
              label: "업로드 완료",
            }),
            duration: 1500,
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
      }
    },
    [toast, uploadFiles],
  );

  return { uploadFilesWithToast };
}
