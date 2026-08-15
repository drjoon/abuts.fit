import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import {
  saveFile as saveFileToIndexedDb,
  deleteFile as deleteFileFromIndexedDb,
  getFile as getFileFromIndexedDb,
} from "@/shared/storage/fileIndexedDB";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/practiceTransferAccept.ts
// - web/frontend/rules.md (practice 최근 전송 기공소 SSOT)
export {
  PRACTICE_ACCEPTED_HINT,
} from "@/shared/practice/practiceTransferAccept";

export type SearchBusinessResult = {
  _id: string;
  name: string;
  representativeName?: string;
  businessNumber?: string;
  address?: string;
  businessType?: string;
  requestorKind?: "practice" | "lab" | null;
};

/** 기공소 선택 — 서버가 검증 기공소 중 한 곳을 연결할 때 쓰는 센티널 */
export const AUTO_MATCH_LAB_ID = "__auto_match__";
export const AUTO_MATCH_LAB_NAME = "자동 매칭";
export const AUTO_MATCH_LAB_TOOLTIP =
  "어벗츠 인증 기공소가 선착순으로 수락합니다. 치과·기공소 식별 정보는 비공개입니다.";
export const AUTO_MATCH_LAB: SearchBusinessResult = {
  _id: AUTO_MATCH_LAB_ID,
  name: AUTO_MATCH_LAB_NAME,
  businessType: "requestor",
};

/**
 * 자동매칭 센티널 여부.
 * 서버/임시저장 복원 시 anchor가 비어 `draft-lab:자동 매칭`으로 남을 수 있어
 * 예약 표시명도 함께 본다.
 */
export const isAutoMatchLab = (
  lab?: { _id?: string | null; name?: string | null } | null,
) => {
  const id = String(lab?._id || "").trim();
  if (id === AUTO_MATCH_LAB_ID) return true;
  if (id === `draft-lab:${AUTO_MATCH_LAB_NAME}`) return true;
  return String(lab?.name || "").trim() === AUTO_MATCH_LAB_NAME;
};

/** 복원 시 자동매칭이면 센티널로 정규화, 아니면 null(호출측에서 일반 기공소 구성) */
export const coerceAutoMatchLab = (params: {
  labId?: string | null;
  labName?: string | null;
  matchingMode?: string | null;
}): SearchBusinessResult | null => {
  const id = String(params.labId || "").trim();
  const name = String(params.labName || "").trim();
  const mode = String(params.matchingMode || "").trim();
  if (
    mode === "auto" ||
    id === AUTO_MATCH_LAB_ID ||
    id === `draft-lab:${AUTO_MATCH_LAB_NAME}` ||
    name === AUTO_MATCH_LAB_NAME
  ) {
    return AUTO_MATCH_LAB;
  }
  return null;
};

type ClassifiedUploadBatch = {
  modelFiles: File[];
  rejectedFiles: { name: string; reason: string }[];
  ignoredFiles: { name: string; reason: string }[];
};

type PracticeFileCacheMeta = {
  key: string;
  size: number;
  addedAt: number;
};

type Options = {
  fileCacheMetaKey?: string;
  fileCacheMaxTotalBytes?: number;
};

const DEFAULT_FILE_CACHE_META_KEY = "practice_dropzone_file_cache_meta_v1";
const DEFAULT_FILE_CACHE_MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const PRACTICE_RECENT_LABS_STORAGE_KEY = "practice_recent_labs_v3";
const PRACTICE_RECENT_LABS_MAX = 8;
/** 최근 기공소 드롭다운 상단 고정(어벗츠 자체 기공소). 이력 없어도 항상 노출. */
const ABUTS_PINNED_RECENT_LAB_NAME = "어벗츠기공소";
const ABUTS_PINNED_RECENT_LAB_SEED: SearchBusinessResult = {
  _id: `recent:${ABUTS_PINNED_RECENT_LAB_NAME}`,
  name: ABUTS_PINNED_RECENT_LAB_NAME,
  businessType: "requestor",
  requestorKind: "lab",
};

const isRealRecentLabId = (id: string) => {
  const raw = String(id || "").trim();
  return Boolean(raw) && !raw.startsWith("recent:") && !raw.startsWith("draft-lab:");
};

/** 레거시 dismiss 플래그 정리(어벗츠는 항상 고정). */
const clearLegacyAbutsRecentDismissed = () => {
  try {
    localStorage.removeItem("practice_abuts_recent_dismissed_v1");
  } catch {
    // ignore
  }
};

const toPracticeFileKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`;

const readPracticeFileCacheMeta = (metaKey: string): PracticeFileCacheMeta[] => {
  try {
    const raw = localStorage.getItem(metaKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        key: String(item?.key || ""),
        size: Number(item?.size || 0),
        addedAt: Number(item?.addedAt || 0),
      }))
      .filter((row) => row.key && Number.isFinite(row.size) && Number.isFinite(row.addedAt));
  } catch {
    return [];
  }
};

const writePracticeFileCacheMeta = (metaKey: string, rows: PracticeFileCacheMeta[]) => {
  try {
    localStorage.setItem(metaKey, JSON.stringify(rows));
  } catch {
    // ignore
  }
};

const readRecentLabs = (): SearchBusinessResult[] => {
  try {
    const raw = localStorage.getItem(PRACTICE_RECENT_LABS_STORAGE_KEY);
    if (!raw) return ensureAbutsLabPinned([]);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ensureAbutsLabPinned([]);
    const rows = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const id = String((item as { _id?: unknown })._id || "").trim();
        const name = String((item as { name?: unknown }).name || "").trim();
        if (!name) return null;
        const businessType = String(
          (item as { businessType?: unknown }).businessType || "requestor",
        ).trim();
        if (businessType && businessType !== "requestor") return null;
        const requestorKindRaw = String(
          (item as { requestorKind?: unknown }).requestorKind || "",
        ).trim();
        const requestorKind =
          requestorKindRaw === "lab" || requestorKindRaw === "practice"
            ? requestorKindRaw
            : undefined;
        if (requestorKind === "practice") return null;

        return {
          _id: id || `recent:${name}`,
          name,
          representativeName: String(
            (item as { representativeName?: unknown }).representativeName || "",
          ).trim() || undefined,
          businessNumber: String(
            (item as { businessNumber?: unknown }).businessNumber || "",
          ).trim() || undefined,
          address: String((item as { address?: unknown }).address || "").trim() || undefined,
          businessType: "requestor",
          requestorKind,
        } as SearchBusinessResult;
      })
      .filter((row): row is SearchBusinessResult => Boolean(row));
    return ensureAbutsLabPinned(rows);
  } catch {
    return ensureAbutsLabPinned([]);
  }
};

const writeRecentLabs = (rows: SearchBusinessResult[]) => {
  try {
    localStorage.setItem(PRACTICE_RECENT_LABS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
};

const normalizeRecentLab = (lab: SearchBusinessResult | null | undefined): SearchBusinessResult | null => {
  if (!lab || !String(lab.name || "").trim()) return null;
  if (isAutoMatchLab(lab)) return null;
  const name = String(lab.name || "").trim();
  const requestorKind =
    lab.requestorKind === "lab" || lab.requestorKind === "practice"
      ? lab.requestorKind
      : undefined;
  if (requestorKind === "practice") return null;
  return {
    _id: String(lab._id || `recent:${name}`).trim(),
    name,
    representativeName: String(lab.representativeName || "").trim() || undefined,
    businessNumber: String(lab.businessNumber || "").trim() || undefined,
    address: String(lab.address || "").trim() || undefined,
    businessType: "requestor",
    requestorKind,
  };
};

const recentLabDedupeKey = (lab: SearchBusinessResult) => {
  const id = String(lab._id || "").trim();
  if (id && !id.startsWith("recent:")) return `id:${id}`;
  return `name:${lab.name}|bn:${String(lab.businessNumber || "").trim()}`;
};

export const isPinnedAbutsRecentLab = (
  lab?: { name?: string | null } | null,
) => String(lab?.name || "").trim() === ABUTS_PINNED_RECENT_LAB_NAME;

/**
 * 「최근」맨 위에 어벗츠기공소를 항상 둔다.
 * - 이력/검색에 있으면 실 _id 우선
 * - 없으면 seed로라도 노출(드롭다운 열 때마다 고정)
 */
const ensureAbutsLabPinned = (
  labs: SearchBusinessResult[],
): SearchBusinessResult[] => {
  const abuts: SearchBusinessResult[] = [];
  const rest: SearchBusinessResult[] = [];
  for (const lab of labs) {
    if (isPinnedAbutsRecentLab(lab)) abuts.push(lab);
    else rest.push(lab);
  }
  const preferred =
    abuts.find((lab) => isRealRecentLabId(String(lab._id || ""))) ||
    abuts[0] ||
    ABUTS_PINNED_RECENT_LAB_SEED;
  return [preferred, ...rest].slice(0, PRACTICE_RECENT_LABS_MAX);
};

const sameRecentLab = (
  a: SearchBusinessResult,
  b: SearchBusinessResult,
): boolean => recentLabDedupeKey(a) === recentLabDedupeKey(b);

/** 실 ObjectId·대표/사업자/주소가 더 채워진 쪽을 우선. */
const mergeLabDetails = (
  current: SearchBusinessResult,
  incoming: SearchBusinessResult,
): SearchBusinessResult => {
  const currentReal = isRealRecentLabId(String(current._id || ""));
  const incomingReal = isRealRecentLabId(String(incoming._id || ""));
  const preferredId =
    currentReal && !incomingReal
      ? current._id
      : incomingReal && !currentReal
        ? incoming._id
        : current._id || incoming._id;
  return {
    ...current,
    ...incoming,
    _id: String(preferredId || current._id || incoming._id).trim(),
    name: String(incoming.name || current.name || "").trim() || current.name,
    representativeName:
      String(incoming.representativeName || "").trim() ||
      current.representativeName,
    businessNumber:
      String(incoming.businessNumber || "").trim() || current.businessNumber,
    address: String(incoming.address || "").trim() || current.address,
    requestorKind: incoming.requestorKind || current.requestorKind,
    businessType: "requestor",
  };
};

const recentLabHasDetails = (lab: SearchBusinessResult) =>
  Boolean(
    String(lab.representativeName || "").trim() ||
      String(lab.businessNumber || "").trim() ||
      String(lab.address || "").trim(),
  );

const mergeRecentLabLists = (
  primary: SearchBusinessResult[],
  secondary: SearchBusinessResult[],
): SearchBusinessResult[] => {
  const byKey = new Map<string, SearchBusinessResult>();
  for (const raw of [...primary, ...secondary]) {
    const lab = normalizeRecentLab(raw);
    if (!lab) continue;
    const key = recentLabDedupeKey(lab);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeLabDetails(existing, lab) : lab);
  }
  return ensureAbutsLabPinned([...byKey.values()]);
};

const parseSearchBusinessResults = (body: unknown): SearchBusinessResult[] => {
  const data =
    body && typeof body === "object" && "data" in (body as Record<string, unknown>)
      ? (body as { data?: unknown }).data
      : body;
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is SearchBusinessResult =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as { _id?: unknown })._id === "string" &&
          typeof (item as { name?: unknown }).name === "string",
      ),
  );
};

const parsePublicBusinessResult = (body: unknown): SearchBusinessResult | null => {
  const data =
    body && typeof body === "object" && "data" in (body as Record<string, unknown>)
      ? (body as { data?: unknown }).data
      : body;
  if (!data || typeof data !== "object") return null;
  const row = data as SearchBusinessResult;
  if (typeof row._id !== "string" || typeof row.name !== "string") return null;
  return row;
};

/** 공개 API로 최근 기공소의 대표·사업자·주소를 채운다. */
const fetchRecentLabDetails = async (
  lab: SearchBusinessResult,
): Promise<SearchBusinessResult | null> => {
  const id = String(lab._id || "").trim();
  const name = String(lab.name || "").trim();

  if (isRealRecentLabId(id)) {
    try {
      const res = await apiFetch<unknown>({
        path: `/api/businesses/public/${encodeURIComponent(id)}?businessType=${encodeURIComponent("requestor")}`,
        method: "GET",
      });
      if (res.ok) {
        const parsed = normalizeRecentLab(parsePublicBusinessResult(res.data));
        if (parsed && recentLabHasDetails(parsed)) return parsed;
      }
    } catch {
      // name search fallback
    }
  }

  if (!name) return null;
  try {
    const res = await apiFetch<unknown>({
      path: `/api/businesses/search-public?q=${encodeURIComponent(name)}&businessType=${encodeURIComponent("requestor")}&requestorKind=${encodeURIComponent("lab")}`,
      method: "GET",
    });
    if (!res.ok) return null;
    const rows = parseSearchBusinessResults(res.data);
    const exact =
      rows.find((row) => String(row.name || "").trim() === name) ||
      (isRealRecentLabId(id)
        ? rows.find((row) => String(row._id || "").trim() === id)
        : undefined) ||
      rows[0];
    return normalizeRecentLab(exact);
  } catch {
    return null;
  }
};

const enrichRecentLabsMissingDetails = async (
  labs: SearchBusinessResult[],
): Promise<SearchBusinessResult[]> => {
  const targets = labs.filter((lab) => !recentLabHasDetails(lab));
  if (targets.length === 0) return [];
  const results = await Promise.all(
    targets.map(async (lab) => {
      const enriched = await fetchRecentLabDetails(lab);
      return enriched ? mergeLabDetails(lab, enriched) : null;
    }),
  );
  return results.filter((row): row is SearchBusinessResult => Boolean(row));
};

/** 공개 검색으로 어벗츠기공소 앵커를 찾아 최근 고정용으로 정규화. */
const resolveAbutsPinnedRecentLab = async (): Promise<SearchBusinessResult | null> => {
  const asPinned = (lab: SearchBusinessResult): SearchBusinessResult | null => {
    const normalized = normalizeRecentLab({
      ...lab,
      name: ABUTS_PINNED_RECENT_LAB_NAME,
      businessType: "requestor",
      requestorKind: "lab",
    });
    if (!normalized || !isRealRecentLabId(String(normalized._id || ""))) return null;
    return normalized;
  };

  try {
    const namedRes = await apiFetch<unknown>({
      path: `/api/businesses/search-public?q=${encodeURIComponent(ABUTS_PINNED_RECENT_LAB_NAME)}&businessType=${encodeURIComponent("requestor")}&requestorKind=${encodeURIComponent("lab")}`,
      method: "GET",
    });
    if (namedRes.ok) {
      const exact = parseSearchBusinessResults(namedRes.data).find(
        (row) => String(row.name || "").trim() === ABUTS_PINNED_RECENT_LAB_NAME,
      );
      const fromNamed = exact ? asPinned(exact) : null;
      if (fromNamed) return fromNamed;
    }
  } catch {
    // fall through — internalLab 조회로 재시도
  }

  try {
    const internalRes = await apiFetch<unknown>({
      path: `/api/businesses/search-public?q=${encodeURIComponent("어벗츠")}&businessType=${encodeURIComponent("internalLab")}`,
      method: "GET",
    });
    if (!internalRes.ok) return null;
    const internal = parseSearchBusinessResults(internalRes.data).find(
      (row) => String(row.businessType || "").trim() === "internalLab",
    );
    return internal ? asPinned(internal) : null;
  } catch {
    return null;
  }
};

export const getBusinessLabel = (b: {
  name: string;
  businessNumber?: string;
}) => {
  const name = String(b?.name || "").trim();
  const bn = String(b?.businessNumber || "").trim();
  return bn ? `${name} (${bn})` : name;
};

export const usePracticeTransferStep1 = (options?: Options) => {
  const { toast } = useToast();
  const fileCacheMetaKey =
    options?.fileCacheMetaKey?.trim() || DEFAULT_FILE_CACHE_META_KEY;
  const fileCacheMaxTotalBytes =
    options?.fileCacheMaxTotalBytes ?? DEFAULT_FILE_CACHE_MAX_TOTAL_BYTES;

  const [files, setFiles] = useState<File[]>([]);
  const [selectedLab, setSelectedLab] = useState<SearchBusinessResult | null>(null);
  const [requestMemo, setRequestMemo] = useState("");
  const [labSearch, setLabSearch] = useState("");
  const [labSearchResults, setLabSearchResults] = useState<SearchBusinessResult[]>([]);
  const [labOpen, setLabOpen] = useState(false);
  const [labSearching, setLabSearching] = useState(false);
  const [recentLabs, setRecentLabs] = useState<SearchBusinessResult[]>(() =>
    ensureAbutsLabPinned(readRecentLabs()),
  );
  const [recentLabsInitialized, setRecentLabsInitialized] = useState(true);
  const didRestoreCachedFiles = useRef(false);

  useEffect(() => {
    if (didRestoreCachedFiles.current) return;
    didRestoreCachedFiles.current = true;
    let cancelled = false;

    const restoreCachedFiles = async () => {
      const meta = readPracticeFileCacheMeta(fileCacheMetaKey);
      if (meta.length === 0) return;

      const restored = await Promise.all(
        meta.map(async (row) => {
          const file = await getFileFromIndexedDb(row.key).catch(() => null);
          return file instanceof File ? file : null;
        }),
      );
      if (cancelled) return;

      const valid = restored.filter((file): file is File => file instanceof File);
      if (valid.length === 0) return;

      setFiles((prev) => (prev.length > 0 ? prev : valid));

      if (valid.length !== meta.length) {
        const validKeys = new Set(valid.map((file) => toPracticeFileKey(file)));
        writePracticeFileCacheMeta(
          fileCacheMetaKey,
          meta.filter((row) => validKeys.has(row.key)),
        );
      }
    };

    void restoreCachedFiles();
    return () => {
      cancelled = true;
    };
  }, [fileCacheMetaKey]);

  const totalSizeMb = useMemo(() => {
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    return (bytes / (1024 * 1024)).toFixed(1);
  }, [files]);

  const dedupeFiles = (input: File[]) => {
    const map = new Map<string, File>();
    for (const file of input) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!map.has(key)) map.set(key, file);
    }
    return [...map.values()];
  };

  const getFileExtLower = (name: string) => {
    const lower = String(name || "").trim().toLowerCase();
    const dot = lower.lastIndexOf(".");
    if (dot < 0) return "";
    return lower.slice(dot);
  };

  const isPracticeModelExt = (ext: string) =>
    ext === ".stl" || ext === ".ply" || ext === ".obj";

  const isPracticeImageExt = (ext: string) =>
    ext === ".png" ||
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".webp" ||
    ext === ".bmp" ||
    ext === ".gif";

  const classifyIncomingFiles = (selectedFiles: File[]): ClassifiedUploadBatch => {
    const modelFiles: File[] = [];
    const rejectedFiles: { name: string; reason: string }[] = [];
    const ignoredFiles: { name: string; reason: string }[] = [];

    selectedFiles.forEach((file) => {
      const ext = getFileExtLower(file.name);

      if (ext === ".pts") {
        ignoredFiles.push({
          name: file.name,
          reason: "PTS 파일은 업로드 대상에서 제외됩니다.",
        });
        return;
      }

      if (isPracticeModelExt(ext) || isPracticeImageExt(ext)) {
        modelFiles.push(file);
        return;
      }

      rejectedFiles.push({
        name: file.name,
        reason: "3D 모델(STL, PLY, OBJ) 및 그림 파일만 업로드할 수 있어요.",
      });
    });

    return { modelFiles, rejectedFiles, ignoredFiles };
  };

  const persistFilesToIndexedDb = async (targetFiles: File[]) => {
    const unique = dedupeFiles(targetFiles);

    for (const file of unique) {
      const key = toPracticeFileKey(file);
      await saveFileToIndexedDb(key, file);
    }

    const currentMeta = readPracticeFileCacheMeta(fileCacheMetaKey);
    const byKey = new Map(currentMeta.map((row) => [row.key, row]));
    const now = Date.now();

    for (const file of unique) {
      const key = toPracticeFileKey(file);
      byKey.set(key, {
        key,
        size: file.size,
        addedAt: now,
      });
    }

    const merged = [...byKey.values()];
    merged.sort((a, b) => a.addedAt - b.addedAt);

    let total = merged.reduce((sum, row) => sum + row.size, 0);
    const removedKeys: string[] = [];

    while (total > fileCacheMaxTotalBytes && merged.length > 0) {
      const oldest = merged.shift();
      if (!oldest) break;
      total -= oldest.size;
      removedKeys.push(oldest.key);
    }

    for (const key of removedKeys) {
      await deleteFileFromIndexedDb(key).catch(() => {
        // ignore
      });
    }

    writePracticeFileCacheMeta(fileCacheMetaKey, merged);

    if (removedKeys.length > 0) {
      toast({
        title: "파일 캐시 정리됨",
        description: "저장 용량 제한으로 오래된 파일 캐시가 자동 삭제되었습니다.",
        duration: 3500,
      });
    }

    return removedKeys;
  };

  const applyClassifiedBatch = (
    batch: ClassifiedUploadBatch,
    options?: { suppressEmptyUploadToast?: boolean },
  ) => {
    if (batch.modelFiles.length > 0) {
      setFiles((prev) => [...prev, ...batch.modelFiles]);
    }

    if (batch.rejectedFiles.length > 0) {
      toast({
        title: "일부 파일이 제외되었습니다",
        description: batch.rejectedFiles[0].reason,
        variant: "destructive",
        duration: 3200,
      });
    } else if (batch.ignoredFiles.length > 0) {
      toast({
        title: "일부 파일은 자동 제외되었어요",
        description: batch.ignoredFiles[0].reason,
        duration: 2500,
      });
    }

    if (batch.modelFiles.length === 0 && !options?.suppressEmptyUploadToast) {
      toast({
        title: "업로드할 파일이 없습니다",
        description: "선택된 파일 중 업로드 가능한 3D 모델/그림 파일이 없었습니다.",
        variant: "destructive",
        duration: 2800,
      });
    }
  };

  const handleIncomingFiles = (selectedFiles: File[]) => {
    const incoming = Array.from(selectedFiles || []);
    if (!incoming.length) return;

    const rawBatch = classifyIncomingFiles(incoming);
    const uniqueIncomingModelFiles = dedupeFiles(rawBatch.modelFiles);
    const duplicateWithinIncomingCount =
      rawBatch.modelFiles.length - uniqueIncomingModelFiles.length;

    const existingFileKeys = new Set(files.map((file) => toPracticeFileKey(file)));
    const dedupedModelFiles = uniqueIncomingModelFiles.filter(
      (file) => !existingFileKeys.has(toPracticeFileKey(file)),
    );
    const duplicateAgainstExistingCount =
      uniqueIncomingModelFiles.length - dedupedModelFiles.length;

    const duplicateExcludedCount =
      duplicateWithinIncomingCount + duplicateAgainstExistingCount;

    const batch: ClassifiedUploadBatch = {
      ...rawBatch,
      modelFiles: dedupedModelFiles,
    };

    applyClassifiedBatch(batch, {
      suppressEmptyUploadToast:
        duplicateExcludedCount > 0 &&
        batch.modelFiles.length === 0 &&
        batch.rejectedFiles.length === 0 &&
        batch.ignoredFiles.length === 0,
    });

    if (duplicateExcludedCount > 0) {
      toast({
        title: "중복 파일 제외",
        description: `중복 ${duplicateExcludedCount}건 제외`,
        duration: 2200,
      });
    }

    if (batch.modelFiles.length > 0) {
      void persistFilesToIndexedDb(batch.modelFiles).then((removedKeys) => {
        if (!Array.isArray(removedKeys) || removedKeys.length === 0) return;
        setFiles((prev) =>
          prev.filter((file) => !removedKeys.includes(toPracticeFileKey(file))),
        );
      });
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const target = prev[idx] || null;
      const next = prev.filter((_, i) => i !== idx);
      if (target) {
        const key = toPracticeFileKey(target);
        void deleteFileFromIndexedDb(key);
        const meta = readPracticeFileCacheMeta(fileCacheMetaKey).filter(
          (row) => row.key !== key,
        );
        writePracticeFileCacheMeta(fileCacheMetaKey, meta);
      }
      return next;
    });
  };

  const clearAllFiles = async () => {
    const stateKeys = files.map((file) => toPracticeFileKey(file));
    const metaKeys = readPracticeFileCacheMeta(fileCacheMetaKey).map((row) =>
      String(row.key || "").trim(),
    );
    const keys = [...new Set([...stateKeys, ...metaKeys].filter(Boolean))];

    if (keys.length > 0) {
      await Promise.all(
        keys.map((key) =>
          deleteFileFromIndexedDb(key).catch(() => {
            // ignore
          }),
        ),
      );
    }

    writePracticeFileCacheMeta(fileCacheMetaKey, []);
    setFiles([]);
  };

  const rememberLab = useCallback((lab: SearchBusinessResult | null) => {
    const normalizedLab = normalizeRecentLab(lab);
    if (!normalizedLab) return;

    setRecentLabs((prev) => {
      const next = mergeRecentLabLists([normalizedLab], prev);
      writeRecentLabs(next);
      return next;
    });
  }, []);

  const removeRecentLab = useCallback((lab: SearchBusinessResult | null) => {
    const normalizedLab = normalizeRecentLab(lab);
    if (!normalizedLab) return;
    // 어벗츠기공소는 「최근」상단 고정 — 제거 불가
    if (isPinnedAbutsRecentLab(normalizedLab)) return;

    setRecentLabs((prev) => {
      const next = ensureAbutsLabPinned(
        prev.filter((row) => {
          const normalizedRow = normalizeRecentLab(row);
          if (!normalizedRow) return false;
          return !sameRecentLab(normalizedRow, normalizedLab);
        }),
      );
      writeRecentLabs(next);
      return next;
    });

    setSelectedLab((prev) => {
      if (!prev) return prev;
      const normalizedSelected = normalizeRecentLab(prev);
      if (!normalizedSelected) return prev;
      return sameRecentLab(normalizedSelected, normalizedLab) ? null : prev;
    });
  }, []);

  /** 서버 전송 내역(최신순)을 최근 기공소 SSOT로 merge. localStorage 캐시도 갱신. */
  const syncRecentLabsFromTransfers = useCallback(
    (
      labs: Array<Pick<SearchBusinessResult, "_id" | "name"> & Partial<SearchBusinessResult>>,
    ) => {
      const incoming = labs
        .map((lab) => normalizeRecentLab(lab as SearchBusinessResult))
        .filter((lab): lab is SearchBusinessResult => Boolean(lab));
      if (incoming.length === 0) return;

      setRecentLabs((prev) => {
        const next = mergeRecentLabLists(incoming, prev);
        writeRecentLabs(next);
        return next;
      });
      setRecentLabsInitialized(true);

      void (async () => {
        const enriched = await enrichRecentLabsMissingDetails(incoming);
        if (enriched.length === 0) return;
        setRecentLabs((prev) => {
          const next = mergeRecentLabLists(enriched, prev);
          writeRecentLabs(next);
          return next;
        });
      })();
    },
    [],
  );

  useEffect(() => {
    clearLegacyAbutsRecentDismissed();
    const loaded = ensureAbutsLabPinned(readRecentLabs());
    setRecentLabs(loaded);
    writeRecentLabs(loaded);

    let cancelled = false;
    void (async () => {
      const resolved = await resolveAbutsPinnedRecentLab();
      if (!cancelled && resolved) {
        setRecentLabs((prev) => {
          const next = mergeRecentLabLists([resolved], prev);
          writeRecentLabs(next);
          return next;
        });
      }

      if (cancelled) return;
      const snapshot = ensureAbutsLabPinned(readRecentLabs());
      const enriched = await enrichRecentLabsMissingDetails(snapshot);
      if (cancelled || enriched.length === 0) return;
      setRecentLabs((prev) => {
        const next = mergeRecentLabLists(enriched, prev);
        writeRecentLabs(next);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 드롭다운을 열 때마다 어벗츠기공소를 「최근」맨 위에 고정
  useEffect(() => {
    if (!labOpen) return;
    setRecentLabs((prev) => {
      const next = ensureAbutsLabPinned(prev);
      if (
        next.length === prev.length &&
        next.every(
          (lab, idx) =>
            lab._id === prev[idx]?._id && lab.name === prev[idx]?.name,
        )
      ) {
        return prev;
      }
      writeRecentLabs(next);
      return next;
    });
  }, [labOpen]);

  useEffect(() => {
    const q = labSearch.trim();
    if (!q) {
      setLabSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLabSearching(true);
      try {
        const res = await apiFetch<unknown>({
          path: `/api/businesses/search-public?q=${encodeURIComponent(q)}&businessType=${encodeURIComponent("requestor")}&requestorKind=${encodeURIComponent("lab")}`,
          method: "GET",
        });
        if (!res.ok) {
          setLabSearchResults([]);
          return;
        }
        const body = res.data;
        const data =
          body && typeof body === "object" && "data" in (body as Record<string, unknown>)
            ? (body as { data?: unknown }).data
            : body;
        const next = Array.isArray(data)
          ? data
              .filter(
                (item): item is SearchBusinessResult =>
                  Boolean(
                    item &&
                      typeof item === "object" &&
                      typeof (item as { _id?: unknown })._id === "string" &&
                      typeof (item as { name?: unknown }).name === "string",
                  ),
              )
              .filter((item) => {
                const businessType = String(item.businessType || "").trim();
                if (businessType !== "requestor") return false;

                const bn = String(item.businessNumber || "").trim().toLowerCase();
                if (bn.startsWith("practice-")) return false;

                const kind = String(item.requestorKind || "").trim();
                if (kind && kind !== "lab") return false;

                return true;
              })
          : [];
        setLabSearchResults(next);
      } catch {
        setLabSearchResults([]);
      } finally {
        setLabSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [labSearch]);

  return {
    files,
    setFiles,
    totalSizeMb,
    selectedLab,
    setSelectedLab,
    requestMemo,
    setRequestMemo,
    labSearch,
    setLabSearch,
    labSearchResults,
    labOpen,
    setLabOpen,
    labSearching,
    recentLabs,
    recentLabsInitialized,
    rememberLab,
    removeRecentLab,
    syncRecentLabsFromTransfers,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
  };
};
