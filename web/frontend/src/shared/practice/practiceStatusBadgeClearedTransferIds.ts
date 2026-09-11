// change-log:
// - 2026-09-11: 상단 상태 뱃지(완료·취소·어벗) 열람 제외 transferId — 계정 preferences SSOT
// related files:
// - web/backend/utils/practiceStatusBadgeClearedTransferIds.util.js
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/shared/practice/practiceStatusBadgeReviewQueue.ts

/** 계정에 쌓이는 열람 제외 ID 상한(오래된 것부터 잘라냄). */
export const PRACTICE_STATUS_BADGE_CLEARED_TRANSFER_IDS_MAX = 3000;

export const normalizePracticeStatusBadgeClearedTransferIds = (
  raw: unknown,
): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || id === "-" || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length > PRACTICE_STATUS_BADGE_CLEARED_TRANSFER_IDS_MAX) {
    return out.slice(out.length - PRACTICE_STATUS_BADGE_CLEARED_TRANSFER_IDS_MAX);
  }
  return out;
};
