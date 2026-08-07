// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/hooks/useAvatarCarousel.ts
// - web/frontend/src/features/settings/tabs/AccountTab.tsx
// - web/frontend/src/pages/practice/PracticeSettingsPage.tsx
// - web/frontend/src/shared/onboarding/wizard/steps/ProfileStep.tsx

export const DEFAULT_AVATAR_TOTAL = 64;
export const AVATAR_BATCH_SIZE = 4;

const padAvatarIndex = (index: number) =>
  String(index).padStart(2, "0");

/** Local static avatar path: /avatars/01.webp … /avatars/64.webp */
export const getLocalAvatarUrl = (index: number) => {
  const safe =
    ((((Math.trunc(index) - 1) % DEFAULT_AVATAR_TOTAL) + DEFAULT_AVATAR_TOTAL) %
      DEFAULT_AVATAR_TOTAL) +
    1;
  return `/avatars/${padAvatarIndex(safe)}.webp`;
};

export const getAvatarBatchUrls = (
  batchIndex: number,
  batchSize: number = AVATAR_BATCH_SIZE,
) => {
  const size = Math.max(1, Math.min(batchSize, DEFAULT_AVATAR_TOTAL));
  const batchCount = Math.floor(DEFAULT_AVATAR_TOTAL / size) || 1;
  const safeBatch =
    ((Math.trunc(batchIndex) % batchCount) + batchCount) % batchCount;
  const start = safeBatch * size;
  return Array.from({ length: size }, (_, i) =>
    getLocalAvatarUrl(start + i + 1),
  );
};

/** Seed string for AvatarImage fallback (e.g. "01" from /avatars/01.webp). */
export const avatarSeedFromUrl = (url: string) => {
  const match = String(url || "").match(/\/avatars\/(\d+)\.webp(?:\?|$)/i);
  return match?.[1] || "user";
};
