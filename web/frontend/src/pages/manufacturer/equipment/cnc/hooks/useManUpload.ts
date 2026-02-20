import { useCallback, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

export type ManUploadProgress = {
  machineId: string;
  fileName: string;
  percent: number;
};

// 장비카드: 업로드 + 즉시 브리지 큐 등록 (bridge 측 allowAutoStart 기본 false → paused 상태 유지)
export const useManUpload = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<ManUploadProgress | null>(null);
  const uploadSeqRef = useRef(0);

  const uploadMachineFiles = useCallback(
    async (
      machineId: string,
      files: FileList | File[],
      options?: { onDone?: () => void },
    ) => {
      const mid = String(machineId || "").trim();
      if (!mid) throw new Error("장비 ID가 올바르지 않습니다.");
      if (!token) throw new Error("로그인이 필요합니다.");

      const list = Array.isArray(files) ? files : Array.from(files || []);
      if (list.length === 0) return;

      const seq = (uploadSeqRef.current += 1);
      const setProgressSafe = (
        next: { machineId: string; fileName: string; percent: number } | null,
      ) => {
        if (uploadSeqRef.current !== seq) return;
        setUploadProgress(next);
      };

      setUploading(true);
      setProgressSafe(null);
      let uploadedCount = 0;
      try {
        for (const file of list) {
          if (!file) continue;
          const fileName = String(file.name || "").trim() || "(unknown)";
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 10 * 60 * 1000;
            xhr.open(
              "POST",
              `/api/cnc-machines/${encodeURIComponent(mid)}/continuous/upload`,
            );
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);

            setProgressSafe({ machineId: mid, fileName, percent: 0 });
            xhr.upload.onprogress = (evt) => {
              if (!evt.lengthComputable) return;
              const percent = Math.max(
                0,
                Math.min(100, Math.round((evt.loaded / evt.total) * 100)),
              );
              setProgressSafe({ machineId: mid, fileName, percent });
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                setProgressSafe({ machineId: mid, fileName, percent: 100 });
                resolve();
                return;
              }
              reject(
                new Error(
                  `장비카드 업로드 실패: ${fileName} (HTTP ${xhr.status})`,
                ),
              );
            };
            xhr.onerror = () => reject(new Error("업로드에 실패했습니다."));
            xhr.onabort = () => reject(new Error("업로드가 취소되었습니다."));
            xhr.ontimeout = () =>
              reject(new Error("업로드 시간이 초과되었습니다."));

            const form = new FormData();
            form.append("file", file);
            form.append("originalFileName", fileName);
            xhr.send(form);
          });
          uploadedCount += 1;
        }

        if (uploadedCount > 0) {
          toast({
            title: "업로드 완료",
            description: `${uploadedCount}개 파일이 업로드되었습니다. (큐에 등록됨)`,
          });
        }
        options?.onDone?.();
      } catch (e: any) {
        const msg = e?.message || "업로드 중 오류";
        toast({
          title: "업로드 실패",
          description: msg,
          variant: "destructive",
        });
        throw e;
      } finally {
        setTimeout(() => setProgressSafe(null), 800);
        setUploading(false);
      }
    },
    [toast, token],
  );

  return {
    uploading,
    uploadProgress,
    uploadMachineFiles,
  };
};
