import { useCallback, useState } from "react";

import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { toast } from "@/shared/hooks/use-toast";

export type LabUploadProgress = {
  machineId: string;
  fileName: string;
  percent: number;
};

/**
 * [정책 §4.8] 의뢰건 자동 가공 전용 업로드 훅
 *
 * 용도: 작업-가공 페이지에서 Request.manufacturerStage="가공" 의뢰건 처리
 * 경로: POST /api/cnc-machines/:machineId/lab/presign + /lab/enqueue
 * 특징:
 *   - lab = laboratory(기공소). 의뢰건 자동가공 전용
 *   - requestId를 포함하여 DB 생산 큐에 등록 (source="request_auto")
 *   - allowAutoMachining 플래그에 따라 자동 시작
 *   - 장비 페이지 수동 업로드(useManUpload /man/upload)와 완전 분리됨
 */
export const useLabUpload = () => {
  const { token } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<LabUploadProgress | null>(null);

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

          // 1) Lab presign 발급 — 백엔드가 S3 PUT URL을 반환
          const presignRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(mid)}/lab/presign`,
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

          // 3) Lab enqueue — S3에 저장된 메타데이터를 DB에 등록
          // requestId 포함, source="request_auto" / Man(/man/upload)과 완전 분리
          const enqueueRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(mid)}/lab/enqueue`,
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

  return {
    uploading,
    uploadProgress,
    uploadLocalFiles,
  };
};
