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

const BATCH_COUNT = DEFAULT_AVATAR_TOTAL / AVATAR_BATCH_SIZE;

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
 * Cycles through the local 64-avatar pack in batches of 4.
 * seedBase only picks the starting batch so users see different first rows.
 */
export const useAvatarCarousel = (seedBase: string) => {
  const normalizedSeed = seedBase.trim().slice(0, 50) || "user";
  const startBatch = useMemo(
    () => hashSeed(normalizedSeed) % BATCH_COUNT,
    [normalizedSeed],
  );

  const [batchIndex, setBatchIndex] = useState(startBatch);

  useEffect(() => {
    setBatchIndex(startBatch);
  }, [startBatch]);

  const avatars = useMemo(
    () => getAvatarBatchUrls(batchIndex, AVATAR_BATCH_SIZE),
    [batchIndex],
  );

  useEffect(() => {
    prefetchImages(avatars);
    const next = getAvatarBatchUrls(
      (batchIndex + 1) % BATCH_COUNT,
      AVATAR_BATCH_SIZE,
    );
    prefetchImages(next);
  }, [avatars, batchIndex]);

  const refreshAvatars = useCallback(() => {
    setBatchIndex((prev) => (prev + 1) % BATCH_COUNT);
  }, []);

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
