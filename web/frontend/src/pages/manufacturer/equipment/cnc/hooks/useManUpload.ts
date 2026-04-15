import { useCallback, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

export type ManUploadProgress = {
  machineId: string;
  fileName: string;
  percent: number;
};

/**
 * [정책 §4.8] 장비 페이지 수동 업로드 전용 훅
 *
 * 용도: 장비 페이지에서 작업자가 수동으로 업로드하는 파일 처리
 * 경로: POST /api/cnc-machines/:machineId/man/upload
 * 특징:
 *   - man = manual. 작업자가 장비 페이지에서 직접 이용하는 수동 업로드 전용
 *   - requestId 없음 (source="manual_upload")
 *   - 파일 → 백엔드 경유 → bridge-store 저장 → bridge 큐 등록
 *   - 기본 paused 상태 (allowJobStart 플래그로 제어)
 *   - 의뢰건 자동 가공(useLabUpload /lab/)와 완전 분리됨
 */
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
            // Man(수동) 업로드 전용 API — /man/upload
            // 구 경로 /continuous/upload, /smart/upload 에서 변경됨
            xhr.open(
              "POST",
              `/api/cnc-machines/${encodeURIComponent(mid)}/man/upload`,
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

            const formData = new FormData();
            formData.append("file", file);
            formData.append("fileName", fileName);

            // Man 업로드: requestId 없음, source="manual_upload" / Lab(/lab/)과 완전 분리
            xhr.send(formData);
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
