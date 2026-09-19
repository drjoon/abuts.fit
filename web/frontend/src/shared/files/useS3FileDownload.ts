// change-log:
// - 2026-09-20: downloadAsZip — 여러 S3 파일을 DEFLATE zip 하나로 저장.
// - 2026-09-10: DCM 다운로드 시 PLY(칼라) 클라이언트 변환 옵션.
// - 2026-08-16: IndexedDB(s3:key) 캐시 — 다운로드·프리뷰 공통.
// - 2026-08-16: fetchS3Blob — 프리뷰용 blob fetch(저장 없음).
// related files:
// - web/frontend/src/shared/files/downloadWithProgress.ts
// - web/frontend/src/shared/files/s3BlobCache.ts
// - web/frontend/src/shared/files/hpsDcmToPly.ts
// - web/frontend/src/shared/files/dcmDownloadFormat.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
import { useCallback, useRef, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { saveBlobAsDownload } from "@/shared/files/downloadWithProgress";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import {
  isDcmFileName,
  readDcmDownloadFormat,
  writeDcmDownloadFormat,
  type DcmDownloadFormat,
} from "@/shared/files/dcmDownloadFormat";
import {
  convertHpsDcmBufferToPlyBlob,
  replaceExtWithPly,
} from "@/shared/files/hpsDcmToPly";

export type S3DownloadTarget = {
  s3Key?: string;
  fileName?: string;
  busyKey?: string;
  /** DCM만: 원본 또는 PLY 변환. 생략 시 localStorage 선호. */
  dcmFormat?: DcmDownloadFormat;
};

export type ZipDownloadGroup = {
  /** zip 안 폴더. 비우면 루트. */
  folder?: string;
  files: S3DownloadTarget[];
};

function sanitizeZipSegment(name: string, fallback: string): string {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function uniqueZipEntryPath(
  used: Set<string>,
  folder: string,
  fileName: string,
): string {
  const safeFolder = folder ? sanitizeZipSegment(folder, "") : "";
  const base = sanitizeZipSegment(fileName, "file");
  const prefix = safeFolder ? `${safeFolder}/` : "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let candidate = `${prefix}${base}`;
  if (!used.has(candidate.toLowerCase())) {
    used.add(candidate.toLowerCase());
    return candidate;
  }
  let index = 2;
  while (used.has(`${prefix}${stem} (${index})${ext}`.toLowerCase())) {
    index += 1;
  }
  candidate = `${prefix}${stem} (${index})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function sanitizeZipArchiveName(name: string): string {
  const stem = sanitizeZipSegment(String(name || "").replace(/\.zip$/i, ""), "download");
  return `${stem}.zip`;
}

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
  const [downloadZipBusy, setDownloadZipBusy] = useState(false);
  const downloadZipBusyRef = useRef(false);
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
        const wantPly =
          isDcmFileName(fileName) &&
          (file.dcmFormat || readDcmDownloadFormat()) === "ply";
        if (wantPly) {
          writeDcmDownloadFormat("ply");
          const plyBlob = await convertHpsDcmBufferToPlyBlob(
            await blob.arrayBuffer(),
          );
          saveBlobAsDownload(plyBlob, replaceExtWithPly(fileName));
        } else {
          if (isDcmFileName(fileName) && file.dcmFormat === "dcm") {
            writeDcmDownloadFormat("dcm");
          }
          saveBlobAsDownload(blob, fileName);
        }
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

  const downloadAsZip = useCallback(
    async (opts: { groups: ZipDownloadGroup[]; zipFileName: string }) => {
      if (downloadZipBusyRef.current) return;
      const used = new Set<string>();
      const targets = (Array.isArray(opts.groups) ? opts.groups : []).flatMap(
        (group) => {
          const folder = String(group.folder || "").trim();
          return (Array.isArray(group.files) ? group.files : [])
            .map((file) => {
              const s3Key = String(file.s3Key || "").trim();
              const fileName =
                String(file.fileName || "file").trim() || "file";
              if (!s3Key) return null;
              return {
                s3Key,
                fileName,
                busyKey: String(file.busyKey || s3Key).trim(),
                zipPath: uniqueZipEntryPath(used, folder, fileName),
              };
            })
            .filter((row): row is NonNullable<typeof row> => Boolean(row));
        },
      );
      if (!targets.length) return;
      if (!token) {
        toast({
          title: "다운로드 실패",
          description: "로그인이 필요합니다.",
          variant: "destructive",
        });
        return;
      }

      downloadZipBusyRef.current = true;
      setDownloadZipBusy(true);
      try {
        const blobs = await Promise.all(
          targets.map(async (file) => {
            const blob = await loadCachedBlob(file);
            return { zipPath: file.zipPath, blob };
          }),
        );
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const item of blobs) {
          zip.file(item.zipPath, item.blob);
        }
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        saveBlobAsDownload(zipBlob, sanitizeZipArchiveName(opts.zipFileName));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        toast({
          title: "다운로드 실패",
          description:
            err instanceof Error
              ? err.message
              : "압축 다운로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        downloadZipBusyRef.current = false;
        setDownloadZipBusy(false);
      }
    },
    [loadCachedBlob, toast, token],
  );

  const resetDownloads = useCallback(() => {
    downloadingKeysRef.current.clear();
    downloadZipBusyRef.current = false;
    setDownloadingKeys([]);
    setDownloadProgressByKey({});
    setDownloadAllBusy(false);
    setDownloadZipBusy(false);
  }, []);

  return {
    downloadingKeys,
    downloadProgressByKey,
    downloadAllBusy,
    downloadZipBusy,
    downloadS3File,
    fetchS3Blob,
    downloadAll,
    downloadAsZip,
    resetDownloads,
  };
}
