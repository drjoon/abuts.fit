// change-log:
// - 2026-08-16: IndexedDB(s3:key) 캐시 — 다운로드·프리뷰 공통.
// - 2026-08-16: fetchS3Blob — 프리뷰용 blob fetch(저장 없음).
// related files:
// - web/frontend/src/shared/files/downloadWithProgress.ts
// - web/frontend/src/shared/files/s3BlobCache.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
import { useCallback, useRef, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { saveBlobAsDownload } from "@/shared/files/downloadWithProgress";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";

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

export function buildS3ProxyDownloadUrl(
  s3Key: string,
  fileName: string,
  opts?: { thumbW?: number },
): string {
  const name = String(fileName || "download").trim() || "download";
  const params = new URLSearchParams({
    key: s3Key,
    fileName: name,
    _ts: String(Date.now()),
  });
  const thumbW = Number(opts?.thumbW);
  if (Number.isFinite(thumbW) && thumbW > 0) {
    params.set("thumbW", String(Math.floor(thumbW)));
  }
  return `/api/files/s3/download?${params.toString()}`;
}

export function useS3FileDownload(token?: string | null) {
  const { toast } = useToast();
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  const [downloadProgressByKey, setDownloadProgressByKey] = useState<
    Record<string, number>
  >({});
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const downloadingKeysRef = useRef<Set<string>>(new Set());

  const beginBusy = useCallback((busyKey: string) => {
    if (!busyKey) return;
    downloadingKeysRef.current.add(busyKey);
    setDownloadingKeys(Array.from(downloadingKeysRef.current));
    setDownloadProgressByKey((prev) => ({ ...prev, [busyKey]: 0 }));
  }, []);

  const endBusy = useCallback((busyKey: string) => {
    if (!busyKey) return;
    downloadingKeysRef.current.delete(busyKey);
    setDownloadingKeys(Array.from(downloadingKeysRef.current));
    setDownloadProgressByKey((prev) => {
      const next = { ...prev };
      delete next[busyKey];
      return next;
    });
  }, []);

  const loadCachedBlob = useCallback(
    async (file: S3DownloadTarget & { signal?: AbortSignal }) => {
      const s3Key = String(file.s3Key || "").trim();
      const fileName = String(file.fileName || "download").trim() || "download";
      if (!token) throw new Error("로그인이 필요합니다.");
      if (!s3Key) throw new Error("파일 키가 없어 불러올 수 없습니다.");

      return fetchS3BlobCached({
        s3Key,
        fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        signal: file.signal,
        onProgress: (percent) => {
          const busyKey = String(file.busyKey || s3Key).trim();
          if (!busyKey) return;
          setDownloadProgressByKey((prev) => ({
            ...prev,
            [busyKey]: percent,
          }));
        },
      });
    },
    [token],
  );

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

      beginBusy(busyKey);

      try {
        const blob = await loadCachedBlob(file);
        saveBlobAsDownload(blob, fileName);
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
        endBusy(busyKey);
      }
    },
    [beginBusy, endBusy, loadCachedBlob, toast, token],
  );

  const fetchS3Blob = useCallback(
    async (
      file: S3DownloadTarget & { signal?: AbortSignal },
    ): Promise<Blob | null> => {
      const s3Key = String(file.s3Key || "").trim();
      const busyKey = String(file.busyKey || s3Key).trim();

      if (!token) return null;
      if (!s3Key) {
        toast({
          title: "미리보기 실패",
          description: "파일 키가 없어 불러올 수 없습니다.",
          variant: "destructive",
        });
        return null;
      }
      if (busyKey && downloadingKeysRef.current.has(busyKey)) return null;

      beginBusy(busyKey);

      try {
        return await loadCachedBlob(file);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return null;
        toast({
          title: "미리보기 실패",
          description:
            err instanceof Error
              ? err.message
              : "파일을 불러오는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      } finally {
        endBusy(busyKey);
      }
    },
    [beginBusy, endBusy, loadCachedBlob, toast, token],
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
    fetchS3Blob,
    downloadAll,
    resetDownloads,
  };
}
