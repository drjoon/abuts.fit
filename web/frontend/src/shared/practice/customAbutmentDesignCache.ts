// 치과·기공소 커스텀어벗 디자인 프리뷰 저장. 한 번 만든 디자인(픽스쳐 정합·형상·조정값)을
// 이 브라우저 IndexedDB에 둔다. 다시 열 때는 더 나중 형상을 쓴다.
// 서버 시각이 더 나중이면 정점이 없어도 서버 조정값으로 다시 만든다.
// 스캔은 캐시에서 읽어 맞춘다.
// 키는 스캔 파일·치아 정보와 정합 버전이라, 스캔이나 의뢰 치아가 바뀌면 새로 만든다.
// 형상 버전만 바뀌면 저장된 정합(정렬 스캔·픽스쳐)으로 형상만 다시 만든다(치아당 ~0.3초).
// 스냅샷 JSON과 STL은 나눈다. 같은 의뢰의 동시 조회는 한 번만 받고, 어벗·크라운 STL은 같이 받는다.
// AI 대화는 정합 키와 따로, 의뢰 id(`chat:{transferId}`)로 둔다. 형상을 다시 만들어도 대화는 남는다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { invalidateApiGetCache, request } from "@/shared/api/apiClient";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";
import { normalizeInsertionAxis } from "@/shared/practice/bridgeInsertionPath";
import type { MatchedScanbodyFixture } from "@/shared/practice/customAbutmentScanbodyMatch";
import type { CustomAbutmentDesignParams } from "@/shared/practice/customAbutmentDesignParams";
import type { CustomAbutmentDesignMetrics } from "@/shared/practice/customAbutmentStlDesign";
import type { AbutmentEdit } from "@/shared/components/practice/abutmentDirectEdit";
import type { PaintShape } from "@/shared/components/practice/viewPaintGeom";

/** 디자인 형상 로직이 바뀌면 올린다. 정합(교합·스캔바디)은 두고 형상만 다시 만든다. */
export const CUSTOM_ABUTMENT_DESIGN_VERSION = 79;
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
  /** 브리지에서 맞춘 공통 삽입축(월드). 다시 열 때 같은 패스로 만든다. */
  insertionAxisWorld?: [number, number, number];
  localPositions: ArrayBuffer;
  solidBodyLocalPositions?: ArrayBuffer;
  crownLocalPositions: ArrayBuffer;
  marginLoopLocal: ArrayBuffer;
  enameloplastyLocalPositions?: ArrayBuffer;
  /** 서버 프리뷰 STL. 형상을 안 바꿨으면 확정 때 다시 올리지 않는다. */
  sourceS3Key?: string;
  sourceCrownS3Key?: string;
  /** 서버에 정점이 없다. 픽스처·조정값으로 이 브라우저에서 다시 만든다. */
  regenFromMeta?: boolean;
};

/** 바이트 정렬로 옮긴 스캔 정점. 다시 열 때 정렬을 건너뛴다. */
export type CachedAlignedScan = {
  fileName: string;
  role: "upper" | "lower";
  vertexCount: number;
  positions: ArrayBuffer;
};

/**
 * 상·하악 교합 확인(·정렬) 결과.
 * 있으면 재로드 시 자동 교합 확인을 하지 않는다. 헤더 「바이트」로만 다시 돌린다.
 */
export type CachedBiteCheck = {
  checkedAt: number;
  qualityOk: boolean;
  /** 정점을 실제로 옮겼는지. false면 이미 맞는 교합을 유지했다. */
  moved: boolean;
  source: "auto" | "manual";
};

/** 악궁 하나의 교합 자세(열 우선 4x4). 스캔 파일이 아니라 의뢰 세션에 둔다. */
export type CustomAbutmentJawPose = {
  upper?: number[];
  lower?: number[];
};

/**
 * 교합 정렬이 잡은 모델 축. 작업 좌표 기준.
 * 앞=전치(근심), 뒤=구치(원심), U의 좁은 쪽=설·구개, 바깥=협측.
 */
export type CustomAbutmentArchFrame = {
  up: [number, number, number];
  anterior: [number, number, number];
  right: [number, number, number];
};

export type CachedCustomAbutmentDesign = {
  key: string;
  /** 형상 버전. 다르면 `fixture`·조정값으로 형상만 다시 만든다. */
  version: number;
  fitVersion: number;
  savedAt: number;
  alignedScans: CachedAlignedScan[];
  /** 교합 확인 메타. 없으면 로딩 시 1회 확인한다. */
  biteCheck?: CachedBiteCheck | null;
  /** 원본 스캔을 작업 프레임으로 옮기는 자세. 파일별 정점과 따로 둔다. */
  jawPose?: CustomAbutmentJawPose | null;
  /** 교합 정렬 때 잡은 해부 축. 다시 열 때 추정으로 뒤집지 않는다. */
  archFrame?: CustomAbutmentArchFrame | null;
  teeth: CachedCustomAbutmentTooth[];
  chat: CustomAbutmentChatTurn[];
};

/** 캐시·레거시 alignedScans를 보고 자동 교합 확인을 건너뛸지 판단한다. */
export function hasCachedBiteCheck(
  row: { biteCheck?: CachedBiteCheck | null; alignedScans?: readonly CachedAlignedScan[] } | null | undefined,
): boolean {
  if (!row) return false;
  if (row.biteCheck && Number(row.biteCheck.checkedAt) > 0) return true;
  return Array.isArray(row.alignedScans) && row.alignedScans.length > 0;
}

export function normalizeCachedBiteCheck(
  raw: unknown,
): CachedBiteCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<CachedBiteCheck>;
  const checkedAt = Number(row.checkedAt);
  if (!(checkedAt > 0)) return null;
  const source = row.source === "manual" ? "manual" : "auto";
  return {
    checkedAt,
    qualityOk: Boolean(row.qualityOk),
    moved: Boolean(row.moved),
    source,
  };
}

/** 정보 패널 손댄 필드. DesignTree AbutmentInfoFieldKey 와 같다. */
const ABUTMENT_INFO_FIELD_KEYS = new Set([
  "marginSubgMm",
  "maxDiameterMm",
  "marginFilletRadiusMm",
  "postHeightMm",
  "postTaperDeg",
  "postTaperLink",
  "postLingualBevelMm",
  "postLabialBevelMm",
  "occlusalClearanceMm",
  "axisSource",
]);

/** 서버·소켓에서 온 손댄 필드. 빈 배열은 지우기 신호다. */
export function normalizeEditedInfoFields(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    const key = String(item || "").trim();
    if (!ABUTMENT_INFO_FIELD_KEYS.has(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length >= 16) break;
  }
  return out;
}

/**
 * 저장된 어벗이 있으면 교합·스캔바디를 다시 돌리지 않는다.
 * 작업 스캔에서 스캔바디가 빠져 있어도 픽스처로 형상을 연다.
 */
export function resolveCustomAbutmentReopen(input: {
  alignedMatched: boolean;
  hasWorkScans: boolean;
  jawsAgree: boolean;
  rebuildFromMeta: boolean;
  designFresh: boolean;
  isLabViewer: boolean;
  biteCheck: CachedBiteCheck | null;
  savedAt: number;
}): { restored: boolean; meshRestore: boolean; biteCheck: CachedBiteCheck } {
  const biteCheck =
    input.biteCheck ??
    ({
      checkedAt: input.savedAt > 0 ? input.savedAt : 1,
      qualityOk: true,
      moved: false,
      source: "auto",
    } satisfies CachedBiteCheck);
  if (input.alignedMatched || (input.hasWorkScans && input.jawsAgree)) {
    return { restored: true, meshRestore: false, biteCheck };
  }
  if (!input.rebuildFromMeta && (input.designFresh || input.isLabViewer)) {
    return { restored: false, meshRestore: true, biteCheck };
  }
  return { restored: true, meshRestore: false, biteCheck };
}

const isBrowser = typeof window !== "undefined" && !!window.indexedDB;
let dbPromise: Promise<IDBDatabase> | null = null;
/** 닫기 직후 다시 열 때 IndexedDB 쓰기보다 먼저 읽는다. */
const memoryDesignByKey = new Map<string, CachedCustomAbutmentDesign>();

/** 지금 화면의 메시를 네트워크 저장보다 먼저 남긴다. 더 오래된 기록은 덮지 않는다. */
export function rememberCustomAbutmentDesign(record: CachedCustomAbutmentDesign): void {
  if (!record?.key || !(Number(record.savedAt) > 0)) return;
  const prev = memoryDesignByKey.get(record.key);
  if (prev && prev.savedAt > record.savedAt) return;
  memoryDesignByKey.set(record.key, record);
}

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

/** 디자인 세션 키. 의뢰가 있으면 스캔 파일과 무관하게 그 의뢰 하나다. */
export function customAbutmentSessionCacheKey(transferId: string, pipelineKey: string): string {
  const id = transferId.trim();
  if (id) return customAbutmentDesignCacheKey(`transfer:${id}`);
  return customAbutmentDesignCacheKey(pipelineKey);
}

function poseMatrix(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < 16) return null;
  const out: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    const value = Number(raw[i]);
    if (!Number.isFinite(value) || Math.abs(value) > 1e6) return null;
    out.push(Math.round(value * 1e6) / 1e6);
  }
  return out;
}

/** 의뢰에 저장된 악궁 자세. 파일별 정점 스냅샷은 받지 않는다. */
export function normalizeJawPose(raw: unknown): CustomAbutmentJawPose | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { upper?: unknown; lower?: unknown };
  const upper = poseMatrix(row.upper);
  const lower = poseMatrix(row.lower);
  if (!upper && !lower) return null;
  return {
    ...(upper ? { upper } : {}),
    ...(lower ? { lower } : {}),
  };
}

function unitAxis(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);
  const len = Math.hypot(x, y, z);
  if (!(len > 0.5) || len > 1.5) return null;
  const round = (value: number) => Math.round((value / len) * 1e4) / 1e4;
  return [round(x), round(y), round(z)];
}

function dotAxis(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

/** 교합 정렬이 남긴 해부 축. 앞×위가 오른쪽과 같은 쪽일 때만 받는다. */
export function normalizeArchFrame(raw: unknown): CustomAbutmentArchFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { up?: unknown; anterior?: unknown; right?: unknown };
  const up = unitAxis(row.up);
  const anterior = unitAxis(row.anterior);
  const right = unitAxis(row.right);
  if (!up || !anterior || !right) return null;
  if (Math.abs(dotAxis(up, anterior)) > 0.25 || Math.abs(dotAxis(up, right)) > 0.25) return null;
  const expect: [number, number, number] = [
    anterior[1] * up[2] - anterior[2] * up[1],
    anterior[2] * up[0] - anterior[0] * up[2],
    anterior[0] * up[1] - anterior[1] * up[0],
  ];
  if (dotAxis(right, expect) < 0.8) return null;
  return { up, anterior, right };
}

function toothHasMesh(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const tooth = row as CachedCustomAbutmentTooth;
  if (tooth.regenFromMeta) return false;
  return (tooth.localPositions?.byteLength ?? 0) >= 36;
}

function designHasMeshes(row: { teeth?: readonly unknown[] } | null | undefined): boolean {
  const teeth = Array.isArray(row?.teeth) ? row.teeth : [];
  return teeth.length > 0 && teeth.every(toothHasMesh);
}

/**
 * 서버 조정값을 이 브라우저 메시 위에 얹는다.
 * 다시 열 때는 쓰지 않는다. 측정값만 바꾸면 화면 형상과 직경·테이퍼가 어긋난다.
 */
export function mergeServerMetaOntoLocalMeshes<
  T extends {
    savedAt?: number;
    version?: number;
    fitVersion?: number;
    teeth?: readonly CachedCustomAbutmentTooth[];
    alignedScans?: CachedAlignedScan[];
    biteCheck?: CachedBiteCheck | null;
    chat?: CustomAbutmentChatTurn[];
  },
>(local: T, server: T): T {
  const localTeeth = Array.isArray(local.teeth) ? local.teeth : [];
  const serverTeeth = Array.isArray(server.teeth) ? server.teeth : [];
  const localByTooth = new Map(localTeeth.map((row) => [String(row.toothNumber), row]));
  const teeth = serverTeeth.map((src) => {
    const prev = localByTooth.get(String(src.toothNumber));
    if (!prev || !toothHasMesh(prev)) return src;
    return {
      ...prev,
      ...src,
      localPositions: prev.localPositions,
      crownLocalPositions: prev.crownLocalPositions,
      marginLoopLocal:
        (src.marginLoopLocal?.byteLength ?? 0) >= 9 ? src.marginLoopLocal : prev.marginLoopLocal,
      ...(prev.solidBodyLocalPositions
        ? { solidBodyLocalPositions: prev.solidBodyLocalPositions }
        : {}),
      ...(prev.enameloplastyLocalPositions
        ? { enameloplastyLocalPositions: prev.enameloplastyLocalPositions }
        : {}),
      ...(prev.sourceS3Key ? { sourceS3Key: prev.sourceS3Key } : {}),
      ...(prev.sourceCrownS3Key ? { sourceCrownS3Key: prev.sourceCrownS3Key } : {}),
      regenFromMeta: false,
    };
  });
  const serverBite = normalizeCachedBiteCheck(server.biteCheck);
  const localBite = normalizeCachedBiteCheck(local.biteCheck);
  return {
    ...local,
    ...server,
    teeth,
    alignedScans:
      Array.isArray(server.alignedScans) && server.alignedScans.length > 0
        ? server.alignedScans
        : local.alignedScans,
    biteCheck: serverBite ?? localBite,
    chat: Array.isArray(server.chat) && server.chat.length > 0 ? server.chat : local.chat,
  };
}

/**
 * 이 브라우저 저장본과 서버 스냅샷 중 더 나중에 저장된 형상을 쓴다.
 * 서버 시각이 더 나중이면 정점이 없어도 서버 조정값으로 다시 만든다.
 * (로컬 옛 메시를 남기면 저장한 테이퍼·직경이 다시 열 때 되돌아간다.)
 * 같은 시각에 서버만 정점이 없을 때는 이 브라우저 메시를 유지해 재생성 오차를 피한다.
 * 협업 의뢰(`preferServerOnTie`)는 동점이면 서버를 고른다.
 */
function withLocalBiteMeta<
  T extends {
    alignedScans?: CachedAlignedScan[];
    biteCheck?: CachedBiteCheck | null;
    jawPose?: CustomAbutmentJawPose | null;
    archFrame?: CustomAbutmentArchFrame | null;
  },
>(chosen: T, other: T | null | undefined): T {
  if (!other) return chosen;
  const chosenBite = normalizeCachedBiteCheck(chosen.biteCheck);
  const otherBite = normalizeCachedBiteCheck(other.biteCheck);
  const chosenPose = normalizeJawPose(chosen.jawPose);
  const otherPose = normalizeJawPose(other.jawPose);
  const chosenFrame = normalizeArchFrame(chosen.archFrame);
  const otherFrame = normalizeArchFrame(other.archFrame);
  const chosenAligned =
    Array.isArray(chosen.alignedScans) && chosen.alignedScans.length > 0
      ? chosen.alignedScans
      : null;
  const otherAligned =
    Array.isArray(other.alignedScans) && other.alignedScans.length > 0
      ? other.alignedScans
      : null;
  const biteCheck = chosenBite ?? otherBite;
  const jawPose = chosenPose ?? otherPose;
  const archFrame = chosenFrame ?? otherFrame;
  const alignedScans = chosenAligned ?? otherAligned ?? chosen.alignedScans ?? [];
  if (
    biteCheck === chosenBite &&
    jawPose === chosenPose &&
    archFrame === chosenFrame &&
    alignedScans === chosen.alignedScans
  ) {
    return chosen;
  }
  return {
    ...chosen,
    alignedScans,
    biteCheck,
    jawPose,
    archFrame,
  };
}

export function preferFresherCustomAbutmentDesign<
  T extends {
    savedAt?: number;
    version?: number;
    fitVersion?: number;
    teeth?: readonly CachedCustomAbutmentTooth[];
    alignedScans?: CachedAlignedScan[];
    biteCheck?: CachedBiteCheck | null;
    jawPose?: CustomAbutmentJawPose | null;
    archFrame?: CustomAbutmentArchFrame | null;
    chat?: CustomAbutmentChatTurn[];
  },
>(
  local: T | null,
  server: T | null,
  opts?: { preferServerOnTie?: boolean },
): T | null {
  const localCount = Array.isArray(local?.teeth) ? local.teeth.length : 0;
  const serverCount = Array.isArray(server?.teeth) ? server.teeth.length : 0;
  // 치아 메시가 없어도 로컬 biteCheck·alignedScans는 서버 선택 시 이어 붙인다.
  if (localCount === 0) {
    if (serverCount > 0 && server) return withLocalBiteMeta(server, local ?? undefined);
    return local;
  }
  if (serverCount === 0 || !server || !local) return local;
  const localAt = Number(local.savedAt) || 0;
  const serverAt = Number(server.savedAt) || 0;
  // 서버가 더 나중이면 이 브라우저의 옛 메시를 쓰지 않는다.
  // 메시를 남기면 저장된 테이퍼·높이로 패널만 바뀌고 형상은 예전 디자인이다.
  if (serverAt > localAt) return withLocalBiteMeta(server, local);
  if (serverAt < localAt) return withLocalBiteMeta(local, server);
  // 동점: 협업은 서버 메타로 다시 만든다. 로컬 메시가 상대 저장보다 앞설 수 있다.
  if (Boolean(opts?.preferServerOnTie)) return withLocalBiteMeta(server, local);
  return withLocalBiteMeta(local, server);
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

function freshenCachedDesign(
  row: CachedCustomAbutmentDesign,
): CachedCustomAbutmentDesign & { designFresh: boolean } {
  const biteCheck = normalizeCachedBiteCheck(row.biteCheck);
  const archFrame = normalizeArchFrame(row.archFrame);
  return {
    ...row,
    alignedScans: Array.isArray(row.alignedScans) ? row.alignedScans : [],
    ...(biteCheck ? { biteCheck } : { biteCheck: null }),
    ...(archFrame ? { archFrame } : { archFrame: null }),
    chat: normalizeCustomAbutmentChat(row.chat),
    designFresh:
      row.version === CUSTOM_ABUTMENT_DESIGN_VERSION &&
      row.fitVersion === CUSTOM_ABUTMENT_FIT_VERSION,
  };
}

export async function readCustomAbutmentDesign(
  key: string,
): Promise<(CachedCustomAbutmentDesign & { designFresh: boolean }) | null> {
  const mem = key ? memoryDesignByKey.get(key) : undefined;
  const memFresh =
    mem && mem.fitVersion === CUSTOM_ABUTMENT_FIT_VERSION && Array.isArray(mem.teeth)
      ? freshenCachedDesign(mem)
      : null;
  if (!isBrowser || !key) return memFresh;
  try {
    const db = await openDb();
    const stored = await new Promise<
      (CachedCustomAbutmentDesign & { designFresh: boolean }) | null
    >((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const row = request.result as CachedCustomAbutmentDesign | undefined;
        if (!row || row.fitVersion !== CUSTOM_ABUTMENT_FIT_VERSION || !Array.isArray(row.teeth)) {
          resolve(null);
          return;
        }
        resolve(freshenCachedDesign(row));
      };
      request.onerror = () => reject(request.error);
    });
    if (!memFresh) return stored;
    if (!stored) return memFresh;
    return memFresh.savedAt >= stored.savedAt ? memFresh : stored;
  } catch {
    return memFresh;
  }
}

const designWriteTail = new Map<string, Promise<void>>();

async function putCustomAbutmentDesign(record: CachedCustomAbutmentDesign): Promise<void> {
  const kept = memoryDesignByKey.get(record.key);
  if (kept && kept.savedAt > record.savedAt) return;
  const db = await openDb();
  const latest = memoryDesignByKey.get(record.key);
  if (latest && latest.savedAt > record.savedAt) return;
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

/** 저장하고, 오래된 저장본은 MAX_RECORDS개만 남긴다. 더 나중 기록은 덮지 않는다. */
export async function writeCustomAbutmentDesign(record: CachedCustomAbutmentDesign): Promise<void> {
  rememberCustomAbutmentDesign(record);
  if (!isBrowser || !record.key) return;
  const key = record.key;
  const prev = designWriteTail.get(key) ?? Promise.resolve();
  const job = prev.catch(() => undefined).then(() => putCustomAbutmentDesign(record));
  designWriteTail.set(key, job);
  try {
    await job;
  } finally {
    if (designWriteTail.get(key) === job) designWriteTail.delete(key);
  }
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

export type CustomAbutmentSharedView = {
  pos: [number, number, number];
  quat: [number, number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  zoom: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  savedAt: number;
  updatedBy?: string;
  originSocketId?: string;
};

function finiteViewNum(raw: unknown, min: number, max: number): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

function viewVec(raw: unknown, count: number, min: number, max: number): number[] | null {
  if (!Array.isArray(raw) || raw.length < count) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const value = finiteViewNum(raw[i], min, max);
    if (value == null) return null;
    out.push(value);
  }
  return out;
}

export function parseCustomAbutmentSharedView(raw: unknown): CustomAbutmentSharedView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const pos = viewVec(row.pos, 3, -1e5, 1e5);
  const quat = viewVec(row.quat, 4, -2, 2);
  const up = viewVec(row.up, 3, -2, 2);
  const target = viewVec(row.target, 3, -1e5, 1e5);
  const zoom = finiteViewNum(row.zoom, 0.05, 40);
  const top = finiteViewNum(row.top, -1e6, 1e6);
  const bottom = finiteViewNum(row.bottom, -1e6, 1e6);
  const left = finiteViewNum(row.left, -1e6, 1e6);
  const right = finiteViewNum(row.right, -1e6, 1e6);
  if (!pos || !quat || !up || !target) return null;
  if (zoom == null || top == null || bottom == null || left == null || right == null) return null;
  if (!(top > bottom) || !(right > left)) return null;
  return {
    pos: pos as CustomAbutmentSharedView["pos"],
    quat: quat as CustomAbutmentSharedView["quat"],
    up: up as CustomAbutmentSharedView["up"],
    target: target as CustomAbutmentSharedView["target"],
    zoom,
    top,
    bottom,
    left,
    right,
    savedAt: Number(row.savedAt) || 0,
    updatedBy: String(row.updatedBy || ""),
    originSocketId: String(row.originSocketId || ""),
  };
}

export type CustomAbutmentSharedChrome = {
  showUpper: boolean;
  showLower: boolean;
  scanTransparency: number;
  showFinishLine: boolean;
  showFixtureAnalog: boolean;
  gumballOn: boolean;
  colorMapping: boolean;
  centerGuide: "off" | "center" | "grid";
  selectedTeeth: string[];
  visibleTeeth: Record<string, boolean>;
  shownScanbodies: Record<string, boolean>;
  shownPredictedCrowns: Record<string, boolean>;
  expandedTeeth: Record<string, boolean>;
  savedAt: number;
  updatedBy: string;
};

function chromeToothMap(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[1-4][1-8]$/.test(key) || Object.keys(out).length >= 32) continue;
    if (value === true || value === false) out[key] = value;
  }
  return out;
}

/** 스냅샷·소켓의 상악 표시·선택·투명도. 저장된 시각이 없으면 없는 것으로 본다. */
export function parseCustomAbutmentSharedChrome(raw: unknown): CustomAbutmentSharedChrome | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const savedAt = Number(row.savedAt) || 0;
  if (!(savedAt > 0)) return null;
  const transparency = Number(row.scanTransparency);
  const selected = Array.isArray(row.selectedTeeth)
    ? row.selectedTeeth.map(String).filter((tooth) => /^[1-4][1-8]$/.test(tooth)).slice(0, 16)
    : [];
  return {
    showUpper: row.showUpper !== false,
    showLower: row.showLower !== false,
    scanTransparency: Number.isFinite(transparency) ? Math.min(90, Math.max(0, transparency)) : 0,
    showFinishLine: row.showFinishLine !== false,
    showFixtureAnalog: row.showFixtureAnalog !== false,
    gumballOn: row.gumballOn !== false,
    colorMapping: row.colorMapping !== false,
    centerGuide: row.centerGuide === "center" || row.centerGuide === "grid" ? row.centerGuide : "off",
    selectedTeeth: selected,
    visibleTeeth: chromeToothMap(row.visibleTeeth),
    shownScanbodies: chromeToothMap(row.shownScanbodies),
    shownPredictedCrowns: chromeToothMap(row.shownPredictedCrowns),
    expandedTeeth: chromeToothMap(row.expandedTeeth),
    savedAt,
    updatedBy: String(row.updatedBy || ""),
  };
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
  gracePromoteAt: string | null;
};

export type RemoteCustomAbutmentSnapshot = {
  design: (CachedCustomAbutmentDesign & { designFresh: boolean }) | null;
  biteCheck: CachedBiteCheck | null;
  jawPose: CustomAbutmentJawPose | null;
  archFrame: CustomAbutmentArchFrame | null;
  chat: CustomAbutmentChatTurn[];
  /** 어벗 STL이 S3에 있다. 없으면 의뢰자 화면이 다시 올린다. */
  hasStl: boolean;
  paint: CustomAbutmentPaintRecord | null;
  mode: "confirmed" | "manual" | null;
  manualDesign: { at?: string; message?: string; hasPaint?: boolean } | null;
  feeGuide: CustomAbutmentRouteFeeGuide | null;
  choice: CustomAbutmentChoice;
  sharedView: CustomAbutmentSharedView | null;
  chrome: CustomAbutmentSharedChrome | null;
};

export type CustomAbutmentSnapshotUploadTooth = {
  toothNumber: string;
  fileName: string;
  fixture: MatchedScanbodyFixture;
  overrides: Partial<CustomAbutmentDesignParams>;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
  baselineParams?: Partial<CustomAbutmentDesignParams>;
  baselineMetrics?: CustomAbutmentDesignMetrics;
  editedInfoFields?: string[];
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
  baselineParams?: Partial<CustomAbutmentDesignParams>;
  baselineMetrics?: CustomAbutmentDesignMetrics;
  editedInfoFields?: string[];
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

type SnapshotShell = {
  id: string;
  chat: CustomAbutmentChatTurn[];
  paint: CustomAbutmentPaintRecord | null;
  mode: RemoteCustomAbutmentSnapshot["mode"];
  manualDesign: RemoteCustomAbutmentSnapshot["manualDesign"];
  feeGuide: CustomAbutmentRouteFeeGuide | null;
  choice: CustomAbutmentChoice;
  sharedView: CustomAbutmentSharedView | null;
  chrome: CustomAbutmentSharedChrome | null;
  biteCheck: CachedBiteCheck | null;
  jawPose: CustomAbutmentJawPose | null;
  archFrame: CustomAbutmentArchFrame | null;
  design: {
    version: number;
    fitVersion: number;
    savedAt: number;
    biteCheck?: CachedBiteCheck | null;
    jawPose?: CustomAbutmentJawPose | null;
    archFrame?: CustomAbutmentArchFrame | null;
    teeth: Array<Record<string, unknown>>;
  } | null;
};

const snapshotShellInflight = new Map<string, Promise<SnapshotShell | null>>();
const snapshotFullInflight = new Map<string, Promise<RemoteCustomAbutmentSnapshot | null>>();

function rememberInflight<T>(
  map: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = map.get(key);
  if (existing) return existing;
  const job = factory().finally(() => {
    if (map.get(key) === job) map.delete(key);
  });
  map.set(key, job);
  return job;
}

function emptySnapshot(
  shell: Pick<
    SnapshotShell,
    "chat" | "paint" | "mode" | "manualDesign" | "feeGuide" | "choice" | "sharedView" | "chrome" | "biteCheck" | "jawPose" | "archFrame"
  >,
): RemoteCustomAbutmentSnapshot {
  return {
    design: null,
    biteCheck: shell.biteCheck ?? null,
    jawPose: shell.jawPose ?? null,
    archFrame: shell.archFrame ?? null,
    chat: shell.chat,
    hasStl: false,
    paint: shell.paint,
    mode: shell.mode,
    manualDesign: shell.manualDesign,
    feeGuide: shell.feeGuide,
    choice: shell.choice,
    sharedView: shell.sharedView,
    chrome: shell.chrome,
  };
}

async function fetchSnapshotShell(token: string, id: string): Promise<SnapshotShell | null> {
  return rememberInflight(snapshotShellInflight, id, async () => {
    try {
      const res = await request<{
        data?: {
          design?: {
            version?: number;
            fitVersion?: number;
            savedAt?: number;
            chat?: unknown;
            biteCheck?: unknown;
            jawPose?: unknown;
            archFrame?: unknown;
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
          choice?: {
            cancelDeadlineAt?: string | null;
            labCheckedAt?: string | null;
            gracePromoteAt?: string | null;
          } | null;
          sharedView?: unknown;
          chrome?: unknown;
          biteCheck?: unknown;
          jawPose?: unknown;
          archFrame?: unknown;
        };
      }>({
        path: `/api/ai/custom-abutment-design-snapshot?transferId=${encodeURIComponent(id)}`,
        method: "GET",
        token,
        // 모달을 다시 열 때는 상대가 방금 PUT한 스냅샷이 필요하다. 1초 GET 캐시를 쓰지 않는다.
        skipCache: true,
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
      const raw = res.data.data.design;
      const teeth = Array.isArray(raw?.teeth) ? raw.teeth : [];
      return {
        id,
        chat,
        paint,
        mode,
        manualDesign: res.data.data.manualDesign ?? null,
        feeGuide,
        choice: {
          cancelDeadlineAt: rawChoice?.cancelDeadlineAt
            ? String(rawChoice.cancelDeadlineAt)
            : null,
          labCheckedAt: rawChoice?.labCheckedAt ? String(rawChoice.labCheckedAt) : null,
          gracePromoteAt: rawChoice?.gracePromoteAt
            ? String(rawChoice.gracePromoteAt)
            : null,
        },
        sharedView: parseCustomAbutmentSharedView(res.data.data.sharedView),
        chrome: parseCustomAbutmentSharedChrome(res.data.data.chrome),
        biteCheck:
          normalizeCachedBiteCheck(res.data.data.biteCheck) ??
          normalizeCachedBiteCheck(raw?.biteCheck),
        jawPose: normalizeJawPose(res.data.data.jawPose) ?? normalizeJawPose(raw?.jawPose),
        archFrame:
          normalizeArchFrame(res.data.data.archFrame) ?? normalizeArchFrame(raw?.archFrame),
        design:
          raw && teeth.length > 0
            ? {
                version: Number(raw.version) || 0,
                fitVersion: Number(raw.fitVersion) || 0,
                savedAt: Number(raw.savedAt) || 0,
                biteCheck: normalizeCachedBiteCheck(raw.biteCheck),
                jawPose: normalizeJawPose(raw.jawPose),
                archFrame: normalizeArchFrame(raw.archFrame),
                teeth,
              }
            : null,
      };
    } catch {
      return null;
    }
  });
}

async function toothFromSnapshotRow(
  token: string,
  row: Record<string, unknown>,
  stlRevision: number,
): Promise<{ tooth: CachedCustomAbutmentTooth; fromS3: boolean } | null> {
  const fixture = row.fixture as MatchedScanbodyFixture | null;
  if (!fixture) return null;
  const fileName = String(row.fileName || "abutment.stl");
  const s3Key = String(row.s3Key || "");
  const crownKey = String(row.crownS3Key || "");
  const [abutmentPositions, crownPositions] = await Promise.all([
    s3Key ? positionsFromStl(token, s3Key, fileName, stlRevision) : Promise.resolve(null),
    crownKey
      ? positionsFromStl(
          token,
          crownKey,
          fileName.replace(/\.stl$/i, "") + "-crown.stl",
          stlRevision,
        )
      : Promise.resolve(null),
  ]);
  let localPositions = abutmentPositions;
  let crownLocalPositions = crownPositions;
  const marginLoopLocal = base64ToBuffer(String(row.marginLoopLocal || "")) || new ArrayBuffer(0);
  const enameloplastyLocalPositions = base64ToBuffer(String(row.enameloplastyLocal || ""));
  if (!localPositions) localPositions = base64ToBuffer(String(row.localPositions || ""));
  if (!crownLocalPositions) {
    crownLocalPositions = base64ToBuffer(String(row.crownLocalPositions || ""));
  }
  const editedInfoFields = normalizeEditedInfoFields(row.editedInfoFields);
  const shared = {
    toothNumber: String(row.toothNumber || ""),
    fileName,
    fixture,
    overrides: (row.overrides || {}) as Partial<CustomAbutmentDesignParams>,
    params: row.params as CustomAbutmentDesignParams,
    metrics: row.metrics as CustomAbutmentDesignMetrics,
    ...(row.baselineParams && typeof row.baselineParams === "object"
      ? { baselineParams: row.baselineParams as CustomAbutmentDesignParams }
      : {}),
    ...(row.baselineMetrics && typeof row.baselineMetrics === "object"
      ? { baselineMetrics: row.baselineMetrics as CustomAbutmentDesignMetrics }
      : {}),
    ...(editedInfoFields ? { editedInfoFields } : {}),
    ...(row.gumballEdit && typeof row.gumballEdit === "object"
      ? { gumballEdit: row.gumballEdit as AbutmentEdit }
      : {}),
    ...(row.gumballBaseParams && typeof row.gumballBaseParams === "object"
      ? { gumballBaseParams: row.gumballBaseParams as Partial<CustomAbutmentDesignParams> }
      : {}),
    ...(row.gumballBaseMetrics && typeof row.gumballBaseMetrics === "object"
      ? { gumballBaseMetrics: row.gumballBaseMetrics as CustomAbutmentDesignMetrics }
      : {}),
    ...(row.proposalInput && typeof row.proposalInput === "object"
      ? { proposalInput: row.proposalInput as Partial<CustomAbutmentDesignParams> }
      : {}),
    ...(normalizeInsertionAxis(row.insertionAxisWorld)
      ? { insertionAxisWorld: normalizeInsertionAxis(row.insertionAxisWorld)! }
      : {}),
  };
  // 실시간 저장은 정점 없이 온다. 받는 쪽이 스캔 위에서 형상을 다시 만든다.
  if (!localPositions || localPositions.byteLength < 36) {
    if (!row.params || typeof row.params !== "object") return null;
    return {
      fromS3: false,
      tooth: {
        ...shared,
        localPositions: new ArrayBuffer(0),
        crownLocalPositions: new ArrayBuffer(0),
        marginLoopLocal: new ArrayBuffer(0),
        regenFromMeta: true,
      },
    };
  }
  if (!crownLocalPositions) crownLocalPositions = new ArrayBuffer(0);
  return {
    fromS3: Boolean(abutmentPositions),
    tooth: {
      ...shared,
      localPositions,
      crownLocalPositions,
      marginLoopLocal,
      ...(enameloplastyLocalPositions ? { enameloplastyLocalPositions } : {}),
      ...(s3Key ? { sourceS3Key: s3Key, sourceCrownS3Key: crownKey } : {}),
    },
  };
}

async function hydrateSnapshotShell(
  token: string,
  shellPromise: Promise<SnapshotShell | null>,
): Promise<RemoteCustomAbutmentSnapshot | null> {
  const shell = await shellPromise;
  if (!shell) return null;
  if (!shell.design) return emptySnapshot(shell);
  const stlRevision = shell.design.savedAt || shell.design.version || 0;
  const loaded = await Promise.all(
    shell.design.teeth.map((row) => toothFromSnapshotRow(token, row, stlRevision)),
  );
  const teeth = loaded.flatMap((row) => (row ? [row.tooth] : []));
  if (teeth.length === 0) return emptySnapshot(shell);
  const { version, fitVersion, savedAt } = shell.design;
  const biteCheck = normalizeCachedBiteCheck(shell.design.biteCheck) ?? shell.biteCheck;
  const jawPose = normalizeJawPose(shell.design.jawPose) ?? shell.jawPose;
  const archFrame = normalizeArchFrame(shell.design.archFrame) ?? shell.archFrame;
  return {
    chat: shell.chat,
    biteCheck,
    jawPose,
    archFrame,
    hasStl: loaded.some((row) => Boolean(row?.fromS3)),
    paint: shell.paint,
    mode: shell.mode,
    manualDesign: shell.manualDesign,
    feeGuide: shell.feeGuide,
    choice: shell.choice,
    sharedView: shell.sharedView,
    chrome: shell.chrome,
    design: {
      key: shell.id,
      version,
      fitVersion,
      savedAt,
      alignedScans: [],
      ...(biteCheck ? { biteCheck } : { biteCheck: null }),
      ...(jawPose ? { jawPose } : { jawPose: null }),
      ...(archFrame ? { archFrame } : { archFrame: null }),
      teeth,
      chat: shell.chat,
      designFresh:
        version === CUSTOM_ABUTMENT_DESIGN_VERSION && fitVersion === CUSTOM_ABUTMENT_FIT_VERSION,
    },
  };
}

/** 확정 여부는 JSON만, 형상 STL은 `full()`을 부를 때 받는다. 같은 의뢰는 요청을 한 번 공유한다. */
export function beginCustomAbutmentSnapshot(
  token: string,
  transferId: string,
): {
  mode: Promise<RemoteCustomAbutmentSnapshot["mode"] | "missing">;
  full: () => Promise<RemoteCustomAbutmentSnapshot | null>;
} {
  const id = transferId.trim();
  if (!id) return { mode: Promise.resolve("missing"), full: async () => null };
  const shell = fetchSnapshotShell(token, id);
  return {
    mode: shell.then((row) => (row ? row.mode : "missing")).catch(() => "missing" as const),
    full: () => {
      const existing = snapshotFullInflight.get(id);
      if (existing) return existing;
      const job = hydrateSnapshotShell(token, shell).finally(() => {
        if (snapshotFullInflight.get(id) === job) snapshotFullInflight.delete(id);
      });
      snapshotFullInflight.set(id, job);
      return job;
    },
  };
}

/** 의뢰자에 저장된 형상·대화·3D 페인트. */
export function fetchCustomAbutmentSnapshot(
  token: string,
  transferId: string,
): Promise<RemoteCustomAbutmentSnapshot | null> {
  return beginCustomAbutmentSnapshot(token, transferId).full();
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
        ...(row.baselineParams ? { baselineParams: row.baselineParams } : {}),
        ...(row.baselineMetrics ? { baselineMetrics: row.baselineMetrics } : {}),
        ...(row.editedInfoFields ? { editedInfoFields: row.editedInfoFields } : {}),
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
    invalidateApiGetCache("custom-abutment-design-snapshot");
    snapshotShellInflight.delete(id);
    snapshotFullInflight.delete(id);
  })().catch((err) => console.warn("[custom-abutment] snapshot upload failed", err));
}

export type CustomAbutmentDesignSyncTooth = {
  toothNumber: string;
  fileName: string;
  fixture: MatchedScanbodyFixture;
  overrides: Partial<CustomAbutmentDesignParams>;
  params: CustomAbutmentDesignParams;
  metrics: CustomAbutmentDesignMetrics;
  /** 자동 생성 직후 원점 조정값. 관리자 전후 비교·생성 로직에 쓴다. */
  baselineParams?: Partial<CustomAbutmentDesignParams>;
  /** 정보 패널 리셋 기준 측정값. */
  baselineMetrics?: CustomAbutmentDesignMetrics;
  /** 정보 패널에서 손댄 필드. 빈 배열이면 표시를 지운다. */
  editedInfoFields?: string[];
  gumballEdit?: AbutmentEdit;
  gumballBaseParams?: Partial<CustomAbutmentDesignParams>;
  gumballBaseMetrics?: CustomAbutmentDesignMetrics;
  proposalInput?: Partial<CustomAbutmentDesignParams>;
  variantId?: string;
  picker?: boolean;
  candidates?: Array<{ id: string; label: string }>;
  candidateIndex?: number;
  /** 브리지에서 맞춘 공통 삽입축(월드). */
  insertionAxisWorld?: [number, number, number];
};

export type CustomAbutmentDesignSyncMeta = {
  transferId?: string;
  savedAt: number;
  updatedBy?: string;
  version: number;
  fitVersion: number;
  teeth: CustomAbutmentDesignSyncTooth[];
  mode?: "confirmed" | "manual";
  biteCheck?: CachedBiteCheck | null;
  jawPose?: CustomAbutmentJawPose | null;
  archFrame?: CustomAbutmentArchFrame | null;
  choice?: {
    cancelDeadlineAt?: string | null;
    gracePromoteAt?: string | null;
    labCheckedAt?: string | null;
  };
};

export function parseCustomAbutmentDesignSyncMeta(raw: unknown): CustomAbutmentDesignSyncMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const teethIn = Array.isArray(row.teeth) ? row.teeth : [];
  const teeth: CustomAbutmentDesignSyncTooth[] = [];
  for (const item of teethIn) {
    if (!item || typeof item !== "object") continue;
    const tooth = item as Record<string, unknown>;
    const toothNumber = String(tooth.toothNumber || "").trim();
    const fixture = tooth.fixture;
    if (!/^[1-4][1-8]$/.test(toothNumber) || !fixture || typeof fixture !== "object") continue;
    const jaw = (fixture as { jaw?: unknown }).jaw;
    if (jaw !== "upper" && jaw !== "lower") continue;
    const insertionAxisWorld = normalizeInsertionAxis(tooth.insertionAxisWorld);
    const editedInfoFields = normalizeEditedInfoFields(tooth.editedInfoFields);
    teeth.push({
      toothNumber,
      fileName: String(tooth.fileName || ""),
      fixture: fixture as MatchedScanbodyFixture,
      overrides: (tooth.overrides || {}) as Partial<CustomAbutmentDesignParams>,
      params: (tooth.params || {}) as CustomAbutmentDesignParams,
      metrics: (tooth.metrics || {}) as CustomAbutmentDesignMetrics,
      ...(insertionAxisWorld ? { insertionAxisWorld } : {}),
      ...(tooth.baselineParams && typeof tooth.baselineParams === "object"
        ? { baselineParams: tooth.baselineParams as Partial<CustomAbutmentDesignParams> }
        : {}),
      ...(tooth.baselineMetrics && typeof tooth.baselineMetrics === "object"
        ? { baselineMetrics: tooth.baselineMetrics as CustomAbutmentDesignMetrics }
        : {}),
      ...(editedInfoFields ? { editedInfoFields } : {}),
      ...(tooth.gumballEdit && typeof tooth.gumballEdit === "object"
        ? { gumballEdit: tooth.gumballEdit as AbutmentEdit }
        : {}),
      ...(tooth.gumballBaseParams && typeof tooth.gumballBaseParams === "object"
        ? { gumballBaseParams: tooth.gumballBaseParams as Partial<CustomAbutmentDesignParams> }
        : {}),
      ...(tooth.gumballBaseMetrics && typeof tooth.gumballBaseMetrics === "object"
        ? { gumballBaseMetrics: tooth.gumballBaseMetrics as CustomAbutmentDesignMetrics }
        : {}),
      ...(tooth.proposalInput && typeof tooth.proposalInput === "object"
        ? { proposalInput: tooth.proposalInput as Partial<CustomAbutmentDesignParams> }
        : {}),
      ...(typeof tooth.variantId === "string" && tooth.variantId
        ? { variantId: tooth.variantId }
        : {}),
      ...(tooth.picker === true ? { picker: true } : {}),
      ...(Array.isArray(tooth.candidates)
        ? {
            candidates: tooth.candidates
              .filter((item) => item && typeof item === "object")
              .slice(0, 3)
              .map((item) => ({
                id: String((item as { id?: unknown }).id || ""),
                label: String((item as { label?: unknown }).label || ""),
              }))
              .filter((item) => item.id),
          }
        : {}),
      ...(Number.isInteger(tooth.candidateIndex)
        ? { candidateIndex: Number(tooth.candidateIndex) }
        : {}),
    });
  }
  if (teeth.length === 0) return null;
  const mode = row.mode === "confirmed" || row.mode === "manual" ? row.mode : undefined;
  const choiceRaw = row.choice;
  const choice =
    choiceRaw && typeof choiceRaw === "object"
      ? {
          cancelDeadlineAt:
            (choiceRaw as { cancelDeadlineAt?: string | null }).cancelDeadlineAt ?? null,
          gracePromoteAt: (choiceRaw as { gracePromoteAt?: string | null }).gracePromoteAt ?? null,
          labCheckedAt: (choiceRaw as { labCheckedAt?: string | null }).labCheckedAt ?? null,
        }
      : undefined;
  const biteCheck = normalizeCachedBiteCheck(row.biteCheck);
  const jawPose = normalizeJawPose(row.jawPose);
  const archFrame = normalizeArchFrame(row.archFrame);
  return {
    transferId: String(row.transferId || ""),
    savedAt: Number(row.savedAt) || 0,
    updatedBy: String(row.updatedBy || ""),
    version: Number(row.version) || 0,
    fitVersion: Number(row.fitVersion) || 0,
    teeth,
    ...(biteCheck ? { biteCheck } : {}),
    ...(jawPose ? { jawPose } : {}),
    ...(archFrame ? { archFrame } : {}),
    ...(mode ? { mode } : {}),
    ...(choice ? { choice } : {}),
  };
}

/** 소켓으로 도착한 픽스처·조정값을, 정점 없는 서버 디자인으로 푼다. */
export function cachedDesignFromSyncMeta(
  key: string,
  meta: CustomAbutmentDesignSyncMeta,
  carry?: {
    alignedScans?: CachedAlignedScan[];
    biteCheck?: CachedBiteCheck | null;
    jawPose?: CustomAbutmentJawPose | null;
    archFrame?: CustomAbutmentArchFrame | null;
    chat?: CustomAbutmentChatTurn[];
  } | null,
): CachedCustomAbutmentDesign & { designFresh: boolean } {
  const biteCheck = normalizeCachedBiteCheck(meta.biteCheck) ?? normalizeCachedBiteCheck(carry?.biteCheck);
  const jawPose = normalizeJawPose(meta.jawPose) ?? normalizeJawPose(carry?.jawPose);
  const archFrame = normalizeArchFrame(meta.archFrame) ?? normalizeArchFrame(carry?.archFrame);
  return freshenCachedDesign({
    key,
    version: Number(meta.version) || 0,
    fitVersion: Number(meta.fitVersion) || 0,
    savedAt: meta.savedAt > 0 ? meta.savedAt : Date.now(),
    alignedScans: Array.isArray(carry?.alignedScans) ? carry.alignedScans : [],
    biteCheck,
    jawPose,
    archFrame,
    teeth: meta.teeth.map((row) => ({
      toothNumber: row.toothNumber,
      fileName: row.fileName,
      fixture: row.fixture,
      overrides: row.overrides,
      params: row.params,
      metrics: row.metrics,
      ...(row.baselineParams ? { baselineParams: row.baselineParams as CustomAbutmentDesignParams } : {}),
      ...(row.baselineMetrics ? { baselineMetrics: row.baselineMetrics } : {}),
      ...(row.editedInfoFields ? { editedInfoFields: row.editedInfoFields } : {}),
      ...(row.gumballEdit ? { gumballEdit: row.gumballEdit } : {}),
      ...(row.gumballBaseParams ? { gumballBaseParams: row.gumballBaseParams } : {}),
      ...(row.gumballBaseMetrics ? { gumballBaseMetrics: row.gumballBaseMetrics } : {}),
      ...(row.proposalInput ? { proposalInput: row.proposalInput } : {}),
      ...(row.insertionAxisWorld ? { insertionAxisWorld: row.insertionAxisWorld } : {}),
      localPositions: new ArrayBuffer(0),
      crownLocalPositions: new ArrayBuffer(0),
      marginLoopLocal: new ArrayBuffer(0),
      regenFromMeta: true,
    })),
    chat: carry?.chat ?? [],
  });
}

/** 편집 동기화. STL을 올리지 않고 조정값만 저장한 뒤 상대 화면에 소켓으로 전달된다. */
export async function publishCustomAbutmentDesignMeta(
  token: string,
  transferId: string,
  record: {
    version: number;
    fitVersion: number;
    baseSavedAt: number;
    savedAt?: number;
    teeth: readonly CustomAbutmentDesignSyncTooth[];
    biteCheck?: CachedBiteCheck | null;
    jawPose?: CustomAbutmentJawPose | null;
    archFrame?: CustomAbutmentArchFrame | null;
    chrome?: Record<string, unknown> | null;
    view?: Record<string, unknown> | null;
  },
): Promise<
  | { ok: true; savedAt: number }
  | { ok: false; stale: true; design: CustomAbutmentDesignSyncMeta }
  | { ok: false; stale: false }
> {
  const id = transferId.trim();
  if (!token || !id || record.teeth.length === 0) return { ok: false, stale: false };
  const res = await request<{
    code?: string;
    data?: { savedAt?: number } & Record<string, unknown>;
  }>({
    path: "/api/ai/custom-abutment-design-snapshot",
    method: "PUT",
    token,
    jsonBody: {
      transferId: id,
      version: record.version,
      fitVersion: record.fitVersion,
      baseSavedAt: record.baseSavedAt,
      ...(record.savedAt ? { savedAt: record.savedAt } : {}),
      teeth: record.teeth,
      ...(record.biteCheck ? { biteCheck: record.biteCheck } : {}),
      ...(record.jawPose ? { jawPose: record.jawPose } : {}),
      ...(record.archFrame ? { archFrame: record.archFrame } : {}),
      ...(record.chrome ? { chrome: record.chrome } : {}),
      ...(record.view ? { view: record.view } : {}),
    },
  });
  if (res.status === 409) {
    const design = parseCustomAbutmentDesignSyncMeta(res.data?.data);
    if (design) return { ok: false, stale: true, design };
    return { ok: false, stale: false };
  }
  if (!res.ok) return { ok: false, stale: false };
  forgetCustomAbutmentSnapshot(id);
  return { ok: true, savedAt: Number(res.data?.data?.savedAt) || Date.now() };
}

/** 화면·상단 옵션·카메라. 채팅은 넣지 않는다. 치아가 없어도 세션에 남긴다. */
export async function publishCustomAbutmentWorkSession(
  token: string,
  transferId: string,
  record: {
    savedAt: number;
    chrome?: Record<string, unknown> | null;
    view?: Record<string, unknown> | null;
    biteCheck?: CachedBiteCheck | null;
    jawPose?: CustomAbutmentJawPose | null;
    archFrame?: CustomAbutmentArchFrame | null;
  },
): Promise<void> {
  const id = transferId.trim();
  if (
    !token ||
    !id ||
    (!record.chrome && !record.view && !record.archFrame && !record.jawPose && !record.biteCheck)
  ) {
    return;
  }
  const res = await request({
    path: "/api/ai/custom-abutment-design-snapshot",
    method: "PUT",
    token,
    jsonBody: {
      transferId: id,
      savedAt: record.savedAt,
      ...(record.chrome ? { chrome: record.chrome } : {}),
      ...(record.view ? { view: record.view } : {}),
      ...(record.biteCheck ? { biteCheck: record.biteCheck } : {}),
      ...(record.jawPose ? { jawPose: record.jawPose } : {}),
      ...(record.archFrame ? { archFrame: record.archFrame } : {}),
    },
  });
  if (!res.ok) throw new Error("작업 세션을 저장하지 못했습니다.");
  forgetCustomAbutmentSnapshot(id);
}

/** 모달을 다시 열 때 방금 저장된 스냅샷을 받게 캐시를 비운다. */
export function forgetCustomAbutmentSnapshot(transferId: string): void {
  const id = transferId.trim();
  if (id) {
    snapshotShellInflight.delete(id);
    snapshotFullInflight.delete(id);
  }
  invalidateApiGetCache("custom-abutment-design-snapshot");
}

export function classifyCustomAbutmentDesignPublish(
  result: Awaited<ReturnType<typeof publishCustomAbutmentDesignMeta>>,
):
  | { kind: "ok"; savedAt: number }
  | { kind: "stale"; design: CustomAbutmentDesignSyncMeta }
  | { kind: "fail" } {
  if (result.ok === true) return { kind: "ok", savedAt: result.savedAt };
  // strictNullChecks가 꺼져 있어 ok:false 갈래가 좁혀지지 않는다.
  const failed = result as {
    stale?: boolean;
    design?: CustomAbutmentDesignSyncMeta;
  };
  if (failed.stale && failed.design) return { kind: "stale", design: failed.design };
  return { kind: "fail" };
}

export async function publishCustomAbutmentSharedView(
  token: string,
  transferId: string,
  savedAt: number,
  view: Omit<CustomAbutmentSharedView, "savedAt" | "updatedBy">,
): Promise<{ saved: boolean; savedAt: number; view: CustomAbutmentSharedView | null }> {
  const id = transferId.trim();
  if (!token || !id) return { saved: false, savedAt: 0, view: null };
  const res = await request<{
    data?: { saved?: boolean; savedAt?: number; view?: unknown };
  }>({
    path: "/api/ai/custom-abutment-design-view",
    method: "PUT",
    token,
    jsonBody: { transferId: id, savedAt, view },
  });
  const data = res.data?.data;
  return {
    saved: Boolean(res.ok && data?.saved),
    savedAt: Number(data?.savedAt) || 0,
    view: parseCustomAbutmentSharedView(data?.view),
  };
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

function uploadedToothFromExisting(
  row: CustomAbutmentSnapshotUploadTooth,
  existing: { s3Key: string; crownS3Key?: string },
): UploadedCustomAbutmentSnapshotTooth {
  const enameloplastyLocal =
    row.enameloplastyLocalPositions && row.enameloplastyLocalPositions.length >= 9
      ? bytesToBase64(toArrayBuffer(row.enameloplastyLocalPositions))
      : undefined;
  return {
    toothNumber: row.toothNumber,
    fileName: row.fileName || `#${row.toothNumber}.stl`,
    fixture: row.fixture,
    overrides: row.overrides,
    params: row.params,
    metrics: row.metrics,
    ...(row.baselineParams ? { baselineParams: row.baselineParams } : {}),
    ...(row.baselineMetrics ? { baselineMetrics: row.baselineMetrics } : {}),
    ...(row.editedInfoFields ? { editedInfoFields: row.editedInfoFields } : {}),
    ...(row.gumballEdit ? { gumballEdit: row.gumballEdit } : {}),
    ...(row.gumballBaseParams ? { gumballBaseParams: row.gumballBaseParams } : {}),
    ...(row.gumballBaseMetrics ? { gumballBaseMetrics: row.gumballBaseMetrics } : {}),
    s3Key: existing.s3Key,
    crownS3Key: existing.crownS3Key || "",
    size: row.stlBlob.size,
    marginLoopLocal: bytesToBase64(toArrayBuffer(row.marginLoopLocal)),
    ...(enameloplastyLocal ? { enameloplastyLocal } : {}),
  };
}

export async function confirmCustomAbutmentDesignRemote(
  token: string,
  transferId: string,
  payload: {
    patientName?: string;
    version: number;
    fitVersion: number;
    teeth: readonly CustomAbutmentSnapshotUploadTooth[];
    /** 서버에 이미 있는 프리뷰 STL. 있으면 바이트를 다시 올리지 않는다. */
    existingS3?: Readonly<Record<string, { s3Key: string; crownS3Key?: string }>>;
  },
): Promise<{
  ok: boolean;
  message?: string;
  cancelDeadlineAt?: string | null;
  gracePromoteAt?: string | null;
}> {
  const id = transferId.trim();
  if (!token || !id) return { ok: false, message: "의뢰 정보가 없습니다." };
  const existing = payload.existingS3;
  const canReuse =
    Boolean(existing) &&
    payload.teeth.length > 0 &&
    payload.teeth.every((row) => Boolean(existing?.[row.toothNumber]?.s3Key));
  const teeth = canReuse
    ? payload.teeth.map((row) => uploadedToothFromExisting(row, existing![row.toothNumber]!))
    : await uploadCustomAbutmentSnapshotTeeth(token, id, payload.teeth);
  const res = await request<{
    message?: string;
    data?: { cancelDeadlineAt?: string | null; gracePromoteAt?: string | null };
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
  const grace = res.data?.data?.gracePromoteAt;
  return {
    ok: res.ok,
    message: res.data?.message,
    cancelDeadlineAt: deadline ? String(deadline) : null,
    gracePromoteAt: grace ? String(grace) : deadline ? String(deadline) : null,
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
