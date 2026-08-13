// related files:
// - web/frontend/src/shared/files/downloadWithProgress.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
import { useCallback, useRef, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { downloadWithProgress } from "@/shared/files/downloadWithProgress";

export type S3DownloadTarget = {
  s3Key?: string;
  fileName?: string;
  busyKey?: string;
};

export function s3DownloadBusyKey(file: {
  s3Key?: string;
  id?: string;
  fileId?: string;
}): string {
  return String(file.s3Key || file.id || file.fileId || "").trim();
}

export function buildS3ProxyDownloadUrl(s3Key: string, fileName: string): string {
  const name = String(fileName || "download").trim() || "download";
  return `/api/files/s3/download?key=${encodeURIComponent(s3Key)}&fileName=${encodeURIComponent(name)}&_ts=${Date.now()}`;
}

export function useS3FileDownload(token?: string | null) {
  const { toast } = useToast();
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  const [downloadProgressByKey, setDownloadProgressByKey] = useState<
    Record<string, number>
  >({});
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const downloadingKeysRef = useRef<Set<string>>(new Set());

  const downloadS3File = useCallback(
    async (file: S3DownloadTarget) => {
      const s3Key = String(file.s3Key || "").trim();
      const fileName = String(file.fileName || "download").trim() || "download";
      const busyKey = String(file.busyKey || s3Key).trim();

      if (!token) return;
      if (!s3Key) {
        toast({
          title: "다운로드 실패",
          description: "파일 키가 없어 다운로드할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }
      if (busyKey && downloadingKeysRef.current.has(busyKey)) return;

      if (busyKey) {
        downloadingKeysRef.current.add(busyKey);
        setDownloadingKeys(Array.from(downloadingKeysRef.current));
        setDownloadProgressByKey((prev) => ({ ...prev, [busyKey]: 0 }));
      }

      try {
        await downloadWithProgress({
          url: buildS3ProxyDownloadUrl(s3Key, fileName),
          token,
          fileName,
          onProgress: (percent) => {
            if (!busyKey) return;
            setDownloadProgressByKey((prev) => ({
              ...prev,
              [busyKey]: percent,
            }));
          },
        });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        toast({
          title: "다운로드 실패",
          description:
            err instanceof Error
              ? err.message
              : "다운로드 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        if (busyKey) {
          downloadingKeysRef.current.delete(busyKey);
          setDownloadingKeys(Array.from(downloadingKeysRef.current));
          setDownloadProgressByKey((prev) => {
            const next = { ...prev };
            delete next[busyKey];
            return next;
          });
        }
      }
    },
    [toast, token],
  );

  const downloadAll = useCallback(
    async (files: S3DownloadTarget[]) => {
      const targets = Array.isArray(files) ? files.filter((file) => String(file.s3Key || "").trim()) : [];
      if (!targets.length || downloadAllBusy) return;
      setDownloadAllBusy(true);
      try {
        await Promise.all(targets.map((file) => downloadS3File(file)));
      } finally {
        setDownloadAllBusy(false);
      }
    },
    [downloadAllBusy, downloadS3File],
  );

  const resetDownloads = useCallback(() => {
    downloadingKeysRef.current.clear();
    setDownloadingKeys([]);
    setDownloadProgressByKey({});
    setDownloadAllBusy(false);
  }, []);

  return {
    downloadingKeys,
    downloadProgressByKey,
    downloadAllBusy,
    downloadS3File,
    downloadAll,
    resetDownloads,
  };
}
