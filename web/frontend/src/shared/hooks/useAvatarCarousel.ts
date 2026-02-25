import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { generateRemoteAvatarUrls } from "@/shared/lib/avatarOptions";

const BATCH_SIZE = 4;
const CACHE_PREFIX = "avatarCarousel.prefetch";
const isBrowser = typeof window !== "undefined";

const sanitizeKeySeed = (seed: string) =>
  seed.replace(/[^a-z0-9-_]/gi, "").toLowerCase() || "user";

const getCacheKey = (seed: string) =>
  `${CACHE_PREFIX}.${sanitizeKeySeed(seed)}`;

const readPrefetchedBatch = (key: string): string[] => {
  if (!isBrowser) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item === "string")
      .slice(0, BATCH_SIZE);
  } catch {
    return [];
  }
};

const writePrefetchedBatch = (key: string, batch: string[]) => {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(batch.slice(0, BATCH_SIZE)),
    );
  } catch {
    /* noop */
  }
};

const clearPrefetchedBatch = (key: string) => {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
};

const prefetchImages = (urls: string[]) => {
  if (!isBrowser || urls.length === 0) return;
  urls.forEach((url) => {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.src = url;
  });
};

export const useAvatarCarousel = (seedBase: string) => {
  const normalizedSeed = seedBase.trim().slice(0, 50) || "user";
  const cacheKey = useMemo(() => getCacheKey(normalizedSeed), [normalizedSeed]);

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchNonceRef = useRef(0);
  const prefetchedRef = useRef<string[]>([]);

  const [avatars, setAvatars] = useState<string[]>([]);
  const [prefetchReady, setPrefetchReady] = useState(false);

  const fetchBatch = useCallback(() => {
    const urls = generateRemoteAvatarUrls(
      normalizedSeed,
      fetchNonceRef.current,
      BATCH_SIZE,
    );
    fetchNonceRef.current += 1;
    prefetchImages(urls);
    return urls;
  }, [normalizedSeed]);

  const setPrefetch = useCallback(
    (batch: string[]) => {
      prefetchedRef.current = batch.slice(0, BATCH_SIZE);
      if (!mountedRef.current) return;
      if (prefetchedRef.current.length === BATCH_SIZE) {
        setPrefetchReady(true);
        writePrefetchedBatch(cacheKey, prefetchedRef.current);
      } else {
        setPrefetchReady(false);
        clearPrefetchedBatch(cacheKey);
      }
    },
    [cacheKey],
  );

  const prepareNextBatch = useCallback(() => {
    const nextBatch = fetchBatch();
    setPrefetch(nextBatch);
  }, [fetchBatch, setPrefetch]);

  const schedulePrefetch = useCallback(() => {
    if (!isBrowser) {
      prepareNextBatch();
      return;
    }
    window.setTimeout(() => {
      if (!mountedRef.current) return;
      prepareNextBatch();
    }, 0);
  }, [prepareNextBatch]);

  useEffect(() => {
    fetchNonceRef.current = 0;
    prefetchedRef.current = [];
    if (mountedRef.current) {
      setPrefetchReady(false);
    }

    let cancelled = false;

    const prime = () => {
      const initialBatch = fetchBatch();
      if (cancelled || !mountedRef.current) return;
      setAvatars(initialBatch);

      const cached = readPrefetchedBatch(cacheKey);
      if (cached.length === BATCH_SIZE) {
        prefetchedRef.current = cached;
        setPrefetchReady(true);
      } else {
        schedulePrefetch();
      }
    };

    prime();

    return () => {
      cancelled = true;
      prefetchedRef.current = [];
    };
  }, [cacheKey, fetchBatch, schedulePrefetch]);

  const refreshAvatars = useCallback(() => {
    const cachedBatch = prefetchedRef.current;
    if (cachedBatch.length === BATCH_SIZE) {
      if (mountedRef.current) {
        setAvatars(cachedBatch);
        setPrefetchReady(false);
      }
      prefetchedRef.current = [];
      clearPrefetchedBatch(cacheKey);
      schedulePrefetch();
      return;
    }

    const immediateBatch = fetchBatch();
    if (mountedRef.current) {
      setAvatars(immediateBatch);
      setPrefetchReady(false);
    }
    schedulePrefetch();
  }, [cacheKey, fetchBatch, schedulePrefetch]);

  return {
    avatars,
    refreshAvatars,
    isPrefetchReady: prefetchReady,
  };
};
