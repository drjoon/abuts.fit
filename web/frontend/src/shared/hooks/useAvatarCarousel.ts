// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/lib/avatarOptions.ts
// - web/frontend/src/shared/onboarding/wizard/steps/ProfileStep.tsx
// - web/frontend/src/features/settings/tabs/AccountTab.tsx
// - web/frontend/src/pages/practice/PracticeSettingsPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AVATAR_BATCH_SIZE,
  DEFAULT_AVATAR_TOTAL,
  getAvatarBatchUrls,
  getLocalAvatarUrl,
} from "@/shared/lib/avatarOptions";

const hashSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const prefetchImages = (urls: string[]) => {
  if (typeof window === "undefined" || urls.length === 0) return;
  urls.forEach((url) => {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  });
};

/**
 * Cycles through the local 64-avatar pack.
 * seedBase only picks the starting batch so users see different first rows.
 */
export const useAvatarCarousel = (
  seedBase: string,
  batchSize: number = AVATAR_BATCH_SIZE,
) => {
  const size = Math.max(1, Math.min(batchSize, DEFAULT_AVATAR_TOTAL));
  const batchCount = Math.ceil(DEFAULT_AVATAR_TOTAL / size) || 1;
  const normalizedSeed = seedBase.trim().slice(0, 50) || "user";
  const startBatch = useMemo(
    () => hashSeed(normalizedSeed) % batchCount,
    [normalizedSeed, batchCount],
  );

  const [batchIndex, setBatchIndex] = useState(startBatch);

  useEffect(() => {
    setBatchIndex(startBatch);
  }, [startBatch]);

  const avatars = useMemo(
    () => getAvatarBatchUrls(batchIndex, size),
    [batchIndex, size],
  );

  useEffect(() => {
    prefetchImages(avatars);
    const next = getAvatarBatchUrls((batchIndex + 1) % batchCount, size);
    prefetchImages(next);
  }, [avatars, batchIndex, batchCount, size]);

  const refreshAvatars = useCallback(() => {
    setBatchIndex((prev) => (prev + 1) % batchCount);
  }, [batchCount]);

  return {
    avatars,
    refreshAvatars,
    /** Local pack is always ready; kept for existing call sites. */
    isPrefetchReady: true,
    avatarOptions: avatars.map((url) => ({
      url,
      seed: url.match(/\/(\d+)\.webp/)?.[1] || "user",
    })),
  };
};

export { getLocalAvatarUrl, getAvatarBatchUrls };
