// change-log:
// - 2026-09-27: 로컬 헬퍼 폐기 — 3Shape·exocad 모두 인자로 주문을 등록할 수 없다.
//   작업열기·다운로드는 브라우저만으로 작업 폴더 안 케이스 폴더에 모든 파일을 저장한다.
//   Chrome·Edge: 폴더 핸들(IndexedDB)에 직접 쓰기. Firefox·Safari: 케이스 폴더 이름의 zip.
// related files:
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/LabWorkFolderDialog.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { toKstYmd } from "@/shared/date/kst";

const DB_NAME = "abuts-lab-work-folder";
const STORE = "handles";
const HANDLE_KEY = "workFolder";
const PICKER_ID = "abuts-work-folder";

type PermissionMode = { mode: "readwrite" };
type PermissionedHandle = FileSystemDirectoryHandle & {
  queryPermission?: (opts: PermissionMode) => Promise<PermissionState>;
  requestPermission?: (opts: PermissionMode) => Promise<PermissionState>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (opts?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle | string;
  }) => Promise<FileSystemDirectoryHandle>;
};

/** 브라우저가 PC 폴더에 직접 쓸 수 있는지(Chrome·Edge). 아니면 zip으로 받는다. */
export function supportsLabWorkFolder(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext === false) return false;
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRun<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function readLabWorkFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsLabWorkFolder()) return null;
  try {
    const handle = await idbRun<unknown>("readonly", (s) => s.get(HANDLE_KEY));
    return handle && typeof handle === "object"
      ? (handle as FileSystemDirectoryHandle)
      : null;
  } catch {
    return null;
  }
}

async function writeLabWorkFolderHandle(handle: FileSystemDirectoryHandle | null) {
  try {
    await idbRun("readwrite", (s) =>
      handle ? s.put(handle, HANDLE_KEY) : s.delete(HANDLE_KEY),
    );
  } catch {
    // ignore
  }
}

export function clearLabWorkFolderHandle(): Promise<void> {
  return writeLabWorkFolderHandle(null);
}

/**
 * 저장한 작업 폴더의 쓰기 권한. 브라우저를 다시 열면 「허용」을 한 번 더 묻는다.
 * requestPermission은 클릭 직후(사용자 동작 안)에 불러야 한다.
 */
export async function ensureLabWorkFolderPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const h = handle as PermissionedHandle;
  const opts: PermissionMode = { mode: "readwrite" };
  try {
    if ((await h.queryPermission?.(opts)) === "granted") return true;
    return (await h.requestPermission?.(opts)) === "granted";
  } catch {
    return false;
  }
}

/** PC 폴더 고르기 창. 취소면 null. 고르면 다음부터 이 폴더에 저장한다. */
export async function pickLabWorkFolder(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  const current = await readLabWorkFolderHandle();
  try {
    const handle = await picker({
      id: PICKER_ID,
      mode: "readwrite",
      ...(current ? { startIn: current } : {}),
    });
    await writeLabWorkFolderHandle(handle);
    return handle;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return null;
    throw err;
  }
}

export type LabCaseFile = {
  fileName: string;
  blob: Blob;
};

function sanitizeFolderSegment(value: string): string {
  return String(value || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
}

function uniqueFileName(used: Set<string>, fileName: string): string {
  const base = sanitizeFolderSegment(fileName) || "file";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let candidate = base;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem} (${index})${ext}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** 같은 이름이 겹치면 「이름 (2).ext」로 나눈다. 이름은 Windows 연결 프로그램과 같은 규칙으로 정리. */
export function dedupeLabCaseFiles<T extends { fileName: string }>(files: T[]): T[] {
  const used = new Set<string>();
  return files.map((file) => ({ ...file, fileName: uniqueFileName(used, file.fileName) }));
}

export function labCaseFolderSegment(caseFolder: string): string {
  return sanitizeFolderSegment(caseFolder) || "케이스";
}

export function labCaseFolderLabel(root: FileSystemDirectoryHandle, caseFolder: string): string {
  return `${root.name}/${labCaseFolderSegment(caseFolder)}`;
}

/** 작업 폴더 자체가 지워졌거나 옮겨졌으면 NotFoundError를 던진다. */
async function assertLabWorkFolderExists(root: FileSystemDirectoryHandle): Promise<void> {
  const iterable = root as unknown as { keys: () => AsyncIterator<string> };
  await iterable.keys().next();
}

/**
 * 케이스 폴더에 없거나 크기가 다른 파일 이름. size 0은 이름만 본다.
 * 작업 폴더가 사라졌으면 NotFoundError.
 */
export async function findMissingInLabCaseFolder(opts: {
  root: FileSystemDirectoryHandle;
  caseFolder: string;
  files: Array<{ fileName: string; size: number }>;
}): Promise<string[]> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await opts.root.getDirectoryHandle(labCaseFolderSegment(opts.caseFolder));
  } catch (err) {
    if ((err as { name?: string })?.name !== "NotFoundError") throw err;
    await assertLabWorkFolderExists(opts.root);
    return opts.files.map((f) => f.fileName);
  }
  const missing: string[] = [];
  await Promise.all(
    opts.files.map(async (file) => {
      try {
        const existing = await (await dir.getFileHandle(file.fileName)).getFile();
        if (file.size > 0 && existing.size !== file.size) missing.push(file.fileName);
      } catch {
        missing.push(file.fileName);
      }
    }),
  );
  return missing;
}

/** 케이스 폴더에 파일 하나를 쓴다. 같은 이름은 덮어쓴다. */
export async function writeLabCaseFile(opts: {
  root: FileSystemDirectoryHandle;
  caseFolder: string;
  file: LabCaseFile;
}): Promise<void> {
  const dir = await opts.root.getDirectoryHandle(labCaseFolderSegment(opts.caseFolder), {
    create: true,
  });
  const fh = await dir.getFileHandle(opts.file.fileName, { create: true });
  const writable = await fh.createWritable();
  try {
    await writable.write(opts.file.blob);
  } finally {
    await writable.close();
  }
}

/**
 * 작업 폴더 안 케이스 폴더: 「YYYYMMDD_치과명-환자명-치아번호」(주문일 KST).
 * 빈 항목은 빠진다. 환자명이 없으면 의뢰 ID 끝 6자리.
 */
export function buildLabCaseFolderName(opts: {
  orderDate?: string | null;
  practiceName?: string | null;
  patientName?: string | null;
  toothNumbers?: string | null;
  fallbackId?: string | null;
}): string {
  const ymd = (toKstYmd(opts.orderDate || null) || toKstYmd(new Date()) || "").replace(/-/g, "");
  const practice = sanitizeFolderSegment(String(opts.practiceName || "")).slice(0, 30);
  const patient = sanitizeFolderSegment(String(opts.patientName || "")).slice(0, 30);
  const teeth = sanitizeFolderSegment(
    String(opts.toothNumbers || "").replace(/\s*,\s*/g, ","),
  ).slice(0, 40);
  const fallback = sanitizeFolderSegment(String(opts.fallbackId || "")).slice(-6);
  const who = patient || (fallback ? `의뢰${fallback}` : "의뢰");
  const tail = [practice, who, teeth].filter(Boolean).join("-");
  return `${ymd}_${tail}`;
}

/** DCM 포맷: 3Shape=원본, ExoCAD·그외=PLY */
export function dcmFormatForDesignSoftware(
  designSoftware: string,
): "dcm" | "ply" {
  return String(designSoftware || "").trim() === "3Shape" ? "dcm" : "ply";
}
