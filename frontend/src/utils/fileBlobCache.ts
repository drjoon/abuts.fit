// IndexedDB 기반 바이너리 파일 Blob 캐시 유틸리티
// key: fileId 또는 s3Key

const DB_NAME = "abutsfit-file-blob-cache";
const DB_VERSION = 2;
const STORE_NAME = "fileBlobs";

export type FileBlobRecord = {
  key: string;
  updatedAt: number;
  blob: Blob;
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
    }
  );
}

// GC 정책 상수: 최대 200개, 7일 초과 항목 삭제
const MAX_ENTRIES = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function cleanupOldEntries(db: IDBDatabase): Promise<void> {
  return new Promise<void>((resolve: () => void) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as FileBlobRecord[]) || [];
        const now = Date.now();

        // 오래된 항목 + 개수 초과 항목 삭제 대상 계산
        records.sort((a, b) => a.updatedAt - b.updatedAt);

        const toDeleteKeys: string[] = [];

        for (const rec of records) {
          if (now - rec.updatedAt > MAX_AGE_MS) {
            toDeleteKeys.push(rec.key);
          }
        }

        if (records.length - toDeleteKeys.length > MAX_ENTRIES) {
          const remaining = records.filter(
            (r) => !toDeleteKeys.includes(r.key)
          );
          const overflow = remaining.length - MAX_ENTRIES;
          if (overflow > 0) {
            for (let i = 0; i < overflow; i++) {
              toDeleteKeys.push(remaining[i].key);
            }
          }
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
        console.warn("IndexedDB cleanupOldEntries error", req.error);
        resolve();
      };
    } catch (e) {
      console.warn("IndexedDB cleanupOldEntries exception", e);
      resolve();
    }
  });
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
        resolve(record?.blob ?? null);
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

export async function setFileBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise<void>((resolve: () => void) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record: FileBlobRecord = {
        key,
        blob,
        updatedAt: Date.now(),
      };
      const req = store.put(record);

      req.onsuccess = () => {
        // GC는 별도의 트랜잭션에서 비동기적으로 수행
        cleanupOldEntries(db).finally(() => resolve());
      };
      req.onerror = () => {
        console.warn("IndexedDB setFileBlob error", req.error);
        resolve();
      };
    } catch (e) {
      console.warn("IndexedDB setFileBlob exception", e);
      resolve();
    }
  });
}
