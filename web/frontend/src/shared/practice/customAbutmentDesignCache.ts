// 치과 커스텀어벗 디자인 프리뷰 저장. 한 번 만든 디자인(픽스쳐 정합·형상·조정값·AI 대화)을
// 이 브라우저 IndexedDB에 두고, 모달을 다시 열면 스캔만 읽어 그대로 보여 준다.
// 키는 스캔 파일·치아 정보와 정합 버전이라, 스캔이나 의뢰 치아가 바뀌면 새로 만든다.
// 형상 버전만 바뀌면 저장된 정합(정렬 스캔·픽스쳐)으로 형상만 다시 만든다(치아당 ~0.3초).
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

import type { MatchedScanbodyFixture } from "@/shared/practice/customAbutmentScanbodyMatch";
import type { CustomAbutmentDesignParams } from "@/shared/practice/customAbutmentDesignParams";
import type { CustomAbutmentDesignMetrics } from "@/shared/practice/customAbutmentStlDesign";

/** 디자인 형상 로직이 바뀌면 올린다. 정합(교합·스캔바디)은 두고 형상만 다시 만든다. */
export const CUSTOM_ABUTMENT_DESIGN_VERSION = 18;
/** 교합 정렬·스캔바디 정합 로직이 바뀌면 올린다. 저장본 전체를 다시 만든다. */
export const CUSTOM_ABUTMENT_FIT_VERSION = 4;

const DB_NAME = "abuts-custom-abutment-design";
const STORE = "designs";
const DB_VERSION = 1;
const MAX_RECORDS = 30;

export type CustomAbutmentChatTurn = { role: "user" | "assistant"; text: string };

export type CachedCustomAbutmentTooth = {
  toothNumber: string;
  fileName: string;
  fixture: MatchedScanbodyFixture;
  overrides: Partial<CustomAbutmentDesignParams>;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
  localPositions: ArrayBuffer;
  crownLocalPositions: ArrayBuffer;
  marginLoopLocal: ArrayBuffer;
};

/** 바이트 정렬로 옮긴 스캔 정점. 다시 열 때 정렬을 건너뛴다. */
export type CachedAlignedScan = {
  fileName: string;
  role: "upper" | "lower";
  vertexCount: number;
  positions: ArrayBuffer;
};

export type CachedCustomAbutmentDesign = {
  key: string;
  /** 형상 버전. 다르면 `fixture`·조정값으로 형상만 다시 만든다. */
  version: number;
  fitVersion: number;
  savedAt: number;
  alignedScans: CachedAlignedScan[];
  teeth: CachedCustomAbutmentTooth[];
  chat: CustomAbutmentChatTurn[];
};

const isBrowser = typeof window !== "undefined" && !!window.indexedDB;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser) return Promise.reject(new Error("IndexedDB를 쓸 수 없습니다."));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
  return dbPromise;
}

export function customAbutmentDesignCacheKey(inputKey: string): string {
  return `f${CUSTOM_ABUTMENT_FIT_VERSION}:${inputKey}`;
}

export async function readCustomAbutmentDesign(
  key: string,
): Promise<(CachedCustomAbutmentDesign & { designFresh: boolean }) | null> {
  if (!isBrowser || !key) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const row = request.result as CachedCustomAbutmentDesign | undefined;
        if (!row || row.fitVersion !== CUSTOM_ABUTMENT_FIT_VERSION || !Array.isArray(row.teeth)) {
          resolve(null);
          return;
        }
        resolve({
          ...row,
          alignedScans: Array.isArray(row.alignedScans) ? row.alignedScans : [],
          chat: Array.isArray(row.chat) ? row.chat : [],
          designFresh: row.version === CUSTOM_ABUTMENT_DESIGN_VERSION,
        });
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/** 저장하고, 오래된 저장본은 MAX_RECORDS개만 남긴다. */
export async function writeCustomAbutmentDesign(record: CachedCustomAbutmentDesign): Promise<void> {
  if (!isBrowser || !record.key) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(record, record.key);
    const all = store.getAll();
    const keys = store.getAllKeys();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    let rows: CachedCustomAbutmentDesign[] | null = null;
    let ids: IDBValidKey[] | null = null;
    const prune = () => {
      if (!rows || !ids || rows.length <= MAX_RECORDS) return;
      const order = rows
        .map((row, i) => ({ key: ids![i]!, savedAt: Number(row?.savedAt) || 0 }))
        .sort((a, b) => a.savedAt - b.savedAt);
      for (const row of order.slice(0, rows.length - MAX_RECORDS)) store.delete(row.key);
    };
    all.onsuccess = () => {
      rows = all.result as CachedCustomAbutmentDesign[];
      prune();
    };
    keys.onsuccess = () => {
      ids = keys.result;
      prune();
    };
  });
}

export function toArrayBuffer(arr: Float32Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}
