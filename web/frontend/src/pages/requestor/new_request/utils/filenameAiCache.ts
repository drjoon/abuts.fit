// change-log:
// - 2026-08-09: 신규의뢰 파일명 AI 인식 캐시 SSOT (V2/V3 공유).
// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestLocalFiles.ts
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestFilesV2.ts

const FILENAME_AI_CACHE_STORAGE_KEY =
  "abutsfit:new-request:filename-ai-cache:v1";
const FILENAME_AI_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

export type FilenameAiCacheEntry = {
  clinicName: string;
  patientName: string;
  tooth: string;
  cachedAt: number;
};

const filenameAiCache = new Map<string, FilenameAiCacheEntry>();
let filenameAiCacheLoaded = false;

const normalizeName = (s: string) => {
  try {
    return String(s || "").normalize("NFC");
  } catch {
    return String(s || "");
  }
};

export const toFilenameAiCacheKey = (name: string, size: number) =>
  `${normalizeName(name)}:${size}`;

const loadFilenameAiCache = () => {
  if (filenameAiCacheLoaded) return;
  filenameAiCacheLoaded = true;
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(FILENAME_AI_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, FilenameAiCacheEntry>;
    if (!parsed || typeof parsed !== "object") return;

    const now = Date.now();
    Object.entries(parsed).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;
      const cachedAt = Number(value.cachedAt || 0);
      if (!Number.isFinite(cachedAt) || now - cachedAt > FILENAME_AI_CACHE_TTL_MS) {
        return;
      }
      filenameAiCache.set(key, {
        clinicName: String(value.clinicName || ""),
        patientName: String(value.patientName || ""),
        tooth: String(value.tooth || ""),
        cachedAt,
      });
    });
  } catch {
    // noop
  }
};

const persistFilenameAiCache = () => {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const serializable: Record<string, FilenameAiCacheEntry> = {};
    filenameAiCache.forEach((value, key) => {
      if (!value || now - value.cachedAt > FILENAME_AI_CACHE_TTL_MS) return;
      serializable[key] = value;
    });
    window.localStorage.setItem(
      FILENAME_AI_CACHE_STORAGE_KEY,
      JSON.stringify(serializable),
    );
  } catch {
    // noop
  }
};

export const getFilenameAiCache = (
  key: string,
): { clinicName: string; patientName: string; tooth: string } | null => {
  loadFilenameAiCache();
  const cached = filenameAiCache.get(key);
  if (!cached) return null;
  const now = Date.now();
  if (now - cached.cachedAt > FILENAME_AI_CACHE_TTL_MS) {
    filenameAiCache.delete(key);
    persistFilenameAiCache();
    return null;
  }
  return {
    clinicName: String(cached.clinicName || ""),
    patientName: String(cached.patientName || ""),
    tooth: String(cached.tooth || ""),
  };
};

export const setFilenameAiCache = (
  key: string,
  value: { clinicName: string; patientName: string; tooth: string },
) => {
  const clinicName = String(value?.clinicName || "").trim();
  const patientName = String(value?.patientName || "").trim();
  const tooth = String(value?.tooth || "").trim();
  if (!clinicName && !patientName && !tooth) return;

  loadFilenameAiCache();
  filenameAiCache.set(key, {
    clinicName,
    patientName,
    tooth,
    cachedAt: Date.now(),
  });
  persistFilenameAiCache();
};
