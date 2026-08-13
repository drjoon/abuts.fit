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
// - 2026-08-13: 제출 시 캐시된 결과는 재사용·진행 중이면 대기만. 진행률 0%로 되돌리지 않음.
// - 2026-08-13: 기공의뢰↔어벗생산의뢰 이동 시 공유 캐시·세션 저장으로 S3/메타 재업로드 생략.
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

type PersistedDone = {
  savedAt: number;
  result: TempUploadedFile;
};

type Options = {
  token?: string | null;
};

const PREUPLOAD_CACHE_STORAGE_KEY = "abutsfit:file-preupload-cache:v1";
const PREUPLOAD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const sharedCache = new Map<string, CacheEntry>();
let persistedLoaded = false;

const isUsableUploadedFile = (value: unknown): value is TempUploadedFile => {
  if (!value || typeof value !== "object") return false;
  const row = value as TempUploadedFile;
  return Boolean(String(row._id || "").trim() && String(row.key || "").trim());
};

const normalizeUploadedFile = (
  value: Partial<TempUploadedFile> | null | undefined,
): TempUploadedFile | null => {
  if (!value) return null;
  const result: TempUploadedFile = {
    _id: String(value._id || "").trim(),
    originalName: String(value.originalName || "").trim(),
    mimetype: String(value.mimetype || "").trim(),
    size: Number(value.size || 0),
    fileType: value.fileType,
    location: value.location,
    key: String(value.key || "").trim(),
  };
  return isUsableUploadedFile(result) ? result : null;
};

const loadPersistedDone = () => {
  if (persistedLoaded) return;
  persistedLoaded = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(PREUPLOAD_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, PersistedDone>;
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || now - Number(value.savedAt || 0) > PREUPLOAD_CACHE_TTL_MS) {
        continue;
      }
      const result = normalizeUploadedFile(value.result);
      if (!result) continue;
      sharedCache.set(key, { status: "done", result });
    }
  } catch {
    // ignore
  }
};

const persistDone = (key: string, result: TempUploadedFile) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(PREUPLOAD_CACHE_STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, PersistedDone>)
      : {};
    if (!parsed || typeof parsed !== "object") return;
    parsed[key] = { savedAt: Date.now(), result };
    window.sessionStorage.setItem(
      PREUPLOAD_CACHE_STORAGE_KEY,
      JSON.stringify(parsed),
    );
  } catch {
    // quota / private mode
  }
};

const unpersistKey = (key: string) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(PREUPLOAD_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, PersistedDone>;
    if (!parsed || typeof parsed !== "object" || !(key in parsed)) return;
    delete parsed[key];
    window.sessionStorage.setItem(
      PREUPLOAD_CACHE_STORAGE_KEY,
      JSON.stringify(parsed),
    );
  } catch {
    // ignore
  }
};

const rememberDoneInSharedCache = (
  key: string,
  raw: Partial<TempUploadedFile>,
) => {
  loadPersistedDone();
  const result = normalizeUploadedFile(raw);
  if (!result) return false;
  sharedCache.set(key, { status: "done", result });
  persistDone(key, result);
  return true;
};

/**
 * 첨부 직후 백그라운드 사전 업로드 (기공의뢰·생산의뢰 공통).
 * 제출 시에는 이미 올라간 결과는 재사용하고, 남은 파일만 이어서 올린다.
 * 캐시는 페이지 인스턴스와 무관하게 공유한다(기공의뢰↔어벗생산의뢰 포워딩).
 */
export function useFilePreUpload(options: Options) {
  const { token } = options;
  const { uploadFiles } = useS3TempUpload({ token });
  loadPersistedDone();
  const cacheRef = useRef(sharedCache);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [uploadProgress, setUploadProgress] = useState<
    Record<string, PreUploadFileProgress>
  >({});
  const uploadProgressRef = useRef(uploadProgress);
  uploadProgressRef.current = uploadProgress;

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
    unpersistKey(key);
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
    for (const [key, entry] of [...cacheRef.current.entries()]) {
      if (entry.status !== "done") {
        cacheRef.current.delete(key);
      }
    }
    setUploadProgress({});
  }, []);

  const rememberUploadedFile = useCallback(
    (file: File, raw: Partial<TempUploadedFile>) => {
      const key = toTempUploadFileKey(file);
      if (!rememberDoneInSharedCache(key, raw)) return;
      patchProgress({ [key]: { percent: 100, status: "done" } });
    },
    [patchProgress],
  );

  const peekCachedUploadedFiles = useCallback(
    (files: File[]): TempUploadedFile[] | null => {
      if (!files.length) return [];
      const results: TempUploadedFile[] = [];
      for (const file of files) {
        const entry = cacheRef.current.get(toTempUploadFileKey(file));
        if (entry?.status !== "done") return null;
        results.push(entry.result);
      }
      return results;
    },
    [],
  );

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

      const cached = peekCachedUploadedFiles(files);
      if (cached) return cached;

      const results = new Array<TempUploadedFile>(files.length);
      const pendingIndexes: number[] = [];
      const uploadingWaits: Promise<void>[] = [];
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

      const knownPercent = (key: string) => {
        const prev = uploadProgressRef.current[key]?.percent;
        if (typeof prev === "number" && Number.isFinite(prev)) {
          return Math.max(0, Math.min(100, Math.round(prev)));
        }
        return undefined;
      };

      for (let i = 0; i < files.length; i += 1) {
        const key = toTempUploadFileKey(files[i]);
        const entry = cacheRef.current.get(key);
        if (entry?.status === "done") {
          results[i] = entry.result;
          progressMap[key] = 100;
          continue;
        }
        if (entry?.status === "uploading") {
          progressMap[key] = knownPercent(key) ?? 1;
          uploadingWaits.push(
            entry.promise
              .then((row) => {
                results[i] = row;
                progressMap[key] = 100;
                emit();
              })
              .catch(() => {
                pendingIndexes.push(i);
                progressMap[key] = knownPercent(key) ?? progressMap[key] ?? 0;
              }),
          );
          continue;
        }
        pendingIndexes.push(i);
        progressMap[key] = knownPercent(key) ?? 0;
      }

      emit();

      if (uploadingWaits.length > 0) {
        await Promise.all(uploadingWaits);
      }

      const uniquePending = Array.from(new Set(pendingIndexes));
      if (uniquePending.length > 0) {
        const pendingFiles = uniquePending.map((idx) => files[idx]);
        const batchPromise = uploadFiles(pendingFiles, (perFile) => {
          Object.assign(progressMap, perFile);
          emit();
        });

        uniquePending.forEach((fileIndex, batchIndex) => {
          const file = files[fileIndex];
          const key = toTempUploadFileKey(file);
          const promise = batchPromise.then((uploaded) => {
            const row = uploaded[batchIndex];
            if (!row) {
              throw new Error("업로드 결과가 없습니다.");
            }
            rememberDoneInSharedCache(key, row);
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
        uniquePending.forEach((fileIndex, batchIndex) => {
          const row = uploaded[batchIndex];
          if (!row) {
            throw new Error("업로드 결과가 없습니다.");
          }
          results[fileIndex] = row;
          const key = toTempUploadFileKey(files[fileIndex]);
          progressMap[key] = 100;
          rememberDoneInSharedCache(key, row);
        });
        emit();
      }

      return results;
    },
    [patchProgress, peekCachedUploadedFiles, uploadFiles],
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
    peekCachedUploadedFiles,
    preUploadFiles,
    forgetFile,
    forgetFileKey,
    clearPreUploadCache,
    rememberUploadedFile,
    uploadProgress,
  };
}

/** @deprecated use useFilePreUpload */
export const usePracticeFilePreUpload = useFilePreUpload;
