// 기공소 AI 보철 — 문서를 바꾸는 명령마다 IndexedDB에 남기고, 창을 닫을 때 스캔을 서버로 올린다.
// related files:
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
// - web/frontend/src/shared/files/hpsDcmWrite.ts
// - web/frontend/src/shared/practice/labProsthesisAiDesign.ts

import { encodeHpsCaDcm, type HpsCaMesh } from "@/shared/files/hpsDcmWrite";
import {
  abutsWorkScanFileName,
  type WorkScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import type { ToothDesignEdit } from "@/shared/practice/labProsthesisModify";

const DB_NAME = "abuts-lab-prosthesis-work";
const STORE = "drafts";
const DB_VERSION = 1;

export type WorkDraftMesh = HpsCaMesh & { role: WorkScanRole };

export type WorkDraftFile = {
  role: WorkScanRole;
  fileName: string;
  savedAt: number;
  bytes: ArrayBuffer;
};

export type WorkSessionAxis = {
  key: string;
  toothNumbers: string[];
  dir: [number, number, number];
  origin: [number, number, number];
  radius: number;
  view: {
    position: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    zoom: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

/** 스캔 좌표 외에 마진·생성·삽입축. 창을 다시 열면 이 문서를 복원한다. */
export type WorkSessionDocument = {
  edits: Record<string, ToothDesignEdit>;
  generated: Record<string, boolean>;
  insertionAxes: WorkSessionAxis[];
  savedAt: number;
};

export type WorkDraftRecord = {
  transferId: string;
  files: WorkDraftFile[];
  document: WorkSessionDocument | null;
};

type StoredDraft = {
  files: WorkDraftFile[];
  document: WorkSessionDocument | null;
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
  return dbPromise;
}

function tuple3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function axisOf(value: unknown): WorkSessionAxis | null {
  if (!value || typeof value !== "object") return null;
  const row = value as WorkSessionAxis;
  const dir = tuple3(row.dir);
  const origin = tuple3(row.origin);
  const view = row.view;
  if (!dir || !origin || !view || typeof view !== "object") return null;
  const position = tuple3(view.position);
  const target = tuple3(view.target);
  const up = tuple3(view.up);
  const key = String(row.key || "").trim();
  if (!position || !target || !up || !key) return null;
  const toothNumbers = Array.isArray(row.toothNumbers)
    ? row.toothNumbers.map((tooth) => String(tooth || "").trim()).filter(Boolean)
    : [];
  return {
    key,
    toothNumbers,
    dir,
    origin,
    radius: Number(row.radius) || 0,
    view: {
      position,
      target,
      up,
      zoom: Number(view.zoom) || 1,
      left: Number(view.left) || 0,
      right: Number(view.right) || 0,
      top: Number(view.top) || 0,
      bottom: Number(view.bottom) || 0,
    },
  };
}

function documentOf(row: unknown): WorkSessionDocument | null {
  if (!row || typeof row !== "object") return null;
  const doc = (row as { document?: unknown }).document;
  if (!doc || typeof doc !== "object") return null;
  const body = doc as WorkSessionDocument;
  const edits = body.edits;
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) return null;
  const generated =
    body.generated && typeof body.generated === "object" && !Array.isArray(body.generated)
      ? body.generated
      : {};
  const insertionAxes = Array.isArray(body.insertionAxes)
    ? body.insertionAxes.map(axisOf).filter((axis): axis is WorkSessionAxis => axis != null)
    : [];
  return {
    edits,
    generated,
    insertionAxes,
    savedAt: Number(body.savedAt) || 0,
  };
}

function storedOf(row: unknown): StoredDraft {
  if (!row || typeof row !== "object") return { files: [], document: null };
  const files = (row as WorkDraftRecord).files;
  return {
    files: Array.isArray(files) ? files : [],
    document: documentOf(row),
  };
}

function readRecord(transferId: string): Promise<WorkDraftRecord | null> {
  const id = String(transferId || "").trim();
  if (!id || !isBrowser) return Promise.resolve(null);
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(id);
        request.onsuccess = () => {
          const stored = storedOf(request.result);
          if (stored.files.length === 0 && !stored.document) {
            resolve(null);
            return;
          }
          resolve({
            transferId: id,
            files: stored.files,
            document: stored.document,
          });
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

/**
 * get 결과를 같은 트랜잭션에서 바로 쓴다.
 * 요청 사이에 await가 들어가면 트랜잭션이 먼저 닫힌다.
 */
function updateRecord(
  transferId: string,
  update: (prev: StoredDraft) => StoredDraft | null,
): Promise<void> {
  const id = String(transferId || "").trim();
  if (!id || !isBrowser) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const request = store.get(id);
        request.onsuccess = () => {
          const next = update(storedOf(request.result));
          if (next == null) return;
          if (next.files.length === 0 && !next.document) store.delete(id);
          else {
            store.put(
              { transferId: id, files: next.files, document: next.document },
              id,
            );
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function readWorkDraft(
  transferId: string,
): Promise<WorkDraftRecord | null> {
  return readRecord(transferId);
}

/** 넘긴 역할의 파일만 바꿔 넣는다. 다른 역할 초안은 그대로 둔다. */
export function mergeWorkDraft(
  transferId: string,
  files: readonly WorkDraftFile[],
): Promise<void> {
  if (files.length === 0) return Promise.resolve();
  const incoming = [...files];
  return updateRecord(transferId, (prev) => ({
    document: prev.document,
    files: [
      ...prev.files.filter((file) => !incoming.some((next) => next.role === file.role)),
      ...incoming,
    ],
  }));
}

export function stampWorkDraftSavedAt(
  transferId: string,
  roles: readonly WorkScanRole[],
  savedAt: number,
): Promise<void> {
  if (roles.length === 0) return Promise.resolve();
  const roleSet = new Set(roles);
  return updateRecord(transferId, (prev) => {
    if (prev.files.length === 0) return null;
    return {
      document: prev.document,
      files: prev.files.map((file) =>
        roleSet.has(file.role) ? { ...file, savedAt } : file,
      ),
    };
  });
}

export function dropWorkDraftRoles(
  transferId: string,
  roles: readonly WorkScanRole[],
): Promise<void> {
  if (roles.length === 0) return Promise.resolve();
  const roleSet = new Set(roles);
  return updateRecord(transferId, (prev) => ({
    document: prev.document,
    files: prev.files.filter((file) => !roleSet.has(file.role)),
  }));
}

export async function writeWorkDraftMeshes(
  transferId: string,
  meshes: readonly WorkDraftMesh[],
  savedAt = Date.now(),
): Promise<WorkDraftFile[]> {
  const grouped = new Map<WorkScanRole, WorkDraftMesh[]>();
  for (const mesh of meshes) {
    const list = grouped.get(mesh.role) ?? [];
    list.push(mesh);
    grouped.set(mesh.role, list);
  }
  const files: WorkDraftFile[] = [];
  for (const [role, rows] of grouped) {
    for (let index = 0; index < rows.length; index += 1) {
      const fileName = abutsWorkScanFileName(role, index);
      const blob = encodeHpsCaDcm(rows[index]!);
      files.push({
        role,
        fileName,
        savedAt,
        bytes: await blob.arrayBuffer(),
      });
    }
  }
  await mergeWorkDraft(transferId, files);
  return files;
}

/** 마진·삽입축 문서를 저장한다. 스캔 바이트는 그대로 둔다. */
export function writeWorkSessionDocument(
  transferId: string,
  document: WorkSessionDocument,
): Promise<void> {
  return updateRecord(transferId, (prev) => ({
    files: prev.files,
    document,
  }));
}

/**
 * 이번에 넘긴 스캔과 작업 문서를 한 번에 넣는다.
 * 스캔이 없으면 문서만 갱신한다.
 */
export async function writeWorkSession(
  transferId: string,
  input: {
    meshes: readonly WorkDraftMesh[];
    document: WorkSessionDocument;
  },
): Promise<WorkDraftFile[]> {
  const encoded =
    input.meshes.length > 0
      ? await writeWorkDraftMeshes(transferId, input.meshes, input.document.savedAt)
      : [];
  await writeWorkSessionDocument(transferId, input.document);
  return encoded;
}

function roleSavedAt(
  files: readonly WorkDraftFile[],
  role: WorkScanRole,
): number {
  let max = 0;
  for (const file of files) {
    if (file.role === role) max = Math.max(max, Number(file.savedAt) || 0);
  }
  return max;
}

export function newerDraftRoles(
  draft: WorkDraftRecord | null,
  serverUploadedAtMs: ReadonlyMap<WorkScanRole, number>,
): WorkScanRole[] {
  if (!draft) return [];
  const roles: WorkScanRole[] = [];
  for (const role of ["upper", "lower", "bite"] as const) {
    const localAt = roleSavedAt(draft.files, role);
    if (localAt <= 0) continue;
    const remote = serverUploadedAtMs.get(role) ?? 0;
    if (localAt > remote) roles.push(role);
  }
  return roles;
}

/** 서버 작업 파일보다 초안이 새로우면 그 역할의 스캔 대신 초안 파일을 연다. */
export function assignNewerDraftFiles(
  sources: ReadonlyArray<{ id: string; role: string }>,
  draft: WorkDraftRecord | null,
  serverUploadedAtMs: ReadonlyMap<WorkScanRole, number>,
): { byId: Map<string, File>; roles: WorkScanRole[] } {
  const byId = new Map<string, File>();
  const roles: WorkScanRole[] = [];
  if (!draft) return { byId, roles };
  const byRole = new Map<WorkScanRole, WorkDraftFile[]>();
  for (const file of draft.files) {
    const list = byRole.get(file.role) ?? [];
    list.push(file);
    byRole.set(file.role, list);
  }
  const cursor = new Map<WorkScanRole, number>();
  const seen = new Set<WorkScanRole>();
  for (const source of sources) {
    if (source.role !== "upper" && source.role !== "lower" && source.role !== "bite") {
      continue;
    }
    const list = byRole.get(source.role) ?? [];
    const localAt = roleSavedAt(list, source.role);
    const remote = serverUploadedAtMs.get(source.role) ?? 0;
    if (!(localAt > remote)) continue;
    const index = cursor.get(source.role) ?? 0;
    cursor.set(source.role, index + 1);
    const hit = list[index];
    if (!hit?.bytes) continue;
    byId.set(
      source.id,
      new File([hit.bytes], hit.fileName, { type: "application/octet-stream" }),
    );
    if (!seen.has(source.role)) {
      seen.add(source.role);
      roles.push(source.role);
    }
  }
  return { byId, roles };
}

export function draftFilesForRoles(
  draft: WorkDraftRecord | null,
  roles: ReadonlySet<WorkScanRole>,
): File[] {
  if (!draft) return [];
  const out: File[] = [];
  for (const file of draft.files) {
    if (!roles.has(file.role) || !file.bytes) continue;
    out.push(
      new File([file.bytes], file.fileName, { type: "application/octet-stream" }),
    );
  }
  return out;
}
