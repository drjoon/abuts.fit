/**
 * 파일 다운로드 URL 캐시 관리 유틸리티
 * localStorage를 사용하여 임시 다운로드 URL을 캐싱
 */

const FILE_CACHE_STORAGE_KEY = "abutsfit:file-cache:v1";

type FileCacheEntry = {
  url: string;
  expiresAt: number;
};

type FileCacheStore = {
  [fileIdOrS3Key: string]: FileCacheEntry;
};

/**
 * 캐시에서 유효한 URL 가져오기
 */
export const getCachedUrl = (key: string): string | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(FILE_CACHE_STORAGE_KEY);
    if (!raw) return null;

    const cache: FileCacheStore = JSON.parse(raw);
    const entry = cache[key];

    if (!entry) return null;

    // 만료 체크
    if (Date.now() >= entry.expiresAt) {
      // 만료된 항목 제거
      delete cache[key];
      window.localStorage.setItem(
        FILE_CACHE_STORAGE_KEY,
        JSON.stringify(cache)
      );
      return null;
    }

    return entry.url;
  } catch {
    return null;
  }
};

/**
 * 캐시에 URL 저장
 * @param key 파일 ID 또는 S3 키
 * @param url 다운로드 URL
 * @param ttlMs TTL (밀리초), 기본값 50분 (S3 presigned URL은 보통 1시간)
 */
export const setCachedUrl = (
  key: string,
  url: string,
  ttlMs: number = 50 * 60 * 1000
): void => {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(FILE_CACHE_STORAGE_KEY);
    const cache: FileCacheStore = raw ? JSON.parse(raw) : {};

    cache[key] = {
      url,
      expiresAt: Date.now() + ttlMs,
    };

    window.localStorage.setItem(FILE_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("Failed to cache file URL", e);
  }
};

/**
 * 캐시에서 특정 키 제거
 */
export const removeCachedUrl = (key: string): void => {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(FILE_CACHE_STORAGE_KEY);
    if (!raw) return;

    const cache: FileCacheStore = JSON.parse(raw);
    delete cache[key];

    window.localStorage.setItem(FILE_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {}
};

/**
 * 전체 캐시 초기화
 */
export const clearFileCache = (): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(FILE_CACHE_STORAGE_KEY);
  } catch {}
};

/**
 * 만료된 캐시 항목 정리
 */
export const cleanExpiredCache = (): void => {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(FILE_CACHE_STORAGE_KEY);
    if (!raw) return;

    const cache: FileCacheStore = JSON.parse(raw);
    const now = Date.now();
    let hasChanges = false;

    Object.keys(cache).forEach((key) => {
      if (cache[key].expiresAt <= now) {
        delete cache[key];
        hasChanges = true;
      }
    });

    if (hasChanges) {
      window.localStorage.setItem(
        FILE_CACHE_STORAGE_KEY,
        JSON.stringify(cache)
      );
    }
  } catch {}
};
