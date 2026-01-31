import { useCallback, useState } from "react";

import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";

export type CncUploadProgress = {
  machineId: string;
  fileName: string;
  percent: number;
};

export const useCncQueueUpload = () => {
  const { token } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<CncUploadProgress | null>(null);

  const clearTimerRef = useState<{ t: any | null }>({ t: null })[0];

  const uploadToPresignedUrl = useCallback(
    async (machineId: string, uploadUrl: string, file: File) => {
      const t = toast({
        title: "업로드 중",
        description:
          "NC 업로드는 30초 이상 걸릴 수 있습니다. 업로드가 끝날 때까지 브리지 서버/페이지를 종료하지 마세요.",
        duration: 600000,
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          if (clearTimerRef.t) {
            clearTimeout(clearTimerRef.t);
            clearTimerRef.t = null;
          }
          setUploadProgress({ machineId, fileName: file.name, percent: 0 });
          t.update({
            title: "업로드 중",
            description: `${file.name} (0%)\n업로드가 끝날 때까지 브리지 서버/페이지를 종료하지 마세요.`,
          } as any);
          xhr.setRequestHeader(
            "Content-Type",
            file.type || "application/octet-stream",
          );

          xhr.upload.onprogress = (evt) => {
            if (!evt.lengthComputable) return;
            const percent = Math.max(
              0,
              Math.min(100, Math.round((evt.loaded / evt.total) * 100)),
            );
            setUploadProgress({ machineId, fileName: file.name, percent });
            t.update({
              title: "업로드 중",
              description: `${file.name} (${percent}%)\n업로드가 끝날 때까지 브리지 서버/페이지를 종료하지 마세요.`,
            } as any);
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadProgress({
                machineId,
                fileName: file.name,
                percent: 100,
              });
              t.update({
                title: "업로드 완료",
                description: `${file.name} (100%)`,
              } as any);
              clearTimerRef.t = setTimeout(() => {
                setUploadProgress(null);
                clearTimerRef.t = null;
              }, 1200);
              resolve();
              return;
            }
            reject(new Error(`S3 업로드 실패 (HTTP ${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error("S3 업로드 실패"));
          xhr.send(file);
        });
      } catch (e: any) {
        const msg = e?.message || "업로드 중 오류가 발생했습니다.";
        t.update({ title: "업로드 실패", description: msg } as any);
        toast({
          title: "업로드 실패",
          description: msg,
          variant: "destructive",
        });
        throw e;
      } finally {
        t.dismiss();
      }
    },
    [],
  );

  const uploadLocalFiles = useCallback(
    async (machineId: string, files: FileList | File[]) => {
      const mid = String(machineId || "").trim();
      if (!mid) {
        throw new Error("장비 ID가 올바르지 않습니다.");
      }
      if (!token) {
        throw new Error("로그인이 필요합니다.");
      }
      const list = Array.from(files || []);
      if (list.length === 0) return;

      setUploading(true);
      setUploadProgress(null);
      try {
        for (const file of list) {
          const fileName = String(file.name || "").trim();
          if (!fileName) {
            throw new Error("파일명이 올바르지 않습니다.");
          }

          // 1) presign 발급
          const presignRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(mid)}/direct/presign`,
            method: "POST",
            token,
            jsonBody: {
              fileName,
              contentType: file.type || "application/octet-stream",
              fileSize: file.size,
            },
          });
          const presignBody: any = presignRes.data ?? {};
          const presignData = presignBody?.data ?? presignBody;
          if (!presignRes.ok || presignBody?.success === false) {
            throw new Error(
              presignBody?.message || presignBody?.error || "presign 발급 실패",
            );
          }

          const uploadUrl = String(presignData?.uploadUrl || "").trim();
          const s3Key = String(presignData?.s3Key || "").trim();
          const s3Bucket = String(presignData?.s3Bucket || "").trim();
          if (!uploadUrl || !s3Key) {
            throw new Error("presign 정보가 올바르지 않습니다.");
          }

          // 2) S3 업로드(PUT)
          await uploadToPresignedUrl(mid, uploadUrl, file);

          // 3) DB 예약목록 enqueue
          const enqueueRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(mid)}/direct/enqueue`,
            method: "POST",
            token,
            jsonBody: {
              fileName,
              s3Key,
              s3Bucket,
              contentType: file.type || "application/octet-stream",
              fileSize: file.size,
              qty: 1,
              requestId: null,
            },
          });
          const enqueueBody: any = enqueueRes.data ?? {};
          if (!enqueueRes.ok || enqueueBody?.success === false) {
            throw new Error(
              enqueueBody?.message ||
                enqueueBody?.error ||
                "DB 예약목록 등록 실패",
            );
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [token, uploadToPresignedUrl],
  );

  const uploadManualInsertFiles = useCallback(
    async (machineId: string, files: FileList | File[]) => {
      const mid = String(machineId || "").trim();
      if (!mid) {
        throw new Error("장비 ID가 올바르지 않습니다.");
      }
      if (!token) {
        throw new Error("로그인이 필요합니다.");
      }
      const list = Array.from(files || []);
      if (list.length === 0) return;

      setUploading(true);
      setUploadProgress(null);
      try {
        for (const file of list) {
          const fileName = String(file.name || "").trim();
          if (!fileName) throw new Error("파일명이 올바르지 않습니다.");

          const presignRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(mid)}/direct/presign`,
            method: "POST",
            token,
            jsonBody: {
              fileName,
              contentType: file.type || "application/octet-stream",
              fileSize: file.size,
            },
          });
          const presignBody: any = presignRes.data ?? {};
          const presignData = presignBody?.data ?? presignBody;
          if (!presignRes.ok || presignBody?.success === false) {
            throw new Error(
              presignBody?.message || presignBody?.error || "presign 발급 실패",
            );
          }
          const uploadUrl = String(presignData?.uploadUrl || "").trim();
          const s3Key = String(presignData?.s3Key || "").trim();
          const s3Bucket = String(presignData?.s3Bucket || "").trim();
          if (!uploadUrl || !s3Key)
            throw new Error("presign 정보가 올바르지 않습니다.");

          await uploadToPresignedUrl(mid, uploadUrl, file);

          const enqueueRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(
              mid,
            )}/continuous/enqueue-manual-insert`,
            method: "POST",
            token,
            jsonBody: {
              fileName,
              s3Key,
              s3Bucket,
            },
          });
          const enqueueBody: any = enqueueRes.data ?? {};
          if (!enqueueRes.ok || enqueueBody?.success === false) {
            throw new Error(
              enqueueBody?.message ||
                enqueueBody?.error ||
                "수동 끼워넣기 등록 실패",
            );
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [token, uploadToPresignedUrl],
  );

  return {
    uploading,
    uploadProgress,
    uploadLocalFiles,
    uploadManualInsertFiles,
  };
};
