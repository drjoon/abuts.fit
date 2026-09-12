// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
// - web/frontend/src/shared/files/s3BlobCache.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// IndexedDB 기반 바이너리 파일 Blob 캐시 유틸리티
// key: fileId 또는 s3Key
// change-log:
// - 2026-09-13: 용량 상한 ~10GB + updatedAt LRU(오래된 것부터 삭제). 조회 시 touch. QuotaExceeded 재시도.
// - 2026-09-13: 용량 상한 2GB→10GB.
// - 2026-08-29: NC만 바뀔 때 stl:{id}:* 폴백을 지우지 않음 — camS3Key 있을 때만 filled STL 폴백 무효화.
// - 2026-08-18: filled STL/NC 재생성 시 s3Key·버전 키·cnc:s3 접두 캐시를 함께 삭제.

const DB_NAME = "abutsfit-file-blob-cache";
const DB_VERSION = 2;
const STORE_NAME = "fileBlobs";

/** 이 앱 파일 캐시에 쓸 로컬 디스크 상한(약 10GB). 초과 시 오래된(updatedAt) 항목부터 삭제. */
export const FILE_BLOB_CACHE_MAX_BYTES = 10 * 1024 * 1024 * 1024;

export type FileBlobRecord = {
  key: string;
  updatedAt: number;
  blob: Blob;
  /** 기록 시점 size(바이트). 없으면 blob.size 사용 */
  byteSize?: number;
};

const isBrowser = typeof window !== "undefined" && !!window.indexedDB;

function openDb(): Promise<IDBDatabase | null> {
  if (!isBrowser) return Promise.resolve<IDBDatabase | null>(null);

  return new Promise<IDBDatabase | null>(
    (resolve: (value: IDBDatabase | null) => void) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        let store: IDBObjectStore;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        } else {
          const tx = request.transaction;
          store = tx
            ? tx.objectStore(STORE_NAME)
            : db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }

        if (!store.indexNames.contains("byUpdatedAt")) {
          store.createIndex("byUpdatedAt", "updatedAt");
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn("IndexedDB open error", request.error);
        resolve(null);
      };
    },
  );
}

function recordByteSize(rec: FileBlobRecord | undefined | null): number {
  if (!rec) return 0;
  const stored = Number(rec.byteSize);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const fromBlob = Number(rec.blob?.size);
  return Number.isFinite(fromBlob) && fromBlob >= 0 ? fromBlob : 0;
}

/**
 * Storage API로 남은 여유를 보고 실질 상한을 줄인다.
 * (오리진 전체 quota가 2GB보다 작으면 캐시도 그에 맞춤)
 */
async function resolveCacheByteBudget(): Promise<number> {
  let budget = FILE_BLOB_CACHE_MAX_BYTES;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const quota = Number(est?.quota || 0);
      // 오리진 전체 quota가 10GB보다 작으면(사파리 등) 캐시 상한도 맞춤
      if (quota > 0) {
        budget = Math.min(budget, Math.max(64 * 1024 * 1024, quota));
      }
    }
  } catch {
    // estimate 실패 시 10GB hard cap
  }
  return budget;
}

/**
 * 총 용량이 budget을 넘으면 updatedAt 오름차순(오래된 것)부터 삭제.
 * targetBytes 미만이 될 때까지(새 put 자리 확보용 headroom 포함).
 */
async function cleanupByByteBudget(
  db: IDBDatabase,
  opts?: { headroomBytes?: number },
): Promise<void> {
  const headroom = Math.max(0, Number(opts?.headroomBytes || 0));
  const budget = await resolveCacheByteBudget();
  const target = Math.max(0, budget - headroom);

  return new Promise<void>((resolve: () => void) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as FileBlobRecord[]) || [];
        records.sort((a, b) => a.updatedAt - b.updatedAt);

        let total = 0;
        for (const rec of records) total += recordByteSize(rec);

        if (total <= target) {
          resolve();
          return;
        }

        const toDeleteKeys: string[] = [];
        for (const rec of records) {
          if (total <= target) break;
          toDeleteKeys.push(rec.key);
          total -= recordByteSize(rec);
        }

        if (toDeleteKeys.length === 0) {
          resolve();
          return;
        }

        for (const key of toDeleteKeys) {
          store.delete(key);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };

      req.onerror = () => {
        console.warn("IndexedDB cleanupByByteBudget error", req.error);
        resolve();
      };
    } catch (e) {
      console.warn("IndexedDB cleanupByByteBudget exception", e);
      resolve();
    }
  });
}

/** @deprecated 이름 유지 — 내부는 용량 LRU */
async function cleanupOldEntries(db: IDBDatabase): Promise<void> {
  return cleanupByByteBudget(db);
}

// STL 중심 코드와의 호환을 위한 래핑 함수 (실제 동작은 일반 파일 Blob 캐시와 동일)
export async function getStlBlob(key: string): Promise<Blob | null> {
  return getFileBlob(key);
}

export async function setStlBlob(key: string, blob: Blob): Promise<void> {
  return setFileBlob(key, blob);
}

export async function getFileBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise<Blob | null>((resolve: (value: Blob | null) => void) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const record = req.result as FileBlobRecord | undefined;
        const blob = record?.blob ?? null;
        resolve(blob);
        // LRU touch — 히트 시 updatedAt 갱신(별도 트랜잭션)
        if (record?.key && blob) {
          void touchFileBlobAccess(db, record).catch(() => undefined);
        }
      };
      req.onerror = () => {
        console.warn("IndexedDB getFileBlob error", req.error);
        resolve(null);
      };
    } catch (e) {
      console.warn("IndexedDB getFileBlob exception", e);
      resolve(null);
    }
  });
}

async function touchFileBlobAccess(
  db: IDBDatabase,
  record: FileBlobRecord,
): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        ...record,
        byteSize: recordByteSize(record),
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22
  );
}

async function putFileBlobRecord(
  db: IDBDatabase,
  record: FileBlobRecord,
): Promise<"ok" | "quota" | "error"> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: "ok" | "quota" | "error") => {
      if (settled) return;
      settled = true;
      resolve(status);
    };
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      tx.oncomplete = () => finish("ok");
      tx.onerror = () => {
        if (isQuotaExceededError(tx.error)) finish("quota");
        else {
          console.warn("IndexedDB setFileBlob tx error", tx.error);
          finish("error");
        }
      };
      req.onerror = () => {
        if (isQuotaExceededError(req.error)) finish("quota");
        else {
          console.warn("IndexedDB setFileBlob error", req.error);
          finish("error");
        }
      };
    } catch (e) {
      if (isQuotaExceededError(e)) finish("quota");
      else {
        console.warn("IndexedDB setFileBlob exception", e);
        finish("error");
      }
    }
  });
}

export async function setFileBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;

  const byteSize = Number(blob?.size || 0);
  const record: FileBlobRecord = {
    key,
    blob,
    byteSize,
    updatedAt: Date.now(),
  };

  // 쓰기 전 headroom 확보(새 blob 크기만큼)
  await cleanupByByteBudget(db, { headroomBytes: byteSize });

  let result = await putFileBlobRecord(db, record);
  if (result === "quota") {
    // 브라우저 전체 quota — 더 공격적으로 비우고 1회 재시도
    await cleanupByByteBudget(db, {
      headroomBytes: Math.max(byteSize, 64 * 1024 * 1024),
    });
    result = await putFileBlobRecord(db, record);
  }

  if (result === "ok") {
    await cleanupByByteBudget(db);
  }
}

// 특정 키의 캐시 삭제
export async function deleteFileBlob(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise<void>((resolve: () => void) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => {
        console.warn("IndexedDB deleteFileBlob error", req.error);
        resolve();
      };
    } catch (e) {
      console.warn("IndexedDB deleteFileBlob exception", e);
      resolve();
    }
  });
}

// CNC 프로그램 캐시 무효화 (s3Key 기반)
export async function deleteCncProgramCache(s3Key: string): Promise<void> {
  if (!s3Key) return;
  await deleteFileBlobsMatchingS3Key(s3Key);
}

export async function deleteFileBlobsMatchingS3Key(s3Key: string): Promise<void> {
  const needle = String(s3Key || "").trim();
  if (!needle) return;
  await deleteFileBlobsWhere((key) => {
    return (
      key === needle ||
      key.startsWith(`${needle}:v=`) ||
      key === `cnc:s3:${needle}` ||
      key.startsWith(`cnc:s3:${needle}:`)
    );
  });
}

export async function deleteFileBlobsMatchingPrefix(
  prefix: string,
): Promise<void> {
  const needle = String(prefix || "").trim();
  if (!needle) return;
  await deleteFileBlobsWhere(
    (key) => key === needle || key.startsWith(`${needle}:`) || key.startsWith(needle),
  );
}

export async function invalidateRequestPreviewCaches(opts: {
  camS3Key?: string | null;
  ncS3Key?: string | null;
  requestMongoId?: string | null;
  requestId?: string | null;
}): Promise<void> {
  const jobs: Promise<void>[] = [];
  const camS3Key = String(opts.camS3Key || "").trim();
  const ncS3Key = String(opts.ncS3Key || "").trim();
  if (camS3Key) jobs.push(deleteFileBlobsMatchingS3Key(camS3Key));
  if (ncS3Key && ncS3Key !== camS3Key) {
    jobs.push(deleteFileBlobsMatchingS3Key(ncS3Key));
  }
  // stl:{id}:cam 폴백은 filled STL이 바뀔 때만 지운다(NC-only 재생성에서 STL 재다운로드 방지).
  // 원본 STL은 재생성 대상이 아니므로 여기서 지우지 않는다.
  if (camS3Key) {
    const ids = [opts.requestMongoId, opts.requestId]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const uniqueIds = Array.from(new Set(ids));
    for (const id of uniqueIds) {
      jobs.push(deleteFileBlobsMatchingPrefix(`stl:${id}:cam`));
    }
  }
  if (!jobs.length) return;
  await Promise.all(jobs);
}

async function deleteFileBlobsWhere(
  match: (key: string) => boolean,
): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise<void>((resolve: () => void) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = (req.result as FileBlobRecord[]) || [];
        const toDelete = records
          .map((record) => String(record?.key || ""))
          .filter((key) => key && match(key));

        if (toDelete.length === 0) {
          resolve();
          return;
        }

        for (const key of toDelete) {
          store.delete(key);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };

      req.onerror = () => {
        console.warn("IndexedDB deleteFileBlobsWhere error", req.error);
        resolve();
      };
    } catch (e) {
      console.warn("IndexedDB deleteFileBlobsWhere exception", e);
      resolve();
    }
  });
}

// 모든 CNC 캐시 무효화 (cnc:s3: 프리픽스)
export async function invalidateAllCncCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise<void>((resolve: () => void) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = (req.result as FileBlobRecord[]) || [];
        const cncKeys = records
          .filter((r) => r.key.startsWith("cnc:s3:"))
          .map((r) => r.key);

        if (cncKeys.length === 0) {
          resolve();
          return;
        }

        for (const key of cncKeys) {
          store.delete(key);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };

      req.onerror = () => {
        console.warn("IndexedDB invalidateAllCncCache error", req.error);
        resolve();
      };
    } catch (e) {
      console.warn("IndexedDB invalidateAllCncCache exception", e);
      resolve();
    }
  });
}
