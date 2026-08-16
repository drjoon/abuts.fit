// related files:
// - web/backend/utils/practiceLabRating.js
// - web/frontend/src/shared/components/practice/PracticeLabRatingControl.tsx
// - web/frontend/src/shared/components/practice/AutoMatchMinLabRatingStars.tsx
// - 2026-08-14: 치과→기공소 rating·자동매칭 최소 별.
// - 2026-08-16: 자동매칭 별점은 전체 치과 평가 합산·평균. 우리 치과 1점 제외.
// - 2026-08-16: 5점제. 자동매칭 최소 2~5. 평가 3회 미만은 유효 3점. 기공비 배수 2/3/4/5→0.9/1/1.1/1.2.

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 5;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 3;
export const AUTO_MATCH_MIN_SELECTABLE = 2;
/** 이 횟수 이하 평가면 유효 별점=3(미평가 포함). */
export const AUTO_MATCH_RATING_COUNT_GRACE = 2;
export const DEFAULT_EFFECTIVE_LAB_STARS = 3;

const FEE_MULTIPLIER_BY_STARS: Record<number, number> = {
  2: 0.9,
  3: 1,
  4: 1.1,
  5: 1.2,
};

/** 채팅·평가 모달: 1점 선택 시 자동매칭 제외 안내 */
export const PRACTICE_LAB_ONE_STAR_AUTO_MATCH_WARNING =
  "별 1점은 다음 의뢰부터 이 기공소가 매칭에 참여하지 않습니다.";

export type PracticeLabRatingPublic = {
  stars: number;
  memo: string;
  ratingCount: number;
  updatedAt?: string | null;
};

export type LabRatingSummary = {
  stars: number | null;
  ratingCount: number;
  effectiveStars: number;
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
  if (stars == null) return DEFAULT_AUTO_MATCH_MIN_LAB_RATING;
  return Math.max(AUTO_MATCH_MIN_SELECTABLE, stars);
}

export function feeMultiplierForStars(stars: unknown): number {
  const n = normalizeAutoMatchMinLabRating(stars);
  return FEE_MULTIPLIER_BY_STARS[n] ?? 1;
}

export function effectiveLabStars({
  stars,
  ratingCount,
}: {
  stars?: unknown;
  ratingCount?: unknown;
} = {}): number {
  const count = Math.max(0, Math.floor(Number(ratingCount) || 0));
  if (count <= AUTO_MATCH_RATING_COUNT_GRACE) {
    return DEFAULT_EFFECTIVE_LAB_STARS;
  }
  const n = Number(stars);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EFFECTIVE_LAB_STARS;
  return n;
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

export function parseLabRatingSummary(raw: unknown): LabRatingSummary {
  if (!raw || typeof raw !== "object") {
    return {
      stars: null,
      ratingCount: 0,
      effectiveStars: DEFAULT_EFFECTIVE_LAB_STARS,
    };
  }
  const row = raw as Record<string, unknown>;
  const ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
  const starsRaw = Number(row.stars);
  const stars =
    ratingCount > 0 && Number.isFinite(starsRaw) ? starsRaw : null;
  return {
    stars,
    ratingCount,
    effectiveStars: effectiveLabStars({ stars: starsRaw, ratingCount }),
  };
}
