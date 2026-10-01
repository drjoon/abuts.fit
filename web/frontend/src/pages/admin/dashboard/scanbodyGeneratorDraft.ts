// 어벗츠 스캔바디 생성기 초안. 만들기 전에 이 브라우저 IndexedDB에 둔다.
const DB_NAME = "abutsfit-scanbody-generator";
const STORE = "draft";
const KEY = "admin";
const VERSION = 1;

export type ScanbodyGeneratorDraft = {
  maker: string;
  diameters: string[];
  heights: string[];
  cells: Record<string, File>;
};

type StoredFile = {
  key: string;
  name: string;
  type: string;
  bytes: ArrayBuffer;
};

type StoredDraft = {
  maker: string;
  diameters: string[];
  heights: string[];
  files: StoredFile[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열지 못했습니다."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

export async function saveScanbodyGeneratorDraft(draft: ScanbodyGeneratorDraft): Promise<void> {
  const files: StoredFile[] = [];
  for (const [key, file] of Object.entries(draft.cells)) {
    files.push({
      key,
      name: file.name,
      type: file.type,
      bytes: await file.arrayBuffer(),
    });
  }
  const record: StoredDraft = {
    maker: draft.maker,
    diameters: draft.diameters,
    heights: draft.heights,
    files,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("초안을 저장하지 못했습니다."));
    tx.objectStore(STORE).put(record, KEY);
  });
}

export async function loadScanbodyGeneratorDraft(): Promise<ScanbodyGeneratorDraft | null> {
  const db = await openDb();
  const record = await new Promise<StoredDraft | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result as StoredDraft | undefined);
    request.onerror = () => reject(request.error ?? new Error("초안을 읽지 못했습니다."));
  });
  if (!record) return null;
  const cells: Record<string, File> = {};
  for (const file of record.files ?? []) {
    cells[file.key] = new File([file.bytes], file.name, { type: file.type || "application/octet-stream" });
  }
  return {
    maker: record.maker ?? "",
    diameters: record.diameters?.length ? record.diameters : ["", "", ""],
    heights: record.heights?.length ? record.heights : ["", "", ""],
    cells,
  };
}
