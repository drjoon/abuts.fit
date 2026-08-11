// related files:
// - web/frontend/src/shared/hooks/useS3TempUpload.ts
// - web/frontend/src/shared/hooks/useUploadWithProgressToast.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestPage.ts
// - web/frontend/rules.md
import { useCallback, useEffect, useRef } from "react";
import {
  TempUploadedFile,
  useS3TempUpload,
} from "@/shared/hooks/useS3TempUpload";

/** 사전 업로드 캐시 키 (동일 File 객체 재사용·재시도용) */
export const toTempUploadFileKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`;

/** @deprecated use toTempUploadFileKey */
export const toPracticeUploadFileKey = toTempUploadFileKey;

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

  const forgetFileKey = useCallback((key: string) => {
    cacheRef.current.delete(key);
  }, []);

  const forgetFile = useCallback(
    (file: File) => {
      forgetFileKey(toTempUploadFileKey(file));
    },
    [forgetFileKey],
  );

  const clearPreUploadCache = useCallback(() => {
    cacheRef.current.clear();
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

      for (const file of files) {
        progressMap[`${file.name}:${file.size}`] = 0;
      }

      for (let i = 0; i < files.length; i += 1) {
        const key = toTempUploadFileKey(files[i]);
        const progressKey = `${files[i].name}:${files[i].size}`;
        const entry = cacheRef.current.get(key);
        if (entry?.status === "done") {
          results[i] = entry.result;
          progressMap[progressKey] = 100;
          continue;
        }
        if (entry?.status === "uploading") {
          try {
            results[i] = await entry.promise;
            progressMap[progressKey] = 100;
            onProgress?.({ ...progressMap });
            continue;
          } catch {
            // fall through to re-upload
          }
        }
        pendingIndexes.push(i);
      }

      onProgress?.({ ...progressMap });

      if (pendingIndexes.length > 0) {
        const pendingFiles = pendingIndexes.map((idx) => files[idx]);
        const batchPromise = uploadFiles(pendingFiles, (perFile) => {
          Object.assign(progressMap, perFile);
          onProgress?.({ ...progressMap });
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
          });
        });

        const uploaded = await batchPromise;
        pendingIndexes.forEach((fileIndex, batchIndex) => {
          const row = uploaded[batchIndex];
          if (!row) {
            throw new Error("업로드 결과가 없습니다.");
          }
          results[fileIndex] = row;
          const progressKey = `${files[fileIndex].name}:${files[fileIndex].size}`;
          progressMap[progressKey] = 100;
          cacheRef.current.set(toTempUploadFileKey(files[fileIndex]), {
            status: "done",
            result: row,
          });
        });
        onProgress?.({ ...progressMap });
      }

      return results;
    },
    [uploadFiles],
  );

  const preUploadFiles = useCallback(
    (files: File[]) => {
      const currentToken = String(tokenRef.current || "").trim();
      if (!currentToken || !files.length) return;

      const need = files.filter((file) => {
        const entry = cacheRef.current.get(toTempUploadFileKey(file));
        return !entry || entry.status === "error";
      });
      if (!need.length) return;

      void ensureFilesUploaded(need).catch(() => {
        // 제출 시 재시도. 백그라운드 실패는 토스트로 막지 않음.
      });
    },
    [ensureFilesUploaded],
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
  };
}

/** @deprecated use useFilePreUpload */
export const usePracticeFilePreUpload = useFilePreUpload;
