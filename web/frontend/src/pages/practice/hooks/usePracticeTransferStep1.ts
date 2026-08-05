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
// - web/frontend/rules.md (practice 최근 전송 기공소 SSOT)
export const PRACTICE_ACCEPTED_HINT = "3D 모델 및 그림 파일 업로드 가능";

export type SearchBusinessResult = {
  _id: string;
  name: string;
  representativeName?: string;
  businessNumber?: string;
  address?: string;
  businessType?: string;
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
const PRACTICE_RECENT_LABS_STORAGE_KEY = "practice_recent_labs_v2";
const PRACTICE_RECENT_LABS_MAX = 8;

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
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const id = String((item as { _id?: unknown })._id || "").trim();
        const name = String((item as { name?: unknown }).name || "").trim();
        if (!name) return null;
        const businessType = String(
          (item as { businessType?: unknown }).businessType || "requestor",
        ).trim();
        if (businessType && businessType !== "requestor") return null;

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
        } as SearchBusinessResult;
      })
      .filter((row): row is SearchBusinessResult => Boolean(row));
  } catch {
    return [];
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
  const name = String(lab.name || "").trim();
  return {
    _id: String(lab._id || `recent:${name}`).trim(),
    name,
    representativeName: String(lab.representativeName || "").trim() || undefined,
    businessNumber: String(lab.businessNumber || "").trim() || undefined,
    address: String(lab.address || "").trim() || undefined,
    businessType: "requestor",
  };
};

const recentLabDedupeKey = (lab: SearchBusinessResult) => {
  const id = String(lab._id || "").trim();
  if (id && !id.startsWith("recent:")) return `id:${id}`;
  return `name:${lab.name}|bn:${String(lab.businessNumber || "").trim()}`;
};

const mergeRecentLabLists = (
  primary: SearchBusinessResult[],
  secondary: SearchBusinessResult[],
): SearchBusinessResult[] => {
  const byKey = new Map<string, SearchBusinessResult>();
  for (const raw of [...primary, ...secondary]) {
    const lab = normalizeRecentLab(raw);
    if (!lab) continue;
    const key = recentLabDedupeKey(lab);
    if (!byKey.has(key)) byKey.set(key, lab);
  }
  return [...byKey.values()].slice(0, PRACTICE_RECENT_LABS_MAX);
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
  const [recentLabs, setRecentLabs] = useState<SearchBusinessResult[]>([]);
  const [recentLabsInitialized, setRecentLabsInitialized] = useState(false);
  const didBootstrapRecentLabs = useRef(false);
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
    const keys = files.map((file) => toPracticeFileKey(file));
    if (keys.length === 0) return;

    await Promise.all(
      keys.map((key) =>
        deleteFileFromIndexedDb(key).catch(() => {
          // ignore
        }),
      ),
    );

    const remainingMeta = readPracticeFileCacheMeta(fileCacheMetaKey).filter(
      (row) => !keys.includes(row.key),
    );
    writePracticeFileCacheMeta(fileCacheMetaKey, remainingMeta);
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
    },
    [],
  );

  useEffect(() => {
    if (didBootstrapRecentLabs.current) return;
    didBootstrapRecentLabs.current = true;

    const loaded = readRecentLabs();
    setRecentLabs(loaded);
    // 최근 기공소는 드롭다운 후보만 채운다. 페이지 진입/전송 후 remount 시 자동 선택하지 않는다.
    // 「새로 작성」에서만 최근 기공소를 기본 선택한다. (web/frontend/rules.md)
    setRecentLabsInitialized(true);
  }, [setSelectedLab]);

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
          path: `/api/businesses/search-public?q=${encodeURIComponent(q)}&businessType=${encodeURIComponent("requestor")}`,
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
    syncRecentLabsFromTransfers,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
  };
};
