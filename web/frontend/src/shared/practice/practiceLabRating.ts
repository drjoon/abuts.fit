// related files:
// - web/backend/utils/practiceLabRating.js
// - web/frontend/src/shared/components/practice/PracticeLabRatingControl.tsx
// - web/frontend/src/shared/components/practice/AutoMatchMinLabRatingStars.tsx
// - 2026-08-14: 치과→기공소 rating(1~3)·자동매칭 최소 별.
// - 2026-08-14: rating 기공소 10곳 이상일 때만 자동매칭 별 제한.
// - 2026-08-16: 10곳 게이트 제거. 평가 5회 이하는 별 제한 제외.
// - 2026-08-16: 자동매칭 별점은 전체 치과 평가 합산·평균.
// - 2026-08-16: 자동매칭 최소 별 기본값 2(사업자 세팅 저장·재사용).
// - 2026-08-16: 우리 치과 1점 기공소는 해당 치과 자동매칭에서 제외.

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 3;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 2;
/** 이 횟수 이하 평가면 최소 별 제한에서 제외(미평가 포함). */
export const AUTO_MATCH_RATING_COUNT_GRACE = 5;

/** 채팅·평가 모달: 1점 선택 시 자동매칭 제외 안내 */
export const PRACTICE_LAB_ONE_STAR_AUTO_MATCH_WARNING =
  "별 1점은 이 치과 자동매칭에서 해당 기공소가 다음부터 참여하지 않습니다. 신중히 평가해 주세요.";

export type PracticeLabRatingPublic = {
  stars: number;
  memo: string;
  ratingCount: number;
  updatedAt?: string | null;
};

export function normalizePracticeLabStars(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const stars = Math.round(n);
  if (stars < PRACTICE_LAB_RATING_MIN || stars > PRACTICE_LAB_RATING_MAX) {
    return null;
  }
  return stars;
}

export function normalizeAutoMatchMinLabRating(value: unknown): number {
  const stars = normalizePracticeLabStars(value);
  return stars == null ? DEFAULT_AUTO_MATCH_MIN_LAB_RATING : stars;
}

export function normalizePracticeLabRatingMemo(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, PRACTICE_LAB_RATING_MEMO_MAX);
}

export function parsePracticeLabRatingPublic(
  raw: unknown,
): PracticeLabRatingPublic | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const stars = normalizePracticeLabStars(row.stars);
  if (stars == null) return null;
  return {
    stars,
    memo: normalizePracticeLabRatingMemo(row.memo),
    ratingCount: Math.max(1, Math.floor(Number(row.ratingCount) || 1)),
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
  };
}
