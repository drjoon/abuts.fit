// related files:
// - web/frontend/src/shared/practice/useImplantConnectionCatalog.ts
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestImplant.ts
// - web/backend/controllers/presets/implantPreset.controller.js
// change-log:
// - 2026-11-03: 카탈로그 serverUpdatedAt이 바뀌면 localStorage만 갱신(로그인 세션 유지).
/**
 * 임플란트 프리셋(/api/implant-presets) 로컬 캐시 SSOT.
 * 화면은 캐시를 먼저 쓰고, 서버 버전(serverUpdatedAt)이 다르면 덮어쓴다.
 * 인증 토큰·세션은 건드리지 않는다.
 */
export const IMPLANT_PRESETS_STORAGE_KEY = "abutsfit:implant-presets:v10";

/** 예전 1년 TTL 키. 세션과 무관하게 카탈로그만 지운다. */
const LEGACY_IMPLANT_PRESETS_STORAGE_KEYS = [
  "abutsfit:implant-presets:v6",
  "abutsfit:implant-presets:v9",
] as const;

/** 네트워크 실패 시 오래된 캐시를 얼마나 쓸지. 버전 비교가 우선이다. */
export const IMPLANT_PRESETS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export type ImplantPresetsCachePayload<T> = {
  data: T[];
  serverUpdatedAt: number | null;
  cachedAt: number;
};

export function clearLegacyImplantPresetsCaches() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_IMPLANT_PRESETS_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function clearImplantPresetsCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(IMPLANT_PRESETS_STORAGE_KEY);
  } catch {
    // ignore
  }
  clearLegacyImplantPresetsCaches();
}

export function readImplantPresetsCache<T>(): ImplantPresetsCachePayload<T> | null {
  if (typeof window === "undefined") return null;
  clearLegacyImplantPresetsCaches();
  try {
    const stored = window.localStorage.getItem(IMPLANT_PRESETS_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as ImplantPresetsCachePayload<T>;
    if (!Array.isArray(parsed?.data) || parsed.data.length === 0) return null;
    const age = Date.now() - Number(parsed.cachedAt || 0);
    if (!(age >= 0) || age > IMPLANT_PRESETS_TTL_MS) return null;
    return {
      data: parsed.data,
      serverUpdatedAt:
        typeof parsed.serverUpdatedAt === "number" &&
        Number.isFinite(parsed.serverUpdatedAt)
          ? parsed.serverUpdatedAt
          : null,
      cachedAt: Number(parsed.cachedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function writeImplantPresetsCache<T>(
  data: T[],
  serverUpdatedAt: number | null,
) {
  if (typeof window === "undefined" || !Array.isArray(data) || data.length === 0) {
    return;
  }
  try {
    const payload: ImplantPresetsCachePayload<T> = {
      data,
      serverUpdatedAt:
        typeof serverUpdatedAt === "number" && Number.isFinite(serverUpdatedAt)
          ? serverUpdatedAt
          : null,
      cachedAt: Date.now(),
    };
    window.localStorage.setItem(
      IMPLANT_PRESETS_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function parseImplantPresetsServerUpdatedAt(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 서버 버전이 캐시와 다르면 true. 서버 버전이 없으면 내용으로 비교할 수 없어 true(갱신). */
export function shouldReplaceImplantPresetsCache(
  cachedUpdatedAt: number | null | undefined,
  serverUpdatedAt: number | null,
) {
  if (serverUpdatedAt == null) return true;
  if (cachedUpdatedAt == null) return true;
  return cachedUpdatedAt !== serverUpdatedAt;
}
