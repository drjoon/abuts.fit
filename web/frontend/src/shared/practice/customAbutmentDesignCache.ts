// 치과 커스텀어벗 디자인 프리뷰 저장. 한 번 만든 디자인(픽스쳐 정합·형상·조정값)을
// 이 브라우저 IndexedDB에 두고, 모달을 다시 열면 스캔만 읽어 그대로 보여 준다.
// 키는 스캔 파일·치아 정보와 정합 버전이라, 스캔이나 의뢰 치아가 바뀌면 새로 만든다.
// 형상 버전만 바뀌면 저장된 정합(정렬 스캔·픽스쳐)으로 형상만 다시 만든다(치아당 ~0.3초).
// AI 대화는 정합 키와 따로, 의뢰 id(`chat:{transferId}`)로 둔다. 형상을 다시 만들어도 대화는 남는다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { request } from "@/shared/api/apiClient";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";
import type { MatchedScanbodyFixture } from "@/shared/practice/customAbutmentScanbodyMatch";
import type { CustomAbutmentDesignParams } from "@/shared/practice/customAbutmentDesignParams";
import type { CustomAbutmentDesignMetrics } from "@/shared/practice/customAbutmentStlDesign";
import type { AbutmentEdit } from "@/shared/components/practice/abutmentDirectEdit";
import type { PaintShape } from "@/shared/components/practice/viewPaintGeom";

/** 디자인 형상 로직이 바뀌면 올린다. 정합(교합·스캔바디)은 두고 형상만 다시 만든다. */
export const CUSTOM_ABUTMENT_DESIGN_VERSION = 56;
/** 교합 정렬·스캔바디 정합 로직이 바뀌면 올린다. 저장본 전체를 다시 만든다. */
export const CUSTOM_ABUTMENT_FIT_VERSION = 9;

const DB_NAME = "abuts-custom-abutment-design";
const STORE = "designs";
const DB_VERSION = 1;
const MAX_RECORDS = 30;

export type CustomAbutmentChatUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CustomAbutmentChatOffer = {
  kind: "manual-design";
  gapId: string;
  choice?: "yes" | "no";
};

export type CustomAbutmentChatTurn = {
  role: "user" | "assistant";
  text: string;
  usage?: CustomAbutmentChatUsage;
  offer?: CustomAbutmentChatOffer;
};

export type CachedCustomAbutmentTooth = {
  toothNumber: string;
  fileName: string;
  fixture: MatchedScanbodyFixture;
  overrides: Partial<CustomAbutmentDesignParams>;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
  baselineMetrics?: CustomAbutmentDesignMetrics;
  baselineParams?: CustomAbutmentDesignParams;
  gumballEdit?: AbutmentEdit | null;
  gumballBaseParams?: Partial<CustomAbutmentDesignParams>;
  gumballBaseMetrics?: CustomAbutmentDesignMetrics;
  /** 처음 제안할 때 넣은 조정값. 리셋은 이 입력으로만 돌아간다. */
  proposalInput?: Partial<CustomAbutmentDesignParams>;
  editedInfoFields?: string[];
  localPositions: ArrayBuffer;
  solidBodyLocalPositions?: ArrayBuffer;
  crownLocalPositions: ArrayBuffer;
  marginLoopLocal: ArrayBuffer;
  enameloplastyLocalPositions?: ArrayBuffer;
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

/** 이 브라우저 저장본과 서버 스냅샷 중 더 나중에 저장된 형상을 쓴다. */
export function preferFresherCustomAbutmentDesign<
  T extends { savedAt?: number; teeth?: readonly unknown[] },
>(local: T | null, server: T | null): T | null {
  const localCount = Array.isArray(local?.teeth) ? local.teeth.length : 0;
  const serverCount = Array.isArray(server?.teeth) ? server.teeth.length : 0;
  if (localCount === 0) return serverCount > 0 ? server : null;
  if (serverCount === 0 || !server) return local;
  const localAt = Number(local?.savedAt) || 0;
  const serverAt = Number(server.savedAt) || 0;
  return serverAt > localAt ? server : local;
}

/** 대화 저장 키. 정합·형상 버전과 스캔 키가 바뀌어도 같은 의뢰면 그대로다. */
export function customAbutmentChatCacheKey(scope: string): string {
  const id = scope.trim();
  return id ? `chat:${id}` : "";
}

const CHAT_TURN_LIMIT = 40;

/** 화면에 쌓인 말이 저장본보다 길면 화면을 유지한다. 아니면 의뢰 저장 → 디자인 저장본 순. */
export function pickCustomAbutmentChat(
  live: readonly CustomAbutmentChatTurn[],
  saved: readonly CustomAbutmentChatTurn[],
  fromDesign: readonly CustomAbutmentChatTurn[],
): CustomAbutmentChatTurn[] {
  const current = normalizeCustomAbutmentChat(live);
  const stored =
    saved.length > 0 ? normalizeCustomAbutmentChat(saved) : normalizeCustomAbutmentChat(fromDesign);
  return current.length > stored.length ? current : stored;
}

function readChatOffer(raw: unknown): CustomAbutmentChatOffer | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as { kind?: unknown; gapId?: unknown; choice?: unknown };
  if (row.kind !== "manual-design") return undefined;
  const gapId = String(row.gapId || "").trim();
  if (!gapId) return undefined;
  const choice = row.choice === "yes" || row.choice === "no" ? row.choice : undefined;
  return choice ? { kind: "manual-design", gapId, choice } : { kind: "manual-design", gapId };
}

function readChatUsage(raw: unknown): CustomAbutmentChatUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as { inputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown };
  const inputTokens = Math.max(0, Math.round(Number(row.inputTokens) || 0));
  const outputTokens = Math.max(0, Math.round(Number(row.outputTokens) || 0));
  const totalTokens = Math.max(0, Math.round(Number(row.totalTokens) || inputTokens + outputTokens));
  if (inputTokens + outputTokens + totalTokens === 0) return undefined;
  return { inputTokens, outputTokens, totalTokens };
}

export function normalizeCustomAbutmentChat(raw: unknown): CustomAbutmentChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: CustomAbutmentChatTurn[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const role = (row as { role?: unknown }).role;
    const text = String((row as { text?: unknown }).text ?? "");
    if ((role !== "user" && role !== "assistant") || !text.trim()) continue;
    const usage = readChatUsage((row as { usage?: unknown }).usage);
    const offer = readChatOffer((row as { offer?: unknown }).offer);
    const turn: CustomAbutmentChatTurn = { role, text };
    if (usage) turn.usage = usage;
    if (offer) turn.offer = offer;
    turns.push(turn);
  }
  return turns.slice(-CHAT_TURN_LIMIT);
}

function isChatCacheKey(key: IDBValidKey | undefined, row: unknown): boolean {
  if (String(key ?? "").startsWith("chat:")) return true;
  return !!row && typeof row === "object" && (row as { kind?: unknown }).kind === "chat";
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
          chat: normalizeCustomAbutmentChat(row.chat),
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
      if (!rows || !ids) return;
      const designs = rows
        .map((row, i) => ({
          key: ids![i]!,
          savedAt: Number(row?.savedAt) || 0,
          chat: isChatCacheKey(ids![i], row),
        }))
        .filter((row) => !row.chat);
      if (designs.length <= MAX_RECORDS) return;
      const order = designs.sort((a, b) => a.savedAt - b.savedAt);
      for (const row of order.slice(0, designs.length - MAX_RECORDS)) store.delete(row.key);
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

type CachedCustomAbutmentChat = {
  key: string;
  kind: "chat";
  savedAt: number;
  chat: CustomAbutmentChatTurn[];
};

/** 의뢰 대화. 디자인 저장본이 없거나 정합을 다시 해도 이 기록을 보여 준다. */
export async function readCustomAbutmentChat(scope: string): Promise<CustomAbutmentChatTurn[]> {
  const key = customAbutmentChatCacheKey(scope);
  if (!isBrowser || !key) return [];
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const row = request.result as CachedCustomAbutmentChat | undefined;
        resolve(normalizeCustomAbutmentChat(row?.chat));
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

let chatWriteChain: Promise<void> = Promise.resolve();

/** 빈 목록은 저장하지 않는다. 디자인 재계산이 대화를 지우지 않게. */
export function writeCustomAbutmentChat(
  scope: string,
  chat: readonly CustomAbutmentChatTurn[],
): Promise<void> {
  const key = customAbutmentChatCacheKey(scope);
  const turns = normalizeCustomAbutmentChat(chat);
  if (!isBrowser || !key || turns.length === 0) return Promise.resolve();
  const job = chatWriteChain.then(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const record: CachedCustomAbutmentChat = {
        key,
        kind: "chat",
        savedAt: Date.now(),
        chat: turns,
      };
      tx.objectStore(STORE).put(record, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
  chatWriteChain = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

export function toArrayBuffer(arr: Float32Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let text = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    text += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(text);
}

function base64ToBuffer(raw: string): ArrayBuffer | null {
  const text = String(raw || "");
  if (!text) return null;
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

export type CustomAbutmentPaintView = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  span?: number;
};

export type CustomAbutmentPaintRecord = {
  shapes: PaintShape[];
  view?: CustomAbutmentPaintView | null;
  updatedAt?: string | null;
  updatedSide?: string | null;
};

export type CustomAbutmentRouteFeeGuide = {
  platformUnit: number;
  labTeeth: Array<{ toothNumber: string; feeName: string; unit: number }>;
};

export type CustomAbutmentChoice = {
  cancelDeadlineAt: string | null;
  labCheckedAt: string | null;
};

export type RemoteCustomAbutmentSnapshot = {
  design: (CachedCustomAbutmentDesign & { designFresh: boolean }) | null;
  chat: CustomAbutmentChatTurn[];
  /** 어벗 STL이 S3에 있다. 없으면 의뢰자 화면이 다시 올린다. */
  hasStl: boolean;
  paint: CustomAbutmentPaintRecord | null;
  mode: "confirmed" | "manual" | null;
  manualDesign: { at?: string; message?: string; hasPaint?: boolean } | null;
  feeGuide: CustomAbutmentRouteFeeGuide | null;
  choice: CustomAbutmentChoice;
};

export type CustomAbutmentSnapshotUploadTooth = {
  toothNumber: string;
  fileName: string;
  fixture: MatchedScanbodyFixture;
  overrides: Partial<CustomAbutmentDesignParams>;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
  gumballEdit?: AbutmentEdit | null;
  gumballBaseParams?: Partial<CustomAbutmentDesignParams>;
  gumballBaseMetrics?: CustomAbutmentDesignMetrics;
  stlBlob: Blob;
  crownLocalPositions: Float32Array;
  marginLoopLocal: Float32Array;
  enameloplastyLocalPositions?: Float32Array;
};

export type UploadedCustomAbutmentSnapshotTooth = {
  toothNumber: string;
  fileName: string;
  fixture: MatchedScanbodyFixture;
  overrides: Partial<CustomAbutmentDesignParams>;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
  gumballEdit?: AbutmentEdit | null;
  gumballBaseParams?: Partial<CustomAbutmentDesignParams>;
  gumballBaseMetrics?: CustomAbutmentDesignMetrics;
  s3Key: string;
  crownS3Key: string;
  size: number;
  marginLoopLocal: string;
  enameloplastyLocal?: string;
};

async function positionsFromStl(
  token: string,
  s3Key: string,
  fileName: string,
  cacheRevision?: string | number,
): Promise<ArrayBuffer | null> {
  const blob = await fetchS3BlobCached({
    s3Key,
    fileName: fileName || "abutment.stl",
    token,
    cacheRevision,
    buildUrl: buildS3ProxyDownloadUrl,
  });
  const geometry = new STLLoader().parse(await blob.arrayBuffer());
  const attr = geometry.getAttribute("position");
  if (!attr || attr.count < 3) {
    geometry.dispose();
    return null;
  }
  const copy = new Float32Array(attr.array as ArrayLike<number>);
  geometry.dispose();
  return copy.buffer;
}

async function presignPreviewStl(
  token: string,
  transferId: string,
  toothNumber: string,
  kind: "abutment" | "crown",
  blob: Blob,
  fileName: string,
): Promise<string> {
  const res = await request<{ data?: { uploadUrl?: string; s3Key?: string } }>({
    path: "/api/ai/custom-abutment-design-snapshot/file",
    method: "POST",
    token,
    jsonBody: { transferId, toothNumber, kind, size: blob.size, fileName },
  });
  const uploadUrl = String(res.data?.data?.uploadUrl || "");
  const s3Key = String(res.data?.data?.s3Key || "");
  if (!res.ok || !uploadUrl || !s3Key) {
    throw new Error("STL 업로드 주소를 받지 못했습니다.");
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "model/stl" },
    body: blob,
  });
  if (!put.ok) throw new Error("STL을 저장하지 못했습니다.");
  return s3Key;
}

/** 의뢰자에 저장된 형상·대화·3D 페인트. */
export async function fetchCustomAbutmentSnapshot(
  token: string,
  transferId: string,
): Promise<RemoteCustomAbutmentSnapshot | null> {
  const id = transferId.trim();
  if (!id) return null;
  try {
    const res = await request<{
      data?: {
        design?: {
          version?: number;
          fitVersion?: number;
          savedAt?: number;
          chat?: unknown;
          teeth?: Array<Record<string, unknown>>;
        } | null;
        chat?: unknown;
        paint?: {
          shapes?: unknown;
          view?: CustomAbutmentPaintView | null;
          updatedAt?: string | null;
          updatedSide?: string | null;
        } | null;
        mode?: "confirmed" | "manual" | null;
        manualDesign?: { at?: string; message?: string; hasPaint?: boolean } | null;
        feeGuide?: {
          platformUnit?: number;
          labTeeth?: Array<{ toothNumber?: string; feeName?: string; unit?: number }>;
        } | null;
        choice?: { cancelDeadlineAt?: string | null; labCheckedAt?: string | null } | null;
      };
    }>({
      path: `/api/ai/custom-abutment-design-snapshot?transferId=${encodeURIComponent(id)}`,
      method: "GET",
      token,
    });
    if (!res.ok || !res.data?.data) return null;
    const chat = normalizeCustomAbutmentChat(res.data.data.chat);
    const rawPaint = res.data.data.paint;
    const paint: CustomAbutmentPaintRecord | null =
      rawPaint && Array.isArray(rawPaint.shapes)
        ? {
            shapes: rawPaint.shapes as PaintShape[],
            view: rawPaint.view ?? null,
            updatedAt: rawPaint.updatedAt ?? null,
            updatedSide: rawPaint.updatedSide ?? null,
          }
        : null;
    const mode =
      res.data.data.mode === "confirmed" || res.data.data.mode === "manual"
        ? res.data.data.mode
        : null;
    const manualDesign = res.data.data.manualDesign ?? null;
    const rawGuide = res.data.data.feeGuide;
    const feeGuide: CustomAbutmentRouteFeeGuide | null = rawGuide
      ? {
          platformUnit: Math.max(0, Math.round(Number(rawGuide.platformUnit || 0))),
          labTeeth: (Array.isArray(rawGuide.labTeeth) ? rawGuide.labTeeth : [])
            .map((row) => ({
              toothNumber: String(row?.toothNumber || "").trim(),
              feeName: String(row?.feeName || "").trim(),
              unit: Math.max(0, Math.round(Number(row?.unit || 0))),
            }))
            .filter((row) => row.toothNumber && row.unit > 0),
        }
      : null;
    const rawChoice = res.data.data.choice;
    const choice: CustomAbutmentChoice = {
      cancelDeadlineAt: rawChoice?.cancelDeadlineAt
        ? String(rawChoice.cancelDeadlineAt)
        : null,
      labCheckedAt: rawChoice?.labCheckedAt ? String(rawChoice.labCheckedAt) : null,
    };
    const raw = res.data.data.design;
    if (!raw || !Array.isArray(raw.teeth) || raw.teeth.length === 0) {
      return { design: null, chat, hasStl: false, paint, mode, manualDesign, feeGuide, choice };
    }
    const teeth: CachedCustomAbutmentTooth[] = [];
    let hasStl = false;
    const stlRevision = Number(raw.savedAt) || Number(raw.version) || 0;
    for (const row of raw.teeth) {
      const fixture = row.fixture as MatchedScanbodyFixture | null;
      if (!fixture) continue;
      const fileName = String(row.fileName || "abutment.stl");
      const s3Key = String(row.s3Key || "");
      let localPositions = s3Key
        ? await positionsFromStl(token, s3Key, fileName, stlRevision)
        : null;
      if (localPositions) hasStl = true;
      const crownKey = String(row.crownS3Key || "");
      let crownLocalPositions = crownKey
        ? await positionsFromStl(
            token,
            crownKey,
            fileName.replace(/\.stl$/i, "") + "-crown.stl",
            stlRevision,
          )
        : null;
      let marginLoopLocal = base64ToBuffer(String(row.marginLoopLocal || ""));
      const enameloplastyLocalPositions = base64ToBuffer(String(row.enameloplastyLocal || ""));
      if (!localPositions) localPositions = base64ToBuffer(String(row.localPositions || ""));
      if (!crownLocalPositions) crownLocalPositions = base64ToBuffer(String(row.crownLocalPositions || ""));
      if (!localPositions) continue;
      if (!crownLocalPositions) crownLocalPositions = new ArrayBuffer(0);
      if (!marginLoopLocal) marginLoopLocal = new ArrayBuffer(0);
      teeth.push({
        toothNumber: String(row.toothNumber || ""),
        fileName,
        fixture,
        overrides: (row.overrides || {}) as Partial<CustomAbutmentDesignParams>,
        params: row.params as CustomAbutmentDesignParams,
        metrics: row.metrics as CustomAbutmentDesignMetrics,
        ...(row.gumballEdit && typeof row.gumballEdit === "object"
          ? { gumballEdit: row.gumballEdit as AbutmentEdit }
          : {}),
        ...(row.gumballBaseParams && typeof row.gumballBaseParams === "object"
          ? { gumballBaseParams: row.gumballBaseParams as Partial<CustomAbutmentDesignParams> }
          : {}),
        ...(row.gumballBaseMetrics && typeof row.gumballBaseMetrics === "object"
          ? { gumballBaseMetrics: row.gumballBaseMetrics as CustomAbutmentDesignMetrics }
          : {}),
        localPositions,
        crownLocalPositions,
        marginLoopLocal,
        ...(enameloplastyLocalPositions ? { enameloplastyLocalPositions } : {}),
      });
    }
    if (teeth.length === 0) {
      return { design: null, chat, hasStl: false, paint, mode, manualDesign, feeGuide, choice };
    }
    const version = Number(raw.version) || 0;
    const fitVersion = Number(raw.fitVersion) || 0;
    const savedAt = Number(raw.savedAt) || 0;
    return {
      chat,
      hasStl,
      paint,
      mode,
      manualDesign,
      feeGuide,
      choice,
      design: {
        key: id,
        version,
        fitVersion,
        savedAt,
        alignedScans: [],
        teeth,
        chat,
        designFresh:
          version === CUSTOM_ABUTMENT_DESIGN_VERSION && fitVersion === CUSTOM_ABUTMENT_FIT_VERSION,
      },
    };
  } catch {
    return null;
  }
}

const uploadedBlobPromiseMap = new WeakMap<
  Blob,
  Map<string, Promise<{ s3Key: string; crownS3Key: string; size: number }>>
>();

/** 이미 백그라운드로 올리는 중이거나 올라간 동일 STL Blob은 재업로드하지 않고 재사용한다. */
export async function uploadCustomAbutmentSnapshotTeeth(
  token: string,
  transferId: string,
  rows: readonly CustomAbutmentSnapshotUploadTooth[],
): Promise<UploadedCustomAbutmentSnapshotTooth[]> {
  const id = transferId.trim();
  return Promise.all(
    rows.map(async (row) => {
      const fileName = row.fileName || `#${row.toothNumber}.stl`;
      const cacheScope = `${id}:${row.toothNumber}`;
      let byScope = uploadedBlobPromiseMap.get(row.stlBlob);
      if (!byScope) {
        byScope = new Map();
        uploadedBlobPromiseMap.set(row.stlBlob, byScope);
      }
      let job = byScope.get(cacheScope);
      if (!job) {
        job = (async () => {
          const s3Key = await presignPreviewStl(
            token,
            id,
            row.toothNumber,
            "abutment",
            row.stlBlob,
            fileName,
          );
          let crownS3Key = "";
          if (row.crownLocalPositions.length >= 9) {
            const crownBlob = encodeBinaryStl(
              row.crownLocalPositions,
              `abuts.fit crown #${row.toothNumber}`,
            );
            crownS3Key = await presignPreviewStl(
              token,
              id,
              row.toothNumber,
              "crown",
              crownBlob,
              fileName.replace(/\.stl$/i, "") + "-crown.stl",
            );
          }
          return { s3Key, crownS3Key, size: row.stlBlob.size };
        })().catch((err) => {
          byScope?.delete(cacheScope);
          throw err;
        });
        byScope.set(cacheScope, job);
      }
      const { s3Key, crownS3Key, size } = await job;
      const enameloplastyLocal =
        row.enameloplastyLocalPositions && row.enameloplastyLocalPositions.length >= 9
          ? bytesToBase64(toArrayBuffer(row.enameloplastyLocalPositions))
          : undefined;
      return {
        toothNumber: row.toothNumber,
        fileName,
        fixture: row.fixture,
        overrides: row.overrides,
        params: row.params,
        metrics: row.metrics,
        ...(row.gumballEdit ? { gumballEdit: row.gumballEdit } : {}),
        ...(row.gumballBaseParams ? { gumballBaseParams: row.gumballBaseParams } : {}),
        ...(row.gumballBaseMetrics ? { gumballBaseMetrics: row.gumballBaseMetrics } : {}),
        s3Key,
        crownS3Key,
        size,
        marginLoopLocal: bytesToBase64(toArrayBuffer(row.marginLoopLocal)),
        ...(enameloplastyLocal ? { enameloplastyLocal } : {}),
      };
    }),
  );
}

/** 어벗 STL은 S3에, 위치와 대화는 의뢰 문서에 남긴다. 실패해도 화면은 유지한다. */
export function publishCustomAbutmentSnapshot(
  token: string,
  transferId: string,
  record: {
    version: number;
    fitVersion: number;
    chat: readonly CustomAbutmentChatTurn[];
    teeth: readonly CustomAbutmentSnapshotUploadTooth[];
    paint?: { shapes: readonly PaintShape[]; view?: CustomAbutmentPaintView | null };
  },
): void {
  const id = transferId.trim();
  if (!token || !id || record.teeth.length === 0) return;
  void (async () => {
    const teeth = await uploadCustomAbutmentSnapshotTeeth(token, id, record.teeth);
    const saved = await request({
      path: "/api/ai/custom-abutment-design-snapshot",
      method: "PUT",
      token,
      jsonBody: {
        transferId: id,
        version: record.version,
        fitVersion: record.fitVersion,
        chat: normalizeCustomAbutmentChat(record.chat),
        teeth,
        ...(record.paint ? { paint: record.paint } : {}),
      },
    });
    if (!saved.ok) throw new Error("디자인 메타데이터를 저장하지 못했습니다.");
  })().catch((err) => console.warn("[custom-abutment] snapshot upload failed", err));
}

export async function saveCustomAbutmentDesignPaintRemote(
  token: string,
  transferId: string,
  paint: { shapes: readonly PaintShape[]; view?: CustomAbutmentPaintView | null },
): Promise<boolean> {
  const id = transferId.trim();
  if (!token || !id) return false;
  const res = await request({
    path: "/api/ai/custom-abutment-design-paint",
    method: "PUT",
    token,
    jsonBody: {
      transferId: id,
      shapes: paint.shapes,
      view: paint.view ?? null,
    },
  });
  return res.ok;
}

export async function confirmCustomAbutmentDesignRemote(
  token: string,
  transferId: string,
  payload: {
    patientName?: string;
    version: number;
    fitVersion: number;
    teeth: readonly CustomAbutmentSnapshotUploadTooth[];
  },
): Promise<{ ok: boolean; message?: string; cancelDeadlineAt?: string | null }> {
  const id = transferId.trim();
  if (!token || !id) return { ok: false, message: "의뢰 정보가 없습니다." };
  const teeth = await uploadCustomAbutmentSnapshotTeeth(token, id, payload.teeth);
  const res = await request<{
    message?: string;
    data?: { cancelDeadlineAt?: string | null };
  }>({
    path: "/api/ai/custom-abutment-design-confirm",
    method: "POST",
    token,
    jsonBody: {
      transferId: id,
      patientName: payload.patientName,
      version: payload.version,
      fitVersion: payload.fitVersion,
      teeth,
    },
  });
  const deadline = res.data?.data?.cancelDeadlineAt;
  return {
    ok: res.ok,
    message: res.data?.message,
    cancelDeadlineAt: deadline ? String(deadline) : null,
  };
}

export async function requestManualCustomAbutmentDesignRemote(
  token: string,
  transferId: string,
  payload: {
    message?: string;
    chatSentDirectly?: boolean;
    version: number;
    fitVersion: number;
    teeth: readonly CustomAbutmentSnapshotUploadTooth[];
    paint?: { shapes: readonly PaintShape[]; view?: CustomAbutmentPaintView | null };
  },
): Promise<{ ok: boolean; message?: string }> {
  const id = transferId.trim();
  if (!token || !id) return { ok: false, message: "의뢰 정보가 없습니다." };
  const teeth =
    payload.teeth.length > 0
      ? await uploadCustomAbutmentSnapshotTeeth(token, id, payload.teeth)
      : [];
  const res = await request<{ message?: string }>({
    path: "/api/ai/custom-abutment-design-manual-request",
    method: "POST",
    token,
    jsonBody: {
      transferId: id,
      message: payload.message,
      chatSentDirectly: payload.chatSentDirectly,
      version: payload.version,
      fitVersion: payload.fitVersion,
      teeth,
      paint: payload.paint,
    },
  });
  return { ok: res.ok, message: res.data?.message };
}
