// related files:
// - web/frontend/src/shared/hooks/useS3TempUpload.ts
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/hooks/useUploadWithProgressToast.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestPage.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
// - web/frontend/rules.md
// - 2026-08-13: uploadProgress 상태 노출(파일카드 프로그레스바). 진행키=toTempUploadFileKey.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TempUploadedFile,
  useS3TempUpload,
} from "@/shared/hooks/useS3TempUpload";

/** 사전 업로드 캐시 키 (동일 File 객체 재사용·재시도용) */
export const toTempUploadFileKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`;

/** @deprecated use toTempUploadFileKey */
export const toPracticeUploadFileKey = toTempUploadFileKey;

export type PreUploadFileStatus = "uploading" | "done" | "error";

export type PreUploadFileProgress = {
  percent: number;
  status: PreUploadFileStatus;
};

type CacheEntry =
  | { status: "uploading"; promise: Promise<TempUploadedFile> }
  | { status: "done"; result: TempUploadedFile }
  | { status: "error"; error: Error };

type Options = {
  token?: string | null;
};

/**
 * 첨부 직후 백그라운드 사전 업로드 (기공의뢰·생산의뢰 공통).
 * 제출 시에는 이미 올라간 결과는 재사용하고, 남은 파일만 이어서 올린다.
 */
export function useFilePreUpload(options: Options) {
  const { token } = options;
  const { uploadFiles } = useS3TempUpload({ token });
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [uploadProgress, setUploadProgress] = useState<
    Record<string, PreUploadFileProgress>
  >({});

  const patchProgress = useCallback(
    (updates: Record<string, PreUploadFileProgress>) => {
      setUploadProgress((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [key, value] of Object.entries(updates)) {
          const cur = next[key];
          if (!cur || cur.percent !== value.percent || cur.status !== value.status) {
            next[key] = value;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [],
  );

  const forgetFileKey = useCallback((key: string) => {
    cacheRef.current.delete(key);
    setUploadProgress((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const forgetFile = useCallback(
    (file: File) => {
      forgetFileKey(toTempUploadFileKey(file));
    },
    [forgetFileKey],
  );

  const clearPreUploadCache = useCallback(() => {
    cacheRef.current.clear();
    setUploadProgress({});
  }, []);

  const ensureFilesUploaded = useCallback(
    async (
      files: File[],
      onProgress?: (progress: Record<string, number>) => void,
    ): Promise<TempUploadedFile[]> => {
      if (!files.length) return [];
      const currentToken = String(tokenRef.current || "").trim();
      if (!currentToken) {
        throw new Error("로그인이 필요합니다.");
      }

      const results = new Array<TempUploadedFile>(files.length);
      const pendingIndexes: number[] = [];
      const progressMap: Record<string, number> = {};
      const statusUpdates: Record<string, PreUploadFileProgress> = {};

      const emit = () => {
        const nextStatus: Record<string, PreUploadFileProgress> = {
          ...statusUpdates,
        };
        for (const [key, percent] of Object.entries(progressMap)) {
          const clamped = Math.max(0, Math.min(100, Math.round(percent)));
          nextStatus[key] = {
            percent: clamped,
            status:
              statusUpdates[key]?.status === "error"
                ? "error"
                : clamped >= 100
                  ? "done"
                  : "uploading",
          };
        }
        patchProgress(nextStatus);
        onProgress?.({ ...progressMap });
      };

      for (const file of files) {
        progressMap[toTempUploadFileKey(file)] = 0;
      }

      for (let i = 0; i < files.length; i += 1) {
        const key = toTempUploadFileKey(files[i]);
        const entry = cacheRef.current.get(key);
        if (entry?.status === "done") {
          results[i] = entry.result;
          progressMap[key] = 100;
          continue;
        }
        if (entry?.status === "uploading") {
          try {
            results[i] = await entry.promise;
            progressMap[key] = 100;
            emit();
            continue;
          } catch {
            // fall through to re-upload
          }
        }
        pendingIndexes.push(i);
      }

      emit();

      if (pendingIndexes.length > 0) {
        const pendingFiles = pendingIndexes.map((idx) => files[idx]);
        const batchPromise = uploadFiles(pendingFiles, (perFile) => {
          Object.assign(progressMap, perFile);
          emit();
        });

        pendingIndexes.forEach((fileIndex, batchIndex) => {
          const file = files[fileIndex];
          const key = toTempUploadFileKey(file);
          const promise = batchPromise.then((uploaded) => {
            const row = uploaded[batchIndex];
            if (!row) {
              throw new Error("업로드 결과가 없습니다.");
            }
            cacheRef.current.set(key, { status: "done", result: row });
            return row;
          });
          cacheRef.current.set(key, { status: "uploading", promise });
          promise.catch((err) => {
            const error =
              err instanceof Error ? err : new Error(String(err || "upload failed"));
            cacheRef.current.set(key, { status: "error", error });
            statusUpdates[key] = {
              percent: progressMap[key] ?? 0,
              status: "error",
            };
            patchProgress({ [key]: statusUpdates[key] });
          });
        });

        const uploaded = await batchPromise;
        pendingIndexes.forEach((fileIndex, batchIndex) => {
          const row = uploaded[batchIndex];
          if (!row) {
            throw new Error("업로드 결과가 없습니다.");
          }
          results[fileIndex] = row;
          const key = toTempUploadFileKey(files[fileIndex]);
          progressMap[key] = 100;
          cacheRef.current.set(key, {
            status: "done",
            result: row,
          });
        });
        emit();
      }

      return results;
    },
    [patchProgress, uploadFiles],
  );

  const preUploadFiles = useCallback(
    (files: File[]) => {
      const currentToken = String(tokenRef.current || "").trim();
      if (!currentToken || !files.length) return;

      const doneUpdates: Record<string, PreUploadFileProgress> = {};
      const need = files.filter((file) => {
        const key = toTempUploadFileKey(file);
        const entry = cacheRef.current.get(key);
        if (entry?.status === "done") {
          doneUpdates[key] = { percent: 100, status: "done" };
          return false;
        }
        return !entry || entry.status === "error";
      });
      if (Object.keys(doneUpdates).length) {
        patchProgress(doneUpdates);
      }
      if (!need.length) return;

      void ensureFilesUploaded(need).catch(() => {
        // 제출 시 재시도. 백그라운드 실패는 토스트로 막지 않음.
      });
    },
    [ensureFilesUploaded, patchProgress],
  );

  // 로그인 직후 이미 첨부된 파일을 올리기 위해 토큰 변화는 호출측에서 preUploadFiles로 처리.
  useEffect(() => {
    if (!token) return;
  }, [token]);

  return {
    ensureFilesUploaded,
    preUploadFiles,
    forgetFile,
    forgetFileKey,
    clearPreUploadCache,
    uploadProgress,
  };
}

/** @deprecated use useFilePreUpload */
export const usePracticeFilePreUpload = useFilePreUpload;
